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

**Who reads which mark, from Block's source (checked again on 2026-11-17, Buzz 1.0.5).** Buzz on
desktop marks an agent when its newest profile has a four-part `auth` tag, or `is_agent` or
`isAgent` set to true in its content (`src/features/relay/profiles.ts`), and never writes either
field for its own agents, which carry the tag. The phone app, in block/buzz's `mobile/`, marks a
sender as an agent from a verified owner on its profile, from the relay's agent directory, or from
the bot role in a channel; it never reads `is_agent` (`inbox_row.dart`,
`agent_identity_provider.dart`). Block's `buzz-acp` checks only for the `auth` tag
(`pool.rs`, `profile_event_is_agent`). `buzz users set-profile` writes only `display_name`, `name`,
`picture`, `about` and `nip05` (`buzz-sdk` `build_profile`) and takes its tags from
`BUZZ_AUTH_TAG`, so a later save drops `is_agent`. The proof tag together with `is_agent` was not
sent in the test; read from the source, Buzz on desktop shows both as an agent with its owner.

# The test of 2026-11-19: one prompt, Buzz's own dialog, a cloud server

What the rewritten "Run an agent on your own server" (agents.md) and its answer on the site rest on.

**Setup.** A test community on a DigitalOcean droplet: relay 0.3.0 (`ghcr.io/block/buzz:0.3.0`,
Compose, this guide's access settings). Agents on two other droplets (Ubuntu 24.04, x86_64; the
last one 1 vCPU, 1 GB). Buzz 1.0.5 on a Mac made every ownership proof in Settings, Security,
Authorize external identity, signed by a real member's identity; each proof was checked offline
against BIP-340 before use. Sprig from `sprig-latest` (`9bcb3e4` in the morning, `729cb10` by the
afternoon: the rolling build moved during the test). Model: `anthropic/claude-haiku-4.5` on
OpenRouter, $0.07 in all. The coding agent was a fresh `claude -p` with only SSH, given the prompt
and, at its two stops, the proof and "I replied". Every agent key was deleted at the end, with the
droplets.

| Case | Result |
|---|---|
| A key with no proof | `relay error 403: relay_membership_required` |
| The key with a proof from Buzz's dialog | admitted; `buzz-acp` logs `owner resolved from BUZZ_AUTH_TAG`; the relay records the owner |
| `buzz users set-profile` with `BUZZ_AUTH_TAG` set | the profile carries the proof; Buzz 1.0.5 shows the agent with the robot and "Agent" |
| `BUZZ_RELAY_URL` as `https://` or `wss://` for the `buzz` command | both work; `buzz-acp` was given `wss://` |
| `BUZZ_ALLOW_NIP_OA_AUTH=false`, proof only | `relay_membership_required` |
| The same, then `./run.sh add-member <agent hex>` | admitted, but the relay records no owner (`users.agent_owner_pubkey` empty; block/buzz#4223) |
| New message to the agent from Buzz 1.0.5 | refused: "A selected agent is no longer available" (NewMessage.tsx accepts only agents the viewer's Buzz runs or lists) |
| The agent opens a direct message itself (`buzz dms open`) and posts | the owner sees it under Direct messages; `buzz-acp` subscribes to it on its own; the owner's reply wakes the agent |
| `BUZZ_AGENT_REQUIRE_REPLY` unset | the turn ran and nothing was posted: the model answered in its own output |
| Set to 1 | reply posted in about 10 s |
| A private channel: the owner mentions the agent, Buzz asks "Mention people outside this channel?", Invite | agent added; `buzz-acp` subscribes on its own; replied in the thread |
| No instructions | asked a question that used its name, it answered "I'm Claude, not Scout" |
| `BUZZ_ACP_SYSTEM_PROMPT_FILE` with its name and job | "I'm Scout, your server agent. This server runs Ubuntu 24.04.5 LTS." |
| Loading `agent.env` in a shell (`. agent.env`) | the proof's quotes are stripped. The `buzz` command repairs that form (`normalize_auth_tag_input`), `buzz-acp` doesn't; systemd's `EnvironmentFile` keeps them |
| `sudo -u buzzagent sh -c 'buzz …'` | `buzz: not found` (sudo resets the path) |
| Sprig's tarball | its folder is mode 700, so another user gets "Permission denied" until `chmod 755` |
| Key with `openssl ecparam -name secp256k1` and DER slicing | matched a pure-Python derivation on 150 of 150 random keys |
| The final prompt, cold, three times as it was refined | the last run, of the text on the site, needed nothing beyond the proof and "I replied": 31 s to the key, 2 min 15 s to "online", answered in the DM |

## The same day, later: the prompt for an agent that already runs

The prompt was rewritten for the agent itself: no SSH, no model choice, optional instructions. It
names `buzz-acp`'s ACP launch settings and lets the agent fill in its own.

**Setup.** A fresh droplet (Ubuntu 24.04, 1 vCPU, 2 GB) with goose 1.60.1 installed from Block's
script and set up with OpenRouter (`anthropic/claude-sonnet-4.5`), standing in for someone's
existing agent. The prompt went to `goose run` on that machine. The bench relay had members'
agents switched off (`BUZZ_ALLOW_NIP_OA_AUTH=false`), as a community that approves agents would.

| Case | Result |
|---|---|
| goose given the prompt | installed Sprig, made its key, wrote its settings file, ran `buzz-acp` as a systemd service with `goose acp`, and stopped at each Stop |
| Proof only, members' agents off | `restricted: not a relay member`; goose stopped and asked for an admin, as the prompt says |
| `./run.sh add-member <agent hex>`, "the admin added you" | goose restarted the service, published its profile with the proof, opened the DM, posted "Pilot is online." |
| The owner's reply, first version of the prompt | goose answered in its own output only: `buzz` wasn't on the PATH `buzz-acp` gives it, and it didn't post with `buzz messages send` although Buzz's briefing (delivered as its first message) says it must |
| `buzz` linked into `/usr/local/bin` and the line "People in Buzz see only what you post with the buzz command, so answer every message with buzz messages send." in its instructions | it answered in the DM |
| Both fixes in the prompt, cold, on a rebuilt server | needed only the proof, "the admin added you" and the reply: "My name is Pilot. This server has 1.9 GiB of total memory, with about 1.5 GiB currently available." |
| The runner's progress events for the owner (kind 24200) on an agent admitted through the member list | refused with 403, logged as a warning; replies unaffected. The relay records no owner for such an agent (block/buzz#4223) |
| goose loaded the settings file in a shell to run `buzz` | the profile still carried the proof: the `buzz` command repairs a proof whose quotes a shell stripped; `buzz-acp` does not |
