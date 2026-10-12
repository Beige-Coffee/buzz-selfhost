# Test helper: a NIP-98 Authorization header, as Buzz Desktop signs it for the relay's HTTP API.
# Usage: python3 nip98.py <METHOD> <URL> [BODY] < secret-key-file
# The secret key (64 hex) comes on stdin, so it never shows in a process list or a log. Prints the
# header's value: "Nostr <base64 event>". For a body, the event carries its sha256 (payload tag).
import base64, hashlib, json, secrets, sys, time, uuid
P = 2**256 - 2**32 - 977
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
     0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8)
def add(a, b):
    if a is None: return b
    if b is None: return a
    if a[0] == b[0] and (a[1] + b[1]) % P == 0: return None
    if a == b: l = 3 * a[0] * a[0] * pow(2 * a[1], P - 2, P) % P
    else: l = (b[1] - a[1]) * pow(b[0] - a[0], P - 2, P) % P
    x = (l * l - a[0] - b[0]) % P
    return (x, (l * (a[0] - x) - a[1]) % P)
def mul(k, pt):
    r = None
    while k:
        if k & 1: r = add(r, pt)
        pt = add(pt, pt); k >>= 1
    return r
def th(tag, msg):  # BIP-340 tagged hash
    t = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(t + t + msg).digest()
b32 = lambda i: i.to_bytes(32, "big")
def sign(msg, d0):  # BIP-340 Schnorr signature
    pk = mul(d0, G)
    d = d0 if pk[1] % 2 == 0 else N - d0
    t = bytes(x ^ y for x, y in zip(b32(d), th("BIP0340/aux", secrets.token_bytes(32))))
    k0 = int.from_bytes(th("BIP0340/nonce", t + b32(pk[0]) + msg), "big") % N
    r = mul(k0, G)
    k = k0 if r[1] % 2 == 0 else N - k0
    e = int.from_bytes(th("BIP0340/challenge", b32(r[0]) + b32(pk[0]) + msg), "big") % N
    return b32(r[0]) + b32((k + e * d) % N), pk[0]

def header(method, url, body, d):
    tags = [["u", url], ["method", method]]
    if body is not None:
        tags.append(["payload", hashlib.sha256(body.encode()).hexdigest()])
    tags.append(["nonce", str(uuid.uuid4())])
    pub = f"{mul(d, G)[0]:064x}"
    created = int(time.time())
    eid = hashlib.sha256(json.dumps([0, pub, created, 27235, tags, ""], separators=(",", ":")).encode()).digest()
    sig, _ = sign(eid, d)
    event = {"id": eid.hex(), "pubkey": pub, "created_at": created, "kind": 27235, "tags": tags, "content": "", "sig": sig.hex()}
    return "Nostr " + base64.b64encode(json.dumps(event, separators=(",", ":")).encode()).decode()

if __name__ == "__main__":
    print(header(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None, int(sys.stdin.read().strip(), 16)))
