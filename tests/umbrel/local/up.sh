#!/usr/bin/env bash
# Runs the package's containers on this machine's Docker, from make.py's compose project, with the
# data volumes owned by 1000:1000 as umbrelOS prepares an app's data folder. The setup page is then
# at http://127.0.0.1:8090, password local-test-only. down.sh removes it all, data included.
# PYTHON names a Python with PyYAML, if python3 has none.
set -euo pipefail
L=$(cd "$(dirname "$0")" && pwd)
"${PYTHON:-python3}" "$L/make.py"
cd "$L/run"
# Docker Desktop's credential helper can hang pulls, and every image here is public: an empty Docker
# config, with the Compose plugin linked in
mkdir -p dockercfg/cli-plugins
if [ ! -x dockercfg/cli-plugins/docker-compose ]; then
  ln -sf "$(env -u DOCKER_CONFIG docker info --format '{{range .ClientInfo.Plugins}}{{if eq .Name "compose"}}{{.Path}}{{end}}{{end}}')" \
    dockercfg/cli-plugins/docker-compose
fi
export DOCKER_CONFIG=$PWD/dockercfg
C=(docker compose -p buzzlocal --env-file .env -f compose.yml)
"${C[@]}" pull -q
args=()
for v in git postgres redis secrets settings silo tailscale; do
  docker volume create "buzzlocal_buzz-$v" > /dev/null
  args+=(-v "buzzlocal_buzz-$v:/v/$v")
done
docker run --rm "${args[@]}" --entrypoint chown python:3.13.16-alpine3.24 -R 1000:1000 /v
"${C[@]}" up -d 2>&1 | tail -3
"${C[@]}" ps --format '{{.Service}} {{.Status}}'
