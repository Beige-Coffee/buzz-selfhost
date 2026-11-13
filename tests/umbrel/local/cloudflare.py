"""Cloudflare's sign-in, kept only until the name is set up, and the file Cloudflare's page can save
instead, uploaded on the setup page: the cloudflared service's script from docker-compose.yml, run on this
machine with a stand-in for cloudflared (fake_cloudflared.py), driven through the setup page's own forms. No
Docker, no Cloudflare account.

  python3 tests/umbrel/local/cloudflare.py [<package dir>] [<an earlier package, to compare>]
"""
import base64, hashlib, html as htmllib, http.client, http.server, importlib.machinery, importlib.util, json, os
import secrets, shutil, signal, subprocess, sys, tempfile, threading, time
import signin_files

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.normpath(os.path.join(HERE, "../../../umbrel/buzz"))
BEFORE = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else ""
OWNER = "npub1464m3lr8zsjm79l073tcrptr8ekddatt30p8q4f25zcc7dq0zc7sc9a4yn"
PASSED = FAILED = 0


def nth(items, i):
    """items[i], or {} when it isn't there, so a missing step reports FAIL instead of stopping the test."""
    return items[i] if -len(items) <= i < len(items) else {}


def ok(condition, text):
    global PASSED, FAILED
    print(("PASS  " if condition else "FAIL  ") + text, flush=True)
    PASSED, FAILED = PASSED + bool(condition), FAILED + (not condition)


def wait_for(test, seconds):
    end = time.time() + seconds
    while time.time() < end:
        if test():
            return True
        time.sleep(0.3)
    return test()


def read(path):
    try:
        with open(path) as f:
            return f.read()
    except OSError:
        return ""


def lines(path):
    return [json.loads(line) for line in read(path).splitlines() if line.strip()]


# The script reads an upload with timeout(1), which busybox has in the service's image and macOS lacks: there, this
# stand-in, with the same exit status when time runs out
TIMEOUT = """#!%s
import subprocess, sys
try:
    sys.exit(subprocess.run(sys.argv[2:], timeout=float(sys.argv[1])).returncode)
except subprocess.TimeoutExpired:
    sys.exit(124)
""" % sys.executable
HEAD = shutil.which("head")


def compose_script(pkg, service):
    """A service's entrypoint script from docker-compose.yml, with compose's $$ back to $ (as security.py)."""
    block = open(os.path.join(pkg, "docker-compose.yml")).read().split("\n  " + service + ":\n", 1)[1]
    out = []
    for line in block.split("      - |\n", 1)[1].splitlines():
        if line and not line.startswith("        "):
            break
        out.append(line[8:])
    return "\n".join(out).replace("$$", "$")


class Box:
    """One install's folders: the tunnel's own (HOME), the one it shares with the page, and a fake Cloudflare."""

    def __init__(self, root, pkg):
        self.root, self.pkg = root, pkg
        self.home, self.control, self.cloud, self.bin = (os.path.join(root, n) for n in ("cloudflare", "cloudflare-control", "cloud", "bin"))
        for d in (self.home, self.control, self.cloud, self.bin):
            os.makedirs(d, exist_ok=True)
        shutil.copy(os.path.join(HERE, "fake_cloudflared.py"), os.path.join(self.bin, "cloudflared"))
        os.chmod(os.path.join(self.bin, "cloudflared"), 0o755)
        if not shutil.which("timeout"):
            self.tool("timeout", TIMEOUT)
        self.proc = None

    def tool(self, name, text):
        """A command the script finds before the system's, from its next start."""
        with open(os.path.join(self.bin, name), "w") as f:
            f.write(text)
        os.chmod(os.path.join(self.bin, name), 0o755)

    def script(self):
        text = compose_script(self.pkg, "cloudflared")
        assert "cf=/cloudflared\n" in text and "/settings/" in text
        return text.replace("cf=/cloudflared\n", "cf=cloudflared\n").replace("/settings/", self.control + "/")

    def start(self):
        env = dict(os.environ, HOME=self.home, FAKE_CF_CLOUD=self.cloud, PATH=self.bin + ":" + os.environ["PATH"])
        self.log = open(self.log_path(), "a")
        self.proc = subprocess.Popen(["sh", "-c", self.script()], env=env, start_new_session=True,
                                     stdout=self.log, stderr=subprocess.STDOUT)

    def stop(self):
        if self.proc and self.proc.poll() is None:
            os.killpg(self.proc.pid, signal.SIGTERM)
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                os.killpg(self.proc.pid, signal.SIGKILL)
        # what the script left running, as Docker's stop would end it
        subprocess.run(["pkill", "-f", self.bin + "/cloudflared"], capture_output=True)
        self.proc = None

    # what the test reads
    def log_path(self):
        """What the script printed: its container's log."""
        return os.path.join(self.root, "entrypoint.log")

    def state(self):
        return read(os.path.join(self.control, "cloudflare-state")).strip()

    def link(self):
        return "dash.cloudflare.com/argotunnel?" in read(os.path.join(self.control, "cloudflare-login.log"))

    def cert(self):
        return os.path.exists(os.path.join(self.home, ".cloudflared", "cert.pem"))

    def signin_folder(self):
        return os.path.exists(os.path.join(self.home, ".cloudflared"))

    def file(self, name):
        return read(os.path.join(self.home, name)).strip()

    def calls(self, verb=None):
        return [c for c in lines(os.path.join(self.cloud, "calls.log")) if verb is None or c["args"][:2] == ["tunnel", verb]
                or (verb == "route" and c["args"][:3] == ["tunnel", "route", "dns"])]

    def runs(self):
        return [r for r in lines(os.path.join(self.cloud, "runs.log")) if not r.get("stopped")]

    def stops(self):
        return [r for r in lines(os.path.join(self.cloud, "runs.log")) if r.get("stopped")]

    def tunnels(self):
        return json.loads(read(os.path.join(self.cloud, "tunnels.json")) or "{}")

    def dns(self):
        return json.loads(read(os.path.join(self.cloud, "dns.json")) or "{}")

    def sign_in(self, account, zone, download=False):
        """The owner opens the page's link and picks an account and a domain. With download, Cloudflare's page
        then saves the sign-in in the browser instead of passing it to the login (cloudflare/cloudflared#1252)."""
        with open(os.path.join(self.cloud, "consent"), "w") as f:
            f.write(account + " " + zone + (" download" if download else ""))

    def downloaded(self):
        """The cert.pem Cloudflare's page saved on the owner's computer."""
        return os.path.join(self.cloud, "Downloads", "cert.pem")


def page_file(pkg):
    """The page beside a package: a template inside packages before 2026-11-11, its own folder since."""
    old = os.path.join(pkg, "setup.py.template")
    return old if os.path.exists(old) else os.path.normpath(os.path.join(pkg, "..", "setup-page", "setup.py"))


def page_module(pkg, d, control):
    loader = importlib.machinery.SourceFileLoader("page", page_file(pkg))
    m = importlib.util.module_from_spec(importlib.util.spec_from_loader("page", loader))
    loader.exec_module(m)
    os.makedirs(d + "/settings", exist_ok=True)
    os.makedirs(d + "/ts", exist_ok=True)
    m.SETTINGS_DIR, m.TAILSCALE_DIR, m.CLOUDFLARE_DIR = d + "/settings", d + "/ts", control
    m.RELAY_ENV, m.SETUP_JSON = d + "/settings/relay.env", d + "/settings/setup.json"
    m.TAILSCALE_ON, m.TAILSCALE_STATUS, m.TAILSCALE_SERVE = d + "/ts/tailscale-enabled", d + "/ts/tailscale-status.json", d + "/ts/tailscale-serve.txt"
    m.CLOUDFLARE_ON, m.CLOUDFLARE_STATE, m.CLOUDFLARE_LOGIN, m.CLOUDFLARE_SETUP, m.CLOUDFLARE_RESET = (
        control + "/" + n for n in ("cloudflare-enabled", "cloudflare-state", "cloudflare-login.log", "cloudflare-setup.log", "cloudflare-reset"))
    m.CLOUDFLARE_UPLOAD = control + "/cloudflare-upload.pem"
    m.PASSWORD = "test-password"
    # no relay or internet here: the checks see nothing reachable yet
    m.request = lambda *a, **k: (None, b"unreachable")
    m.resolves = lambda name: []
    return m


root = tempfile.mkdtemp(prefix="buzz-cf-signin-")

if BEFORE:
    print("== Before the change: the package as submitted")
    old = Box(os.path.join(root, "before"), BEFORE)
    with open(os.path.join(old.control, "cloudflare-enabled"), "w") as f:
        f.write("buzz.yourteam.com\n")
    old.start()
    try:
        wait_for(lambda: old.state() == "signin" and old.link(), 15)
        old.sign_in("acct-a", "yourteam.com")
        ok(wait_for(lambda: len(old.runs()) == 1, 20) and old.cert() and nth(old.runs(), 0).get("cert"),
           "as submitted, cert.pem stays in the tunnel's folder while the tunnel runs (it would go into backups)")
    finally:
        old.stop()

print("== The tunnel's script, driven by the setup page's forms")
box = Box(os.path.join(root, "after"), PKG)
m = page_module(PKG, os.path.join(root, "after"), box.control)
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), m.Handler)
PORT = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()
SESSION = m.new_session()


def call(method, path, form=None):
    conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=10)
    body = "&".join(k + "=" + v for k, v in (form or {}).items())
    conn.request(method, path, body=body if method == "POST" else None,
                 headers={"Content-Type": "application/x-www-form-urlencoded", "Sec-Fetch-Site": "same-origin",
                          "Cookie": m.COOKIE + "=" + SESSION})
    response = conn.getresponse()
    text = response.read().decode(errors="replace")
    conn.close()
    return response.status, text


H1, H2 = "buzz.yourteam.com", "chat.yourteam.com"
try:
    status, _ = call("POST", "/save", {"owner": OWNER, "mode": "domain", "domain": H1, "ack": "yes"})
    box.start()
    ok(status == 303 and wait_for(lambda: box.state() == "signin" and box.link(), 15) and not box.cert(),
       "a new community on a domain waits for Cloudflare's sign-in, with its link on the page")
    _, html = call("GET", "/")
    ok("Sign in to Cloudflare" in html and "keeps your sign-in only until the name is set up" in html,
       "the page shows the link, and says the sign-in is kept only until the name is set up")

    print("== Sign-in, tunnel, name, then the sign-in is deleted")
    box.sign_in("acct-a", "yourteam.com")
    ok(wait_for(lambda: len(box.runs()) == 1, 20), "after the sign-in the tunnel is created, routed and running")
    name = box.file("tunnel-name")
    first = box.tunnels().get("acct-a", {}).get(name, {})
    ok(box.dns().get(H1) == first.get("id") and box.file("routed") == H1 and box.file("tunnel.token") != "",
       "Cloudflare has the tunnel and %s pointing at it; the token and the routed name are saved" % H1)
    ok(all(c["cert"] for c in box.calls("create") + box.calls("token") + box.calls("route")) and
       len(box.calls("create")) == len(box.calls("token")) == len(box.calls("route")) == 1,
       "create, token and route dns each ran once, with the sign-in")
    ok(not box.signin_folder(), "cert.pem is deleted once the name is routed, with the credentials JSON tunnel create wrote beside it")
    ok(nth(box.runs(), 0).get("cert") is False and nth(box.runs(), 0).get("credentials_json") is False and box.state() == "running",
       "the tunnel runs from its token alone: neither file existed when it started")
    _, html = call("GET", "/")
    ok("The tunnel is set up." in html and "Signed in, and" not in html, "the page no longer says Signed in once it's running")

    print("== A restart")
    before_calls = len(box.calls())
    box.stop()
    box.start()
    started = time.time()
    ok(wait_for(lambda: len(box.runs()) == 2, 10), "after a restart the tunnel runs again (in %.1f s)" % (time.time() - started))
    ok(len(box.calls()) == before_calls + 1 and nth(box.calls(), -1).get("args", [])[:2] == ["tunnel", "run"] and box.state() == "running",
       "with no sign-in and no other Cloudflare call: only tunnel run, with the same token")
    ok(nth(box.runs(), 1).get("tunnel") == first["id"] and not box.signin_folder(), "the same tunnel, and still no cert.pem")

    print("== Changing the address asks for a new sign-in")
    status, html = call("GET", "/")
    ok("moving to another address asks you to sign in to Cloudflare again" in html,
       "the address setting says a new address asks for a new Cloudflare sign-in")
    logins = len(box.calls("login"))
    status, _ = call("POST", "/address", {"mode": "domain", "domain": H2, "confirm": H1})
    ok(status == 303 and wait_for(lambda: box.state() == "signin" and len(box.calls("login")) == logins + 1, 15),
       "after the change to %s it stops the tunnel and starts a new Cloudflare sign-in" % H2)
    ok(len(box.stops()) >= 2 and not box.cert(), "the old run stopped, and there's no sign-in on disk while it waits")
    box.sign_in("acct-a", "yourteam.com")
    ok(wait_for(lambda: len(box.runs()) == 3, 20) and nth(box.runs(), 2).get("tunnel") == first["id"],
       "after the new sign-in the same tunnel runs again")
    ok(box.dns().get(H2) == first["id"] and box.file("routed") == H2 and len(box.calls("create")) == 1,
       "%s now points at the same tunnel, with no new tunnel made" % H2)
    ok(not box.signin_folder() and nth(box.runs(), 2).get("cert") is False, "and the new sign-in is deleted again before it runs")

    print("== Switching to Tailscale and back")
    call("POST", "/address", {"mode": "funnel", "confirm": H2})
    ok(wait_for(lambda: box.state() == "" and len(box.stops()) >= 3, 15), "the free Tailscale address turns the tunnel off")
    logins = len(box.calls("login"))
    status, _ = call("POST", "/address", {"mode": "domain", "domain": H2, "ack": "yes"})
    ok(status == 303 and wait_for(lambda: len(box.runs()) == 4, 15) and len(box.calls("login")) == logins,
       "back on the same domain address, it runs again with no new sign-in")

    print("== Leaving the domain before its name is set up")
    taken = "taken.yourteam.com"
    dns = box.dns()
    dns[taken] = "another-tunnel"
    with open(os.path.join(box.cloud, "dns.json"), "w") as f:
        json.dump(dns, f)
    call("POST", "/address", {"mode": "domain", "domain": taken, "confirm": H2})
    wait_for(lambda: box.state() == "signin", 15)
    box.sign_in("acct-a", "yourteam.com")
    ok(wait_for(lambda: box.state() == "taken", 20) and box.cert(), "a name that already has a record: taken, with the sign-in still there")
    call("POST", "/address", {"mode": "funnel", "confirm": taken})
    ok(wait_for(lambda: box.state() == "" and not box.signin_folder(), 35), "switching away from the domain deletes the sign-in too")
    call("POST", "/address", {"mode": "domain", "domain": H2, "ack": "yes"})
    ok(wait_for(lambda: len(box.runs()) == 5, 15), "and %s still runs without one" % H2)

    print("== An error, then Sign in to Cloudflare again")
    H3 = "fail.yourteam.com"
    open(os.path.join(box.cloud, "fail-route"), "w").close()
    call("POST", "/address", {"mode": "domain", "domain": H3, "confirm": H2})
    wait_for(lambda: box.state() == "signin", 15)
    box.sign_in("acct-a", "yourteam.com")
    ok(wait_for(lambda: box.state() == "error", 20) and box.cert(), "Cloudflare refuses the route: error, with the sign-in still there")
    _, html = call("GET", "/")
    ok("Cloudflare refused a step" in html and "Sign in to Cloudflare again" in html, "the page offers Sign in to Cloudflare again")
    old_name = box.file("tunnel-name")
    status, _ = call("POST", "/cloudflare-reset")
    ok(status == 303 and os.path.exists(os.path.join(box.control, "cloudflare-reset")), "the page's button asks for the reset")
    ok(wait_for(lambda: box.state() == "signin" and box.file("tunnel-name") not in ("", old_name), 40),
       "the reset starts a new sign-in, for a new tunnel name")
    ok(box.tunnels()["acct-a"][old_name]["deleted"] and not box.cert() and box.file("tunnel.token") == "" and box.file("routed") == "",
       "the old tunnel was deleted in Cloudflare with the sign-in, and its token, name and route are gone")
    os.remove(os.path.join(box.cloud, "fail-route"))
    # Cloudflare not listing the brand-new tunnel yet must not make the script create another one
    open(os.path.join(box.cloud, "not-listed-yet"), "w").close()
    made = len(box.tunnels().get("acct-a", {}))
    box.sign_in("acct-a", "yourteam.com")
    ok(wait_for(lambda: box.state() == "error", 20) and len(box.tunnels()["acct-a"]) == made + 1,
       "a new tunnel Cloudflare doesn't list yet: an error to retry, not another tunnel")
    fresh = box.file("tunnel-name")
    os.remove(os.path.join(box.cloud, "not-listed-yet"))
    ok(wait_for(lambda: box.state() == "running" and len(box.runs()) == 6, 40) and box.file("tunnel-name") == fresh
       and len(box.tunnels()["acct-a"]) == made + 1, "the retry routes that same tunnel, which runs at %s" % H3)
    ok(box.dns().get(H3) == nth(box.runs(), 5).get("tunnel") and not box.signin_folder(), "the name points at it, and the sign-in is deleted")

    print("== The wrong domain chosen at sign-in, then Sign in to Cloudflare again")
    H4 = "buzz.otherteam.org"
    call("POST", "/address", {"mode": "domain", "domain": H4, "confirm": H3})
    wait_for(lambda: box.state() == "signin", 15)
    box.sign_in("acct-a", "yourteam.com")
    ok(wait_for(lambda: box.state() == "wrong-domain", 20) and box.cert(), "a domain chosen wrong at sign-in: wrong-domain, with the sign-in there")
    wrong_name = box.file("tunnel-name")
    call("POST", "/cloudflare-reset")
    ok(wait_for(lambda: box.state() == "signin" and box.file("tunnel-name") not in ("", wrong_name), 20)
       and box.tunnels()["acct-a"][wrong_name]["deleted"], "the reset deletes that tunnel and starts a new sign-in")
    box.sign_in("acct-a", "otherteam.org")
    ok(wait_for(lambda: len(box.runs()) == 7, 20) and box.dns().get(H4) == nth(box.runs(), 6).get("tunnel") and not box.signin_folder(),
       "choosing the right domain, %s runs, and the sign-in is deleted" % H4)

    print("== A new address in another Cloudflare account")
    H5 = "buzz.thirdteam.net"
    a_tunnel = nth(box.runs(), 6).get("tunnel")
    call("POST", "/address", {"mode": "domain", "domain": H5, "confirm": H4})
    wait_for(lambda: box.state() == "signin", 15)
    box.sign_in("acct-b", "thirdteam.net")
    ok(wait_for(lambda: len(box.runs()) == 8, 25) and nth(box.runs(), 7).get("account") == "acct-b",
       "signed in to another account, it makes a new tunnel there and runs it, with no error to clear")
    ok(box.dns().get(H5) == nth(box.runs(), 7).get("tunnel") and not box.signin_folder() and
       any(t["id"] == a_tunnel and not t["deleted"] for t in box.tunnels()["acct-a"].values()),
       "%s points at it; the tunnel in the first account stays there, as an uninstall leaves it" % H5)

    print("== A sign-in left behind, and a restore onto another Umbrel")
    box.stop()
    os.makedirs(os.path.join(box.home, ".cloudflared"), exist_ok=True)
    with open(os.path.join(box.home, ".cloudflared", "cert.pem"), "w") as f:
        f.write("left by a start that stopped between the route and the delete\n")
    box.start()
    ok(wait_for(lambda: len(box.runs()) == 9, 10) and nth(box.runs(), 8).get("cert") is False and not box.signin_folder(),
       "a cert.pem left by an interrupted start is deleted before the tunnel runs")
    box.stop()
    copy = Box(os.path.join(root, "restored"), PKG)
    for src, dst in ((box.home, copy.home), (box.control, copy.control), (box.cloud, copy.cloud)):
        shutil.rmtree(dst)
        shutil.copytree(src, dst)
    calls = len(copy.calls())
    copy.start()
    ok(wait_for(lambda: len(copy.runs()) == 10, 10) and nth(copy.runs(), 9).get("tunnel") == nth(box.runs(), 7).get("tunnel")
       and len(copy.calls()) == calls + 1 and not copy.signin_folder(),
       "the app's folders copied to another place, as a restore brings them, run the same tunnel with no sign-in")
    copy.stop()
finally:
    box.stop()
    server.shutdown()


def page_call(port, module, session, method, path, form=None, file=None):
    """A page's forms as the owner's browser posts them: (status, text). With file, the upload's form."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    headers = {"Sec-Fetch-Site": "same-origin", "Cookie": module.COOKIE + "=" + session}
    body = None
    if file is not None:
        headers["Content-Type"], body = signin_files.multipart([("cert", "cert.pem", file, b"")])
    elif method == "POST":
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        body = "&".join(k + "=" + v for k, v in (form or {}).items())
    conn.request(method, path, body=body, headers=headers)
    response = conn.getresponse()
    text = response.read().decode(errors="replace")
    conn.close()
    return response.status, text


def fingerprint(data):
    """As the stand-in notes which sign-in a call ran with."""
    return hashlib.sha256(data).hexdigest()[:16]


def api_token(data):
    """The API token in a sign-in file, to look for it where it mustn't be."""
    return json.loads(base64.b64decode(b"".join(data.split(b"\n")[1:-2])))["apiToken"]


def saved_file(account, zone):
    """A sign-in for this account and domain, as Cloudflare's page saves one, with a new token."""
    return signin_files.saved(account=account, zone=zone, token="local-test-" + secrets.token_hex(16))


print("== Cloudflare's page saves the sign-in as a file instead, and the owner uploads it (cloudflare/cloudflared#1252)")
ub = Box(os.path.join(root, "upload"), PKG)
mu = page_module(PKG, os.path.join(root, "upload"), ub.control)
userver = http.server.ThreadingHTTPServer(("127.0.0.1", 0), mu.Handler)
threading.Thread(target=userver.serve_forever, daemon=True).start()
USESSION = mu.new_session()
UPLOAD = os.path.join(ub.control, "cloudflare-upload.pem")
seen = []  # every page and status the owner was shown


def u(method, path, form=None, file=None):
    status, text = page_call(userver.server_address[1], mu, USESSION, method, path, form, file)
    seen.append(text)
    return status, text


def waiting():
    """The upload in the folder shared with the page, or None."""
    try:
        with open(UPLOAD, "rb") as f:
            return f.read()
    except OSError:
        return None


def signin_waits():
    return ub.state() == "signin" and ub.link()


U1, U2, U3, U4 = "buzz.uploadteam.com", "chat.uploadteam.com", "buzz.otherupload.org", "buzz.thirdupload.net"
try:
    status, _ = u("POST", "/save", {"owner": OWNER, "mode": "domain", "domain": U1, "ack": "yes"})
    ub.start()
    ok(status == 303 and wait_for(signin_waits, 15), "a new community on a domain waits for Cloudflare's sign-in")
    _, page = u("GET", "/")
    ok('action="cloudflare-upload"' in page and "Sign in to Cloudflare</a>" in page and "saved a file named cert.pem" in page,
       "the page offers the upload beside the sign-in link")
    ub.sign_in("acct-u", "uploadteam.com", download=True)
    ok(wait_for(lambda: os.path.exists(ub.downloaded()), 10) and not wait_for(ub.cert, 4) and ub.state() == "signin",
       "Cloudflare's page saves the file in the browser instead: the login keeps waiting, with no cert.pem")
    logins = len(ub.calls("login"))
    open(os.path.join(ub.cloud, "give-up"), "w").close()
    ok(wait_for(lambda: len(ub.calls("login")) == logins + 1 and signin_waits(), 15)
       and 'action="cloudflare-upload"' in u("GET", "/")[1],
       "the link runs out: the login stops, a new link takes its place, and the upload is still offered")
    ub.stop()
    file = open(ub.downloaded(), "rb").read()
    status, page = u("POST", "/cloudflare-upload", file=signin_files.KEY_BLOCK + file)
    ok(status == 400 and htmllib.escape(mu.NOT_A_CERT) in page and waiting() is None,
       "a file the page doesn't take (an older one with a key block) gets its sentence, and nothing waits")
    status, _ = u("POST", "/cloudflare-upload", file=file)
    ok(status == 303, "with the service stopped, the page takes the file saved during the old link")
    mode = oct(os.stat(UPLOAD).st_mode & 0o777) if waiting() else ""
    ok(waiting() == file and mode == "0o600",
       "it waits in the shared folder as cloudflare-upload.pem, mode 600, byte for byte the file Cloudflare saved")
    _, page = u("GET", "/")
    _, status_json = u("GET", "/status.json")
    ok("Signed in with your file" in page and "Sign in to Cloudflare</a>" not in page and 'action="cloudflare-upload"' not in page
       and "My Profile, API Tokens" in page and json.loads(status_json)["phase"].endswith(":signin-upload"),
       "the page says Signed in with your file, with no link or upload form, and asks to delete the token later")
    logins = len(ub.calls("login"))
    ub.start()
    ok(wait_for(lambda: len(ub.runs()) == 1, 20) and len(ub.calls("login")) == logins and
       [c.get("signin") for c in ub.calls("create") + ub.calls("token") + ub.calls("route")] == [fingerprint(file)] * 3,
       "started, the service takes it before any new sign-in: create, token and route run once each, on the file as uploaded")
    ok(waiting() is None and not ub.signin_folder() and nth(ub.runs(), 0).get("cert") is False and ub.state() == "running",
       "the upload is gone from the shared folder, and cert.pem once the name is routed: the tunnel runs on its token")
    shared = "".join(read(os.path.join(ub.control, n)) for n in os.listdir(ub.control))
    token = api_token(file)
    ok(all(token not in text for text in seen) and token not in shared and token not in read(ub.log_path()),
       "the file's API token is in no page or status the owner was shown, the shared folder, or the service's output")
    status, _ = u("POST", "/cloudflare-upload", file=file)
    ok(status == 303 and waiting() is None, "once the tunnel runs, an upload is ignored: nothing is written")

    print("== A sign-in that arrives both ways")
    u("POST", "/address", {"mode": "domain", "domain": U2, "confirm": U1})
    wait_for(signin_waits, 15)
    ub.sign_in("acct-u", "uploadteam.com")
    u("POST", "/cloudflare-upload", file=saved_file("acct-u", "uploadteam.com"))
    ok(wait_for(lambda: len(ub.runs()) == 2, 20) and ub.dns().get(U2) == nth(ub.runs(), 1).get("tunnel")
       and [c["args"][4] for c in ub.calls("route")].count(U2) == 1 and waiting() is None and not ub.signin_folder(),
       "the login's and the page's at once, for a new address: the name is routed once, it runs, and neither copy stays")
    if os.path.exists(os.path.join(ub.cloud, "consent")):  # the upload came first: no later login may read it
        os.remove(os.path.join(ub.cloud, "consent"))

    print("== A file for the wrong domain, then Sign in to Cloudflare again")
    u("POST", "/address", {"mode": "domain", "domain": U3, "confirm": U2})
    wait_for(signin_waits, 15)
    status, _ = u("POST", "/cloudflare-upload", file=saved_file("acct-u", "uploadteam.com"))
    ok(status == 303 and wait_for(lambda: ub.state() == "wrong-domain", 20) and ub.cert(),
       "a file for another domain: wrong-domain, with the sign-in kept for the reset")
    wrong = ub.file("tunnel-name")
    u("POST", "/cloudflare-reset")
    ok(wait_for(lambda: signin_waits() and ub.file("tunnel-name") not in ("", wrong), 25)
       and ub.tunnels()["acct-u"][wrong]["deleted"] and waiting() is None and not ub.cert(),
       "Sign in to Cloudflare again deletes that tunnel and starts a new sign-in, with no upload left")
    u("POST", "/cloudflare-upload", file=saved_file("acct-u", "otherupload.org"))
    ok(wait_for(lambda: len(ub.runs()) == 3, 25) and ub.dns().get(U3) == nth(ub.runs(), 2).get("tunnel") and not ub.signin_folder(),
       "the right domain's file then: %s runs" % U3)

    print("== A file for another account, at a new address")
    u("POST", "/address", {"mode": "domain", "domain": U4, "confirm": U3})
    wait_for(signin_waits, 15)
    u("POST", "/cloudflare-upload", file=saved_file("acct-w", "thirdupload.net"))
    ok(wait_for(lambda: len(ub.runs()) == 4, 25) and nth(ub.runs(), 3).get("account") == "acct-w"
       and ub.dns().get(U4) == nth(ub.runs(), 3).get("tunnel") and not ub.signin_folder(),
       "a new tunnel in that account runs %s, as after a sign-in through the link: the copied file is new" % U4)

    print("== An upload not yet taken, then the address changes")
    U5, U6 = "chat.thirdupload.net", "talk.thirdupload.net"
    u("POST", "/address", {"mode": "domain", "domain": U5, "confirm": U4})
    wait_for(signin_waits, 15)
    ub.stop()
    u("POST", "/cloudflare-upload", file=saved_file("acct-w", "thirdupload.net"))
    had = waiting() is not None
    u("POST", "/address", {"mode": "domain", "domain": U6, "confirm": U5})
    gone = waiting() is None
    logins = len(ub.calls("login"))
    ub.start()
    ok(had and gone and wait_for(lambda: len(ub.calls("login")) == logins + 1 and signin_waits(), 15) and not ub.cert(),
       "a new address deletes an upload not yet taken at once, and the service starts a sign-in for it without the file")
    ub.stop()
    u("POST", "/cloudflare-upload", file=saved_file("acct-w", "thirdupload.net"))
    had = waiting() is not None
    u("POST", "/address", {"mode": "funnel", "confirm": U6})
    gone = waiting() is None
    ub.start()
    ok(had and gone and wait_for(lambda: ub.state() == "" and not ub.signin_folder(), 15) and waiting() is None,
       "so does a Tailscale option, and then the tunnel's folders hold no sign-in")

    print("== What a compromised page could leave in the shared folder")
    U7 = "buzz.fourthupload.net"
    u("POST", "/address", {"mode": "domain", "domain": U7, "ack": "yes"})
    ok(wait_for(signin_waits, 15), "back on a domain, the service waits for a sign-in")
    logins, token_before = len(ub.calls("login")), ub.file("tunnel.token")
    MARK = "zq-planted-4410"
    end = b"-----END ARGO TUNNEL TOKEN-----\n"
    planted = [
        ("a link to the tunnel's own token", lambda: os.symlink(os.path.join(ub.home, "tunnel.token"), UPLOAD)),
        ("a pipe", lambda: os.mkfifo(UPLOAD)),
        ("a folder", lambda: os.mkdir(UPLOAD)),
        ("20 KB shaped like a sign-in", lambda: open(UPLOAD, "wb").write(
            b"-----BEGIN ARGO TUNNEL TOKEN-----\n" + (b"A" * 64 + b"\n") * 320 + end)),
        ("plain text", lambda: open(UPLOAD, "w").write(MARK + "\n")),
        ("a sign-in with no account", lambda: open(UPLOAD, "wb").write(
            signin_files.pem({"zoneID": "fourthupload.net", "apiToken": MARK}))),
        ("an older file with a key block", lambda: open(UPLOAD, "wb").write(
            signin_files.KEY_BLOCK + signin_files.written(zone="fourthupload.net"))),
    ]
    dropped = []
    for label, plant in planted:
        count = read(ub.log_path()).count("Dropped an uploaded file")
        plant()
        dropped.append(wait_for(lambda: not os.path.lexists(UPLOAD) and read(ub.log_path()).count("Dropped an uploaded file") == count + 1, 10))
    missed = [label for (label, _), done in zip(planted, dropped) if not done]
    ok(not missed and not ub.cert() and len(ub.calls("login")) == logins and ub.state() == "signin"
       and ub.file("tunnel.token") == token_before,
       "%d kinds of file the page never writes are dropped within seconds: no cert.pem, the token untouched, the same "
       "sign-in still waiting%s" % (len(planted), (": not " + ", ".join(missed)) if missed else ""))
    u("POST", "/address", {"mode": "funnel", "confirm": U7})
    ok(wait_for(lambda: ub.state() == "", 15), "and the service answers the next change: nothing held it up")
    output = read(ub.log_path())
    ok(output.count("Dropped an uploaded file that isn't a Cloudflare sign-in.") == len(planted) and MARK not in output
       and token_before not in output, "its output says it dropped each one, with nothing from them")

    print("== A pipe in the upload's place after the service's test")
    # Whatever can write the shared folder could swap a pipe in between take()'s test of the file and its read, and a
    # read of a pipe waits for a writer. Here a head that never returns when it reads the upload stands in for that read.
    U8 = "chat.fourthupload.net"
    ub.stop()
    ub.tool("head", '#!/bin/sh\nfor a; do :; done\ncase "$a" in */cloudflare-upload.pem) exec sleep 60 ;; esac\nexec %s "$@"\n' % HEAD)
    u("POST", "/address", {"mode": "domain", "domain": U8, "ack": "yes"})
    ub.start()
    ok(wait_for(signin_waits, 15), "on a new address, the service waits for a sign-in again")
    logins, count = len(ub.calls("login")), read(ub.log_path()).count("Dropped an uploaded file")
    with open(UPLOAD, "wb") as f:
        f.write(saved_file("acct-w", "fourthupload.net"))
    planted_at = time.time()
    dropped = wait_for(lambda: not os.path.lexists(UPLOAD) and read(ub.log_path()).count("Dropped an uploaded file") == count + 1, 15)
    took = time.time() - planted_at
    ok(dropped and not ub.cert() and ub.state() == "signin" and len(ub.calls("login")) == logins,
       "a read of the upload that never returns ends after its time limit, and the file is dropped (in %.0f s): no "
       "cert.pem, the same sign-in still waiting" % took)
    u("POST", "/address", {"mode": "funnel", "confirm": U8})
    ok(wait_for(lambda: ub.state() == "", 15), "and the service answers the next change")
finally:
    ub.stop()
    userver.shutdown()

print("\npassed: %d  failed: %d" % (PASSED, FAILED))
sys.exit(1 if FAILED else 0)
