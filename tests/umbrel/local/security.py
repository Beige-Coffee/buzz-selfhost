"""The package's own defenses, checked on this machine with no Docker: the setup page's checks and limits,
the relay's settings reader, the gateway's address, and Tailscale's switching. Mocked: no relay, Cloudflare
or Tailscale behind it; the scripts run from docker-compose.yml with stand-ins for caddy and tailscale.

  python3 tests/umbrel/local/security.py
"""
import http.client, http.server, importlib.machinery, importlib.util, json, os, signal, socket, subprocess
import sys, tempfile, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.normpath(os.path.join(HERE, "../../../umbrel/buzz"))
OWNER = "npub1464m3lr8zsjm79l073tcrptr8ekddatt30p8q4f25zcc7dq0zc7sc9a4yn"
PASSED = FAILED = 0


def ok(condition, text):
    global PASSED, FAILED
    print(("PASS  " if condition else "FAIL  ") + text, flush=True)
    PASSED, FAILED = PASSED + bool(condition), FAILED + (not condition)


def page():
    loader = importlib.machinery.SourceFileLoader("page", os.path.join(PKG, "setup.py.template"))
    m = importlib.util.module_from_spec(importlib.util.spec_from_loader("page", loader))
    loader.exec_module(m)
    d = tempfile.mkdtemp(prefix="buzz-security-")
    m.SETTINGS_DIR = m.TAILSCALE_DIR = m.CLOUDFLARE_DIR = d
    m.RELAY_ENV, m.SETUP_JSON = d + "/relay.env", d + "/setup.json"
    m.TAILSCALE_ON, m.TAILSCALE_STATUS, m.TAILSCALE_SERVE = d + "/tailscale-enabled", d + "/tailscale-status.json", d + "/tailscale-serve.txt"
    m.CLOUDFLARE_ON, m.CLOUDFLARE_STATE, m.CLOUDFLARE_LOGIN, m.CLOUDFLARE_SETUP, m.CLOUDFLARE_RESET = (
        d + "/" + n for n in ("cloudflare-enabled", "cloudflare-state", "cloudflare-login.log", "cloudflare-setup.log", "cloudflare-reset"))
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
