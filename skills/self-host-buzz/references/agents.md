# Agents: instructions, harness, staying on, and your own server

Read "What an agent can touch" in [security.md](security.md) first. Everything here works inside
those limits: Buzz 1.0 starts a local agent with no sandbox and no approval prompts.

An agent made in Buzz answers its owner. The
[owner's mentions and direct messages](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/features/agents/owner-attestation.ts#L138-L150)
start its work, and so does a message that carries the owner's ownership proof. Other members
can't start it. A helper that answers every member is a program of your own: see "Run an agent on
your own server".

Decide who an agent works for before setting it up. That settles where it runs, who can ask it for
things, and which channels it belongs in:

- **For you.** Make it in Buzz, on a computer that stays on with Buzz open ("Keep an agent
  answering"). It gets in through your membership and takes requests only from you.
- **For your team.** A program you run on your own server, with its own key added as a member, that
  answers the people you list ("Run an agent on your own server"). It belongs in your team's
  channels.
- **For the public.** In an open community, the same kind of program, on a machine with nothing
  private on it, that answers anyone. It belongs in open channels only (security.md, Give each
  audience its own agent).

## Tell an agent its job

Buzz 1.0 takes an agent's instructions in **Instructions**: in Create agent (Agents, then Create
your first agent, or New agent and Create a new agent), and later on the agent's Identity tab. The
field is optional. [Block's support page](https://buzz.xyz/support) says what belongs there: what
you want delivered, who it is for, which files or links matter, what needs your approval, and a
request that the agent say what it changed and how it checked. It also says to keep passwords and
private keys out. Instructions shape how the agent answers. They don't give it tools, logins or
permissions.

Five sentences cover it. Change the names:

```text
You help the Riverbend Tool Library volunteers in this community.
Answer questions about opening hours and loans from the files in this workspace.
Ask me before you change or delete a file.
When you finish a task, say what you changed and how you checked it.
Never post passwords, keys or tokens.
```

Leave out how to behave in a channel. Buzz gives every agent its own rules before yours
([base_prompt.md](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/features/agent-harness/base_prompt.md#L10)):
only a mention or a direct message asks it for something, it replies in the thread and in the
channel where it was asked, it keeps messages to the channel brief, and it stays silent when it has
nothing to add. The model's provider receives the instructions with each request.

## Pick a harness and model

The harness is the agent program Buzz runs. Block's
[README](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/README.md#L74-L80)
lists four, and neither it nor Block's help and support pages recommend one over another:

| Harness | You need | Runs on |
|---|---|---|
| Claude | A Claude account | macOS, Linux |
| Codex | A ChatGPT or OpenAI account | macOS, Linux |
| Goose | A model provider and its key, or a model on your own computer | macOS, Linux, Windows |
| Pi | Node.js 22.19 or later, a provider's API key, and Pi turned on in Settings, Plugins | macOS, Linux, Windows |

Pick the one your team already has an account for and has approved: the agent sends what it reads
to that provider. Leave Model and Thinking on their defaults until there is a reason to change
them. Each agent keeps its own.

## Keep an agent answering

A local agent answers only while Buzz is open on its computer and that computer is awake
([README](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/README.md#L82-L85)).
To have one answer all day, run it on a computer that stays on, with Buzz open there. That is also
the machine of its own that security.md asks for. Read from Block's source, not tested on a second
computer:

1. **Install Buzz on the computer that stays on.** Buzz is a desktop app, for macOS, Linux and
   Windows. Claude and Codex agents need macOS or Linux.
2. **Sign in there as yourself.** Use the copy of your key you saved: Other options, the
   community's address, Continue, then Use an existing key. An agent answers its owner, so it has
   to be the same identity. That computer then holds your key, as your laptop does.
3. **Create the agent on that computer.** Buzz keeps an agent's key on the computer it was
   created on, so that is where it runs. Your other computers list it as
   [On another device](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/agents/AgentsPage.tsx#L155-L156).
4. **Keep it awake.** On a Mac, set Settings, Agent setup, Agent behavior, Keep this Mac awake to
   Always ([its options](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/app/AgentSettings.tsx#L28-L32)
   are Off, While agents work and Always). Closing a laptop's lid still puts it to sleep. The
   setting is on Macs only: on Linux or Windows, turn off sleep in the system's own settings.

**An agent Block hosts.** Block calls these remote agents. They run on Block's machines through
Builderlab, and [Block's support page](https://buzz.xyz/support) says the paid ones are available
in the United States only. Not tested with a self-hosted community.

**A program on your own server**, with no Buzz app: the next section.

## Run an agent on your own server

Buzz 1.0 has no built-in way to do this, but it works. Buzz treats a program as your agent when all
of these hold:

- **Its own key.** Never a person's key.
- **Your proof at every sign-in.** The relay then lets it in through your membership. Without the
  proof, its key has to be added as a member.
- **Your proof on its profile.** This is the agent mark. Buzz on desktop and on phones reads the
  proof tag on its profile (kind 0) as an agent, names you as its owner, and wakes it for a direct
  message. Without the mark, it shows as a person.
- **`"is_agent": true` in its profile, if you like.** Next to your proof it adds nothing Buzz reads
  today. For a helper with no proof it is the mark Buzz on desktop reads; phones read an agent
  profile instead ("A shared helper needs no proof", below).
- **A seat in each channel.** It joins an open channel by itself. A member adds it to a private
  one, with the bot role.
- **It listens for its mentions.** It subscribes to messages that tag its key, and replies in the
  thread with your proof tag.

Block ships the two pieces it takes: Settings, Security, Authorize external identity, which
[makes an ownership proof for a program that holds its own agent key](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/buzz-help.md#L130-L137),
and the `buzz` command line. Tested on 2026-11-12 on a local Compose relay with this guide's three
access settings, using the `buzz` that ships inside Buzz 1.0: an agent with a key of its own and a
proof from a member signed in, published its profile, joined a channel, read a mention and
replied, and Buzz showed it as that member's agent. The proof in the test was made with Buzz's
formula from a test key, not in Buzz's dialog.

1. **Get the `buzz` command.** It ships inside Buzz 1.0
   (`/Applications/Buzz.app/Contents/Resources/bin/buzz` on a Mac). For a Linux server, Block's
   rolling [`sprig-latest` release](https://github.com/block/buzz/releases/tag/sprig-latest) has a
   ready-made program that works as `buzz` and as `buzz-acp`, with no version number. To match the
   relay this guide installs, build the pinned commit from Block's source instead, with
   `cargo build --release -p buzz-cli` (not tested).
2. **Make a key for the agent, on its server.** Each agent gets its own. Never use a person's key.

   ```bash
   python3 $SKILL/scripts/new-identity.py --out ~/helper-agent.key
   python3 $SKILL/scripts/npub-to-hex.py <the npub it printed>
   ```

3. **The owner makes the proof**, in their own Buzz: Settings, Security, Authorize external
   identity. They paste the agent's public key as hex, choose Authorize identity, confirm with
   Authorize this key, then Copy ownership proof. The proof is a tag,
   `["auth", "<owner's public key>", "", "<owner's signature>"]`. It isn't a secret, and it is
   useless without the agent's key.
4. **Tell `buzz` who it is**, on the server:

   ```bash
   export BUZZ_RELAY_URL=$ORIGIN
   export BUZZ_PRIVATE_KEY="$(cat ~/helper-agent.key)"
   export BUZZ_AUTH_TAG='<the proof the owner copied>'
   ```

5. **Publish its profile.** This is the step that puts the agent mark on it: with `BUZZ_AUTH_TAG`
   set, `buzz` adds your proof to the profile. It writes only the name, picture, about and nip05,
   so it can't add `"is_agent"`.

   ```bash
   buzz users set-profile --name "Helper"
   ```

6. **Put it in a channel.** It joins an open channel by itself. A private channel's owner or admin
   adds it: `buzz channels add-member --channel <channel id> --pubkey <agent hex> --role bot`.

   ```bash
   buzz channels join --channel <channel id>
   ```

7. **Listen, then answer.** A program checks for mentions again and again, or keeps a live
   subscription ("The messages" below).

   ```bash
   buzz feed get --types mentions --since <unix time of the last check>
   buzz messages send --channel <channel id> --reply-to <message id> --content "On it."
   ```

**Why the proof matters.** The relay lets the agent in through its owner's membership only when
the sign-in carries the proof
([the check](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-relay/src/api/mod.rs#L259-L330)),
every time: in the test, the same key without it was refused a moment after it had been let in.
On its profile, the proof is the agent mark every part of Buzz reads: Buzz on desktop
([profiles.ts](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/features/relay/profiles.ts#L37-L45)),
Buzz on phones
([the phone app's source](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/mobile/lib/features/activity/activity_page/inbox_row.dart#L79-L81))
and Block's own agent program
([pool.rs](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-acp/src/pool.rs#L4260-L4269)).
Buzz on desktop also reads `"is_agent": true`
([profiles.ts](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/features/relay/profiles.ts#L74-L76));
the other two don't, and Buzz never sets it on its own agents. Buzz 1.0.5 reads both the same
way. A marked agent gets a robot and a rounded-square picture, and its profile shows Managed by
and the owner. Buzz on desktop tags an agent in a one-to-one direct message
[only when its profile is marked](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/features/relay/messages.ts#L91-L106),
and a program listening for mentions hears only what is tagged. Buzz on phones
[tags everyone in a direct message](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/mobile/lib/features/channels/message_mention_pubkeys.dart#L3-L18).
A bot added as a member with no proof on its profile shows as a person, and a direct message from
Buzz on desktop never wakes it. Seen in the test.

**The proof can't be taken back.** It has no expiry, and
[Block's spec](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/nips/NIP-OA.md#L94-L99)
has no way to revoke one. It isn't tied to one community either. Whoever holds the agent's key and
the proof can act as the owner's agent, and the owner's own Buzz agents take requests from it:
[Buzz's dialog says](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/app/ExternalIdentityAuthorization.tsx#L157-L158)
it can direct them to run commands as the owner. Keep the agent's key on its server and nowhere
else, and make a proof only for a key you made. If the key leaks, ban it (operations.md, ban
someone): a ban on an agent's key
[blocks it](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-relay/src/handlers/auth.rs#L60-L72)
(not tested). Removing the owner from the community cut off all of the owner's agents in the test.

**Who it answers** is up to the program. Block's own, `buzz-acp` in
[its relay's source](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-acp/README.md#L143-L181),
listens for mentions and hands them to Goose, Codex or Claude. It answers only its owner unless
started with `--respond-to anyone` or an allowlist, and direct messages only from its owner in any
case. The choices are `owner-only`, the default, `allowlist`, `anyone` and `nobody`. Without the
proof, or `--agent-owner`, it has no owner, so by default it answers nobody; with `anyone` it still
answers anyone's mentions in channels. It takes a `ws://` or `wss://` relay address, not
`https://`. Not tested.

**A shared helper needs no proof.** An agent that answers everyone reads requests from anyone, so
keep your proof out of it. Add its key as a member (operations.md, add a member), and have its own
client publish its profile with `"is_agent": true` in the profile's content. Buzz shows it as an
agent, with no owner, and nothing it does acts for you. Seen in the test. The `buzz` command has no
option for that field. Buzz on phones doesn't read the flag. It shows the helper as an agent once
the helper publishes an agent profile
([the phone's agent list](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/mobile/lib/shared/mentions/agent_identity_provider.dart#L80-L90)),
and in any channel where a member added it with the bot role
([the phone app's source](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/mobile/lib/shared/mentions/agent_identity_provider.dart#L345-L351)).
`buzz channels set-add-policy --policy anyone` publishes that profile, and lets any member add the
helper to a channel.

## The messages

For a client of your own. The test of 2026-11-12 sent each of these. `PROOF` is the tag from
step 3.

| Step | Send |
|---|---|
| Sign in | The relay sends `["AUTH", "<challenge>"]`. Answer `["AUTH", event]` with a kind 22242 event made within a minute, whose tags are `["relay", "wss://<host>"]`, `["challenge", "<challenge>"]` and `PROOF`. |
| Profile | A kind 0 event with `PROOF` in its tags and `{"name": "Helper", "is_agent": true}` as its content. `PROOF` is the agent mark; `is_agent` is optional. Send it again with `PROOF` whenever the profile changes. |
| Join | A kind 9021 event with `["h", "<channel id>"]`, for an open channel. |
| Listen | `["REQ", "ch", {"kinds": [9], "#h": ["<channel id>"], "#p": ["<agent hex>"]}]` for mentions, and `{"kinds": [44100, 44101], "#p": ["<agent hex>"]}` to hear that it was added to a channel or removed. |
| Reply | A kind 9 event with `["h", "<channel id>"]`, `["e", "<message id>", "", "reply"]` and `PROOF`. |

A mention arrives as a kind 9 event with `["p", "<agent hex>"]`. Act only on one whose author is
the owner, unless the program is meant to answer others. Typing is a kind 20002 event with the
same `h` and `e` tags. The relay accepted a reply without `PROOF`, but the owner's Buzz agents
treat a message as their owner's only when it carries it.

## When it shows as a person, or never answers

| Symptom | Cause and fix |
|---|---|
| It shows as a person | Its newest profile has no proof. Publish the profile again with `BUZZ_AUTH_TAG` set. A later save without it removes the mark, as the test showed: `buzz users set-profile` takes its tags only from `BUZZ_AUTH_TAG`, and keeps only the name, picture, about and nip05, so it also drops `"is_agent"`. |
| `relay_membership_required`, or `restricted: not a relay member` | The proof wasn't sent, its owner isn't a member, or the relay has `BUZZ_ALLOW_NIP_OA_AUTH` off. |
| It never answers a direct message | Buzz on desktop tags an agent in a direct message only when its profile is marked; phones tag everyone. Fix the profile. A program that reads its direct-message channel without the `#p` filter sees every message there. |
| It stopped hearing a channel | The relay closes its subscription when it is removed from a channel (`restricted: channel access revoked`). Subscribe again when the 44100 notice arrives. |
| `buzz-acp` answers nobody | It answers only its owner, and learns who that is from the proof in `BUZZ_AUTH_TAG`, or from `--agent-owner`. |
