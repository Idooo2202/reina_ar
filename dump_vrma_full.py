"""
dump_vrma_full.py
═══════════════════════════════════════════════════════════
Dump LENGKAP (gak diringkas) extension VRMC_vrm_animation
dari file .vrma, plus daftar node di scene — buat cross-check
apakah referensi bone->node ada yang rusak/gak valid.

CARA PAKAI:
    python dump_vrma_full.py "path/ke/idle.vrma"
═══════════════════════════════════════════════════════════
"""

import json
import struct
import sys
from pathlib import Path


def baca_json_chunk(path: Path) -> dict:
    data = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise ValueError(f"Bukan file GLB valid (magic: {magic})")

    offset = 12
    while offset < total_length:
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        chunk_data = data[offset + 8: offset + 8 + chunk_length]
        if chunk_type == b"JSON":
            return json.loads(chunk_data.decode("utf-8"))
        offset += 8 + chunk_length
        if chunk_length % 4 != 0:
            offset += 4 - (chunk_length % 4)

    raise ValueError("Gak ketemu JSON chunk")


def main():
    if len(sys.argv) < 2:
        print("Pemakaian: python dump_vrma_full.py <path_file.vrma>")
        sys.exit(1)

    path = Path(sys.argv[1])
    gltf = baca_json_chunk(path)

    print(f"═══ Dump Lengkap: {path.name} ═══\n")

    # 1. Extension VRMC_vrm_animation — LENGKAP, gak diringkas
    ext = gltf.get("extensions", {}).get("VRMC_vrm_animation")
    print("── extensions.VRMC_vrm_animation (LENGKAP) ──")
    print(json.dumps(ext, indent=2, ensure_ascii=False))

    # 2. Daftar node di scene (index + nama), buat cross-check referensi
    nodes = gltf.get("nodes", [])
    print(f"\n── nodes[] (total {len(nodes)}) ──")
    for i, node in enumerate(nodes):
        nama = node.get("name", "(tanpa nama)")
        print(f"  [{i}] {nama}")

    # 3. Ringkasan animations[] (channels & samplers)
    animations = gltf.get("animations", [])
    print(f"\n── animations[] (total {len(animations)}) ──")
    for i, anim in enumerate(animations):
        channels = anim.get("channels", [])
        print(f"  Animation[{i}]: {len(channels)} channels")
        for ch in channels[:5]:  # cuma contoh 5 pertama biar gak kepanjangan
            target = ch.get("target", {})
            print(f"    - node target: {target.get('node')}, path: {target.get('path')}")
        if len(channels) > 5:
            print(f"    ... dan {len(channels) - 5} channel lainnya")


if __name__ == "__main__":
    main()