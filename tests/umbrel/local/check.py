"""Checks the setup page on the local run (up.sh), for real: sign-in, a request from
another container on the shared network, setup, persistence across restarts, owner and address
changes, switching back, and the Tailscale modes up to the sign-in link. Prints PASS/FAIL lines.
The app password is read from run/.env and never printed."""
import http.cookiejar, json, os, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

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
    return sh("docker", "exec", "buzz_web_1", "cat", "/settings/" + name)


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
                  headers={"Sec-Fetch-Site": "same-origin", "Origin": "http://umbrel.local:3024"})
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
s, body, _ = call("/address", {"mode": "domain", "domain": D2, "confirm": D1})
ok(s == 303, "typing the current address confirms the change")
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
print()
print("passed: %d  failed: %d" % (passed, failed))
sys.exit(1 if failed else 0)
