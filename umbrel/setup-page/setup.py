"""Buzz Relay on Umbrel: the setup and status page.

A guided setup: the owner's public ID, how members' apps reach this Umbrel, and the community's
address. Then it connects that address, checks it, and shows how to join, invite and pair phones.

It has its own sign-in, with the password Umbrel shows for this app. Umbrel's login guards
browsers, but every app on an Umbrel shares one Docker network, so other apps could reach this
page directly; the password keeps them out. It ships as its own image, built from this folder by
GitHub Actions (see README.md here).
"""
import base64
import concurrent.futures
import decimal
import email.parser
import email.policy
import hashlib
import hmac
import html
import http.client
import http.server
import ipaddress
import json
import os
import re
import socket
import ssl
import threading
import time
import urllib.parse
import urllib.request

# The relay's settings and this page's own. Only this page writes them; the relay and the gateway read them.
SETTINGS_DIR = "/settings"
RELAY_ENV = os.path.join(SETTINGS_DIR, "relay.env")
SETUP_JSON = os.path.join(SETTINGS_DIR, "setup.json")
# Shared with the app's Tailscale machine alone: how to publish, and what it reports back
TAILSCALE_DIR = "/tailscale"
TAILSCALE_ON = os.path.join(TAILSCALE_DIR, "tailscale-enabled")
TAILSCALE_STATUS = os.path.join(TAILSCALE_DIR, "tailscale-status.json")
TAILSCALE_SERVE = os.path.join(TAILSCALE_DIR, "tailscale-serve.txt")
TAILSCALE_LOGS = ("tailscale-publish.log",)
# Shared with the app's Cloudflare tunnel alone: the name it serves, where it stands, and its sign-in link
CLOUDFLARE_DIR = "/cloudflare"
CLOUDFLARE_ON = os.path.join(CLOUDFLARE_DIR, "cloudflare-enabled")
CLOUDFLARE_STATE = os.path.join(CLOUDFLARE_DIR, "cloudflare-state")
CLOUDFLARE_LOGIN = os.path.join(CLOUDFLARE_DIR, "cloudflare-login.log")
CLOUDFLARE_SETUP = os.path.join(CLOUDFLARE_DIR, "cloudflare-setup.log")
CLOUDFLARE_RESET = os.path.join(CLOUDFLARE_DIR, "cloudflare-reset")
# A sign-in the owner uploads when Cloudflare's page saves it in the browser instead of passing it to the
# tunnel's login (cloudflare/cloudflared#1252). It waits here until the tunnel takes it, seconds at most, and
# Umbrel's backups skip it.
CLOUDFLARE_UPLOAD = os.path.join(CLOUDFLARE_DIR, "cloudflare-upload.pem")
GATEWAY_URL = "buzz-gateway:80"
RELAY_HOST = "buzz_relay_1"
BUZZ_APP = "https://buzz.xyz"
APP_STORE = "https://apps.apple.com/app/id6779728271"
GOOGLE_PLAY = "https://play.google.com/store/apps/details?id=xyz.block.buzz.mobile"
NAK = "https://github.com/fiatjaf/nak"
TUNNEL_GUIDE = "https://github.com/Radiokot/umbrel-cloudflared/wiki/How-to-set-up-Cloudflare-Tunnel-on-your-Umbrel"
TAILSCALE_ADMIN = "https://login.tailscale.com/admin/machines"
TAILSCALE_ACCESS = "https://login.tailscale.com/admin/acls"
# The self-hosting guide, by its homepage alone: its deeper paths can change. Its Security section is an anchor on
# that page, which still opens the guide if the anchor goes.
SELF_HOST_GUIDE = "https://self-host.buzz/"
SELF_HOST_SECURITY = SELF_HOST_GUIDE + "#security"

PASSWORD = os.environ.get("APP_PASSWORD", "")
SECRET = (os.environ.get("SETUP_SESSION_SECRET") or hashlib.sha256(("buzz-setup|" + PASSWORD).encode()).hexdigest()).encode()
COOKIE = "buzz_setup"
SESSION_SECONDS = 30 * 24 * 3600

MODES = ("domain", "funnel", "private")
MODE_NAMES = {"domain": "Your own domain", "funnel": "A free Tailscale address", "private": "Private Tailscale network"}

BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
LABEL = r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"
HOST = r"(" + LABEL + r"\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]"


# ---------------------------------------------------------------- what the owner types


def bech32_polymod(values):
    generator = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    check = 1
    for value in values:
        top = check >> 25
        check = ((check & 0x1FFFFFF) << 5) ^ value
        for i in range(5):
            if (top >> i) & 1:
                check ^= generator[i]
    return check


def owner_hex(text):
    """The owner's 64-character hex key, from an npub (checksum verified) or hex."""
    value = text.strip().lower()
    if value.startswith("nostr:"):
        value = value[6:]
    if re.fullmatch(r"[0-9a-f]{64}", value):
        return value
    if value.startswith("nsec"):
        raise ValueError("That's a private key. Keep it secret, and paste only your public ID here. It starts with npub1.")
    if not value.startswith("npub1") or len(value) != 63:
        raise ValueError("Paste your public ID. In Buzz, it's under Settings, then Identity, on your Buzz ID card. It starts with npub1 and is 63 characters long.")
    data = []
    for char in value[5:]:
        if char not in BECH32:
            raise ValueError("That public ID contains a character that isn't allowed. Copy it again from Buzz.")
        data.append(BECH32.index(char))
    expanded = [ord(c) >> 5 for c in "npub"] + [0] + [ord(c) & 31 for c in "npub"]
    if bech32_polymod(expanded + data) != 1:
        raise ValueError("That public ID has a wrong or missing character. Copy it again from Buzz.")
    acc = bits = 0
    key = bytearray()
    for value5 in data[:-6]:
        acc = (acc << 5) | value5
        bits += 5
        while bits >= 8:
            bits -= 8
            key.append((acc >> bits) & 0xFF)
    if len(key) != 32:
        raise ValueError("That public ID is the wrong length. Copy it again from Buzz.")
    return key.hex()


def clean_domain(text):
    domain = re.sub(r"^[a-z]+://", "", text.strip().lower()).split("/")[0].rstrip(".")
    if not domain:
        raise ValueError("Enter your domain, like yourteam.com.")
    if len(domain) > 253 or not re.fullmatch(HOST, domain):
        raise ValueError("That isn't a domain. Enter one like yourteam.com, with no port or path.")
    if domain.endswith((".local", ".localhost", ".internal", ".lan", ".home.arpa")):
        raise ValueError("That name only works on your home network. Use a public domain, "
                         "or choose a Tailscale option.")
    if domain.endswith(".ts.net"):
        raise ValueError("For a Tailscale address, choose one of the Tailscale options instead. This app "
                         "sets up that address itself.")
    return domain


def tailscale_name(text):
    """The machine's name as Tailscale reports it, if it's a plain ts.net host name, or "". It becomes the
    community's address, in the relay's settings and on this page."""
    name = str(text or "").rstrip(".").lower()
    return name if len(name) <= 253 and re.fullmatch(r"(" + LABEL + r"\.)+ts\.net", name) else ""


# A sign-in file. The tunnel checks it again before using it (signin_file in docker-compose.yml), and both
# take exactly the same files, so change them together. A cert.pem is about 600 bytes.
CERT_MAX = 16384
CERT_BEGIN, CERT_END = b"-----BEGIN ARGO TUNNEL TOKEN-----", b"-----END ARGO TUNNEL TOKEN-----"
# Padded base64, with the unused bits of a short last group zero, as encoders write it: every decoder, the
# tunnel's included, then reads the same bytes
CERT_BASE64 = re.compile(rb"(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/][AQgw]==|[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=)?")
# A flat JSON object of text values with no escapes, spaces allowed between its parts
CERT_JSON = re.compile(r' *[{] *"[A-Za-z0-9_]+" *: *"[^"\\]*" *(?:, *"[A-Za-z0-9_]+" *: *"[^"\\]*" *)*[}] *')
CERT_FIELD = re.compile(r'"([A-Za-z0-9_]+)" *: *"([^"\\]*)"')
NOT_A_CERT = ("That isn't a Cloudflare sign-in file. Choose the cert.pem file Cloudflare saved. It's usually in your "
              "Downloads folder.")


def cert_fields(data):
    """The fields in a sign-in file's one ARGO TUNNEL TOKEN block, or None: plain text with Unix line breaks, the
    block alone, and in it base64 of a JSON object, as Cloudflare saves it."""
    if not re.fullmatch(rb"[A-Za-z0-9+/= \n-]*", data):
        return None
    lines = (data[:-1] if data.endswith(b"\n") else data).split(b"\n")
    if len(lines) < 2 or lines[0] != CERT_BEGIN or lines[-1] != CERT_END:
        return None
    if not all(re.fullmatch(rb"[A-Za-z0-9+/=]+", line) for line in lines[1:-1]):
        return None
    encoded = b"".join(lines[1:-1])
    if not CERT_BASE64.fullmatch(encoded):
        return None
    decoded = base64.b64decode(encoded)
    # JSON's tabs and line breaks count as spaces; nothing else that isn't plain text
    if not re.fullmatch(rb"[\t\n\r\x20-\x7e]*", decoded):
        return None
    text = decoded.translate(bytes.maketrans(b"\t\n\r", b"   ")).decode("ascii")
    if not CERT_JSON.fullmatch(text):
        return None
    pairs = CERT_FIELD.findall(text)
    if len({name.lower() for name, _ in pairs}) != len(pairs):  # no name twice, in any case: which would count?
        return None
    return dict(pairs)


def cloudflare_cert(data):
    """The uploaded sign-in, unchanged, if it's one, or ValueError. A zone, an account and an API token are what
    the tunnel needs; other fields, like the serviceKey Cloudflare adds, stay. The messages are fixed sentences
    that never include anything from the file."""
    if not data:
        raise ValueError("Choose the cert.pem file Cloudflare saved, then upload it.")
    if len(data) > CERT_MAX:
        raise ValueError("That file is too large to be a Cloudflare sign-in. Choose the cert.pem file Cloudflare saved.")
    try:
        fields = cert_fields(data)
    except Exception:
        fields = None  # whatever went wrong, nothing from the file reaches a message or a log
    if fields is None:
        raise ValueError(NOT_A_CERT)

    def has(name):  # a value with no spaces in it
        return re.fullmatch(r'[^" \\]+', fields.get(name, "")) is not None

    if not (has("zoneID") and has("apiToken")):
        raise ValueError(NOT_A_CERT)
    if not has("accountID"):  # cloudflared refuses these for new tunnels
        raise ValueError("That sign-in file is too old to set up a tunnel. Upload the cert.pem from your latest "
                         "sign-in, or sign in with the button.")
    return data


# ---------------------------------------------------------------- settings on disk


def read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def read_text(path):
    # The helpers' logs can hold bytes that aren't UTF-8: they read as replacement characters, never as an error
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def write_atomic(path, text):
    temporary = path + ".tmp"
    with open(temporary, "w") as f:
        f.write(text)
    os.replace(temporary, path)


def write_secret(path, data):
    """Like write_atomic, for a secret: readable by this app's user alone from the moment it exists. The folder
    is shared with another service, so whatever is already at the temporary name, a link or a pipe, is removed
    first, never written into or through."""
    temporary = path + ".tmp"
    try:
        os.remove(temporary)
    except FileNotFoundError:
        pass
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        os.fchmod(f.fileno(), 0o600)
        f.write(data)
    os.replace(temporary, path)


def drop_upload():
    """Deletes an uploaded sign-in the tunnel hasn't taken, and a write of one that didn't finish."""
    for path in (CLOUDFLARE_UPLOAD, CLOUDFLARE_UPLOAD + ".tmp"):
        try:
            os.remove(path)
        except OSError:  # not there, or not a file this page wrote
            pass


def upload_waiting():
    return os.path.isfile(CLOUDFLARE_UPLOAD)


def norm_mode(mode):
    return mode if mode in MODES else "domain"


def load_setup():
    setup = read_json(SETUP_JSON)
    if not isinstance(setup, dict) or not re.fullmatch(r"[0-9a-f]{64}", str(setup.get("owner_hex") or "")):
        return None
    setup["mode"] = norm_mode(setup.get("mode"))
    return setup


def relay_domain():
    """The address the relay runs at, once its settings are written."""
    for line in read_text(RELAY_ENV).splitlines():
        if line.startswith("BUZZ_DOMAIN="):
            return line.split("=", 1)[1].strip()
    return ""


def push_on(setup):
    """Phone notifications: on unless the owner turned them off."""
    return (setup or {}).get("push") is not False


def moderation_on(setup):
    """Moderation, the relay's admin API at <domain>:8443: off unless the owner turned it on, and only on the
    owner's own domain. setup.json keeps "moderation": false once it has been on, and has no such key before."""
    return bool(setup) and setup.get("moderation") is True and setup.get("mode") == "domain"


def relay_env_text(key, domain, push, admin=False):
    # The relay watches this file and restarts when it changes. It reads plain KEY=value lines, never
    # runs them, and these are the only values in them.
    if not re.fullmatch(r"[0-9a-f]{64}", key) or len(domain) > 253 or not re.fullmatch(HOST, domain):
        raise ValueError("The relay's settings take a key and a host name.")
    if admin and domain.endswith(".ts.net"):
        raise ValueError("Moderation needs your own domain.")
    lines = [
        "RELAY_OWNER_PUBKEY=" + key,
        "BUZZ_DOMAIN=" + domain,
        "RELAY_URL=wss://" + domain,
        "BUZZ_MEDIA_BASE_URL=https://" + domain + "/media",
        "BUZZ_MEDIA_SERVER_DOMAIN=" + domain,
        "BUZZ_CORS_ORIGINS=https://" + domain + ",tauri://localhost,http://tauri.localhost",
        "BUZZ_PAIRING_RELAY_URL=wss://" + domain + "/pair",
        "BUZZ_PUSH_ENABLED=" + ("true" if push else "false"),
    ]
    # Moderation, at this domain and port alone: the relay's entrypoint drops any other value
    if admin:
        lines.append("BUZZ_ADMIN_HOST=" + domain + ":8443")
    return "\n".join(lines) + "\n"


def write_relay_env(key, domain, push, admin=False):
    write_atomic(RELAY_ENV, relay_env_text(key, domain, push, admin))


# The watcher and the forms both read the settings and write them back: one at a time, so an owner's
# change can't be lost to the watcher writing what it read a moment before
SETUP_LOCK = threading.Lock()


def save(owner_text, key, mode, domain, push=None, moderation=None):
    """push and moderation of None keep what setup.json says. Moderation stays on through a move to another
    domain, at the new name, and turns off on a Tailscale option, which can't serve it."""
    previous = load_setup() or {}
    if push is None:
        push = push_on(previous)
    if moderation is None:
        moderation = previous.get("moderation") if previous.get("moderation") in (True, False) else None
        if moderation is True and previous.get("mode") != "domain":
            moderation = False  # it was never on there, so it doesn't come back with a domain
    if moderation is True and mode != "domain":
        moderation = False
    record = {"owner": owner_text, "owner_hex": key, "mode": mode, "domain": domain, "push": push}
    if moderation is not None:  # once it has been on, it stays false when off: staff added then return with it
        record["moderation"] = moderation
    write_atomic(SETUP_JSON, json.dumps(record))
    forget_admin()
    if mode == "domain":
        if os.path.exists(TAILSCALE_ON):
            os.remove(TAILSCALE_ON)
        # An uploaded sign-in belongs to the address it came with: another address waits for its own
        if read_text(CLOUDFLARE_ON).strip() != domain:
            drop_upload()
        write_atomic(CLOUDFLARE_ON, domain + "\n")
        write_relay_env(key, domain, push, moderation is True)
        return
    if os.path.exists(CLOUDFLARE_ON):
        os.remove(CLOUDFLARE_ON)
    drop_upload()
    # The Tailscale machine starts (or switches between Funnel and tailnet only); the watcher
    # writes the relay's settings once the machine has its name.
    write_atomic(TAILSCALE_ON, mode + "\n")
    if domain:
        write_relay_env(key, domain, push)
    elif os.path.exists(RELAY_ENV):
        os.remove(RELAY_ENV)


def reconcile():
    """At start. A stop between save()'s writes can leave the relay's settings saying something other than
    setup.json does, about moderation, notifications or the address. setup.json wins: its save runs again."""
    with SETUP_LOCK:
        setup = load_setup()
        if not setup or (read_json(SETUP_JSON) or {}).get("mode") not in MODES:
            return  # nothing saved yet, or not a save this page made
        domain = str(setup.get("domain") or "")
        try:
            expected = relay_env_text(setup["owner_hex"], domain, push_on(setup), moderation_on(setup)) if domain else ""
        except ValueError:
            return  # not a domain this page would have saved: left as it is
        if read_text(RELAY_ENV) != expected:
            save(str(setup.get("owner") or ""), setup["owner_hex"], setup["mode"], domain)


# ---------------------------------------------------------------- Tailscale


def tailscale_state():
    status = read_json(TAILSCALE_STATUS)
    status = status if isinstance(status, dict) else {}
    me = status.get("Self") if isinstance(status.get("Self"), dict) else {}
    auth = str(status.get("AuthURL") or "")
    # The name becomes the community's address and the link a button: only a plain ts.net name, and
    # only Tailscale's own sign-in links
    return {"backend": str(status.get("BackendState") or ""), "name": tailscale_name(me.get("DNSName")),
            "auth_url": auth if re.fullmatch(r"https://login\.tailscale\.com/[A-Za-z0-9/_.?=&%-]+", auth) else "",
            "node": str(me.get("ID") or "")}


def published():
    """How the Tailscale machine publishes Buzz now: "funnel", "private" or ""."""
    text = read_text(TAILSCALE_SERVE)
    if "Funnel on" in text:
        return "funnel"
    return "private" if "tailnet only" in text else ""


def consent_link():
    """Tailscale's one-click link to turn on Funnel or HTTPS for this machine, if it printed one."""
    for name in TAILSCALE_LOGS:
        found = re.search(r"https://login\.tailscale\.com/f/[A-Za-z0-9/_.?=&%-]+", read_text(os.path.join(TAILSCALE_DIR, name)))
        if found:
            return found.group(0)
    return ""


def tailscale_watcher():
    """Once the Tailscale machine is signed in, its name becomes the community's address. Only once:
    a later rename of the machine would start a new community, so the address never moves by itself."""
    while True:
        try:
            adopt_tailscale_name()
        except (OSError, KeyError, ValueError):
            pass
        time.sleep(3)


def adopt_tailscale_name():
    """One look: a Tailscale option still without an address takes the signed-in machine's name."""
    with SETUP_LOCK:
        setup = load_setup()
        if setup and setup["mode"] in ("funnel", "private") and not setup.get("domain"):
            state = tailscale_state()
            if state["backend"] == "Running" and state["name"]:
                save(setup["owner"], setup["owner_hex"], setup["mode"], state["name"])


def cloudflare_state():
    """Where this app's Cloudflare tunnel stands, and Cloudflare's sign-in link while it waits for one."""
    state = read_text(CLOUDFLARE_STATE).strip()
    found = re.search(r"https://dash\.cloudflare\.com/argotunnel\?[A-Za-z0-9/_.?=&%:-]+", read_text(CLOUDFLARE_LOGIN)) if state == "signin" else None
    return {"state": state, "link": found.group(0) if found else ""}


def cloudflare_problem():
    """The last thing Cloudflare's tool said, for an error the page can't put in its own words."""
    lines = [line.strip() for line in read_text(CLOUDFLARE_SETUP).splitlines() if line.strip()]
    return lines[-1][-240:] if lines else ""


def cloudflare_step():
    """Like tailscale_step: the page reloads when this changes, a new sign-in link included."""
    cf = cloudflare_state()
    if cf["state"] == "signin":
        if upload_waiting():  # the tunnel takes it within seconds, then reports its next step
            return "signin-upload"
        return "signin-" + (hashlib.sha256(cf["link"].encode()).hexdigest()[:8] if cf["link"] else "wait")
    return cf["state"] or "starting"


# ---------------------------------------------------------------- checks


def request(host, port, path, tls=False, headers=None, timeout=6, addr=None):
    """(status, body) or (None, reason). A WebSocket upgrade comes back 101 with no body. With addr, it
    connects to that address while still asking for host, by its certificate and Host header."""
    try:
        context = ssl.create_default_context()
        if tls:
            conn = http.client.HTTPSConnection(host, port, timeout=timeout, context=context)
        else:
            conn = http.client.HTTPConnection(host, port, timeout=timeout)
        if addr:
            sock = socket.create_connection((addr, port), timeout=timeout)
            conn.sock = context.wrap_socket(sock, server_hostname=host) if tls else sock
        conn.request("GET", path, headers=headers or {})
        response = conn.getresponse()
        body = b"" if response.status == 101 else response.read(65536)
        conn.close()
        return response.status, body
    except ssl.SSLError as error:
        return None, ("tls " + str(error)).encode()
    except (OSError, http.client.HTTPException) as error:
        return None, str(error).encode()


UPGRADE = {"Connection": "Upgrade", "Upgrade": "websocket", "Sec-WebSocket-Version": "13",
           "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ=="}
NIP11 = {"Accept": "application/nostr+json"}


def relay_self(status, body):
    if status != 200:
        return ""
    try:
        return json.loads(body.decode()).get("self") or ""
    except (ValueError, UnicodeDecodeError, AttributeError):
        return ""


def resolves(name):
    """The name's addresses as the internet sees them, from Cloudflare's public DNS: this Umbrel's own
    resolver may still hold the "no such name" it got while the page checked a name not yet published."""
    try:
        query = urllib.request.Request("https://cloudflare-dns.com/dns-query?" + urllib.parse.urlencode({"name": name, "type": "A"}),
                                       headers={"Accept": "application/dns-json"})
        with urllib.request.urlopen(query, timeout=5) as response:
            found = sorted({a["data"] for a in json.load(response).get("Answer") or [] if a.get("type") == 1})
        if found:
            return found
    except (OSError, ValueError, KeyError, TypeError):
        pass
    try:
        return sorted({info[4][0] for info in socket.getaddrinfo(name, 443)})
    except OSError:
        return []


def item(key, state, text, hint=""):
    """One check. Its text and hint are trusted HTML: the page puts them in as they are, in the card, the bar and
    status.json. Any value from the settings, a helper's files or the network must be escaped before it gets here,
    as the domain is with html.escape."""
    return {"key": key, "state": state, "text": text, "hint": hint}


# ---------------------------------------------------------------- moderation's address

ADMIN_PORT = 8443


def admin_origin(domain):
    return "https://" + domain + ":" + str(ADMIN_PORT)


def advertised_admin(status, body):
    """The moderation address a NIP-11 answer advertises: "" for none, or None when it isn't a NIP-11 answer.
    The page only compares it with its own, and never shows it."""
    if status != 200:
        return None
    try:
        info = json.loads(body.decode())
    except (ValueError, UnicodeDecodeError, AttributeError):
        return None
    if not isinstance(info, dict):
        return None
    value = info.get("admin_api")
    return value if isinstance(value, str) else ""


def admin_request(domain, addr, timeout=4):
    """https://<domain>:8443/, asked as Buzz's admin client asks: no User-Agent, and a Host that keeps its port
    (http.client adds it). The NIP-11 Accept makes each failure look different. (status, headers, body), with
    the headers' names in lower case, or (None, {}, reason)."""
    try:
        context = ssl.create_default_context()
        conn = http.client.HTTPSConnection(domain, ADMIN_PORT, timeout=timeout, context=context)
        if addr:
            conn.sock = context.wrap_socket(socket.create_connection((addr, ADMIN_PORT), timeout=timeout),
                                            server_hostname=domain)
        conn.request("GET", "/", headers=NIP11)
        response = conn.getresponse()
        headers = {name.lower(): value for name, value in response.getheaders()}
        body = response.read(65536)
        conn.close()
        return response.status, headers, body
    except ssl.SSLError as error:
        return None, {}, ("tls " + str(error)).encode()
    except (OSError, http.client.HTTPException) as error:
        return None, {}, str(error).encode()


def admin_probe(domain, addresses, info):
    """One look at the moderation address, once the community's NIP-11 (the info future) advertises it: nothing
    is sent otherwise. Buzz opens moderation only at public addresses, so a name that points anywhere else
    isn't asked either."""
    if advertised_admin(*info.result()) != admin_origin(domain):
        return None
    try:
        public = bool(addresses) and all(ipaddress.ip_address(a).is_global for a in addresses)
    except ValueError:
        public = False
    if not public:
        return None, {}, b"not asked: no public address"
    return admin_request(domain, addresses[0])


def admin_answer(status, headers, body):
    """What the moderation address's answer means, as (class, status). The relay's admin host answers / with a
    404 and its own Content-Security-Policy (default-src 'none', frame-ancestors 'none'). Cloudflare turns a
    client away with its own pages. A Host that lost its port reaches the community, which answers NIP-11."""
    headers, body = headers or {}, body or b""
    if status is None:  # nothing answered, or it couldn't be asked: an HTTPS error, or no public address
        return ("other" if body.startswith((b"tls", b"not asked")) else "nothing"), None
    text = body.decode(errors="replace")
    csp = headers.get("content-security-policy", "")
    if status == 404 and csp.startswith("default-src 'none'") and "frame-ancestors 'none'" in csp:
        return "ok", status
    html_page = headers.get("content-type", "").lower().startswith("text/html")
    if (headers.get("cf-mitigated") or "error code: 1010" in text or "Error 1010" in text
            or "challenge-platform" in text or "Just a moment" in text or (status in (403, 429, 503) and html_page)):
        return "cloudflare", status
    if status == 200 and '"supported_nips"' in text:
        return "port", status
    return "other", status


def admin_hint(kind, status):
    if kind == "cloudflare":
        return ("Cloudflare turned away a request sent the way Buzz sends moderation requests, with no browser "
                "details. In Cloudflare, check this domain's Security settings, such as Browser Integrity Check, Bot "
                "Fight Mode or a custom rule. Then reload this page.")
    if kind == "port":
        return ("The request reached Buzz without its port, so Buzz took it for the community itself. If this name "
                "runs through Umbrel's Cloudflare Tunnel app, clear the HTTP Host Header in the hostname's settings "
                "there. Then reload this page.")
    if kind == "nothing":
        return ("Nothing answered on port 8443 from this Umbrel. The network it's on may block that port. If "
                "Moderation shows in Buzz on your computer, it works.")
    return ("It answered with HTTP " + str(status) + ". " if status else "") + "Reload this page in a minute to check again."


# The last look at the moderation address, for one relay configuration: the domain and the text of the relay's
# settings. Changing either asks again; so does a save, which clears it. It's asked on page loads alone, never
# by the 5-second refresh, and only once for an answer that works: each look is a line in the relay's log.
ADMIN = {"key": None, "at": 0.0, "value": None}
ADMIN_LOCK = threading.Lock()
ADMIN_RETRY = 30  # seconds before a page load asks again after an answer that didn't work


def forget_admin():
    with ADMIN_LOCK:
        ADMIN.update(key=None, at=0.0, value=None)


def admin_key(domain):
    return domain + "\n" + read_text(RELAY_ENV)


def admin_known(key):
    """The last look's (class, status) for this configuration and its age in seconds, or (None, None)."""
    with ADMIN_LOCK:
        if key is not None and ADMIN["key"] == key and ADMIN["value"] is not None:
            return ADMIN["value"], time.time() - ADMIN["at"]
    return None, None


def admin_item(setup, domain, advertised, key):
    """The checks' row for moderation, on the owner's own domain while its NIP-11 loads, or None."""
    shown = "<code>" + html.escape(admin_origin(domain)) + "</code>"
    if not moderation_on(setup):
        return item("admin", "wait", "Turning off moderation", "Buzz restarts for a few seconds.") if advertised else None
    if advertised != admin_origin(domain):
        return item("admin", "wait", "Turning on moderation", "Buzz restarts for a few seconds.")
    known, _ = admin_known(key)
    if known is None:
        # Not looked at yet in this configuration: the page loads again, and the load looks
        return dict(item("admin", "wait", "Checking moderation at " + shown), due=True)
    if known[0] == "ok":
        return item("admin", "ok", "Moderation is reachable at " + shown)
    return item("admin", "bad", "Moderation isn't reachable at " + shown, admin_hint(*known))


def check(setup, page_load=False):
    """The checks for the saved address, as (live, items). States: ok, wait, bad. A page load also looks at the
    moderation address when it's due."""
    mode = setup["mode"]
    domain = relay_domain() or setup.get("domain") or ""
    # The relay's main port, not its health port: the health and metrics ports listen on every
    # address with no setting to change it yet (block/buzz#8004), and once they can be bound to the
    # relay's own container, this page still works.
    jobs = {"relay": lambda: request(RELAY_HOST, 3000, "/_readiness", headers={"Host": domain} if domain else None)}
    if domain:
        jobs["local_info"] = lambda: request(RELAY_HOST, 3000, "/", headers=dict(NIP11, Host=domain))
    addresses = []
    if domain and mode != "private":
        # the public name, reached at the address the internet sees for it
        addresses = resolves(domain)
        addr = addresses[0] if addresses else None
        jobs["live"] = lambda: request(domain, 443, "/_liveness", tls=True, addr=addr)
        jobs["info"] = lambda: request(domain, 443, "/", tls=True, headers=NIP11, addr=addr)
        jobs["pair"] = lambda: request(domain, 443, "/pair", tls=True, headers=UPGRADE, addr=addr)
    key = admin_key(domain) if mode == "domain" and domain and moderation_on(setup) else None
    known, age = admin_known(key)
    look = key is not None and page_load and (known is None or (known[0] != "ok" and age >= ADMIN_RETRY))
    with concurrent.futures.ThreadPoolExecutor(len(jobs) + 1) as pool:
        futures = {name: pool.submit(job) for name, job in jobs.items()}
        if look:
            # beside the other checks, once the NIP-11 answer says moderation is there
            futures["admin"] = pool.submit(admin_probe, domain, addresses, futures["info"])
        got = {name: future.result() for name, future in futures.items()}
    if got.get("admin") is not None:
        with ADMIN_LOCK:
            ADMIN.update(key=key, at=time.time(), value=admin_answer(*got["admin"]))
    items = []
    # Ready, and serving this address: right after an address change, the relay still running the
    # old one answers readiness but knows no community at the new address until it restarts.
    local_self = relay_self(*got["local_info"]) if domain else ""
    relay_ok = got["relay"][0] == 200 and (bool(local_self) or not domain)
    items.append(item("relay", "ok" if relay_ok else "wait",
                      "Buzz is running on this Umbrel" if relay_ok else
                      "Starting Buzz. The first start takes about a minute." if domain else
                      "Buzz starts once the address is ready"))
    if mode in ("funnel", "private"):
        ts = tailscale_state()
        signed_in = ts["backend"] == "Running"
        items.append(item("tailscale", "ok" if signed_in else "wait",
                          "Signed in to Tailscale as " + html.escape(ts["name"] or "buzz") if signed_in else
                          "Waiting for you to sign in to Tailscale"))
        on = published()
        if mode == "funnel":
            items.append(item("publish", "ok" if on == "funnel" else "wait",
                              "Tailscale Funnel is on, so the address works from the internet" if on == "funnel" else
                              "Waiting for Tailscale Funnel to be on",
                              "" if on == "funnel" or not signed_in else
                              "Tailscale asks you once to allow Funnel, and HTTPS certificates, for this machine. "
                              "Use the button below."))
        else:
            items.append(item("publish", "ok" if on == "private" else "wait",
                              "On your Tailscale network only, with a trusted HTTPS certificate" if on == "private" else
                              "Waiting for the Tailscale address and its HTTPS certificate",
                              "" if on == "private" or not signed_in else
                              "Tailscale may ask you once to allow HTTPS certificates for your network. "
                              "Use the button below."))
    if not domain:
        return False, items
    if mode == "private":
        live = relay_ok and tailscale_state()["backend"] == "Running" and published() == "private"
        items.append(item("device", "wait", "Checking from this device...", ""))
        return live, items
    if not addresses:
        items.append(item("dns", "wait",
                          "The name <code>" + html.escape(domain) + "</code> isn't published yet",
                          "Cloudflare publishes it a few seconds after the tunnel is set up." if mode == "domain" else
                          "Tailscale publishes the name once Funnel is on."))
    status, body = got["live"]
    reach_ok = status == 200 and body.strip() == b"ok"
    public_self = relay_self(*got["info"])
    if reach_ok and local_self and public_self and local_self != public_self:
        items.append(item("reach", "bad", "<code>" + html.escape(domain) + "</code> reaches a different Buzz relay",
                          "The name points to another server, not this Umbrel. Check which tunnel or server it goes to."))
        reach_ok = False
    elif reach_ok:
        items.append(item("reach", "ok", "This Umbrel's Buzz answers at <code>https://" + html.escape(domain) + "</code>"))
    elif addresses:
        items.append(item("reach", "bad" if status else "wait",
                          "Not reachable at <code>https://" + html.escape(domain) + "</code> yet",
                          reach_hint(mode, status, body)))
    pair_ok = got["pair"][0] == 101
    items.append(item("pair", "ok" if pair_ok else "wait",
                      "Phones can pair" if pair_ok else "Phone pairing isn't reachable yet"))
    # Moderation, while the community's NIP-11 loads: the rows above cover the rest
    advertised = advertised_admin(*got["info"])
    if mode == "domain" and reach_ok and advertised is not None:
        row = admin_item(setup, domain, advertised, key)
        if row:
            items.append(row)
    if mode == "domain" and not reach_ok:
        cf = cloudflare_state()["state"]
        if cf == "signin" and upload_waiting():
            cf = "creating"  # signed in with the owner's file, which the tunnel is taking
        trouble = cf in ("taken", "wrong-domain", "error")
        items.insert(1, item("cloudflare", "ok" if cf == "running" else "bad" if trouble else "wait",
                             "This app's Cloudflare tunnel is set up" if cf == "running" else
                             "Cloudflare needs your attention" if trouble else
                             "Signed in to Cloudflare, setting up the tunnel" if cf in ("creating", "routing") else
                             "Waiting for you to sign in to Cloudflare",
                             "See below." if trouble else ""))
    return relay_ok and reach_ok and pair_ok, items


def reach_hint(mode, status, body):
    text = body.decode(errors="replace").lower()
    if mode == "funnel":
        return "Tailscale is still turning Funnel on. This can take a minute after you allow it."
    if status in (530, 1033) or "1033" in text:
        return ("Cloudflare has no connected tunnel for this name yet. This app's tunnel connects a few seconds "
                "after it's set up; with Umbrel's Cloudflare Tunnel app instead, is it running?")
    if status in (502, 503, 504):
        return ("The tunnel runs but can't reach Buzz. In Cloudflare, set the hostname's service to HTTP and "
                "the URL to " + GATEWAY_URL + ".")
    if status == 404 and "no community" in text:
        return ("The name reaches Buzz, but it doesn't match the address saved here. Check that the hostname in "
                "Cloudflare matches it exactly.")
    if status:
        return "The name answered with HTTP " + str(status) + ". Check the hostname and service in Cloudflare."
    if text.startswith("tls"):
        return "The name has no valid HTTPS certificate yet. In Cloudflare, set this name to Proxied."
    return "Nothing answers yet. A new name can take a few minutes to work."


CACHE = {"at": 0.0, "key": None, "value": None}
CACHE_LOCK = threading.Lock()


def cached_check(setup, page_load=False):
    # The tunnel's step too: right after an upload, the page shows the tunnel taking it, not the old wait. And
    # the last look at moderation's address, and whether this is a page load, which may look again.
    with ADMIN_LOCK:
        looked = str(ADMIN["at"])
    key = (json.dumps(setup, sort_keys=True) + relay_domain() + read_text(TAILSCALE_SERVE) + cloudflare_step()
           + looked + ("|page" if page_load else ""))
    with CACHE_LOCK:
        if CACHE["key"] == key and time.time() - CACHE["at"] < 3:
            return CACHE["value"]
    value = check(setup, page_load)
    with CACHE_LOCK:
        CACHE.update(at=time.time(), key=key, value=value)
    return value


# ---------------------------------------------------------------- sign-in


def sign(value):
    return hmac.new(SECRET, value.encode(), hashlib.sha256).hexdigest()


def new_session():
    expires = str(int(time.time()) + SESSION_SECONDS)
    return expires + "." + sign("session|" + expires)


def session_ok(token):
    if not PASSWORD:
        return False  # no sign-in, so no session either, whatever signed the cookie
    try:
        expires, signature = token.split(".", 1)
        return int(expires) > time.time() and hmac.compare_digest(signature, sign("session|" + expires))
    except (ValueError, AttributeError, TypeError):
        return False


FAILURES = {}
FAILURE_LOCK = threading.Lock()


def too_many_failures(ip):
    with FAILURE_LOCK:
        recent = [t for t in FAILURES.get(ip, []) if time.time() - t < 600]
        FAILURES[ip] = recent
        return len(recent) >= 10


def note_failure(ip):
    with FAILURE_LOCK:
        FAILURES.setdefault(ip, []).append(time.time())


# ---------------------------------------------------------------- the page

BEE = (
    '<svg class="bee" viewBox="0 0 466 309" aria-hidden="true"><defs>'
    '<mask id="bee-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="466" height="309">'
    '<circle cx="91.7" cy="154.5" r="91.7" fill="white"/><circle cx="374.3" cy="154.5" r="91.7" fill="white"/>'
    '<rect x="128" y="0" width="210" height="309" rx="34" fill="white"/>'
    '<circle cx="193.3" cy="84.4" r="27" fill="black"/><circle cx="276" cy="84.4" r="27" fill="black"/>'
    '<rect x="166.3" y="157.2" width="136.9" height="38.3" rx="5" fill="black"/>'
    '<rect x="166.9" y="235.1" width="136.2" height="37.6" rx="5" fill="black"/></mask></defs>'
    '<rect width="466" height="309" mask="url(#bee-mask)" fill="currentColor"/></svg>'
)

STYLE = """
:root { --ink: #231e1e; --ink-2: rgb(35 30 30 / 66%); --ink-3: rgb(35 30 30 / 52%); --line: rgb(35 30 30 / 8%);
  --line-2: rgb(35 30 30 / 14%); --accent: #d7d72e; --accent-soft: rgb(215 215 46 / 28%); --chip: #f2f2ee;
  --soft: #f7f7f4; --code: #171513; --bad: #b4233a; --olive: #55550a;
  --sans: "Inter Variable", Inter, "Avenir Next", "Helvetica Neue", "Segoe UI", system-ui, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  --shadow-1: 0 1px 2px rgb(24 20 14 / 4%), 0 6px 22px rgb(24 20 14 / 5%); --ease: cubic-bezier(0.22, 1, 0.36, 1); }
* { box-sizing: border-box; }
body { margin: 0; background: #fff; color: var(--ink); font: 400 16px/1.6 var(--sans); letter-spacing: -0.011em;
  -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration-color: var(--accent); text-decoration-thickness: 2px; text-underline-offset: 3px; }
a:hover { text-decoration-color: var(--ink); }
code { font: 0.86em var(--mono); letter-spacing: 0; background: var(--chip); border-radius: 6px; padding: 0.12em 0.38em; overflow-wrap: anywhere; }
b { font-weight: 600; }
[hidden], html:not(.js) [data-copy] { display: none !important; }
:is(a, button, input, summary):focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; border-radius: 8px; }
.hd { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px clamp(16px, 4vw, 32px);
  border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500; letter-spacing: -0.02em; }
.bee { width: 26px; color: var(--ink); }
.hd form { margin: 0; }
.link { background: none; border: 0; padding: 0; color: var(--ink-2); font: 500 13.5px var(--sans); cursor: pointer;
  text-decoration: underline; text-decoration-color: var(--line-2); text-underline-offset: 3px; }
.link:hover { color: var(--ink); text-decoration-color: var(--ink); }
main { max-width: 700px; margin: 0 auto; padding: 48px clamp(16px, 4vw, 32px) 96px; }
.eyebrow { font: 500 11px var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-2); }
h1 { margin: 10px 0 0; font-weight: 400; font-size: clamp(34px, 6vw, 52px); line-height: 1.02; letter-spacing: -0.05em; }
h1 mark, .hl { background: none; color: inherit; background-image: linear-gradient(var(--accent), var(--accent));
  background-repeat: no-repeat; background-size: 100% 0.32em; background-position: 0 88%; }
h2 { margin: 0; font-weight: 500; font-size: 21px; letter-spacing: -0.025em; }
h3 { margin: 0; font-weight: 500; font-size: 17px; letter-spacing: -0.02em; }
.lede { margin: 18px 0 0; font-size: 18.5px; line-height: 1.5; color: var(--ink-2); max-width: 34em; }
p { margin: 10px 0 0; }
.muted { color: var(--ink-2); }
.small { font-size: 14px; }
.step { position: relative; display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 0 16px; margin-top: 44px; }
.num { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font: 500 13px var(--mono);
  border: 1px solid var(--line-2); color: var(--ink-2); background: #fff; }
.step.on .num { background: var(--accent); border-color: var(--accent); color: var(--ink); }
.step-body > p:first-of-type { margin-top: 6px; }
label.field { display: block; margin-top: 16px; font-size: 14px; font-weight: 500; }
.tag { font: 500 10.5px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-2); margin-left: 6px; }
input[type=text], input[type=password] { width: 100%; margin-top: 7px; padding: 12px 14px; font: 15px var(--mono);
  letter-spacing: 0; color: var(--ink); background: #fff; border: 1px solid var(--line-2); border-radius: 12px; outline: none;
  transition: border-color 0.15s, box-shadow 0.15s; }
input[type=text]:focus, input[type=password]:focus { border-color: var(--ink); box-shadow: 0 0 0 3px rgb(215 215 46 / 45%); }
input[type=file] { display: block; width: 100%; margin-top: 7px; font: 14px var(--sans); color: var(--ink-2); }
input[type=file]::file-selector-button { margin-right: 12px; padding: 7px 14px; border: 1px solid var(--line-2);
  border-radius: 999px; background: #fff; color: var(--ink); font: 500 13.5px var(--sans); cursor: pointer; }
input[type=file]::file-selector-button:hover { border-color: var(--ink); }
.choices { display: grid; gap: 12px; margin-top: 16px; }
.choice { position: relative; display: block; padding: 18px 20px; background: #fff; border: 1px solid var(--line-2);
  border-radius: 18px; box-shadow: var(--shadow-1); cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s, transform 0.3s var(--ease); }
.choice:hover { border-color: rgb(35 30 30 / 28%); }
.choice-head { display: block; cursor: pointer; }
.choice-more { margin-top: 16px; padding-top: 4px; border-top: 1px solid var(--line); }
.choice-more .small { margin-top: 10px; color: var(--ink-2); }
.choice-more details.alt { margin-top: 16px; padding-top: 12px; }
.choice-more > details.alt:first-child { margin-top: 0; padding-top: 10px; border-top: 0; }
.confirm-box { display: flex; gap: 12px; align-items: flex-start; margin-top: 16px; padding: 14px 16px; border-radius: 12px; background: rgb(215 215 46 / 32%); font-size: 14.5px; cursor: pointer; }
.confirm-box input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--ink); flex: none; }
.confirm-box b { font-weight: 500; }
.confirm-box + .btn { margin-top: 18px; }
.choice-head input { position: absolute; opacity: 0; pointer-events: none; }
.choice:has(input:checked) { border-color: #bdbd1f; box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow-1); }
.choice:has(input:focus-visible) { outline: 2px solid var(--ink); outline-offset: 3px; }
.choice .kicker { display: flex; justify-content: space-between; align-items: center; gap: 10px; font: 600 13px var(--sans);
  color: var(--ink); }
.choice .kicker .badge { margin-left: 8px; padding: 2px 9px; border-radius: 999px; background: var(--accent); font-size: 11.5px; }
.choice .pick { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--line-2); flex: none; }
.choice:has(input:checked) .pick { border: 5px solid var(--ink); }
.choice h3 { margin-top: 6px; font-size: 19px; }
.choice p { margin-top: 4px; font-size: 14.5px; color: var(--ink-2); }
.choice .needs { margin-top: 10px; font-size: 13px; color: var(--ink-2); }
.choice .needs b { font: 600 13px var(--sans); color: var(--ink); margin-right: 6px; }
.panel { margin-top: 14px; padding: 16px 18px; background: var(--soft); border: 1px solid var(--line); border-radius: 14px; font-size: 14.5px; }
.panel p:first-child { margin-top: 0; }
.panel ul { margin: 8px 0 0; padding-left: 18px; color: var(--ink-2); }
.panel li { margin: 4px 0; }
.opts { margin-top: 14px; border: 1px solid var(--line-2); border-radius: 12px; overflow: hidden; background: #fff; }
.opt { display: flex; align-items: center; gap: 12px; padding: 11px 14px; cursor: pointer; }
.opt + .opt { border-top: 1px solid var(--line); }
.opt input { width: 16px; height: 16px; margin: 0; accent-color: var(--ink); flex: none; }
.opt span { flex: 1; min-width: 0; }
.opt b { display: block; font-size: 15px; font-weight: 500; }
.opt small { display: block; font-size: 13px; color: var(--ink-2); }
.opt em { font: 500 10.5px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; font-style: normal; color: var(--ink-2); }
.opt:has(input:checked) { background: rgb(215 215 46 / 16%); }
.opt:has(input:disabled) { cursor: default; }
.opt:has(input:disabled) :is(b, small) { color: var(--ink-3); }
.split { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.split input { flex: 1 1 auto; width: auto; min-width: 0; margin: 0; }
.split input[name=subdomain] { flex: 0 0 28%; }
.split span { font-size: 20px; color: var(--ink-2); }
.heads-up { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: rgb(215 215 46 / 32%); font-size: 13.5px; color: var(--ink); }
.check { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; font-size: 15px; cursor: pointer; }
.check input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: var(--ink); flex: none; }
.btn { display: inline-flex; align-items: center; gap: 9px; margin-top: 22px; padding: 12px 22px; border-radius: 999px;
  border: 1px solid var(--ink); background: var(--ink); color: #fff; font: 500 15px var(--sans); letter-spacing: -0.01em;
  text-decoration: none; cursor: pointer; transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease); }
.btn:hover { transform: translateY(-1px); box-shadow: 0 0 0 4px var(--accent-soft); }
.btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; box-shadow: none; }
.btn.ghost { background: #fff; color: var(--ink); border-color: var(--line-2); }
.btn.small { margin-top: 12px; padding: 8px 16px; font-size: 14px; }
.error { margin-top: 18px; padding: 12px 16px; border: 1px solid rgb(180 35 58 / 30%); background: rgb(180 35 58 / 5%);
  border-radius: 12px; color: var(--bad); font-size: 15px; }
.status { list-style: none; margin: 18px 0 0; padding: 0; border-top: 1px solid var(--line); }
.status li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 2px 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.status .icon { width: 20px; height: 20px; margin-top: 1px; border-radius: 50%; display: grid; place-items: center; }
.status .ok .icon { background: var(--accent); }
.status .ok .icon::after { content: ""; width: 8px; height: 4px; border-left: 1.8px solid var(--ink); border-bottom: 1.8px solid var(--ink);
  transform: translateY(-1px) rotate(-45deg); }
.status .wait .icon { border: 2px solid var(--line-2); border-top-color: var(--ink-2); animation: spin 1s linear infinite; }
.status .bad .icon { background: rgb(180 35 58 / 12%); }
.status .bad .icon::after { content: "!"; content: "!" / ""; font: 700 12px var(--sans); color: var(--bad); }
.status .hint { grid-column: 2; font-size: 14px; color: var(--ink-2); }
.status .bad .hint { color: var(--ink); }
.vh { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.ck-card { margin-top: 12px; }
.ck-card.ck-alert, .ck-box.ck-alert { border-color: rgb(180 35 58 / 30%); }
.ck-top { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 6px 12px; padding: 14px 16px; }
.ck-top + .ck-top, .ck-top + .ck-all { border-top: 1px solid var(--line); }
.ck-top.bad { background: rgb(180 35 58 / 5%); }
.ck-top .icon { width: 20px; height: 20px; margin-top: 1px; border-radius: 50%; display: grid; place-items: center; }
.ck-top.bad .icon { background: rgb(180 35 58 / 12%); }
.ck-top.bad .icon::after { content: "!"; content: "!" / ""; font: 700 12px var(--sans); color: var(--bad); }
.ck-top.wait .icon { border: 2px solid var(--line-2); border-top-color: var(--ink-2); animation: spin 1s linear infinite; }
.ck-top .text { font-size: 15px; font-weight: 500; }
.ck-top.wait .text { font-weight: 400; }
.ck-top .hint { grid-column: 2; font-size: 14px; line-height: 1.5; color: var(--ink); }
.ck-top.wait .hint { color: var(--ink-2); }
.ck-top .hint:empty { display: none; }
.ck-ico { display: grid; place-items: center; flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: var(--ink); font-size: 12px; }
.ck-ico .tb-i { stroke-width: 2.6; }
.ck-all .status { margin-top: 0; }
.ck-box { margin-top: 18px; }
.bar { display: grid; grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr)); gap: 14px 8px; margin: 28px 0 0; padding: 0; list-style: none; }
.bar > li { min-width: 0; }
.bar .tr { display: block; height: 5px; border-radius: 999px; background: var(--line-2); }
.bar .done .tr { background: var(--accent); }
.bar .you .tr { background: linear-gradient(90deg, var(--ink) 0 40%, var(--line-2) 40% 100%); }
.bar .work .tr { background: linear-gradient(90deg, var(--ink-3) 0 40%, var(--line-2) 40% 100%); }
.bar .bad .tr { background: var(--bad); }
.bar .lb { display: flex; align-items: flex-start; gap: 6px; margin-top: 10px; font-size: 13.5px; line-height: 1.35; color: var(--ink-2); }
.bar .lb > span { min-width: 0; }
.bar :is(.done, .work, .bad) .lb { color: var(--ink); }
.bar .you .lb { flex-wrap: wrap; align-items: center; gap: 6px 8px; color: var(--ink); font-weight: 500; }
.bar .lb .tb-i { margin-top: 2px; font-size: 14px; stroke-width: 2.4; }
.bar .lb em { padding: 2px 7px; border-radius: 999px; background: var(--ink); color: #fff; font: 500 10px var(--mono); letter-spacing: 0.08em; }
.bar .lb i { flex: none; width: 12px; height: 12px; margin-top: 3px; border: 1.5px solid var(--line-2); border-top-color: var(--ink-2); border-radius: 50%; animation: spin 1s linear infinite; }
.bar .lb b { flex: none; display: grid; place-items: center; width: 14px; height: 14px; margin-top: 2px; border-radius: 50%; background: rgb(180 35 58 / 12%); color: var(--bad); font: 700 9.5px var(--sans); }
@media (max-width: 560px) { .bar { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .status .wait .icon, .ck-top.wait .icon, .bar .lb i { animation: none; } * { transition: none !important; } }
.address { display: flex; gap: 8px; align-items: center; margin-top: 16px; padding: 8px 8px 8px 16px; border: 1px solid var(--line-2);
  border-radius: 14px; background: #fff; box-shadow: var(--shadow-1); }
.address code { flex: 1; min-width: 0; padding: 0; background: none; font-size: 15px; }
.address code span { background: rgb(215 215 46 / 45%); border-radius: 3px; padding: 0 2px; }
.address .btn { margin: 0; padding: 8px 16px; font-size: 14px; }
ol.do { margin: 12px 0 0; padding: 0; list-style: none; counter-reset: do; }
ol.do > li { position: relative; padding: 0 0 0 34px; margin-top: 14px; counter-increment: do; }
ol.do > li::before { content: counter(do); position: absolute; left: 0; top: 1px; width: 22px; height: 22px; border-radius: 50%;
  display: grid; place-items: center; background: var(--chip); font: 500 11.5px var(--mono); color: var(--ink-2); }
section.part { margin-top: 44px; padding-top: 28px; border-top: 1px solid var(--line); }
details { margin-top: 14px; }
details > summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 500; }
details > summary::-webkit-details-marker { display: none; }
details > summary::before { content: ""; width: 6px; height: 6px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg); transition: transform 0.2s var(--ease); }
details[open] > summary::before { transform: rotate(45deg); }
details .inner { margin-top: 8px; padding-left: 14px; }
.cards { display: grid; gap: 12px; margin-top: 16px; }
.card { padding: 18px 20px; border: 1px solid var(--line-2); border-radius: 18px; background: #fff; }
.card p { font-size: 14.5px; color: var(--ink-2); }
.foot { margin-top: 56px; font-size: 13px; color: var(--ink-2); }
dl.values { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 16px; align-items: center; margin: 10px 0 0;
  padding: 12px 14px; background: var(--soft); border: 1px solid var(--line); border-radius: 12px; font-size: 14px; }
dl.values dt { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-2); }
dl.values dd { margin: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.copy-mini { padding: 3px 9px; border: 1px solid var(--line-2); border-radius: 999px; background: #fff; cursor: pointer;
  font: 500 11px var(--mono); color: var(--ink-2); }
.copy-mini:hover { border-color: var(--ink); color: var(--ink); }
"""

# Buzz's drawn screens and the live page's guide. The stepper's count, title and buttons line up on the title's first
# line, the buttons at the top of their row: on a phone a drawing's title can wrap to more lines than the next one's,
# and buttons centered on it would move.
HOW_STYLE = """
details.how { margin-top: 12px; }
details.alt { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--line); }
details.alt > summary { font-size: 14px; color: var(--ink-2); }
details.how > summary { padding: 6px 13px 6px 11px; border: 1px solid var(--line-2); border-radius: 999px; background: #fff; font-size: 13.5px; color: var(--ink); }
details.how > summary:hover { border-color: var(--ink); }
details.how[open] > summary { background: var(--chip); }
.note { margin-top: 12px; font-size: 14px; color: var(--ink-2); }
.next { --w: calc(min(1000px, 100vw) - 2 * clamp(16px, 4vw, 32px)); width: var(--w); margin: 52px 0 0 calc((100% - var(--w)) / 2); }
.guide { display: grid; grid-template-columns: minmax(0, 1fr); margin-top: 14px; border: 1px solid var(--line-2); border-radius: 22px; background: #fff; box-shadow: var(--shadow-1); overflow: hidden; }
.g-nav { display: flex; flex-direction: column; gap: 4px; padding: 12px; border-bottom: 1px solid var(--line); }
@media (min-width: 880px) { .guide { grid-template-columns: 250px minmax(0, 1fr); } .g-nav { border-bottom: 0; border-right: 1px solid var(--line); } }
.g-nav a { display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 10px; border-radius: 14px; color: var(--ink); text-decoration: none; }
.g-nav a:hover { background: var(--soft); }
.g-nav a[aria-current] { background: var(--chip); }
.g-nav a:focus-visible { border-radius: 14px; outline-offset: 0; }
.g-tile { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 11px; background: var(--chip); font-size: 18px; }
.g-nav a[aria-current] .g-tile { background: var(--accent); }
.g-out .g-tile { border: 1px solid var(--line-2); background: #fff; }
.g-txt { min-width: 0; }
.g-txt b { display: block; font-size: 15px; font-weight: 500; line-height: 1.3; }
.g-txt small { display: block; margin-top: 2px; font-size: 13px; line-height: 1.35; color: var(--ink-2); }
.g-out > .tb-i { margin-left: auto; font-size: 16px; color: var(--ink-2); }
.g-nav .g-further { margin: 16px 10px 4px; padding-top: 14px; border-top: 1px solid var(--line); }
.g-pane { padding: 26px 28px 28px; scroll-margin-top: 48px; }
.g-pane + .g-pane { border-top: 1px solid var(--line); }
.g-pane > .eyebrow { margin: 0; }
.g-pane h2 { margin-top: 8px; font-size: 28px; font-weight: 400; letter-spacing: -0.04em; line-height: 1.15; }
.g-pane h2:focus { outline: none; }
.g-pane > .muted { margin-top: 8px; }
.g-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 18px; }
.g-acts .btn { margin-top: 0; }
.g-frame { margin-top: 22px; }
.g-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.g-n { flex: none; font: 500 12px var(--mono); letter-spacing: 0.04em; white-space: nowrap; color: var(--ink-2); }
.g-t { min-width: 0; font-size: 15px; font-weight: 500; }
.g-btns { display: none; gap: 8px; margin-left: auto; }
.g-btns button { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid var(--line-2); border-radius: 50%; background: #fff; color: var(--ink); font-size: 17px; cursor: pointer; }
.g-btns button:hover { border-color: var(--ink); }
.g-btns button[aria-disabled="true"] { cursor: default; border-color: var(--line-2); }
.g-btns button[aria-disabled="true"] .tb-i { opacity: 0.35; }
.g-btns button:focus-visible { border-radius: 50%; }
.g-frame > .g-cap { margin-top: 6px; }
.g-more { margin-top: 10px; }
.g-more > summary { font-size: 14px; font-weight: 400; color: var(--ink-2); }
.g-more p { margin-top: 6px; font-size: 14px; color: var(--ink-2); }
.g-foot { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.g-foot > p { margin-top: 0; }
.g-notes { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
.g-notes li { display: flex; align-items: flex-start; gap: 12px; }
.g-ni { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 9px; background: var(--chip); font-size: 16px; }
.g-notes p { min-width: 0; margin: 3px 0 0; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
.g-notes b { font-weight: 500; color: var(--ink); }
.mod-notes { margin: 14px 0 16px; }
.g-foot > .g-notes + p { margin-top: 16px; }
.g-pane > .panel { margin-top: 18px; }
@media (max-width: 560px) { .g-pane { padding: 22px 16px 24px; } }
.js .g-btns { display: flex; }
.js .g-row { align-items: flex-start; }
.js .g-n { display: flex; align-items: center; min-height: 44px; }
.js .g-t { padding-top: 10px; }
.js .g-pane + .g-pane { border-top: 0; }
[data-step="join"] .guide:not(.ready) .g-pane:not(#join), [data-step="invite"] .guide:not(.ready) .g-pane:not(#invite),
[data-step="safe"] .guide:not(.ready) .g-pane:not(#safe), [data-step="phone"] .guide:not(.ready) .g-pane:not(#phone),
.js:not([data-frame="2"]) .guide:not(.ready) .g-frame:not(:first-child),
[data-frame="2"] .guide:not(.ready) .g-frame:not(:nth-child(2)) { display: none; }
@media (forced-colors: active) { .g-nav a[aria-current] { border: 2px solid CanvasText; padding: 8px 10px 8px 8px; } }
.set-card { margin-top: 14px; border: 1px solid var(--line-2); border-radius: 14px; background: #fff; overflow: hidden; }
.set-card details { margin: 0; }
.set-card details + details { border-top: 1px solid var(--line); }
.set-card details > summary { display: flex; box-sizing: border-box; width: 100%; gap: 12px; padding: 14px 16px; }
.set-card summary:focus-visible { outline-offset: -3px; border-radius: 12px; }
.set-card details > summary::before { display: none; }
.set-card details > summary::after { content: ""; flex: none; width: 6px; height: 6px; margin: 0 2px 0 4px; border-right: 1.5px solid var(--ink-3); border-bottom: 1.5px solid var(--ink-3); transform: rotate(-45deg); }
.set-card details[open] > summary::after { transform: rotate(45deg); }
.set-card summary .val { margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 13px var(--mono); color: var(--ink-2); }
.set-card summary .val.word { font: 400 14px var(--sans); }
.ck-all > summary .val { flex: none; }
.set-card .inner { margin: 0; padding: 0 16px 18px; }
.how-b { margin-top: 12px; }
.how-b > p { margin: 0; font-size: 14px; color: var(--ink-2); }
.how-tabs { display: none; flex-wrap: wrap; gap: 6px; margin: 14px 0 10px; }
.how.js .how-tabs { display: flex; }
.how-tabs button { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px 5px 5px; border: 1px solid var(--line-2); border-radius: 999px; background: #fff; cursor: pointer; font: 500 13px var(--sans); color: var(--ink-2); }
.how-tabs button span { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--chip); font-size: 11.5px; }
.how-tabs button[aria-selected="true"] { border-color: var(--ink); color: var(--ink); }
.how-tabs button[aria-selected="true"] span { background: var(--accent); }
.how-step { margin-top: 14px; }
.how.js .how-tabs ~ .how-step { margin-top: 0; }
.how-step > p { margin: 10px 0 0; font-size: 14px; color: var(--ink-2); }
.how-step > p b { color: var(--ink); font-weight: 500; }
.mb { --b1-base: #f5f5f6; --b1-line: #e8e8e8; --b1-citrus: #beda36; }
.mb-modal-h b, .mb-dlg-h b {font-weight: 500; }
.mb-nav-col .mb-nav-host {margin-bottom: 4px; padding-right: 0; }
.mb-nav-host span {flex: none; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 5px; background: #f0f0f0; font-size: 8.5px; font-weight: 600; }
.mb-nav-host em {min-width: 0; overflow: hidden; text-overflow: ellipsis; font-style: normal; }
.mb-btn.dark {background: #0f0f0f; color: #fff; }
.mb-canvas .mb-tabs {display: flex; gap: 14px; margin-top: 12px; font-size: 11.5px; color: #5f5f5f; }
.mb-tabs span {padding: 3px 1px 5px; }
.mb-tabs .on {color: #0f0f0f; box-shadow: inset 0 -2px #0f0f0f; }
.mb-tabs .hot {margin: 0 -5px; padding-inline: 6px; border-radius: 8px; }
.mb-canvas .mb-search {display: flex; align-items: center; gap: 6px; margin-top: 12px; padding: 5px 10px; border-radius: 999px; background: #f3f3f4; font-size: 10.5px; color: #6b6b6b; }
.mb-canvas .mb-cap {margin-top: 12px; font-size: 10px; color: #5f5f5f; }
.mb-row {display: flex; align-items: center; gap: 8px; padding: 5px 0; }
.mb-who {flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 400; white-space: nowrap; }
.mb-who .tb-i {font-size: 11px; color: #b7791f; }
.mb-row > small {font-size: 10px; color: #5f5f5f; white-space: nowrap; }
.mb-shade.on-modal {z-index: 3; }
.mb-dlg {position: absolute; top: 50%; left: 50%; z-index: 4; width: 330px; padding: 14px 16px 12px; transform: translate(-50%, -50%); border-radius: 18px; background: #fff; box-shadow: 0 18px 50px rgb(0 0 0 / 25%); }
.mb-dlg-h {display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
.mb-line {display: flex; align-items: center; gap: 6px; margin: 5px 0 2px; }
.mb-in {flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 11px; border-radius: 999px; background: #f3f3f4; font-size: 10.5px; }
.mb-in > span:first-child {flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mb-in .mono {font: 10px var(--mono); }
.mb-choice {display: inline-flex; align-items: center; gap: 3px; padding: 0 4px; font-size: 10.5px; white-space: nowrap; }
.mb-inv {display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 18px; align-items: center; margin-top: 16px; }
.mb-inv-qr {padding: 7px; border-radius: 12px; background: #fff; box-shadow: 0 0 0 1px #e6e6e6; }
.mb-inv .mb-line {margin: 0; }
.mb-inv .mb-in {padding: 4px 4px 4px 11px; }
.mb-copy {padding: 3px 8px; border-radius: 999px; background: #fff; font-size: 10.5px; font-weight: 500; white-space: nowrap; }
.mb-group {margin-top: 9px; padding: 0 11px; border: 1px solid #e8e8e8; border-radius: 13px; }
.mb-canvas .mb-group p {display: flex; align-items: center; justify-content: space-between; padding: 7px 0; font-size: 10.5px; }
.mb-group p + p {border-top: 1px solid #e8e8e8; }
.mb-group .mb-choice {padding-right: 0; }
.mb .id-pair {padding: 9px 18px; }
.id-pair-b {display: grid; grid-template-columns: 116px minmax(0, 1fr); gap: 14px; align-items: center; margin-top: 10px; }
.id-pair-code {padding: 8px; border-radius: 12px; background: #fff; box-shadow: 0 0 0 1px #e6e6e6; }
.id-pair-code + .mb-btn {display: flex; justify-content: center; margin-top: 8px; }
.id-qr {display: block; width: 100%; fill: #0f0f0f; }
.id-verify {display: flex; flex-direction: column; gap: 7px; }
.id-verify > b {font-size: 11px; font-weight: 500; }
.id-digits {padding: 9px 0; border-radius: 10px; box-shadow: 0 0 0 1px #e3e3e5; font: 600 15px var(--mono); letter-spacing: 0.12em; text-align: center; }
.id-verify .mb-btn {justify-content: center; }
.id-pair ol {display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
.id-pair li {display: flex; gap: 8px; }
.id-pair li > span {flex: none; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: #f0f0f1; font-size: 10px; font-weight: 600; }
.id-pair li > span.done {background: #e2f2e7; color: #2f9e57; }
.id-pair li b {display: block; font-size: 11px; font-weight: 500; }
.mb-canvas .id-pair li p {font-size: 9.5px; color: #5f5f5f; }
.mb-av i {display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #f0f0f1; font: 500 9.5px var(--sans); font-style: normal; color: #2b2b2b; }
.mb-pmenu.sw-menu {bottom: 44px; }
.jn-go {display: flex; justify-content: flex-end; margin-top: 10px; }
.tb-i {width: 1em; height: 1em; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.mb-stage {--s: 1; position: relative; height: calc(340px * var(--s)); overflow: hidden; border-radius: 16px; background: #ecece8; }
.mb-canvas {position: absolute; top: 0; left: calc(50% - 280px * var(--s)); width: 560px; height: 340px; overflow: hidden; transform: scale(var(--s)); transform-origin: 0 0; color: #0f0f0f; font-size: 11px; line-height: 1.35; text-align: left; }
.mb { container-type: inline-size; }
@container (max-width: 559.98px) { .mb-stage { --s: 0.9; } }
@container (max-width: 503.98px) { .mb-stage { --s: 0.8; } }
@container (max-width: 447.98px) { .mb-stage { --s: 0.7; } }
@container (max-width: 391.98px) { .mb-stage { --s: 0.6; } }
@container (max-width: 335.98px) { .mb-stage { --s: 0.5; } }
@container (max-width: 279.98px) { .mb-stage { --s: 0.4; } }
.mb-canvas p {margin: 0; }
.mb-app {position: absolute; inset: 14px 18px; overflow: hidden; border-radius: 14px; background: var(--b1-base); box-shadow: 0 0 0 1px #e3e3e5, 0 10px 30px rgb(24 20 14 / 10%); }
.mb-head {display: flex; align-items: center; justify-content: center; height: 34px; }
.mb-hist {position: absolute; top: 10px; left: 13px; display: flex; gap: 9px; font-size: 13px; color: #b0b0b0; }
.mb-hist i {display: flex; color: #5f5f5f; }
.mb-find {display: flex; align-items: center; gap: 6px; width: 196px; padding: 4px 10px; border-radius: 999px; background: #fff; box-shadow: 0 0 0 1px var(--b1-line); font-size: 10.5px; color: #6b6b6b; }
.mb-dock {position: absolute; top: 34px; bottom: 0; left: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 46px; padding: 2px 0 10px; }
.mb-tile {display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; font-size: 15px; color: #5f5f5f; }
.mb-tile.on {background: #e4e4e6; color: #0f0f0f; }
.mb-foot {display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: auto; }
.mb-comm {display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px var(--b1-line); font-size: 16px; color: #2b2b2b; }
.mb-me {position: relative; width: 26px; height: 26px; border-radius: 50%; }
.mb-panel {position: absolute; inset: 34px 7px 7px 46px; display: flex; overflow: hidden; border-radius: 12px; background: #fff; box-shadow: 0 0 0 1px var(--b1-line); }
.mb-side {flex: none; width: 126px; padding: 10px; border-right: 1px solid #efefef; }
.mb-seg {display: flex; gap: 2px; margin-bottom: 4px; padding: 2px; border-radius: 999px; background: #f1f1f2; font-size: 9.5px; color: #5f5f5f; }
.mb-seg i {flex: 1; padding: 2px 0; border-radius: 999px; font-style: normal; text-align: center; }
.mb-seg i.on {background: #fff; color: #0f0f0f; box-shadow: 0 0 0 1px #e6e6e6; }
.mb-bar {display: block; width: 190px; height: 8px; border-radius: 4px; background: #f1f1f2; }
.mb-bar.short {width: 130px; }
.mb-side .mb-bar {width: 80%; margin-top: 12px; }
.mb-side .mb-bar.short {width: 55%; }
.mb-main {flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-width: 0; padding-bottom: 6px; }
.mb-plug {display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 4px; border-radius: 12px; background: #f3f3f4; font-size: 18px; }
.mb-main > p {font-size: 13px; font-weight: 500; }
.mb-main .mb-btn {margin-top: 6px; }
.mb-pmenu {position: absolute; bottom: 10px; left: 52px; z-index: 2; width: 190px; padding: 8px; border-radius: 16px; background: #fff; box-shadow: 0 0 0 1px #e8e8e8, 0 12px 32px rgb(0 0 0 / 14%); font-size: 12px; }
.mb-pm-head {display: flex; align-items: center; gap: 10px; padding: 6px 6px 10px; }
.mb-pm-av {position: relative; width: 34px; height: 34px; }
.mb-pm-head b {display: block; font-size: 13px; font-weight: 500; }
.mb-pmenu p {display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 10px; }
.mb-pmenu .tb-i {font-size: 14px; color: #404040; }
.mb-pm-more {display: flex; margin-left: auto; }
.mb-pmenu hr {margin: 6px 4px; border: 0; border-top: 1px solid #ececec; }
.mb-pmenu p.sel {background: #f1f1f2; }
.mb-pmenu p.on {border-radius: 999px; background: var(--b1-citrus); }
.mb-shade {position: absolute; inset: 0; background: rgb(15 15 15 / 28%); }
.mb-modal {position: absolute; inset: 7px 16px; display: flex; flex-direction: column; overflow: hidden; border-radius: 18px; background: #fff; box-shadow: 0 16px 48px rgb(0 0 0 / 22%); }
.mb-modal-h {display: flex; align-items: center; justify-content: space-between; padding: 9px 12px 9px 16px; border-bottom: 1px solid #ececec; font-size: 13px; }
.mb-modal-h b {font-weight: 500; }
.mb-x {display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #f3f3f4; font-size: 12px; color: #404040; }
.mb-modal-b {position: relative; flex: 1; display: grid; grid-template-columns: 148px minmax(0, 1fr); min-height: 0; }
.mb-nav-col {padding: 10px 8px; overflow: hidden; border-right: 1px solid #ececec; -webkit-mask-image: linear-gradient(#000 76%, transparent); mask-image: linear-gradient(#000 76%, transparent); }
.mb-nav-col p {display: flex; align-items: center; gap: 7px; padding: 3px 9px; border-radius: 999px; font-size: 11px; color: #2b2b2b; white-space: nowrap; }
.mb-nav-col .tb-i {font-size: 12.5px; }
.mb-nav-col .mb-nav-g {margin-top: 8px; color: #5f5f5f; }
.mb-nav-col .mb-nav-i.on {background: var(--b1-citrus); }
.mb-page {position: relative; padding: 14px 22px; overflow: hidden; }
.mb h5 {margin: 0; font-size: 13px; font-weight: 500; }
.mb-canvas .mb-sub {margin-top: 2px; font-size: 10.5px; color: #5f5f5f; }
.mb-btn {display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 999px; background: #f0f0f1; font-size: 11px; font-weight: 500; color: #0f0f0f; white-space: nowrap; }
.mb h6 {margin: 8px 0 4px; font-size: 12.5px; font-weight: 500; }
.mb .hot {box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--b1-citrus); }
.mb .id-me {display: grid; place-items: center; border-radius: 50%; background: #f0f0f1; color: #5f5f5f; }
.mb .id-me .tb-i {font-size: 13px; }
.mb .id-page {padding: 9px 18px; }
.id-page .mb-sub {margin-bottom: 2px; }
.id-badge {position: relative; display: grid; place-items: center; height: 222px; margin-top: 8px; border: 1px solid #ececec; border-radius: 14px; }
.id-more {position: absolute; top: 8px; left: 8px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #f0f0f1; font-size: 13px; color: #404040; }
.id-card {position: relative; display: flex; flex-direction: column; width: 176px; height: 208px; overflow: hidden; border: 1px solid #e3e3e5; border-radius: 12px; background: #f6f6f7; }
.id-slot {position: absolute; top: 7px; left: calc(50% - 13px); z-index: 1; width: 26px; height: 5px; border-radius: 999px; background: #fff; box-shadow: inset 0 0 0 1px #e3e3e5; }
.id-photo {position: relative; flex: none; height: 108px; overflow: hidden; background: radial-gradient(ellipse at 20% 25%, rgb(190 218 54 / 12%), transparent 70%), radial-gradient(ellipse at 80% 75%, rgb(190 218 54 / 18%), transparent 75%), #efeff0; }
.id-mono {position: absolute; inset: 0; display: grid; place-items: center; padding-top: 18px; font: 800 84px/1 var(--sans); color: #dcdcde; }
.id-top {position: relative; display: flex; align-items: center; justify-content: space-between; padding: 20px 10px 0; }
.id-top b {font-size: 12px; font-weight: 700; }
.id-key {flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 4px 8px 6px; }
.id-key small {font-size: 7.5px; letter-spacing: 0.06em; color: #6b6b6b; }
.id-bar {display: block; width: 100%; height: 30px; border-radius: 5px; background: #1c1c1c; fill: #f3f3f4; }
.id-npub {display: flex; align-items: center; gap: 5px; }
.mb .id-npub code {padding: 0; background: none; font: 9.5px var(--mono); color: #0f0f0f; white-space: nowrap; }
.id-copy {display: grid; place-items: center; width: 16px; height: 16px; border-radius: 5px; background: #fff; font-size: 10px; }
.id-toast {position: absolute; right: 8px; bottom: 3px; z-index: 1; display: flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 12px; background: #fff; box-shadow: 0 0 0 1px #e8e8e8, 0 10px 28px rgb(0 0 0 / 14%); font-size: 11px; font-weight: 500; }
.id-toast .tb-i {color: #2f9e57; }
.hw-page { position: absolute; inset: 18px 44px 0; padding: 16px 22px; border-radius: 14px 14px 0 0; background: #fff; box-shadow: 0 0 0 1px #e3e3e5, 0 10px 30px rgb(24 20 14 / 10%); }
.mb .hw-brand { font-size: 10.5px; font-weight: 600; letter-spacing: -0.01em; }
.mb .hw-page h6 { margin: 18px 0 0; font-size: 24px; font-weight: 400; letter-spacing: -0.03em; }
.hw-step { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 0 12px; margin-top: 22px; }
.hw-num { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #d7d72e; font-size: 11px; font-weight: 500; }
.hw-h { display: block; margin-top: 2px; font-size: 14px; font-weight: 500; }
.mb .hw-label { margin-top: 14px; font-size: 11px; font-weight: 500; }
.hw-input { display: flex; align-items: center; margin-top: 6px; padding: 9px 12px; border: 1px solid #231e1e; border-radius: 10px; box-shadow: 0 0 0 3px rgb(215 215 46 / 45%); font: 12px var(--mono); }
.hw-input i { width: 1px; height: 14px; margin-left: 1px; background: #231e1e; }
.hw-input em { margin-left: auto; padding: 2px 8px; border-radius: 999px; background: #eef5d0; font: normal 500 10px var(--sans); color: #55550a; }
"""

# The safety step's two drawings, as the self-hosting guide draws them (site/src/styles/overhaul.css on main), each
# rule inside .sq so none reaches the rest of the page. The page's own colors stand in for the guide's: --soft for its
# canvas, and --ink-2 for its fainter text too, which keeps small text at 4.5:1; --ink-3 is for a mark that isn't
# text. The guide changes to the tall drawing on screens under 520 pixels, where its drawing is under 480 wide; here
# the drawing's own width decides, so it works in the guide's pane, beside the steps or under them. The tall drawing
# grows to 360 pixels wide at most, near its own 340, with its labels at its scale. Each drawing is at least as tall as
# Buzz's screens in the other steps, and the step's two drawings are one height, so the stepper stays put between
# them: on a computer 340 pixels, and narrower the tall drawing's height with its labels (348 for 340 wide, and the
# rest of the box, with room for other fonts), or what the lists need on the smallest phones. At a phone's width the
# lists tighten and long words break before they leave their box. In forced colors a drawing keeps its own, on its
# own light ground: forced, its SVG text could take the color of the shapes behind it. Only the live page, which has
# the step, gets these rules.
SAFE_STYLE = """
.sq { container: sq / inline-size; }
.sq svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.sq ul { margin: 0; padding: 0; list-style: none; }
.sq .sq-fig { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: max(306px, min(340px, 100cqw * 340 / 560)); margin: 0; padding: 16px 16px 18px; border-radius: 22px; background-color: var(--soft); background-image: radial-gradient(circle, rgb(35 30 30 / 7%) 1px, transparent 1px); background-size: 18px 18px; }
.sq .sq-k { display: flex; align-items: center; gap: 9px; margin: 2px 4px 0; font: 600 10.5px var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-2); }
.sq .sq-k i { flex: none; width: 20px; height: 11px; border: 1.3px dashed #a9a917; border-radius: 3px; background: rgb(215 215 46 / 30%); transform: skewX(-24deg); }
.sq .sq-rec { position: absolute; top: 14px; right: 16px; padding: 3px 10px; border-radius: 999px; background: var(--ink); font: 600 9.5px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
.sq .sq-stage, .sq .sq-lists { width: 100%; max-width: 600px; margin: auto; }
.sq .sq-iso { display: block; width: 100%; height: auto; overflow: visible; }
.sq .sq-tall { display: none; max-width: 360px; margin-inline: auto; }
.sq .sq-b polygon { stroke: rgb(35 30 30 / 38%); stroke-width: 1.5; stroke-linejoin: round; }
.sq .sq-floor { fill: rgb(35 30 30 / 3.5%); stroke: rgb(35 30 30 / 34%); stroke-width: 1.3; stroke-dasharray: 5 5; }
.sq .sq-floor.open { fill: rgb(215 215 46 / 22%); stroke: #a9a917; }
.sq .sq-shadow { fill: rgb(35 30 30 / 13%); stroke: none; }
.sq .sq-badge rect { fill: #fff; stroke: rgb(35 30 30 / 55%); stroke-width: 1.4; }
.sq .sq-badge.pub rect { fill: var(--accent); stroke: #8c8c12; }
.sq .sq-badge g { stroke: var(--ink); stroke-width: 2.1; }
.sq .sq-led { fill: #a9a917; stroke: none; }
.sq .sq-slot { stroke: rgb(35 30 30 / 34%); stroke-width: 1.6; }
.sq .sq-bar { stroke: rgb(35 30 30 / 50%); stroke-width: 1.6; stroke-dasharray: 2 6; }
.sq .sq-no circle { fill: var(--ink); stroke: var(--soft); stroke-width: 2.5; }
.sq .sq-no path { stroke: #fff; stroke-width: 2.2; }
.sq .sq-wire { stroke: var(--ink); stroke-width: 1.6; }
.sq .sq-dot { fill: var(--ink); stroke: none; }
.sq .sq-iso text { stroke: none; }
.sq .sq-note { fill: var(--ink-2); font: 500 11px var(--mono); letter-spacing: 0.02em; text-anchor: middle; }
.sq .sq-win { filter: drop-shadow(0 7px 10px rgb(24 20 14 / 9%)); }
.sq .sq-w-body { fill: #f1f1f2; stroke: #d6d6d9; stroke-width: 1; }
.sq .sq-w-light { fill: #d5d5d8; stroke: none; }
.sq .sq-w-panel { fill: #fff; stroke: #e6e6e8; stroke-width: 1; }
.sq .sq-w-ring { fill: #fff; stroke: none; }
.sq .sq-w-pill { fill: #f1f1f2; stroke: none; }
.sq .sq-w-rule { stroke: #e8e8e8; stroke-width: 1; }
.sq .sq-w-bub { fill: #f3f3f4; stroke: none; }
.sq .sq-w-chip { fill: #dadada; stroke: none; }
.sq .sq-w-tile { fill: #efecf8; stroke: none; }
.sq .sq-wi { stroke: #0f0f0f; stroke-width: 2.3; }
.sq .sq-wi.dim { stroke: #404040; }
.sq .sq-wt { fill: #0f0f0f; font: 400 11px var(--sans); }
.sq .sq-wt.ttl { font-weight: 600; font-size: 11.5px; }
.sq .sq-wt.nm { font-weight: 500; font-size: 9.5px; }
.sq .sq-wt.ch { font-weight: 500; }
.sq .sq-wt.pl { fill: #404040; font-size: 9.5px; }
.sq .sq-wt .tm { fill: #5f5f5f; font-weight: 400; }
.sq .sq-caps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 6px; padding-top: 2px; text-align: center; }
.sq .sq-caps p { margin: 0; }
.sq .sq-caps b { display: block; font-size: 14px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.25; }
.sq .sq-caps span { display: block; margin-top: 3px; font: 10.5px/1.4 var(--mono); color: var(--ink-2); }
.sq .sq-caps-tall { display: none; grid-template-columns: minmax(0, 168fr) minmax(0, 172fr); gap: 0; max-width: 360px; margin-inline: auto; padding-top: 0.143em; font-size: calc(min(100cqw - 32px, 360px) * 14 / 340); }
.sq .sq-caps-tall b { font-size: 1em; }
.sq .sq-caps-tall span { margin-top: 0.286em; font-size: 0.75em; }
.sq .sq-lists { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: auto 34px auto; gap: 0 16px; padding-top: 14px; }
.sq .sq-tray { min-width: 0; padding: 12px 12px 13px; border: 1px solid var(--line-2); border-radius: 16px; background: #fff; box-shadow: 0 1px 2px rgb(24 20 14 / 4%); }
.sq .sq-h { margin: 0 0 10px; font: 600 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-2); }
.sq .sq-tray ul { display: grid; gap: 8px; }
.sq .sq-tray li { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; letter-spacing: -0.01em; line-height: 1.25; overflow-wrap: anywhere; hyphens: auto; }
.sq .sq-b2 { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border: 1.4px solid rgb(35 30 30 / 55%); border-radius: 8px; background: #fff; }
.sq .sq-b2.pub { border-color: #8c8c12; background: var(--accent); }
.sq .sq-b2 svg { width: 15px; height: 15px; stroke-width: 2.1; }
.sq .sq-out { border: 1.3px dashed rgb(35 30 30 / 30%); background: none; box-shadow: none; }
.sq .sq-out li { color: var(--ink-2); text-decoration: line-through; text-decoration-thickness: 1.6px; text-decoration-color: var(--ink); }
.sq .sq-out .sq-b2 { border-color: rgb(35 30 30 / 30%); background: none; }
.sq .sq-flow { position: relative; }
.sq .sq-flow::before { content: ""; position: absolute; left: 50%; top: 4px; bottom: 5px; margin-left: -0.8px; border-left: 1.6px solid var(--ink); }
.sq .sq-flow::after { content: ""; position: absolute; left: 50%; bottom: 5px; width: 7px; height: 7px; margin-left: -4.3px; border-right: 1.6px solid var(--ink); border-bottom: 1.6px solid var(--ink); transform: rotate(45deg); }
.sq .sq-stop::before { bottom: 16px; border-left: 1.6px dotted rgb(35 30 30 / 55%); }
.sq .sq-stop::after { display: none; }
.sq .sq-x { position: absolute; left: 50%; bottom: 3px; display: grid; place-items: center; width: 20px; height: 20px; margin-left: -10px; border-radius: 50%; background: var(--ink); color: #fff; box-shadow: 0 0 0 2.5px var(--soft); }
.sq .sq-x svg { width: 11px; height: 11px; stroke-width: 2.9; }
.sq .sq-room { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; margin: 0; padding: 12px 14px; border: 1.3px dashed #a9a917; border-radius: 16px; background: rgb(215 215 46 / 22%); }
.sq .sq-faces { display: flex; flex: none; padding-right: 5px; }
.sq .sq-av, .sq .sq-new { flex: none; width: 26px; height: 26px; margin-right: -5px; border-radius: 50%; box-shadow: 0 0 0 2px #fff; }
.sq .sq-new { display: grid; place-items: center; border: 1.3px dashed rgb(35 30 30 / 50%); background: #fff; color: var(--ink-3); }
.sq .sq-new svg { width: 13px; height: 13px; }
.sq .sq-name b { display: block; font-size: 15px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.2; }
.sq .sq-name i { display: block; margin-top: 2px; font: 10.5px/1.35 var(--mono); font-style: normal; color: var(--ink-2); }
.sq-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
@media (forced-colors: active) { .sq .sq-fig { forced-color-adjust: none; } }
@container sq (max-width: 479px) {
  .sq .sq-fig { min-height: calc(min(100cqw - 32px, 360px) * 348 / 340 + 84px); }
  .sq .sq-wide, .sq .sq-caps { display: none; }
  .sq .sq-tall { display: block; }
  .sq .sq-caps-tall { display: grid; }
  .sq .sq-rec { position: static; align-self: flex-end; margin: 8px 4px 0; }
  .sq .sq-lists { gap: 0 10px; }
  .sq .sq-tray { padding: 11px 10px 12px; }
  .sq .sq-tray li { gap: 8px; font-size: 13px; }
}
@container sq (max-width: 360px) {
  .sq .sq-fig { min-height: max(360px, calc((100cqw - 20px) * 348 / 340 + 80px)); padding: 14px 10px 16px; }
  .sq .sq-caps-tall { font-size: calc((100cqw - 20px) * 14 / 340); }
  .sq .sq-lists { gap: 0 8px; }
  .sq .sq-tray { padding: 11px 8px 12px; }
  .sq .sq-tray li { gap: 6px; font-size: 12px; }
  .sq .sq-b2 { width: 22px; height: 22px; border-radius: 7px; }
  .sq .sq-b2 svg { width: 13px; height: 13px; }
}
"""

# The poll opens the page again at each new step, except while a file is chosen but not yet uploaded: that
# would drop it. It opens the page's own address, not a form's: after a refused form the browser is at the
# form's address, and a reload would send the form again. Between steps it swaps in the checks only when they
# changed (their signature), so an open list stays open, this device's last answer stays shown and focus stays where
# it was; then a screen reader hears one sentence about them.
# The first lines run before the page is drawn: with scripts on, the guide shows one step from the start, the one
# the address names (#join, #invite, #safe or #phone), so the browser scrolls to the right place. Without one, the step
# and drawing the reader had open when the page opened itself again at a new phase, kept for that one load.
SCRIPT = """
(function () {
  var root = document.documentElement, steps = ["join", "invite", "safe", "phone"], step = location.hash.slice(1), kept = [];
  root.classList.add("js");
  try { kept = (sessionStorage.getItem("buzz-guide") || "").split(":"); sessionStorage.removeItem("buzz-guide"); } catch (e) {}
  if (steps.indexOf(step) < 0 && steps.indexOf(kept[0]) >= 0) {
    step = kept[0];
    if (kept[1] === "2") { root.setAttribute("data-frame", "2"); }
  }
  root.setAttribute("data-step", steps.indexOf(step) < 0 ? "join" : step);
})();
function copyText(button, text) {
  var label = button.getAttribute("data-label") || button.textContent;
  button.setAttribute("data-label", label);
  var done = function () { button.textContent = "Copied"; setTimeout(function () { button.textContent = label; }, 1500); };
  if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done); return; }
  var area = document.createElement("textarea");
  area.value = text; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove(); done();
}
function updateForm(form) {
  var mode = form.querySelector("input[name=mode]:checked");
  var chosen = mode ? mode.value : "";
  form.querySelectorAll("[data-for]").forEach(function (el) {
    el.hidden = el.getAttribute("data-for").split(" ").indexOf(chosen) < 0;
  });
  var save = form.querySelector("button[type=submit]");
  var ack = form.querySelector("input[name=ack]");
  var confirm = form.querySelector("input[name=confirm]");
  var ready = Boolean(chosen) && (!ack || ack.checked);
  if (confirm) { ready = ready && confirm.value.trim().toLowerCase() === confirm.getAttribute("data-expect"); }
  if (save) { save.disabled = !ready; }
  var sub = form.querySelector("input[name=subdomain]"), base = form.querySelector("input[name=base]");
  var preview = form.querySelector("[data-preview]");
  if (sub && base && preview) {
    var b = base.value.trim().toLowerCase().replace(/^[a-z]+:[/][/]/, "").split("/")[0];
    var s = sub.value.trim().toLowerCase();
    while (s.slice(-1) === ".") { s = s.slice(0, -1); }
    preview.textContent = b ? "Members will use https://" + (s ? s + "." : "") + b : "";
    preview.hidden = !b;
  }
}
// The private network's check, from this browser: one look at a time for each address, and only the newest look's
// answer counts, so a refresh during a slow look starts no other. The answer goes to the address's row as the page has
// it then, since a refresh may have drawn the checks again. Its last answer outlives a refresh of the checks.
var reached = {}, looking = {}, looks = {};
function reachFromHere(host) {
  if (looking[host]) { return; }
  looking[host] = true;
  var look = looks[host] = (looks[host] || 0) + 1;
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 6000);
  fetch("https://" + host + "/_liveness", { mode: "no-cors", cache: "no-store", signal: controller.signal })
    .then(function () { return ["ok", "This device reaches Buzz over your Tailscale network", ""]; },
      function () { return ["bad", "This device can't reach Buzz", "Check that Tailscale is on here, signed in to the same Tailscale network, and allowed to reach the buzz machine. Devices outside your network can't connect, which keeps this option private."]; })
    .then(function (said) {
      clearTimeout(timer);
      looking[host] = false;
      if (look !== looks[host]) { return; }
      reached[host] = said;
      Array.prototype.forEach.call(document.querySelectorAll("[data-poll] [data-host]"), function (item) {
        if (item.getAttribute("data-host") === host) { answer(item, said); }
      });
    });
}
function lookFromHere(box) {
  box.querySelectorAll("[data-host]").forEach(function (item) { reachFromHere(item.getAttribute("data-host")); });
}
// The answer in the list, and on a live page above its fold, then the card's summary again: only when it changes
function answer(item, said) {
  var card = item.closest(".ck-card"), text = item.querySelector(".text"), hint = item.querySelector(".hint");
  var note = card && said[0] !== "ok" ? "See above." : said[2];
  if (item.className === said[0] && text.textContent === said[1] && hint.textContent === note) { return; }
  item.className = said[0];
  text.textContent = said[1];
  hint.textContent = note;
  if (card) { surface(card, said); settle(card); }
}
function surface(card, said) {
  var top = card.querySelector('.ck-top[data-key="device"]');
  if (said[0] === "ok") { if (top) { top.remove(); } return; }
  if (!top) {
    top = document.createElement("div");
    top.setAttribute("data-key", "device");
    top.innerHTML = '<span class="icon"></span><span class="text"></span><span class="hint"></span>';
  }
  top.className = "ck-top " + said[0];
  top.querySelector(".text").textContent = said[1];
  top.querySelector(".hint").textContent = said[2];
  // problems first, then what still waits; this check is the last of the list
  var before = said[0] === "bad" ? card.querySelector('.ck-top.wait:not([data-key="device"])') : null;
  card.insertBefore(top, before || card.querySelector(".ck-all"));
}
function settle(card) {
  var rows = card.querySelectorAll(".ck-all li"), ok = 0, bad = 0;
  rows.forEach(function (row) { ok += row.className === "ok" ? 1 : 0; bad += row.className === "bad" ? 1 : 0; });
  card.classList.toggle("ck-alert", bad > 0);
  var all = ok === rows.length;
  card.querySelector(".ck-sum").textContent = all ? "Everything works" : "Everything else works";
  card.querySelector(".ck-all .val").textContent = all ? rows.length + (rows.length === 1 ? " check" : " checks")
    : ok + " of " + rows.length + " checks";
}
function fileChosen() {
  return Array.prototype.some.call(document.querySelectorAll("input[type=file]"), function (input) {
    return Boolean(input.files && input.files.length);
  });
}
var CONTROLS = "summary, a[href], button";
function poll() {
  var box = document.querySelector("[data-poll]");
  if (!box) { return; }
  var phase = box.getAttribute("data-phase");
  fetch("status.json", { cache: "no-store", credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (data) {
    if (data.phase !== phase && !fileChosen()) { keepStep(); location.replace("./"); return; }
    if (data.sig !== box.getAttribute("data-sig")) {
      var open = box.querySelector("details[open]") !== null;
      var focused = Array.prototype.indexOf.call(box.querySelectorAll(CONTROLS), document.activeElement);
      box.innerHTML = data.html;
      box.setAttribute("data-sig", data.sig);
      box.querySelectorAll("details").forEach(function (d) { d.open = open; });
      box.querySelectorAll("[data-host]").forEach(function (item) {
        var said = reached[item.getAttribute("data-host")];
        if (said) { answer(item, said); }
      });
      // Focus stays on the same control, the card's summary, and the page doesn't move
      var again = focused < 0 ? null : box.querySelectorAll(CONTROLS)[focused];
      if (again) { again.focus({ preventScroll: true }); }
      announce(box);
    }
    lookFromHere(box);
  }).catch(function () {}).finally(function () { setTimeout(poll, 5000); });
}
// One short sentence when the checks change, and only then: the card's summary on a live page, the current stage
// while connecting
function announce(box) {
  var region = document.querySelector("[data-said]"), bar = box.querySelector(".bar"), card = box.querySelector(".ck-card");
  if (!region) { return; }
  region.textContent = bar ? bar.getAttribute("data-say")
    : card ? card.querySelector(".ck-sum").textContent + ", " + card.querySelector(".ck-all .val").textContent + "." : "";
}
// The guide's step and drawing, for the page opened again at a new phase
var guideAt = "";
function keepStep() {
  try { if (guideAt) { sessionStorage.setItem("buzz-guide", guideAt); } } catch (e) {}
}
// The live page's next steps: one step at a time, and in it one drawing at a time. The links on the left work
// without scripts too, as links to each step.
function guide(box) {
  var links = box.querySelectorAll(".g-step"), panes = box.querySelectorAll(".g-pane"), say = box.querySelector(".g-say");
  var ids = Array.prototype.map.call(panes, function (pane) { return pane.id; });
  var at = [0, 0], root = document.documentElement;
  function frames(i) { return panes[i].querySelectorAll(".g-frame"); }
  function show(i, j) {
    at = [i, j];
    guideAt = ids[i] + ":" + (j + 1);
    links.forEach(function (link, k) { if (k === i) { link.setAttribute("aria-current", "step"); } else { link.removeAttribute("aria-current"); } });
    panes.forEach(function (pane, k) { pane.hidden = k !== i; });
    frames(i).forEach(function (frame, k) { frame.hidden = k !== j; });
    howScale(frames(i)[j]);
    bubbles(frames(i)[j]);
  }
  function go(by) {
    var i = at[0], j = at[1] + by;
    if (j < 0) { if (i === 0) { return; } i -= 1; j = frames(i).length - 1; }
    else if (j >= frames(i).length) { if (i === panes.length - 1) { return; } i += 1; j = 0; }
    if (i !== at[0]) { history.replaceState(null, "", "#" + ids[i]); }
    show(i, j);
    var frame = frames(i)[j];
    frame.querySelector('[data-go="' + by + '"]').focus();
    if (say) { say.textContent = frame.getAttribute("data-say"); }
  }
  // Any link to a step, the guide's own or one elsewhere on the page such as Settings, Moderation, opens the step at
  // its first drawing and moves focus to its heading, as the link's jump does without scripts. Like Next, it puts the
  // step in the address without a new entry in the history, so Back never opens another step. A link from outside
  // the guide brings the step into view first.
  document.addEventListener("click", function (event) {
    var link = event.target.closest ? event.target.closest('a[href^="#"]') : null;
    var i = link ? ids.indexOf(link.getAttribute("href").slice(1)) : -1;
    if (i < 0) { return; }
    event.preventDefault();
    history.replaceState(null, "", "#" + ids[i]);
    show(i, 0);
    var outside = !box.contains(link);
    if (outside) { panes[i].scrollIntoView(); }
    panes[i].querySelector("h2").focus({ preventScroll: outside });
  });
  box.querySelectorAll("[data-go]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.getAttribute("aria-disabled") !== "true") { go(Number(button.getAttribute("data-go"))); }
    });
  });
  // A step's name typed into the address bar opens it the same way
  window.addEventListener("hashchange", function () {
    var i = ids.indexOf(location.hash.slice(1));
    if (i >= 0) { show(i, 0); panes[i].scrollIntoView(); panes[i].querySelector("h2").focus({ preventScroll: true }); }
  });
  box.classList.add("ready");
  var first = Math.max(0, ids.indexOf(root.getAttribute("data-step")));
  show(first, Math.min(frames(first).length, Number(root.getAttribute("data-frame")) || 1) - 1);
}
function howScale(how) {
  how.querySelectorAll(".mb-stage").forEach(function (stage) {
    if (stage.clientWidth) { stage.style.setProperty("--s", Math.min(1, stage.clientWidth / 560)); }
  });
}
// The safety step's drawn chat bubbles, each as wide as its words in this browser's font, as the self-hosting guide
// does. A drawing that isn't shown can't be measured: it is when it shows, or when the window's width changes it.
function bubbles(el) {
  el.querySelectorAll(".sq-bub").forEach(function (g) {
    var bubble = g.querySelector(".sq-w-bub"), texts = g.querySelectorAll("text"), words = null;
    try { words = texts[texts.length - 1].getBBox(); } catch (e) {}
    if (words && words.width) { bubble.setAttribute("width", (words.x + words.width + 10 - bubble.x.baseVal.value).toFixed(1)); }
  });
}
function howShow(how, n) {
  how.querySelectorAll(".how-tabs button").forEach(function (b, i) { b.setAttribute("aria-selected", String(i === n)); });
  how.querySelectorAll(".how-step").forEach(function (s, i) { s.hidden = i !== n; });
  howScale(how);
}
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("details.how").forEach(function (how) {
    how.classList.add("js");
    how.querySelectorAll(".how-tabs button").forEach(function (b, i) { b.addEventListener("click", function () { howShow(how, i); }); });
    how.addEventListener("toggle", function () { howScale(how); });
    howShow(how, 0);
  });
  document.querySelectorAll(".guide").forEach(guide);
  window.addEventListener("resize", function () {
    document.querySelectorAll("details.how[open], .guide").forEach(howScale);
    document.querySelectorAll(".guide").forEach(bubbles);
  });
  document.querySelectorAll("form[data-guided]").forEach(function (form) {
    form.addEventListener("input", function () { updateForm(form); });
    form.addEventListener("change", function () { updateForm(form); });
    updateForm(form);
  });
  document.querySelectorAll("input[type=file][data-max]").forEach(function (input) {
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      input.setCustomValidity(file && file.size > Number(input.getAttribute("data-max")) ?
        "That file is too large to be a Cloudflare sign-in." : "");
      input.reportValidity();
    });
  });
  lookFromHere(document);
  setTimeout(poll, 5000);
});
"""


def esc(text):
    return html.escape(str(text), quote=True)


def layout(body, signed_in=True, title="Buzz Relay", safety=False):
    """A page around body. safety: the live page, whose guide has the safety step and needs its drawings' rules."""
    logout = ('<form method="post" action="logout"><button class="link" type="submit">Sign out</button></form>'
              if signed_in else "")
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title) + "</title>"
        "<style>" + STYLE + HOW_STYLE + (SAFE_STYLE if safety else "") + "</style><script>" + SCRIPT + "</script></head><body>"
        '<header class="hd"><span class="brand">' + BEE + "<span>Buzz Relay</span></span>" + logout + "</header>"
        "<main>" + body + '<p class="foot">Buzz is open source, from Block. The relay is at '
        '<a href="https://github.com/block/buzz" target="_blank" rel="noopener">github.com/block/buzz</a>, and the app '
        'at <a href="https://github.com/block/buzz-app" target="_blank" rel="noopener">github.com/block/buzz-app</a>.</p>'
        "</main></body></html>"
    )


def error_box(error):
    return '<div class="error" role="alert">' + esc(error) + "</div>" if error else ""


def login_page(error=""):
    return layout(
        '<p class="eyebrow">Sign in</p><h1>Your <mark>Buzz</mark> community</h1>'
        '<p class="lede">Enter this app\'s password to continue.</p>'
        '<form method="post" action="login"><label class="field" for="password">Password</label>'
        '<input type="password" id="password" name="password" autocomplete="current-password" autofocus>'
        '<button class="btn" type="submit">Sign in</button></form>' + error_box(error) +
        '<div class="panel" style="margin-top:28px"><p><b>Where to find it.</b> Umbrel shows the password when you '
        "open Buzz Relay from the home screen. To see it again, right-click Buzz Relay on the home screen and "
        "choose Settings, then Default credentials. On umbrelOS 1.7, right-click Buzz Relay and choose Show "
        "default credentials.</p><p class=\"muted\">Why a second password? Umbrel's sign-in protects this page "
        "in your browser. But all the apps on an Umbrel share one network, so another app could reach this page "
        "directly. This password keeps other apps out. You stay signed in on this browser for 30 days.</p></div>",
        signed_in=False)


def choice(mode, kicker, badge, title, text, needs, checked, warning="", more=""):
    """An option's card: what it is and needs, and once chosen, its own field or next step inside it."""
    return (
        '<div class="choice"><label class="choice-head"><input type="radio" name="mode" value="' + mode + '"'
        + (" checked" if checked else "") + ">"
        '<span class="kicker"><span>' + kicker + ('<span class="badge">' + badge + "</span>" if badge else "") + '</span><span class="pick"></span></span>'
        "<h3>" + title + "</h3><p>" + text + "</p>" + ('<p class="heads-up">' + warning + "</p>" if warning else "")
        + '<p class="needs"><b>Needs:</b>' + needs + "</p></label>"
        + ('<div class="choice-more" data-for="' + mode + '">' + more + "</div>" if more else "") + "</div>"
    )


def domain_field(values, label):
    """A name and a domain, as two boxes: the name is buzz unless the owner changes or clears it."""
    sub = values.get("subdomain", "buzz")
    return (
        '<label class="field" for="domain-base">' + label + "</label>"
        '<div class="split"><input type="text" name="subdomain" value="' + esc(sub) + '" aria-label="Name" '
        'autocomplete="off" spellcheck="false"><span>.</span>'
        '<input type="text" id="domain-base" name="base" placeholder="yourteam.com" aria-label="Domain" '
        'autocomplete="off" spellcheck="false" value="' + esc(values.get("base", "")) + '"></div>'
        '<p class="muted small" data-preview hidden></p>'
        '<p class="muted small">The first part is up to you: keep <b>buzz</b>, change it, or clear it to use your '
        "domain on its own.</p>"
    )


def next_steps(text):
    """What happens after an option is chosen, folded away to keep the option cards short."""
    return ('<details class="alt"><summary>What happens next</summary><div class="inner"><p class="small">' + text
            + "</p></div></details>")


def posted_domain(values):
    """The domain from a form: one field (earlier forms, and the tests), or a name and a domain."""
    if values.get("domain", "").strip():
        return values["domain"]
    base = re.sub(r"^[a-z]+://", "", values.get("base", "").strip().lower()).split("/")[0]
    sub = values.get("subdomain", "").strip().lower().strip(".")
    return sub + "." + base if sub and base else base


def address_fields(values, setup):
    mode = values.get("mode") or (setup or {}).get("mode") or ""
    return (
        '<div class="choices">'
        + choice("domain", "Recommended for most communities", "", "Your own domain",
                 "A name you own, like <code>buzz.yourteam.com</code>. Members join from anywhere with an invite, "
                 "and the address stays yours, even on another server.",
                 "a domain (around 10 US dollars a year) on a free Cloudflare account.", mode == "domain",
                 more=domain_field(values, "Your address")
                 + next_steps("You sign in to Cloudflare and choose your domain. This page sets up the rest and checks "
                              "that it works. Cloudflare handles HTTPS, so it can see the traffic it carries, and "
                              "uploads are limited to 100 MB."))
        + choice("funnel", "Recommended for trying Buzz out", "", "A free Tailscale address",
                 "The quickest start. Tailscale gives this Umbrel an address like <code>buzz.tail1234.ts.net</code>, "
                 "and members join from anywhere with an invite. It's tied to your Tailscale account, not a name you "
                 "own.",
                 "a free Tailscale account for you, the owner.", mode == "funnel",
                 "For now, if you change your community's address, its messages and members don't carry over to the "
                 "new one. If you're building a community to keep, choose your own domain now.",
                 more=next_steps("You sign in to Tailscale, and it gives you the address. It stays the same as long "
                                 "as you keep this Tailscale account."))
        + choice("private", "Recommended when the server must stay off the internet", "", "A private Tailscale network",
                 "Nothing is reachable from the internet. Only devices you allow on your Tailscale network can "
                 "connect.",
                 "Tailscale on every member's device, phones included, and access to your Tailscale network.",
                 mode == "private",
                 more=next_steps("You sign in to Tailscale, and it gives you the address. To let someone in, invite "
                                 "them to your Tailscale network or share the <b>buzz</b> machine with them, then send "
                                 "them an invite link from Buzz."))
        + "</div>"
    )


# Buzz's own screens, drawn from Buzz 1.0.5's source (block/buzz-app at v1.0.5, the current stable release) in its
# light theme, with the thing to click in chartreuse. Tabler's outline icons (MIT, 3.46.0 in 1.0.5 as in 1.0.0) are
# the set Buzz draws its interface with.
TABLER = {
    'messages': '<path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10"/><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2"/>',
    'robot': '<path d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4"/><path d="M12 2v2"/><path d="M9 12v9"/><path d="M15 12v9"/><path d="M5 16l4 -2"/><path d="M15 14l4 2"/><path d="M9 18h6"/><path d="M10 8v.01"/><path d="M14 8v.01"/>',
    'chevron-down': '<path d="M6 9l6 6l6 -6"/>',
    'user': '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>',
    'device-desktop': '<path d="M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10"/><path d="M7 20h10"/><path d="M9 16v4"/><path d="M15 16v4"/>',
    'chevron-right': '<path d="M9 6l6 6l-6 6"/>',
    'layout-grid': '<path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/>',
    'settings': '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/>',
    'message-circle': '<path d="M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1"/>',
    'device-mobile': '<path d="M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14"/><path d="M11 4h2"/><path d="M12 17v.01"/>',
    'shield': '<path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/>',
    'palette': '<path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25"/><path d="M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
    'bell': '<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/>',
    'keyboard': '<path d="M2 8a2 2 0 0 1 2 -2h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2l0 -8"/><path d="M6 10l0 .01"/><path d="M10 10l0 .01"/><path d="M14 10l0 .01"/><path d="M18 10l0 .01"/><path d="M6 14l0 .01"/><path d="M18 14l0 .01"/><path d="M10 14l4 .01"/>',
    'x': '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
    'copy': '<path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/>',
    'check': '<path d="M5 12l5 5l10 -10"/>',
    'users': '<path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>',
    'mood-smile': '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M9 10l.01 0"/><path d="M15 10l.01 0"/><path d="M9.5 15a3.5 3.5 0 0 0 5 0"/>',
    'logout': '<path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"/><path d="M9 12h12l-3 -3"/><path d="M18 15l3 -3"/>',
    'search': '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>',
    'crown': '<path d="M12 6l4 6l5 -4l-2 10h-14l-2 -10l5 4l4 -6"/>',
    'dots': '<path d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
    'world': '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/><path d="M11.5 3a17 17 0 0 0 0 18"/><path d="M12.5 3a17 17 0 0 1 0 18"/>',
    'users-plus': '<path d="M5 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4c.96 0 1.84 .338 2.53 .901"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M16 19h6"/><path d="M19 16v6"/>',
    'plus': '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
    'arrow-left': '<path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>',
    'arrow-right': '<path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>',
    'plug': '<path d="M9.785 6l8.215 8.215l-2.054 2.054a5.81 5.81 0 1 1 -8.215 -8.215l2.054 -2.054"/><path d="M4 20l3.5 -3.5"/><path d="M15 4l-3.5 3.5"/><path d="M20 9l-3.5 3.5"/>',
    'lock': '<path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6"/><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M8 11v-4a4 4 0 1 1 8 0v4"/>',
    'brain': '<path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8"/><path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8"/><path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5"/><path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0"/><path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5"/><path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10"/>',
    'download': '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/>',
    'layout-sidebar': '<path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/><path d="M9 4l0 16"/>',
    'browser': '<path d="M4 8h16"/><path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/><path d="M8 4v4"/>',
    # The page's own icons, for the next steps' guide
    'login': '<path d="M9 8v-2a2 2 0 0 1 2 -2h7a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2v-2"/><path d="M3 12h13l-3 -3"/><path d="M13 15l3 -3"/>',
    'user-plus': '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M16 19h6"/><path d="M19 16v6"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4"/>',
    'book': '<path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6l0 13"/><path d="M12 6l0 13"/><path d="M21 6l0 13"/>',
    'arrow-up-right': '<path d="M17 7l-10 10"/><path d="M8 7l9 0l0 9"/>',
    'shield-check': '<path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/><path d="M9 12l2 2l4 -4"/>',
    'link': '<path d="M9 15l6 -6"/><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"/><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"/>',
    'ban': '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M5.7 5.7l12.6 12.6"/>',
    'flag': '<path d="M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1 -7 0a5 5 0 0 0 -7 0v-9z"/><path d="M5 21v-7"/>',
    'eye': '<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/>',
    'alert-circle': '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    'clock': '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 7v5l3 3"/>',
}


def ti(name):
    return '<svg class="tb-i" viewBox="0 0 24 24" aria-hidden="true">' + TABLER[name] + "</svg>"


SAMPLE_NPUB = "npub1qm\u20268k3a"


# Settings' left column with a community open, in Buzz 1.0.5's order (src/app/settings-sections.ts, the same as in
# 1.0.0). Buzz's group runs on past the drawing's edge, which fades out. Mobile app is Pair mobile in builds without
# Builderlab (src/bundled/pairing/index.tsx).
COMMUNITY_GROUPS = [
    ("Community", [("user", "Profile"), ("settings", "Local settings"), ("mood-smile", "Custom emoji"),
                   ("device-mobile", "Mobile app"), ("logout", "Leave or remove")]),
    ("Community admin", [("users", "Membership")]),
    ("Buzz", [("shield", "Identity"), ("lock", "Security"), ("palette", "Appearance"), ("bell", "Notifications"),
              ("keyboard", "Shortcuts")]),
]


def settings_nav(groups, current, host=""):
    """Settings' left column, open at one item; a community's Settings start with its address, which ends in an
    ellipsis where it runs past the column."""
    top = ('<p class="mb-nav-host"><span>' + esc(host[:1].upper()) + "</span><em>" + esc(host) + "</em></p>"
           if host else "")
    return '<nav class="mb-nav-col">' + top + "".join(
        '<p class="mb-nav-g">' + group + "</p>" + "".join(
            '<p class="mb-nav-i' + (" on" if label == current else "") + '">' + ti(icon) + label + "</p>"
            for icon, label in items)
        for group, items in groups) + "</nav>"


def settings_modal(nav, page, over=""):
    return ('<div class="mb-shade"></div><div class="mb-modal"><div class="mb-modal-h"><b>Settings</b><span class="mb-x">'
            + ti("x") + '</span></div><div class="mb-modal-b">' + nav + page + "</div>" + over + "</div>")


def drawn_app(menu=""):
    """Buzz's window in Personal space, with no community open (src/app/shell/AppShell.tsx): the sidebar button,
    back, forward and Search across the top, and the app dock down the left as a new install has it. Since 1.0.1 a
    new install turns Bestie on (src/bundled/index.ts), and the dock puts it first (dockOrder in
    src/app/shell/presentation.ts). With no community open it shows neither an agent's picture nor Create an agent's
    (BestieNavigation.tsx), so it has the default page icon, a browser window; then Messages, which opens at launch,
    and Agents. At the dock's foot, the community button shows a globe, above your profile picture. Messages shows its
    page for no community. A menu opens to the right of the dock's foot."""
    return (
        '<div class="mb-app"><div class="mb-head"><span class="mb-hist"><i>' + ti("layout-sidebar") + "</i>"
        + ti("arrow-left") + ti("arrow-right") + '</span><span class="mb-find">' + ti("search") + "Search</span></div>"
        '<div class="mb-dock"><span class="mb-tile">' + ti("browser") + '</span><span class="mb-tile on">'
        + ti("messages") + '</span><span class="mb-tile">' + ti("robot") + '</span><span class="mb-foot">'
        '<span class="mb-comm">' + ti("world") + "</span>"
        '<span class="mb-me id-me">' + ti("user") + "</span></span></div>"
        '<div class="mb-panel"><div class="mb-side"><span class="mb-seg"><i class="on">All</i><i>Solo</i><i>Team</i>'
        '</span><span class="mb-bar"></span><span class="mb-bar short"></span><span class="mb-bar"></span></div>'
        '<div class="mb-main"><span class="mb-plug">' + ti("plug") + "</span><p>Your channels, one conversation.</p>"
        '<span class="mb-bar"></span><span class="mb-bar short"></span><span class="mb-btn dark">Choose a community'
        "</span></div></div>" + menu + "</div>"
    )


def drawn_switcher():
    """The community menu, open beside the community button (src/features/communities/CommunityPicker.tsx):
    Personal space, then Join a community highlighted, then Create community, which makes a community Block hosts."""
    return drawn_app('<div class="mb-pmenu sw-menu"><p class="sel">' + ti("world") + "Personal space</p>"
                     '<p class="on">' + ti("users-plus") + "Join a community</p>"
                     "<p>" + ti("plus") + "Create community</p></div>")


def drawn_join(url):
    """Join a community, with the address pasted in."""
    return drawn_app() + (
        '<div class="mb-shade on-modal"></div><div class="mb-dlg"><div class="mb-dlg-h"><b>Join a community</b>'
        '<span class="mb-x">' + ti("x") + "</span></div>"
        '<p class="mb-sub">Use your identity across communities. Your profile and conversations stay separate in each '
        "one.</p><h6>Community URL</h6>"
        '<div class="mb-line"><span class="mb-in"><span class="typed">' + esc(url) + "</span></span></div>"
        '<p class="mb-sub">Paste your community link. Continue shares your Buzz identity with the community so you can '
        'preview it before joining.</p><div class="jn-go"><span class="mb-btn dark hot">Continue</span></div></div>'
    )


def drawn_membership(host, inviting=False):
    """Settings, Membership, in a new community (src/bundled/moderation/CommunityAdmin.tsx at v1.0.5): since 1.0.1
    (block/buzz-app#3147) a Members and an Invite tab, as text with a bar under the open one (Tabs, variant panel),
    and no Add directly tab (DIRECT_MEMBER_ADD_ENABLED = false in features.ts). Members opens first: the search, then
    the owner alone, named by the end of their public ID until they set a name, with their role at the row's end.
    Inviting, the Invite tab: the link's QR code, and beside it the link with Copy link, then its expiry and use limit
    (CommunityAdmin.module.css, .invitePanel). Opening the tab makes the link."""
    tabs = ('<p class="mb-tabs"><span' + ("" if inviting else ' class="on"') + ">Members</span><span class=\""
            + ("on" if inviting else "hot") + '">Invite</span></p>')
    if inviting:
        body = (
            '<div class="mb-inv"><div class="mb-inv-qr">' + QR + "</div><div>"
            '<div class="mb-line"><span class="mb-in"><span class="mono">https://' + esc(host) + "/invite/v2.nOvr6DwA6u"
            '</span><span class="mb-copy hot">Copy link</span></span></div><div class="mb-group">'
            '<p>Expires after<span class="mb-choice">3 days' + ti("chevron-down") + "</span></p>"
            '<p>Max uses<span class="mb-choice">No limit' + ti("chevron-down") + "</span></p></div></div></div>"
        )
    else:
        body = (
            '<p class="mb-search">' + ti("search") + 'Search members</p><p class="mb-cap">Members · 1</p>'
            '<div class="mb-row"><span class="mb-av"><i>N</i></span><b class="mb-who">npub…k3a' + ti("crown")
            + "</b><small>Owner · You</small></div>"
        )
    page = ('<section class="mb-page"><h5>Membership</h5><p class="mb-sub">Manage members and access to ' + esc(host)
            + ".</p>" + tabs + body + "</section>")
    return settings_modal(settings_nav(COMMUNITY_GROUPS, "Membership", host), page)


def qr_cells():
    """A made-up code: a finder square in three corners, a quiet gap around each, a fixed scatter between."""
    def finder(x, y, ox, oy):
        dx, dy = x - ox, y - oy
        if dx < -1 or dy < -1 or dx > 7 or dy > 7:
            return None
        if dx < 0 or dy < 0 or dx > 6 or dy > 6:
            return False
        return dx in (0, 6) or dy in (0, 6) or (2 <= dx <= 4 and 2 <= dy <= 4)
    cells = []
    for y in range(21):
        for x in range(21):
            found = [f for f in (finder(x, y, 0, 0), finder(x, y, 14, 0), finder(x, y, 0, 14)) if f is not None]
            if (found[0] if found else (x * 31 + y * 17 + x * y * 7) % 11 < 5):
                cells.append('<rect x="' + str(x) + '" y="' + str(y) + '" width="1" height="1"/>')
    return "".join(cells)


QR = ('<svg class="id-qr" viewBox="-1 -1 23 23" shape-rendering="crispEdges" aria-hidden="true">' + qr_cells()
      + "</svg>")


def drawn_pair(host, verifying=False):
    """Settings, Mobile app (src/bundled/pairing/PairingSettings.tsx): the code to scan, beside the three steps
    Buzz lists. Verifying, after the phone has scanned it: the six digits, with Codes match highlighted, which
    sends your identity to the phone."""
    if verifying:
        left = ('<div class="id-verify"><b>Verify the code on your phone</b><span class="id-digits">482 913</span>'
                '<span class="mb-btn dark hot">Codes match</span><span class="mb-btn">Cancel</span></div>')
        first = '<span class="done">' + ti("check") + "</span>"
    else:
        left = '<div class="id-pair-code">' + QR + '</div><span class="mb-btn">Copy pairing code</span>'
        first = "<span>1</span>"
    page = (
        '<section class="mb-page id-pair"><h5>Pair mobile</h5><p class="mb-sub">Connect the Buzz mobile app to this '
        "community. Pairing is secured with end-to-end encryption and a verification code.</p>"
        '<div class="id-pair-b"><div class="id-pair-left">' + left + "</div><ol>"
        "<li>" + first + "<div><b>Scan QR code</b><p>Open Buzz on your phone and choose Add community to scan the "
        "code shown here.</p></div></li>"
        "<li><span>2</span><div><b>Verify the code on your phone</b><p>If your phone asks for a code, enter these "
        "digits and finish confirming on your phone. If it shows a code, check that the digits match. Then choose "
        "Codes match here to send your Buzz identity.</p></div></li>"
        "<li><span>3</span><div><b>Pair your mobile app</b><p>Your mobile app will connect after you verify the "
        "code.</p></div></li></ol></div></section>"
    )
    return settings_modal(settings_nav(COMMUNITY_GROUPS, "Mobile app", host), page)


def how_to(summary, steps, intro=""):
    """A dropdown of Buzz's screens, drawn: one step, or tabs to move between several."""
    tabs = ""
    if len(steps) > 1:
        tabs = '<div class="how-tabs" role="tablist">' + "".join(
            '<button type="button" role="tab"><span>' + str(n) + "</span>" + title + "</button>"
            for n, (title, _, _) in enumerate(steps, 1)) + "</div>"
    return (
        '<details class="how"><summary>' + summary + '</summary><div class="how-b">'
        + ("<p>" + intro + "</p>" if intro else "") + tabs
        + "".join('<div class="how-step"><div class="mb" aria-hidden="true"><div class="mb-stage"><div class="mb-canvas">'
                  + frame + "</div></div></div><p>" + text + "</p></div>" for _, frame, text in steps)
        + "</div></details>"
    )


def screen(drawing):
    """Buzz's screen as a drawing of the guide: a picture alone, which its caption says in words."""
    return '<div class="mb" aria-hidden="true"><div class="mb-stage"><div class="mb-canvas">' + drawing + "</div></div></div>"


# The guide's drawings, each as (title, drawing, caption, more): more is HTML under the caption.
def join_steps(domain):
    # Buzz 1.0.5, as 1.0.0: the community button sits at the foot of the left dock (CommunityPicker.tsx); with no
    # community saved, Buzz opens on a full-page Join a community instead (CommunityLanding.tsx, firstRun in
    # src/app/App.tsx). The join dialog asks Continue twice, then publishes the profile (CommunityDialog.tsx).
    return [
        ("Open Join a community", screen(drawn_switcher()),
         "In Buzz, click the community button at the bottom left, then <b>Join a community</b>. Not <b>Create "
         "community</b>: that makes a new community that Block hosts. If Buzz opens on a <b>Join a community</b> page "
         "instead, paste the address there and choose <b>Join</b>.", ""),
        ("Paste the address", screen(drawn_join("https://" + domain)),
         "Paste the address into <b>Community URL</b> and choose <b>Continue</b> twice. Then choose <b>Publish profile "
         "&amp; open</b>.", ""),
    ]


def member_steps(domain):
    # Since Buzz 1.0.1 (block/buzz-app#3147) Membership has Members and Invite tabs, and adding someone by public ID
    # is switched off (DIRECT_MEMBER_ADD_ENABLED = false in src/bundled/moderation/features.ts at v1.0.5)
    return [
        ("Open Membership", screen(drawn_membership(domain)),
         "In Buzz, open <b>Settings</b>. Under <b>Community admin</b>, choose <b>Membership</b>, then the "
         "<b>Invite</b> tab.", ""),
        ("Send an invite link", screen(drawn_membership(domain, inviting=True)),
         "Choose <b>Copy link</b> and send it. Anyone with the link can join until it expires or runs out of uses. To "
         "invite one person, set <b>Max uses</b> to <b>1 use</b> first.", ""),
    ]


def phone_steps(domain):
    # The computer's side, Settings, Mobile app, is PairingSettings.tsx and MobileApp.tsx at v1.0.5, the same as in
    # 1.0.0. The phone's labels come from Buzz's mobile app, which lives in block/buzz (mobile/), not in buzz-app:
    # "Scan a QR code" and "or sign in with email" (pairing_welcome_view.dart), "Add Community"
    # (community_grid_add.dart), "Enter a community link" (community_link_form.dart), and the protect prompt's buttons
    # (sas_verification_view.dart, sensitive_action_authorizer.dart), the same at mobile-v1.0.0-rc.3,
    # mobile-v1.1.0-rc.3 and main on 2026-11-13
    return [
        ("Scan the code", screen(drawn_pair(domain)),
         "In Buzz on your computer, open <b>Settings</b>, then <b>Mobile app</b>. On the phone, choose <b>Scan a QR "
         "code</b> and scan it. If the phone already has a community, choose <b>Add Community</b> in its community "
         "switcher first.",
         # Signed in to Builderlab with this computer's key backed up there, Settings, Mobile app shows Get Buzz on your
         # phone in place of the code (MobileApp.tsx, builderlab-account.ts in buzz-app v1.0.5). The phone's email
         # sign-in, offered only with no community yet, restores that key; from mobile-v1.2.0-rc.5 (block/buzz#9262) it
         # lists self-hosted addresses saved to the account, and its first screen's button reads Enter community link
         # (add_community_connection.dart). Joining any community while signed in saves its address to the Builderlab
         # account (known-communities/sync.ts).
         '<details class="g-more"><summary>Signed in with Builderlab?</summary><p>If your Builderlab account backs '
         "up this computer's key, your computer shows <b>Get Buzz on your phone</b> instead of a code. On the phone, "
         "choose <b>or sign in with email</b> and use the same account. Choose <code>" + esc(domain) + "</code> if it's "
         "listed. If not, choose <b>Enter community link</b> (or <b>Add Community</b>, then <b>Enter a community "
         "link</b>), paste <code>https://" + esc(domain) + "</code>, choose <b>Continue</b>, then your saved identity. "
         "A phone that already has a community doesn't offer email sign-in: sign out of Builderlab on your computer to "
         "get the code instead. Buzz also saves this community's address to your Builderlab account.</p></details>"),
        ("Check the code", screen(drawn_pair(domain, verifying=True)),
         # The phone either asks for the computer's code or shows its own to compare, as the drawing says
         # (PairingSettings.tsx). Once the code is right, the phone asks to protect your identity (Use Face ID, Use
         # Touch ID or Use biometrics, whichever it has, or Skip) and holds the identity until you choose. Block's
         # docs/pairing.md finishes on the phone before Codes match.
         "If the phone asks for a code, type the six digits your computer shows. If it shows a code, check that the "
         "digits match. When it asks to protect your identity, choose <b>Use Face ID</b>, <b>Use Touch ID</b> or "
         "<b>Use biometrics</b>, or <b>Skip</b>. Then choose <b>Codes match</b> on your computer.", ""),
    ]


# The safety step's two drawings, from the self-hosting guide's Security section (site/src/scenes/security.ts on
# main), drawn here by the same rules, so they come out as the guide has them: what an agent can touch, and what anyone
# who joins can read. Unlike Buzz's screens they aren't pictures alone: the first says what it shows to screen readers,
# and the second is two real lists. The people and the agent are drawn once, in SAFE_DEFS, and used where they show.
SAFE_ICON = {
    "folder": '<path d="M4 7a2 2 0 0 1 2-2h3.6l2 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    "key": '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2.5 2.5"/>',
    "lock": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    "doc": '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zM9 13h6M9 17h4"/>',
    "branch": '<circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="8" r="2"/><path d="M7 8v8M17 10c0 4-10 2-10 6"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>',
    "users": TABLER["users"],
    "x": '<path d="M18 6 6 18M6 6l12 12"/>',
    "world": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    "horn": '<path d="M18 8a3 3 0 0 1 0 6"/><path d="M10 8v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-5"/><path d="M12 8l4.5-3.8a.9.9 0 0 1 '
            '1.5.7v12.2a.9.9 0 0 1-1.5.7L12 14H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/>',
    # Buzz's own robot mark, as its agents carry it
    "robot": '<rect x="4.75" y="7" width="14.5" height="13.25" rx="4.5"/><path d="M12 7V2.5M3.25 11.5v4.25M20.75 11.5v4.25"/>'
             '<g fill="currentColor" stroke="none"><circle cx="9" cy="13.25" r="1.4"/><circle cx="15" cy="13.25" r="1.4"/></g>',
}


def js_fixed(n):
    """n.toFixed(1), as the guide's drawing code writes its coordinates: a tie rounds away from zero."""
    return str(decimal.Decimal(n).quantize(decimal.Decimal("0.1"), rounding=decimal.ROUND_HALF_UP))


def js_num(n):
    """A number as the guide's drawing code writes it: 90, not 90.0."""
    return str(int(n)) if float(n).is_integer() else repr(float(n))


def drawn_avatar(name, x, y, size):
    """A person's or the agent's picture, from SAFE_DEFS."""
    return '<use href="#sq-' + name + '" x="' + x + '" y="' + y + '" width="' + js_num(size) + '" height="' + js_num(size) + '"/>'


def iso_kit(ox, oy):
    """An isometric kit placed at (ox, oy): ground x runs right and down, ground y left and down, z up. A square of
    floor (grey and dashed for yours, yellow for the agent's), an icon standing on it, the agent, a laptop, and a
    small machine of two slabs with a light on the front."""
    def p(x, y, z=0):
        return ox + (x - y) * 0.866, oy + (x + y) * 0.5 - z

    def poly(points, attrs):
        return '<polygon points="' + " ".join(js_fixed(a) + "," + js_fixed(b) for a, b in points) + '" ' + attrs + "/>"

    def box(x, y, z, w, d, h, front="#efefe9"):
        return ('<g class="sq-b">'
                + poly([p(x, y + d, z + h), p(x + w, y + d, z + h), p(x + w, y + d, z), p(x, y + d, z)], 'fill="' + front + '"')
                + poly([p(x + w, y, z + h), p(x + w, y + d, z + h), p(x + w, y + d, z), p(x + w, y, z)], 'fill="#e2e2db"')
                + poly([p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)], 'fill="#fff"') + "</g>")

    def floor(s, agents=False):
        return poly([p(0, 0), p(s, 0), p(s, s), p(0, s)], 'class="sq-floor' + (" open" if agents else "") + '"')

    def badge(x, y, icon, pub=False):
        cx, cy = p(x, y)
        return ('<g class="sq-badge' + (" pub" if pub else "") + '"><ellipse class="sq-shadow" cx="' + js_fixed(cx) + '" cy="'
                + js_fixed(cy) + '" rx="12" ry="5"/><rect x="' + js_fixed(cx - 13) + '" y="' + js_fixed(cy - 29) + '" width="26" '
                'height="26" rx="8"/><g transform="translate(' + js_fixed(cx - 8.5) + " " + js_fixed(cy - 24.5) + ') scale(0.71)">'
                + SAFE_ICON[icon] + "</g></g>")

    def agent(x, y, z, size):
        cx, cy = p(x, y, z)
        return ('<ellipse class="sq-shadow" cx="' + js_fixed(cx) + '" cy="' + js_fixed(cy) + '" rx="' + js_fixed(size * 0.3)
                + '" ry="' + js_fixed(size * 0.12) + '"/>' + drawn_avatar("ops", js_fixed(cx - size / 2), js_fixed(cy - size * 0.93), size))

    def laptop(x, y):
        w, d, t, h = 58, 40, 4, 38
        face = [p(x + 5, y + 4, t + h - 4), p(x + w - 5, y + 4, t + h - 4), p(x + w - 5, y + 4, t + 5), p(x + 5, y + 4, t + 5)]
        keys = [p(x + 7, y + 13, t), p(x + w - 7, y + 13, t), p(x + w - 7, y + 30, t), p(x + 7, y + 30, t)]
        return (box(x, y, 0, w, d, t) + poly(keys, 'fill="#ecece6" stroke="none"') + box(x, y, t, w, 4, h, "#fff")
                + poly(face, 'fill="#eeeee8" stroke="none"'))

    def machine(x, y):
        s, t, g = 46, 12, 4

        def front(z):
            led, a, b = p(x + 7, y + s, z), p(x + 16, y + s, z), p(x + 34, y + s, z)
            return ('<circle class="sq-led" cx="' + js_fixed(led[0]) + '" cy="' + js_fixed(led[1]) + '" r="2.2"/><path class="sq-slot" '
                    'd="M' + js_fixed(a[0]) + " " + js_fixed(a[1]) + "L" + js_fixed(b[0]) + " " + js_fixed(b[1]) + '"/>')
        return box(x, y, 0, s, s, t) + box(x, y, t + g, s, s, t) + front(t + g + t / 2) + front(t / 2)

    return floor, badge, agent, laptop, machine


def no_way_across(x, y1, y2, yc):
    """The line nothing crosses: dotted, struck out at yc."""
    return ('<path class="sq-bar" d="M' + js_num(x) + " " + js_num(y1) + "V" + js_num(y2) + '"/><g class="sq-no"><circle cx="'
            + js_num(x) + '" cy="' + js_num(yc) + '" r="10"/><path d="M' + js_fixed(x - 3.6) + " " + js_fixed(yc - 3.6) + "l7.2 7.2M"
            + js_fixed(x + 3.6) + " " + js_fixed(yc - 3.6) + 'l-7.2 7.2"/></g>')


def drawn_window(x, y, w, h, rows):
    """A Buzz window facing the reader, as Buzz 1.0 draws a channel: the title bar, the channel's members and name, then
    each message as a grey bubble under its author. People get round pictures, the agent a square one and Buzz's robot
    mark. Each row's bw is its bubble's width until the page's script measures the words in the browser's font."""
    def face(name, cx, cy, r):
        return drawn_avatar(name, js_fixed(cx - r), js_fixed(cy - r), 2 * r)

    def icon(name, ix, iy, k, dim=False):
        return ('<g class="sq-wi' + (" dim" if dim else "") + '" transform="translate(' + js_fixed(ix) + " " + js_fixed(iy)
                + ") scale(" + js_num(k) + ')">' + SAFE_ICON[name] + "</g>")
    pill = 92
    px = w - 13 - pill
    body = ""
    for i, row in enumerate(rows):
        ry = 59 + i * 44
        when = row["who"] + '<tspan class="tm" dx="5">' + row["time"] + "</tspan></text>"
        if row.get("av"):
            who = face(row["av"], 22, ry + 25, 10) + '<text class="sq-wt nm" x="41" y="' + js_num(ry + 9) + '">' + when
        else:
            who = ('<rect class="sq-w-tile" x="12" y="' + js_num(ry + 15) + '" width="20" height="20" rx="6"/>'
                   + drawn_avatar("ops", "14", js_num(ry + 17), 16) + icon("robot", 41, ry + 0.6, 0.4)
                   + '<text class="sq-wt nm" x="53" y="' + js_num(ry + 9) + '">' + when)
        chip = ""
        if row.get("chip"):
            chip = ('<rect class="sq-w-chip" x="44" y="' + js_num(ry + 17.5) + '" width="38" height="15" rx="4.5"/>'
                    + icon("robot", 47, ry + 20.3, 0.4) + '<text class="sq-wt ch" x="59" y="' + js_num(ry + 29) + '">'
                    + row["chip"] + "</text>")
        body += (who + '<g class="sq-bub"><rect class="sq-w-bub" x="38" y="' + js_num(ry + 14) + '" width="' + js_num(row["bw"])
                 + '" height="22" rx="11"/>' + chip + '<text class="sq-wt" x="' + ("86" if row.get("chip") else "47") + '" y="'
                 + js_num(ry + 29) + '">' + row["text"] + "</text></g>")
    return ('<g class="sq-win" transform="translate(' + js_num(x) + " " + js_num(y) + ')">'
            '<rect class="sq-w-body" width="' + js_num(w) + '" height="' + js_num(h) + '" rx="13"/>'
            + "".join('<circle class="sq-w-light" cx="' + js_num(d) + '" cy="11" r="3.2"/>' for d in (14, 24, 34))
            + '<rect class="sq-w-panel" x="5" y="21" width="' + js_num(w - 10) + '" height="' + js_num(h - 26) + '" rx="10"/>'
            '<circle class="sq-w-ring" cx="20" cy="37" r="8"/>' + face("maya", 20, 37, 7)
            + '<circle class="sq-w-ring" cx="30" cy="37" r="8"/>' + face("leo", 30, 37, 7)
            + '<text class="sq-wt ttl" x="44" y="41">release</text>'
            '<rect class="sq-w-pill" x="' + js_num(px) + '" y="28.5" width="' + js_num(pill) + '" height="17" rx="8.5"/>'
            + icon("world", px + 6.5, 32, 0.42, True) + '<text class="sq-wt pl" x="' + js_num(px + 20) + '" y="40.4">Open '
            'community</text><path class="sq-w-rule" d="M5.5 53H' + js_num(w - 5.5) + '"/>' + body + "</g>")


SAY_AGENT = ("Your computer, with your files, keys and logins, set apart by a dotted line that nothing crosses. Beside it, a "
             "Buzz window: Maya asks the agent Ops to draft the notes, and Ops answers. A line runs from the agent's message to "
             "a small machine on a yellow floor, where the agent runs with one project.")
# The bubbles' widths until the script measures their words: wide enough for the fonts the page falls back to without
# Inter (Avenir Next, Segoe UI, a phone's own), a little roomier than the guide's, which measures Inter
WIDE_BUBBLES, TALL_BUBBLES = (142, 48), (184, 48)


def agent_wide():
    """On a wide drawing, left to right: your computer, the line nothing crosses, the community, the agent's machine."""
    width, height, mine, its = 560, 204, 88, 80
    a_floor, a_badge, _, a_laptop, _ = iso_kit(80, 46)
    c_floor, c_badge, c_agent, _, c_machine = iso_kit(483, 50)
    wx, wy, ww, wh = 186, 12, 206, 156
    oy, cy, cx, ex = wy + 59 + 44 + 25, 50 + its // 2, 483 - its * 0.866 - 2, wx + ww + 11
    return ('<svg class="sq-iso sq-wide" viewBox="0 0 ' + js_num(width) + " " + js_num(height) + '" role="img" aria-label="'
            + esc(SAY_AGENT) + '">' + a_floor(mine) + a_laptop(13, 6) + a_badge(10, 70, "folder") + a_badge(42, 76, "key")
            + a_badge(74, 70, "lock") + no_way_across(170, 10, height - 34, 90)
            + '<text class="sq-note" x="170" y="' + js_num(height - 14) + '">no way across</text>'
            + drawn_window(wx, wy, ww, wh, [
                dict(av="maya", who="Maya", time="10:02 AM", chip="Ops", text="draft the notes?", bw=WIDE_BUBBLES[0]),
                dict(who="Ops", time="10:03 AM", text="On it.", bw=WIDE_BUBBLES[1])])
            + '<path class="sq-wire" d="M' + js_num(wx + ww) + " " + js_num(oy) + "H" + js_num(ex - 5) + "Q" + js_num(ex) + " "
            + js_num(oy) + " " + js_num(ex) + " " + js_num(oy - 5) + "V" + js_num(cy + 5) + "Q" + js_num(ex) + " " + js_num(cy)
            + " " + js_num(ex + 5) + " " + js_num(cy) + "H" + js_fixed(cx) + '"/><circle class="sq-dot" cx="' + js_num(wx + ww)
            + '" cy="' + js_num(oy) + '" r="3"/><circle class="sq-dot" cx="' + js_fixed(cx) + '" cy="' + js_num(cy) + '" r="3"/>'
            + c_floor(its, True) + c_machine(17, 17) + c_agent(40, 40, 28, 54) + c_badge(72, 10, "folder", True) + "</svg>")


def agent_tall():
    """On a narrow drawing the window gets the full width, so its words stay readable. The agent's machine sits under
    the agent's message, your computer apart beside it. The guide draws their labels in; here they're the page's text
    under the drawing (TALL_CAPS), where they wrap instead of running into each other when a reader spaces text out.
    The drawing stops where the labels start, 311 of the guide's 348."""
    width, height, mine, its = 340, 311, 88, 80
    c_floor, c_badge, c_agent, _, c_machine = iso_kit(84, 222)
    a_floor, a_badge, _, a_laptop, _ = iso_kit(254, 216)
    wx, wy, ww, wh = 8, 6, 324, 156
    ax, by = wx + 22, wy + wh
    ty, head = by + 12, 222 + its // 2 - 28 - 47
    return ('<svg class="sq-iso sq-tall" viewBox="0 0 ' + js_num(width) + " " + js_num(height) + '" role="img" aria-label="'
            + esc(SAY_AGENT) + '">'
            + drawn_window(wx, wy, ww, wh, [
                dict(av="maya", who="Maya", time="10:02 AM", chip="Ops", text="can you draft the notes?", bw=TALL_BUBBLES[0]),
                dict(who="Ops", time="10:03 AM", text="On it.", bw=TALL_BUBBLES[1])])
            + '<path class="sq-wire" d="M' + js_num(ax) + " " + js_num(by) + "V" + js_num(ty - 6) + "Q" + js_num(ax) + " "
            + js_num(ty) + " " + js_num(ax + 6) + " " + js_num(ty) + "H78Q84 " + js_num(ty) + " 84 " + js_num(ty + 6) + "V"
            + js_num(head) + '"/><circle class="sq-dot" cx="' + js_num(ax) + '" cy="' + js_num(by) + '" r="3"/><circle '
            'class="sq-dot" cx="84" cy="' + js_num(head) + '" r="3"/>'
            + c_floor(its, True) + c_machine(17, 17) + c_agent(40, 40, 28, 54) + c_badge(72, 10, "folder", True)
            + no_way_across(170, 186, 310, 262)
            + a_floor(mine) + a_laptop(13, 6) + a_badge(10, 70, "folder") + a_badge(42, 76, "key") + a_badge(74, 70, "lock")
            + "</svg>")


def safe_icon(name):
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + SAFE_ICON[name] + "</svg>"


def drawing_caps(cls, caps):
    """The labels under a drawing of the agent, kept from screen readers: its description says them."""
    return ('<div class="' + cls + '" aria-hidden="true">'
            + "".join("<p><b>" + title + "</b><span>" + line + "</span></p>" for title, line in caps) + "</div>")


# Under the wide drawing, its three parts; under the tall one, its two, each centered under its part (x 84 and 254 of
# 340) and at the drawing's scale, as the guide draws them in
WIDE_CAPS = drawing_caps("sq-caps", [("Your computer", "your files, keys, logins"),
                                     ("Your community", "the agent sees what is posted"),
                                     ("The agent's machine", "one project only")])
TALL_CAPS = drawing_caps("sq-caps sq-caps-tall", [("The agent's machine", "one project only"),
                                                  ("Your computer", "your files, keys, logins")])
AGENT_FIG = (
    '<div class="sq"><figure class="sq-fig"><p class="sq-k"><i></i>What the agent can touch</p><span class="sq-rec">'
    'Recommended</span><div class="sq-stage">' + agent_wide() + WIDE_CAPS + agent_tall() + TALL_CAPS + "</div></figure></div>"
)


def tray_items(items, pub):
    return "".join('<li><span class="sq-b2' + (" pub" if pub else "") + '" aria-hidden="true">' + safe_icon(icon) + "</span>"
                   + text + "</li>" for icon, text in items)


# Two lists over one community: what's fine to share flows in, and what to keep out is struck through and stops short.
# Each says it's a list: Safari drops that from a list drawn without bullets.
NEWCOMER = '<span class="sq-new">' + safe_icon("user") + "</span>"
OPEN_FIG = (
    '<div class="sq"><figure class="sq-fig"><p class="sq-k"><i></i>What anyone who joins can read</p><div class="sq-lists">'
    '<div class="sq-tray"><p class="sq-h" id="sq-share">Fine to share</p><ul role="list" aria-labelledby="sq-share">'
    + tray_items([("doc", "Public docs"), ("branch", "Open-source code"), ("horn", "Announcements")], True) + "</ul></div>"
    '<div class="sq-tray sq-out"><p class="sq-h" id="sq-keep">Keep out</p><ul role="list" aria-labelledby="sq-keep">'
    + tray_items([("users", "Customer data"), ("branch", "Private repositories"), ("key", "Keys and logins")], False)
    + '</ul></div><span class="sq-flow" aria-hidden="true"></span><span class="sq-flow sq-stop" aria-hidden="true">'
    '<i class="sq-x">' + safe_icon("x") + '</i></span><p class="sq-room"><span class="sq-faces" aria-hidden="true">'
    '<svg class="sq-av"><use href="#sq-maya"/></svg><svg class="sq-av"><use href="#sq-leo"/></svg>' + NEWCOMER * 3
    + '</span><span class="sq-name"><b>Open community</b><i>anyone can join</i></span></p></div></figure></div>'
)


def drawn_profile_menu():
    """Buzz with the profile menu open beside your profile picture at the dock's foot, Settings highlighted
    (src/app/shell/ProfileButton.tsx)."""
    return drawn_app(
        '<div class="mb-pmenu"><div class="mb-pm-head"><span class="mb-pm-av id-me">' + ti("user")
        + "</span><span><b>Your profile</b></span></div><hr>"
        "<p>" + ti("device-desktop") + 'Appearance<span class="mb-pm-more">' + ti("chevron-right") + "</span></p>"
        "<p>" + ti("layout-grid") + "Plugins</p>"
        '<p class="on">' + ti("settings") + "Settings</p><hr>"
        "<p>" + ti("message-circle") + "Send feedback</p></div>"
    )


def bars():
    """A made-up barcode, as on the Buzz ID card: light bars on a dark strip. It encodes nothing."""
    x, out = 4, []
    for n in range(30):
        width = 1 + (n * 7 + 3) % 3
        out.append('<rect x="' + str(x) + '" y="4" width="' + str(width) + '" height="22"/>')
        x += width + 1 + (n * 5 + 1) % 2
    return ('<svg class="id-bar" viewBox="0 0 ' + str(x + 3) + ' 30" preserveAspectRatio="none" aria-hidden="true">'
            + "".join(out) + "</svg>")


def drawn_identity_settings():
    """Settings, Identity, in Personal space, once you copy the public key on the Buzz ID card
    (src/app/IdentitySettings.tsx and IdentityBadge.tsx). Buzz shows the key as its first 10 and last 10
    characters; the copy button copies all of it."""
    groups = [("Personal space", [("user", "Profile"), ("device-mobile", "Mobile app")]),
              ("Buzz", [("shield", "Identity"), ("lock", "Security"), ("palette", "Appearance"),
                        ("bell", "Notifications"), ("keyboard", "Shortcuts"), ("robot", "Agent setup"),
                        ("brain", "Decisions API"), ("copy", "Channel templates"), ("download", "Software updates")]),
              ("Plugins", [("layout-grid", "Manage plugins")])]
    page = (
        '<section class="mb-page id-page"><h5>Identity</h5>'
        '<p class="mb-sub">Your identity is shared across communities.</p>'
        '<div class="id-badge"><span class="id-more">' + ti("dots") + "</span>"
        '<div class="id-card"><span class="id-slot"></span><div class="id-photo"><span class="id-mono">Y</span>'
        '<span class="id-top"><span class="mb-av"><i>Y</i></span><b>Buzz ID</b></span></div>'
        '<div class="id-key"><small>PUBLIC KEY</small>' + bars() + '<span class="id-npub"><code>npub1qmz8w...7xj2d48k3a'
        '</code><span class="id-copy hot">' + ti("copy") + "</span></span></div></div></div>"
        '<div class="id-toast">' + ti("check") + "Buzz ID copied.</div></section>"
    )
    return settings_modal(settings_nav(groups, "Identity"), page)


def drawn_paste():
    """This page's first step, with the public ID pasted in."""
    return (
        '<div class="hw-page"><p class="hw-brand">Buzz Relay</p><h6>Host your Buzz community</h6>'
        '<div class="hw-step"><span class="hw-num">1</span><div><b class="hw-h">Owner</b>'
        '<p class="hw-label">Public ID (npub)</p><span class="hw-input">' + SAMPLE_NPUB + "<i></i><em>Pasted</em></span>"
        "</div></div></div>"
    )


def how_to_find_npub():
    # The shortcut first: Buzz 1.0.5, as 1.0.0, with no community opens a full-page Join a community, with no dock
    # and no profile picture, and the shortcut (Open Settings, Mod+, in src/app/shortcuts.ts) still opens Settings
    # there. First run's own Connect to a community page, which follows Create account, has neither: the app isn't
    # loaded until first run ends (Welcome.tsx).
    return how_to("Where to find your public ID", [
        ("Open Settings", drawn_profile_menu(),
         "In Buzz, press <code>\u2318,</code> on a Mac or <code>Ctrl+,</code> on Windows and Linux. Or click your "
         "profile picture at the bottom left, then <b>Settings</b>."),
        ("Copy your public ID", drawn_identity_settings(),
         "Under <b>Buzz</b>, choose <b>Identity</b>. On your <b>Buzz ID</b> card, click the copy button beside the "
         "key that starts with npub1. That's your public ID."),
        ("Paste it here", drawn_paste(), "Paste it into the box above. It starts with npub1."),
    ], 'You need Buzz on your computer. If you don\'t have it yet, <a href="' + BUZZ_APP + '" target="_blank" '
       'rel="noopener">install it</a>, but wait to set it up. Open <b>No Buzz identity yet?</b> below.')


def no_identity():
    """For owners new to Buzz: a key of their own. Buzz 1.0.5 on a computer, as 1.0.0, makes a key only with a
    Builderlab account, Block's, which keeps a backup Block can decrypt: Other options leads to Sign in with
    Builderlab or Use an existing key (Welcome.tsx, ConnectChoice.tsx). Either way this page gets only the public ID."""
    return (
        '<details class="alt"><summary>No Buzz identity yet?</summary><div class="inner">'
        "<p>Make your own key. It's yours alone, and nobody else keeps a copy. Use an open-source tool like "
        '<a href="' + NAK + '" target="_blank" rel="noopener">nak</a>, or a Nostr app you already use. Paste the '
        "public ID (npub1...) here. Keep the private key (nsec1...) safe, and never paste it on this page. "
        # nak key generate prints hex; Buzz's Use an existing key takes nsec1 only, and refuses ncryptsec1
        # (src/features/identity/key-import.ts at v1.0.5, the same as in 1.0.0)
        "nak prints keys in hex. Buzz takes the private key only as nsec1: convert it with <code>nak encode "
        "nsec</code>.</p>"
        "<p>Once your community is live, open Buzz and choose <b>Other options</b>. Paste the community's address "
        "and choose <b>Continue</b>, then <b>Use an existing key</b>, and paste your private key there. Buzz doesn't "
        "take a password-protected key. If Buzz already has a key on this computer, it doesn't offer <b>Other "
        "options</b> and joins with that key, so paste its Buzz ID here instead.</p>"
        "<p>Already use Buzz with a Builderlab account? Your Buzz ID works here too: copy it as shown above. "
        "Builderlab keeps a backup of your key that Block can decrypt.</p>"
        '<p class="muted small">Lost your key later? Come back to this page and use <b>Change the owner</b> in '
        "Settings.</p></div></details>"
    )


def setup_page(error="", values=None):
    values = values or {}
    owner = values.get("owner", "")
    body = (
        '<p class="eyebrow">Set up</p><h1>Host your <mark>Buzz</mark> community</h1>'
        + error_box(error) +
        '<form method="post" action="save" data-guided>'
        '<div class="step on"><span class="num">1</span><div class="step-body"><h2>Owner</h2>'
        "<p class=\"muted\">A new community starts with no members, and you'll be the first. Enter your public ID "
        "from Buzz: the relay records it as the owner when it starts. As the owner, you invite the other members "
        "and choose admins in Buzz. Your Umbrel never sees your private key.</p>"
        '<label class="field" for="owner">Public ID (npub)</label>'
        '<input type="text" id="owner" name="owner" placeholder="npub1..." autocomplete="off" spellcheck="false" '
        'value="' + esc(owner) + '">' + how_to_find_npub() + no_identity() + "</div></div>"
        '<div class="step on"><span class="num">2</span><div class="step-body"><h2>How members reach it</h2>'
        "<p class=\"muted\">How you set this up depends on what it's for: trying Buzz out, hosting an existing "
        "community, or a private group behind a VPN that only certain people can reach. Pick the option that fits "
        "you best.</p>" + address_fields(values, None) + "</div></div>"
        '<div class="step on"><span class="num">3</span><div class="step-body"><h2>Create it</h2>'
        '<label class="confirm-box"><input type="checkbox" name="ack" value="yes"' + (" checked" if values.get("ack") == "yes" else "") + ">"
        "<span><b>I understand that changing the address later starts a new, empty community.</b> Buzz can't move "
        "a community to a new address yet. Switching back to an old address brings its community back.</span></label>"
        '<button class="btn" type="submit">Create the community</button></div></div></form>'
    )
    return layout(body)


def status_html(items):
    out = []
    for entry in items:
        host = ""
        if entry["key"] == "device":
            host = ' data-host="' + esc(relay_domain()) + '"'
        out.append('<li class="' + entry["state"] + '"' + host + '><span class="icon"></span><span class="text">'
                   + entry["text"] + '</span><span class="hint">' + entry["hint"] + "</span></li>")
    return "".join(out)


def check_block(entry):
    """A check that isn't ok, with its hint, shown on its own: a problem tinted, a wait quiet. The script draws the
    private network's device check the same way (surface)."""
    return ('<div class="ck-top ' + entry["state"] + '" data-key="' + entry["key"] + '"><span class="icon"></span>'
            '<span class="text">' + entry["text"] + '</span><span class="hint">' + entry["hint"] + "</span></div>")


def check_card(items):
    """The live page's checks, one card: what isn't ok above the fold, problems first, then what still waits; the
    fold holds the whole list. The script's settle() counts it again after the device check."""
    bad = [e for e in items if e["state"] == "bad"]
    waiting = [e for e in items if e["state"] == "wait"]
    ok = len(items) - len(bad) - len(waiting)
    every = not bad and not waiting
    count = (str(len(items)) + (" check" if len(items) == 1 else " checks") if every
             else str(ok) + " of " + str(len(items)) + " checks")
    listed = status_html([e if e["state"] == "ok" else dict(e, hint="See above.") for e in items])
    return ('<div class="set-card ck-card' + (" ck-alert" if bad else "") + '">' + "".join(map(check_block, bad + waiting))
            + '<details class="ck-all"><summary><span class="ck-ico">' + ti("check") + '</span><span class="ck-sum">'
            + ("Everything works" if every else "Everything else works") + '</span><span class="val word">' + count
            + '</span></summary><div class="inner"><ul class="status">' + listed + "</ul></div></details></div>")


def bar_stages(setup, items):
    """While connecting, the stages in order, from the checks, as [label, state, checks, quiet], with the checks the
    page hasn't placed. A stage is done, bad, you (it waits on the owner, who can act now) or open; quiet is its
    checks that wait, to show under the bar while it's the current stage. The setup is saved by now, so the first
    stage is done. Each check sits in the stage it blocks: Buzz itself where the name or address answers, which it
    can't until Buzz runs, and the app's Cloudflare tunnel, set up after the sign-in, where Cloudflare publishes the
    name. The device check has no stage: it's for the live page, and before then a failure says nothing about this
    device."""
    mode = setup["mode"]
    by = {entry["key"]: entry for entry in items}
    placed = {"device"}

    def checks(*keys):
        placed.update(keys)
        return [by[key] for key in keys if key in by]

    def ok(found, *keys):
        return all(any(entry["key"] == key and entry["state"] == "ok" for entry in found) for key in keys)

    def stage(label, found, done, you=False, quiet=True):
        # A sign-in's one check says what its label says, and on the owner's turn the section below says what to do,
        # so neither shows under the bar
        bad = any(entry["state"] == "bad" for entry in found)
        state = "bad" if bad else "done" if done else "you" if you else "open"
        return [label, state, found,
                [entry for entry in found if entry["state"] == "wait"] if quiet and state != "you" else []]

    stages = [stage("Set up on this Umbrel", [], True)]
    if mode == "domain":
        tunnel = cloudflare_state()
        state = "creating" if tunnel["state"] == "signin" and upload_waiting() else tunnel["state"]  # an uploaded sign-in
        # Signed in once the tunnel is being set up or runs, or the name already answers (no row for the tunnel then).
        # The tunnel's errors come after the sign-in, a step Cloudflare refused or a name already taken, so they
        # block the name; a wrong domain needs a new sign-in, so it stays with the sign-in.
        tunnel_row = checks("cloudflare")
        signed = not tunnel_row or state in ("creating", "routing", "running", "taken", "error")
        stages.append(stage("Sign in to Cloudflare", [] if signed else tunnel_row, signed,
                            state == "signin" and bool(tunnel["link"]), quiet=False))
        name = (tunnel_row if signed else []) + checks("dns", "reach", "relay")
        stages.append(stage("Cloudflare publishes the name", name, ok(name, "reach", "relay")))
    else:
        step = tailscale_step(mode)
        machine = checks("tailscale")
        signed = ok(machine, "tailscale")
        # Tailscale starting, with no sign-in link yet, is this stage at work
        stages.append(stage("Approve buzz in Tailscale" if step == "approve" else "Sign in to Tailscale", machine, signed,
                            step.startswith("login") or step == "approve", quiet=False))
        if mode == "funnel":
            publish = checks("publish")
            stages.append(stage("Allow Funnel", publish, ok(publish, "publish"), signed and step == "consent"))
            name = checks("dns", "reach", "relay")
            stages.append(stage("Tailscale publishes the address", name, ok(name, "reach", "relay")))
        else:
            # Three stages: the address answers once its certificate is there and Buzz runs, both in the last
            publish = checks("publish", "relay")
            stages.append(stage("Allow HTTPS", publish, ok(publish, "publish", "relay"), signed and step == "consent"))
    if mode != "private":
        pair = checks("pair")
        stages.append(stage("Phones can pair", pair, ok(pair, "pair")))
    return stages, [entry for entry in items if entry["key"] not in placed]


STAGE_WORDS = {"done": "done", "you": "your turn", "work": "in progress", "wait": "not yet", "bad": "needs your attention"}


def spoken(found, shown=()):
    """Checks as sentences, for screen readers: each text, and its hint unless the check shows under the bar."""
    parts = []
    for entry in found:
        parts.append(entry["text"].rstrip("."))
        if entry["hint"] and not any(entry is other for other in shown):
            parts.append(entry["hint"].rstrip("."))
    return ". ".join(parts) + "." if parts else ""


def progress_bar(setup, items):
    """The connecting page's checks, as a bar: one segment per stage, done up to the current one, the earliest not
    done. The spinner and YOU sit there alone: it's at work while it waits on this Umbrel or a service, says YOU when
    it waits on the owner, or turns red with a problem. Later stages wait, even one whose checks pass already, unless
    a problem they have turns them red. Under the bar: each problem with its hint, then the current stage's checks
    that still wait, quietly, as the live card shows a check that waits."""
    stages, rest = bar_stages(setup, items)
    current = next((i for i, s in enumerate(stages) if s[1] != "done"), None)
    for i, s in enumerate(stages):
        if i == current and s[1] == "open":
            s[1] = "work"
        elif current is not None and i > current and s[1] != "bad":
            s[1] = "wait"
    blocks = ([e for e in items if e["state"] == "bad" and e["key"] != "device"]
              + (stages[current][3] if current is not None else []) + [e for e in rest if e["state"] == "wait"])
    segments = []
    for i, (label, state, found, _) in enumerate(stages):
        icon = {"done": ti("check"), "work": '<i aria-hidden="true"></i>', "bad": '<b aria-hidden="true">!</b>'}.get(state, "")
        tag = '<em aria-hidden="true">YOU</em>' if state == "you" else ""
        segments.append('<li class="' + state + '"' + (' aria-current="step"' if i == current else "") + '>'
                        '<span class="tr"></span><span class="lb">' + icon + "<span>" + label + "</span>" + tag + "</span>"
                        '<span class="vh">: ' + STAGE_WORDS[state] + ". " + spoken(found, blocks) + "</span></li>")
    said = spoken([e for e in rest if e["state"] == "ok"])
    # What a screen reader hears when the checks change: the current stage
    say = stages[current][0] + ": " + STAGE_WORDS[stages[current][1]] + "." if current is not None else ""
    return ('<ol class="bar" style="--n:' + str(len(stages)) + '" aria-label="Progress" data-say="' + esc(say) + '">'
            + "".join(segments) + "</ol>"
            + ('<div class="set-card ck-box' + (" ck-alert" if any(e["state"] == "bad" for e in blocks) else "") + '">'
               + "".join(map(check_block, blocks)) + "</div>" if blocks else "")
            + ('<p class="vh">' + said + "</p>" if said else ""))


def checks_html(setup, live, items):
    """What the 5-second refresh swaps in: the card on a live page, the bar while connecting. The phase says which,
    and a change of phase opens the page again."""
    return check_card(items) if live else progress_bar(setup, items)


def checks_sig(text):
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def tailscale_step(mode):
    """What the owner does next in Tailscale. The Connect section is drawn once per page load, so the
    page reloads when this changes, and a restarted machine's new sign-in link counts as a change."""
    state = tailscale_state()
    if state["backend"] in ("", "NoState", "Starting") or (state["backend"] == "NeedsLogin" and not state["auth_url"]):
        return "starting"
    if state["backend"] == "NeedsLogin":
        return "login-" + hashlib.sha256(state["auth_url"].encode()).hexdigest()[:8]
    if state["backend"] == "NeedsMachineAuth":
        return "approve"
    if published() == mode:
        return "published"
    return "consent" if consent_link() else "consent-wait"


def phase_of(setup, live, items=()):
    step = "-"
    if not live:
        step = cloudflare_step() if setup["mode"] == "domain" else tailscale_step(setup["mode"])
    elif any(entry.get("due") for entry in items):
        step = "moderation"  # moderation's address is due a look, which only a page load takes
    return setup["mode"] + ":" + ("live" if live else "connecting") + ":" + (relay_domain() or "-") + ":" + step


def copy_button(text, label="Copy", kind="copy-mini"):
    """A button that copies text: the text in a data attribute, never in the script. Without scripts it's hidden."""
    return ('<button class="' + kind + '" type="button" data-copy="' + esc(text) + '" onclick="copyText(this, '
            'this.dataset.copy)">' + label + "</button>")


def connect_steps(setup, domain, error=""):
    mode = setup["mode"]
    if mode == "domain":
        cf = cloudflare_state()
        state = cf["state"]
        uploaded = state == "signin" and upload_waiting()
        if uploaded:
            action = ("<p class=\"muted\">Signed in with your file. Setting up the tunnel and the name <code>" + esc(domain)
                      + "</code> in Cloudflare.</p><p class=\"muted small\">Delete the file from your computer and empty "
                      "the trash. " + TOKEN_NOTE + "</p>")
        elif state == "signin" and cf["link"]:
            action = ("<p>Sign in to Cloudflare, or create a free account. When it asks which domain to authorize, "
                      "choose the one <code>" + esc(domain) + "</code> is under. This app then sets up its tunnel and the "
                      "name in your Cloudflare account.</p>"
                      '<a class="btn" href="' + esc(cf["link"]) + '" target="_blank" rel="noopener">Sign in to Cloudflare</a>'
                      '<p class="muted small">The domain has to be on Cloudflare: buy one there, or add one you own to a '
                      "free Cloudflare account. The link works for about ten minutes, and a new one appears here after "
                      "that. This app keeps your sign-in only until the name is set up.</p>")
        elif state in ("", "signin"):
            action = "<p class=\"muted\">Starting Cloudflare's sign-in. This takes a few seconds.</p>"
        elif state in ("creating", "routing"):
            action = ("<p class=\"muted\">Signed in. Setting up the tunnel and the name <code>" + esc(domain)
                      + "</code> in Cloudflare.</p>")
        elif state == "running":
            action = ("<p class=\"muted\">The tunnel is set up. Cloudflare is publishing <code>" + esc(domain)
                      + "</code>: a few minutes, or longer for a brand-new domain. This page checks every few "
                      "seconds.</p>")
        elif state == "taken":
            action = ("<p><code>" + esc(domain) + "</code> already has a DNS record in Cloudflare. Delete it in "
                      "Cloudflare's DNS settings, or change the address to another name. This page tries again every "
                      "few seconds.</p>")
        elif state == "wrong-domain":
            action = ("<p>The domain you chose when signing in isn't the one <code>" + esc(domain) + "</code> is under. "
                      "Sign in again and choose that one.</p>" + cloudflare_reset_button())
        elif state == "error":
            problem = cloudflare_problem()
            action = ("<p>Cloudflare refused a step. This page tries again every few seconds.</p>"
                      + ('<p class="muted small"><code>' + esc(problem) + "</code></p>" if problem else "")
                      + cloudflare_reset_button())
        else:
            action = ""
        # Only before the sign-in: for a sign-in Cloudflare saved as a file, and for owners who already run
        # Umbrel's Cloudflare Tunnel app
        manual = "" if state != "signin" or uploaded else cert_upload(error) + (
            "<details class=\"alt\"><summary>Already use Umbrel's Cloudflare Tunnel app?</summary><div class=\"inner\">"
            '<p class="muted small">Then add a public hostname to your tunnel with these values instead of signing in. '
            '<a href="' + TUNNEL_GUIDE + '" target="_blank" rel="noopener">The app\'s guide</a> shows each screen.</p>'
            '<dl class="values"><dt>Hostname</dt><dd><code>' + esc(domain) + "</code>" + copy_button(domain) + "</dd>"
            "<dt>Service type</dt><dd><code>HTTP</code></dd>"
            "<dt>URL</dt><dd><code>" + GATEWAY_URL + "</code>" + copy_button(GATEWAY_URL) + "</dd></dl></div></details>"
        )
        return '<section class="part"><h2>Connect the name in Cloudflare</h2>' + action + manual + "</section>"
    step = tailscale_step(mode)
    if step == "starting":
        action = "<p class=\"muted\">Starting Tailscale. This takes a few seconds.</p>"
    elif step.startswith("login"):
        action = ("<p>Sign in to Tailscale, or create a free account. The link works until you use it.</p>"
                  '<a class="btn" href="' + esc(tailscale_state()["auth_url"]) + '" target="_blank" rel="noopener">'
                  "Sign in to Tailscale</a>")
    elif step == "approve":
        action = ('<p>Your Tailscale network needs you to approve new machines. Approve <b>buzz</b> in '
                  '<a href="' + TAILSCALE_ADMIN + '" target="_blank" rel="noopener">Tailscale\'s admin console</a>.</p>')
    elif step == "published":
        action = ""
    else:
        link = consent_link()
        action = ("<p>Tailscale asks you once to allow " + ("Funnel and " if mode == "funnel" else "") +
                  "HTTPS certificates for this machine.</p>" +
                  ('<a class="btn" href="' + esc(link) + '" target="_blank" rel="noopener">Allow it in Tailscale</a>' if link else
                   '<p class="muted small">Waiting for Tailscale to ask.</p>'))
    title = "Connect through Tailscale" if mode == "funnel" else "Connect your private network"
    return '<section class="part"><h2>' + title + "</h2>" + action + "</section>" if action else ""


def cloudflare_reset_button():
    return ('<form method="post" action="cloudflare-reset"><button class="btn small ghost" type="submit">'
            "Sign in to Cloudflare again</button></form>")


# The tunnel runs on its own token, and the app deletes the sign-in once the name is set up, so nothing needs
# the sign-in's API token after that
TOKEN_NOTE = ("Once your community is live, also delete this sign-in's token in Cloudflare, under My Profile, API "
              "Tokens. The tunnel doesn't need it.")


def cert_upload(error=""):
    """When Cloudflare's page says the sign-in worked but saves it as a file instead (cloudflare/cloudflared#1252),
    the owner uploads that file here, and the tunnel takes it as its sign-in. Open with an error inside."""
    return (
        '<details class="alt"' + (" open" if error else "") + "><summary>Cloudflare saved a file named cert.pem "
        'instead?</summary><div class="inner"><form method="post" action="cloudflare-upload" enctype="multipart/form-data">'
        "<p class=\"muted small\">Sometimes Cloudflare says you're signed in but saves the sign-in as a file on your "
        "computer. This page then keeps waiting. Upload that file here. It's usually in your Downloads folder.</p>"
        '<label class="field" for="cert">The file Cloudflare saved (cert.pem)</label>'
        '<input type="file" id="cert" name="cert" data-max="' + str(CERT_MAX) + '" required>'
        '<button class="btn small ghost" type="submit">Upload it</button></form>' + error_box(error)
        + '<p class="muted small">This app uses the file as your sign-in and deletes it once the name is set up. '
        "<b>Afterwards, delete it from your computer and empty the trash.</b> Anyone who has the file can add names to "
        "your domain and create or delete tunnels in your Cloudflare account. " + TOKEN_NOTE + "</p></div></details>"
    )


def private_members_note():
    return (
        '<div class="panel"><p><b>Each member needs:</b></p><ul>'
        "<li>The Tailscale app on every device, signed in.</li>"
        "<li>Access to your Tailscale network. Invite them, or share the <b>buzz</b> machine with them in "
        '<a href="' + TAILSCALE_ADMIN + '" target="_blank" rel="noopener">the admin console</a>. If you\'ve changed '
        'Tailscale\'s access rules, <a href="' + TAILSCALE_ACCESS + '" target="_blank" rel="noopener">allow them</a> '
        "to reach the buzz machine on port 443.</li>"
        "<li>Membership in the community, which you give in Buzz.</li></ul>"
        "<p class=\"muted small\">Without the first two, a device can't connect at all. Without the third, it "
        "connects but can't read or post.</p></div>"
    )


def notifications_note(setup):
    if not push_on(setup):
        return '<p class="note">Phone notifications are off. You can turn them on in Settings, further down this page.</p>'
    return ('<p class="note">iPhones get notifications for direct messages and mentions. Android phones don\'t '
            "yet.</p>")


def guide_frame(n, total, title, drawing, caption, more, ends, step_title):
    """One drawing of a step: Buzz's screen or the safety step's drawing, a stepper with its title, and what to do.
    ends says whether it's the guide's first and last drawing, where Previous and Next stop. Without scripts, the
    stepper's buttons stay hidden and every drawing shows."""
    first, last = ends
    return (
        '<div class="g-frame" data-say="' + esc(step_title + ", part " + str(n) + " of " + str(total) + ": " + title)
        + '">' + drawing +
        '<div class="g-row"><span class="g-n" aria-hidden="true">' + "%02d / %02d" % (n, total) + "</span>"
        '<span class="vh">Part ' + str(n) + " of " + str(total) + ": </span>"
        '<span class="g-t">' + title + '</span><span class="g-btns">'
        '<button type="button" data-go="-1" aria-label="Previous"' + (' aria-disabled="true"' if first else "") + ">"
        + ti("arrow-left") + '</button><button type="button" data-go="1" aria-label="Next"'
        + (' aria-disabled="true"' if last else "") + ">" + ti("arrow-right") + "</button></span></div>"
        '<p class="muted small g-cap">' + caption + "</p>" + more + "</div>"
    )


# The safety step, between inviting people and pairing a phone: what an agent can touch, what anyone who joins can
# read, then notes on private channels, invite links and bans, for the owner to share with members. What they state,
# from Buzz 1.0.5 (the same as in 1.0.0) and relay 0.3.0: in the relay's default media mode any member with a file's
# link can open it, one from a private channel included; invite links last 3 days with no use limit by default, 30 days
# at most (EXPIRY and USES in src/bundled/moderation/CommunityAdmin.tsx), and can't be canceled; removing a member isn't
# a ban, and Buzz offers the owner of a self-hosted community no ban unless Moderation is on, which needs the owner's
# own domain.
# The guide's "How should we run agents?" question
GUIDE_AGENTS = "https://self-host.buzz/#agents"
SAFE_INTRO = ("Opening your community to the internet exposes you to risk. So does adding agents with access to personal "
              "data. Here are some tips to keep yourself and your community safe.")
# The private network isn't on the internet
SAFE_INTRO_PRIVATE = ("Adding agents with access to personal data exposes you to risk. Here are some tips to keep yourself "
                      "and your community safe.")
AGENT_CAPTION = ("Agents made in Buzz can run on their owner's computer. If that computer holds private data, the agent may "
                 "be able to reach it. Agents take instructions only from their owner, but they read channel history to do "
                 "their work, and any text they read can be written to trick them. The risk is higher when anyone can "
                 "join. In an open community, run agents on a separate computer with nothing private on it, and don't "
                 "connect them to your email, drives or code. <a href=\"" + GUIDE_AGENTS + "\" target=\"_blank\" "
                 "rel=\"noopener\">The self-hosting guide</a> shows how to run an agent on its own server.")
OPEN_CAPTION = ("If anyone can join, strangers can post, and members can bring their own agents without asking you. Anyone "
                "who joins, and any agent they bring, can read every channel that isn't private, including its full "
                "history. They can also open files shared there and see who's a member. Keep private work, personal "
                "details and passwords out.")
PRIVATE_NOTE = ("Anyone in a private channel can add people and agents to it, so keep these channels to people you trust. "
                "Shared files are different: anyone in the community with a file's link can open it.")
# While moderation is on, members' private messages aren't private from the owner and the staff they add: the note
# leads with that. It names the owner, not "you", since the owner shares these notes with members.
MODERATED_NOTE = ("While Moderation is on, the owner and the staff they add can open any message stored here by its ID, "
                  "deleted ones included, even in private channels and direct messages.")
INVITE_NOTE = ("A new link works for 3 days with no limit on uses unless you change it, and for 30 days at most. You can't "
               "cancel a link yet, and someone you remove can rejoin with a link that still works.")
# A ban covers one identity and the agents it brings; links can't be canceled, so a person can come back
BAN_NOTE = {False: "To keep an identity out, turn on Moderation in Settings, then ban it in Buzz on a computer. The same "
                   "person can still join under a new identity.",
            True: "To keep an identity out, ban it in Moderation in Buzz on a computer. The same person can still join "
                  "under a new identity."}


def safe_steps():
    return [("Give each agent its own machine", AGENT_FIG, AGENT_CAPTION, ""),
            ("Treat an open community as public", OPEN_FIG, OPEN_CAPTION, "")]


def safe_notes(setup):
    """Under the safety step's drawings: private channels and invite links, and bans where moderation can be on, the
    owner's own domain. While it's on, the first note says who can read private messages, and the last how to ban.
    It says it's a list, for Safari, as the drawing's lists do."""
    on = moderation_on(setup)
    notes = [("lock", "Private channels.", (MODERATED_NOTE + " " if on else "") + PRIVATE_NOTE),
             ("link", "Invite links.", INVITE_NOTE)]
    if setup["mode"] == "domain":
        notes.append(("ban", "Bans.", BAN_NOTE[on]))
    return (
        '<div class="g-foot"><ul class="g-notes" role="list">' + "".join(
            '<li><span class="g-ni">' + ti(icon) + "</span><p><b>" + lead + "</b> " + text + "</p></li>"
            for icon, lead, text in notes)
        + '</ul><p class="muted small">Share these with your members. <a href="' + SELF_HOST_SECURITY + '" target="_blank" '
        'rel="noopener">More on security in the self-hosting guide</a></p></div>'
    )


def guide_part(setup, domain):
    """The live page's next steps, as a guide wider than the page: the steps down the left, with the self-hosting
    guide under them, and on the right one step at a time, its drawings one at a time with a stepper. Without scripts
    every step shows, one after the other, and the links on the left jump to them. #join, #invite, #safe and #phone
    open a step."""
    private = setup["mode"] == "private"
    address = "https://" + domain
    # Buzz's own link for a community's address (docs/deep-links.md in block/buzz-app at v1.0.5, the same as in
    # 1.0.0): it opens the join screen with the address filled in, or switches to the community if this computer
    # already belongs to it, and joins nothing by itself
    actions = ('<div class="g-acts"><a class="btn" href="buzz://connect?relay='
               + esc(urllib.parse.quote("wss://" + domain, safe="")) + '">Open in Buzz</a>'
               + copy_button(address, "Copy the address", "btn ghost") + "</div>"
               '<p class="muted small">Opens Buzz on this computer with the address filled in, once Buzz is set up.</p>')
    stores = ('<a href="' + APP_STORE + '" target="_blank" rel="noopener">App Store</a> or <a href="' + GOOGLE_PLAY
              + '" target="_blank" rel="noopener">Google Play</a>')
    # Each step: its link's title and line, its kicker and heading, a sentence, what comes before its drawings, the
    # drawings, and what comes after them
    steps = [
        ("join", "login", "Join your community", "First, as the owner", "Step 1 of 4", "Join your community",
         "Join in Buzz with this address, as the identity you entered as the owner.", actions, join_steps(domain),
         # Buzz's first run with a key of one's own (Other options, then Use an existing key): the guide shows it
         '<div class="g-foot"><p class="muted small">Made your own key? <a href="' + SELF_HOST_GUIDE + '" target="_blank" '
         'rel="noopener">The self-hosting guide</a> shows how to join with it.</p></div>'),
        ("invite", "user-plus", "Invite people", "With an invite link", "Step 2 of 4", "Invite people",
         "Send an invite link from Buzz. Whoever opens it joins in one step.", "", member_steps(domain),
         private_members_note() if private else ""),
        # before its drawings, the people and the agent in them, drawn once for both
        ("safe", "shield-check", "Keep it safe", "Agents and open communities", "Step 3 of 4", "Keep your community safe",
         SAFE_INTRO_PRIVATE if private else SAFE_INTRO, SAFE_DEFS, safe_steps(), safe_notes(setup)),
        ("phone", "device-mobile", "Pair your phone", "Optional", "Step 4 of 4 &middot; Optional", "Pair your phone",
         "Get Buzz on the " + stores + ", then pair it with Buzz on your computer."
         + (" The phone needs Tailscale too." if private else ""), "", phone_steps(domain),
         '<div class="g-foot">' + notifications_note(setup) + "</div>"),
    ]
    links, panes = [], []
    for s, (key, icon, title, sub, kicker, heading, sentence, before, frames, foot) in enumerate(steps):
        links.append('<a class="g-step" href="#' + key + '"><span class="g-tile">' + ti(icon) + '</span><span class="g-txt">'
                     "<b>" + title + "</b><small>" + sub + "</small></span></a>")
        drawn = "".join(guide_frame(n, len(frames), name, drawing, caption, more,
                                    (s == 0 and n == 1, s == len(steps) - 1 and n == len(frames)), heading)
                        for n, (name, drawing, caption, more) in enumerate(frames, 1))
        panes.append('<section class="g-pane" id="' + key + '"><p class="eyebrow">' + kicker + '</p><h2 tabindex="-1">' + heading
                     + '</h2><p class="muted">' + sentence + "</p>" + before + '<div class="g-frames">' + drawn + "</div>" + foot
                     + "</section>")
    further = ('<p class="eyebrow g-further">Go further</p><a class="g-out" href="' + SELF_HOST_GUIDE + '" target="_blank" '
               'rel="noopener"><span class="g-tile">' + ti("book") + '</span><span class="g-txt"><b>The self-hosting guide</b>'
               "<small>Roles, moderation, backups and agents</small></span>" + ti("arrow-up-right") + "</a>")
    return ('<section class="next"><p class="eyebrow">Next steps</p><div class="guide"><nav class="g-nav" aria-label="Next '
            'steps">' + "".join(links) + further + '</nav><div class="g-panes">' + "".join(panes) + "</div>"
            '<p class="vh g-say" aria-live="polite"></p></div></section>')


def address_change(setup, values, current):
    """What changing the address does, the three ways in a short list, and the address typed to confirm."""
    now = setup["mode"]
    chosen = values.get("mode", "")
    rows = [("domain", "Your own domain", "Recommended for most communities"),
            ("funnel", "A free Tailscale address", "Recommended for trying Buzz out"),
            ("private", "A private Tailscale network", "Recommended when the server must stay off the internet")]
    options = "".join(
        '<label class="opt"><input type="radio" name="mode" value="' + mode + '"' + (" checked" if mode == chosen else "")
        # the same Tailscale option again changes nothing; another domain is a change
        + (" disabled" if mode == now and mode != "domain" else "") + "><span><b>" + title + "</b><small>" + tag
        + "</small></span>" + ("<em>Current</em>" if mode == now else "") + "</label>"
        for mode, title, tag in rows)
    note = ("Changing the address starts a new, empty community. The current one stays on your Umbrel. Switch back "
            "to this address to bring it back.")
    if now != "domain":
        note += " Switching between the two Tailscale options keeps the same address."
    else:
        note += " On your own domain, moving to another address asks you to sign in to Cloudflare again."
    confirm = (
        '<label class="field" for="confirm">To confirm, type <code>' + esc(current) + "</code></label>"
        '<input type="text" id="confirm" name="confirm" autocomplete="off" spellcheck="false" data-expect="' + esc(current) + '">'
        if current else
        '<label class="check"><input type="checkbox" name="ack" value="yes"><span>I understand this starts a new, empty '
        "community.</span></label>")
    # What happens to moderation, for the option chosen
    moderation = ('<p class="muted small" data-for="domain">Moderation stays on, at the new address.</p>'
                  '<p class="muted small" data-for="funnel private">Moderation turns off: it needs your own domain.</p>'
                  if moderation_on(setup) else "")
    return (
        '<form method="post" action="address" data-guided><input type="hidden" name="owner" value="' + esc(setup["owner"]) + '">'
        '<p class="heads-up">' + note + '</p><div class="opts">' + options + "</div>"
        '<div data-for="domain">' + domain_field(values, "New address") + "</div>" + moderation + confirm
        + '<button class="btn small ghost" type="submit">Change the address</button></form>'
    )


# Relay 0.3.0 lets a relay operator rename a listed open channel without its admin API (operator_may_rename in
# handlers/side_effects.rs): staff with that role keep this one power while moderation is off
OPERATOR_RENAME = "Even while it's off, staff with the operator role can rename public channels."
STAFF_RETURN = ("Staff added before get their access back when you turn it on. " + OPERATOR_RENAME + " Review your "
                "staff in Buzz under Moderation, then Staff.")


def moderation_note(icon, lead, text):
    return '<li><span class="g-ni">' + ti(icon) + "</span><p><b>" + lead + "</b> " + text + "</p></li>"


def moderation_points(domain, live):
    """What moderation does while it's on, as the guide's notes. Members learn who can read their private messages
    from the Private channels note in the guide's safety step, which a live page has above Settings."""
    share = (' While it\'s on, the Private channels note in <a href="#safe">Keep it safe</a> says so.' if live
             else " Once your community is live, the Private channels note in the Keep it safe step says so while it's on.")
    return (
        '<ul class="g-notes mod-notes" role="list">'
        + moderation_note("flag", "Reports and feedback.", "You and your staff read reports, with who sent them, and the "
                          "feedback members send.")
        + moderation_note("eye", "Private messages.", "You and your staff can open any message stored here by its ID, "
                          "deleted ones included, even in private channels and direct messages. Buzz doesn't tell "
                          "members, so tell them." + share)
        + moderation_note("ban", "Bans.", "A ban keeps one identity out, with the agents that join through it. A new "
                          "identity can still join with a link that works.")
        + moderation_note("world", "Its own address.", "<code>" + esc(admin_origin(domain)) + "</code>, open only to "
                          "requests you or your staff sign.")
        + "</ul>"
    )


def moderation_part(setup, live, current, error, values):
    """Settings, Moderation: the relay's admin API, for Buzz's Moderation on a computer. Off by default, offered
    on the owner's own domain once the community is live. The Tailscale options show why it isn't there."""
    on = moderation_on(setup)
    opened = values.get("form") == "moderation"
    summary = "On" if on else "Off" if setup["mode"] == "domain" else "Own domain only"
    what = "Review reports, ban or time out members, and delete messages, in Buzz on a computer."
    staff = '<p class="muted small">' + STAFF_RETURN + "</p>" if setup.get("moderation") is False else ""
    box = ('<label class="check"><input type="checkbox" name="moderation" value="on"' + (" checked" if on else "")
           + "><span>Turn on moderation</span></label>")
    save_button = '<button class="btn small ghost" type="submit">Save</button></form>'
    if setup["mode"] != "domain":
        inner = ('<p class="muted small">Moderation needs your own domain for now. Buzz won\'t connect to it at a '
                 "Tailscale address.</p>")
    elif not on and not live:
        inner = '<p class="muted small">' + what + " You can turn it on here once your community is live.</p>" + staff
    elif not on:
        inner = ('<form method="post" action="moderation"><p class="muted small">' + what + " The phone apps don't "
                 "have it. When it's on:</p>" + moderation_points(current, live) + staff + box
                 + '<p class="muted small">Saving restarts Buzz for a few seconds.</p>' + save_button)
    elif not live:
        inner = ('<form method="post" action="moderation"><p class="muted small">Moderation is on. It starts working '
                 "once your community is live. While it's on:</p>" + moderation_points(current, live) + box
                 + '<p class="muted small">To turn it off, clear the box and save.</p>' + save_button)
    else:
        # Buzz keeps Moderation out of Settings without a word when its check fails, and says why only under
        # Manage plugins, as the tooltip of the plugin's button beside "Unavailable" (accessMessage in
        # src/app/Settings.tsx in block/buzz-app v1.0.5, the same as in 1.0.0): its three messages, and what each
        # means here. It shows the third for any 401 or 403 that isn't an HTML page (relay-staff/staff.ts), Cloudflare's
        # plain-text refusal and a lost port's included.
        inner = (
            '<form method="post" action="moderation"><p class="muted small"><b>To open it:</b> in Buzz on your '
            "computer, choose this community and open <b>Settings</b>. Moderation is the group in the sidebar with "
            "Reports, Feedback, Communities and Staff. Use the identity you entered as the owner, and if Settings was "
            "already open, close it and open it again.</p>" + moderation_points(current, live)
            + '<details class="alt"><summary>Moderation doesn\'t show in Buzz?</summary><div class="inner">'
            '<p class="muted small">In Buzz, open Settings, then Plugins, Manage plugins. If Moderation says '
            "Unavailable, point at its button to see why:</p>"
            '<ul class="g-notes mod-notes" role="list">'
            + moderation_note("alert-circle", "Could not check access.", "Your computer couldn't reach <code>"
                              + esc(admin_origin(current)) + "</code>. Some networks block port 8443 or send the name "
                              "to a local address. Try another network, then choose Check access again.")
            + moderation_note("clock", "Access is unavailable in this build or on this relay.", "Buzz doesn't see "
                              "moderation yet. Wait a minute, then close Settings and open it again with this "
                              "community chosen.")
            + moderation_note("user", "Select a community on a relay where you have staff access.", "Use the identity "
                              "you entered as the owner, or ask the owner to add you as staff. Also check that your "
                              "computer sets its clock automatically. If this page shows a moderation problem, fix "
                              "that first.")
            + '</ul><p class="muted small">If Moderation says Enable instead, choose it.</p></div></details>' + box
            + '<p class="muted small">To turn it off, clear the box and save. Buzz restarts for a few seconds. Bans, '
            "timeouts and staff stay as they are. Staff with the operator role can still rename public channels while "
            "it's off, so remove staff you no longer trust first.</p>" + save_button)
    return ("<details" + (" open" if opened else "") + '><summary>Moderation<span class="val word">' + summary
            + '</span></summary><div class="inner">' + inner + (error_box(error) if opened else "") + "</div></details>")


def settings_part(setup, error, values, live=False):
    current = relay_domain() or setup.get("domain") or ""
    owner = values.get("owner", "") if values.get("form") == "owner" else ""
    owner_now = setup["owner"]
    address_values = values if values.get("form") == "address" else {}
    # Staff rows outlive the switch and owner changes: whenever moderation has been on, the new owner should look, on
    # the owner's own domain, where Buzz can open it. The owner fallback follows the owner: the current one loses it.
    staff = ""
    if setup.get("moderation") in (True, False):
        staff = "Staff added in Moderation stay staff after the change, whenever Moderation is on. " + OPERATOR_RENAME
        if setup["mode"] == "domain":
            staff += " The new owner can review the staff in Buzz under Moderation, then Staff."
        if moderation_on(setup):
            staff += (" You lose Moderation after the change, unless the new owner adds you as staff, so remove staff "
                      "you no longer trust first.")
        staff = '<p class="muted small">' + staff + "</p>"
    return (
        '<section class="part"><h2>Settings</h2><div class="set-card">'
        "<details" + (" open" if values.get("form") == "owner" else "") + "><summary>Owner<span class=\"val\">" + esc(owner_now[:10] + "\u2026" + owner_now[-4:]) + "</span></summary><div class=\"inner\">"
        '<form method="post" action="owner"><p class="muted small">Make someone else the owner. The current owner '
        "becomes an admin, which you can change in Buzz. The community and its address stay the same.</p>" + staff +
        '<label class="field" for="new-owner">New owner\'s public ID (npub)</label>'
        '<input type="text" id="new-owner" name="owner" autocomplete="off" spellcheck="false" placeholder="npub1..." value="' + esc(owner) + '">'
        '<button class="btn small ghost" type="submit">Change the owner</button></form>'
        + (error_box(error) if values.get("form") == "owner" else "") + "</div></details>"
        "<details><summary>Phone notifications<span class=\"val word\">" + ("On" if push_on(setup) else "Off") + "</span></summary><div class=\"inner\">"
        '<form method="post" action="notifications"><p class="muted small">When this is on, members\' iPhones get '
        "notifications for direct messages and mentions, through Block's push service. Android phones don't "
        "get notifications yet. Message text, senders and channels never leave this Umbrel. Block's service "
        "does see this Umbrel's internet address, and which phones it wakes and when. Apple sees when a phone "
        "is woken. Saving restarts Buzz for a few seconds.</p>"
        '<label class="check"><input type="checkbox" name="push" value="on"' + (" checked" if push_on(setup) else "")
        + "><span>Send phone notifications</span></label>"
        '<button class="btn small ghost" type="submit">Save</button></form></div></details>'
        + moderation_part(setup, live, current, error, values) +
        "<details" + (" open" if values.get("form") == "address" else "") + "><summary>Address<span class=\"val\">" + esc(current or "none yet") + "</span></summary><div class=\"inner\">"
        + address_change(setup, address_values, current)
        + (error_box(error) if values.get("form") == "address" else "") + "</div></details></div></section>"
    )


def main_page(setup, error="", values=None):
    values = values or {}
    live, items = cached_check(setup, page_load=True)
    mode = setup["mode"]
    domain = relay_domain() or setup.get("domain") or ""
    checks = checks_html(setup, live, items)
    status = ('<div class="checks" data-poll data-phase="' + esc(phase_of(setup, live, items)) + '" data-sig="'
              + checks_sig(checks) + '">' + checks + '</div><p class="vh" role="status" data-said></p>')
    if not live:
        head = ('<p class="eyebrow">Connecting &middot; ' + MODE_NAMES[mode] + "</p><h1>Connect "
                + ('<mark>' + esc(domain) + "</mark>" if domain else "your <mark>address</mark>") + "</h1>"
                '<p class="lede">' + {
                    "domain": "Your community is set up on this Umbrel. Next, connect its name in Cloudflare so members can reach it.",
                    "funnel": "Your community is set up on this Umbrel. Next, Tailscale gives it a public address.",
                    "private": "Your community is set up on this Umbrel. Next, Tailscale puts it on your private network.",
                }[mode] + "</p>")
        body = head + status + connect_steps(setup, domain, error if values.get("form") == "cert" else "")
        if mode == "private" and domain:
            body += '<section class="part"><h2>Who can connect</h2>' + private_members_note() + "</section>"
        return layout(body + settings_part(setup, error, values, live))
    reach = {"domain": "from anywhere",
             "funnel": "from anywhere, without Tailscale",
             "private": "from devices on your Tailscale network"}[mode]
    body = (
        '<p class="eyebrow">Live &middot; ' + MODE_NAMES[mode] + '</p><h1>Your community is <mark>live</mark></h1>'
        '<p class="lede">Only people you invite, and the agents they bring, can read or post. They join with your '
        "invite link, or in Buzz with this address, " + reach + ".</p>"
        '<div class="address"><code><span>https://' + esc(domain) + "</span></code>"
        + copy_button("https://" + domain, "Copy", "btn") + "</div>"
        + status + guide_part(setup, domain)
    )
    return layout(body + settings_part(setup, error, values, live), safety=True)


# The safety drawings' people and agent, each drawn once and used wherever it shows: #sq-maya and #sq-leo, cut round,
# and #sq-ops. Maya and Leo are Notionists by Zoish (CC0 1.0), made with DiceBear, as the self-hosting guide has them
# (site/src/assets/avatars on main), less their metadata. Ops, the agent, is a Fuzzy from Buzz's agent avatar packs
# (block/buzz-app, src/features/agents/avatar-packs, Apache 2.0, the same at v1.0.5 as at v1.0.0), resized to 112
# pixels, as WebP.
AVATAR_MAYA = (
    '<rect fill="#c0aede" width="1744" height="1744"/><g transform="translate(531 487)"><path d="M554 727.7c-99.2 297'
    '-363.8 388.6-503.7 19.8-19.3-50.7 31-69.5 66.2-91.9 24.1-15.3 36.8-28.5 35.3-42.2-7-64.4-36.9-243.8-36.9-243.8l-'
    '3-5.8s.7-1.6-2.2 1.2c-3 3-9.9 34.2-37 34.2-24.5 0-49.2-10.9-61-86.3C7.2 285.6 9.6 214 40 201c12.5-5.3 24-7.2 35.'
    '2-.8 11.3 6.4-13-22 112-126C268.4 6.4 396.7-3.5 448.5 8 500.3 19.5 552 44.8 574.9 98.5c27.8 65-25.9 114.3-14 262'
    '.5-2.2 53.6.8 171.2-146.6 210.6-28 7.5-19.3 48.4 22.7 58.4 67 21 117 72.3 117 97.9" fill="#fff"/><path fill-rule'
    '="evenodd" clip-rule="evenodd" d="m554 266.2.1-1.4c4.1-36.4 8.2-71.7 27.1-103.4 6.5 4.4 5.7 10 3.7 15.2-19.9 51.'
    '2-18 104.4-16.2 157.6l.4 14c2.1 66.4-14.5 126.8-58.7 177.5-15.4 17.6-35.8 29.8-56.5 40.3-21.4 11-25.9 20.1-19.2 '
    '43.6l.8 2.6c1.4 3.9 2.8 7.9-1 11.8-4.5 4.6-9.5 3.3-14.8 1.8l-.6-.1a406.4 406.4 0 0 1-137-68.3c-6-4.4-10.8-10.3-1'
    '5.5-16.1l-.3-.4c-2.5-3-3-7.8.5-10.4 3.3-2.5 5.8-.5 8.7 1.8l1 .9a145.5 145.5 0 0 0 76.3 31.7c13.4 1.4 26.6.9 40 .'
    '4 7.4-.3 14.8-.6 22.3-.5 10.2 0 18.7-4.7 26.7-9.2l2.8-1.6c27.8-15.5 54.3-32.8 72.2-60.7 16.1-25 25.9-52.2 31.6-8'
    '0.9 7.2-36.1 6.6-72.7 6-109.8-.3-12-.5-24.2-.5-36.4ZM50.6 190.8c21.9-1.7 34 11.2 44.3 26.3a140.4 140.4 0 0 1 22.'
    '4 61.5c.5 3.7 1 7.6-1.2 11.3-4.5.6-4.9-3-5-5.6-.5-20.7-9.7-38.7-18.9-56.1-6.6-12.5-16.2-24.6-31.4-27.6-17.2-3.5-'
    '33 12-40.8 32.2-14.5 37.6-12 74.6 1.4 111 5.8 15.9 13.1 32.1 27.8 43.2 14.8 11.3 32.7 9.3 43.6-5.7l2-2.5c2-2.6 4'
    '-5.1 5-8 2.1-5.8 5.4-11.2 11.3-10.4 6.8 1 8 8.3 8.7 14a3661 3661 0 0 0 22 156.7l5.9 38.8c2.6 17.1 5.6 41.7 3.6 5'
    '2.1a28 28 0 0 0-.3 2.2c-.4 2.8-.6 5-4.2 5.5-4.9.8-7-2-7.7-6.4-2.3-17-3-23.6-4-49.6-.9-25.2-5.6-50-10.4-74.9l-5-2'
    '7c-5.2-30.8-10.3-62-10.8-97l-2 3c-7.6 11.3-13.7 20.5-24.5 24a40.5 40.5 0 0 1-46.1-12.5 127.8 127.8 0 0 1-28.8-55'
    '.8c-8.4-34-9.9-67.1.9-100.6 5.2-16.1 23.7-44.7 42.2-42Zm34.6 127.5c4.4 3.2 8.4 6 12-5.4-1.1-42.2-14.7-69.2-35.8-'
    '70.3 11.2 14.6 22 28.8 23 48.5a32.3 32.3 0 0 1-10.7-8.8c-2-2.2-4-4.4-6.5-6l-3-2.4c-4.8-3.6-9.7-7.4-17.8-4.5 3.8 '
    '5.8 9 10 14.3 14 6 4.7 12 9.3 15.6 16.5-10.6 7.7-15.2 17.7-9.7 29.9 4.8 10.5 11.9 19.2 25.9 19.8-.6-6.3-4.7-10.9'
    '-8.8-15.4-5-5.4-9.7-10.6-7.5-18.6 3.2-1.5 6.2.7 9 2.7Z" fill="#000"/></g><g transform="translate(178 1057)"><pat'
    'h d="M1308 692 16 688.7S53.7 481.5 111.3 360C237.7 93.7 491.2 44.3 513.3 56.7c32 18 62.4 40.7 152 40.7 91.4 0 14'
    '9.3-39.5 149.3-39.5s135.8 32.3 201.4 69.5c83.4 47.4 177.7 187 221 295.9 46.2 115.6 71 268.7 71 268.7Z" fill="#ff'
    'f"/><g fill="#000"><path d="M728.6 692c-4.3-25.7 12-38.5 31-49.3 10.9-6.2 27.6-3.2 39 6 7.7 6 8.4 15.2 11.3 23.4'
    ' 1.7 4.7 2.4 9.8 3.6 14.7 6.4 3 13.7-.6 20.2 4.4a455 455 0 0 1-49.2-.2c-1.3-7.2-2.2-13.2-8.8-15.6-6.1-2.1-10.4 2'
    '.2-14.3 6-2.9 2.7-3.1 6.7-3.3 10.6-3.2 0-6.3-.3-9.4-1-2-12.7 5.2-19 14.4-23 18.2-8 26.4 4.7 33.5 21.6 2.8-18.8-2'
    '.6-35.2-11.6-36.7-12.8-2-25.8-3.2-36.6 8a54.2 54.2 0 0 0-13.1 31h-6.7ZM1182.7 692c4.9-29.4 27.1-45.5 56.5-41.7 1'
    '4.7 2 26.7 19.7 26.5 40.6a25 25 0 0 1-11.8.3c-3.2-25.6-11.3-32.4-33.8-28.7-14 2.3-26.6 16.8-25.8 29.5h-11.6ZM477'
    '.6 692a53 53 0 0 1 24.2-34.7c27.4-16.8 50-8.6 59 22.3 1 3.6 2.5 7.1 4.1 11.6-5.2.8-10.6.8-15.9 0 .6-15.7-5.5-27.'
    '3-16.1-28.7-19.8-2.7-39.5 5.7-43.6 29.5h-11.7ZM107.4 692c-4.3-17.2-27.2-35.2-45.3-35-17.4.4-30.5 13-34.2 34-2.1 '
    '1-4 1-6.9 1 .4-23 9.3-37.2 25.2-41.8 24.3-7 46.6.9 62 22 5.5 7.3 8.1 17.8 20.4 19-6.3.8-13.2.8-21.2.8Z"/><path d'
    '="M498 692c12.7-17.4 23.2-21.3 35.8-15.2 6.1 3 7.4 8.8 11 14.3-15 .9-30.3.9-46.8.9ZM1203.1 692c15.3-23.6 31.4-24'
    ' 46.6-.8-14.9.8-30.1.8-46.6.8ZM38.8 692c4.6-15.7 17.4-19.8 32-20.2 12.6-.2 21.4 5.9 25.4 19.2-2 1-3.9 1-7.3.3-17'
    '.6-15-32.3-14.6-41 .7h-9ZM671.6 478.7c35.7 22.3 35.5 53.2 33.8 86.4-.1 3.3-1.5 5.9-5 6.3-3.4.3-5.7-1.6-7.1-4.4-2'
    '-4-1.5-8.2-.7-12.5 3.5-17.5 0-33.8-8.5-49.2-7.2-12.6-32.2-22.1-50.7-19.2a55.6 55.6 0 0 0-47 52c-.2 3.5 1.3 8.9-4'
    '.4 8.8-5.3 0-4.6-5.1-4.8-8.8a62.8 62.8 0 0 1 56.2-64.3c12.7-1 25.3-.4 38.2 4.9ZM906.3 348.4c-14.8-23-35.3-30-60.'
    '6-26.3-20.7 3-37.3 24-38.9 50-.4 7.6.4 15.3 2.2 22.7 1.5 6.1-.6 12-6.9 13-6.8 1.2-7.9-5.4-8.4-10.3-2.6-26 2.6-50'
    '.8 19.2-70.7 14-16.8 35-18.9 55.8-16.3 31 3.7 52 26 54.5 59.7.3 4.6.8 9.5-5.8 11.7-7-9.8-1.8-23.7-11-33.5ZM365.6'
    ' 380.4c-17.1 16-20 36.2-17.7 57.4-8.2.6-8.9-4.2-9.7-8.1a66 66 0 0 1 28.6-64.9c24.2-14.5 57.4-14 75.7 3.4a90.8 90'
    '.8 0 0 1 27.2 66.4c0 3.9-.2 8.2-5.5 8.2-5 0-7.7-3.5-8.4-8.1-1.2-8-2-16-3.1-24.1-6-46-57.7-54.8-87.1-30.2ZM1172.3'
    ' 432.6c-.2 5.5-.2 10.3-6.5 9.5-6.5-.9-7.5-6.2-7.7-11.5-.4-15-2.8-29.4-10.3-42.7a37.5 37.5 0 0 0-25.5-19.2c-43.7-'
    '8.9-73 19.5-72.1 58.6 0 3.7 1.4 7.7-2.6 11.3-6.9-1.2-7.5-7.4-7.5-12.3-.6-48.8 35.7-77.3 80.7-70 25.6 4.2 37.8 22'
    '.6 45.5 44.3 3.4 9.6 7.7 20 6 32ZM561.1 270.8c20.9-18.4 42-14.7 62.6-2.3a49.1 49.1 0 0 1 26 47.5c-.3 5.4-.4 11.1'
    '-6 14.5-6.3-2.3-4.6-7-4-11.6 3.4-28.6-30.3-58.8-57.3-50-13.2 4.5-20.7 17-23.5 31-1.8 8.7-2.1 17.7-3.1 26.6-.5 4.'
    '1 0 9.9-5.8 9.6-6-.3-8-5.3-7.4-11.2 1.8-19.2 5.5-37.8 18.5-54.1ZM204.3 530c4.2 10 7 20.7 8 31.6.5 5 1 9.3-6 11.1'
    '-3.1-11-6-21.5-9.3-31.8-4.2-12.7-21.6-24.6-34.3-24-17.3.6-25.9 11.2-25.4 30.8.2 10.4 5.2 20.7.5 31.7-6 .4-11.2-1'
    '.4-11.8-7.1-1.2-11.8-4.3-23.4-1.6-35.4 7-30.7 36-41.9 64.9-21.8a49.7 49.7 0 0 1 15 15ZM895.9 217.6c-.6 5-1.3 9.4'
    '-6.7 8-4.4-1.2-3.2-5.2-3-8.6 2.7-32.5-18.2-46.6-41.8-53.4-12-3.5-26.1 5.2-32.6 18.6a58.9 58.9 0 0 0-7.4 31.7c.2 '
    '3 .1 6-.2 9-.3 4.7-.2 10.2-7 9.5-6-.6-7-5.6-6.6-10.5 1.7-17.2 3.7-33.8 13.6-49.4 13.8-21.8 46.8-20 63.5-10.5 20.'
    '9 12 32 29.4 28.2 55.6ZM396.8 148.8c3.2 10.2 6.5 19.4 8.8 28.9 1.7 6.8.2 12.7-9.2 14l-8.8-33.1a48 48 0 0 0-9.7-1'
    '9.1c-14.3-16.8-27-19.2-45.2-7-18.4 12.5-30 28.7-23.8 52.8.7 2.6.9 5-3 8.7-8.4-7.6-10.4-17.3-8.8-27.6a57.4 57.4 0'
    ' 0 1 50.4-47.9c21.4-3 38.3 6.8 49.3 30.3ZM876.6 519c-26.6-4.5-40.6 9.8-35.9 36 1 5.9 2.5 11.6 2.2 17.6-.2 3.6-.8'
    ' 7.4-5.3 7.2a7 7 0 0 1-6.8-6.5c-1.8-15.6-4-31.2.4-46.8 3.4-12.1 24-24.8 37.8-21.5 21 5 45.3 18.8 44.6 47.5-.2 6.'
    '6 6.5 14-3 21-9.8-19.2-6.5-46.6-34-54.5ZM357 664.1c-4-30.4-35.2-50.7-61-40.6-14.4 5.7-22 23.3-18.4 43 .8 4.5 3.5'
    ' 8.9-1.3 14.6-14.2-11.2-8.5-26.6-7.8-39.4.7-16.4 17-30 34.6-32.2 24-3 51.3 12.5 59.7 34.1 5.4 13.8 5 31-1 35.3-4'
    '.9-3.4-4.2-8.8-4.8-14.8ZM991.9 628.3c-12 12.8-16.2 26.5-9.1 42.5 1.4 3.2 3 6.9-1.4 8.6-4.5 1.7-5.5-2-7-5.3-8.6-2'
    '0-2.2-47.4 13.5-57.8 19.6-12.8 48.6-7.2 67.3 10.9 13 12.6 11.8 29.2 15.8 44.4a6 6 0 0 1-5.3 7.4c-3.8.4-4.7-3.2-5'
    '.3-6-.8-3.7-.8-7.6-1.1-11.4a44.2 44.2 0 0 0-67.4-33.3Z"/><path d="M605.3 545.1c-1.4 3.2-1.9 6.2-5.2 6-3.6-.4-4.6'
    '-3.3-5-6.4a43.8 43.8 0 0 1 10.1-33.1C618.6 495.4 638 491 658 494c9 1.4 14.8 10.8 18 18.5a60 60 0 0 1 2 41.2c-.8 '
    '2.5-1.4 5-4.6 5.1-3.1.1-4-2.3-5.3-4.6-2.4-4.4-1.8-8.6-.7-13.4 2.5-10.9.8-21-7.9-29.1-8.5-8-17.6-5.3-27.2-2.5-17.'
    '5 5.2-24.3 18.1-27 35.8ZM368.6 412.8c-1.5 10 2.3 19.5-3 28.2-8.8-6.7-11.2-23.8-6-38.5 4.8-14.4 25.6-25 45.9-26.5'
    ' 16.6-1.2 27.4 10.2 33.5 30 3.2 10.3 6.3 20.8-3 29.8-6.5-2.7-5.9-7.3-5.9-11.4 0-8-2.2-15.3-5.3-22.2-6-13.6-18.2-'
    '17.6-31.5-11-9.7 5-20 9.4-24.7 21.6ZM1114 388.4c-34 1-45.5 21.3-43.9 53.5a34.6 34.6 0 0 1-3.2-45.5c15.7-19.3 45.'
    '8-26.8 60.2-15 15.6 12.9 22 39.7 11.7 53.7-11.2-14.2-4-37.8-24.7-46.8ZM903.5 374.3c-.8 4.9 1.8 11.2-4.5 11.1-5.8'
    ' 0-4.4-6.1-4.8-10.1-2-19.1-25.3-36.6-43.7-32.2-11.6 2.9-17.2 11.2-18 23-.7 9.6 1.9 19.4-2.2 28.7-9.3-3.6-13.2-21'
    '-9.3-39.1 3.6-16.7 21.4-28 42.4-25 19.3 2.8 41.6 16.6 40 43.6ZM129 380.3c.7 5.9-.2 10.3-3.6 14-11.7-8.4-12.4-34.'
    '2-1.4-50.3 12.3-18.2 36.5-19 61.9-2.2 12.4 8.3 18.3 31.3 10.7 43.8-6.7-2.7-6-9.4-7.4-14.7-4.5-17.4-24.7-31.2-42-'
    '28.2-13.6 2.2-21.5 18-18.2 37.6Z"/><path d="M216.1 352c-.2 6.2 2.4 10.8 3.9 15.6 1.6 5.6 1.2 10.6-6.3 15-7-46.8-'
    '32-68.7-79-59.4-.6-9.3 4.3-12.2 9.6-12.7 31.1-3.1 56.2 5.3 71.8 41.4ZM884 536c13.3 15.8 14.8 21.7 9 33.5-7.2-5.3'
    '-7.9-14.7-13.6-20.9-4.8-5.3-9.6-8.3-16.4-5.9-6.4 2.4-4.8 8.2-4.4 13.2l1.2 13.9c.4 3.7 2 8.3-3.3 9.4-4.7 1-7.8-2.'
    '3-9.5-6.6-3.6-8.5-.3-31 5.8-36.2 9.7-8.2 20.2-6.2 31.3-.3ZM296.5 666.4c-2.4 2.1-3 6.3-7.1 6.6-6.8-10.9-5.3-23.4 '
    '3.6-31.6a34.9 34.9 0 0 1 43.1-2.6c7.4 5.4 12.4 27 8.3 35-1.3 2.2-2.5 4.6-5.7 3.9-2.8-.6-4.2-2.7-4.5-5.5-.2-3.3-.'
    '2-6.8-.3-10.2-.7-12.7-9.1-20.7-21-20-12.6.6-18.1 8-16.7 23.6l.3.8ZM629.5 318.8c-5.2 5.3-7.8 3.2-9-2.3-.7-3.3-.2-'
    '7-1.7-9.9a23.8 23.8 0 0 0-20.2-13c-9.3-.6-11.3 6.8-15 13-3.8 6.6-1 15.4-7.8 21.4-12.6-4.2-7.2-14-5.2-20.8 5.6-19'
    '.2 16.8-25.6 36.2-22.6 13 2.1 23.5 17.4 22.7 34.2ZM166.6 530.8c20 5.6 31.2 24.2 22.7 39.2-3.3-9-9-15.4-13.7-22.4'
    '-4.4-6.4-10.6-7.3-16.8-4.7-6 2.4-6.3 8.5-5.4 14.2.7 4.2 1.9 8.3 2.7 12.4.8 3.7 2.6 8.5-2.8 9.4-4.7.9-8.8-1.3-11-'
    '6.5a30.3 30.3 0 0 1 24.3-41.6ZM316.5 174.9c2.7-16.6 9.6-27.5 27-30 18.4-2.6 36.2 12.9 35 31.7-.3 4-.4 8.3-5.5 8.'
    '6-5 .3-6-3.6-6.4-7.8-.3-2.9-.4-6.1-1.8-8.6-4-7.7-6.8-17.5-17.7-17.7-8-.2-19.9 13-21.6 22.5-.7 3.5 1 7.7-2.6 10.7'
    '-5-.6-5.2-4.9-6.4-9.4ZM1029.6 645.7c-26.6-11.3-31.4 7.2-35.7 26.8-5.2-11.7-4.7-22 2-30.7 6.2-8.2 26.4-11.7 36.6-'
    '7.5 10.5 4.3 16 12.4 15.4 23.8-.4 6.6 4.2 18.4-3.8 18.8-9.8.6-4.1-11.1-5.2-17.3-1-6-3.8-10.2-9.3-14ZM857.7 183.2'
    'c16.8 6.2 21.5 17.5 15.7 36-6.4-1-4.3-6.5-4.9-10-1.7-9.3-7-14.9-15.2-18.6-9.7-4.3-16.5-1-20.4 8.3-2.3 5.4-3.9 11'
    '.1-4.8 17-.6 4.6-1.8 7.6-6.8 6.5-4.4-1-5.3-4.4-4.8-8.9 2.6-25.7 13.5-34 41.2-30.3ZM1016.5 152.4c-7.8 13.1-1.4 27'
    '.4-5.4 40.4-11.3-5-14.5-25-7.1-38.7 11.7-21.4 15.7-24.4 25.4-18l-13 16.3ZM643.4 546.3c-.2-7 0-14.6-6.7-16.1-9.7-'
    '2.1-10.5 9-15.4 14-6-6.4-4.7-16.4 2.4-22 8.3-6.7 19.7-6.3 24.5 2 3.4 5.7 4.7 12.6 6.3 19.1.7 2.8.4 6.3-3 7.7-3.7'
    ' 1.5-6.5.4-8-4.7ZM877.8 379.4a82.1 82.1 0 0 1-4.6-8.3c-2-3.6-4.7-6.3-9-5.2-3.6.8-5.6 3.6-6.1 7.3-.4 3.3-.4 6.7-1'
    ' 10a4.8 4.8 0 0 1-4.2 4c-3 .5-4.6-1.6-5.6-4-3.3-7.8 3.9-24.5 12-27.9 9-3.8 20 2 23.8 12.8 1.6 4.8 3.4 10.3-5.3 1'
    '1.3ZM393.4 402c14.4 1.7 20.7 8.7 21.7 22.5.3 3.1.7 6.2-3.2 7-4 1-6.5-.7-7-5-.3-2.5-.2-5.3-1.2-7.5-1.8-4-5.8-6.6-'
    '10.1-6.5-4.2 0-4.9 4-6.3 7.1-1.7 3.6.1 8.9-5 10.9-10.6-10.3-6.4-22.3 11-28.4ZM1248.8 517.4c-4.6 12.5-1.5 25.9-8.'
    '8 37.7-10-29.2.2-61 25.8-61.8-2.5 10.2-13.8 13.7-17 24ZM1112.4 408.9c3.6 4.9 6 9.3 7.2 14.3 1 3.6 1.3 7-3.1 8.2-'
    '4 1-6.4-1.1-7.4-5-1.7-6.2-3.4-13.7-10.9-13.8-9.3 0-7.3 10.8-12.1 16.8-7.5-8.1-5.3-17 .2-22.6 7.7-7.6 17.5-7.2 26'
    '.1 2ZM166.8 366.2c-10.8-2-13.7 3.8-14 12.6-.3 4 .2 9.8-6.2 8.4-5-1-5.2-5.7-4.5-10.3 2.7-19.5 17.1-28.5 30.1-18.7'
    ' 7.4 5.5 7 12.5 5 20.8-7.7-1.2-4.6-10-10.4-12.8ZM1045.8 147c.8.9 1.2 1.5 1 1.6-11 9.6-19.4 20.6-18 38.1-11-5.9-8'
    '.4-13.9-7.1-20 2.5-12.2 10-20 24-19.7ZM1261.2 544.3c-.8 3-1 5.2-3.8 5.4-5.5-11.7-1.3-29.4 8.5-35.8 2.7-1.8 5.5-2'
    ' 7.8.9 2.2 2.7 2 5.6-.5 7.9-6.5 5.4-8.4 13.4-12 21.6Z"/><path d="M869.2 571c-10.7 0-8.3-7-7-12.4 1.4-5.2 5.2-9.7'
    ' 11.1-8 8.4 2.2 10.5 8.7 9.1 16.5-3.5 4.7-9.6-2-13.2 4ZM296.4 666.5c10.5-13.2 19.8-14.2 26.5-2.5 2.4 4.3 4.2 9.6'
    '-.7 12.5-5.8 3.6-8-1.4-9.5-6.3-.4-1-1.5-2-2.1-2.8-4.5-2.3-8.6 5.4-13.5-.4-.6-.6-.6-.5-.7-.5ZM160 555c4.5-5.8 9.5'
    '-5.7 13.9-2.5 5 3.6 5 9.2 3.4 14.8-19.4 3.2-19.4 3.2-17.2-12.2ZM1005.4 659.5c7.2-4.8 13.6-5.7 18.3 1.7 3.1 5 7.6'
    ' 10.9.2 16-6.2-1-5.4-7.9-10.6-10.4l-9.5 2.6c-4-4-1.2-6.6 1.6-9.9ZM335.8 170.2c5-4.8 10-4.4 14.7-2.5 5 2 7.7 6.4 '
    '8.4 11.7.3 2.2-.9 4.4-3 5.2-6.5 2.6-6.4-5.2-10.3-7-4.6-1.4-5.4 5.1-9.9 4.5-4.2-3.4-2-7.3.1-12ZM850.1 214.5c-4 2.'
    '7-6 10.5-11.2 5.2-4.3-4.5-1.3-11 2.9-14.5 4.7-4 11-5 15.6.5 2 2.7 4.2 6.4 3 10.8-4.3 3.7-5.9-4.2-10.3-2ZM590.7 3'
    '22.8c-1.8-10.3 3-17 11.9-17.3 8-.3 12 6 10.6 14.4-5.3 3-6.5-3.6-10.3-3.5-3.7 2.7-4.6 10-12.2 6.4ZM1045.4 166.8c6'
    '-.1 11.2-.7 13.6 5.7 1.2 3.4 5 6.8 1.3 10.3-4 3.8-7 0-9-3.1-4.3-6.7-7.9 2.4-12.5.2-.5-5.3-2-10.8 6.6-13ZM1082.8 '
    '176c0 5.2-1.6 9-6 9.2-4.9.1-5.8-4.4-6.4-8.2-.6-4-3.4-7.8-1.9-13.2 6.8 1.5 11.1 5.4 14.3 12.2ZM95.9 393.3c1.8-3.3'
    ' 2.6-6.4 6.9-7 2.3 6.2 6.7 12.2.5 18.8-2 2.1-4.8 4.1-7.6 1.8-4.7-4-1-8.4.2-13.6ZM1269 537.6c9.3-7.8 10.2-7.2 14 '
    '9.3-4.6-1.5-8.7-.3-12.2 1.2-4-3-3-6.4-1.8-10.5Z"/></g><path fill-rule="evenodd" clip-rule="evenodd" d="M1301.7 6'
    '92c-6.3-26-11.8-51.9-17.4-77.9l-8.4-39c-8-36.6-18.6-72.3-30.1-107.6a677 677 0 0 0-42.2-102.8l-7.1-13.7a804.1 804'
    '.1 0 0 0-27.6-50.7c-27.6-45.3-58.4-88.3-97.4-124a336.4 336.4 0 0 0-102.8-65c-7-2.8-13.9-6-20.8-9.1-8-3.7-15.9-7.'
    '3-24.1-10.5-10.6-4-14.4-.7-18.9 7.3-8 14.7-18 28-33 36-40.4 21.6-82.6 33.2-127 13.6-18.3-8.1-35.3-20-48.8-35.4-6'
    '-7-12.2-8.3-20.5-9.5-22-3.3-36.8 4.7-49.3 23.1C610 151 584 160 556.6 162.6c-39.9 3.8-76-6.6-108.4-31.8a203.6 203'
    '.6 0 0 1-44.8-44.3l-9.7 4.5c-7 3.1-13.7 6.2-20 10-9.6 6-19.7 11-29.8 16-11.6 6-23.2 11.7-34.1 18.9-32 20.8-60 45'
    '.8-85.8 73.7a604 604 0 0 0-86.7 122.8 867.4 867.4 0 0 0-50 108.1 1213.2 1213.2 0 0 0-34.2 102 560 560 0 0 0-20.3'
    ' 102.2c-.6 6.8-2.1 13.6-3.7 20.4-1.9 8.3-3.8 16.8-4.1 25.8-5.5 1-10.7 1-17 1 4.6-32.9 9.8-66 16-98.8 2.4-12 5.4-'
    '23.7 8.4-35.4l5.3-21.5c5.2-22.6 12.7-44.6 20-66.6l.1-.1.9-2.6a835.3 835.3 0 0 1 83.3-179c17-27.2 36.2-53 57.3-77'
    ' 37.5-43 79.4-80.3 130.6-105.9l10.8-5.4c36.1-18.2 72.3-36.4 112.5-44.2 11-2.1 22.2-4.6 33-7.6 12.8-3.5 15.2-9.1 '
    '10.4-21.1l-1-2.2c-.7-1.6-1.5-3.3-1.7-5v-.4c-.6-3.6-1.3-7.8 3.8-8.9 4.3-1 5.5 1.6 7 5l.6 1.1c1.6 3.2 3 6.5 4.5 9.'
    '7 4.8 10.8 9.6 21.7 18.7 30.6 17 16.6 38 24.2 59.9 27.2l5.3.7c25 3.3 50 6.7 75.4 5.4 35.4-1.8 70.4-5.5 104.3-16.'
    '5 5.2-1.7 9.8-4.8 14.1-8.3 7-5.8 6.5-10.6.5-16.8-9-9.2-11-20.6-10.4-32.6 4-1.5 7.1-.5 7.7 1.8 7 30.4 29.7 36 56 '
    '39 34 3.8 66.4 14.3 98.9 25a399.8 399.8 0 0 1 71.4 34.6l18.7 10.5a271.8 271.8 0 0 1 67.1 53.2c22.8 24.3 44.1 50 '
    '62.7 77.6a762 762 0 0 1 45.1 74.5 1005 1005 0 0 1 86.8 242c5.7 25.4 10 51.3 14.3 77.5 2.2 13.2 4.3 26.4 6.7 39.7'
    '-3.2.9-6.7.9-11.3.9ZM575.3 143a84 84 0 0 0 49.9-37.7c-2.9-2.4-6-3-9.2-3.5l-3-.5c-6.5-1.5-13.2-2.7-19.9-3.9-27-4.'
    '8-54.1-9.7-74.2-32.8-1.4-1.5-4.7-1.7-7.1-1.8-27.6-.5-53.6 6.9-79.6 14.3l-11.3 3.2c.8 5.6 2.6 9 5.8 12.2 12 12.3 '
    '25.3 23.2 39.7 32.5 33 21 68.2 30.7 108.9 18Zm224.8.3c-31.6 4.3-57.3-9-81.2-27.6-1.6-1.7-3.3-3-5-4.2-3-2.4-5.7-4'
    '.5-6.9-8.4 10.1-3.8 20.7-5.8 31.2-7.9a178 178 0 0 0 33.2-8.6l5.3-1.8c4.4-1.4 8.8-2.8 11.9-5.8 16.8-16.2 36.3-15.'
    '6 56.5-10.6 13 3.3 26 7 39.6 11l19 5.6-5.6 6.5c-14.2 16.6-26.7 31.3-47 38.5-16.8 6-33.4 11-51 13.3Z" fill="#000"'
    '/><path d="M1119.6 692c-9.1-36.9-12.1-74.7-22-111.2-7.7-28.1-13.9-56.8-23.8-84-7-19.4-13.7-39-23-57.8-12.7-25-23'
    '.1-51.2-34.4-77-1.3-3-2.9-6.3 1.3-8.8 4.3-2.6 7.4-.5 9.8 2.6 3.8 5 7.8 10.2 10.6 15.9 10 20.4 19.4 41.1 29.1 61.'
    '6A612.7 612.7 0 0 1 1101 529c9 31.6 17.5 63.6 21.5 96.6 2.6 21.4 7 42.7 8.6 65.4-3.3 1-6.8 1-11.4 1ZM221.2 692c-'
    '.6-3 .4-5.8.4-8.7 0-49.6 9.7-98 16.8-146.7 5.1-35 13.4-69 22.8-102.9 6.8-24.4 18-47.5 32-69 2.3-3.6 4-10 10-6.9 '
    '6.3 3.2 3.3 9 1.4 13.6-7.2 17.6-16 34.7-22 52.7a740.8 740.8 0 0 0-31.3 138.7c-1 8.5-2.8 16.8-5 25-7.5 28.5-3.8 5'
    '8.4-11 87-1.2 4.7.2 10.1.2 16.2-4.5 1-8.9 1-14.3 1Z" fill="#000"/><path fill-rule="evenodd" clip-rule="evenodd" '
    'd="M648.9 165.5c-9 6.6-10.5 15.7-3.6 28.3l4 2.7c2.3 1.5 4.3 3 6.5 3.6 9.5 3 17-2 21.6-9.1 4.7-7 5.5-16.9-1.9-22-'
    '7.3-5.1-16.6-10.9-26.6-3.5Zm5.4 17.4Zm0 0c3.8 2.8 7.6 3.4 10.9-.5a3.4 3.4 0 0 0-1.2-5.3c-4.4-1.6-9.2-2.6-9.7 5.8'
    'Z" fill="#000"/></g><g transform="translate(266 207)"><path d="M389 234.8A329 329 0 0 1 495 170.3c35-13.4 69.8-1'
    '6.6 106.1-16.5 40.6.2 74.5 18.6 112.4 32 57.4 20 176.1 126 141.5 262.2-4.6 18-7.6 35.8-12.8 52.8-7 22.5-3.2 43.3'
    '-1.6 65.2 3.8 49.7 46.1 114 51.6 163.2 3.9 34.6 6.2 68.6.7 102.8-4.4 27.9-21.6 71-29.9 97.5-5.5 17.8-39.4 4-54.3'
    ' 17.3-5.3-2-6.5-4.6-7.2-9-2.6-17.8 3.2-33.3 10.4-49 6-13 7.5-27.4 11.8-41.1a190666.9 190666.9 0 0 1-31.2 56.5c-1'
    '0 15-14 16.4-30.1 9.1-15-6.8-29-15.8-44.4-21.7-4.4-1.6-8.3-3.5-13.1-4-13.3-1.3-18.6-12.3-24.8-21.8-2.1-3.3 1.4-5'
    '.7 4.2-8a277.8 277.8 0 0 1 56-34.8c30-15.5 44.8-41.6 57.8-69.8 13.2-28.3 19.2-58.7 24-89.2 5-32 .7-64.1-1-96.1-1'
    '.3-21.6-5-43.1 3.3-64.2 1-2.6.8-6 .1-8.9a653 653 0 0 1-16-92.6c-2.8-30.5-44-150.6-116.4-102.7-21.5 14.2-30 31.3-'
    '46.6 62.2-18 33.7-44 58.8-76.7 77.8-17.5 10.2-35.6 20.4-55.2 24.8-23.5 5.2-46.8 12.2-71.1 13.8a73.6 73.6 0 0 0-4'
    '3.2 20.1c-24.5 21.4-20 44.7.5 72.5 24 32.5 45 67.1 51.2 106.6 5.2 33.4 6.4 68.2-5.7 102.2-7 19.7-16.9 37.5-25.3 '
    '56.3-11 24.6-8.2 49.5 2.2 74.8-31.7 19.8-65 14.4-99.2 9.4 1.7 9.5-5.6 9.4-12.8 9-27.9-1.4-56-1.3-82.4-12.9-1.9-.'
    '8-4.8-1.8-6-1-5.4 3.8-27.7 17.4-63-36.6-14-21.7-17.5-46-16.6-70.7.8-23.6 4.1-47.4 8.4-70.7 10.7-58.4 38.5-108.8 '
    '76.1-154 25.6-30.7 43.6-65.2 49-104.6 3.3-23.5 5.2-47 11.3-70.2A339.3 339.3 0 0 1 348 280.9c12.6-16 25-32 41-46.'
    '1Z" fill="#000"/></g><g transform="translate(791 871)"><path d="M182.3 95.7c-29.2 14-65.1 3-84.2-16-2.3-2.3-3.8-'
    '5.6-5.3-8.6-1-2.3-1.6-5 .7-7.1 2.2-2.1 4.7-1.8 7.1-.7 2.6 1.3 5.6 2.5 7.5 4.5 12.1 13 28 16.4 44.7 19C162 88 169'
    ' 82.3 177 80.2c5.3-1.4 11-9 15-.7 3.3 6.8-1.3 12.9-9.7 16ZM66.6 57.4C71 45.2 80.3 40.6 90.8 37.9c5-1.3 10.8-1.7 '
    '13 4.3 2.4 7-3.2 10.9-8.3 12-7.3 1.4-12 4.6-15.4 11.2-2.2 4.3-5.7 9.7-11.7 7-7.2-3-3.8-9-1.8-15Z" fill="#000"/><'
    '/g><g transform="translate(901 668)"><path d="M59.8 81.5c4.5-7.8 8-15.1 12.7-21.7 3-4.2 8-7.4 13-3.1 4.9 4 0 7.2'
    '-2 10.7a227.9 227.9 0 0 0-31.3 82.3c13-2 25-1.4 30.4 11 5.6 12.7-2.5 23.2-10.6 31.8-7.3 7.7-16.6 13.5-29 7.7C42.'
    '8 184 69.6 185 65.6 167c-2.6-2.6-4.5-1.7-6.6-1.2-19.7 4.3-22.8 2.4-20.3-18.2a214.6 214.6 0 0 1 21.1-66Z" fill="#'
    '000"/></g><g transform="translate(610 680)"><path d="M407.4 122.5c13 .3 25.4 1.1 37.6 2.5 3 .4 5 3.3 5 6.7 0 3.3'
    '-1.7 5.6-4.7 7-11.2 4.8-22 8.2-33.7.2-6.5-4.5-9-8.7-4.2-16.4ZM247.6 117c7 0 7.8 3.8 7 8.5-2 10.2-20 22.4-30.4 20'
    '.5-5.9-1-10.5-4-10.7-10.5-.2-6.7 4.8-8.2 10.3-8.4 9-.3 15.8-5.2 23.8-10ZM215.1 76.6c5-12 9-29.4 24.1-22.5 20.7 9'
    '.4 13.9 30.7 9.7 47.4-1.6 6.3-14.5 15.9-18.3 14.3-16.3-6.8-19.2-21.7-15.5-39.2ZM442 113.4c-8.6 7.5-17 7.6-22.2-1'
    '.5-9-16-8.6-32.8 3.3-47.2 2.5-3 13.8-3.6 16.3-1 14 15 14.6 31.8 2.6 49.7Z" fill="#000"/></g><g transform="transl'
    'ate(774 657)"><path d="M107.5 34.6c4.3 5.6 14.4 8.2 8.3 16.8-5.8 8.2-15.6 8.7-24.3 6.4C82 55.5 73 52 64.4 47.2c-'
    '12.1-7-23.1-6.2-34.8.2-6.6 3.6-16 9.8-20.4 1.9-5-9.2 7-11.4 12.8-15.4 18-12.8 38.8-14 60-12.2 9.6.8 16.7 7.7 25.'
    '5 13ZM231.2 44.2c15.9-7.4 30.7-14.8 48.2-12.7a47.6 47.6 0 0 1 30 15.2c2.9 3.1 5 7.5 1.4 11.4-3.6 3.7-8.6 4.5-12.'
    '5.4-10-10.7-20.3-8.4-30.7-1.4-9 6.1-19.6 5.5-29.4 6.4-10.7 1-13.4-6.6-7-19.3Z" fill="#000"/></g>')

AVATAR_LEO = (
    '<rect fill="#b6e3f4" width="1744" height="1744"/><g transform="translate(531 487)"><path d="M554 727.7c-99.2 297'
    '-363.8 388.6-503.7 19.8-19.3-50.7 31-69.5 66.2-91.9 24.1-15.3 36.8-28.5 35.3-42.2-7-64.4-36.9-243.8-36.9-243.8l-'
    '3-5.8s.7-1.6-2.2 1.2c-3 3-9.9 34.2-37 34.2-24.5 0-49.2-10.9-61-86.3C7.2 285.6 9.6 214 40 201c12.5-5.3 24-7.2 35.'
    '2-.8 11.3 6.4-13-22 112-126C268.4 6.4 396.7-3.5 448.5 8 500.3 19.5 552 44.8 574.9 98.5c27.8 65-25.9 114.3-14 262'
    '.5-2.2 53.6.8 171.2-146.6 210.6-28 7.5-19.3 48.4 22.7 58.4 67 21 117 72.3 117 97.9" fill="#fff"/><path fill-rule'
    '="evenodd" clip-rule="evenodd" d="m554 266.2.1-1.4c4.1-36.4 8.2-71.7 27.1-103.4 6.5 4.4 5.7 10 3.7 15.2-19.9 51.'
    '2-18 104.4-16.2 157.6l.4 14c2.1 66.4-14.5 126.8-58.7 177.5-15.4 17.6-35.8 29.8-56.5 40.3-21.4 11-25.9 20.1-19.2 '
    '43.6l.8 2.6c1.4 3.9 2.8 7.9-1 11.8-4.5 4.6-9.5 3.3-14.8 1.8l-.6-.1a406.4 406.4 0 0 1-137-68.3c-6-4.4-10.8-10.3-1'
    '5.5-16.1l-.3-.4c-2.5-3-3-7.8.5-10.4 3.3-2.5 5.8-.5 8.7 1.8l1 .9a145.5 145.5 0 0 0 76.3 31.7c13.4 1.4 26.6.9 40 .'
    '4 7.4-.3 14.8-.6 22.3-.5 10.2 0 18.7-4.7 26.7-9.2l2.8-1.6c27.8-15.5 54.3-32.8 72.2-60.7 16.1-25 25.9-52.2 31.6-8'
    '0.9 7.2-36.1 6.6-72.7 6-109.8-.3-12-.5-24.2-.5-36.4ZM50.6 190.8c21.9-1.7 34 11.2 44.3 26.3a140.4 140.4 0 0 1 22.'
    '4 61.5c.5 3.7 1 7.6-1.2 11.3-4.5.6-4.9-3-5-5.6-.5-20.7-9.7-38.7-18.9-56.1-6.6-12.5-16.2-24.6-31.4-27.6-17.2-3.5-'
    '33 12-40.8 32.2-14.5 37.6-12 74.6 1.4 111 5.8 15.9 13.1 32.1 27.8 43.2 14.8 11.3 32.7 9.3 43.6-5.7l2-2.5c2-2.6 4'
    '-5.1 5-8 2.1-5.8 5.4-11.2 11.3-10.4 6.8 1 8 8.3 8.7 14a3661 3661 0 0 0 22 156.7l5.9 38.8c2.6 17.1 5.6 41.7 3.6 5'
    '2.1a28 28 0 0 0-.3 2.2c-.4 2.8-.6 5-4.2 5.5-4.9.8-7-2-7.7-6.4-2.3-17-3-23.6-4-49.6-.9-25.2-5.6-50-10.4-74.9l-5-2'
    '7c-5.2-30.8-10.3-62-10.8-97l-2 3c-7.6 11.3-13.7 20.5-24.5 24a40.5 40.5 0 0 1-46.1-12.5 127.8 127.8 0 0 1-28.8-55'
    '.8c-8.4-34-9.9-67.1.9-100.6 5.2-16.1 23.7-44.7 42.2-42Zm34.6 127.5c4.4 3.2 8.4 6 12-5.4-1.1-42.2-14.7-69.2-35.8-'
    '70.3 11.2 14.6 22 28.8 23 48.5a32.3 32.3 0 0 1-10.7-8.8c-2-2.2-4-4.4-6.5-6l-3-2.4c-4.8-3.6-9.7-7.4-17.8-4.5 3.8 '
    '5.8 9 10 14.3 14 6 4.7 12 9.3 15.6 16.5-10.6 7.7-15.2 17.7-9.7 29.9 4.8 10.5 11.9 19.2 25.9 19.8-.6-6.3-4.7-10.9'
    '-8.8-15.4-5-5.4-9.7-10.6-7.5-18.6 3.2-1.5 6.2.7 9 2.7Z" fill="#000"/></g><g transform="translate(178 1057)"><pat'
    'h d="m1351 688-1369-3.3s11.4-97 44.3-189.1c41.2-115.2 107.2-232 125-246.1 20.8-16.8-11.6-18.2 3.4-41.2 33.5-51.1'
    ' 147-97.5 179.8-114.1 58.7-29.8 164.8-47.8 164.8-47.8l27.2 53.5s63.5 21.9 138.6 24.4c40.5 1.3 134.4-29.5 134.4-2'
    '9.5L788.3 37s169.5 34.8 253.3 85.6c48.3 29.3 108.5 75 110 101.2 2.2 39.8 1.7 36.7 24 51.9 53.5 36.2 98.8 122 121'
    '.2 191.2C1314.4 521.1 1351 688 1351 688Z" fill="#fff"/><path d="m924.7 688-94.5-.3L843 482.6l-43.4-379.4s-110.1 '
    '29-147 27c-31.4-1.5-123.7-22-123.7-22s51 280 55.9 374.4C587.3 533.9 576 688 576 688l-209.4-1.2L276 489s51-133.4 '
    '101.5-206.7c9-13.1-22.8-16-64.1-14-42.2 2-164.2-13.8-162.4-44.5 3-51.3 150.5-113 183.4-129.6C393 64.4 499.2 46.4'
    ' 499.2 46.4l27.3 53.5S590 121.8 665 124.3c40.5 1.3 134.4-29.5 134.4-29.5L788.3 37s169.6 34.8 253.4 85.6c48.3 29.'
    '3 122 66.1 111.2 120.3-2.3 12-207 47-187.2 89.8 24.6 53 88.8 118.6 79 135-16 27-40.8 67.7-69.5 103.3-20.2 25-50.'
    '5 117-50.5 117Z" fill="#000"/><path fill-rule="evenodd" clip-rule="evenodd" d="M301.5 563.4c20.5 40.6 41 81.3 56'
    ' 124.6 6.6 0 12 0 17.7-1l-4.3-11a672.5 672.5 0 0 0-19.6-47.8 5876 5876 0 0 0-34.2-70.7c-9.4-19.2-18.8-38.3-28-57'
    '.5-3.8-8-6-16.9-1.3-25.8 6.7-12.8 12.6-26 18.4-39.2l5.2-11.8c11-24.4 24.5-47.6 38-70.9 10.6-18.1 21.2-36.3 30.6-'
    '55 8-16.3 5.6-24.5-12-30a48.4 48.4 0 0 0-10.5-2.3c-8.6-.7-17.2-1.2-25.9-1.7-26.4-1.5-52.9-3-78.6-10.8-8-2.4-16.3'
    '-3.7-24.6-5-8-1.3-16-2.6-23.8-4.9l-4.6-1.3c-14.8-4.2-30-8.6-41.4-20.3l1.7-2.4c1-1.3 1.8-2.5 2.8-3.5 25.5-28.7 59'
    '-47 92.3-65.1l20-11a963.1 963.1 0 0 1 62.6-31.4c7.9-3.7 15.8-7.4 23.7-11.3A394 394 0 0 1 423 71.5c10.6-3.1 21.4-'
    '5.6 32.2-8 7.8-1.9 15.6-3.7 23.3-5.7 20.1-5.3 23.8-4 29 15.7l9.1 34.2a2051 2051 0 0 1 26.8 106.6c8.7 40.7 14.4 8'
    '2 17.2 123.5a1480 1480 0 0 0 6.8 70.7c3.7 32.2 7.3 64.3 8 96.7.5 20.8-.1 41.6-.8 62.4l-.8 29c-.3 13.5-1.8 26.9-3'
    '.3 40.2-2 17-4 34-3.3 51.2 6.7 0 12.2 0 17.8-1.2l.6-16.2c.2-10.2.5-20 1.6-29.6 5.7-51 4.8-102 3.7-153-.7-33.6-3.'
    '6-67-8.4-100.2a605.8 605.8 0 0 1-4.6-52.8c-1.3-23-2.6-46.1-7.3-69a1627 1627 0 0 1-6.7-34.2 906 906 0 0 0-13-61.8'
    'c-.2-1-.6-2-1-3-1.2-3-2.5-6 .6-8.9 4-3.8 9.1-2.7 14-1.4A373 373 0 0 0 690 167.3c31.6-2.4 62.8-5.8 91.8-19.5 8.7-'
    '4 15.5-1.5 17.4 9 1 5.6 1.7 11.2 2.4 16.9 1 7.9 2.1 15.8 3.8 23.4 7.8 34.8 10 70 12 105.2 1 16.1 2 32.2 3.5 48.3'
    ' 1.1 12 2 24.2 2.8 36.3 1 14.6 2 29.1 3.6 43.7 6.3 60.7 4.7 121.5 2.7 182.3l-.7 20c-.7 18.4-1.4 36.7-1.4 55 5.8 '
    '0 10.4 0 15.4-1l.8-5.3c1-6.5 2-12.5 2-18.4l.3-44.7c.1-28 .3-56.2 1.6-84.2 1.7-37 .6-74-3.2-111-2.7-26.2-4.5-52.4'
    '-6.3-78.7-1.7-24.1-3.4-48.3-5.7-72.4-4.5-46-10.5-92-20.5-137.3a2499.2 2499.2 0 0 1-13.8-68.7c-.5-2.4-.4-5-.4-7.4'
    'v-4c-.3-6.4 2.7-8.5 9.1-7.2a642.2 642.2 0 0 1 79.2 18.8c21 6.9 41.7 15 62.3 23 7.3 3 14.7 5.8 22 8.6a446.7 446.7'
    ' 0 0 1 141 84.8c13 11.7 24.1 25.1 31.8 40.6 4.5 9.3-.3 19.2-9.6 21l-9.2 1.9c-22.7 4.4-45.4 9-67.6 15.7a251.6 251'
    '.6 0 0 0-92.9 50.8c-7.6 6.6-8.7 14.7-4.5 23.2 4 8 8.4 16 13.2 23.6 5.8 9.2 11.7 18.4 17.7 27.5a705.7 705.7 0 0 1'
    ' 42 70c3.2 6.5 4 13-.3 18-9.4 10.8-16.8 22.9-24.3 35a360.3 360.3 0 0 1-16.9 25.7 486 486 0 0 0-53.6 90.3c-3.6 7.'
    '9-6.6 16-9.7 24.2-4.8 13-9.7 25.8-16.5 37.7 7.5 0 14 0 20.6-1 10.7-33 23.5-64.2 41.5-93 23-37.1 47.5-73.3 72.3-1'
    '09.3 6.3-9 9.7-18.8 3.8-31a589 589 0 0 0-27-48.5l-.4-.7c-13.9-23-28.7-45.6-43.7-68-4.7-7.2-2.2-12 3-16.8a158.1 1'
    '58.1 0 0 1 41.7-26.7 355.4 355.4 0 0 1 102.9-29.7c12.8-1.7 22.3.7 32 7.6 34.6 24.3 64.6 51 82.6 90.3l8.7 18.7c12'
    '.8 27.6 25.6 55.2 35.5 84a1107 1107 0 0 1 41 147.4c5.8 25.6 11.6 51.2 18.2 76.7 4.9 0 8.6 0 12-1-5.3-21.6-9-43.3'
    '-12.8-65-4.7-27-9.4-54-17-80.4l-1.4-5.3c-6.6-23.2-13.2-46.4-21.1-69a882 882 0 0 0-52-121.3c-18.2-34.7-45.8-61.4-'
    '77.7-84.9-1.4-1-3.2-1.9-5-2.8-6-3.1-12.7-6.5-9.7-16.8 5.2-17.6 1.8-33.7-13.7-46.3a86.8 86.8 0 0 1-9.6-9.7l-3-3.3'
    'c-41.4-45.3-95.8-72.5-151.8-97-36.4-15.9-74.5-28.1-112.6-40-23.7-7.3-48-13.2-73-15-12.7-1-18 4.8-16.5 16.8.4 3 .'
    '8 6 1 9 .8 6.7 1.5 13.5 3.1 20 2.8 11.2-3.2 17.2-12 21.2-22 9.8-45.4 17.3-69.4 18.8-52.8 3.3-105.4.7-156-16.9-8.'
    '5-3-13.3-7.4-16.9-14.7-2.5-5-4.7-10.2-6.8-15.3a224 224 0 0 0-11-23c-5.4-9.6-11.8-11.8-21.6-8.6-6.4 2-12.8 3.7-19'
    '.3 5C434.6 50.4 399.3 59 366.5 75c-46 22.4-91.7 45.1-136 70.3-30.3 17.2-60 34.8-82.7 61.3-6.2 7.3-7.5 14.5-2.5 2'
    '2.2 4.2 6.5 3.9 11.5-2 17a139.2 139.2 0 0 0-22.8 30c-1.8 2.8-3.5 5.7-5.4 8.5-21 32-39.7 65.2-56 99.5A873.4 873.4'
    ' 0 0 0 26.7 463l-1 2.8c-7.9 22-15.7 43.9-21.3 66.5a925 925 0 0 1-5.6 21.5 563.4 563.4 0 0 0-8.8 35.3c-6.6 32.9-1'
    '2.2 66-17 98.9 6.7 0 12.1 0 18-1l8-46c2-12.3 4-24.5 6.2-36.6 11-63 32.6-123 57-182a838.3 838.3 0 0 1 91-160.9c4-'
    '5.6 9-7.2 15.7-7.8 16.4-1.5 31.6 2.9 46.8 7.2 7.8 2.3 15.6 4.5 23.5 6l15.7 2.8c27 5 54 10 81.8 11.4 2.9.2 5.8.2 '
    '8.7.2 8.1 0 16.5 0 25.3 3l-8.4 13.6-23.8 38.6a729.7 729.7 0 0 0-50 95.6 948.5 948.5 0 0 1-18.2 39.1c-3.8 7.6-4.9'
    ' 14.6-1.7 22l1.3 3c6 14 11.9 27.8 18.6 41.4l13 25.8Zm476.8-452c4.8-2.6 10.3-5.4 11.2 3.7 1.8 10.6-5.4 14.2-11.5 '
    '17.3l-1.8 1c-17.5 9.2-37 14-56.8 16.2a437 437 0 0 1-145.1-5.8c-9.6-2.2-18.8-5.6-27.4-10-5.6-2.7-8.1-6.8-6.8-12.5'
    ' 1.5-6 5.5-5 9.5-4l2.4.6 19.4 3.8c16.5 3.3 33.1 6.6 49.9 9a293 293 0 0 0 103.8-2.9l1-.1c18-3.8 35.8-7.5 52.2-16.'
    '2Z" fill="#000"/><path d="M200 688c3-35 7-69.8 11.4-104.7 3.6-29.7 4-60 17.4-88 1-2.4 2.3-4.6 3.8-6.7 2.3-3.1 5-'
    '6.8 9.7-5.2 5.3 1.7 3.6 6.4 2.7 9.9-8 32.1-13.3 64.8-17.7 97.5-4.1 31.5-6.2 63.3-9.4 96-5.8 1.2-11.2 1.2-18 1.2Z'
    'M1150.9 688c-9.8-36.3-12.8-73.7-23.3-109.7-6.2-21-9.8-42.8-17.9-63.4-1.6-4.2-.5-9 4-11.2 4.4-2.3 7.4 1.3 9.9 4.3'
    'a55.4 55.4 0 0 1 9.9 22.1c11.5 43.4 20.8 87.4 27.6 131.7 1.2 8 1.2 16 1.9 25.2-3.5 1-7.3 1-12.1 1Z" fill="#000"/'
    '></g><g transform="translate(266 207)"><path d="M312.7 272.6c3.8-10.5 11.7-7.8 18.6-6.8 16 2.3 31.4 3.5 47.8.4 1'
    '8.7-3.5 31.6-13.7 43.2-26.4 19.8-21.5 38.8-44 63.8-59.6 45.7-28.6 94.5-40 148.3-27.4 22.8 5.3 44.4 13.9 66.9 19.'
    '5 24 6 49.7 11 69.8-11.7 12.4-13.9 16.5-31 19-48.8.6-4.5-1-10.1 5-11.9 4.8-1.4 9.2.8 13 3.8 16.5 13.2 33.7 25.9 '
    '40 47.9 1.4 4.5 3.8 8.6 7 12 24.8 26.3 18.7 53.8 2 80.5-6.4 10.4-12 21.3-25.6 29.7 11.1-2 19.6-9.2 34.9-28.5 9-1'
    '1.4 10.8-26.8 21.4-38.7a52.8 52.8 0 0 1 9.9 49.3c-3.3 12.6-.2 24.3-.7 36.4 0 1.2.1 3.1.9 3.6 14.6 9.6 6.2 22 3.4'
    ' 33-2.4 9.5-2 18.6-1.9 28a63 63 0 0 1-23.8 51c-11 9.6-18.3 23.5-24.9 37.1-5 10.5-7.6 22.3-17.8 34.1-4.5-38-5.5-7'
    '5.3-48.1-93.3 15.8-6.2 29.5.4 42.7-6-8.4-5.8-17.6-2.4-25.2-7.2-7.3-4.5-13.5-9.4-16.6-16.8a25.5 25.5 0 0 0-19.1-1'
    '6.7c-8.3-2-16.3-4.9-23.9-8.7-24.7-12.3-50.6-8.5-76.2-4.6-27.8 4.2-55.2 1.1-82.7-1.6-30.1-3-113-33.4-153.2 85-9 2'
    '6.6-9 54.5-10.2 82a32.2 32.2 0 0 1-7.6 21.4 102 102 0 0 0-23.7 44.4c-1.1 3.8-2 9.2-7.4 9-6.6 0-5.2-6.1-6.4-10.5-'
    '8.3-28-16.2-56.7-42.5-74.4a27 27 0 0 1-12.8-23.5c0-13.7-7.3-24-14.4-34.6-4.6-6.8-10.6-13.7-5.3-23 .4-.6.8-2 .4-2'
    '.4-9.7-9.6-3.3-23.7-9.5-34.2-4.7-8.1-9-15.7.1-23.9 2.4-2-1-6.7 2.5-10.2 14-5.3 24.3 15.6 42.1 6.3-16-5.9-23.5-18'
    '-31.6-29.5-7.6-11-4-21.5 9.3-24l-1-9.5Z" fill="#000"/></g><g transform="translate(791 871)"><path d="M141.7 79c-'
    '3.2 7-5.7 14.2-6.1 22-.2 4.6.8 9.8 6 11.6 5.4 1.9 9.1-1 12.8-5.6 6-7.5 7.4-16.2 7.5-25.1 0-5 1.3-11.8-6.1-13.7-7'
    '.6-2-10.7 3.1-14 10.7Z" fill="#fff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M140.4 59.5c-14.9 15-17.2 '
    '33.4-14.1 54.3 5.4 10.8 14 11.2 23.4 9.9 21.3-2.9 39.6-34.7 26-58.5-9.4-16.3-22-19-35.3-5.7Zm-4.8 41.4c.4-7.7 2.'
    '9-15 6.1-22 3.4-7.6 6.5-12.7 14-10.7 6.7 1.7 6.4 7.3 6.3 12v1.7a39.1 39.1 0 0 1-7.6 25.1c-3.7 4.6-7.4 7.5-12.8 5'
    '.6-5.2-1.8-6.2-7-6-11.7Z" fill="#000"/></g><g transform="translate(901 668)"><path d="M99.8 182.6c-8.7 16.5-33.4'
    ' 25.7-48.5 18.9-4.3-2-6.2-5.8-7-10-.5-2.7.9-5.3 3.3-6.5 4.6-2 5.8 2.3 8.6 4.8 7 6 13 .7 19-3.4 5.8-4 9.1-8.5 4.3'
    '-14.7-10.5-13.1-14.8-29.2-21.8-44-3.1-6.5-5-13.5-3.8-21 .5-3.3 1.9-5.5 5.6-5.6 2.8 0 5 .8 5.9 3.8 7.5 26.3 23.3 '
    '48.6 34.6 73.1.5 1 0 2.5-.2 4.6Z" fill="#000"/></g><g transform="translate(610 680)"><path d="M419.6 111c-4.2-9.'
    '5-9.9-15.2-19.8-15.7-6-.3-7-5.1-8.9-9.8 2-1.5 3.5-3.7 5.3-3.8 21.1-1.7 42.4-1.8 63.5-.1 6 .4 9.3 8 3.2 10.4-10 4'
    '-12.5 13.2-18.5 19.8-8.2 9-15.2 9.1-24.8-.8ZM228.6 81.4c12.2.7 23.1 1 34 2 3.6.3 8 1.8 8 6.7 0 5.6-4.6 5.2-8.3 5'
    '.1-6.3 0-9.7 2.7-12.5 8.6-3.4 7.4-6.9 15.3-18 14.8-10.5-.5-15.1-7.2-18.1-15.2-2.2-5.7-5-8.4-11-8.2-3.4.1-7.1-.2-'
    '7.5-4.9-.4-5 3-6 7-7.2a67.9 67.9 0 0 1 26.4-1.7Z" fill="#000"/></g><g transform="translate(774 657)"><path d="M1'
    '31.2 43.2c-5.6 16.8-6.6 15.4-23 11.6-26.2-6-52.7-19.2-80.3-4.3-2 1.1-5 1-7.6.8-3.6-.2-8.2 1.3-10.1-3.3-2.1-5 1.5'
    '-8.3 5.3-10.3C35.2 27.7 53 13.4 77.9 16c12.8 1.3 26-2.8 39.3-2.4 18.8.7 22.4 5.7 16 23.9l-2 5.8ZM298.7 21.8c9.6 '
    '6.6 12.5 16.8 18.3 25a7 7 0 0 1-.6 9.4c-2.4 2.7-5.4 2.8-8.1 1.2-19.1-11-38.9-6.4-58-1.2-10.2 2.7-14.6-.8-17.2-9.'
    '2-1.7-5.7-2.9-11.5-3.6-17.4-1.3-9.8 6.9-11.9 13-12.2 18.5-.9 37.4-4.5 56.2 4.4Z" fill="#000"/></g>')

AVATAR_OPS = (
    "UklGRnISAABXRUJQVlA4WAoAAAAQAAAAbwAAbwAAQUxQSDMKAAANGbJJ2xhpuzUR/Q/cGuMtgAiPtG2OG9m6Wmut7/7XdUNrrYUBkARAXE99Vl6V"
    "PuEDC0hGnN/7J6LLvILwQb+O+r3vRHT5wAJAP49I8wqWD/jFBeQR6bMWAPpJJ2ICJuCb4u8b/WZ/SwD8DSGEQll6IhBA9VsRf+0v6V8RLjn5FgJJ"
    "DooMZ4z2p5RcZglJkouMBkFSZmr8dqq6rETku5DDn6li/tuYh0/fof65IYagXFJWCsMf+BMYeg+ImBX/w3z8Iy46XU5JPH7f/nfl7yd/QQmQztF/"
    "px/xg76bUbmMDB1Pv+P7UDKmk8wOtulHgS0hEc8/9jpsBNfXHEEzcSnZ0rEUX8cnwY01KJDpDbJchIX7EwUzJCGMMfm0XJDQHlvBbMUsDObNlktx"
    "R27ijGBF161vTJaJZYne1DgbmI8ndsWWiKhlFwUzl4Z/qPXNMgGYS3GzQ0m7ix9NlgfFSQLnID7uxJstD1Dh54Kix9x4WR4UwCCcnQiqelsiQhWP"
    "jDmSmSktEVAoAs4BShMsVRUxzkOzFS4XZhTB7OkgEF0iBJxaktmBtBSxREVUq/RzYG5MdamoaVbzs3PapRbLVJOkcPTeZsWQzOpVIhQoFIDdGkEy"
    "7mJXZuZ8d+YVCWKOcNomxCK3QgBK8cd16mxGyp5VpliypMpMOhmsQG3RTEQIFU1J9rHzs7LCgElLDRlqBtG4cMw+uYUSseR9gjIwWxr2qbeZMJTy"
    "vTiRUmG4C6kvLP35e9TfdkxeF4iWur73yZj12EblpaZmJmDjsgBIaHB6FR2Zo+Wy+nH8deviuDACa8ZGYmBqmtKGNu9OKDYTr1OMHS6/KfwYAQDV"
    "VrY/wX7FEBdHYQX1dBdyGs/3953k9q5iJiJGNoD4tP4QRsF0rezv9Tk7LgapTjHouO0Sszb3P++l07pvMZMEuJySpfp7mhfB1Ryw/QEP1AURFx3U"
    "BADUhXXoftbPOGO/zjMpyXZWSnKvHyi4LqscPAQLSRfbMiqmE/lycS8/ZUXDLNW2Flt6vTxEAQAaQSPgXJcKZUFq3kZeAYJ1V5vtD0kzQU73m10N"
    "4UNABMAEMruVOkb0jXEhNIe0aQGAgAAA6y4ULzOq3T183WUIABiQ1+npBSHSJTPhApCBh6yAqwO6zhsAuJaYsdbarMRvJGOScCft4bdtUIUJZH5C"
    "5/z5QiDc7dr+R714wXy1xiSNw9XOjf3x1J3ZUiBYQCZwJRlIbMfUSj/OC1DiuoxpW5hXm6SkmMwvFZPiK1PflP69rw+XlnO7KbuuQY7SK0QwN0rq"
    "OkUmyuNKuk6w/3BZNDRsLdZeGufMMG/XSi/wgDRvh9I4jfsHwWKLpK4NFXEloUvGOWncn5reCyhQv+o1Du2bLZh1q+P+IasvKGMP4ZzC82+IAt8n"
    "htcTUqvNpz0WnMXG7m4Y2tPj6otwlPmA8fUb6/T46U3K+4cAl7qEhQu5+fTqeX+Jj5vLoJizNZvx9Zd9o3287+ii4nbGQbdPj/++PjIOGfOW/uXT"
    "Zfgtz60AIG6ri7k8nhHatXB+Np47aHsMuN05ymNwLopwXhAzi2mremtcTl3Jmp3vVEnK3AC41s5r3FZ3cr7vbYjqGlUK5ioghNTWdYcwQQFIkcVi"
    "8O6fD27IySEJ52FCpaMAooouAxAw1tJYdFyc5tjdHdeHF7QqBGV2IqnJoWohklIlEQDccHTv2369xuKmx1hPd/z0W9aCbMqZoUuC49o10rFonuZO"
    "UZ7Oh5JkgSSdjyFe0qdX0fw6d7MzdO1RfIg+mSDsCgB3yu8/6f7Aj61bILXePsb8vPr0VusDG50mAK8n0LjLT//cngbtEIb3ALANm8d/Ht361adF"
    "0u48VLmc3p5c8skRkGRUJW7oYrVV6r8Y9kC4nEoGWFfv75J5iYZFbvHSfKjl+dJsz7/IPUMkNSuf65B5LWUI28152G4P+zy8vgvAak9vj0nDaSXX"
    "UYfRss7DRf9Vt4vy8VeNX9h+MLHSj4ctTw+7zOvAyZC2/aX2jQyrswCIeXz59KB68QnT6cjaHrbNunIOqPHxp+1OLrnIu5JSSr7I9kmfH+q1xDGd"
    "wkvZtz3OVgG0z/4L9qkO4dJgKhHWOpZ+/LTvzc2DNT99srswxV3XJBG3frjY//wCrqu7DlLbhG/4r6YcRQBqe9d9+v3Riqu0adjtddWvxtVupGCu"
    "rur7J8MlZOeT5eE4jCU2n2xEyOvAC+vn0/+MyFldbW371ftN7bJkkylsT/GLL+IZQtPZfJCDe/qPfMmqkk+X3oCwzodDEVxbtHD42J7PjcXqurcN"
    "34IkB42YKmts7qWltaHbmOkV1JSUN0EOcfzie3tkbqURQNzl5LeGG0pjabjby+hxGFd6/ymDtCL005jPo7aKGF3ruh2mUwUi5DSKcAKuDbLySW30"
    "AqjIcbdKuBF7kxjqWg/d4eluJwDpmErJE+LGkghIy+hSugJKmDhMMoc8ltYBgOYMkw4OgLqsYLEbQUAPcZnKoxNgQlv2uRIAzMRRQKZcn5LpFCJB"
    "VaboEFZvjVZHAKBiKl0LAwxyM0DoNREiFEyKo9t9Mu7CRFOCKkXUB9cKrhTL4LTorNTuTVp1xDU1svFUzFhgoIC40oTH4b0zBUQE2QOw3KiSVxgk"
    "CyY1pLfhQ+3fR3Exc4oCxuJzJmc0Kbi2+br/Ob0PACAgJhMlCK4U8Zk2wbjp28v+ozz2JYlGFc2B4/ngI7GwwuLb9WMRgi7BQwAUYWaZQkSYYJLH"
    "dC5ZUC8nbFNnBqdmsjl0WbGwQvgmDi8iADIMBCQlX3cHTKtNgcpEzP3hfjc6tu2wL+q9Gc0Mg5ILIxBh6jiAAJXwGUy+d7toU1iPYwOoEnopG/y7"
    "wYoBLtOZMBl1nbG4kgpiMI9LKoCoJST1pcPp4R5T41FHjYkKOB0PGwcIaImkQkFVOi5Q8QU7uhyP7wCQmm3OJVk93b2kKXppz6utFp/B4N+GnQGA"
    "AFCYAiQW2uBtl1ax7u8NgPi3fl1jjcd6b5jkcdd/9fESu46KcnarWpIlTApuJXXI2K5e7zsAIEwQa6hjwlQNx/LyxT2PaWXR/Hu+W+exp0zcTtU1"
    "2EdsBQCc+KOFFiuhTGjcDeWL//zg20veNMzFnMWAYrhFOep4aLMQ0DgUbxoNgFAAtz5ivP/nuyDFVf/Gtq2yfbO1E94eySG7974GqnMZyW/ahwpm"
    "F5Dyscrbp1+eAwW2Ht7fXNgpDuciLW5xYjjlLSRCyrkRG/q+5HiqZ/Wwl7eRz45QWn6u92+OuxhfLLlbJNrgtL7rUoNSZNVe+L7q1ruBSSOezt0l"
    "k4DQuuHj5XFlKa8+eRbcZvFN2WmWAlGu2Q6/5ot9/7w9N+qa8RKVmBRaCfuH0m03//NLyi2jR6GnAwEyxNdvvHDTj923UgwkrhSWhGPrUF6T4LZT"
    "oIapjO1J+s3m6WHncFNSSUveEUuVMdY0viA43gggAAiWraoieRJ/h5KGv/cbAFZQOCAYCAAAkCgAnQEqcABwAD5RIo5Eo6IhE+quYDgFBKANOZql"
    "3emWaPhf25eYVAO2Jt0/M75ufpt8lXrcfQA8I74df3N9JLNAP5F+FH6u+U3+M8J/JQE3QBEG8BGaH/s+VZjm9Vn+9/8nmn+l/2Y+Af+Yf1/0o/XN"
    "+3PscfsK3TUwHkoU+8yTCL7KhaQL8NnsU1GsSoXrN6mRPYNaEOhxdYKmzmX5Rz3+6OBgfxwwpLS/otoa3hp5OGfRQGI68j/KLdpHhv+2bqqdRn32"
    "XrGVupYQxN1nRSGNBCXdYHpNdX7v2Z2FXjvf2Aki15+Wlyq84GsazXyW0j7jFQ9JqjQ6Vc7w8uneJOrDFCHeqEiyrAUW73swrWMZrxkedfmN/jM0"
    "k/KV79uaoYlNse5LNqgjZLdi9n91vRDY20F7/rMbpQwY7meariwTbPOV4gAxX/tdig4AAP7+7qo5eeRBv7FfHLoC0PHQXj7akfltUl1JKFLx7Vhh"
    "26mPz0na72TbLrqyDxqqMZyBCmM4b0KaoGTymbnvLR5otWjGGsYkk4Pwfel2hCxst1sNVT4+I213JoHitAAS/mpBrHG29N7xN5FzjbAcvm6ziVX0"
    "lJpBq4wUCuri1gHHn4VssIj0MMoTx4Lc8K6O/A3lCvJ3wgLHVnS+KQjArr23F+KZe6R3CHdqYD2iEXL2LmnNTMlH+fqA61i2BZnkt74HIOp7/8AX"
    "oy/nSkqcBobQejR/K+nwDgrJYpnY9XNDsAffd4z3thMJ+gqRBfyh/Q5doUTCeqYAsGMoYdKbAu4jFw+/4zYFyzZej4Eca9occka//Op9I5PExcjO"
    "WmwL7cGzeBsFuCmNHh36qzhmIyZ0E0fmcit8toSMKjGHya/LOwz9zrS773omNfJBDvO4+M63w2s8W3HGp/8ehapoM5D2TlI6jgbw2hnQ8DilOPI0"
    "PjmP9NdaNnfysy3dZBZhMWhXkM61KsYNagrU1TqZXeGzOeZHYsii7nFCO9tWNiMB+RTyT3Vu+VD3k3/BpJ9vn4T78yZUhhk6OhP+1gnxF/EGCZ85"
    "c1iCD1xhH8uXHIHtu3d2bPGSw0M7J6PoBVBsYe4aF98ohqSPkjwmVYpdxu1DuHSKnKzQWzuRjaeodBdtp5f1qx/TgonEAxBxjQuUdeSH1Bbp8tBc"
    "k8E7GSRSLn2JZB5xeRc2q9fP9iEphMvAmOw5aJLI7CTTZuTSn1fXoEpXy5UFhz+tlUE3id/cM0kA+c4WDNgRzkFP14GFUhv9MdrvsSRCZVCKE/pd"
    "/3ZW9YEAMYklejXvHUiFCzahzfI/btoC4kXM4J8aYQsIZWdECiVF6EBnYNRT8/9Ou4euvNx/PYISiELYbejmIo76VBFp/1s4S+HyEdjz3tl/PdOg"
    "gq2sbncKLr4ns/Hvt3osOzTheVY/3xhKfQz0QWSe5IFphY4Kolu+TOpfaKOEzG5wN/tggVt9ihlHGWlwl6VujzRTmyP3dRa3O/9/I9KKmLCIzK/H"
    "hmf9J+04uiX22LVl23yfl/LivFeSAOMxpN8dHote8AcL5I0hSW8SADWeViF5T0Ggzn1Dobpuk4AjlWcVMnT11Qm6fTTxCd+rUSmZurCpoa74VclM"
    "9L220ScHw8n11mSZ6O3N2AS1GRa316Pp87/6ADb69FHhwGge1KGDcXfCmYnHjYXJ2Yfx98CstxXoY2fILJoMSfsbbsqqy2yZ7yfBZ8FvNh9611hf"
    "bR8Fx75dmLIJyc3zeLEbjWaS/tensXSeoF7aQJ/78r8hnPWpPdihxOFVIe/lrv73zVVEXM84RvNJKx0wbniHqjWVS5ghifK+HWZvhiamamvcE+3g"
    "LnQknHCHLvGIXsm0PPAaFjQjk9Ldi0nAEIp5+fQIJA1KaYnuhQaWUgExUE4Avk68idUCsTlOKkFFZJeKlFKA2cf0gD99zNkAp/YoHIZ9OYDbWS++"
    "sL5qPuhl5iU4KYAO5cwCe7Ronwvfc0MIMNn7B831MBnLIXMYUf2TPfbCqGtT4Pjk7mt4WyaTZEsSBmkpbfMMtot+dGPB5nQ3TM+t3dGuNm7unOWL"
    "4UWMVPjy+/QEQuzfKSe1Grv7zq/DJDtQSTaNV+ERVDdtfKaJvmibk64hmlTND0ZdnqAdrUdcxQpdt+r/sWdpqXlcmjNrnyDGL3b/4nRnIeS6nVsz"
    "hYZLk3VbyWL3qqSwisbiPPD505/A7oqFdLs3eIvg9SfsusZxOMzbKXa13LaOn89oISEO9rqBgkHqurso/6khZP4vCnm72f/MA1z0WWqHGPaBuXLs"
    "Jj4/r3+rUeGtzssueRYOVh+QadJ/vCXDt98sLyYJKimRBNzcMmypkoR0VPAKYOH3qtQHX44f+qSaiWNka1m10+TmxbNj7hQ5EJAE0ASX/q4DMeqR"
    "LAfXyT/41/4eBbHBZtk8PYNN7yBF9LaybbVB3ctJXNxBTRRylHpnMI8+EEU+Md0J4BYHDsVp0fyOzIE2gbJ0W6B/6KJPLMB4l6F1eZmStoaD7hrS"
    "GtGOhQrv/jFbj4tfbYxQXQUl6yuJkrDJajCGZ7Mv0/Nu7Pm935O0Xuvun6/fhDJS2Q6lEIGk8Cji6QuF36PoxiqIedD0U3bD5wg59BdETBWw2IIi"
    "3h2Tj2H/488Bqfu4vWToyoxYe0yPZQclUumNYm+zTJSu/2nrVykvQEA2atgAxGCS7G26UgysB3JrLo4LXFdvfvQs9B9KKhlIWuRCNztPoAM0xf46"
    "IYEUChHiw1QNn4zfQACgz/8b/4sgwAAAAAA=")

SAFE_DEFS = (
    '<svg class="sq-defs" aria-hidden="true"><defs><clipPath id="sq-round"><circle cx="872" cy="872" r="872"/></clipPath>'
    '<symbol id="sq-maya" viewBox="0 0 1744 1744"><g clip-path="url(#sq-round)" fill="none" stroke="none">' + AVATAR_MAYA
    + '</g></symbol><symbol id="sq-leo" viewBox="0 0 1744 1744"><g clip-path="url(#sq-round)" fill="none" stroke="none">'
    + AVATAR_LEO + '</g></symbol><symbol id="sq-ops" viewBox="0 0 112 112"><image href="data:image/webp;base64,' + AVATAR_OPS
    + '" width="112" height="112"/></symbol></defs></svg>'
)


# ---------------------------------------------------------------- the server


class Handler(http.server.BaseHTTPRequestHandler):
    # Seconds a connection may sit idle: a half-sent request doesn't hold its thread for good
    timeout = 20

    def send(self, status, data, kind="text/html; charset=utf-8", headers=None):
        payload = data.encode() if isinstance(data, str) else data
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        # same-origin, not no-referrer: with no-referrer, browsers send this page's own forms as Origin: null
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Content-Type-Options", "nosniff")
        # Never inside another page: another app's page on this Umbrel counts as the same site
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "frame-ancestors 'none'")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(payload)

    def redirect(self, where, headers=None):
        self.send_response(303)
        self.send_header("Location", where)
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()

    def signed_in(self):
        for part in (self.headers.get("Cookie") or "").split(";"):
            name, _, value = part.strip().partition("=")
            if name == COOKIE and session_ok(value):
                return True
        return False

    def form(self):
        fields = urllib.parse.parse_qs(self.rfile.read(self.length).decode(errors="replace"))
        return {name: values[0] for name, values in fields.items()}

    def uploaded(self, name):
        """The file a one-file form sends, as bytes, or b"" for anything else. The body has the same limit as every
        form's. Python 3.13 has no cgi module: the email package reads the parts."""
        body = self.rfile.read(self.length)
        kind = self.headers.get("Content-Type") or ""
        if not kind.lower().startswith("multipart/form-data"):
            return b""
        try:
            message = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(
                b"Content-Type: " + kind.encode("latin-1") + b"\r\n\r\n" + body)
            parts = list(message.iter_parts()) if message.is_multipart() else []
            # One part, as a browser sends this form: named for its field, and with no transfer encoding (browsers
            # never send one), so the bytes are the file's own
            if (len(parts) != 1 or parts[0].get_param("name", header="content-disposition") != name
                    or parts[0].get("content-transfer-encoding") is not None):
                return b""
            data = parts[0].get_payload(decode=True)
            return data if isinstance(data, bytes) else b""
        except Exception:  # a broken form is no file, and nothing from it reaches a log
            return b""

    def same_origin(self):
        """Refuses forms posted from other sites, and from other apps' pages on the same Umbrel (another
        port on the same host is "same-site"). Browsers say where a request comes from in Sec-Fetch-Site,
        whatever Host Umbrel's proxy passes on; Origin is the fallback for browsers that don't send it.
        Not authentication: the session cookie is that."""
        site = self.headers.get("Sec-Fetch-Site")
        if site:
            return site in ("same-origin", "none")
        origin = self.headers.get("Origin")
        if not origin:
            return True
        hosts = {self.headers.get("Host"), self.headers.get("X-Forwarded-Host")}
        return urllib.parse.urlsplit(origin).netloc in hosts

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/login":
            return self.send(200, login_page())
        if not self.signed_in():
            if path == "/status.json":
                return self.send(401, json.dumps({"error": "sign in"}), "application/json")
            return self.redirect("./login")
        setup = load_setup()
        if path == "/status.json":
            if not setup:
                return self.send(200, json.dumps({"phase": "setup", "html": ""}), "application/json")
            live, items = cached_check(setup)
            checks = checks_html(setup, live, items)
            return self.send(200, json.dumps({"phase": phase_of(setup, live, items), "live": live, "html": checks,
                                              "sig": checks_sig(checks)}), "application/json")
        if path not in ("/", ""):
            return self.send(404, layout("<h1>Not found</h1>"))
        return self.send(200, main_page(setup) if setup else setup_page())

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        try:
            self.length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.length = -1
        # The page's forms are small; anything else is refused before it's read, signed in or not
        if not 0 <= self.length <= 20000:
            return self.send(413, "That's more than this page's forms send.", "text/plain")
        if not self.same_origin():
            return self.send(403, "This page only accepts its own forms.", "text/plain")
        if path == "/login":
            ip = self.client_address[0]
            if too_many_failures(ip):
                return self.send(429, login_page("Too many tries. Wait ten minutes, then try again."))
            password = self.form().get("password", "")
            if PASSWORD and hmac.compare_digest(password.encode(), PASSWORD.encode()):
                cookie = COOKIE + "=" + new_session() + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + str(SESSION_SECONDS)
                return self.redirect("./", {"Set-Cookie": cookie})
            note_failure(ip)
            return self.send(401, login_page("That password doesn't match. Copy it again from Umbrel."))
        if path == "/logout":
            return self.redirect("./login", {"Set-Cookie": COOKIE + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"})
        if not self.signed_in():
            return self.send(401, layout("<h1>Sign in first</h1><p><a href=\"./login\">Sign in</a></p>", signed_in=False))
        if path == "/cloudflare-upload":
            data = self.uploaded("cert")
            with SETUP_LOCK:
                return self.cloudflare_upload(data)
        values = self.form()
        with SETUP_LOCK:
            return self.change(path, values)

    def cloudflare_upload(self, data):
        setup = load_setup()
        # Only while the tunnel waits for a sign-in, where the page offers it: at any other time nothing would
        # take the file, and it would sit in the shared folder
        if not setup or setup["mode"] != "domain" or cloudflare_state()["state"] != "signin":
            return self.redirect("./")
        try:
            data = cloudflare_cert(data)
        except ValueError as error:
            return self.send(400, main_page(setup, str(error), {"form": "cert"}))
        try:
            write_secret(CLOUDFLARE_UPLOAD, data)  # as Cloudflare saved it, byte for byte
        except OSError:
            drop_upload()
            return self.send(503, main_page(setup, "This app couldn't save the file. Try again in a minute.",
                                            {"form": "cert"}))
        # The tunnel moved on while this was written, with its own sign-in: nothing will take the file now
        if cloudflare_state()["state"] != "signin":
            drop_upload()
        return self.redirect("./")

    def change(self, path, values):
        setup = load_setup()
        if path == "/save":
            if setup:
                return self.redirect("./")
            try:
                key, mode, domain = self.address(values)
                if values.get("ack") != "yes":
                    raise ValueError("Tick the box to confirm you understand that changing the address later "
                                     "starts a new, empty community.")
            except ValueError as error:
                return self.send(400, setup_page(str(error), values))
            save(values["owner"].strip(), key, mode, domain)
            return self.redirect("./")
        if not setup:
            return self.redirect("./")
        if path == "/owner":
            values["form"] = "owner"
            try:
                key = owner_hex(values.get("owner", ""))
            except ValueError as error:
                return self.send(400, main_page(setup, str(error), values))
            setup["owner"], setup["owner_hex"] = values["owner"].strip(), key
            save(setup["owner"], key, setup["mode"], relay_domain() or setup.get("domain", ""))
            return self.redirect("./")
        if path == "/cloudflare-reset":
            # Only where the page offers it: a working tunnel deleted here would leave its DNS name behind
            if cloudflare_state()["state"] in ("error", "wrong-domain"):
                write_atomic(CLOUDFLARE_RESET, "1\n")
            return self.redirect("./")
        if path == "/notifications":
            save(setup["owner"], setup["owner_hex"], setup["mode"], relay_domain() or setup.get("domain", ""),
                 values.get("push") == "on")
            return self.redirect("./")
        if path == "/moderation":
            values["form"] = "moderation"
            forget_admin()  # a save looks at the address again, even one that changes nothing
            want = values.get("moderation") == "on"
            domain = relay_domain() or setup.get("domain") or ""
            if want and (setup["mode"] != "domain" or not domain):
                return self.send(400, main_page(setup, "Moderation needs your own domain.", values))
            # Unchanged, nothing is written and Buzz doesn't restart
            if want != moderation_on(setup):
                save(setup["owner"], setup["owner_hex"], setup["mode"], domain, moderation=want)
            return self.redirect("./")
        if path == "/address":
            values["form"] = "address"
            current = relay_domain() or setup.get("domain") or ""
            try:
                if current and values.get("confirm", "").strip().lower() != current:
                    raise ValueError("To confirm, type the current address exactly.")
                if not current and values.get("ack") != "yes":
                    raise ValueError("Tick the box to confirm you understand this starts a new, empty community.")
                values["owner"] = setup["owner"]
                key, mode, domain = self.address(values)
                if mode != "domain" and setup["mode"] != "domain":
                    domain = current  # the same Tailscale machine, published another way
            except ValueError as error:
                return self.send(400, main_page(setup, str(error), values))
            save(setup["owner"], setup["owner_hex"], mode, domain)
            return self.redirect("./")
        return self.send(404, layout("<h1>Not found</h1>"))

    def address(self, values):
        key = owner_hex(values.get("owner", ""))
        mode = values.get("mode", "")
        if mode not in MODES:
            raise ValueError("Choose how members reach the community.")
        domain = clean_domain(posted_domain(values)) if mode == "domain" else ""
        return key, mode, domain

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    if not PASSWORD:
        print("APP_PASSWORD is not set: the setup page refuses every sign-in.", flush=True)
    # A write of an uploaded sign-in that a stop cut short. One that finished waits for the tunnel.
    try:
        os.remove(CLOUDFLARE_UPLOAD + ".tmp")
    except OSError:
        pass
    # The relay's settings, as setup.json says, after a stop in the middle of a save
    try:
        reconcile()
    except OSError:
        pass
    threading.Thread(target=tailscale_watcher, daemon=True).start()
    http.server.ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
