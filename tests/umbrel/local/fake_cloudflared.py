#!/usr/bin/env python3
"""A stand-in for cloudflared, for the package's tunnel script. Its "Cloudflare" is a folder (FAKE_CF_CLOUD):
accounts with tunnels, one DNS table, and a log of every call. Like the real one, every management command
needs the sign-in at ~/.cloudflared/cert.pem, and `tunnel run --token-file` needs only the token. Messages
follow cloudflared 2026.10.4 (cmd/cloudflared/tunnel/*.go, cfapi/hostname.go)."""
import base64, json, os, secrets, signal, sys, time, uuid

CLOUD = os.environ["FAKE_CF_CLOUD"]
HOME = os.environ["HOME"]
CERT = os.path.join(HOME, ".cloudflared", "cert.pem")


def load(name, default):
    try:
        with open(os.path.join(CLOUD, name)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def store(name, value):
    path = os.path.join(CLOUD, name)
    with open(path + ".tmp", "w") as f:
        json.dump(value, f)
    os.replace(path + ".tmp", path)


def note(entry):
    with open(os.path.join(CLOUD, "calls.log"), "a") as f:
        f.write(json.dumps(entry) + "\n")


def fail(message):
    print(message, file=sys.stderr, flush=True)
    sys.exit(1)


def signed_in():
    """The account and zone in cert.pem, or the real tool's refusal."""
    try:
        with open(CERT) as f:
            cert = json.loads(f.read().split("\n", 1)[1].rsplit("-----END", 1)[0])
    except (OSError, ValueError, IndexError):
        fail("Cannot find a valid certificate for your origin at the path:\n\n    " + CERT)
    return cert["account"], cert["zone"]


def tunnel(account, name):
    found = load("tunnels.json", {}).get(account, {}).get(name)
    return found if found and not found["deleted"] else None


args = sys.argv[1:]
if args[:1] == ["--no-autoupdate"]:
    args = args[1:]
note({"args": args, "cert": os.path.exists(CERT)})

if args[:2] == ["tunnel", "login"]:
    if os.path.exists(CERT) and os.path.getsize(CERT) > 0:
        print("You have an existing certificate at %s which login would overwrite." % CERT, flush=True)
        sys.exit(0)
    os.makedirs(os.path.dirname(CERT), mode=0o700, exist_ok=True)
    n = len(load("logins.json", [])) + 1
    store("logins.json", load("logins.json", []) + [n])
    print("Please open the following URL and log in with your Cloudflare account:\n\n"
          "https://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.cloudflareaccess.org%2Fsignin" + str(n)
          + "\n\nLeave cloudflared running to download the cert automatically.", flush=True)
    consent = os.path.join(CLOUD, "consent")
    while not os.path.exists(consent):  # the owner, in the browser
        time.sleep(0.2)
    account, zone = open(consent).read().split()
    os.remove(consent)
    with open(CERT, "w") as f:
        f.write("-----BEGIN ARGO TUNNEL TOKEN-----\n" + json.dumps({"account": account, "zone": zone,
                "apiToken": secrets.token_hex(8)}) + "\n-----END ARGO TUNNEL TOKEN-----\n")
    os.chmod(CERT, 0o600)
    print("You have successfully logged in.", flush=True)
    sys.exit(0)

if args[:2] == ["tunnel", "create"]:
    account, _ = signed_in()
    name = args[2]
    if tunnel(account, name):
        fail("failed to create tunnel: Create Tunnel API call failed: tunnel with name already exists")
    tunnels = load("tunnels.json", {})
    entry = {"id": str(uuid.uuid4()), "secret": secrets.token_hex(16), "deleted": False}
    tunnels.setdefault(account, {})[name] = entry
    store("tunnels.json", tunnels)
    creds = os.path.join(os.path.dirname(CERT), entry["id"] + ".json")
    with open(creds, "w") as f:
        json.dump({"AccountTag": account, "TunnelSecret": entry["secret"], "TunnelID": entry["id"]}, f)
    os.chmod(creds, 0o400)
    print("Tunnel credentials written to %s. Keep this file secret.\n\nCreated tunnel %s with id %s" % (creds, name, entry["id"]))
    sys.exit(0)

if args[:2] == ["tunnel", "token"]:
    account, _ = signed_in()
    found = tunnel(account, args[2])
    if not found:
        fail("error parsing tunnel ID: %s is neither the ID nor the name of any of your tunnels" % args[2])
    print(base64.b64encode(json.dumps({"a": account, "t": found["id"], "s": found["secret"]}).encode()).decode())
    sys.exit(0)

if args[:3] == ["tunnel", "route", "dns"]:
    account, zone = signed_in()
    name, host = args[3], args[4]
    found = tunnel(account, name)
    if not found:
        fail("%s is neither the ID nor the name of any of your tunnels" % name)
    if os.path.exists(os.path.join(CLOUD, "fail-route")):
        fail("Failed to add route: code: 10000, reason: Authentication error")
    if os.path.exists(os.path.join(CLOUD, "not-listed-yet")):  # a new tunnel the list doesn't show yet
        fail("%s is neither the ID nor the name of any of your tunnels" % name)
    # Cloudflare names the record within the zone chosen at sign-in
    record = host if host == zone or host.endswith("." + zone) else host + "." + zone
    dns = load("dns.json", {})
    if record in dns:
        if dns[record] == found["id"]:
            print("INF %s is already configured to route to your tunnel tunnelID=%s" % (record, found["id"]))
            sys.exit(0)
        fail("Failed to add route: code: 1003, reason: Failed to create record %s with err An A, AAAA, or CNAME "
             "record with that host already exists." % record)
    dns[record] = found["id"]
    store("dns.json", dns)
    print("INF Added CNAME %s which will route to this tunnel tunnelID=%s" % (record, found["id"]))
    sys.exit(0)

if args[:2] == ["tunnel", "delete"]:
    account, _ = signed_in()
    name = args[-1]
    found = tunnel(account, name)
    if not found:
        fail("there should only be 1 non-deleted Tunnel named %s" % name)
    tunnels = load("tunnels.json", {})
    tunnels[account][name]["deleted"] = True
    store("tunnels.json", tunnels)
    creds = os.path.join(os.path.dirname(CERT), found["id"] + ".json")
    if os.path.exists(creds):
        os.remove(creds)
    sys.exit(0)

if args[:2] == ["tunnel", "run"]:
    token_file = args[args.index("--token-file") + 1]
    token = json.loads(base64.b64decode(open(token_file).read().strip()))
    found = [t for t in load("tunnels.json", {}).get(token["a"], {}).values() if t["id"] == token["t"] and not t["deleted"]]
    if not found or found[0]["secret"] != token["s"]:
        fail("Unauthorized: Tunnel not found")
    folder = os.path.dirname(CERT)
    run = {"tunnel": token["t"], "account": token["a"], "cert": os.path.exists(CERT),
           "credentials_json": os.path.isdir(folder) and any(n.endswith(".json") for n in os.listdir(folder))}

    def stop(*_):
        with open(os.path.join(CLOUD, "runs.log"), "a") as f:
            f.write(json.dumps(dict(run, stopped=True)) + "\n")
        sys.exit(0)

    signal.signal(signal.SIGTERM, stop)
    with open(os.path.join(CLOUD, "runs.log"), "a") as f:
        f.write(json.dumps(run) + "\n")
    while True:
        time.sleep(1)

fail("fake cloudflared: unexpected arguments %s" % args)
