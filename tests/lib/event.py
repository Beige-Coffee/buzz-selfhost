# Test helper: sign Nostr events the way Buzz 1.0 does for a relay's HTTP API.
# The secret key (64 hex) comes on stdin, so it never shows in a process list or a log.
#
#   python3 event.py <kind> <tags-json> [content] < key        the signed event, as JSON (for POST /events)
#   python3 event.py --header <kind> <tags-json> [content] < key   "Nostr <base64 event>", for an
#                                                              Authorization header (Blossom uploads and media)
#   python3 event.py --attest <agent-hex> < owner-key          the owner's NIP-OA auth tag for that agent key,
#                                                              as JSON: what Buzz 1.0 gives each agent it runs
import base64, hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nip98 import G, mul, sign  # noqa: E402  (BIP-340 Schnorr, shared with nip98.py)


def event(kind, tags, content, d):
    pub = f"{mul(d, G)[0]:064x}"
    created = int(time.time())
    eid = hashlib.sha256(json.dumps([0, pub, created, kind, tags, content], separators=(",", ":"),
                                    ensure_ascii=False).encode()).digest()
    sig, _ = sign(eid, d)
    return {"id": eid.hex(), "pubkey": pub, "created_at": created, "kind": kind, "tags": tags,
            "content": content, "sig": sig.hex()}


def attest(agent, d):
    # NIP-OA, unrestricted: the owner signs sha256("nostr:agent-auth:<agent>:<conditions>"), conditions empty
    owner = f"{mul(d, G)[0]:064x}"
    sig, _ = sign(hashlib.sha256(f"nostr:agent-auth:{agent}:".encode()).digest(), d)
    return ["auth", owner, "", sig.hex()]


if __name__ == "__main__":
    args = sys.argv[1:]
    d = int(sys.stdin.read().strip(), 16)
    if args[:1] == ["--attest"]:
        print(json.dumps(attest(args[1], d), separators=(",", ":")))
    elif args[:1] == ["--header"]:
        e = event(int(args[1]), json.loads(args[2]), args[3] if len(args) > 3 else "", d)
        print("Nostr " + base64.b64encode(json.dumps(e, separators=(",", ":")).encode()).decode())
    else:
        print(json.dumps(event(int(args[0]), json.loads(args[1]), args[2] if len(args) > 2 else "", d),
                         separators=(",", ":")))
