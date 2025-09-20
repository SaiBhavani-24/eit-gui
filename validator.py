def validate(config):
    n = config["electrodes"]
    compression = config["compression_bits"]
    fps = config["frame_rate"]

    measurements = n * (n - 3)
    bits_per_frame = measurements * compression
    bandwidth = bits_per_frame * fps / 1e6  # Mbps

    return {
        "measurements_per_frame": measurements,
        "bandwidth_required_mbps": round(bandwidth, 2),
        "feasible": bandwidth <= config["max_bandwidth"]
    }
