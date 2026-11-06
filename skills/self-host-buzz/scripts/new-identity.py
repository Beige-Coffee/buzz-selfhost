#!/usr/bin/env python3
"""Make a new Buzz identity on this computer: a Nostr key pair, made here and sent nowhere.

Usage: python3 new-identity.py [--out PATH]
       python3 new-identity.py --selftest

Writes the private key (nsec) to a new file that only you can read: ~/buzz-identity.nsec, or the
full path --out names. It never overwrites a file. Then it prints two lines, the public ID (npub)
and the file's path, and never the private key.

In Buzz 1.0, choose Other options, paste the community's address and choose Continue, then Use an
existing key, and drop this file on the page. Once Buzz has joined, save the key in your password
manager (Settings, Identity, Copy private key) and delete the file.

Pure Python 3, with nothing to install. The key comes from the operating system's secure random
source. --selftest checks the encoding against NIP-19's published examples and the key math against
known secp256k1 keys, and writes nothing.
"""
import os
import secrets
import sys

# bech32, as npub-to-hex.py reads it (NIP-19 uses bech32, not bech32m)
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


def hrp_expand(hrp):
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]


def bech32_encode(hrp, data):
    """32 bytes as an `hrp1...` string."""
    acc = bits = 0
    words = []
    for byte in data:
        acc, bits = acc << 8 | byte, bits + 8
        while bits >= 5:
            bits -= 5
            words.append(acc >> bits & 31)
    if bits:
        words.append(acc << (5 - bits) & 31)
    check = polymod(hrp_expand(hrp) + words + [0] * 6) ^ 1
    words += [check >> 5 * (5 - i) & 31 for i in range(6)]
    return hrp + "1" + "".join(CHARSET[w] for w in words)


def bech32_decode(hrp, text):
    """The 32 bytes in an `hrp1...` string, or None if it isn't one with a valid checksum."""
    s = text.strip().lower()
    sep = s.rfind("1")
    data = [CHARSET.find(c) for c in s[sep + 1:]]
    if s[:sep] != hrp or -1 in data or len(data) < 7 or polymod(hrp_expand(hrp) + data) != 1:
        return None
    acc = bits = 0
    out = []
    for v in data[:-6]:
        acc, bits = acc << 5 | v, bits + 5
        while bits >= 8:
            bits -= 8
            out.append(acc >> bits & 255)
    return bytes(out) if len(out) == 32 else None


# secp256k1: the curve y^2 = x^3 + 7 over the field P, with generator G of prime order N
P = 2**256 - 2**32 - 977
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
)


def point_add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    if a[0] == b[0] and (a[1] + b[1]) % P == 0:
        return None
    if a == b:
        m = 3 * a[0] * a[0] * pow(2 * a[1], -1, P) % P
    else:
        m = (b[1] - a[1]) * pow(b[0] - a[0], -1, P) % P
    x = (m * m - a[0] - b[0]) % P
    return (x, (m * (a[0] - x) - a[1]) % P)


def public_key(secret):
    """The x-only public key (32 bytes) of a secret in [1, N-1], as Nostr uses it."""
    if not 1 <= secret < N:
        raise ValueError("secret key out of range")
    result, addend = None, G
    while secret:
        if secret & 1:
            result = point_add(result, addend)
        addend = point_add(addend, addend)
        secret >>= 1
    return result[0].to_bytes(32, "big")


def new_secret():
    """A secret key from the OS's secure random source, uniform over [1, N-1]."""
    while True:
        secret = int.from_bytes(secrets.token_bytes(32), "big")
        if 1 <= secret < N:
            return secret


def write_key(path, nsec):
    """Create path with mode 600 and the key as its one line. Fails if anything is there already."""
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    flags |= getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0)
    fd = os.open(path, flags, 0o600)
    try:
        if hasattr(os, "fchmod"):
            os.fchmod(fd, 0o600)
        os.write(fd, (nsec + "\n").encode())
        os.fsync(fd)
    finally:
        os.close(fd)


def selftest():
    # NIP-19's examples (github.com/nostr-protocol/nips/blob/master/19.md): one key pair, public
    # test values. The nsec is split so that secret scanners don't flag the published example.
    npub = "npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg"
    pub = "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e"
    nsec = "nsec1" + "vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5"
    sec = "67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa"
    checks = [
        ("NIP-19 npub encodes", bech32_encode("npub", bytes.fromhex(pub)) == npub),
        ("NIP-19 npub decodes", bech32_decode("npub", npub) == bytes.fromhex(pub)),
        ("NIP-19 nsec encodes", bech32_encode("nsec", bytes.fromhex(sec)) == nsec),
        ("NIP-19 nsec decodes", bech32_decode("nsec", nsec) == bytes.fromhex(sec)),
        ("NIP-19 nsec's public key is its npub", public_key(int(sec, 16)).hex() == pub),
        ("a cut-off npub fails its checksum", bech32_decode("npub", npub[:-1]) is None),
        # secp256k1: 1 gives G, BIP-340's test vectors 0 and 1, and N-1 gives -G, with G's x
        ("secret 1 gives G", public_key(1) == G[0].to_bytes(32, "big")),
        ("BIP-340 vector 0", public_key(3).hex()
         == "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9"),
        ("BIP-340 vector 1",
         public_key(0xB7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFEF).hex()
         == "dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659"),
        ("secret N-1 gives G's x", public_key(N - 1) == G[0].to_bytes(32, "big")),
    ]
    secret = new_secret()
    raw = secret.to_bytes(32, "big")
    x = int.from_bytes(public_key(secret), "big")
    checks += [
        ("a new secret is in range", 1 <= secret < N),
        ("a new public key is on the curve", pow(x * x * x + 7, (P - 1) // 2, P) == 1),
        ("a new key's nsec reads back", bech32_decode("nsec", bech32_encode("nsec", raw)) == raw),
    ]
    failed = [name for name, ok in checks if not ok]
    for name, ok in checks:
        print(("PASS  " if ok else "FAIL  ") + name)
    return 1 if failed else 0


def main(argv):
    if argv == ["--selftest"]:
        return selftest()
    path = os.path.join(os.path.expanduser("~"), "buzz-identity.nsec")
    if argv[:1] == ["--out"] and len(argv) == 2:
        path = os.path.expanduser(argv[1])
        if not os.path.isabs(path):
            sys.exit("--out needs a full path, such as ~/keys/buzz-identity.nsec")
    elif argv:
        sys.exit("usage: new-identity.py [--out PATH] | --selftest")
    path = os.path.abspath(path)
    secret = new_secret()
    npub = bech32_encode("npub", public_key(secret))
    try:
        write_key(path, bech32_encode("nsec", secret.to_bytes(32, "big")))
    except FileExistsError:
        sys.exit(f"{path} already exists, and this never replaces a key file. If it's a key "
                 "you made before, use it; for another, choose a new file with --out.")
    except FileNotFoundError:
        sys.exit(f"the folder for {path} doesn't exist")
    except OSError as e:
        sys.exit(f"couldn't write {path}: {e.strerror}")
    del secret
    print(npub)
    print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
