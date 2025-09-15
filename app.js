// === quick config (point to your backend) ===
const DEFAULTS = {
  backendUrl: "http://127.0.0.1:8080", // Flask/FastAPI base
  fpgaIp: "192.168.1.50",
  fpgaPort: 3121,
  transport: "udp", // "udp" | "tcp"
  apiMode: "http",  // "http" | "ws"
};

let ws = null;

// --- utilities ---
const $ = (id) => document.getElementById(id);
const now = () => new Date().toLocaleTimeString();
function log(msg, cls="info"){
  const el = $("log");
  el.insertAdjacentHTML("afterbegin", `<div><span class="ts">[${now()}]</span> <span class="${cls}">${msg}</span></div>`);
}
function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2200);
}
function setStatus(connected){
  const s = $("connStatus");
  s.textContent = connected ? "Connected" : "Disconnected";
  s.classList.toggle("status-connected", connected);
  s.classList.toggle("status-disconnected", !connected);
}

// --- init select options for electrodes ---
function populateElectrodes(){
  const count = parseInt($("elecCount").value, 10);
  const mask = $("elecMask");
  const ref = $("refElectrode");
  mask.innerHTML = "";
  ref.innerHTML = "";

  for(let i=1; i<=count; i++){
    const opt = document.createElement("option");
    opt.value = i; opt.textContent = `E${i}`;
    mask.appendChild(opt);

    const ropt = document.createElement("option");
    ropt.value = i; ropt.textContent = `E${i}`;
    ref.appendChild(ropt);
  }
  // default: select all electrodes in mask
  [...mask.options].forEach(o => o.selected = true);
  ref.selectedIndex = 0;
}

function buildPayload(){
  const selectedMask = [...$("elecMask").selectedOptions].map(o => parseInt(o.value,10));
  const payload = {
    transport: $("transport").value,
    fpga: {
      ip: $("fpgaIp").value.trim(),
      port: parseInt($("fpgaPort").value,10)
    },
    stimulation: {
      waveform: $("waveform").value,
      frequency_hz: parseInt($("freq").value,10),
      amplitude_ma: parseFloat($("amplitude").value),
      pattern: $("pattern").value,
      burst_count: parseInt($("burstCount").value,10),
      duration_ms: parseInt($("durationMs").value,10)
    },
    sweep: {
      enable: $("sweepEnable").value === "on",
      start_hz: parseInt($("sweepStart").value,10),
      stop_hz: parseInt($("sweepStop").value,10),
      steps: parseInt($("sweepSteps").value,10),
      scale: $("sweepScale").value
    },
    acquisition: {
      sampling_sps: parseInt($("sps").value,10),
      averages: parseInt($("averages").value,10),
      filters: $("filters").value
    },
    electrodes: {
      count: parseInt($("elecCount").value,10),
      mask: selectedMask,
      reference: parseInt($("refElectrode").value || "1",10)
    },
    calibration: {
      current_limit_ma: parseFloat($("limitCurrent").value),
      voltage_limit_vpp: parseFloat($("limitVoltage").value),
      dac_gain: parseFloat($("dacGain").value),
      adc_gain: parseFloat($("adcGain").value),
      dc_offset_mv: parseFloat($("dcOffset").value)
    }
  };
  return payload;
}

function renderPayload(){
  const payload = buildPayload();
  $("payloadPreview").textContent = JSON.stringify(payload, null, 2);
}

// --- validation guard rails ---
function validatePayload(p){
  const errs = [];
  if(!/^(\d{1,3}\.){3}\d{1,3}$/.test(p.fpga.ip)) errs.push("FPGA IP looks invalid.");
  if(p.fpga.port < 1 || p.fpga.port > 65535) errs.push("Port out of range.");
  if(p.stimulation.frequency_hz < 1 || p.stimulation.frequency_hz > 1_000_000) errs.push("Frequency out of range.");
  if(p.calibration.current_limit_ma < p.stimulation.amplitude_ma) errs.push("Amplitude exceeds current limit.");
  if(p.sweep.enable && (p.sweep.stop_hz <= p.sweep.start_hz)) errs.push("Sweep stop must be > start.");
  if(p.electrodes.mask.length < 2) errs.push("Select at least 2 electrodes in mask.");
  return errs;
}
//-----Validator-----
function showValidator() {
  document.getElementById("console").style.display = "none";
  document.getElementById("validator").style.display = "block";
}

// --- API helpers ---
function getBase(){ return ($("backendUrl").value || DEFAULTS.backendUrl).trim().replace(/\/+$/,""); }

async function apiPost(path, body){
  const url = `${getBase()}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json().catch(()=> ({}));
}

async function onApplyStart(cmd){
  const payload = buildPayload();
  const errors = validatePayload(payload);
  if(errors.length){
    errors.forEach(e => log(e, "warn"));
    toast("Check parameters (see log).");
    return;
  }
  renderPayload();

  try{
    const mode = $("apiMode").value;
    if(mode === "http"){
      const resp = await apiPost(`/control/${cmd}`, payload);
      log(`${cmd.toUpperCase()} via HTTP: ${JSON.stringify(resp)}`, "ok");
      toast(`${cmd} sent`);
    }else{
      if(!ws || ws.readyState !== 1) throw new Error("WebSocket not connected");
      ws.send(JSON.stringify({ type: cmd, payload }));
      log(`${cmd.toUpperCase()} via WS: enqueued`, "ok");
      toast(`${cmd} sent (WS)`);
    }
  }catch(err){
    log(`${cmd} failed: ${err.message}`, "err");
    toast(`Failed to ${cmd}`);
  }
}

// --- WebSocket management ---
function connectWS(){
  const base = getBase().replace(/^http/,"ws");
  const url = `${base}/ws`;
  if(ws && (ws.readyState === 0 || ws.readyState === 1)) ws.close(1000);
  ws = new WebSocket(url);
  ws.onopen = () => { setStatus(true); log("WebSocket connected","ok"); };
  ws.onclose = () => { setStatus(false); log("WebSocket closed","warn"); };
  ws.onerror = (e) => { setStatus(false); log("WebSocket error","err"); };
  ws.onmessage = (evt) => {
    try{
      const msg = JSON.parse(evt.data);
      if(msg.type === "telemetry") $("log").insertAdjacentHTML("afterbegin", `<div><span class="ts">[${now()}]</span> <span class="info">${msg.data}</span></div>`);
    }catch{ log(`WS: ${evt.data}`); }
  };
}

// --- events ---
window.addEventListener("DOMContentLoaded", () => {
  // defaults
  $("backendUrl").value = DEFAULTS.backendUrl;
  $("fpgaIp").value = DEFAULTS.fpgaIp;
  $("fpgaPort").value = DEFAULTS.fpgaPort;
  $("transport").value = DEFAULTS.transport;
  $("apiMode").value = DEFAULTS.apiMode;

  populateElectrodes();
  renderPayload();

  $("elecCount").addEventListener("change", ()=>{ populateElectrodes(); renderPayload(); });
  document.querySelectorAll("input,select").forEach(el => el.addEventListener("input", renderPayload));

  $("btnApply").addEventListener("click", ()=> onApplyStart("apply"));
  $("btnStart").addEventListener("click", ()=> onApplyStart("start"));
  $("btnStop").addEventListener("click", ()=> onApplyStart("stop"));
  $("btnEStop").addEventListener("click", ()=> onApplyStart("estop"));

  $("btnClearLog").addEventListener("click", ()=> $("log").innerHTML = "");

  $("btnPing").addEventListener("click", async ()=>{
    try{
      const res = await apiPost("/health", {});
      log(`Ping: ${JSON.stringify(res)}`, "ok");
      toast("pong");
      setStatus(true);
    }catch(e){
      log(`Ping failed: ${e.message}`, "err");
      setStatus(false);
    }
  });

  $("btnConnect").addEventListener("click", ()=>{
    if($("apiMode").value === "ws"){ connectWS(); } else { toast("HTTP mode set"); setStatus(true); }
  });

  $("toggleTheme").addEventListener("change", (e)=>{
    document.documentElement.classList.toggle("light", e.target.checked);
  });
});

