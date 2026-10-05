# Test helper: hex public key -> npub (NIP-19 bech32). Usage: python3 npub.py <64-hex>
import sys
C = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
def pm(vals):
    c = 1
    for v in vals:
        b = c >> 25; c = ((c & 0x1ffffff) << 5) ^ v
        for i in range(5):
            if (b >> i) & 1: c ^= G[i]
    return c
def hx(h): return [ord(x) >> 5 for x in h] + [0] + [ord(x) & 31 for x in h]
def bits(data):
    acc = n = 0; out = []
    for v in data:
        acc = (acc << 8) | v; n += 8
        while n >= 5: n -= 5; out.append((acc >> n) & 31)
    if n: out.append((acc << (5 - n)) & 31)
    return out
def npub(hexkey):
    d = bits(bytes.fromhex(hexkey)); p = pm(hx("npub") + d + [0] * 6) ^ 1
    return "npub1" + "".join(C[x] for x in d + [(p >> 5 * (5 - i)) & 31 for i in range(6)])
print(npub(sys.argv[1]))
