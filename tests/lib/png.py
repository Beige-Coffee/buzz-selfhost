# Writes a PNG of random pixels (unique content, so a restored file can't be a cached copy): small, or
# about SIZE bytes, stored without compression, for size limits.
#   python3 png.py out.png [SIZE]
import math, os, struct, sys, zlib
size = int(sys.argv[2]) if len(sys.argv) > 2 else 0
w = h = int(math.sqrt(size / 3)) if size else 64
raw = b"".join(b"\x00" + os.urandom(w * 3) for _ in range(h))
def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 0 if size else -1)) + chunk(b"IEND", b"")
open(sys.argv[1], "wb").write(png)
