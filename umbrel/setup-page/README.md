# Setup page for the Buzz Relay Umbrel app

The page an owner uses to set up and run their community on umbrelOS: their public ID, how members
reach the Umbrel, the community's address, and checks. One Python file, standard library only.

- `setup.py`: the page.
- `Dockerfile`: the image `ghcr.io/beige-coffee/buzz-umbrel-setup`, on the official Python image,
  running as user 1000.

## Releases

Push a tag `umbrel-setup-vX.Y.Z`. The workflow
[`umbrel-setup-page.yml`](../../.github/workflows/umbrel-setup-page.yml) runs the page's tests, builds
linux/amd64 and linux/arm64, publishes `X.Y.Z` and attests its build provenance. The Umbrel package,
[`umbrel/buzz/docker-compose.yml`](../buzz/docker-compose.yml), pins that tag by digest.

To check an image came from this repo:

```sh
gh attestation verify oci://ghcr.io/beige-coffee/buzz-umbrel-setup:X.Y.Z --owner Beige-Coffee
```

## Tests

These need no Docker:

```sh
python3 tests/umbrel/local/render.py       # every state of the page
python3 tests/umbrel/local/security.py     # its checks and limits, and the package's scripts
python3 tests/umbrel/local/cloudflare.py   # Cloudflare's sign-in, with a stand-in cloudflared
python3 tests/umbrel/local/preview.py 8711 setup   # a preview with mocked states
```

The end-to-end tests on umbrelOS are in [`docs/umbrel.md`](../../docs/umbrel.md).
