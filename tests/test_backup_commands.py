#!/usr/bin/env python3
"""Exercise the guide's actual backup commands using local command stubs only."""

import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import textwrap
import unittest


REPO = Path(os.environ.get("BUZZ_GUIDE_REPO", Path(__file__).resolve().parent.parent))
OPERATIONS = REPO / "skills/self-host-buzz/references/operations.md"
STAMP = "2026-11-11-120000"
EXPORTS = ("buzz.dump", "minio-data.tgz", "git-data.tgz", "buzz-relay-secret.yaml")


def kubernetes_backup_commands():
    """Extract the production Markdown block, not a separate copy of its commands."""
    markdown = OPERATIONS.read_text()
    kubernetes = markdown.split("## Kubernetes\n", 1)[1]
    backup = kubernetes.split("- **Back up**", 1)[1].split("- **Upgrade.**", 1)[0]
    match = re.search(r"^  ```bash\n(.*?)^  ```", backup, re.MULTILINE | re.DOTALL)
    if match is None:
        raise AssertionError("Kubernetes backup code block not found")
    commands = textwrap.dedent(match.group(1))
    # Isolate only the documented destination. Do not change HOME or shell options.
    if "~/buzz-backup" not in commands:
        raise AssertionError("Review the test's isolated backup path after this guide change")
    return commands.replace("~/buzz-backup", '"$BUZZ_TEST_BACKUP_ROOT"')


class KubernetesBackupCommands(unittest.TestCase):
    def run_backup(self, base, fail_export=0, existing=False):
        stub_dir = base / "bin"
        stub_dir.mkdir()
        original_dir = base / "operator-working-directory"
        original_dir.mkdir()
        backup_root = base / "backups"
        backup_dir = backup_root / STAMP
        log = base / "kubectl-calls"
        cwd_result = base / "cwd-after"
        if existing:
            backup_dir.mkdir(parents=True)
            for name in EXPORTS:
                (backup_dir / name).write_text("previous good backup\n")
        (stub_dir / "date").write_text("#!/bin/sh\nprintf '%s\\n' '" + STAMP + "'\n")
        (stub_dir / "kubectl").write_text('''#!/bin/sh
case "$*" in
  *"exec buzz-postgresql-0"*) export_number=1 ;;
  *"exec deploy/buzz-minio"*) export_number=2 ;;
  *"exec deploy/buzz -c relay"*) export_number=3 ;;
  *"get secret buzz-relay"*) export_number=4 ;;
  *) echo 'Unexpected kubectl command' >&2; exit 90 ;;
esac
printf '%s\\n' "$export_number" >> "$BUZZ_TEST_CALL_LOG"
# A failed export may leave nonempty partial data, so size is not proof of success.
printf 'synthetic export %s\\n' "$export_number"
if [ "$export_number" = "$BUZZ_TEST_FAIL_EXPORT" ]; then
  echo 'Synthetic export failure' >&2
  exit 23
fi
''')
        for path in stub_dir.iterdir():
            path.chmod(0o755)
        env = dict(
            os.environ,
            PATH=str(stub_dir) + os.pathsep + os.environ["PATH"],
            BUZZ_TEST_BACKUP_ROOT=str(backup_root),
            BUZZ_TEST_CALL_LOG=str(log),
            BUZZ_TEST_FAIL_EXPORT=str(fail_export),
            BUZZ_TEST_CWD_RESULT=str(cwd_result),
        )
        script = "umask 022\n" + kubernetes_backup_commands() + '''
BUZZ_TEST_BLOCK_STATUS=$?
printf '%s\\n' "$PWD" > "$BUZZ_TEST_CWD_RESULT"
exit "$BUZZ_TEST_BLOCK_STATUS"
'''
        result = subprocess.run(
            ["/bin/bash", "-c", script], cwd=original_dir, env=env,
            text=True, capture_output=True, check=False, timeout=10,
        )
        calls = log.read_text().splitlines() if log.exists() else []
        self.assertEqual(Path(cwd_result.read_text().strip()).resolve(), original_dir.resolve())
        return result, calls, backup_dir

    def test_success_keeps_directory_and_restricts_backup_permissions(self):
        with tempfile.TemporaryDirectory() as temp:
            result, calls, backup_dir = self.run_backup(Path(temp))
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(calls, ["1", "2", "3", "4"])
            self.assertEqual(stat.S_IMODE(backup_dir.stat().st_mode), 0o700)
            self.assertEqual(sorted(p.name for p in backup_dir.iterdir()), sorted(EXPORTS))
            for name in EXPORTS:
                path = backup_dir / name
                self.assertGreater(path.stat().st_size, 0)
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_each_failed_export_stops_later_exports_and_returns_failure(self):
        for fail_export in range(1, 5):
            with self.subTest(export=fail_export), tempfile.TemporaryDirectory() as temp:
                result, calls, backup_dir = self.run_backup(Path(temp), fail_export=fail_export)
                self.assertEqual(result.returncode, 23, result.stdout + result.stderr)
                self.assertEqual(calls, [str(n) for n in range(1, fail_export + 1)])
                # The failed export leaves partial bytes; no later file may be created.
                self.assertGreater((backup_dir / EXPORTS[fail_export - 1]).stat().st_size, 0)
                for name in EXPORTS[fail_export:]:
                    self.assertFalse((backup_dir / name).exists(), name)

    def test_existing_backup_directory_is_refused_without_overwriting(self):
        with tempfile.TemporaryDirectory() as temp:
            result, calls, backup_dir = self.run_backup(Path(temp), existing=True)
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(calls, [])
            for name in EXPORTS:
                self.assertEqual((backup_dir / name).read_text(), "previous good backup\n")


if __name__ == "__main__":
    unittest.main()
