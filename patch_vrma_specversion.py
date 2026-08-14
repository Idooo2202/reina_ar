import os
import sys
import json
import struct

def patch_vrma_file(filepath):
    try:
        with open(filepath, 'rb') as f:
            data = f.read()

        # Memeriksa apakah file berupa GLB (binary glTF)
        if data[:4] == b'glTF':
            version, total_len = struct.unpack('<II', data[4:12])
            chunk0_len, chunk0_type = struct.unpack('<II', data[12:20])

            # Chunk 0x4E4F534A adalah header JSON
            if chunk0_type == 0x4E4F534A:
                json_bytes = data[20:20 + chunk0_len]
                json_obj = json.loads(json_bytes.decode('utf-8'))

                # Pastikan ekstensinya memiliki specVersion "1.0"
                extensions = json_obj.setdefault('extensions', {})
                vrma_ext = extensions.setdefault('VRMC_vrm_animation', {})
                
                vrma_ext['specVersion'] = '1.0'

                # Encode kembali JSON ke bytes
                new_json_bytes = json.dumps(json_obj, separators=(',', ':')).encode('utf-8')
                
                # Padding spasi agar ukuran kelipatan 4 bytes
                padding = (4 - (len(new_json_bytes) % 4)) % 4
                new_json_bytes += b' ' * padding

                new_chunk0_len = len(new_json_bytes)
                bin_chunk = data[20 + chunk0_len:]
                new_total_len = 12 + 8 + new_chunk0_len + len(bin_chunk)

                new_header = b'glTF' + struct.pack('<II', version, new_total_len)
                new_chunk0_header = struct.pack('<II', new_chunk0_len, chunk0_type)

                with open(filepath, 'wb') as f:
                    f.write(new_header + new_chunk0_header + new_json_bytes + bin_chunk)
                
                print(f"[BERHASIL] Patched: {os.path.basename(filepath)}")
            else:
                print(f"[SKIP] Header JSON tidak valid: {os.path.basename(filepath)}")
        else:
            print(f"[SKIP] Bukan format GLB/VRMA valid: {os.path.basename(filepath)}")

    except Exception as e:
        print(f"[ERROR] Gagal memproses {os.path.basename(filepath)}: {e}")

def main():
    target_dir = sys.argv[1] if len(sys.argv) > 1 else "assets"

    if not os.path.exists(target_dir):
        print(f"Error: Folder '{target_dir}' tidak ditemukan!")
        return

    print(f"Memulai perbaikan file .vrma pada folder: {target_dir}\n" + "-"*50)
    for root, _, files in os.walk(target_dir):
        for file in files:
            if file.lower().endswith('.vrma'):
                patch_vrma_file(os.path.join(root, file))
    print("-" * 50 + "\nSelesai!")

if __name__ == '__main__':
    main()