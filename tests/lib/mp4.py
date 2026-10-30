# Writes an MP4-shaped file of about SIZE bytes: an ftyp box, then an mdat box of random bytes. Buzz
# refuses it as a video, so it suits only checks that stop at a size limit.
#   python3 mp4.py out.mp4 SIZE
import os, struct, sys
n = int(sys.argv[2])
ftyp = struct.pack(">I", 24) + b"ftypmp42" + bytes(4) + b"mp42isom"
body = n - len(ftyp) - 8
with open(sys.argv[1], "wb") as f:
    f.write(ftyp + struct.pack(">I", body + 8) + b"mdat")
    for _ in range(body // 4_000_000):
        f.write(os.urandom(4_000_000))
    f.write(os.urandom(body % 4_000_000))
