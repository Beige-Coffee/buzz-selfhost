#!/usr/bin/env python3
"""Convert a Buzz public ID (npub) to the 64-character hex key the relay expects.

Usage: python3 npub-to-hex.py <npub>

Checks the npub's checksum, so a mistyped or cut-off npub fails instead of making a stranger
the owner or a member. Prints the hex key and nothing else.
"""
import sys

CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
GEN = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]


def polymod(values):
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i in range(5):
            chk ^= GEN[i] if top >> i & 1 else 0
    return chk


def npub_to_hex(npub):
    s = npub.strip().lower()
    sep = s.rfind("1")
    hrp, data = s[:sep], [CHARSET.find(c) for c in s[sep + 1:]]
    expanded = [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]
    if hrp != "npub" or -1 in data or len(data) < 7 or polymod(expanded + data) != 1:
        return None
    acc = bits = 0
    out = []
    for v in data[:-6]:
        acc, bits = acc << 5 | v, bits + 5
        while bits >= 8:
            bits -= 8
            out.append(acc >> bits & 255)
    return bytes(out).hex() if len(out) == 32 else None


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: npub-to-hex.py <npub>")
    key = npub_to_hex(sys.argv[1])
    if not key:
        sys.exit("not a valid npub: check it was copied whole")
    print(key)
