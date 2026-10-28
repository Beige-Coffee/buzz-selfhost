#!/usr/bin/env bash
# Stops the local run and deletes its containers, network and volumes: all of its data.
set -euo pipefail
cd "$(dirname "$0")/run"
DOCKER_CONFIG=$PWD/dockercfg docker compose -p buzzlocal --env-file .env -f compose.yml down -v --remove-orphans
