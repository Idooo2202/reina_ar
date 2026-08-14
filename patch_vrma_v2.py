"""
patch_vrma_v2.py
═══════════════════════════════════════════════════════════
Patch file .vrma (GLB) buat 2 hal:
  1. specVersion di VRMC_vrm_animation (jaga-jaga, walau kemarin
     udah kekonfirmasi ada)
  2. extensionsRequired — tambahin "VRMC_vrm_animation" kalau
     belum ada di situ (baru ketemu dari inspeksi idle.vrma,
     kemungkinan besar ini penyebab VRMAnimationLoaderPlugin
     nolak file-nya)

CARA PAKAI:
    python patch_vrma_v2.py "path/ke/folder/assets"
═══════════════════════════════════════════════════════════
"""

import json
import struct
import sys
import shutil
from pathlib import Path


def baca_glb(path: Path):
    data = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise ValueError(f"Bukan file GLB valid: {path.name}")

    offset = 12
    json_chunk = None
    bin_chunk = None

    while offset < total_length:
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        chunk_data = data[offset + 8: offset + 8 + chunk_length]

        if chunk_type == b"JSON":
            json_chunk = json.loads(chunk_data.decode("utf-8"))
        elif chunk_type == b"BIN\x00":
            bin_chunk = chunk_data

        offset += 8 + chunk_length
        if chunk_length % 4 != 0:
            offset += 4 - (chunk_length % 4)

    if json_chunk is None:
        raise ValueError(f"Gak ketemu JSON chunk: {path.name}")

    return version, json_chunk, bin_chunk


def tulis_glb(path: Path, gltf_version: int, json_obj: dict, bin_chunk):
    json_str = json.dumps(json_obj, separators=(",", ":"))
    json_bytes = json_str.encode("utf-8")

    pad_len = (4 - len(json_bytes) % 4) % 4
    json_bytes += b" " * pad_len

    chunks = struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes

    if bin_chunk is not None:
        bin_bytes = bin_chunk
        pad_len_bin = (4 - len(bin_bytes) % 4) % 4
        bin_bytes += b"\x00" * pad_len_bin
        chunks += struct.pack("<I4s", len(bin_bytes), b"BIN\x00") + bin_bytes

    total_length = 12 + len(chunks)
    header = struct.pack("<4sII", b"glTF", gltf_version, total_length)

    path.write_bytes(header + chunks)


def patch_file(path: Path) -> str:
    try:
        version, gltf, bin_chunk = baca_glb(path)

        ext = gltf.get("extensions", {}).get("VRMC_vrm_animation")
        if ext is None:
            return "error: gak ada extension VRMC_vrm_animation sama sekali"

        changed = False

        # 1. specVersion (jaga-jaga)
        if "specVersion" not in ext or not ext["specVersion"]:
            ext["specVersion"] = "1.0"
            changed = True

        # 2. 🚀 BARU: extensionsRequired harus nyantumin VRMC_vrm_animation juga
        ext_required = gltf.setdefault("extensionsRequired", [])
        if "VRMC_vrm_animation" not in ext_required:
            ext_required.append("VRMC_vrm_animation")
            changed = True

        if not changed:
            return "sudah_ok"

        backup_path = path.with_suffix(path.suffix + ".bak2")
        if not backup_path.exists():
            shutil.copy2(path, backup_path)

        tulis_glb(path, version, gltf, bin_chunk)
        return "patched"

    except Exception as e:
        return f"error: {e}"


def main():
    if len(sys.argv) < 2:
        print("Pemakaian: python patch_vrma_v2.py <path_folder_assets>")
        sys.exit(1)

    folder = Path(sys.argv[1])
    if not folder.is_dir():
        print(f"Folder gak ketemu: {folder}")
        sys.exit(1)

    # Pakai set() biar file yang sama gak keproses 2x (Windows case-insensitive)
    vrma_files = sorted(set(folder.glob("*.vrma")) | set(folder.glob("*.VRMA")),
                         key=lambda p: p.name.lower())

    if not vrma_files:
        print(f"Gak ada file .vrma di folder: {folder}")
        sys.exit(1)

    print(f"Ketemu {len(vrma_files)} file .vrma. Mulai proses...\n")

    hasil = {"patched": [], "sudah_ok": [], "error": []}

    for f in vrma_files:
        status = patch_file(f)
        if status == "patched":
            hasil["patched"].append(f.name)
            print(f"  ✅ PATCHED  : {f.name}")
        elif status == "sudah_ok":
            hasil["sudah_ok"].append(f.name)
            print(f"  ⏭️  SUDAH OK : {f.name}")
        else:
            hasil["error"].append((f.name, status))
            print(f"  ❌ ERROR    : {f.name} — {status}")

    print("\n" + "=" * 50)
    print(f"Selesai! {len(hasil['patched'])} dipatch, "
          f"{len(hasil['sudah_ok'])} udah OK, "
          f"{len(hasil['error'])} error.")


if __name__ == "__main__":
    main()