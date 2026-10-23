# Test helper: a relay's live connection, held the way Buzz 1.0's window holds it. Opens
# wss://<host>/ (TLS checked against the system's roots, or only against CA_FILE when given), answers
# the relay's NIP-42 challenge as the identity whose key comes on stdin, then reads a channel's
# messages. Python's standard library only.
#
# Usage: python3 wscheck.py <wss-url> <channel-id> [ca-file] < secret-key-file
# Prints one line per step and exits 0 when the relay accepted the AUTH and sent the channel's
# messages and EOSE.
import base64, hashlib, json, os, socket, ssl, struct, sys
from urllib.parse import urlsplit
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from event import event  # noqa: E402

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def send(sock, text):
    data = text.encode()
    mask = os.urandom(4)
    head = bytes([0x81])  # FIN, text
    n = len(data)
    if n < 126:
        head += bytes([0x80 | n])
    elif n < 65536:
        head += bytes([0x80 | 126]) + struct.pack(">H", n)
    else:
        head += bytes([0x80 | 127]) + struct.pack(">Q", n)
    sock.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))


def exact(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("the relay closed the connection")
        buf += chunk
    return buf


def receive(sock):
    """The next text message, answering pings on the way."""
    while True:
        b0, b1 = exact(sock, 2)
        n = b1 & 0x7F
        if n == 126:
            n = struct.unpack(">H", exact(sock, 2))[0]
        elif n == 127:
            n = struct.unpack(">Q", exact(sock, 8))[0]
        payload = exact(sock, n)
        op = b0 & 0x0F
        if op == 0x9:  # ping
            sock.sendall(bytes([0x8A, 0x80 | len(payload)]) + os.urandom(4) + payload)
        elif op == 0x8:
            raise ConnectionError("the relay sent close")
        elif op == 0x1:
            return json.loads(payload.decode())


def main():
    url, channel = sys.argv[1], sys.argv[2]
    ca = sys.argv[3] if len(sys.argv) > 3 else None
    d = int(sys.stdin.read().strip(), 16)
    parts = urlsplit(url)
    host, port = parts.hostname, parts.port or 443
    # with a CA file, Python trusts only that authority, so the check proves the certificate chains to it
    ctx = ssl.create_default_context(cafile=ca) if ca else ssl.create_default_context()
    sock = ctx.wrap_socket(socket.create_connection((host, port), timeout=15), server_hostname=host)
    cert = sock.getpeercert()
    names = [v for k, v in cert.get("subjectAltName", ()) if k == "DNS"]
    print(f"TLS {sock.version()}, certificate for {', '.join(names)}, issued by "
          f"{dict(x[0] for x in cert['issuer']).get('commonName', '?')}")
    key = base64.b64encode(os.urandom(16)).decode()
    authority = host if port == 443 else f"{host}:{port}"
    sock.sendall((f"GET / HTTP/1.1\r\nHost: {authority}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                  f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
                  f"Origin: tauri://localhost\r\n\r\n").encode())
    head = b""
    while b"\r\n\r\n" not in head:
        head += exact(sock, 1)
    status = head.split(b"\r\n", 1)[0].decode()
    accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
    if " 101 " not in status + " " or accept.encode() not in head:
        sys.exit(f"no WebSocket upgrade: {status}")
    print(f"WebSocket: {status}")
    msg = receive(sock)
    if msg[0] != "AUTH":
        sys.exit(f"expected the relay's NIP-42 challenge first, got {msg[0]}")
    relay = f"wss://{authority}"
    auth = event(22242, [["relay", relay], ["challenge", msg[1]]], "", d)
    send(sock, json.dumps(["AUTH", auth]))
    while True:
        msg = receive(sock)
        if msg[0] == "OK" and msg[1] == auth["id"]:
            break
    if msg[2] is not True:
        sys.exit(f"the relay refused the AUTH: {msg[3]}")
    print(f"NIP-42: the relay accepted AUTH for relay tag {relay}")
    send(sock, json.dumps(["REQ", "check", {"kinds": [9], "#h": [channel], "limit": 20}]))
    events = []
    while True:
        msg = receive(sock)
        if msg[0] == "EVENT" and msg[1] == "check":
            events.append(msg[2])
        elif msg[0] in ("EOSE", "CLOSED") and msg[1] == "check":
            break
    if msg[0] == "CLOSED":
        sys.exit(f"the relay closed the subscription: {msg[2]}")
    print(f"REQ: {len(events)} message(s) in the channel, then EOSE")
    for e in events:
        print(f"  {e['content']}")
    send(sock, json.dumps(["CLOSE", "check"]))
    sys.exit(0 if events else 1)


if __name__ == "__main__":
    main()
