#!/usr/bin/env python3
"""Offline safety checks. Stub all server commands; never contact a relay."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent / "skills/self-host-buzz/SKILL.md"
CANDIDATE = "sha-e5dee91"
DIGEST = "sha256:d4777e9163de0861c3f02ea9e67632b0afadc6d6ebac2cf4c09c00f1317f4a6d"


class ImageSelection(unittest.TestCase):
    def resolve(self, tag, digest=""):
        return subprocess.run(
            ["/bin/bash", "-c", 'source "$1"; expected_image_digest "$2" "$3" "$4"',
             "test", str(HERE / "lib/image.sh"), tag, digest, str(SKILL)],
            text=True, capture_output=True, check=False,
        )

    def test_recommended_digest_comes_from_skill(self):
        metadata = dict(line.strip().split(": ", 1) for line in SKILL.read_text().splitlines()
                        if line.startswith("  tested-"))
        result = self.resolve(metadata["tested-image"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), metadata["tested-digest"])
        self.assertNotEqual(self.resolve(metadata["tested-image"], "sha256:" + "0" * 64).returncode, 0)

    def test_candidate_requires_exact_digest(self):
        self.assertNotEqual(self.resolve(CANDIDATE).returncode, 0)
        result = self.resolve(CANDIDATE, DIGEST)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), DIGEST)
        for malformed in ("sha256:123", "sha256:" + "G" * 64, DIGEST + ";true"):
            self.assertNotEqual(self.resolve(CANDIDATE, malformed).returncode, 0)
        self.assertNotEqual(self.resolve("sha-1234567;true", DIGEST).returncode, 0)

    def test_each_driver_rejects_unknown_digest_before_server_work(self):
        env = dict(os.environ, NO_LOG="1")
        env.pop("EXPECTED_DIGEST", None)
        for script, args in (
            ("smoke.sh", ["example.invalid", "example.invalid", CANDIDATE]),
            ("smoke-private.sh", ["example.invalid", "test", CANDIDATE]),
            ("smoke-k8s.sh", ["example.invalid", CANDIDATE]),
            ("smoke-local.sh", [CANDIDATE]),
        ):
            with self.subTest(script=script):
                result = subprocess.run(["/bin/bash", str(HERE / script), *args],
                                        env=env, text=True, capture_output=True, check=False)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertIn("EXPECTED_DIGEST", result.stderr)
                self.assertNotIn("Identities", result.stdout)


class UpgradeGuard(unittest.TestCase):
    def test_remote_failure_stops_each_driver(self):
        for script in ("smoke.sh", "smoke-private.sh"):
            with self.subTest(script=script), tempfile.TemporaryDirectory() as temp:
                contents = (HERE / script).read_text()
                start = contents.index("server() {\n")
                end = contents.index("\n}\n", start) + 3
                harness = """set -uo pipefail
TAG=sha-e5dee91
UPGRADE_TAG=
EXPECTED_DIGEST=$1
TMP=$2
IP=example.invalid
SSH_OPTS=(-o BatchMode=yes)
PASS=0
FAIL=0
ssh() { echo 'FAIL  backup failed'; return 5; }
""" + contents[start:end] + "server backup\necho UNEXPECTED_CONTINUATION\n"
                result = subprocess.run(["/bin/bash", "-c", harness, "test", DIGEST, temp],
                                        text=True, capture_output=True, check=False)
                self.assertEqual(result.returncode, 5, result.stdout + result.stderr)
                self.assertIn("no later phases", result.stdout)
                self.assertNotIn("UNEXPECTED_CONTINUATION", result.stdout)

    def test_failed_prerequisites_never_change_bundle_or_run_upgrade(self):
        for failure in ("fetch", "ancestry", "sql", "duplicate"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temp:
                base = Path(temp)
                bundle = base / "bundle"
                bundle.mkdir()
                (bundle / ".env").write_text("BUZZ_IMAGE=ghcr.io/block/buzz:sha-744f394\n")
                (bundle / "run.sh").write_text('#!/bin/sh\necho upgrade >> "$MUTATIONS"\n')
                (bundle / "run.sh").chmod(0o755)
                stub = base / "bin"
                stub.mkdir()
                commands = {
                    "git": '''#!/bin/sh
case "$1" in
  fetch) [ "$FAILURE" != fetch ] ;;
  merge-base) [ "$FAILURE" != ancestry ] ;;
  *) echo "git $1" >> "$MUTATIONS"; exit 42 ;;
esac
''',
                    "docker": '''#!/bin/sh
case "$*" in
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
                           EXPECTED_TAG=CANDIDATE, EXPECTED_DIGEST=DIGEST)
                result = subprocess.run(["/bin/bash", str(target), "upgrade", CANDIDATE],
                                        env=env, text=True, capture_output=True, check=False)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("stopping", result.stdout)
                self.assertFalse(marker.exists(), result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
