"""
patch_vrma_specversion.py
═══════════════════════════════════════════════════════════
Nyuntik field "specVersion": "1.0" ke dalam extension
VRMC_vrm_animation di file .vrma (format GLB) yang nggak
punya field itu — biar kompatibel lagi sama
VRMAnimationLoaderPlugin versi terbaru (@pixiv/three-vrm-animation).

Akar masalah: file .vrma yang di-export dari UniVRM versi
lama (sebelum v0.120) gak nyertain field specVersion, dan
versi terbaru library JS-nya sekarang menolak file tanpa
field itu (dulu ditoleransi, sekarang enggak).

CARA PAKAI:
    python patch_vrma_specversion.py "path/ke/folder/assets"

Ini bakal proses SEMUA file .vrma di folder itu, bikin
backup (.vrma.bak) sebelum nulis ulang, dan kasih laporan
file mana yang dipatch vs yang udah oke dari awal.
═══════════════════════════════════════════════════════════
"""

import json
import struct
import sys
import shutil
from pathlib import Path


def baca_glb(path: Path):
    """Parse file GLB, return (header_version, json_chunk_dict, bin_chunk_bytes_or_None)."""
    data = path.read_bytes()

    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise ValueError(f"Bukan file GLB valid (magic salah): {path.name}")

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
        # Chunk di-pad ke kelipatan 4 byte
        if chunk_length % 4 != 0:
            offset += 4 - (chunk_length % 4)

    if json_chunk is None:
        raise ValueError(f"Gak ketemu JSON chunk di file: {path.name}")

    return version, json_chunk, bin_chunk


def tulis_glb(path: Path, gltf_version: int, json_obj: dict, bin_chunk: bytes | None):
    """Serialize ulang jadi file GLB yang valid."""
    json_str = json.dumps(json_obj, separators=(",", ":"))
    json_bytes = json_str.encode("utf-8")

    # JSON chunk WAJIB di-pad pakai spasi (0x20) sampai kelipatan 4 byte
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
    """Return status string: 'patched', 'sudah_ok', atau 'error: ...'"""
    try:
        version, gltf, bin_chunk = baca_glb(path)

        ext = gltf.get("extensions", {}).get("VRMC_vrm_animation")
        if ext is None:
            return "error: gak ada extension VRMC_vrm_animation sama sekali (bukan file VRMA?)"

        if "specVersion" in ext and ext["specVersion"]:
            return "sudah_ok"

        # Backup dulu sebelum nulis ulang
        backup_path = path.with_suffix(path.suffix + ".bak")
        if not backup_path.exists():
            shutil.copy2(path, backup_path)

        ext["specVersion"] = "1.0"
        tulis_glb(path, version, gltf, bin_chunk)

        return "patched"

    except Exception as e:
        return f"error: {e}"


def main():
    if len(sys.argv) < 2:
        print("Pemakaian: python patch_vrma_specversion.py <path_folder_assets>")
        sys.exit(1)

    folder = Path(sys.argv[1])
    if not folder.is_dir():
        print(f"Folder gak ketemu: {folder}")
        sys.exit(1)

    vrma_files = sorted(folder.glob("*.vrma")) + sorted(folder.glob("*.VRMA"))

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
          f"{len(hasil['sudah_ok'])} udah OK dari awal, "
          f"{len(hasil['error'])} error.")
    if hasil["patched"]:
        print("\nBackup file asli disimpan dengan ekstensi .vrma.bak")
        print("(hapus manual kalau udah yakin hasil patch-nya jalan lancar)")


if __name__ == "__main__":
    main()