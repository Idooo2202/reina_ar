"""
dump_vrma_extension.py
═══════════════════════════════════════════════════════════
Dump isi JSON mentah extension VRMC_vrm_animation dari sebuah
file .vrma (format GLB) — buat diagnosis LANGSUNG kenapa
VRMAnimationLoaderPlugin gagal mengenalinya, tanpa nebak lagi.

CARA PAKAI:
    python dump_vrma_extension.py "path/ke/idle.vrma"

Kirim SEMUA output yang muncul ke Claude buat dianalisis.
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

    raise ValueError("Gak ketemu JSON chunk di file ini")


def main():
    if len(sys.argv) < 2:
        print("Pemakaian: python dump_vrma_extension.py <path_file.vrma>")
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File gak ketemu: {path}")
        sys.exit(1)

    try:
        gltf = baca_json_chunk(path)
    except Exception as e:
        print(f"GAGAL BACA FILE: {e}")
        sys.exit(1)

    print(f"═══ Diagnosis: {path.name} ═══\n")

    print("── asset (versi glTF) ──")
    print(json.dumps(gltf.get("asset", {}), indent=2))

    print("\n── extensionsUsed ──")
    print(json.dumps(gltf.get("extensionsUsed", []), indent=2))

    print("\n── extensionsRequired ──")
    print(json.dumps(gltf.get("extensionsRequired", []), indent=2))

    print("\n── extensions (daftar key top-level) ──")
    print(list(gltf.get("extensions", {}).keys()))

    ext = gltf.get("extensions", {}).get("VRMC_vrm_animation")
    print("\n── extensions.VRMC_vrm_animation ──")
    if ext is None:
        print("‼️  TIDAK ADA SAMA SEKALI di dalam extensions!")
    else:
        ringkas = dict(ext)
        # Ringkas humanBones biar output gak kepanjangan, tapi tetep tunjukkan jumlahnya
        if "humanoid" in ringkas and isinstance(ringkas["humanoid"], dict):
            hb = ringkas["humanoid"].get("humanBones")
            if isinstance(hb, dict):
                ringkas["humanoid"] = {
                    "humanBones": f"<{len(hb)} bones — contoh keys: {list(hb.keys())[:5]}>"
                }
        print(json.dumps(ringkas, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()