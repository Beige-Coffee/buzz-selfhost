# The owner's checks on a public VPS at relay 0.3.0: Staff, phone pairing, a locked phone

- **When:** 2026-11-12, PST. Server created 13:41, scripted run 13:44 to 13:49, owner changed and
  moderation console turned on 13:55, the owner's checks 16:33 to 16:43, server deleted 16:46.
- **Question:** on a fresh public relay at release 0.3.0, does the Staff screen show for the owner,
  does an iPhone pair with Codes match, and does a notification reach the phone while it is
  locked? These are the three checks the scripted run cannot do.
- **Setup:** one DigitalOcean droplet, Ubuntu 24.04 x86 with 4 GB (s-2vcpu-4gb), in sfo3, at
  `<ip>.sslip.io`. The skill's server mode through `tests/smoke.sh`, which passed 112 of 112
  ([log](2026-11-12-1344-vps-0.3.0.log)) and now turns notifications on with compose.md step 8's
  command. Then, by hand, with the skill's own commands:
  - operations.md, To change the owner: the owner's npub became `RELAY_OWNER_PUBKEY`.
  - compose.md, Moderation console: `BUZZ_ADMIN_HOST=admin.<ip>.sslip.io` and Caddy's route, then
    stop and start.
  - A test member, made on the operator's computer and added with `./run.sh add-member`.
- **Relay version:** 0.3.0, `ghcr.io/block/buzz@sha256:84f34c5b801192665b1a05939518d746f25184babf4d6e927d0de7e12e9c5674`.
- **Apps:** Buzz on the owner's Mac, preview build 0.7.0-preview.270.2 (v1.0.0 plus later
  commits). The iPhone app from the App Store; its version was not recorded.
- **Result:** all three checks passed, as the owner reported them.

  | Check | What the owner reported | What the relay recorded |
  |---|---|---|
  | Staff, as owner | Settings, Moderation showed Reports, Feedback, Communities and Staff. Staff listed him as owner. | The Staff list request, signed by the owner's key, answered 200 at 16:43:20. Three signed probes answered 200. |
  | Pairing | The phone asked for the six digits the desktop showed. He then chose Codes match on the desktop. | The pairing service saw two connections from 16:33:35 to 16:34:26. The phone's lease (kind 30350) arrived at 16:34:31. |
  | Locked phone | Both notifications showed, each with its message text. | Two wakes, each delivered on the first attempt and accepted by Block's gateway. |

  The sends, from the test member:

  | Sent | Message | Relay | Gateway |
  |---|---|---|---|
  | 16:37:43 | (a) A DM, opened with `buzz dms open`, then a plain `buzz messages send` | no match, no wake | no call |
  | 16:37:57 | (a2) The same DM again with `--mention` for the owner, which adds the `p` tag the app puts on its own DMs | matched, wake at 16:37:58 | accepted, in 0.21 s |
  | 16:38:40 | (b) A mention in a new open channel, `push-check`, with the owner added to it | matched, wake at 16:38:42 | accepted, in 0.10 s |

- **Cost:** about $0.11: the server was up 185 minutes at $0.0357 an hour. About two of those
  hours were the operator's computer asleep, not testing.
- **Removed:** the droplet, and the test member's key file. The owner removes the dead community
  from Buzz on his Mac and his iPhone.

## Notes

- **The plain DM sent no wake, and that is the test's doing.** `buzz messages send` puts no `p`
  tag on a message in a DM, and the locked phone had not yet added the new DM to its lease. The
  app tags each recipient on a DM, so (a2) is the send that matches what a person does. The owner
  was asked about two notifications and reported two; whether (a) also showed was not asked.
- **A mention needs the person in the channel.** The first try at (b), in the scripted run's
  channel `smoke`, was refused by the command-line tool before sending: the owner was not a member
  of that channel. The test member then made `push-check`, added the owner and sent (b) there.
- **Reports was not shown to load.** The relay's log holds two requests for the Reports list,
  at 13:58 and 14:08, both without a signature and both answered 401 (`nip98_missing`), and no
  signed request for Reports, Feedback or Communities. The owner saw all four entries under
  Moderation and opened Staff. Whether the other three screens load their data was not checked.
- **The moderation console's steps ran as written.** `admin.<ip>.sslip.io` resolved to the server,
  the relay's info named `https://admin.<ip>.sslip.io` as its admin address, and that address
  answered 401 to an unsigned probe, as compose.md says. `check-relay.sh` passed every line after
  the change, with pairing reachable and push offered.
- **The owner change ran as written.** After the restart, `./run.sh list-members` showed the
  owner's key as `owner` and the scripted run's owner as `admin`.
- **Delivery is still best effort.** Two wakes on one phone, one afternoon. Block names no level
  of service for its gateway, and block/buzz#5206 is still open.

## What the relay recorded

The queries are read-only and never select `push_leases.endpoint_grant` or any event's content,
as in the [2026-10-23 push check](2026-10-23-1641-push-check.md).

```text
== push_leases (endpoint_grant not selected)
 author | generation | active | endpoint_enabled | has_endpoint | max_class |        expires         | subs
 owner  |          1 | t      | t                | t            | default   | 2026-11-22 23:49:10+00 |    1

== push_wake_outbox
 author | lease_generation |  event   |  class  |   state   | attempts |          created_at
 owner  |                1 | 202003e7 | default | delivered |        1 | 2026-11-13 00:37:58.050806+00
 owner  |                1 | ccbb84bc | default | delivered |        1 | 2026-11-13 00:38:41.918508+00

== push_match_queue
(0 rows)

== metrics, on the relay's metrics port inside its container
buzz_push_enabled 1
buzz_push_enqueue_total{result="completed"} 3
buzz_push_match_jobs_total{result="matched"} 2
buzz_push_match_jobs_total{result="unmatched"} 1
buzz_push_wakes_total{result="enqueued"} 2
buzz_push_deliveries_total{outcome="accepted"} 2
buzz_push_gateway_requests_total 2
buzz_push_gateway_request_seconds_sum 0.30409796

== admin API requests in the relay's log, by route and status
      3 /api/admin/v1/probe -> 200       signed by the owner's key
      1 /api/admin/v1/operators -> 200   the Staff list, signed by the owner's key
      2 /api/admin/v1/reports -> 401     no signature (nip98_missing)
      1 /api/admin/v1/probe -> 401       the operator's unsigned check

== pairing service (UTC)
2026-11-13T00:33:35 conn opened conn_id=1 active=1
2026-11-13T00:34:00 conn opened conn_id=2 active=2
2026-11-13T00:34:26 conn closed conn_id=2 active=1
2026-11-13T00:34:26 conn closed conn_id=1 active=0

== check-relay.sh https://<ip>.sslip.io <ip>, after the owner change and the moderation console
PASS  liveness: ok
PASS  relay version 0.3.0
PASS  relay identity (Buzz 1.0 needs it to join)
PASS  channel labels (nip-cl): Buzz 1.0 can start chats
PASS  WebSocket upgrade (what Buzz joins over)
PASS  phone pairing at wss://<ip>.sslip.io/pair
PASS  push capability advertised (delivery not tested)
PASS  Buzz 0.X allowed (CORS; Buzz 1.0 doesn't need it)
PASS  port 3000 on <ip> closed from outside
PASS  port 5000 on <ip> closed from outside
```
