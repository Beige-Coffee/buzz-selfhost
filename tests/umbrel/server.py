#!/usr/bin/env python3
"""Create or delete the Umbrel test server on DigitalOcean.

  python3 tests/umbrel/server.py up     # a 4-CPU, 8 GB droplet behind a firewall that only lets SSH in
  python3 tests/umbrel/server.py down   # deletes that droplet and its firewall, nothing else

Umbrel's dashboard must not face the internet, and Cloudflare Tunnel only connects outward, so the
firewall allows port 22 alone. Needs a DigitalOcean token in DO_TOKEN_FILE (default
~/.buzz-test/do-token) and an SSH key in SSH_KEY (default ~/.buzz-test/id_ed25519) that's already
on the account. Writes the server's address to ~/.buzz-test/umbrel-ip.
"""
import json, os, subprocess, sys, time, urllib.error, urllib.request

B = os.path.expanduser("~/.buzz-test")
TOKEN = open(os.environ.get("DO_TOKEN_FILE", f"{B}/do-token")).read().strip()
KEY = os.environ.get("SSH_KEY", f"{B}/id_ed25519")
NAME, FIREWALL, TAG = "buzz-umbrel-test", "buzz-umbrel-test-ssh-only", "buzz-selfhost-test"


def api(method, path, body=None):
    request = urllib.request.Request("https://api.digitalocean.com/v2" + path, method=method,
                                     data=json.dumps(body).encode() if body else None,
                                     headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(request) as response:
        data = response.read()
        return json.loads(data) if data else {}


def down():
    for d in api("GET", f"/droplets?tag_name={TAG}&per_page=200")["droplets"]:
        if d["name"] == NAME:
            api("DELETE", f"/droplets/{d['id']}")
            print(f"deleted droplet {NAME}")
    for f in api("GET", "/firewalls?per_page=200")["firewalls"]:
        if f["name"] == FIREWALL:
            api("DELETE", f"/firewalls/{f['id']}")
            print(f"deleted firewall {FIREWALL}")


def up():
    pub = open(KEY + ".pub").read().strip()
    key = next(k for k in api("GET", "/account/keys?per_page=200")["ssh_keys"] if k["public_key"].strip() == pub)
    droplet = None
    for region in ["sfo3", "sfo2", "nyc3", "nyc1", "tor1"]:  # sizes run out region by region
        try:
            droplet = api("POST", "/droplets", {"name": NAME, "region": region, "size": "s-4vcpu-8gb",
                                                "image": "ubuntu-24-04-x64", "ssh_keys": [key["id"]],
                                                "tags": [TAG], "ipv6": False})["droplet"]["id"]
            print(f"created {NAME} in {region}")
            break
        except urllib.error.HTTPError as error:
            if error.code != 422:
                raise
    if not droplet:
        sys.exit("no region had the size")
    out = [{"protocol": p, "ports": "all", "destinations": {"addresses": ["0.0.0.0/0", "::/0"]}} for p in ("tcp", "udp")]
    api("POST", "/firewalls", {"name": FIREWALL, "droplet_ids": [droplet],
        "inbound_rules": [{"protocol": "tcp", "ports": "22", "sources": {"addresses": ["0.0.0.0/0", "::/0"]}}],
        "outbound_rules": out + [{"protocol": "icmp", "destinations": {"addresses": ["0.0.0.0/0", "::/0"]}}]})
    ip, deadline = "", time.time() + 600
    while not ip and time.time() < deadline:
        d = api("GET", f"/droplets/{droplet}")["droplet"]
        if d["status"] == "active":
            ip = next((n["ip_address"] for n in d["networks"]["v4"] if n["type"] == "public"), "")
        time.sleep(5)
    for _ in range(60):
        if subprocess.run(["ssh", "-i", KEY, "-o", "BatchMode=yes", "-o", "ConnectTimeout=5",
                           "-o", "StrictHostKeyChecking=accept-new", "-o", f"UserKnownHostsFile={os.path.dirname(KEY)}/known_hosts",
                           f"root@{ip}", "true"], capture_output=True).returncode == 0:
            break
        time.sleep(5)
    else:
        sys.exit(f"no SSH to {ip}")
    open(f"{B}/umbrel-ip", "w").write(ip + "\n")
    print(f"{NAME} at {ip}")


{"up": up, "down": down}[sys.argv[1] if len(sys.argv) > 1 else "up"]()
