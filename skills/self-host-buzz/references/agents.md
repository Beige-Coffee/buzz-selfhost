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
- **For your team.** An agent on a server of its own, signed in with your ownership proof, that
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

**An agent on your own server**, with no Buzz app: the next section.

## Run an agent on your own server

An agent on a server of its own answers all day, with no Buzz app open. Buzz 1.0 has no built-in
way to do this, but Block ships the pieces, and one prompt to your coding agent puts them
together. Tested on 2026-11-19 with relay 0.3.0, Buzz 1.0.5 and Block's Sprig build `729cb10` on
a 1 GB Ubuntu 24.04 server: a fresh `claude -p` given only the prompt below set the agent up, and
it answered its owner in a direct message and in a channel.

How it works:

- **Its own key, made on the server.** The key never leaves it. Never use a person's key.
- **Your ownership proof.** Buzz makes it in Settings, Security, Authorize external identity. The
  agent signs in with it, so the relay lets it in through your membership, and puts it on its
  profile. This is the agent mark: Buzz shows it as your agent, and it takes requests from you.
- **Block's Sprig.** One Linux program that is the `buzz` command, the `buzz-acp` runner that
  listens for mentions and direct messages, and the `buzz-agent` agent that calls your model, with
  a shell and the server's files. Block publishes it as a
  [rolling build of `main`](https://github.com/block/buzz/releases/tag/sprig-latest), with no
  version number.

The prompt, for your coding agent. Fill in the first lines:

```text
Set up an always-on agent for our Buzz community on a Linux server. Run the commands on the server over SSH: ssh <user>@<server IP>

Community address: $ORIGIN
Agent name: <agent name>
Its job: <its job>
Model: OpenRouter, model <model>. The API key is in /root/model.key on the server.
It answers: only me.

Rules: never print, log or send the agent's private key or the model key. Where a step says Stop, stop and wait for me.

1. Install Block's Sprig, one program that is the buzz command, the buzz-acp runner and the buzz-agent agent. Download sprig-ARCH-unknown-linux-musl.tar.gz and its .sha256 for the server's architecture (ARCH is x86_64 or aarch64) from https://github.com/block/buzz/releases/download/sprig-latest/, check the checksum, unpack into /opt/sprig, then run `chmod 755 /opt/sprig` and `ln -sf sprig /opt/sprig/buzz`.
2. Create a system user buzzagent with home /var/lib/buzzagent and no login shell, and a folder /etc/buzz-agent, mode 700, owned by buzzagent. Move the model key into it, mode 600.
3. Make the agent's own key, in /etc/buzz-agent, with umask 077:
   openssl ecparam -name secp256k1 -genkey -noout -out agent.pem
   openssl ec -in agent.pem -outform DER 2>/dev/null | head -c 39 | tail -c 32 | od -An -v -tx1 | tr -d ' \n' > agent.key
   openssl ec -in agent.pem -pubout -outform DER 2>/dev/null | tail -c 64 | head -c 32 | od -An -v -tx1 | tr -d ' \n' > agent.pub
   Delete agent.pem, give both files to buzzagent, and show me the public key in agent.pub.
4. Stop. I will make an ownership proof for that key in Buzz (Settings, Security, Authorize external identity) and paste it here. It is a JSON array of four strings: "auth", 64 hex characters, an empty string, 128 hex characters. Check that, then save it as /etc/buzz-agent/proof.json.
5. Write /etc/buzz-agent/agent.env, mode 600, owned by buzzagent, one KEY=value per line:
   BUZZ_RELAY_URL: the community address, with wss:// in place of https://
   BUZZ_PRIVATE_KEY: the contents of agent.key
   BUZZ_AUTH_TAG: the proof, on one line
   BUZZ_ACP_AGENT_COMMAND=buzz-agent
   BUZZ_ACP_MCP_COMMAND=buzz-dev-mcp
   BUZZ_ACP_RESPOND_TO=owner-only
   BUZZ_AGENT_REQUIRE_REPLY=1
   BUZZ_AGENT_PROVIDER=openrouter
   OPENROUTER_API_KEY: the model key
   OPENROUTER_MODEL: the model
   BUZZ_ACP_SYSTEM_PROMPT_FILE=/etc/buzz-agent/instructions.md
   For Anthropic use BUZZ_AGENT_PROVIDER=anthropic with ANTHROPIC_API_KEY and ANTHROPIC_MODEL; for OpenAI, openai with OPENAI_COMPAT_API_KEY and OPENAI_COMPAT_MODEL.
   Then write /etc/buzz-agent/instructions.md, mode 600, owned by buzzagent: "Your name is AGENT NAME. You are my agent in our Buzz community, running on this Linux server." and, on the next line, its job. Buzz adds these to its own rules for agents.
6. Add a systemd service buzz-agent: User=buzzagent, WorkingDirectory=/var/lib/buzzagent, EnvironmentFile=/etc/buzz-agent/agent.env, Environment=PATH=/opt/sprig:/usr/bin:/bin, ExecStart=/opt/sprig/buzz-acp, Restart=always, RestartSec=5. Enable and start it.
7. Run the buzz command as buzzagent with the service's settings: systemd-run --quiet --uid=buzzagent -p EnvironmentFile=/etc/buzz-agent/agent.env --pipe --wait /opt/sprig/buzz ARGS. (Loading agent.env in a shell strips the quotes from the proof.) Use it to:
   - publish its profile: buzz users set-profile --name "AGENT NAME". With the proof set, this puts the proof on the profile, which is what makes Buzz show the agent as mine.
   - open a direct message with me (my key is the second item in the proof): buzz dms open --pubkey MY_KEY, then post in it: buzz messages send --channel DM_ID --content "AGENT NAME is online."
8. Check the service log (journalctl -u buzz-agent) for "connected to relay" and "owner resolved from BUZZ_AUTH_TAG". If a step says relay_membership_required, this community keeps members' agents out: tell me to ask an admin to add the agent's public key as a member, wait for me, then retry.
9. Stop. Tell me to reply to the agent's message in Buzz. When I say I did, confirm from the log that it answered, and show me its last 20 log lines with keys masked.
```

Your part:

1. **Put a model key on the server.** Save it as `/root/model.key`, mode 600. The prompt uses
   OpenRouter, with a model such as `anthropic/claude-haiku-4.5`, and says what to change for
   Anthropic or OpenAI. The agent sends what it reads to
   that provider.
2. **Give your coding agent the prompt.** Claude Code, Codex or Goose, with SSH access to the
   server. It installs Sprig, makes the key, and stops with the agent's
   public key.
3. **Authorize the key in Buzz.** Settings, Security, Authorize external identity: paste the
   public key, choose Authorize identity, check the npub, choose Authorize this key, then Copy
   ownership proof. Paste the proof back to your coding agent. It finishes in about a minute.
4. **Answer its message.** The agent sends you a direct message once it is online. Reply there.
   To use it in a channel, mention it there and choose Invite.

**Who it answers.** `BUZZ_ACP_RESPOND_TO` in `agent.env`. `owner-only`, the prompt's choice, is
also `buzz-acp`'s default. It answers only its owner unless started with `--respond-to anyone` or
an allowlist
([buzz-acp's README](https://github.com/block/buzz/blob/9bcb3e45a426bc4b232f4731f46d6015ed0781ab/crates/buzz-acp/README.md#L137-L198)).
For a team, set `allowlist` and `BUZZ_ACP_RESPOND_TO_ALLOWLIST` to their public keys in hex,
separated by commas. For the public, `anyone`, on a server with nothing private on it, in open
channels only (security.md, Give each audience its own agent). Restart the service after a change.

**A community that keeps members' agents out.** With `BUZZ_ALLOW_NIP_OA_AUTH=false` in the
relay's `.env`, the proof alone gets `relay_membership_required`. An admin adds the agent's public
key as a member (operations.md, add a member), and then it works. Tested: the relay then doesn't
record who owns it ([block/buzz#4223](https://github.com/block/buzz/issues/4223)), so removing the
owner doesn't remove the agent, and it gets a person's rate limit.

**The proof can't be taken back.** It has no expiry, and
[Block's spec](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/nips/NIP-OA.md#L94-L99)
has no way to revoke one. It isn't tied to one community either. Whoever holds the agent's key and
the proof can act as the owner's agent, and the owner's own Buzz agents take requests from it:
[Buzz's dialog says](https://github.com/block/buzz-app/blob/5a21469faa8c53d20105d58c592a48f68c6dcf7c/src/app/ExternalIdentityAuthorization.tsx#L157-L158)
it can direct them to run commands as the owner. Keep the agent's key on its server and nowhere
else, and make a proof only for a key you made. The agent's own tools can read that key, as they
run as the same user, so give the server nothing else to protect. To cut an agent off, delete its
key on the server. If the key may have leaked, ban it (operations.md, ban someone): a ban on an
agent's key
[blocks it](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-relay/src/handlers/auth.rs#L60-L72)
(not tested). Removing the owner from the community cut off all of the owner's agents in the test
of 2026-11-12.

**A shared helper needs no proof.** An agent that answers everyone reads requests from anyone, so
keep your proof out of it. Add its key as a member (operations.md, add a member), and have its own
client publish its profile with `"is_agent": true` in the profile's content. Buzz shows it as an
agent, with no owner, and nothing it does acts for you. Seen in the test of 2026-11-12. The `buzz`
command has no option for that field, and Buzz never sets it on its own agents. Buzz on phones
doesn't read the flag. It shows the helper as an agent once the helper publishes an agent profile
([the phone's agent list](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/mobile/lib/shared/mentions/agent_identity_provider.dart#L80-L90)),
and in any channel where a member added it with the bot role
([the phone app's source](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/mobile/lib/shared/mentions/agent_identity_provider.dart#L345-L351)).
`buzz channels set-add-policy --policy anyone` publishes that profile, and lets any member add the
helper to a channel.

## When it shows as a person, or never answers

| Symptom | Cause and fix |
|---|---|
| `relay_membership_required` | The proof wasn't sent, you aren't a member of that community, or the community keeps members' agents out: an admin adds the agent's key as a member. |
| "A selected agent is no longer available" when you start a new message to it | Buzz 1.0.5 [starts new messages](https://github.com/block/buzz-app/blob/5a21469faa8c53d20105d58c592a48f68c6dcf7c/src/features/direct-messages/NewMessage.tsx#L314-L334) only to agents your Buzz runs or lists as yours, and an agent on your own server isn't one yet ([block/buzz#8012](https://github.com/block/buzz/issues/8012)). Reply to the message the agent sent you, or mention it in a channel. |
| It says it isn't the agent you named | It has no instructions: Buzz's own rules don't tell it its name. Put its name and job in `/etc/buzz-agent/instructions.md`, set `BUZZ_ACP_SYSTEM_PROMPT_FILE` to it, and restart. Seen in the test. |
| It reads your message and posts nothing | `BUZZ_AGENT_REQUIRE_REPLY=1` is missing from `agent.env`. Without it the agent can end its turn with an answer only it sees. Seen in the test. |
| It shows as a person | Its newest profile has no proof. Publish the profile again with `BUZZ_AUTH_TAG` set: `buzz users set-profile` takes its tags only from it. Loading `agent.env` in a shell (`. agent.env`) strips the quotes from the proof; `systemd-run` with `EnvironmentFile`, as in the prompt, keeps them. The proof there is the agent mark. A bot added as a member with no proof on its profile shows as a person, and a direct message from Buzz on desktop never wakes it. |
| `buzz-acp` answers nobody | It answers only its owner, and learns who that is from the proof in `BUZZ_AUTH_TAG`. Check the log for `owner resolved from BUZZ_AUTH_TAG`. |
