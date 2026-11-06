#!/usr/bin/env python3
"""Print the newest relay image tag: the newest commit on block/buzz main that has an image.

Usage: python3 pick-tag.py

Run it only when the user asks for the newest image. The skill installs and upgrades to the image
it recommends (tested-image in SKILL.md's metadata); it hasn't run a newer one.

Not every commit on main gets an image (commits that only touch the desktop app don't), so this
walks the last 30 commits and asks ghcr.io which one has `ghcr.io/block/buzz:sha-<7>`.
Needs only python3 and internet access. Prints a tag like `sha-1a2b3c4`, and says on stderr
whether it's the one the skill recommends.
"""
import json
import os
import sys
import urllib.error
import urllib.request

ACCEPT = ",".join([
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
])


def get(url, **kw):
    return urllib.request.urlopen(urllib.request.Request(url, **kw), timeout=20)


def recommended():
    """The tag in SKILL.md's metadata, next to this script's folder, or None."""
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "SKILL.md")
    try:
        with open(path) as f:
            for line in f:
                if line.startswith("  tested-image:"):
                    return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return None


def main():
    token = json.load(get("https://ghcr.io/token?scope=repository:block/buzz:pull"))["token"]
    try:
        commits = json.load(get("https://api.github.com/repos/block/buzz/commits?sha=main&per_page=30"))
    except urllib.error.HTTPError as e:
        if e.code == 403:
            sys.exit("GitHub's rate limit (60 calls an hour without a token): wait, or use the image this skill recommends (tested-image in SKILL.md's metadata)")
        raise
    for c in commits:
        tag = "sha-" + c["sha"][:7]
        try:
            get(f"https://ghcr.io/v2/block/buzz/manifests/{tag}", method="HEAD",
                headers={"Authorization": f"Bearer {token}", "Accept": ACCEPT})
        except urllib.error.HTTPError as e:
            if e.code == 404:
                continue
            raise
        print(tag)
        if tag == recommended():
            print(f"{tag} is the newest image, and the one this skill recommends.", file=sys.stderr)
        else:
            print(f"{tag} is the newest image, which this skill hasn't run. The image it recommends is "
                  "tested-image in SKILL.md's metadata.", file=sys.stderr)
        return
    sys.exit("none of the last 30 commits has an image: use the image this skill recommends (tested-image in SKILL.md's metadata)")


if __name__ == "__main__":
    main()
