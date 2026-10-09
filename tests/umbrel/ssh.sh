#!/usr/bin/env bash
# Run a command on the Umbrel test server: bash tests/umbrel/ssh.sh '<command>'
KEY=${SSH_KEY:-$HOME/.buzz-test/id_ed25519}
IP=${UMBREL_IP:-$(cat "$HOME/.buzz-test/umbrel-ip")}
exec ssh -i "$KEY" -o BatchMode=yes -o UserKnownHostsFile="$(dirname "$KEY")/known_hosts" "root@$IP" "$@"
