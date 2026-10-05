# Railway: phone pairing

- **When:** 2026-10-05 12:50 PDT
- **Setup:** Block's template (`railway deploy -t buzz-relay-block`), the relay moved to `sha-fd885b5`,
  then railway.md step 6: a `buzz-pair` service from the same image, its own Railway name on port
  5000, and `BUZZ_PAIRING_RELAY_URL` on the relay.
- **Result:** check-relay.sh passed, phone pairing at the pairing service's own name included.
  The first try ran the relay program in `buzz-pair` (`BUZZ_RELAY_PRIVATE_KEY must be set`):
  `railway environment edit --service-config buzz-pair deploy.startCommand …` answered `No changes
  to apply`, by name and by service ID. Setting the start command through Railway's API (the
  dashboard's Custom Start Command does the same) made it run `buzz-pair-relay`, which overrides
  the image's entrypoint. railway.md step 6 asks the user to set it in the dashboard.

## The steps, as the script printed them

```text
block/buzz:main: SUCCESS
relay domain: blockbuzzmain-production-2831.up.railway.app
block/buzz:main: SUCCESS
> Enter a variable BUZZ_PAIR_RELAY_BIND_ADDR=0.0.0.0:5000
> Enter a service name buzz-pair
> Environment production
buzz-pair: SUCCESS
pairing domain: buzz-pair-production-ee61.up.railway.app
Set variables BUZZ_PAIRING_RELAY_URL
block/buzz:main: SUCCESS
== check-relay
PASS  liveness: ok
PASS  relay version 0.2.1
PASS  WebSocket upgrade (what Buzz Desktop joins over)
FAIL  phone pairing at wss://buzz-pair-production-ee61.up.railway.app: HTTP 000
PASS  Buzz Desktop allowed (CORS)
== pairing service log
2026-10-05T19:57:34.311901557Z [ERRO]  event_name="buzz_process_lifecycle" schema_version=1 process_boot_id="52d3a0bf-1224-472c-be36-2ca381836c19" sequence=10 track="startup" phase="process_telemetry" edge="terminal" status="failed" reason="missing" process_started_at_unix_ms=1791230246557 observed_at_unix_ms=1791230246558 process_elapsed_ms=1 phase_elapsed_ms=1
2026-10-05T19:57:34.311907236Z [WARN] BUZZ_REQUIRE_AUTH_TOKEN is false — REST API requests bypass token auth. WebSocket protocol auth is unaffected. Set to true for production. timestamp="2026-10-05T19:57:26.558546Z" target="buzz_relay::config"
2026-10-05T19:57:34.311918695Z [INFO] BUZZ_WEB_DIR=/srv/buzz/web — serving web UI from relay timestamp="2026-10-05T19:57:26.558764Z" target="buzz_relay::config"
2026-10-05T19:57:34.311927980Z [ERRO]  event_name="buzz_process_lifecycle" schema_version=1 process_boot_id="52d3a0bf-1224-472c-be36-2ca381836c19" sequence=7 track="startup" phase="config_load" edge="terminal" status="succeeded" process_started_at_unix_ms=1791230246557 observed_at_unix_ms=1791230246558 process_elapsed_ms=1 phase_elapsed_ms=0
Error: BUZZ_RELAY_PRIVATE_KEY must be set. Run `just bootstrap` for local development or configure a stable 32-byte hex private key.

[exited with code 0]
```

## After setting the start command

```text
buzz-pair-relay listening on 0.0.0.0:5000
PASS  liveness: ok
PASS  relay version 0.2.1
PASS  WebSocket upgrade (what Buzz Desktop joins over)
PASS  phone pairing at wss://buzz-pair-production-ee61.up.railway.app
PASS  Buzz Desktop allowed (CORS)

[exited with code 0]
```
