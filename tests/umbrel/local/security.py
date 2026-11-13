"""The package's own defenses, checked on this machine with no Docker: the setup page's checks and limits,
an uploaded Cloudflare sign-in, the relay's settings reader, the gateway's address, and Tailscale's switching.
Mocked: no relay, Cloudflare or Tailscale behind it; the scripts run from docker-compose.yml with stand-ins
for caddy and tailscale.

  python3 tests/umbrel/local/security.py
"""
import base64, html, html.parser, http.client, http.server, importlib.machinery, importlib.util, io, json, os, shutil, signal
import re, socket, subprocess, sys, tempfile, threading, time
import signin_files as sf

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.normpath(os.path.join(HERE, "../../../umbrel/buzz"))
PAGE = os.path.normpath(os.path.join(HERE, "../../../umbrel/setup-page/setup.py"))
OWNER = "npub1464m3lr8zsjm79l073tcrptr8ekddatt30p8q4f25zcc7dq0zc7sc9a4yn"
PASSED = FAILED = 0


def ok(condition, text):
    global PASSED, FAILED
    print(("PASS  " if condition else "FAIL  ") + text, flush=True)
    PASSED, FAILED = PASSED + bool(condition), FAILED + (not condition)


def page():
    loader = importlib.machinery.SourceFileLoader("page", PAGE)
    m = importlib.util.module_from_spec(importlib.util.spec_from_loader("page", loader))
    loader.exec_module(m)
    d = tempfile.mkdtemp(prefix="buzz-security-")
    m.SETTINGS_DIR = m.TAILSCALE_DIR = m.CLOUDFLARE_DIR = d
    m.RELAY_ENV, m.SETUP_JSON = d + "/relay.env", d + "/setup.json"
    m.TAILSCALE_ON, m.TAILSCALE_STATUS, m.TAILSCALE_SERVE = d + "/tailscale-enabled", d + "/tailscale-status.json", d + "/tailscale-serve.txt"
    m.CLOUDFLARE_ON, m.CLOUDFLARE_STATE, m.CLOUDFLARE_LOGIN, m.CLOUDFLARE_SETUP, m.CLOUDFLARE_RESET = (
        d + "/" + n for n in ("cloudflare-enabled", "cloudflare-state", "cloudflare-login.log", "cloudflare-setup.log", "cloudflare-reset"))
    m.CLOUDFLARE_UPLOAD = d + "/cloudflare-upload.pem"
    # no relay or internet here: the page's own checks see nothing reachable
    m.request = lambda *a, **k: (None, b"unreachable")
    m.resolves = lambda name: []
    return m, d


def compose_script(service):
    """A service's entrypoint script from docker-compose.yml, with compose's $$ back to $."""
    block = open(os.path.join(PKG, "docker-compose.yml")).read().split("\n  " + service + ":\n", 1)[1]
    lines = []
    for line in block.split("      - |\n", 1)[1].splitlines():
        if line and not line.startswith("        "):
            break
        lines.append(line[8:])
    return "\n".join(lines).replace("$$", "$")


def shell_function(script, name):
    """One function from a script, from its first line to the line that closes it."""
    start = script.index("\n" + name + "() ") + 1
    opener = script[start:script.index("\n", start)].rstrip()[-1]
    return script[start:script.index("\n" + {"(": ")", "{": "}"}[opener] + "\n", start) + 3]


def write(path, text):
    with open(path, "w") as f:
        f.write(text)


def wait_for(test, seconds):
    end = time.time() + seconds
    while time.time() < end:
        if test():
            return True
        time.sleep(0.3)
    return test()


def stub(directory, name, body):
    os.makedirs(directory, exist_ok=True)
    write(os.path.join(directory, name), "#!/bin/sh\n" + body)
    os.chmod(os.path.join(directory, name), 0o755)


m, d = page()
KEY = m.owner_hex(OWNER)

print("== What the page takes from Tailscale and from its own files")
crafted = ["x$(touch /tmp/p).ts.net", "a.ts.net\nBUZZ_X=1", "evil.com", "a'b.ts.net", "-a.ts.net", "ts.net", "a..ts.net",
           "a" * 64 + ".ts.net", "x');alert(1);('.ts.net"]
ok(all(m.tailscale_name(name) == "" for name in crafted), "crafted Tailscale machine names are refused (%d kinds)" % len(crafted))
ok(m.tailscale_name("buzz.tail1234.ts.net.") == "buzz.tail1234.ts.net", "a real Tailscale name is accepted")
write(m.TAILSCALE_STATUS, json.dumps({"BackendState": "Running", "AuthURL": "javascript:alert(1)",
                                      "Self": {"DNSName": "x$(id).ts.net.", "ID": "n1"}}))
state = m.tailscale_state()
ok(state["name"] == "" and state["auth_url"] == "", "a crafted name and sign-in link in Tailscale's status are dropped")
write(m.TAILSCALE_STATUS, json.dumps({"BackendState": "NeedsLogin", "AuthURL": "https://login.tailscale.com/a/abc123"}))
ok(m.tailscale_state()["auth_url"] == "https://login.tailscale.com/a/abc123", "Tailscale's own sign-in link is kept")
write(m.TAILSCALE_STATUS, "[1, 2]")
ok(m.tailscale_state()["backend"] == "", "a status that isn't an object reads as empty, without an error")

m.save(OWNER, KEY, "funnel", "")
write(m.TAILSCALE_STATUS, json.dumps({"BackendState": "Running", "Self": {"DNSName": "x$(touch /tmp/p).ts.net."}}))
m.adopt_tailscale_name()
ok(not os.path.exists(m.RELAY_ENV) and m.load_setup()["domain"] == "", "a crafted Tailscale name never reaches the relay's settings")
write(m.TAILSCALE_STATUS, json.dumps({"BackendState": "Running", "Self": {"DNSName": "buzz.tail1234.ts.net."}}))
m.adopt_tailscale_name()
ok(m.relay_domain() == "buzz.tail1234.ts.net", "a real Tailscale name becomes the address")

refused = 0
for key, domain in (("0" * 64, "a.com\nBUZZ_REQUIRE_RELAY_MEMBERSHIP=false"), ("0" * 64, "a.com$(id)"), ("zz", "a.com")):
    try:
        m.write_relay_env(key, domain, True)
    except ValueError:
        refused += 1
ok(refused == 3, "the relay's settings take only a hex key and a host name")
write(m.SETUP_JSON, json.dumps({"owner": OWNER, "owner_hex": "x$(id)", "mode": "domain", "domain": "a.com"}))
ok(m.load_setup() is None, "settings with a tampered owner key are ignored")

button = m.copy_button("a'); alert(1); ('")
ok("this.dataset.copy" in button and "alert" not in button.split("onclick=", 1)[1], "copied text goes in a data attribute, never into script")
setup_html = m.setup_page()
ok("No Buzz identity yet?" in setup_html and "never sees your private key" in setup_html and "Create a new identity" not in setup_html,
   "the owner step explains keys without Builderlab, and no longer says Create a new identity")

print("== Sessions")
m.PASSWORD = ""
ok(not m.session_ok(m.new_session()), "with no password set, no session is valid, even one signed with the fallback key")
m.PASSWORD = "test-password"
ok(m.session_ok(m.new_session()), "a session from a sign-in is valid")
ok(not m.session_ok("9999999999.é"), "a cookie that isn't plain text is refused, without an error")

print("== The page's server")
m.Handler.timeout = 2
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), m.Handler)
PORT = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()


def raw(data, seconds=4):
    sock = socket.create_connection(("127.0.0.1", PORT), timeout=seconds)
    sock.sendall(data)
    out = b""
    try:
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            out += chunk
    except socket.timeout:
        pass
    sock.close()
    return out


def call(method, path, body="", cookie=None):
    conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=5)
    headers = {"Content-Type": "application/x-www-form-urlencoded", "Sec-Fetch-Site": "same-origin"}
    if cookie:
        headers["Cookie"] = m.COOKIE + "=" + cookie
    conn.request(method, path, body=body if method == "POST" else None, headers=headers)
    response = conn.getresponse()
    response.read()
    conn.close()
    return response


start = time.time()
reply = raw(b"POST /login HTTP/1.1\r\nHost: x\r\nContent-Length: -1\r\n\r\npassword=aaaa")
ok(reply.startswith(b"HTTP/1.0 413") and time.time() - start < 1.5, "a request with a negative length is refused at once, not read")
ok(raw(b"POST /login HTTP/1.1\r\nHost: x\r\nContent-Length: 30000\r\n\r\n").startswith(b"HTTP/1.0 413"),
   "a request larger than the page's forms is refused before it's read")
login = call("GET", "/login")
ok(login.getheader("X-Frame-Options") == "DENY" and "frame-ancestors 'none'" in (login.getheader("Content-Security-Policy") or ""),
   "the page refuses to be shown inside another page")
sock = socket.create_connection(("127.0.0.1", PORT), timeout=10)
sock.sendall(b"GET / HTTP/1.1\r\nHost: x\r\n")
start = time.time()
ok(sock.recv(100) == b"" and time.time() - start < 5, "a half-sent request is dropped after the time limit")
sock.close()
ok(call("POST", "/save", "owner=" + OWNER).status == 401, "changes need a session")
m.save(OWNER, KEY, "domain", "buzz.example.com")
session = m.new_session()
for cf_state, expected in (("running", False), ("error", True)):
    write(m.CLOUDFLARE_STATE, cf_state + "\n")
    call("POST", "/cloudflare-reset", "", session)
    ok(os.path.exists(m.CLOUDFLARE_RESET) == expected,
       "Sign in to Cloudflare again " + ("works after an error" if expected else "does nothing while the tunnel runs"))

print("== A sign-in file, as the page and the tunnel check it")
SENTENCES = {"choose": "Choose the cert.pem file Cloudflare saved, then upload it.",
             "large": "That file is too large to be a Cloudflare sign-in. Choose the cert.pem file Cloudflare saved.",
             "not": m.NOT_A_CERT,
             "old": "That sign-in file is too old to set up a tunnel. Upload the cert.pem from your latest sign-in, "
                    "or sign in with the button."}


def verdict(data):
    """What the page makes of a file: "ok", or which of its fixed sentences, or the unexpected message itself."""
    try:
        return "ok" if m.cloudflare_cert(data) is data else "changed"
    except ValueError as error:
        return next((k for k, s in SENTENCES.items() if str(error) == s), str(error))


wrong = [name for name, data, want in sf.CASES if verdict(data) != want]
taken = sum(want == "ok" for _, _, want in sf.CASES)
ok(not wrong, "the page takes %d of %d made-up files unchanged, and refuses each other one with its own fixed sentence%s"
   % (taken, len(sf.CASES), (": wrong for " + ", ".join(wrong)) if wrong else ""))
corpus = d + "/corpus"
os.makedirs(corpus)
for name, data, _ in sf.CASES:
    with open(os.path.join(corpus, name), "wb") as f:
        f.write(data)
check_file = shell_function(compose_script("cloudflared"), "signin_file")
runner = check_file + '\nfor f in "$@"; do if signin_file "$f"; then echo "yes ${f##*/}"; else echo "no ${f##*/}"; fi; done\n'
for shell in [s for s in ("sh", "dash", "bash") if shutil.which(s)]:
    out = subprocess.run([shell, "-c", runner, "check"] + [os.path.join(corpus, n) for n, _, _ in sf.CASES],
                         capture_output=True, text=True)
    said = dict(reversed(line.split(" ", 1)) for line in out.stdout.splitlines())
    differ = [n for n, _, want in sf.CASES if said.get(n) != ("yes" if want == "ok" else "no")]
    ok(not differ and not out.stderr, "the tunnel's own check, in %s, takes exactly the files the page takes%s"
       % (shell, (": differs for " + ", ".join(differ)) if differ else (": " + out.stderr[:200]) if out.stderr else ""))

print("== Uploading a sign-in")
m.save(OWNER, KEY, "domain", "buzz.example.com")
write(m.CLOUDFLARE_STATE, "signin\n")
GOOD = sf.saved()


def upload(data=GOOD, signed_in=True, site="same-origin", origin=None, parts=None, form=None, timeout=10):
    """Posts the upload form as a browser would, with this file, or these parts, or this whole form: (status, page)."""
    kind, body = form or sf.multipart(parts or [("cert", "cert.pem", data, b"")])
    headers = {"Content-Type": kind}
    if site:
        headers["Sec-Fetch-Site"] = site
    if origin:
        headers["Origin"] = origin
    if signed_in:
        headers["Cookie"] = m.COOKIE + "=" + session
    conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=timeout)
    conn.request("POST", "/cloudflare-upload", body=body, headers=headers)
    response = conn.getresponse()
    text = response.read().decode(errors="replace")
    conn.close()
    return response.status, text


def waiting():
    try:
        with open(m.CLOUDFLARE_UPLOAD, "rb") as f:
            return f.read()
    except OSError:
        return None


pages = []
stderr, sys.stderr = sys.stderr, io.StringIO()  # anything the server prints, a traceback included
try:
    status, text = upload(signed_in=False)
    ok(status == 401 and waiting() is None, "an upload without a session is refused, and nothing is written")
    refused = [upload(site="same-site")[0], upload(site="cross-site")[0], upload(site=None, origin="http://evil.example")[0]]
    ok(refused == [403, 403, 403] and waiting() is None,
       "from another app's page, another site, or another origin: refused like every form, nothing written")
    ok(raw(b"POST /cloudflare-upload HTTP/1.1\r\nHost: x\r\nContent-Length: 30000\r\n\r\n").startswith(b"HTTP/1.0 413") and
       raw(b"POST /cloudflare-upload HTTP/1.1\r\nHost: x\r\nCookie: " + (m.COOKIE + "=" + session).encode()
           + b"\r\nContent-Length: 30000\r\n\r\n").startswith(b"HTTP/1.0 413"),
       "an upload larger than the page's forms is refused before it's read, with a session or without")
    answers = {}
    for name, data, want in sf.CASES:
        if want != "ok" and len(data) < 19000:
            status, text = upload(data)
            pages.append(text)
            answers[name] = (status, want, html.escape(SENTENCES[want]) in text, waiting() is None)
    bad = [n for n, (status, want, said, nothing) in answers.items() if not (status == 400 and said and nothing)]
    ok(not bad, "each of %d files that aren't a sign-in gets 400 and its sentence, and nothing is written%s"
       % (len(answers), (": not for " + ", ".join(bad)) if bad else ""))
    status, text = upload(form=("application/x-www-form-urlencoded", b"cert=" + GOOD.replace(b"\n", b"%0A")))
    status2, text2 = upload(b"")
    ok(status == status2 == 400 and html.escape(SENTENCES["choose"]) in text and html.escape(SENTENCES["choose"]) in text2
       and waiting() is None,
       "a form that isn't multipart, or an empty file: asked to choose the file, nothing written")
    pages += [text, text2]
    forms = {"two files named cert": [("cert", "a.pem", GOOD, b""), ("cert", "b.pem", GOOD, b"")],
             "the file and another part": [("cert", "cert.pem", GOOD, b""), ("other", "x.txt", b"x", b"")],
             "another field only": [("other", "cert.pem", GOOD, b"")],
             "a transfer encoding": [("cert", "cert.pem", base64.b64encode(GOOD), b"Content-Transfer-Encoding: base64\r\n")]}
    results = {label: upload(parts=parts) for label, parts in forms.items()}
    ok(all(s == 400 and html.escape(SENTENCES["choose"]) in t for s, t in results.values()) and waiting() is None,
       "a form not shaped like the page's own (%s) is asked to choose the file, nothing written" % ", ".join(forms))
    pages += [t for _, t in results.values()]
    MARK = "zq-marker-7731"
    marked = [(MARK + " plain text, no sign-in\n").encode(),
              sf.pem({"zoneID": sf.ZONE, "apiToken": MARK}),                     # too old: no account
              sf.pem({"zoneID": MARK, "accountID": sf.ACCOUNT, "apiToken": "a " + MARK})]
    for data in marked:
        pages.append(upload(data)[1])
    pages.append(upload(parts=[("cert", '"><script>' + MARK + "</script>.pem", sf.pem({"zoneID": MARK}), b"")])[1])
    ok(all(MARK not in text and sf.TOKEN not in text and "<script>" + MARK not in text for text in pages),
       "no answer shows anything from a refused file, or its name: %d answers" % len(pages))
    ok('<details class="alt" open><summary>Cloudflare saved a file named cert.pem instead?' in pages[0] and
       pages[0].index("<details class=\"alt\" open>") < pages[0].index('role="alert"'),
       "a refused file's sentence shows inside the upload's own section, opened")

    status, text = upload()
    mode = oct(os.stat(m.CLOUDFLARE_UPLOAD).st_mode & 0o777) if waiting() else ""
    ok(status == 303 and waiting() == GOOD and mode == "0o600",
       "the file Cloudflare saved is taken: 303, and it waits for the tunnel byte for byte as uploaded, mode 600")
    for name in ("written-by-login", "indented-json", "at-the-limit"):
        data = dict((n, d) for n, d, _ in sf.CASES)[name]
        status, _ = upload(data)
        ok(status == 303 and waiting() == data, "a sign-in written another way (%s) is kept as it is, not rewritten" % name)
    m.drop_upload()

    write(m.CLOUDFLARE_STATE, "running\n")
    status, _ = upload()
    ok(status == 303 and waiting() is None, "while the tunnel runs, an upload is ignored: nothing is written")
    write(m.CLOUDFLARE_STATE, "signin\n")
    real_write = m.write_secret

    def write_then_move_on(path, data):
        real_write(path, data)
        write(m.CLOUDFLARE_STATE, "creating\n")  # the tunnel's own sign-in came first

    m.write_secret = write_then_move_on
    status, _ = upload()
    m.write_secret = real_write
    ok(status == 303 and waiting() is None and not os.path.exists(m.CLOUDFLARE_UPLOAD + ".tmp"),
       "if the tunnel moves on while the page writes, the page deletes what it wrote")
    write(m.CLOUDFLARE_STATE, "signin\n")

    print("== What another service could leave in the shared folder")
    target = m.SETUP_JSON
    before = open(target, "rb").read()
    os.symlink(target, m.CLOUDFLARE_UPLOAD + ".tmp")
    status, _ = upload()
    ok(status == 303 and open(target, "rb").read() == before and waiting() == GOOD and not os.path.islink(m.CLOUDFLARE_UPLOAD),
       "a link at the temporary name is removed, not written through: the page's own settings stay as they were")
    m.drop_upload()
    os.symlink(target, m.CLOUDFLARE_UPLOAD)
    status, _ = upload()
    ok(status == 303 and open(target, "rb").read() == before and not os.path.islink(m.CLOUDFLARE_UPLOAD) and waiting() == GOOD,
       "a link at the upload's own name is replaced by the file, not written through")
    m.drop_upload()
    os.mkfifo(m.CLOUDFLARE_UPLOAD + ".tmp")
    start = time.time()
    status, _ = upload(timeout=5)
    ok(status == 303 and time.time() - start < 3 and waiting() == GOOD, "a pipe at the temporary name doesn't hold the page up")
    m.drop_upload()
    os.mkdir(m.CLOUDFLARE_UPLOAD + ".tmp")
    status, text = upload()
    ok(status == 503 and html.escape("This app couldn't save the file. Try again in a minute.") in text and waiting() is None,
       "a folder in the way: 503, a fixed sentence, and no file")
    os.rmdir(m.CLOUDFLARE_UPLOAD + ".tmp")
    if os.geteuid() != 0:  # root writes anywhere
        os.chmod(d, 0o555)
        try:
            status, text = upload()
        finally:
            os.chmod(d, 0o755)
        ok(status == 503 and html.escape("This app couldn't save the file. Try again in a minute.") in text and waiting() is None
           and not os.path.exists(m.CLOUDFLARE_UPLOAD + ".tmp"),
           "a shared folder it can't write: 503, a fixed sentence, and no file left")
finally:
    printed, sys.stderr = sys.stderr.getvalue(), stderr
ok(printed == "", "nothing reached the page's error output while it took all of these%s" % (": " + printed[:300] if printed else ""))

print("== An upload that waits, and the address")
upload()
m.save(OWNER, KEY, "domain", "buzz.example.com", False)  # a notifications save keeps the address
ok(waiting() == GOOD, "a save that keeps the address, like turning notifications off, keeps a waiting upload")
m.save(OWNER, KEY, "domain", "chat.example.com")
ok(waiting() is None, "another address deletes it: that address waits for its own sign-in")
m.save(OWNER, KEY, "domain", "buzz.example.com")
upload()
m.save(OWNER, KEY, "funnel", "")
ok(waiting() is None, "a Tailscale option deletes it")
status, _ = upload()
ok(status == 303 and waiting() is None, "and with a Tailscale option chosen, an upload is ignored")

print("== Moderation: the switch")
OWNER2 = "npub1xhq934ja9kl4d0h6r4pazkjg4whvp6umptmtsxcrd2zkc9e3rd3ssj94xd"
ADMIN_CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; "
             "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")  # relay 0.3.0's router.rs


def form(path, body="", cookie=None, site="same-origin"):
    """Posts one of the page's forms: (status, page)."""
    conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=15)
    headers = {"Content-Type": "application/x-www-form-urlencoded", "Sec-Fetch-Site": site}
    if cookie:
        headers["Cookie"] = m.COOKIE + "=" + cookie
    conn.request("POST", path, body=body, headers=headers)
    response = conn.getresponse()
    text = response.read().decode(errors="replace")
    conn.close()
    return response.status, text


def page_get(path="/"):
    conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=15)
    conn.request("GET", path, headers={"Cookie": m.COOKIE + "=" + session})
    response = conn.getresponse()
    text = response.read().decode(errors="replace")
    conn.close()
    return text


def admin_lines():
    return [line for line in m.read_text(m.RELAY_ENV).splitlines() if line.startswith("BUZZ_ADMIN_HOST")]


def fresh(mode, domain):
    """A setup where moderation was never on."""
    for path in (m.SETUP_JSON, m.RELAY_ENV):
        if os.path.exists(path):
            os.remove(path)
    m.save(OWNER, KEY, mode, domain)


stderr, sys.stderr = sys.stderr, io.StringIO()
try:
    fresh("domain", "buzz.example.com")
    status, _ = form("/moderation", "moderation=on")
    ok(status == 401 and not admin_lines(), "turning moderation on needs the page's sign-in: 401, and the relay's settings don't change")
    status, _ = form("/moderation", "moderation=on", session, site="same-site")
    ok(status == 403 and not admin_lines(), "a form from another app's page on the same Umbrel is refused: 403, nothing changes")
    fresh("funnel", "buzz.tail1234.ts.net")
    status, text = form("/moderation", "moderation=on", session)
    ok(status == 400 and "Moderation needs your own domain." in text and not admin_lines() and "moderation" not in m.load_setup(),
       "on a Tailscale option it's refused: 400, with its sentence, and nothing is saved")
    fresh("domain", "buzz.example.com")
    status, _ = form("/moderation", "moderation=on", session)
    ok(status == 303 and admin_lines() == ["BUZZ_ADMIN_HOST=buzz.example.com:8443"] and m.load_setup().get("moderation") is True,
       "on the owner's own domain it's saved: 303, and one line in the relay's settings, the domain on port 8443")
    before = os.stat(m.RELAY_ENV).st_ino
    status, _ = form("/moderation", "moderation=on", session)
    ok(status == 303 and os.stat(m.RELAY_ENV).st_ino == before, "saving it unchanged writes nothing, so Buzz doesn't restart")
    status, _ = form("/moderation", "", session)
    ok(status == 303 and not admin_lines() and m.load_setup().get("moderation") is False,
       "clearing the box takes the line out, and setup.json keeps \"moderation\": false, for the staff warning")
    fresh("domain", "buzz.example.com")
    before = os.stat(m.RELAY_ENV).st_ino
    status, _ = form("/moderation", "", session)
    ok(status == 303 and os.stat(m.RELAY_ENV).st_ino == before and "moderation" not in m.load_setup(),
       "turning it off when it was never on writes nothing")

    print("== Moderation never points at an old name")
    form("/moderation", "moderation=on", session)
    form("/owner", "owner=" + OWNER2, session)
    ok(admin_lines() == ["BUZZ_ADMIN_HOST=buzz.example.com:8443"] and ("RELAY_OWNER_PUBKEY=" + m.owner_hex(OWNER2)) in m.read_text(m.RELAY_ENV),
       "changing the owner keeps it on")
    form("/notifications", "", session)
    ok(admin_lines() == ["BUZZ_ADMIN_HOST=buzz.example.com:8443"] and "BUZZ_PUSH_ENABLED=false" in m.read_text(m.RELAY_ENV),
       "turning phone notifications off keeps it on")
    status, _ = form("/address", "mode=domain&domain=chat.example.com&confirm=buzz.example.com", session)
    ok(status == 303 and admin_lines() == ["BUZZ_ADMIN_HOST=chat.example.com:8443"] and "buzz.example.com" not in m.read_text(m.RELAY_ENV),
       "moving to another domain keeps it on, at the new name alone: the old one is nowhere in the relay's settings")
    status, _ = form("/address", "mode=funnel&confirm=chat.example.com", session)
    ok(status == 303 and not os.path.exists(m.RELAY_ENV) and m.load_setup().get("moderation") is False,
       "moving to a Tailscale option turns it off, and setup.json keeps \"moderation\": false")
    write(m.TAILSCALE_STATUS, json.dumps({"BackendState": "Running", "Self": {"DNSName": "buzz.tail1234.ts.net."}}))
    m.adopt_tailscale_name()
    ok(m.relay_domain() == "buzz.tail1234.ts.net" and not admin_lines(), "the Tailscale name becomes the address, without moderation")
    status, _ = form("/address", "mode=domain&domain=buzz.example.com&confirm=buzz.tail1234.ts.net", session)
    ok(status == 303 and m.relay_domain() == "buzz.example.com" and not admin_lines() and m.load_setup().get("moderation") is False,
       "back on a domain it stays off, until the owner turns it on again")
    record = dict(m.load_setup(), mode="funnel", domain="", moderation=True)
    write(m.SETUP_JSON, json.dumps(record))
    m.adopt_tailscale_name()
    ok(m.relay_domain() == "buzz.tail1234.ts.net" and not admin_lines() and m.load_setup().get("moderation") is False,
       "a setup.json that says it's on with a Tailscale option never gives the relay the line")
    m.save(OWNER, KEY, "funnel", "buzz.tail1234.ts.net", moderation=True)
    ok(not admin_lines() and m.load_setup().get("moderation") is False, "nor does asking save() for it there")
    write(m.SETUP_JSON, json.dumps(record))
    m.save(OWNER, KEY, "domain", "buzz.example.com")
    ok(not admin_lines() and m.load_setup().get("moderation") is False, "and it doesn't come back with a domain")
    try:
        m.write_relay_env(KEY, "buzz.tail1234.ts.net", True, True)
        refused = False
    except ValueError:
        refused = True
    ok(refused, "the relay's settings never take moderation for a Tailscale name")

    print("== Moderation: what the page makes of each answer from its address")
    canned = {  # what https://<name>:8443/ can answer, asked for NIP-11 with no User-Agent, and what the page should say
        "the relay's admin host: 404 with its admin policy": ((404, {"content-security-policy": ADMIN_CSP}, b""), "ok"),
        "the gateway's catch-all: an empty 404": ((404, {}, b""), "other"),
        "a relay that knows no community at <name>:8443": ((404, {"content-type": "text/plain; charset=utf-8"},
                                                           b"relay: no community is configured for this host"), "other"),
        "the community's own NIP-11: Host lost its port": ((200, {"content-type": "application/nostr+json"},
                                                            b'{"name":"x","supported_nips":[1,11,29]}'), "port"),
        "Cloudflare's 1010, as a page": ((403, {"content-type": "text/html; charset=UTF-8"},
                                          b"<html><title>Access denied</title><h1>Error 1010</h1></html>"), "cloudflare"),
        "Cloudflare's 1010, as text": ((403, {"content-type": "text/plain; charset=UTF-8"}, b"error code: 1010"), "cloudflare"),
        "a Cloudflare challenge": ((403, {"cf-mitigated": "challenge", "content-type": "text/html"},
                                    b"<title>Just a moment...</title>"), "cloudflare"),
        "a 530 from Cloudflare": ((530, {"content-type": "text/html"}, b"<html>error code: 1033</html>"), "other"),
        "no answer": ((None, {}, b"timed out"), "nothing"),
        "an HTTPS error": ((None, {}, b"tls [SSL: CERTIFICATE_VERIFY_FAILED]"), "other"),
    }
    wrong = [label for label, (answer, kind) in canned.items() if m.admin_answer(*answer)[0] != kind]
    ok(not wrong, "each of %d kinds of answer is read as what it is%s" % (len(canned), (": not " + ", ".join(wrong)) if wrong else ""))
    hints = {kind: m.admin_hint(*m.admin_answer(*answer)) for answer, kind in canned.values()}
    ok("Browser Integrity Check" in hints["cloudflare"] and "HTTP Host Header" in hints["port"] and "8443" in hints["nothing"]
       and m.admin_hint(*m.admin_answer(*canned["a 530 from Cloudflare"][0])).startswith("It answered with HTTP 530."),
       "and each gets its own hint, which shows a status code and nothing else from the answer")

    print("== Moderation: when the page looks at its address")
    SELF = "ab" * 32
    asked = []
    answers = [(404, {"content-security-policy": ADMIN_CSP}, b"")]

    def stand_in(domain, addr, timeout=4):
        asked.append(addr)
        return answers[0]

    def community(advertise):
        """A live community on this name, through Cloudflare, whose NIP-11 advertises this moderation address."""
        def request(host, port, path, tls=False, headers=None, timeout=6, addr=None):
            if host == m.RELAY_HOST:
                return (200, b"ok") if path == "/_readiness" else (200, json.dumps({"self": SELF}).encode())
            if path == "/_liveness":
                return 200, b"ok"
            if path == "/pair":
                return 101, b""
            info = {"self": SELF, "supported_nips": [1, 11]}
            if advertise:
                info["admin_api"] = advertise
            return 200, json.dumps(info).encode()
        return request

    real_request, real_resolves = m.request, m.resolves
    m.admin_request, m.request, m.resolves = stand_in, community("https://buzz.example.com:8443"), lambda name: ["104.16.0.1"]
    fresh("domain", "buzz.example.com")
    form("/moderation", "moderation=on", session)

    def status_json():
        m.CACHE["key"] = None
        return json.loads(page_get("/status.json"))

    def loaded():
        m.CACHE["key"] = None
        return page_get("/")

    first = status_json()
    ok(not asked and first["phase"].endswith(":moderation") and "Checking moderation at" in first["html"],
       "the 5-second refresh never asks: it marks the look as due, which opens the page again")
    text = loaded()
    ok(asked == ["104.16.0.1"] and "Moderation is reachable at <code>https://buzz.example.com:8443</code>" in text
       and 'data-phase="domain:live:buzz.example.com:-"' in text,
       "the page load asks once, at the address Cloudflare's DNS gives, beside the other checks")
    again = status_json()
    loaded()
    ok(len(asked) == 1 and again["phase"] == "domain:live:buzz.example.com:-" and "reachable" in again["html"],
       "an answer that works is kept: the refresh and later page loads don't ask again")
    m.forget_admin()
    answers[0] = (403, {"content-type": "text/plain"}, b"error code: 1010")
    text = loaded()
    ok(len(asked) == 2 and "Moderation isn't reachable" in text and "Browser Integrity Check" in text,
       "a Cloudflare refusal gets its own hint")
    loaded()
    ok(len(asked) == 2, "one that doesn't work is asked again by a page load only after %d seconds" % m.ADMIN_RETRY)
    m.ADMIN["at"] -= m.ADMIN_RETRY + 1
    loaded()
    ok(len(asked) == 3, "and then it is")
    answers[0] = (404, {"content-security-policy": ADMIN_CSP}, b"")
    form("/moderation", "", session)
    form("/moderation", "moderation=on", session)
    loaded()
    ok(len(asked) == 4, "turning it off, then on, asks again, though the relay's settings read as before")
    form("/notifications", "", session)
    loaded()
    ok(len(asked) == 5, "any save asks again, like turning phone notifications off")
    write(m.RELAY_ENV, m.relay_env_text(KEY, "buzz.example.com", True, True))
    loaded()
    ok(len(asked) == 6, "so does other text in the relay's settings, saved or not: it's another relay configuration")
    m.forget_admin()
    m.resolves = lambda name: ["10.0.0.5"]
    text = loaded()
    ok(len(asked) == 6 and "Moderation isn't reachable" in text,
       "a name that points to a private address isn't asked, as Buzz wouldn't: the row says it isn't reachable")
    m.resolves = lambda name: ["104.16.0.1"]
    m.forget_admin()
    m.request = community('https://evil.example.com:8443/"><script>zq7</script>')
    text, listed = loaded(), status_json()["html"]
    ok(len(asked) == 6 and "Turning on moderation" in listed and not any("evil" in t or "zq7" in t for t in (text, listed)),
       "a NIP-11 that advertises another address gets no request, and the page never shows what it says")
    m.request = community("")
    form("/moderation", "", session)
    m.request = community("https://buzz.example.com:8443")
    ok("Turning off moderation" in status_json()["html"], "while the relay still advertises it after turning off, the row says so")
    m.request, m.resolves = real_request, real_resolves

    print("== Moderation: the relay's settings at start")
    fresh("domain", "buzz.example.com")
    m.save(OWNER, KEY, "domain", "buzz.example.com", moderation=True)
    write(m.RELAY_ENV, m.relay_env_text(KEY, "buzz.example.com", True))  # a stop before the save's last write
    m.reconcile()
    ok(admin_lines() == ["BUZZ_ADMIN_HOST=buzz.example.com:8443"], "a start finishes a save that a stop cut short: moderation comes on")
    m.save(OWNER, KEY, "domain", "buzz.example.com", False, False)
    write(m.RELAY_ENV, m.relay_env_text(KEY, "buzz.example.com", True, True))
    m.reconcile()
    ok(not admin_lines() and "BUZZ_PUSH_ENABLED=false" in m.read_text(m.RELAY_ENV),
       "or off, with phone notifications as setup.json says")
    before = os.stat(m.RELAY_ENV).st_ino
    m.reconcile()
    ok(os.stat(m.RELAY_ENV).st_ino == before, "settings that already agree aren't written, so Buzz doesn't restart")
    m.save(OWNER, KEY, "funnel", "")
    write(m.RELAY_ENV, m.relay_env_text(KEY, "buzz.example.com", True, True))
    m.reconcile()
    ok(not os.path.exists(m.RELAY_ENV), "a Tailscale option still waiting for its name leaves the relay waiting too")
    write(m.SETUP_JSON, json.dumps(dict(m.load_setup(), mode="tailscale", domain="buzz.tail1234.ts.net")))
    write(m.RELAY_ENV, m.relay_env_text(KEY, "buzz.example.com", True))
    before = m.read_text(m.RELAY_ENV)
    m.reconcile()
    ok(m.read_text(m.RELAY_ENV) == before and not os.path.exists(m.CLOUDFLARE_ON),
       "a setup.json this page didn't write, with a mode it doesn't know, is left alone")

    print("== The checks the page refreshes, and the live page's links")
    fresh("domain", "buzz.example.com")
    m.request, m.resolves = community(""), lambda name: ["104.16.0.1"]
    text, first, again = loaded(), status_json(), status_json()
    box = re.search(r'<div class="checks" data-poll data-phase="([^"]*)" data-sig="(\w+)">', text)
    ok(box and first["phase"] == box.group(1) and first["sig"] == box.group(2) and (box.group(0) + first["html"] + "</div>") in text
       and again["sig"] == first["sig"] and "Everything works" in first["html"],
       "status.json sends the live page's own checks and signature, the same while nothing changes: an open list stays open")
    form("/moderation", "moderation=on", session)
    turning = status_json()
    ok(turning["sig"] != first["sig"] and "Turning on moderation" in turning["html"] and "Everything else works" in turning["html"],
       "when a check changes, so does the signature, and the refresh draws the card again")
    links = re.findall(r"<a [^>]*>", loaded())
    blank = [a for a in links if 'target="_blank"' in a]
    ok(blank and all('rel="noopener"' in a for a in blank) and
       sorted({re.search(r'href="([^"]*)"', a).group(1) for a in blank if "self-host" in a})
       == ["https://self-host.buzz/", "https://self-host.buzz/#security"],
       "every link that opens a new tab has rel=noopener (%d), and the self-hosting guide's are its homepage and its "
       "Security section on it" % len(blank))
    copies = re.findall(r'<button [^>]*onclick="([^"]*)"[^>]*>(Copy[^<]*)</button>', text)
    ok({"Copy", "Copy the address"} <= {label for _, label in copies} and {call for call, _ in copies} == {"copyText(this, this.dataset.copy)"},
       "the address reaches both copy buttons through a data attribute, never inside script")
    m.request, m.resolves = real_request, real_resolves

    def fetch(path, signed_in=True):
        """(status, text) for a GET, or (None, the error) when the server drops the connection."""
        conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=15)
        try:
            conn.request("GET", path, headers={"Cookie": m.COOKIE + "=" + session} if signed_in else {})
            response = conn.getresponse()
            return response.status, response.read().decode(errors="replace")
        except (OSError, http.client.HTTPException) as error:
            return None, repr(error)
        finally:
            conn.close()

    status, text = fetch("/status.json", signed_in=False)
    refused = json.loads(text) if status == 401 else {}
    ok(status == 401 and refused and "html" not in refused and "sig" not in refused,
       "without a session, status.json is refused: 401, with neither the checks nor their signature")

    print("== Names in the page's own files that it never wrote")

    class Markup(html.parser.HTMLParser):
        """The elements in some HTML, and every attribute that runs script."""
        def __init__(self, text):
            super().__init__()
            self.tags, self.handlers = [], []
            self.feed(text)
            self.close()

        def handle_starttag(self, tag, attrs):
            self.tags.append(tag)
            self.handlers += [(name, value) for name, value in attrs if name.startswith("on")]

    def harmless(text, scripts):
        """No element or script from a name: the page's own script alone, and no handler but its copy buttons'."""
        found = Markup(text)
        return (found.tags.count("script") == scripts and "img" not in found.tags
                and set(found.handlers) <= {("onclick", "copyText(this, this.dataset.copy)")})

    # Written straight into setup.json and the relay's settings, as a service sharing a folder could, past the checks
    # save() makes: the page escapes every place a name goes, on the live page, while connecting, and in status.json
    NAMES = ['buzz.example.com"><img src=x onerror=alert(1)>', "x'><script>alert(2)</script>.example.com",
             "</script><script>alert(3)</script>", 'a" onmouseover="alert(4)" b']
    SERVE = "https://buzz.tail1234.ts.net (tailnet only)\n|-- / proxy http://buzz-gateway:80\n"
    write(m.CLOUDFLARE_LOGIN, "https://dash.cloudflare.com/argotunnel?aud=&callback=x\n")
    write(m.TAILSCALE_STATUS, json.dumps({"BackendState": "Running", "Self": {"DNSName": "buzz.tail1234.ts.net."}}))
    write(m.TAILSCALE_SERVE, SERVE)
    seen, failed = 0, []
    for name in NAMES:
        # live, a community that answers, with moderation advertised at the name; connecting, nothing answers; and the
        # private network live, its device check carrying the name
        for mode, cf, request, addresses, want in (
                ("domain", "running", community(m.admin_origin(name)), ["104.16.0.1"], "Moderation is reachable at"),
                ("domain", "signin", real_request, [], "Sign in to Cloudflare</a>"),
                ("private", "", community(""), [], "Checking from this device")):
            record = {"owner": OWNER, "owner_hex": KEY, "mode": mode, "domain": name, "push": True}
            if mode == "domain":
                record["moderation"] = True  # moderation's address carries the name too
            write(m.SETUP_JSON, json.dumps(record))
            write(m.RELAY_ENV, "RELAY_OWNER_PUBKEY=" + KEY + "\nBUZZ_DOMAIN=" + name + "\n")
            write(m.CLOUDFLARE_STATE, cf + "\n")
            m.request = request
            m.resolves = lambda domain, found=addresses: list(found)
            m.forget_admin()
            m.CACHE["key"] = None
            status, text = fetch("/")
            m.CACHE["key"] = None
            listed_status, listed = fetch("/status.json")
            checks = json.loads(listed)["html"] if listed_status == 200 else ""
            shown = html.escape(name)
            good = (status == 200 and want in text and harmless(text, 1) and name not in text and shown in text
                    and harmless(checks, 0) and name not in checks and shown in checks)
            seen += 1
            if not good:
                failed.append((mode, cf, name))
    ok(seen == 12 and not failed, "a name with quotes, an element or a script in it shows as text everywhere, in %d pages and their "
       "status.json: no element, script or handler from it%s" % (seen, (": not " + repr(failed)) if failed else ""))

    print("== Bytes that aren't text in the helpers' files")
    NOT_TEXT = b"\xff\xfe\x80\xc3 not text \xed\xa0\x80\n"
    fresh("domain", "buzz.example.com")
    m.request, m.resolves = real_request, real_resolves
    write(m.CLOUDFLARE_STATE, "signin\n")
    with open(m.CLOUDFLARE_LOGIN, "wb") as f:
        f.write(NOT_TEXT + b"https://dash.cloudflare.com/argotunnel?aud=&callback=x\n")
    m.CACHE["key"] = None
    signin = fetch("/")
    write(m.CLOUDFLARE_STATE, "error\n")
    with open(m.CLOUDFLARE_SETUP, "wb") as f:
        f.write(b"ERR Failed to add route: " + NOT_TEXT)
    m.CACHE["key"] = None
    refused_step = fetch("/")
    fresh("private", "buzz.tail1234.ts.net")
    write(m.TAILSCALE_SERVE, "")
    with open(os.path.join(m.TAILSCALE_DIR, "tailscale-publish.log"), "wb") as f:
        f.write(NOT_TEXT + b"To enable, visit:\n\n https://login.tailscale.com/f/serve?node=n1\n")
    m.CACHE["key"] = None
    consent = fetch("/")
    os.remove(os.path.join(m.TAILSCALE_DIR, "tailscale-publish.log"))
    ok(signin[0] == 200 and "argotunnel?aud=&amp;callback=x" in signin[1] and refused_step[0] == 200
       and "Failed to add route" in refused_step[1] and consent[0] == 200 and "Allow it in Tailscale" in consent[1],
       "bytes that aren't UTF-8 in Cloudflare's sign-in and setup logs and Tailscale's log: the page still opens, with the links "
       "and the error line (%s %s %s)" % (signin[0], refused_step[0], consent[0]))
    fresh("domain", "buzz.example.com")
finally:
    printed, sys.stderr = sys.stderr.getvalue(), stderr
ok(printed == "", "nothing reached the page's error output in all of this%s" % (": " + printed[:300] if printed else ""))
server.shutdown()

print("== The relay's settings reader")
script = compose_script("relay")
reader = script[script.index("load() {"):script.index("\n}\n", script.index("load() {")) + 3]
marker = d + "/ran"
write(d + "/relay-test.env", "RELAY_OWNER_PUBKEY=" + "a" * 64 + "\nBUZZ_DOMAIN=x$(touch " + marker + ")\n"
      "BUZZ_REQUIRE_RELAY_MEMBERSHIP=false\n`touch " + marker + "`\nBUZZ_CORS_ORIGINS=https://a.com,tauri://localhost")
out = subprocess.run(["bash", "-c", reader + 'load "$1"; printf "%s|%s|%s" "$BUZZ_DOMAIN" "${BUZZ_REQUIRE_RELAY_MEMBERSHIP-unset}" '
                      '"$BUZZ_CORS_ORIGINS"', "test", d + "/relay-test.env"], capture_output=True, text=True).stdout
ok(not os.path.exists(marker) and out == "x$(touch " + marker + ")|unset|https://a.com,tauri://localhost",
   "the relay reads its settings as plain values: nothing in them runs, and a name it doesn't use is ignored")

print("== The relay's entrypoint and moderation, with a stand-in relay")
# The whole script from docker-compose.yml, in a folder of its own: buzz-relay is a stand-in that writes down the
# admin settings it was started with and exits. Nothing else in its environment is written: the key is in there.
ep = d + "/entrypoint"
os.makedirs(ep)
ADMIN_NAMES = ("BUZZ_ADMIN_HOST", "BUZZ_ADMIN_AUTH", "BUZZ_ADMIN_TOKEN", "RELAY_OPERATOR_PUBKEYS", "BUZZ_ADMIN_WEB_DIR")
stub(ep, "buzz-relay", "env | grep -E '^(" + "|".join(ADMIN_NAMES) + ")=' | sort > \"" + ep + "/seen\"\n")
relay_script = script
for path, local in (("/data/secrets/relay.env", ep + "/secrets.env"), ("/data/settings/relay.env", ep + "/settings.env"),
                    ("/usr/local/bin/buzz-relay", ep + "/buzz-relay"), ("sleep 3", "sleep 0.2")):
    assert path in relay_script, path
    relay_script = relay_script.replace(path, local)
write(ep + "/secrets.env", "BUZZ_RELAY_PRIVATE_KEY=" + "0" * 64 + "\n")  # made up: the stand-in never reads it
# What the image and a compose file could put in the relay's environment. The image sets BUZZ_ADMIN_WEB_DIR to Block's
# browser dashboard (relay Dockerfile, relay-v0.3.0).
IMAGE = {"BUZZ_ADMIN_WEB_DIR": "/srv/buzz/admin-web"}
HOSTILE = dict(IMAGE, BUZZ_ADMIN_HOST="evil.example.com:8443", BUZZ_ADMIN_AUTH="disabled", BUZZ_ADMIN_TOKEN="x",
               RELAY_OPERATOR_PUBKEYS="cd" * 32)


def relay_saw(settings, environment=IMAGE):
    """Starts the relay's entrypoint with these settings and this environment: the admin settings the relay got."""
    write(ep + "/settings.env", settings)
    if os.path.exists(ep + "/seen"):
        os.remove(ep + "/seen")
    # The container has no locale, so its shell's ranges are plain ASCII; macOS's bash under a UTF-8 locale isn't
    run = subprocess.run(["bash", "-c", relay_script], env=dict(environment, PATH=os.environ["PATH"], LC_ALL="C"),
                         capture_output=True, text=True, timeout=30)
    seen = open(ep + "/seen").read() if os.path.exists(ep + "/seen") else None
    return seen if run.returncode == 0 else "exit %d: %s" % (run.returncode, run.stderr[:200])


page_settings = m.relay_env_text(KEY, "buzz.example.com", True)
with_admin = m.relay_env_text(KEY, "buzz.example.com", True, True)
ok(relay_saw(page_settings, HOSTILE) == "",
   "the page is its only source: a value in the image or the environment never reaches the relay, the dashboard's included")
ok(relay_saw(with_admin, HOSTILE) == "BUZZ_ADMIN_HOST=buzz.example.com:8443\n",
   "the page's own line reaches it, and nothing else: no open mode, no other operators, no browser dashboard")
crafted = ["old.example.com:8443", "buzz.example.com:9443", "buzz.example.com:8443/x", "buzz.example.com",
           "BUZZ.example.com:8443", "buzz.example.com:8443$(touch " + marker + ")", "buzz.example.com:8443 "]
seen = {value: relay_saw(page_settings + "BUZZ_ADMIN_HOST=" + value + "\n") for value in crafted}
ok(all(v == "" for v in seen.values()) and not os.path.exists(marker),
   "any other value is dropped (%d kinds: an old name, another port, a path, a command), and nothing runs%s"
   % (len(crafted), "" if all(v == "" for v in seen.values()) else ": " + repr(seen)))
domains = {"buzz.tail1234.ts.net": "a Tailscale name", "Buzz.example.com": "a capital letter", "buzz_x.example.com": "an underscore"}
seen = {name: relay_saw("BUZZ_DOMAIN=" + name + "\nBUZZ_ADMIN_HOST=" + name + ":8443\n") for name in domains}
ok(all(v == "" for v in seen.values()), "an address the gateway treats as Tailscale's gets none (%s)%s"
   % (", ".join(domains.values()), "" if all(v == "" for v in seen.values()) else ": " + repr(seen)))
second = {admin: relay_saw(page_settings + "BUZZ_DOMAIN=evil.example.com\nBUZZ_ADMIN_HOST=" + admin + "\n")
          for admin in ("evil.example.com:8443", "buzz.example.com:8443")}
ok(all(v == "" for v in second.values()),
   "a second BUZZ_DOMAIN line can't move it or keep it: it's the gateway's address, the first, and the relay's own, the last%s"
   % ("" if all(v == "" for v in second.values()) else ": " + repr(second)))
ok(relay_saw("BUZZ_ADMIN_HOST=buzz.example.com:8443\n") == "", "with no address in the settings, there's none")
extra = with_admin + "".join(n + "=" + v + "\n" for n, v in HOSTILE.items() if n != "BUZZ_ADMIN_HOST")
ok(relay_saw(extra, {}) == "BUZZ_ADMIN_HOST=buzz.example.com:8443\n",
   "the settings file can't set the other four: open mode, a token, other operators or the dashboard")

print("== The compose file and the relay's admin settings")
compose = open(os.path.join(PKG, "docker-compose.yml")).read()
relay_block = compose.split("\n  relay:\n", 1)[1].split("\n  tailscale:\n", 1)[0]
environment = relay_block.split("\n    environment:\n", 1)[1].split("\n    volumes:\n", 1)[0]
ok(not any(n in environment for n in ADMIN_NAMES), "the relay's environment in the compose file sets none of " + ", ".join(ADMIN_NAMES))
ok(all(compose.count(n) == script.count(n) for n in ADMIN_NAMES), "and only the relay's own script names them, no other service")
load_list = reader.split("case ", 1)[1].split("\n", 2)[1]
unset_line = next(line for line in script.splitlines() if line.startswith("unset BUZZ_ADMIN_HOST"))
ok("|BUZZ_ADMIN_HOST)" in load_list and not any(n in load_list for n in ADMIN_NAMES[1:]) and all(n in unset_line for n in ADMIN_NAMES),
   "its settings reader takes BUZZ_ADMIN_HOST alone of them, after unsetting all five")

print("== The gateway's address")
bin_dir = d + "/bin"
stub(bin_dir, "caddy", 'cp "$3" "' + d + '/caddy-config"\nexec sleep 60\n')
gateway = (compose_script("gateway").replace("/settings/relay.env", d + "/gateway.env")
           .replace("/etc/caddy/Caddyfile", os.path.join(PKG, "Caddyfile.template")).replace("/tmp/Caddyfile", d + "/Caddyfile.out"))
write(d + "/gateway.env", "BUZZ_DOMAIN=buzz.example.com\n")
proc = subprocess.Popen(["sh", "-c", gateway], env=dict(os.environ, PATH=bin_dir + ":" + os.environ["PATH"]), start_new_session=True,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def config():
    try:
        return open(d + "/caddy-config").read()
    except OSError:
        return ""


try:
    ok(wait_for(lambda: "http://buzz.example.com:80 {" in config(), 10) and "\n:80 {\n\trespond 404\n}" in config(),
       "on a domain, the gateway answers only that address, and nothing for any other")
    write(d + "/gateway.env", "BUZZ_DOMAIN=buzz.tail1234.ts.net\n")
    ok(wait_for(lambda: config().startswith("{") and "\n:80 {\n\treverse_proxy" in config() and "respond 404" not in config(), 12),
       "on a Tailscale address, it answers every request, as Tailscale passes them on")
    write(d + "/gateway.env", "BUZZ_DOMAIN=evil.com {\n")
    ok(wait_for(lambda: "evil" not in config() and "\n:80 {\n\treverse_proxy" in config(), 12) and "evil" not in config(),
       "an address that isn't a plain host name never reaches the gateway's config")
finally:
    os.killpg(proc.pid, signal.SIGTERM)

print("== Switching Tailscale options")
ts_dir, history = d + "/ts", d + "/serve-history"
os.makedirs(ts_dir)
write(d + "/serve-state", "")
stub(bin_dir, "tailscaled", 'for a; do case "$a" in --socket=*) s="${a#--socket=}";; esac; done\n'
     'exec python3 -c "import socket, sys, time; x = socket.socket(socket.AF_UNIX); x.bind(sys.argv[1]); time.sleep(120)" "$s"\n')
stub(bin_dir, "tailscale", 'shift\nstate="' + d + '/serve-state"\ncase "$1 $2" in\n'
     '  "up "*|up*) exec sleep 120 ;;\n'
     '  "status --json") echo \'{"BackendState": "Running", "Self": {"DNSName": "buzz.tail1234.ts.net."}}\' ;;\n'
     '  "serve status") cat "$state" ;;\n'
     '  "serve reset") : > "$state" ;;\n'
     '  "funnel --bg") echo "To enable, visit: https://login.tailscale.com/f/funnel?node=n1"\n'
     '    while [ ! -e "' + d + '/consent" ]; do sleep 0.5; done\n'
     '    echo "https://buzz.tail1234.ts.net (Funnel on)" > "$state"; echo funnel >> "' + history + '" ;;\n'
     '  "serve --bg") echo "https://buzz.tail1234.ts.net (tailnet only)" > "$state"; echo private >> "' + history + '" ;;\n'
     'esac\n')
tailscale = (compose_script("tailscale").replace("/settings/", ts_dir + "/").replace("/var/lib/tailscale", d + "/ts-state")
             .replace("/tmp/tailscaled.sock", "tsd.sock"))  # relative: macOS caps socket paths at 104 bytes
write(ts_dir + "/tailscale-enabled", "funnel\n")
proc = subprocess.Popen(["sh", "-c", tailscale], env=dict(os.environ, PATH=bin_dir + ":" + os.environ["PATH"]), start_new_session=True, cwd=d,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    log = ts_dir + "/tailscale-publish.log"
    ok(wait_for(lambda: os.path.exists(log) and "login.tailscale.com/f/" in open(log).read(), 15),
       "a free Tailscale address waits for the owner to allow Funnel, with Tailscale's link")
    write(ts_dir + "/tailscale-enabled", "private\n")
    ok(wait_for(lambda: "tailnet only" in open(d + "/serve-state").read(), 15) and "login.tailscale.com/f/" not in open(log).read(),
       "switching to the private network drops the waiting Funnel and its link, and publishes to the tailnet only")
    write(d + "/consent", "")
    time.sleep(7)
    ok("funnel" not in (open(history).read() if os.path.exists(history) else "") and "tailnet only" in open(d + "/serve-state").read(),
       "allowing the old Funnel link afterwards publishes nothing to the internet")
finally:
    os.killpg(proc.pid, signal.SIGTERM)

print("\npassed: %d  failed: %d" % (PASSED, FAILED))
sys.exit(1 if FAILED else 0)
