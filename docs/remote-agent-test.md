# An agent on your own server: the test of 2026-11-12

What [agents.md](../skills/self-host-buzz/references/agents.md) and the Agents answers in Running
your relay rest on, beyond Block's source.

**Setup.** A local Compose relay (`ghcr.io/block/buzz:sha-e8781ca`, older than the guide's 0.3.0
pin; the NIP-OA code is the same in both) with the three access settings the bundle and the chart
write: `BUZZ_REQUIRE_AUTH_TOKEN=true`, `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true` and
`BUZZ_ALLOW_NIP_OA_AUTH=true`. The clients were the `buzz` command that ships inside the Buzz 1.0
app (a preview build newer than 1.0.0) and a small raw WebSocket client. All keys were made for the
test and deleted after it. The ownership proof was computed with Buzz's own formula (a BIP-340
signature by the owner over `SHA-256("nostr:agent-auth:<agent hex>:")`, `src-tauri/src/identity.rs`),
checked against BIP-340's test vector, not made in Buzz's Authorize external identity dialog.

| Case | Result |
|---|---|
| A key nobody added, no proof | `relay error 403: relay_membership_required` |
| The agent's key with a proof, its owner not a member | refused the same way |
| The same, owner a member | admitted |
| The same key without the proof, right after | refused again: the proof is needed at every sign-in |
| The proof presented by a different key | the `buzz` command refuses before sending (signature check) |
| `buzz users set-profile` with `BUZZ_AUTH_TAG` | the stored profile (kind 0) carries `["auth", owner, "", signature]` |
| A private channel | joining and posting refused until a member added the agent with `--role bot` |
| A mention, `buzz` command | the owner's kind 9 carries `["p", agent]`; `buzz feed get --types mentions` returns it; the reply carries `h`, `e … reply` and the proof tag |
| An open channel | `buzz channels join` accepted (kind 9021) |
| Raw sign-in (kind 22242) without the proof | `restricted: not a relay member` |
| Raw sign-in with the proof tag, then a profile, `REQ` for mentions and for kinds 44100/44101 | accepted; live events arrive |
| The owner removes the agent from a channel, then adds it back | the relay closes its subscription (`restricted: channel access revoked`) and sends 44101; adding back sends 44100; the agent must subscribe again |
| Typing (kind 20002), a reply with the proof tag, a reply without | all accepted |
| A message that does not tag the agent | does not reach a `#p` subscription |
| A direct message with no mention, subscribed with `#p` and without | arrives only on the subscription without `#p` |
| The profile saved again without the proof tag, then with it | the mark goes, then comes back |
| A bot added as a member, profile with `"is_agent": true` and no proof | accepted |
| The guide's own steps: a key from `new-identity.py --out`, hex from `npub-to-hex.py`, the three `export` lines, `users set-profile`, `channels join`, `feed get`, `messages send --reply-to` | every command accepted; the mention was returned |
| Cleanup: the owner removed from the community | every test key refused afterwards, both agents that still held a valid proof included |

**Seen in the owner's Buzz**, in the test's open channel, opened read-only from search and not
joined: the agent with the proof showed a robot before its name and a rounded-square picture, and
its profile showed Managed by with the owner's key. The bot with only `"is_agent": true` showed the
same robot and picture, and no Managed by. The bot with neither showed a round picture and no
robot: a person. A mention of an agent with the proof showed the robot in its chip.

**Not tested.** A ban on an agent let in through its owner: it needed a test key made an admin of
the community, which the test's approval did not cover. Block's source says a ban on the agent's
key blocks it, and so does a ban on its owner (`crates/buzz-relay/src/handlers/auth.rs`). Also not
tested: the Authorize external identity dialog itself (it needs the owner's own click), Block's
`buzz-acp`, a model behind the agent, a Builderlab-hosted agent with a self-hosted community, and
Buzz on a second computer.

**Cleanup.** Both test channels deleted by their creator, the test direct message hidden for both
sides, all five test identities archived by themselves (NIP-IA, reason `retired`), and the three
test members removed. The community's member count was back where it started.
