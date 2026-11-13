"""Checks the setup page on the local run (up.sh), for real: sign-in, a request from
another container on the shared network, setup, persistence across restarts, owner and address
changes, switching back, the Tailscale modes up to the sign-in link, a sign-in uploaded as the file
Cloudflare saved, taken by the real Cloudflare service, and moderation turned on and off, with the relay's
admin API asked through the gateway, a ban that an invite link doesn't get around, its lift, and a restart
with moderation on. Prints PASS/FAIL lines. The app password is read from run/.env and never printed.
The upload is made up: Cloudflare refuses its token once. The test keys for moderation are made here and
kept in memory."""
import html, http.cookiejar, importlib.machinery, importlib.util, io, json, os, re, subprocess, sys, tarfile, time, uuid
import urllib.error, urllib.parse, urllib.request
import signin_files

L = os.path.dirname(os.path.abspath(__file__))
ENV = dict(line.strip().split("=", 1) for line in open(os.path.join(L, "run/.env")) if "=" in line)
BASE = "http://127.0.0.1:8090"
DOCKER = dict(os.environ, DOCKER_CONFIG=os.path.join(L, "run/dockercfg"))
OWNER = "npub1464m3lr8zsjm79l073tcrptr8ekddatt30p8q4f25zcc7dq0zc7sc9a4yn"   # a test identity
OWNER2 = "npub1xhq934ja9kl4d0h6r4pazkjg4whvp6umptmtsxcrd2zkc9e3rd3ssj94xd"  # another test identity
D1, D2 = "buzz-one.local-test.invalid", "buzz-two.local-test.invalid"
passed = failed = 0


def ok(cond, text):
    global passed, failed
    print(("PASS  " if cond else "FAIL  ") + text, flush=True)
    if cond:
        passed += 1
    else:
        failed += 1


def sh(*args, check=False):
    return subprocess.run(args, capture_output=True, text=True, env=DOCKER, check=check).stdout


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


jar = http.cookiejar.CookieJar()
browser = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect)


def call(path, data=None, opener=browser, headers=None):
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    try:
        r = opener.open(urllib.request.Request(BASE + path, data=body, headers=headers or {}), timeout=60)
        return r.status, r.read().decode(errors="replace"), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace"), e.headers


def settings(name):
    # Tailscale's and Cloudflare's files are in folders the page shares with each helper alone
    folder = "/tailscale/" if name.startswith("tailscale-") else "/cloudflare/" if name.startswith("cloudflare-") else "/settings/"
    return sh("docker", "exec", "buzz_web_1", "cat", folder + name)


def members():
    return sh("docker", "exec", "buzz_relay_1", "bash", "-c",
              "set -a; . /data/settings/relay.env; . /data/secrets/relay.env; set +a; buzz-admin list-members")


def owner_of(text):
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[1] == "owner":
            return parts[0]
    return ""


def wait_relay(domain, seconds=180):
    end = time.time() + seconds
    while time.time() < end:
        got = sh("docker", "exec", "buzz_web_1", "python3", "-c",
                 "import urllib.request; r=urllib.request.Request('http://buzz_relay_1:3000/', headers={'Host':'" + domain +
                 "','Accept':'application/nostr+json'}); print(urllib.request.urlopen(r, timeout=5).read().decode())")
        if '"self"' in got:
            return json.loads(got)
        time.sleep(4)
    return {}


def hexkey(npub):
    out = sh("docker", "exec", "buzz_web_1", "python3", "-c",
             "import importlib.machinery as m, importlib.util as u; l=m.SourceFileLoader('s','/app/setup.py'); "
             "s=u.module_from_spec(u.spec_from_loader('s',l)); l.exec_module(s); print(s.owner_hex('" + npub + "'))")
    return out.strip()


print("== Sign-in")
s, body, h = call("/")
ok(s == 303 and h.get("Location") == "./login", "the page sends a visitor without a session to sign in")
s, body, _ = call("/status.json")
ok(s == 401, "status.json refuses a visitor without a session (HTTP %s)" % s)

print("== Another app on the same Docker network, going around Umbrel's proxy")
attack = ("import urllib.request, urllib.parse, urllib.error\n"
          "d = urllib.parse.urlencode({'owner': '" + OWNER2 + "', 'mode': 'domain', 'domain': 'evil.example.com', 'ack': 'yes'}).encode()\n"
          "try:\n    r = urllib.request.urlopen(urllib.request.Request('http://buzz_web_1:8080/save', data=d), timeout=10); print(r.status)\n"
          "except urllib.error.HTTPError as e:\n    print(e.code)\n"
          "try:\n    r = urllib.request.urlopen('http://buzz_web_1:8080/status.json', timeout=10); print(r.status)\n"
          "except urllib.error.HTTPError as e:\n    print(e.code)\n")
out = sh("docker", "run", "--rm", "--network", "umbrel_main_network_local", "python:3.13.16-alpine3.24", "python3", "-c", attack).split()
ok(out[:2] == ["401", "401"], "a direct request from another container can't save settings or read status (HTTP %s)" % " ".join(out[:2]))
ok(settings("setup.json") == "", "nothing was saved by that request")

s, body, _ = call("/login", {"password": "not-the-password"})
ok(s == 401 and "match" in body, "a wrong password is refused")
s, body, h = call("/login", {"password": ENV["APP_PASSWORD"]})
ok(s == 303 and any(c.name == "buzz_setup" for c in jar), "the app password signs in and sets a session cookie")
cookie = next((c for c in jar if c.name == "buzz_setup"), None)
ok(cookie is not None and cookie.has_nonstandard_attr("HttpOnly"), "the session cookie is HttpOnly")
# Browsers send the session cookie to every port on the Umbrel's address, so another app's page could
# post this page's forms; the browser marks those requests same-site.
s, body, _ = call("/save", {"owner": OWNER2, "mode": "domain", "domain": "evil.example.com", "ack": "yes"},
                  headers={"Sec-Fetch-Site": "same-site", "Origin": "http://umbrel.local:4000"})
ok(s == 403 and settings("setup.json") == "", "a form posted from another app's page on the same Umbrel is refused (HTTP %s)" % s)
s, body, _ = call("/save", {"owner": OWNER, "mode": "domain", "domain": D1},
                  headers={"Sec-Fetch-Site": "same-origin", "Origin": "http://umbrel.local:3025"})
ok(s == 400 and "Tick the box" in body, "the page's own forms pass whatever Host the proxy forwards (reached validation)")

print("== Setup")
s, body, _ = call("/")
ok(s == 200 and "Host your" in body and "How members reach it" in body, "signed in, the page shows the setup steps")
s, body, _ = call("/save", {"owner": OWNER, "mode": "domain", "domain": D1})
ok(s == 400 and "Tick the box" in body, "creating without the acknowledgement is refused")
s, body, _ = call("/save", {"owner": "npub1notreal", "mode": "domain", "domain": D1, "ack": "yes"})
ok(s == 400 and "npub1" in body, "a bad public ID is refused")
s, body, _ = call("/save", {"owner": OWNER, "mode": "domain", "domain": "umbrel.local", "ack": "yes"})
ok(s == 400 and "home network" in body, "a home-network-only name is refused")
s, body, _ = call("/save", {"owner": OWNER, "mode": "domain", "domain": "https://" + D1 + "/", "ack": "yes"})
ok(s == 303, "the owner and the domain are saved (HTTP %s)" % s)
info = wait_relay(D1)
ok(bool(info.get("self")), "the relay starts with the saved address (NIP-11 answers for %s)" % D1)
ok(owner_of(members()) == hexkey(OWNER), "the relay's owner is the page's owner")
ok("buzz-push-v1" in (info.get("supported_extensions") or []), "phone notifications are on by default (NIP-11 offers buzz-push-v1)")
s, body, _ = call("/")
ok("Connect" in body and "Cloudflare" in body and "isn't published yet" in body,
   "the page shows the Cloudflare steps, and that the name doesn't resolve")
ok("buzz-gateway:80" in body, "the page gives the tunnel's service URL")
cf_link = ""
for _ in range(40):
    found = re.search(r"https://dash\.cloudflare\.com/argotunnel\?\S+", settings("cloudflare-login.log"))
    if found and settings("cloudflare-state").strip() == "signin":
        cf_link = found.group(0)
        break
    time.sleep(3)
ok(bool(cf_link), "the app's own Cloudflare tunnel waits for a sign-in, with Cloudflare's link")
s, body, _ = call("/")
ok("Sign in to Cloudflare" in body and html.escape(cf_link) in body, "the page shows that sign-in link")

print("== Persistence across a restart of every container")
sh("docker", "compose", "-p", "buzzlocal", "--env-file", os.path.join(L, "run/.env"), "-f", os.path.join(L, "run/compose.yml"), "restart")
time.sleep(5)
info2 = wait_relay(D1)
ok(info2.get("self") == info.get("self"), "the relay comes back with the same identity")
ok(owner_of(members()) == hexkey(OWNER), "the owner survives the restart")
s, body, _ = call("/")
ok(s == 200 and "Connect" in body, "the session survives the restart and the page remembers the setup")

print("== Phone notifications")
s, body, _ = call("/notifications", {})
ok(s == 303 and "BUZZ_PUSH_ENABLED=false" in settings("relay.env"), "turning phone notifications off is saved")
time.sleep(8)
ok("buzz-push-v1" not in (wait_relay(D1).get("supported_extensions") or []), "the relay restarts without them")
s, body, _ = call("/")
ok('name="push" value="on">' in body, "the page shows them off")

print("== Changing the owner")
s, body, _ = call("/owner", {"owner": OWNER2})
ok(s == 303, "the new owner is saved")
time.sleep(8)
wait_relay(D1)
listing = members()
ok(owner_of(listing) == hexkey(OWNER2), "the relay's owner is the new one")
ok(any(hexkey(OWNER) in line and "admin" in line for line in listing.splitlines()), "the previous owner is now an admin")
ok("BUZZ_PUSH_ENABLED=false" in settings("relay.env"), "phone notifications stay off through the owner change")
s, body, _ = call("/notifications", {"push": "on"})
time.sleep(8)
ok(s == 303 and "buzz-push-v1" in (wait_relay(D1).get("supported_extensions") or []), "turning them back on offers them again")

print("== Changing the address, guarded")
s, body, _ = call("/address", {"mode": "domain", "domain": D2, "ack": "yes", "confirm": "wrong"})
ok(s == 400 and "exactly" in body, "a change without typing the current address is refused")
s, body, _ = call("/address", {"mode": "domain", "subdomain": D2.split(".", 1)[0], "base": D2.split(".", 1)[1], "confirm": D1})
ok(s == 303, "typing the current address confirms the change, with the new address in the two boxes")
time.sleep(8)
wait_relay(D2)
ok(owner_of(members()) == hexkey(OWNER2) and hexkey(OWNER) not in members(),
   "the new address is a separate community: the owner, and none of the old members")
s, body, _ = call("/address", {"mode": "domain", "domain": D1, "ack": "yes", "confirm": D2})
time.sleep(8)
wait_relay(D1)
ok(any(hexkey(OWNER) in line and "admin" in line for line in members().splitlines()),
   "switching back to the first address brings its community back, admin included")

print("== The Tailscale modes, up to the sign-in")
s, body, _ = call("/address", {"mode": "funnel", "ack": "yes", "confirm": D1})
ok(s == 303 and settings("tailscale-enabled").strip() == "funnel", "choosing the free Tailscale address starts Tailscale in Funnel mode")
time.sleep(8)
ok(settings("cloudflare-enabled") == "" and settings("cloudflare-state") == "",
   "and turns the Cloudflare tunnel off: it waits, with no sign-in running")
link = ""
for _ in range(30):
    status = settings("tailscale-status.json")
    m = re.search(r'"AuthURL":\s*"(https://login\.tailscale\.com/a/[^"]+)"', status)
    if m:
        link = m.group(1)
        break
    time.sleep(3)
ok(bool(link), "Tailscale is waiting for a sign-in, with a link")
s, body, _ = call("/")
ok("Sign in to Tailscale" in body and link in body, "the page shows that sign-in link")
ok(settings("relay.env") == "", "the relay waits: no address until Tailscale names the machine")
s, body, _ = call("/address", {"mode": "private"})
ok(s == 400 and "Tick the box" in body, "with no address to type, a change needs the box ticked")
s, body, _ = call("/address", {"mode": "private", "ack": "yes"})
ok(s == 303 and settings("tailscale-enabled").strip() == "private",
   "with no address yet, switching to the private network needs only the acknowledgement")
s, body, _ = call("/address", {"mode": "domain", "domain": D1, "ack": "yes"})
ok(s == 303 and settings("tailscale-enabled") == "", "going back to the domain turns Tailscale off")
wait_relay(D1)
ok(owner_of(members()) == hexkey(OWNER2), "and the first address's community is back")
time.sleep(10)
ok(settings("tailscale-status.json") == "", "Tailscale stopped and cleared its state for the page")
s, body, _ = call("/address", {"mode": "private", "ack": "yes", "confirm": D1})
link2 = ""
for _ in range(30):
    m2 = re.search(r'"AuthURL":\s*"(https://login\.tailscale\.com/a/[^"]+)"', settings("tailscale-status.json"))
    if m2:
        link2 = m2.group(1)
        break
    time.sleep(3)
ok(s == 303 and bool(link2), "switching to Tailscale again starts it again, with a sign-in link (private network)")
s, body, _ = call("/")
ok("Connect your private network" in body, "the page shows the private network's sign-in step")
call("/address", {"mode": "domain", "domain": D1, "ack": "yes"})

print("== A sign-in Cloudflare saved as a file, uploaded")
PKG = os.path.normpath(os.path.join(L, "../../../umbrel"))


def compose_function(service, name):
    """A function from a service's script in docker-compose.yml, with compose's $$ back to $."""
    block = open(os.path.join(PKG, "buzz/docker-compose.yml")).read().split("\n  " + service + ":\n", 1)[1]
    lines = []
    for line in block.split("      - |\n", 1)[1].splitlines():
        if line and not line.startswith("        "):
            break
        lines.append(line[8:])
    script = "\n".join(lines).replace("$$", "$")
    start = script.index("\n" + name + "() (") + 1
    return script[start:script.index("\n)\n", start) + 3]


loader = importlib.machinery.SourceFileLoader("page", os.path.join(PKG, "setup-page/setup.py"))
page = importlib.util.module_from_spec(importlib.util.spec_from_loader("page", loader))
loader.exec_module(page)


def takes(data):
    try:
        page.cloudflare_cert(data)
        return True
    except ValueError:
        return False


# The same made-up files through the tunnel's own check, in the real image: busybox, as the service runs it
archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode="w") as tar:
    for name, data, _ in signin_files.CASES:
        info = tarfile.TarInfo(name)
        info.size = len(data)
        tar.addfile(info, io.BytesIO(data))
subprocess.run(["docker", "exec", "-i", "buzz_cloudflared_1", "sh", "-c", "rm -rf /tmp/corpus && mkdir /tmp/corpus && tar -x -C /tmp/corpus"],
               input=archive.getvalue(), capture_output=True, env=DOCKER)
runner = compose_function("cloudflared", "signin_file") + (
    '\nfor f in /tmp/corpus/*; do if signin_file "$f"; then echo "yes ${f##*/}"; else echo "no ${f##*/}"; fi; done; rm -rf /tmp/corpus\n')
said = dict(reversed(line.split(" ", 1)) for line in sh("docker", "exec", "buzz_cloudflared_1", "sh", "-c", runner).splitlines())
differ = [n for n, data, _ in signin_files.CASES if said.get(n) != ("yes" if takes(data) else "no")]
ok(len(said) == len(signin_files.CASES) and not differ,
   "the service's own check, in the real image, takes exactly the %d made-up files the page takes, of %d%s"
   % (sum(takes(d) for _, d, _ in signin_files.CASES), len(signin_files.CASES), (": differs for " + ", ".join(differ)) if differ else ""))
signin = False
for _ in range(40):
    if settings("cloudflare-state").strip() == "signin" and "argotunnel" in settings("cloudflare-login.log"):
        signin = True
        break
    time.sleep(3)
made_up = signin_files.saved()  # zeros for the IDs and local-test-only-not-a-token: no account is involved
kind, form = signin_files.multipart([("cert", "cert.pem", made_up, b"")])
try:
    s = browser.open(urllib.request.Request(BASE + "/cloudflare-upload", data=form, headers={"Content-Type": kind}), timeout=60).status
except urllib.error.HTTPError as e:
    s = e.code
ok(signin and s == 303, "back on the domain, the page takes a sign-in file while the service waits (HTTP %s)" % s)
moved = ""
for _ in range(10):
    moved = settings("cloudflare-state").strip()
    if settings("cloudflare-upload.pem") == "" and moved not in ("", "signin"):
        break
    time.sleep(1)
ok(moved not in ("", "signin") and settings("cloudflare-upload.pem") == "",
   "within seconds the real service took it: the upload is gone and the tunnel moved on (%s)" % moved)
cert = sh("docker", "exec", "buzz_cloudflared_1", "stat", "-c", "%a %u", "/cloudflare/.cloudflared/cert.pem").strip()
same = sh("docker", "exec", "buzz_cloudflared_1", "cat", "/cloudflare/.cloudflared/cert.pem") == made_up.decode()
ok(cert == "600 1000" and same, "it's the service's cert.pem, byte for byte as uploaded, mode 600, owned by the app's user (%s)" % cert)
for _ in range(30):
    if settings("cloudflare-state").strip() == "error":
        break
    time.sleep(3)
s, body, _ = call("/")
ok(settings("cloudflare-state").strip() == "error" and "Cloudflare refused a step" in body and "Sign in to Cloudflare again" in body
   and signin_files.TOKEN not in body, "Cloudflare refuses the made-up token, and the page offers Sign in to Cloudflare again")
s, body, _ = call("/cloudflare-reset", {})
reset = False
for _ in range(40):
    if settings("cloudflare-state").strip() == "signin" and "argotunnel" in settings("cloudflare-login.log"):
        reset = True
        break
    time.sleep(3)
gone = sh("docker", "exec", "buzz_cloudflared_1", "sh", "-c", "test -e /cloudflare/.cloudflared/cert.pem || echo gone").strip()
ok(s == 303 and reset and gone == "gone", "the reset deletes that sign-in and starts a new one, with a new link")

print("== Moderation: the relay's admin API at %s:8443, from the real image" % D1)
# Requests go through the gateway, from the page's container on the shared network, with the Host a request for
# <name>:8443 has when the app's tunnel delivers it. The test keys are made here, held in memory, and reach
# nip98.py and event.py on stdin; the signatures reach the request on stdin too.
LIB = os.path.normpath(os.path.join(L, "../../lib"))
ORIGIN = "https://" + D1 + ":8443"
GATEWAY = '''import http.client, json, sys
host, method, path, accept = sys.argv[1:5]
body = sys.argv[5].encode() if len(sys.argv) > 5 else None
auth = sys.stdin.readline().strip()
headers = {"Host": host, "Accept": accept}
if auth:
    headers["Authorization"] = auth
if body is not None:
    headers["Content-Type"] = "application/json"
try:
    c = http.client.HTTPConnection("buzz-gateway", 80, timeout=15)
    c.request(method, path, body=body, headers=headers)
    r = c.getresponse()
    h = {k.lower(): v for k, v in r.getheaders()}
    print(json.dumps({"status": r.status, "csp": h.get("content-security-policy", ""), "www": h.get("www-authenticate", ""),
                      "body": r.read(65536).decode(errors="replace")[:4000]}))
except Exception as e:
    print(json.dumps({"status": 0, "body": type(e).__name__}))
'''


def lib(script, *args, secret=""):
    return subprocess.run([sys.executable, os.path.join(LIB, script)] + list(args), input=secret, capture_output=True,
                          text=True).stdout.strip()


def gateway(host, method, path, accept="application/json", body=None, auth=""):
    args = ["docker", "exec", "-i", "buzz_web_1", "python3", "-c", GATEWAY, host, method, path, accept] + ([body] if body is not None else [])
    out = subprocess.run(args, input=auth + "\n", capture_output=True, text=True, env=DOCKER).stdout
    try:
        return json.loads(out)
    except ValueError:
        return {"status": 0, "body": ""}


def signed(secret, method, path, body=None):
    return lib("nip98.py", method, ORIGIN + path, *([body] if body is not None else []), secret=secret)


def probe(secret="", host=D1 + ":8443"):
    return gateway(host, "GET", "/api/admin/v1/probe", auth=signed(secret, "GET", "/api/admin/v1/probe") if secret else "")


def admin_api():
    """The admin API the relay's NIP-11 advertises, "" for none, or None while the relay doesn't answer."""
    info = wait_relay(D1, 60)
    return (info.get("admin_api") or "") if info else None


def advertised(want, seconds=180):
    end = time.time() + seconds
    while time.time() < end:
        if admin_api() == want:
            return True
        time.sleep(3)
    return False


def relay_admin_env():
    """The relay process's own admin settings, by name: the rest of its environment holds secrets."""
    return sh("docker", "exec", "buzz_relay_1", "bash", "-c", 'for p in /proc/[0-9]*; do [ "$(cat $p/comm 2> /dev/null)" = '
              'buzz-relay ] && tr "\\0" "\\n" < $p/environ | grep -E "^(BUZZ_ADMIN_HOST|BUZZ_ADMIN_AUTH|BUZZ_ADMIN_TOKEN|'
              'RELAY_OPERATOR_PUBKEYS|BUZZ_ADMIN_WEB_DIR)="; done').strip()


def member_post(secret, kind, tags, content=""):
    """An event posted as Buzz posts one, through the gateway for the community's own address: (status, body),
    with a status of 200 only when the relay accepted it."""
    event = lib("event.py", str(kind), json.dumps(tags), content, secret=secret)
    got = gateway(D1, "POST", "/events", body=event, auth=lib("nip98.py", "POST", "https://" + D1 + "/events", event, secret=secret))
    status, text = got.get("status"), got.get("body", "")
    try:
        accepted = json.loads(text).get("accepted") is True
    except (ValueError, AttributeError):
        accepted = False
    return (status if status != 200 or accepted else "200, not accepted"), text


def api_post(secret, path, body):
    """A signed POST to the relay's HTTP API at the community's own address, as Buzz sends one: (status, body)."""
    got = gateway(D1, "POST", path, body=body, auth=lib("nip98.py", "POST", "https://" + D1 + path, body, secret=secret))
    return got.get("status"), got.get("body", "")


def json_of(text):
    try:
        value = json.loads(text)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


owner_sk, owner_key = lib("keygen.py").split()
member_sk, member_key = lib("keygen.py").split()
s, body, _ = call("/owner", {"owner": owner_key})
time.sleep(8)
wait_relay(D1)
ok(s == 303 and owner_of(members()) == owner_key, "a test owner whose key is held here becomes the owner")
ok(admin_api() == "" and probe()["status"] == 404, "moderation is off by default: no admin API advertised, and none at %s:8443" % D1)
s, body, _ = call("/moderation", {"moderation": "on"})
ok(s == 303 and "BUZZ_ADMIN_HOST=" + D1 + ":8443\n" in settings("relay.env"), "the page turns it on: its line in the relay's settings")
ok(advertised(ORIGIN), "the relay restarts with it, and its NIP-11 advertises admin_api " + ORIGIN)
ok(relay_admin_env() == "BUZZ_ADMIN_HOST=" + D1 + ":8443",
   "the relay process has that alone: no open mode, no other operators, no browser dashboard (%s)" % relay_admin_env().replace("\n", " "))
got = gateway(D1 + ":8443", "GET", "/", "application/nostr+json")
ok(got["status"] == 404 and got["csp"].startswith("default-src 'none'") and "frame-ancestors 'none'" in got["csp"],
   "through the gateway, %s:8443 is the relay's admin host: 404 with its own security policy (HTTP %s)" % (D1, got["status"]))
got = gateway(D1 + ":8443", "GET", "/", "text/html")
ok(got["status"] == 404 and got["body"] == "", "a browser there gets no page: the dashboard is off (HTTP %s)" % got["status"])
got = probe()
ok(got["status"] == 401 and got["www"] == "Nostr", "an unsigned request to the admin API is refused (HTTP %s)" % got["status"])
ok(probe(member_sk)["status"] == 403, "another key's signature is refused (HTTP 403)")
got = probe(owner_sk)
role = json.loads(got["body"]) if got["status"] == 200 else {}
ok(got["status"] == 200 and (role.get("role"), role.get("source")) == ("operator", "owner_fallback"),
   "the owner's signature gets in: the operator, as the relay's owner (HTTP %s)" % got["status"])
ok(probe(owner_sk, host=D1)["status"] == 403, "the same signature sent for the community's own address is refused (HTTP 403)")

sh("docker", "exec", "buzz_relay_1", "bash", "-c", "set -a; . /data/settings/relay.env; . /data/secrets/relay.env; set +a; "
   "buzz-admin add-member --pubkey " + lib("npub.py", member_key))
channel = str(uuid.uuid4())
s1, _ = member_post(member_sk, 9007, [["h", channel], ["name", "moderation check"], ["visibility", "private"], ["channel_type", "stream"]])
s2, _ = member_post(member_sk, 9, [["h", channel]], "before the ban")
ok((s1, s2) == (200, 200), "a member posts (HTTP %s, %s)" % (s1, s2))
ban = "/api/admin/v1/members/" + member_key + "/ban?communityHost=" + D1
body = json.dumps({"requestId": str(uuid.uuid4())})
got = gateway(D1 + ":8443", "POST", ban, body=body, auth=signed(owner_sk, "POST", ban, body))
ok(got["status"] in (200, 202), "the owner bans the member through the admin API (HTTP %s)" % got["status"])
refused = False
for _ in range(10):
    s, text = member_post(member_sk, 9, [["h", channel]], "after the ban")
    if s == 403 and "banned" in text:
        refused = True
        break
    time.sleep(2)
ok(refused, "the banned member's posts are refused: banned from this community")
# The page says a banned identity can't come back with an invite link, and a new identity still joins with one
s, text = api_post(owner_sk, "/api/invites", "{}")
code = (json_of(text) if s == 200 else {}).get("code", "")
s1, t1 = api_post(member_sk, "/api/invites/claim", json.dumps({"code": code}))
guest_sk, _ = lib("keygen.py").split()
s2, t2 = api_post(guest_sk, "/api/invites/claim", json.dumps({"code": code}))
ok(bool(code) and s1 == 403 and json_of(t1).get("error") == "invite_restricted" and s2 == 200 and json_of(t2).get("status") == "joined",
   "the banned identity can't come back with the owner's invite link (HTTP %s, invite_restricted), and a new identity "
   "joins with the same link (HTTP %s)" % (s1, s2))
s, body, _ = call("/moderation", {})
ok(s == 303 and "BUZZ_ADMIN_HOST" not in settings("relay.env") and '"moderation": false' in settings("setup.json"),
   "the page turns it off: the line goes, and setup.json keeps \"moderation\": false")
ok(advertised(""), "the relay restarts without it: no admin API advertised")
ok(probe(owner_sk)["status"] == 404, "and none at %s:8443, for the owner either" % D1)
s, text = member_post(member_sk, 9, [["h", channel]], "with moderation off")
ok(s == 403 and "banned" in text, "the ban holds with moderation off")
call("/moderation", {"moderation": "on"})
advertised(ORIGIN)
lift = "/api/admin/v1/members/" + member_key + "/ban?communityHost=" + D1
got = gateway(D1 + ":8443", "DELETE", lift, auth=signed(owner_sk, "DELETE", lift))
back = None
for _ in range(10):
    back, _ = member_post(member_sk, 9, [["h", channel]], "after the ban is lifted")
    if back == 200:
        break
    time.sleep(2)
ok(got["status"] == 204 and back == 200,
   "turned on again, the owner lifts the ban (HTTP %s), and the member posts again (HTTP %s)" % (got["status"], back))
sh("docker", "compose", "-p", "buzzlocal", "--env-file", os.path.join(L, "run/.env"), "-f", os.path.join(L, "run/compose.yml"), "restart")
time.sleep(5)
ok(advertised(ORIGIN) and relay_admin_env() == "BUZZ_ADMIN_HOST=" + D1 + ":8443" and probe(owner_sk)["status"] == 200,
   "after a restart of every container it's still on: advertised, and the owner's signature still gets in")
s, body, _ = call("/owner", {"owner": OWNER2})
time.sleep(8)
ok(s == 303 and advertised(ORIGIN) and owner_of(members()) == hexkey(OWNER2) and probe(owner_sk)["status"] == 403,
   "after an owner change it stays on, and the previous owner's signature is refused (HTTP 403)")
s, body, _ = call("/address", {"mode": "funnel", "confirm": D1})
ok(s == 303 and "BUZZ_ADMIN_HOST" not in settings("relay.env") and '"moderation": false' in settings("setup.json"),
   "choosing a Tailscale option turns it off")
s, body, _ = call("/address", {"mode": "domain", "domain": D1, "ack": "yes"})
ok(s == 303 and "BUZZ_ADMIN_HOST" not in settings("relay.env") and advertised(""), "and back on the domain, it stays off")
print()
print("passed: %d  failed: %d" % (passed, failed))
sys.exit(1 if failed else 0)
