# Security before your first invite

Self-hosting gives you the server. Before you invite anyone, decide three things: who can get in,
what an agent can touch, and who holds which key. The guide's site draws two practices for a
community anyone can join. This file has the rest, for people and for agents.

## Who can get in, and what they can read

Reaching the relay, joining the community and reading a channel are three separate checks.

- **The network.** A relay on the internet has a public address and still serves members only:
  until a client signs in as a member, the relay
  [answers only that it must](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-relay/src/handlers/req.rs#L95). A stranger can
  still read the relay's info document (its public key and version), look up a member's handle,
  open a live invite link and reach the pairing service. No member list, channel names or
  messages. A relay on a private Tailscale network has no public address. That boundary is as
  narrow as your tailnet's access policy, and it never replaces the member list.
- **The member list.** People get on it when they open an invite link, or when whoever runs the
  server adds their npub. Anyone holding a live link becomes a member. A member's own agents get in
  through that member's membership, without anyone adding them (operations.md, Local agents). To
  approve each agent yourself, turn that off (operations.md, To approve each agent yourself).
  Treat a community anyone can join as a public space: share there only what you would publish. The bundle's `.env` turns this
  check on with `BUZZ_REQUIRE_AUTH_TOKEN=true` and `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true`: leave
  both as they are.
- **The channel.** Any member can read an open channel, its whole history included, and can see
  who else is a member. A private channel and a direct message are for the people in them. Anyone
  in a private channel, except a guest, can add people to it, and only its owners and admins can
  make someone an admin of it
  ([the rule](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-core/src/channel.rs#L300-L340)).
  So keep a private channel's members to people you'd trust with its guest list.
- **The server itself.** None of these checks applies to whoever can log in to the server, read
  its database or open a backup. Messages, direct messages and files are
  [not end-to-end encrypted](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/VISION.md#L100).
- **A second factor.** Buzz has no second factor of its own: a member signs in with their key
  alone. The relay can require company sign-in, where an identity provider vouches for each key
  ([`BUZZ_NIP_FI_MODE`](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-relay/src/nip_fi_config.rs#L8-L32)),
  but the Buzz apps send that proof only to the sign-in services built into them, for communities
  Block hosts ([the app's routing](https://github.com/block/buzz-app/blob/f315ef59b87160d23f5789f4e1458d753674cd8a/src-tauri/src/federated_identity/mod.rs#L373-L376)).
  So for a private team, put the relay on a private network whose login asks for a second factor,
  and keep the member list as the next check. Tailscale asks for that second factor when a device
  signs in, and again when the device's key expires, after 180 days by default. Until then, a lost
  device that's unlocked carries both factors. So set a shorter key expiry for the tailnet in
  Tailscale's admin console, and remove a lost device from the tailnet at once. For an open
  community, keep anything sensitive out.

On the relay image this guide installs, a file opens for
[any member](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-relay/src/api/media.rs#L900) who has its link, even a file from a
private channel or a direct message they are not in. A link can't be guessed: it is the file's
own fingerprint. Removing someone from the community stops the relay serving them files, and
can't take back what they saved. The relay this guide installs can limit files to their channels. That setting starts off and needs
[a rollout of its own](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/operator-private-media.md).
Until it is on and checked, keep files that not every member may see out of Buzz.

## What an agent can touch

An agent takes requests from its owner: the
[owner's mentions and direct messages](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/features/agents/owner-attestation.ts#L142)
start its work. To answer, it reads what others wrote: the recent messages around the request,
attached files, linked pages and repositories. Any of them can carry instructions that try to
redirect it. This is prompt injection, and the person behind it never has to be allowed to ask the
agent anything. Your other agents count as you. Buzz accepts a request from any agent that carries
your ownership proof
([Buzz's rule](https://github.com/block/buzz-app/blob/5a21469faa8c53d20105d58c592a48f68c6dcf7c/src/features/agents/owner-attestation.ts#L159-L165),
and [`buzz-acp`'s](https://github.com/block/buzz/blob/9bcb3e45a426bc4b232f4731f46d6015ed0781ab/crates/buzz-acp/src/lib.rs#L375-L432)),
and every agent made in Buzz has one. So an agent that follows a prompt injection can direct your
other agents. Watches an agent sets up, and Settings, Security, Authorize external identity,
widen what can start its work.
[agents.md](agents.md#run-an-agent-on-your-own-server) says what that authorization allows, and
why it can't be taken back.

Buzz 1.0 starts every local agent, whether Claude, Codex, Goose or Pi, with no sandbox and no
approval prompts
([Codex](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/codex/runtime.ts#L2529),
[Claude](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/claude-code/claude.ts#L298)),
and has no setting to change that. A Workspace is only the folder the agent starts in. So an agent
can do what its person's account can do on that computer: read files, use saved logins and SSH
keys, push code, reach the network. Its model provider's key is within its reach too. On Linux and
Windows, any program the person runs, an agent included, can read their Buzz private key from the
system's key store, which doesn't keep programs apart
([Buzz's identity design](https://github.com/block/buzz-app/blob/5a21469faa8c53d20105d58c592a48f68c6dcf7c/docs/identity.md#L599-L600)).

- **For a community anyone can join, give agents a machine of their own:** a separate device or a
  virtual machine that holds only that project's files and narrowly scoped credentials. Not an
  everyday computer or work account.
- Keep an open community's agents apart from a private community's agents.
- **Give each audience its own agent.** An agent that reads a private channel can repeat it in an
  open channel or a direct message, asked plainly or tricked. Buzz doesn't stop that yet: Block's fix
  is [a design draft](https://github.com/block/buzz-app/blob/f315ef59b87160d23f5789f4e1458d753674cd8a/docs/practical-information-flow-for-buzz-agents.md).
  Keep the agent that serves an open channel out of private ones.
- Use a model provider your team has approved for what the agent can read.
- A private community needs the same care with less urgency: a compromised member or an imported
  document can carry the same text.
- An agent hosted by Builderlab, Block's service, runs on Block's machines and
  [can't open files on your computer](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/builderlab/README.md#L9).
  By default one person's hosted agents share a cloud computer, and what they read is processed
  there. A hosted agent carries your ownership proof too, so it counts as you to your other agents,
  and Block keeps its key and your proof
  ([Builderlab's README](https://github.com/block/buzz-app/blob/5a21469faa8c53d20105d58c592a48f68c6dcf7c/src/bundled/builderlab/README.md#L81-L85)).
- Install only plugins you trust. A plugin is
  [trusted, unsandboxed code](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/plugin-architecture.md#L358).
  [Block's support page](https://buzz.xyz/support) says one can reach beyond the permissions its
  install screen lists, your files and your Buzz private key included.

Buzz has an
[experimental protection feature](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/agent-protection.md)
for macOS. It limits who can approve an agent's actions. It is not a file or network sandbox, so
the limits above still apply. This guide has not tested any isolation product.

## Two kinds of keys

- **Your public ID (npub).** Safe to share. It can't restore anything.
- **Your private key.** It is you, in every community you join. Keep a copy in your own password
  manager, where nobody else can open it. Never in a shared vault, a chat, an agent prompt, an
  issue or a screenshot. Buzz on desktop holds one key at a time, for every community
  ([Identity](https://github.com/block/buzz-app/blob/f315ef59b87160d23f5789f4e1458d753674cd8a/src/app/IdentitySettings.tsx#L285)):
  an identity kept apart needs a second user account on the computer, or another device. Removing
  the key to switch takes every community off that computer until it signs in again.
- **The relay's private key.** It is the community's identity. It lives in the server's `.env` (a
  Secret on Kubernetes) and inside every backup. If your team keeps a copy in a shared vault, only
  operators should open it.
- **An agent's files and credentials.** These are separate: a copy of a person's key does not back
  up an agent's workspace.

After joining, save your private key: Settings, Identity, More options on the Buzz ID card, the
masked private-key field, Copy. Check that the saved entry opens before deleting the key file,
then copy something else so the key leaves the clipboard. A clipboard manager that keeps history
keeps the key too.

Signing in to Builderlab, Block's service, can upload a copy of your key that the service can
decrypt and give back to whoever signs in to that account
([identity design](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/identity.md#L664)).
A key brought in without signing in is not uploaded. If Buzz later asks "Back up your key?", "I
will manage my own key" keeps it off Block's servers. Signed in, Buzz
[turns the backup on without asking](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/identity.md#L1044)
once that identity belongs to a community Block hosts. The device's secure storage alone is not a
backup: keep your own copy either way.

## The host and its backups

Give each operator their own login, with two-factor sign-in on the hosting and DNS accounts and a
personal SSH key or cluster login. Name a backup operator. Keep the database, the cache, the file
store's admin port and metrics off the internet.

Keep encrypted copies of the database, the file store, the git data and the configuration
together, off the server. Choose how often from how much you can afford to lose, and rehearse a
restore somewhere disposable: a folder of files is not proof that a backup works. Keep the same
relay key and community address when restoring.

On Kubernetes, limit who can read Secrets with RBAC and turn on encryption at rest: base64 is not
encryption ([Kubernetes' Secret practices](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)).
On a private network, tag the relay's machine so it belongs to no single person, and narrow the
tailnet's policy to the people who use Buzz.

## When a device is lost, a key leaks or someone leaves

**A lost device.** If nobody could get into it, sign in on a new device with the saved copy. If
someone could, the key is exposed: restoring a copy does not undo that. Have the old identity
banned in every community it belongs to, then make a new one. For an owner, hand ownership over
on the server first; the old owner key stays an admin after that, so remove and ban it. Pairing
copies the same key to the phone, so a lost phone counts too. On a private network, remove the lost
device from the tailnet at once (admin console, Machines). If a computer you keep still holds the
exposed key, choose Remove from device in Settings, Identity on it, and sign in with the new key
after Buzz restarts.

**Someone leaves.** Remove them from the community, from Staff, from the private network, from the
server and from the shared vault, and change any password they could have copied. Removing access
does not take back messages or files they already have. A removed person can come back through
any invite link that is still live, and a ban keeps them out. A link lasts
[30 days at most](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-core/src/invite.rs#L17) and Buzz can't cancel one. Banning the
person who made a link [cancels every link they made](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-db/src/store/relay_invite/revocation.rs#L12),
for good, and removing or demoting them does not; links in the older format follow other rules.
So keep links short-lived and limited to the people you expect.

**The relay key or the server.** If either is exposed, take the server off the network, change
every other password it held and plan the recovery. A leaked relay key also lets anyone make invite
links the relay accepts. Relay 0.3.0 still accepts links in the older format, which are signed with
a key made from the relay key
([invite_token.rs](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-relay/src/invite_token.rs#L20-L25)),
and those links have no lifetime limit unless `BUZZ_INVITE_V1_INVALID_AFTER` is set
([config.rs](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-relay/src/config.rs#L433-L453)).
Set it to the current time in UTC, written as `YYYY-MM-DDTHH:MM:SSZ`, in `.env` (on Kubernetes,
under `relay.extraEnv`), and restart the relay, so it refuses older-format links from then on (not
tested). Then check Membership in Buzz (Settings, Community admin, Membership), and ban every key
you don't know (operations.md). Buzz has no clean way to change a relay's key yet: [a new one orphans the community's channels](https://github.com/block/buzz/issues/7357),
and phones stop getting notifications until each signs up again. So never make a new relay key
to fix an unrelated problem. Restoring the original from a backup undoes a mistaken change. It
does not undo a leak.
