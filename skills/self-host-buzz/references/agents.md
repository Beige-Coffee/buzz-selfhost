# Agents: instructions, harness, staying on, and your own server

Read "What an agent can touch" in [security.md](security.md) first. Everything here works inside
those limits. Buzz 1.0 starts a local agent with no sandbox and no approval prompts.

An agent made in Buzz answers its owner. The
[owner's mentions and direct messages](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/features/agents/owner-attestation.ts#L138-L150)
start its work. A message that carries the owner's ownership proof starts its work too. Other
members can't start it. A helper that answers every member has to be a program of your own. See
"Run an agent on your own server".

Decide who an agent works for before setting it up. That choice settles where it runs, who can ask
it for things, and which channels it belongs in:

- **For you.** Make it in Buzz on a computer that stays on, with Buzz open (see "Keep an agent
  answering"). It gets in through your membership and takes requests only from you.
- **For your team.** Run it on a server of its own, where it signs in with your ownership proof
  (see "Run an agent on your own server"). It answers the people you list. It belongs in your
  team's channels.
- **For the public.** In an open community, run the same kind of program on a machine with nothing
  private on it, and have it answer anyone. It belongs in open channels only (security.md, Give
  each audience its own agent).

## Tell an agent its job

In Buzz 1.0, you write an agent's instructions in its **Instructions** field. The field is in
Create agent (Agents, then Create your first agent, or New agent and then Create a new agent).
Later, you find it on the agent's Identity tab. The field is optional.
[Block's support page](https://buzz.xyz/support) lists what belongs there: what you want delivered,
who it is for, which files or links matter, what needs your approval, and a request that the agent
say what it changed and how it checked. It also says to keep passwords and private keys out.
Instructions shape how the agent answers. They don't give it tools, logins or permissions.

Five sentences are enough. Change the names to your own:

```text
You help the Riverbend Tool Library volunteers in this community.
Answer questions about opening hours and loans from the files in this workspace.
Ask me before you change or delete a file.
When you finish a task, say what you changed and how you checked it.
Never post passwords, keys or tokens.
```

Leave out how to behave in a channel. Buzz gives every agent its own rules before yours
([base_prompt.md](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/features/agent-harness/base_prompt.md#L10)).
Only a mention or a direct message asks the agent for something. It replies in the thread and in
the channel where it was asked. It keeps messages to the channel brief. It stays silent when it
has nothing to add. The model's provider receives the instructions with each request.

## Pick a harness and model

The harness is the agent program that Buzz runs. Buzz 1.0.5 offers four: Codex, Claude, Goose and
Pi, which stays off until you turn it on. Neither the README nor Block's help and support pages
recommend one over another. Each one signs in its own way, so start from the account you already
have:

| Harness | What you need | Where you sign in | Runs on |
|---|---|---|---|
| Codex | A ChatGPT plan, such as Plus, Pro, Business or Enterprise. An OpenAI API key works too. | In Settings, Agent setup, choose Sign in on the Codex row. For an API key, sign in with the `codex` command instead. | macOS, Linux |
| Claude | Claude Code signed in on that computer, such as with a Claude plan. Without that, an Anthropic API key, billed for each request. | Sign in with `claude auth login` in a terminal. Then in Settings, Agent setup, choose Add Claude API key and then Refresh. For a key, paste it there and choose Save. | macOS, Linux |
| Goose | A key from a model provider, such as OpenRouter, or a model on your own computer through Ollama | In Settings, Agent setup, choose Set up Goose, pick a provider and paste its key. | macOS, Linux, Windows |
| Pi | Node.js 22.19 or later and a provider's API key | Turn Pi on in Settings, under Plugins. Then paste the key and choose Save to Pi. | macOS, Linux, Windows |

Who the agent works for decides which account to use:

- **A plan is for one person.** A personal plan such as Claude Pro or Max, or ChatGPT Plus or Pro,
  is for its owner's own use. [Anthropic's](https://www.anthropic.com/legal/consumer-terms) and
  [OpenAI's](https://openai.com/policies/terms-of-use/) terms don't let you make your account
  available to anyone else. For an agent that other people can ask, use an API key with a spending
  limit. [OpenAI](https://learn.chatgpt.com/docs/auth) also recommends an API key for anything that
  runs on its own.
- **Plans have usage limits.** Most of Claude's and ChatGPT's plans have limits that reset every
  few hours or every week. When an agent reaches one, it can't do more work until the limit resets,
  unless you buy more usage. An API key has no plan limit, and you pay for each request.
- **Some plans train on your data.** Claude Pro and Max and ChatGPT Plus and Pro can use your
  conversations to train models, the agent's included, unless you turn that off. Turn it off in
  Claude's privacy settings, or in ChatGPT under Data controls. Team, Business and Enterprise plans
  and API keys don't train on your data by default
  ([Anthropic](https://code.claude.com/docs/en/data-usage),
  [OpenAI](https://help.openai.com/en/articles/5722486)).
- **To keep what the agent reads off any provider's servers,** use Goose with a model on your own
  computer through Ollama. The model has to support tool calling.

Buzz uses Claude Code's own sign-in whenever `claude auth status` reports one, and asks for a key only
without it, according to
[Buzz's source](https://github.com/block/buzz-app/blob/main/src/bundled/claude-code/auth.tsx)
(not tested with a Claude plan). A Claude agent's commands can read its API key, because Buzz hands the key to Claude Code. Give it
a key of its own with a spending limit. The agent sends what it reads to its provider. Leave Model
and Thinking on their defaults until you have a reason to change them. Thinking sets how much the
model reasons before it answers. A higher level takes longer and uses more of your limit or budget.
Each agent keeps its own harness, model and Thinking setting.

## Keep an agent answering

A local agent answers only while Buzz is open on its computer and that computer is awake
([README](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/README.md#L82-L85)).
To have an agent answer all day, run it on a computer that stays on, and keep Buzz open there.
That computer can also be the machine of its own that security.md asks for. These steps come from
Block's source and weren't tested on a second computer:

1. **Install Buzz on the computer that stays on.** Buzz is a desktop app for macOS, Linux and
   Windows. Claude and Codex agents need macOS or Linux.
2. **Sign in there as yourself.** On Buzz's first screen, choose Other options, paste the
   community's address and choose Continue. Then choose Use an existing key and give it the copy
   of your private key that you saved. If you have no copy, open Settings, Identity on the computer
   you already use, choose More options on the Buzz ID card, then the masked private-key field and
   Copy. If you use a Builderlab account, choose Sign in with Builderlab instead. An agent answers
   only its owner. That's why this computer has to use your identity. It then holds your key, as
   your laptop does.
3. **Create the agent on that computer.** Buzz keeps an agent's key on the computer where you
   created it. The agent runs on that computer. Your other computers list it as
   [On another device](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/agents/AgentsPage.tsx#L155-L156).
4. **Keep the computer awake.** On a Mac, open Settings, then Agent setup. Under Agent behavior,
   set Keep this Mac awake to Always.
   [Its options](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/app/AgentSettings.tsx#L28-L32)
   are Off, While agents work and Always. Closing a laptop's lid still puts it to sleep. Buzz has
   this setting on Macs only. On Linux or Windows, turn off sleep in the system's own settings.

**An agent Block hosts.** Block calls these remote agents. They run on Block's machines through
Builderlab. [Block's support page](https://buzz.xyz/support) says the paid ones are available only
in the United States. They weren't tested with a self-hosted community.

**An agent on your own server**, with no Buzz app, is in the next section.

## Run an agent on your own server

An agent you already run on a server of its own can join your community. It can then answer you
there all day, with no Buzz app open. Buzz 1.0 has no built-in way to do this. Block ships the
pieces, and the agent can put them together itself from the prompt below. This was tested with
relay 0.3.0, Buzz 1.0.5 and Block's Sprig, with goose 1.60.1 and with Claude Code 2.1.329 as the
agent. Given only the prompt, each agent set itself up and answered in a direct message.

How it works:

- **Its own key, made on the server.** The agent makes its own key on its server, and the key
  never leaves that server. Never give an agent a person's key.
- **Your ownership proof.** Buzz makes the proof in Settings, Security, Authorize external
  identity. The agent signs in with it, and the relay then lets the agent in through your
  membership. The agent also puts the proof on its profile. This is the agent mark. Buzz shows an
  agent with this mark as your agent, and the agent takes requests from you.
- **Block's Sprig.** Sprig is one Linux program that contains both the `buzz` command and
  `buzz-acp`. Block publishes it as a
  [rolling build of `main`](https://github.com/block/buzz/releases/tag/sprig-latest), with no
  version number. `buzz-acp` is the runner. It listens for mentions and direct messages and hands
  them to your agent over ACP.

Give this prompt to your agent. Fill in its name, and add instructions if you want to:

```text
Connect yourself to my Buzz community, so I can talk to you there. Keep running on this machine.

Community: $ORIGIN
Your name in Buzz: <agent name>
Instructions for you in Buzz (optional): <instructions>

Never print or send your Buzz private key. Where a step says Stop, stop and wait for me.

1. Install Block's Sprig, one program that is the buzz command and buzz-acp, the runner that hands you messages from Buzz. Download sprig-ARCH-unknown-linux-musl.tar.gz and its .sha256 for this machine (ARCH is x86_64 or aarch64) from https://github.com/block/buzz/releases/download/sprig-latest/, check the checksum, unpack into /opt/sprig, then run `chmod 755 /opt/sprig` and `ln -sf /opt/sprig/sprig /usr/local/bin/buzz`, so your tools can run buzz.
2. Make your own Buzz key, in a new folder with mode 700, with umask 077:
   openssl ecparam -name secp256k1 -genkey -noout -out agent.pem
   openssl ec -in agent.pem -outform DER 2>/dev/null | head -c 39 | tail -c 32 | od -An -v -tx1 | tr -d ' \n' > agent.key
   openssl ec -in agent.pem -pubout -outform DER 2>/dev/null | tail -c 64 | head -c 32 | od -An -v -tx1 | tr -d ' \n' > agent.pub
   Delete agent.pem and show me agent.pub, your public key.
3. Stop. I will paste an ownership proof from Buzz: a JSON array of four strings that starts with "auth". Save it.
4. Write a settings file in that folder, mode 600, one KEY=value per line:
   BUZZ_RELAY_URL: the community, with wss:// in place of https://
   BUZZ_PRIVATE_KEY: the contents of agent.key
   BUZZ_AUTH_TAG: the proof, on one line
   BUZZ_ACP_AGENT_COMMAND and BUZZ_ACP_AGENT_ARGS: how to start you over ACP. goose: goose with acp. Claude Code: run npm install -g @zed-industries/claude-code-acp@0.16.2, then claude-code-acp. Codex: run npm install -g @agentclientprotocol/codex-acp@2.1.1, then codex-acp. OpenClaw: openclaw with acp. Use exactly these versions: newer Claude and Codex adapters refuse buzz-acp's handshake. Use the full path if the service's PATH may not have it.
   BUZZ_ACP_SYSTEM_PROMPT_FILE: a file with your name in Buzz, the instructions above, and this line: "People in Buzz see only what you post with the buzz command, so answer every message with buzz messages send."
   and anything else you need to start, such as your model's settings. If your tools run in a separate process, such as a gateway, give it the three BUZZ_ settings too.
5. Run /opt/sprig/buzz-acp as a service that starts at boot and restarts when it stops, with that settings file. With systemd, use EnvironmentFile: buzz-acp needs the proof's quotes, which loading the file in a shell strips.
6. With the same settings (systemd-run -p EnvironmentFile=... --pipe --wait works), run buzz to:
   - publish your profile: buzz users set-profile --name "YOUR NAME". This puts the proof on your profile, so Buzz shows you as my agent.
   - open a direct message with me (my key is the second item in the proof): buzz dms open --pubkey MY_KEY, then post in it: buzz messages send --channel DM_ID --content "YOUR NAME is online."
   If Buzz answers relay_membership_required or "not a relay member", this community keeps members' agents out: tell me to ask an admin to add your public key as a member, wait, then retry.
7. Stop. Tell me to reply to your message in Buzz. When I say I did, check your service's log to confirm you answered.
```

Your part:

1. **Give your agent the prompt.** The agent installs Sprig and makes its key. It then stops and
   shows you its public key.
2. **Authorize the key in Buzz.** In Buzz, open Settings, then Security, then Authorize external
   identity. Paste the public key and choose Authorize identity. Check the npub, choose Authorize
   this key, then choose Copy ownership proof. Paste the proof back to your agent. The agent
   finishes setting itself up in a minute or two.
3. **Answer its message.** The agent sends you a direct message once it is online. Reply to that
   message. To use the agent in a channel, mention it there and choose Invite.

**Who it answers.** `BUZZ_ACP_RESPOND_TO` in the agent's settings file sets who it answers. The
prompt's setup uses `owner-only`, which is also `buzz-acp`'s default. It answers only its owner
unless started with `--respond-to anyone` or an allowlist
([buzz-acp's README](https://github.com/block/buzz/blob/9bcb3e45a426bc4b232f4731f46d6015ed0781ab/crates/buzz-acp/README.md#L137-L198)).
For a team, set it to `allowlist`, and set `BUZZ_ACP_RESPOND_TO_ALLOWLIST` to their public keys in
hex, separated by commas. For the public, set it to `anyone`. Run that agent on a server with
nothing private on it, and keep it in open channels only (security.md, Give each audience its own
agent). Restart its service after a change.

**A community that keeps members' agents out.** Some communities set
`BUZZ_ALLOW_NIP_OA_AUTH=false` in the relay's `.env`. In those communities, the proof alone gets
`relay_membership_required`. An admin then adds the agent's public key as a member (operations.md,
add a member), and the agent can get in. Testing showed that the relay then doesn't record who
owns the agent ([block/buzz#4223](https://github.com/block/buzz/issues/4223)). Removing the owner
doesn't remove that agent, and it gets a person's rate limit.

**You can't take back an ownership proof.** It has no expiry, and
[Block's spec](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/nips/NIP-OA.md#L94-L99)
has no way to revoke one. It isn't tied to one community either. Whoever holds the agent's key and
the proof can act as the owner's agent. The owner's own Buzz agents take requests from it.
[Buzz's dialog says](https://github.com/block/buzz-app/blob/5a21469faa8c53d20105d58c592a48f68c6dcf7c/src/app/ExternalIdentityAuthorization.tsx#L157-L158)
it can direct them to run commands as the owner. Keep the agent's key on its server and nowhere
else. Make a proof only for a key you made. The agent's own tools can read that key, because they
run as the same user. Give that server nothing else to protect. To cut an agent off, delete its
key on the server. If the key may have leaked, ban it (operations.md, ban someone). A ban on an
agent's key
[blocks it](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-relay/src/handlers/auth.rs#L60-L72),
according to Block's source (not tested). Removing the owner from the community cut off all of the
owner's agents in testing.

**A shared helper needs no proof.** An agent that answers everyone reads requests from anyone. Keep
your proof out of it. Add its key as a member (operations.md, add a member). Then have its own
client publish its profile with `"is_agent": true` in the profile's content. Buzz shows it as an
agent, with no owner, and nothing it does acts for you. This was seen in testing. The `buzz`
command has no option for that field, and Buzz never sets it on its own agents. Buzz on phones
doesn't read the flag. A phone shows the helper as an agent once the helper publishes an agent
profile
([the phone's agent list](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/mobile/lib/shared/mentions/agent_identity_provider.dart#L80-L90)).
A phone also shows it as an agent in any channel where a member added it with the bot role
([the phone app's source](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/mobile/lib/shared/mentions/agent_identity_provider.dart#L345-L351)).
`buzz channels set-add-policy --policy anyone` publishes that profile, and it lets any member add
the helper to a channel.

## When it shows as a person, or never answers

| Symptom | Cause and fix |
|---|---|
| `relay_membership_required` | The proof wasn't sent, you aren't a member of that community, or the community keeps members' agents out. In the last case, an admin adds the agent's key as a member. |
| "A selected agent is no longer available" when you start a new message to it | Buzz 1.0.5 [starts new messages](https://github.com/block/buzz-app/blob/5a21469faa8c53d20105d58c592a48f68c6dcf7c/src/features/direct-messages/NewMessage.tsx#L314-L334) only to agents that your Buzz runs or lists as yours. An agent on your own server isn't one of them yet ([block/buzz#8012](https://github.com/block/buzz/issues/8012)). Reply to the message the agent sent you, or mention it in a channel. |
| It shows as a person | Its newest profile has no proof. Publish the profile again with `BUZZ_AUTH_TAG` set. `buzz users set-profile` takes its tags only from `BUZZ_AUTH_TAG`. A bot added as a member with no proof on its profile shows as a person. A direct message from Buzz on desktop never wakes it. |
| It says it isn't the agent you named | Buzz's own rules don't tell the agent its name. Put its name in the file that `BUZZ_ACP_SYSTEM_PROMPT_FILE` points to, and restart its service. This was seen in testing. |
