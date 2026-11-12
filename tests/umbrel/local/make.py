"""Turns the Umbrel package into a plain Docker Compose project in run/, for up.sh.

What it mimics from umbrelOS: the container names (<app>_<service>_1), one shared network, the
rendered templates in the app's data folder, and the per-install secrets from exports.sh. What it
doesn't: Umbrel's proxy and login, its app lifecycle and its updates. Named volumes replace the
data bind mounts, since Postgres can't own a folder shared from macOS. Needs PyYAML.

  python3 make.py [package dir] [out dir]
"""
import hashlib, os, re, shutil, sys
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
pkg = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "../../../umbrel/buzz")
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "run")
os.makedirs(out, exist_ok=True)
shutil.copy(os.path.join(pkg, "Caddyfile.template"), os.path.join(out, "Caddyfile"))
# The page from this checkout, on the image's own base, so a local run tests local edits before any
# image is published. The droplet runs use the published image.
shutil.copy(os.path.join(pkg, "..", "setup-page", "setup.py"), os.path.join(out, "setup.py"))


def derive(label):  # a stand-in for umbrelOS's derive_entropy: stable per label, test-only
    return hashlib.sha256(("local-test-seed|" + label).encode()).hexdigest()


ident = "app-buzz-seed"
env = {
    "APP_DATA_DIR": out,
    # a throwaway, plainly-test password for this local copy only, so a browser walkthrough types no secret
    "APP_PASSWORD": "local-test-only",
    "APP_BUZZ_POSTGRES_PASSWORD": derive(ident + "-postgres-password"),
    "APP_BUZZ_REDIS_PASSWORD": derive(ident + "-redis-password"),
    "APP_BUZZ_S3_ACCESS_KEY": "buzz" + derive(ident + "-s3-access-key")[:16],
    "APP_BUZZ_S3_SECRET_KEY": derive(ident + "-s3-secret-key"),
    "APP_BUZZ_GIT_HOOK_HMAC_SECRET": derive(ident + "-git-hook-hmac-secret"),
    "APP_BUZZ_SETUP_SECRET": derive(ident + "-setup-session"),
}
with open(os.path.join(out, ".env"), "w") as f:
    for k, v in env.items():
        f.write(k + "=" + v + "\n")
os.chmod(os.path.join(out, ".env"), 0o600)

compose = yaml.safe_load(open(os.path.join(pkg, "docker-compose.yml")))
compose.pop("version", None)
services = compose["services"]
services.pop("app_proxy")
volumes = {}
for name, svc in services.items():
    svc["container_name"] = "buzz_" + name + "_1"
    fixed = []
    for v in svc.get("volumes", []):
        src, _, rest = v.partition(":")
        m = re.fullmatch(r"\$\{APP_DATA_DIR\}/data/([a-z]+)", src)
        if m:
            vol = "buzz-" + m.group(1)
            volumes[vol] = {}
            target, _, mode = rest.partition(":")
            # nocopy: an empty volume keeps the owner set by up.sh (1000:1000) instead of taking the
            # image's, as umbrelOS's prepared folders do
            fixed.append({"type": "volume", "source": vol, "target": target, "read_only": mode == "ro",
                          "volume": {"nocopy": True}})
        else:
            fixed.append(v)
    if fixed:
        svc["volumes"] = fixed
services["web"]["image"] = "python:3.13.16-alpine3.24@sha256:2d9aefe2fef018a7eb2c13064c89c71929800fd2e5dccdbf52ea5da5bb8d929a"
services["web"]["command"] = ["python3", "-u", "/app/setup.py"]
services["web"]["volumes"] = ["${APP_DATA_DIR}/setup.py:/app/setup.py:ro"] + services["web"].get("volumes", [])
# the setup page on this machine only, as Umbrel's proxy would publish it
services["web"]["ports"] = ["127.0.0.1:8090:8080"]
compose["volumes"] = volumes
compose["networks"] = {"default": {"name": "umbrel_main_network_local"}}
yaml.safe_dump(compose, open(os.path.join(out, "compose.yml"), "w"), sort_keys=False, width=200)
print("wrote", os.path.join(out, "compose.yml"), "with services:", ", ".join(services))
