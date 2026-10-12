#!/usr/bin/env bash
# Run umbrelOS in Docker on the test server, copy umbrel/buzz into its App Store, and install it
# through Umbrel. Usage: bash tests/umbrel/install.sh [umbrelos-version]   (default 2.0.0)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
VERSION=${1:-2.0.0}
C=${UMBREL_CONTAINER:-umbrelos-test}
COPYFILE_DISABLE=1 tar -C "$HERE/../../umbrel" -czf - buzz |
  bash "$HERE/ssh.sh" 'rm -rf /root/buzz-pkg && mkdir -p /root/buzz-pkg && tar -C /root/buzz-pkg -xzf - 2>/dev/null'
# Not VERSION: Docker's install script reads that name as the Docker version to install.
bash "$HERE/ssh.sh" "UMBREL_VERSION=$VERSION C=$C bash -s" <<'REMOTE'
set -euo pipefail
trap 'echo "install.sh: failed at line $LINENO of the server script" >&2' ERR
cloud-init status --wait > /dev/null
command -v docker > /dev/null || curl -fsSL https://get.docker.com | sh > /tmp/docker-install.log 2>&1
if ! docker inspect "$C" > /dev/null 2>&1; then
  docker pull -q "ghcr.io/getumbrel/umbrelos:$UMBREL_VERSION" > /dev/null
  # Umbrel's own example uses --network host. On a cloud server, umbrelOS's NetworkManager then
  # takes over the server's network card and the server drops off the network. So: Docker's
  # bridge network, with NetworkManager masked inside the container.
  docker create -it --name "$C" --hostname umbrel --privileged \
    --volume "$C:/data" "ghcr.io/getumbrel/umbrelos:$UMBREL_VERSION" /sbin/init > /dev/null
  for unit in NetworkManager.service NetworkManager-wait-online.service; do
    ln -sf /dev/null "/tmp/$unit" && docker cp "/tmp/$unit" "$C:/etc/systemd/system/$unit"
  done
  docker start "$C" > /dev/null
fi
STORE=/home/umbrel/umbrel/app-stores/getumbrel-umbrel-apps-github-53f74447
until docker exec "$C" test -d "$STORE/tailscale" 2> /dev/null; do sleep 5; done
# docker cp can't see /home/umbrel inside the container; tar through docker exec can.
tar -C /root/buzz-pkg -cf - buzz | docker exec -i "$C" sh -c \
  "rm -rf $STORE/buzz && tar -C $STORE -xf - && find $STORE/buzz -name .gitkeep -delete && chown -R 1000:1000 $STORE/buzz"
docker exec "$C" umbreld client apps.install.mutate --appId buzz > /dev/null
docker exec "$C" umbreld client apps.state.query --appId buzz
REMOTE
