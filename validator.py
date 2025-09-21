def validate(config):
    n = config["electrodes"]
    adc_res = config["adc_resolution"]
    adc_rate = config["adc_sample_rate"]
    oversample = config["oversampling"]
    compression = config["compression_bits"]
    fps = config["frame_rate"]
    max_bw = config["max_bandwidth"]

    # Measurements per frame
    measurements = n * (n - 3)

    # Bandwidth (Mbps)
    bits_per_frame = measurements * compression
    bandwidth = bits_per_frame * fps / 1e6

    # Memory per frame (Bytes)
    samples_per_channel = (adc_rate / fps) * oversample
    total_samples = samples_per_channel * n
    memory_bytes = total_samples * (adc_res / 8)

    # Latency (ms)
    pipeline_depth = 100  # cycles
    aurora_speed_mbps = 1000
    latency_ms = (bits_per_frame / aurora_speed_mbps) / 1000 + (pipeline_depth / adc_rate) * 1000

    # Feasibility thresholds
    feasible = (
        adc_res <= 18 and
        compression <= 32 and
        bandwidth <= max_bw and
        memory_bytes <= 1_000_000 and
        latency_ms <= 10
    )

    return {
        "measurements_per_frame": measurements,
        "bandwidth_required_mbps": round(bandwidth, 2),
        "memory_per_frame_bytes": round(memory_bytes, 2),
        "latency_estimate_ms": round(latency_ms, 4),
        "feasible": feasible
    }
