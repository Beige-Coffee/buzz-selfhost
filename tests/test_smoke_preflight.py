#!/usr/bin/env python3
"""Offline safety checks. Stub all server commands; never contact a relay."""

import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent / "skills/self-host-buzz/SKILL.md"
KUBERNETES = SKILL.parent / "references/kubernetes.md"
# Images that are not the recommended one: an sha- tag, which names its commit, and a release,
# which does not. The release and its values are made up, so no pin move can make them the default.
CANDIDATE = "sha-e5dee91"
DIGEST = "sha256:d4777e9163de0861c3f02ea9e67632b0afadc6d6ebac2cf4c09c00f1317f4a6d"
RELEASE = "9.9.9"
RELEASE_DIGEST = "sha256:" + "a" * 64
RELEASE_COMMIT = "b" * 40
DRIVERS = ("smoke.sh", "smoke-private.sh", "smoke-k8s.sh", "smoke-local.sh")
IMAGE_ENV = ("EXPECTED_DIGEST", "EXPECTED_COMMIT", "UPGRADE_EXPECTED_DIGEST", "UPGRADE_EXPECTED_COMMIT")


def metadata():
    return dict(line.strip().split(": ", 1) for line in SKILL.read_text().splitlines()
                if line.startswith("  tested-"))


def clean_env(**extra):
    env = dict(os.environ, NO_LOG="1")
    for name in IMAGE_ENV:
        env.pop(name, None)
    env.update(extra)
    return env


class ImageSelection(unittest.TestCase):
    def call(self, function, *args):
        return subprocess.run(
            ["/bin/bash", "-c", 'source "$1"; shift; "$@"', "test", str(HERE / "lib/image.sh"), function, *args],
            text=True, capture_output=True, check=False,
        )

    def resolve(self, tag, digest=""):
        return self.call("expected_image_digest", tag, digest, str(SKILL))

    def commit(self, tag, commit=""):
        return self.call("expected_image_commit", tag, commit, str(SKILL))

    def test_recommended_digest_comes_from_skill(self):
        pin = metadata()
        result = self.resolve(pin["tested-image"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), pin["tested-digest"])
        self.assertNotEqual(self.resolve(pin["tested-image"], "sha256:" + "0" * 64).returncode, 0)

    def test_recommended_commit_comes_from_skill(self):
        pin = metadata()
        self.assertRegex(pin["tested-commit"], r"^[0-9a-f]{40}$")
        result = self.commit(pin["tested-image"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), pin["tested-commit"])
        self.assertEqual(self.commit(pin["tested-image"], pin["tested-commit"]).returncode, 0)
        self.assertNotEqual(self.commit(pin["tested-image"], "0" * 40).returncode, 0)
        if pin["tested-image"].startswith("sha-"):
            self.assertTrue(pin["tested-commit"].startswith(pin["tested-image"][4:]))

    def test_default_tag_is_the_recommended_image(self):
        result = self.call("default_image_tag", str(SKILL))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), metadata()["tested-image"])
        for script in DRIVERS:
            with self.subTest(script=script):
                text = (HERE / script).read_text()
                self.assertIn("default_image_tag", text)
                # no driver keeps a default of its own, which a pin move would leave behind
                self.assertIsNone(re.search(r"TAG=\$\{\d:-(?!\$\(default_image_tag|\})", text))

    def test_candidate_requires_exact_digest(self):
        for tag, digest in ((CANDIDATE, DIGEST), (RELEASE, RELEASE_DIGEST)):
            with self.subTest(tag=tag):
                self.assertNotEqual(self.resolve(tag).returncode, 0)
                result = self.resolve(tag, digest)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.strip(), digest)
                for malformed in ("sha256:123", "sha256:" + "G" * 64, digest + ";true"):
                    self.assertNotEqual(self.resolve(tag, malformed).returncode, 0)
        for tag in ("sha-1234567;true", "0.3.0;true", "0.3", "v0.3.0", "0.3.0-rc1", "latest", "main", ""):
            with self.subTest(tag=tag):
                self.assertNotEqual(self.resolve(tag, DIGEST).returncode, 0)
                self.assertNotEqual(self.commit(tag, RELEASE_COMMIT).returncode, 0)

    def test_release_requires_exact_commit(self):
        missing = self.commit(RELEASE)
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("EXPECTED_COMMIT", missing.stderr)
        result = self.commit(RELEASE, RELEASE_COMMIT)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), RELEASE_COMMIT)
        for malformed in ("b" * 39, "b" * 41, "B" * 40, "b" * 7, RELEASE_COMMIT + ";true", "main", "relay-v9.9.9"):
            with self.subTest(commit=malformed):
                self.assertNotEqual(self.commit(RELEASE, malformed).returncode, 0)

    def test_sha_tag_names_its_own_commit(self):
        result = self.commit(CANDIDATE)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), CANDIDATE[4:])
        full = CANDIDATE[4:] + "0" * 33
        self.assertEqual(self.commit(CANDIDATE, full).stdout.strip(), full)
        self.assertNotEqual(self.commit(CANDIDATE, RELEASE_COMMIT).returncode, 0)

    def test_each_driver_rejects_unknown_digest_before_server_work(self):
        for tag in (CANDIDATE, RELEASE):
            for script, args in (
                ("smoke.sh", ["example.invalid", "example.invalid", tag]),
                ("smoke-private.sh", ["example.invalid", "test", tag]),
                ("smoke-k8s.sh", ["example.invalid", tag]),
                ("smoke-local.sh", [tag]),
            ):
                with self.subTest(script=script, tag=tag):
                    result = subprocess.run(["/bin/bash", str(HERE / script), *args],
                                            env=clean_env(), text=True, capture_output=True, check=False)
                    self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                    self.assertIn("EXPECTED_DIGEST", result.stderr)
                    self.assertNotIn("Identities", result.stdout)

    def test_each_bundle_driver_rejects_a_release_without_its_commit(self):
        pin = metadata()["tested-image"]
        for script, args, env, variable in (
            ("smoke.sh", ["example.invalid", "example.invalid", RELEASE], {"EXPECTED_DIGEST": RELEASE_DIGEST}, "EXPECTED_COMMIT"),
            ("smoke.sh", ["example.invalid", "example.invalid", pin, RELEASE],
             {"UPGRADE_EXPECTED_DIGEST": RELEASE_DIGEST}, "UPGRADE_EXPECTED_COMMIT"),
            ("smoke-private.sh", ["example.invalid", "test", RELEASE], {"EXPECTED_DIGEST": RELEASE_DIGEST}, "EXPECTED_COMMIT"),
            ("smoke-local.sh", [RELEASE], {"EXPECTED_DIGEST": RELEASE_DIGEST}, "EXPECTED_COMMIT"),
        ):
            with self.subTest(script=script, args=args):
                result = subprocess.run(["/bin/bash", str(HERE / script), *args],
                                        env=clean_env(**env), text=True, capture_output=True, check=False)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertIn(variable, result.stderr)
                self.assertNotIn("Identities", result.stdout)

    def test_server_half_rejects_an_image_phase_without_its_commit(self):
        with tempfile.TemporaryDirectory() as temp:
            # If the refusal ever fails, these stand in for what the phase would run on this machine.
            tripped = Path(temp) / "tripped"
            for name in ("sudo", "docker", "git", "curl", "cloud-init", "apt-get", "mkdir", "tailscale"):
                stub = Path(temp) / name
                stub.write_text(f'#!/bin/sh\necho {name} >> "{tripped}"\nexit 97\n')
                stub.chmod(0o755)
            for phase, args in (("install", ["example.invalid", RELEASE, "a" * 64]),
                                ("private", [RELEASE, "a" * 64, "test"]),
                                ("upgrade", [RELEASE])):
                for commit in ("", "b" * 7, "main", RELEASE_COMMIT + "0"):
                    with self.subTest(phase=phase, commit=commit):
                        env = clean_env(EXPECTED_TAG=RELEASE, EXPECTED_DIGEST=RELEASE_DIGEST, EXPECTED_COMMIT=commit,
                                        PATH=temp + os.pathsep + os.environ["PATH"])
                        result = subprocess.run(["/bin/bash", str(HERE / "smoke-vps.sh"), phase, *args], env=env, text=True,
                                                capture_output=True, check=False, stdin=subprocess.DEVNULL, timeout=30)
                        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                        self.assertIn("EXPECTED_COMMIT", result.stderr)
                        self.assertEqual(result.stdout, "")
                        self.assertFalse(tripped.exists(), "an image phase ran a command without its commit")


class KubernetesValues(unittest.TestCase):
    """The Kubernetes test runs kubernetes.md step 3's own block, so the two cannot differ."""

    OWNER = "c" * 64

    def render(self):
        script = (HERE / "smoke-k8s.sh").read_text()
        extract = [line for line in script.splitlines() if line.startswith("VALUES_BLOCK=")]
        self.assertEqual(len(extract), 1, "smoke-k8s.sh no longer extracts the guide's values block")
        for line in ("quickstart: true", "mcImage: ghcr.io", "corsOrigins:"):
            self.assertFalse(line in script, f"smoke-k8s.sh carries a values file of its own ({line})")
        with tempfile.TemporaryDirectory() as temp:
            harness = f'set -u\nSKILL="{SKILL.parent}"\n{extract[0]}\ncd "$1" && eval "$VALUES_BLOCK" && cat buzz-values.yaml\n'
            env = clean_env(TAG=RELEASE, DIGEST=RELEASE_DIGEST, DOMAIN="buzz.example.org", OWNER_HEX=self.OWNER)
            result = subprocess.run(["/bin/bash", "-c", harness, "test", temp],
                                    env=env, text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_the_guides_block_pins_both_images_by_digest(self):
        values = self.render()
        self.assertIn(f"image:\n  tag: {RELEASE}\n  digest: {RELEASE_DIGEST}\n", values)
        store = re.findall(r"^  (image|mcImage): (\S+)$", values, re.MULTILINE)
        self.assertEqual([name for name, _ in store], ["image", "mcImage"])
        self.assertEqual(len({ref for _, ref in store}), 1)
        self.assertRegex(store[0][1], r"^ghcr\.io/block/buzz-minio@sha256:[0-9a-f]{64}$")
        self.assertNotIn(":latest", values)
        self.assertIn(f"relayUrl: wss://buzz.example.org\nownerPubkey: {self.OWNER}\n", values)
        self.assertIn('{name: BUZZ_PUSH_ENABLED, value: "true"}', values)
        self.assertIn("  url: wss://buzz.example.org/pair\n", values)

    def test_public_and_private_values_pin_the_same_images(self):
        guide = KUBERNETES.read_text()
        blocks = re.findall(r"^cat > buzz-values\.yaml <<YAML\n(.*?)^YAML$", guide, re.MULTILINE | re.DOTALL)
        self.assertEqual(len(blocks), 2, "expected the public and the private values file")
        pins = []
        for block in blocks:
            self.assertIn("image:\n  tag: $TAG\n  digest: $DIGEST\n", block)
            pins.append(re.findall(r"^  (?:image|mcImage): (\S+)$", block, re.MULTILINE))
        self.assertEqual(pins[0], pins[1])
        self.assertEqual(len(pins[0]), 2)
        self.assertNotIn(":latest", guide.split("**Removing it**")[0])


class UpgradeGuard(unittest.TestCase):
    def test_remote_failure_stops_each_driver(self):
        for script in ("smoke.sh", "smoke-private.sh"):
            with self.subTest(script=script), tempfile.TemporaryDirectory() as temp:
                contents = (HERE / script).read_text()
                start = contents.index("server() {\n")
                end = contents.index("\n}\n", start) + 3
                harness = f"""set -uo pipefail
TAG={RELEASE}
UPGRADE_TAG=
EXPECTED_DIGEST=$1
EXPECTED_COMMIT={RELEASE_COMMIT}
TMP=$2
IP=example.invalid
SSH_OPTS=(-o BatchMode=yes)
PASS=0
FAIL=0
ssh() {{ echo 'FAIL  backup failed'; return 5; }}
""" + contents[start:end] + "server backup\necho UNEXPECTED_CONTINUATION\n"
                result = subprocess.run(["/bin/bash", "-c", harness, "test", RELEASE_DIGEST, temp],
                                        text=True, capture_output=True, check=False)
                self.assertEqual(result.returncode, 5, result.stdout + result.stderr)
                self.assertIn("no later phases", result.stdout)
                self.assertNotIn("UNEXPECTED_CONTINUATION", result.stdout)

    def test_each_phase_gets_the_tag_digest_and_commit_it_must_check(self):
        contents = (HERE / "smoke.sh").read_text()
        start = contents.index("server() {\n")
        end = contents.index("\n}\n", start) + 3
        with tempfile.TemporaryDirectory() as temp:
            harness = f"""set -uo pipefail
TAG={CANDIDATE}
UPGRADE_TAG={RELEASE}
EXPECTED_DIGEST={DIGEST}
EXPECTED_COMMIT={CANDIDATE[4:]}
UPGRADE_EXPECTED_DIGEST={RELEASE_DIGEST}
UPGRADE_EXPECTED_COMMIT={RELEASE_COMMIT}
TMP=$1
IP=example.invalid
SSH_OPTS=(-o BatchMode=yes)
PASS=0
FAIL=0
ssh() {{ printf 'SSH %s\\n' "$*"; }}
""" + contents[start:end] + "server install\nserver upgrade\n"
            result = subprocess.run(["/bin/bash", "-c", harness, "test", temp],
                                    text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        install, upgrade = [line for line in result.stdout.splitlines() if line.startswith("SSH ")]
        self.assertIn(f"EXPECTED_TAG={CANDIDATE} EXPECTED_DIGEST={DIGEST} EXPECTED_COMMIT={CANDIDATE[4:]} ", install)
        self.assertIn(f"EXPECTED_TAG={RELEASE} EXPECTED_DIGEST={RELEASE_DIGEST} EXPECTED_COMMIT={RELEASE_COMMIT} ", upgrade)

    def upgrade(self, failure, tag, digest, commit):
        """Run smoke-vps.sh's upgrade phase against stubs. Returns the result and what it changed."""
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            bundle = base / "bundle"
            bundle.mkdir()
            (bundle / ".env").write_text("BUZZ_IMAGE=ghcr.io/block/buzz:sha-744f394\n")
            (bundle / "run.sh").write_text('#!/bin/sh\necho upgrade >> "$MUTATIONS"\n')
            (bundle / "run.sh").chmod(0o755)
            stub = base / "bin"
            stub.mkdir()
            commands = {
                # merge-base gets the commit the running image names: without one, nothing is proven
                "git": '''#!/bin/sh
case "$1" in
  fetch) [ "$FAILURE" != fetch ] ;;
  merge-base) [ -n "$3" ] && [ -n "$4" ] && [ "$FAILURE" != ancestry ] ;;
  *) echo "git $1" >> "$MUTATIONS"; exit 42 ;;
esac
''',
                "docker": '''#!/bin/sh
case "$*" in
  "image inspect"*"org.opencontainers.image.revision"*"ghcr.io/block/buzz:sha-744f394")
    [ "$FAILURE" = label ] || echo 744f3946f6fe1ff7a649c132638d5af608900dbd ;;
  *"compose ps"*) echo pgsty/silo:test ;;
  *"compose run"*) echo '2026-01-01 0 one.png' ;;
  *"compose exec"*)
    [ "$FAILURE" = sql ] && exit 9
    [ "$FAILURE" = duplicate ] && echo 'duplicate|2'
    exit 0 ;;
  *) echo "docker mutation" >> "$MUTATIONS"; exit 42 ;;
esac
''',
            }
            for name, contents in commands.items():
                (stub / name).write_text(contents)
                (stub / name).chmod(0o755)
            script = (HERE / "smoke-vps.sh").read_text()
            script = script.replace("OUT=/root/smoke", f'OUT="{base}/out"')
            script = script.replace("COMPOSE_DIR=/root/buzz/deploy/compose", f'COMPOSE_DIR="{bundle}"')
            script = script.replace("~/buzz-files-before.txt", f'"{base}/files-before.txt"')
            target = base / "smoke-vps.sh"
            target.write_text(script)
            marker = base / "mutations"
            env = dict(os.environ, PATH=str(stub) + os.pathsep + os.environ["PATH"],
                       FAILURE=failure, MUTATIONS=str(marker),
                       EXPECTED_TAG=tag, EXPECTED_DIGEST=digest, EXPECTED_COMMIT=commit)
            result = subprocess.run(["/bin/bash", str(target), "upgrade", tag],
                                    env=env, text=True, capture_output=True, check=False)
            return result, (marker.read_text() if marker.exists() else "")

    def test_failed_prerequisites_never_change_bundle_or_run_upgrade(self):
        for tag, digest, commit in ((CANDIDATE, DIGEST, CANDIDATE[4:]), (RELEASE, RELEASE_DIGEST, RELEASE_COMMIT)):
            for failure in ("fetch", "label", "ancestry", "sql", "duplicate"):
                with self.subTest(tag=tag, failure=failure):
                    result, changed = self.upgrade(failure, tag, digest, commit)
                    self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertIn("stopping", result.stdout)
                    self.assertEqual(changed, "", result.stdout + result.stderr)

    def test_met_prerequisites_reach_the_bundle_move(self):
        # The control for the test above: with nothing failing, the next command is the first change.
        result, changed = self.upgrade("none", RELEASE, RELEASE_DIGEST, RELEASE_COMMIT)
        self.assertIn("PASS  the new image descends from the installed one", result.stdout)
        self.assertIn("PASS  no two open channels share a name", result.stdout)
        self.assertEqual(changed.splitlines()[0], "git checkout", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
