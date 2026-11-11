# Security before your first invite

Self-hosting gives you control of the server. Decide who can join, what information belongs
here and which tools an agent may use before inviting your team.

## Reach, membership and channel access

- **Reach the relay:** an internet-accessible address still requires Buzz membership. A private
  Tailscale network adds a network boundary; it does not replace the member list.
- **Join the community:** a public invitation can admit people you do not know. Treat a community
  anyone can join as a publishing space: share only material you would be comfortable making public.
- **Read a channel:** an open channel is open within the community. Private channels restrict
  membership, but ordinary messages, DMs and uploaded files are readable by the server operator.

This guide's pinned relay lets any member with a file's link read it, including files from a
private channel or DM they are not in. Newer channel-based file controls default to off and need
[a separate rollout](https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/docs/operator-private-media.md).
Keep confidential files outside this community until the selected configuration is verified.

## Isolate agents that read public content

**Do not connect an agent running in your everyday personal or work account to an open community
by default.** Use a dedicated device or isolated virtual machine containing only the project's
intended files and narrowly scoped credentials. A Workspace folder is not a security sandbox.

An agent can act on the files, accounts and tools its runtime can reach. Messages, attachments,
linked pages and repositories can contain instructions that try to redirect it. This is prompt
injection; the attacker need not be allowed to give it a direct request. In the launched app,
[ordinary Codex](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/codex/README.md#L131)
and [Claude launches](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/claude-code/claude.ts#L298)
can run with broad permissions and without per-action approval.

- Keep private repositories, personal files, production credentials and unrelated signed-in
  accounts out of the public agent's environment. Keep public and private agent sessions separate.
- Limit tools, credentials and network destinations where the runtime supports it. Arrange human
  review for consequential actions; do not assume the default Buzz launch will ask.
- Use a model provider approved for the data the agent can read. A remote agent needs the same
  limits; moving it to someone else's server does not itself establish isolation.
- Apply these controls in private communities too. Compromised accounts and imported documents
  can introduce hostile content even when fewer people can contribute.

Buzz is developing additional protections, but its
[protection integration is experimental](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/agent-protection.md)
and is not a general filesystem or network sandbox. Keep these access limits in place. This is
operating guidance, not a claim that this guide has validated a particular isolation product.

## Back up the right key, in the right place

| What | Who keeps it | Recovery copy |
| --- | --- | --- |
| Your public Buzz ID (`npub`) | Safe to share with an operator | Keep with community addresses; it cannot restore your identity |
| Your private identity key | You, in your private vault in a team-approved password manager | An off-device copy in your password manager, with a recovery method for that vault |
| The relay's private key | Named primary and backup operators | A restricted shared operations vault, plus encrypted configuration backups |
| Agent credentials and local files | The person responsible for that agent | Separate, scoped recovery material; a human-key backup does not back up an agent's workspace |

After importing your identity, save its private key from Settings, Identity, the Buzz ID card's
More options, the masked private-key field, Copy. Confirm the saved entry is recoverable before
deleting the temporary key file. Avoid shared clipboard/history tools and clear the copied value
when finished. Never paste a private key into this site, chat, an agent prompt, an issue or a screenshot.
Do not put everyone's identity keys in the shared relay vault.

Builderlab can keep an encrypted backup linked to your account. Independent import without
Builderlab sign-in keeps recovery under your control; later backup consent changes that. Protect
the recovery account and confirm a completed backup before relying on it. Device secure storage
alone is not an off-device backup. See the
[identity recovery design](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/identity.md#L664).

## Protect the host and the recovery copy

Use individual operator accounts, MFA on hosting and DNS accounts, restricted SSH or cluster
access, and an agreed backup operator. Keep databases, caches, storage administration and metrics
private. Install only trusted plugins; they can carry powerful permissions.

Keep encrypted off-server copies of the database, file store, git data and configuration together.
Choose backup frequency from the amount of data you can afford to lose, and rehearse restoration
into a disposable environment. Check backup age and restore results, not only whether files exist.
Preserve the same relay key and community URL during recovery.

On Kubernetes, restrict Secret access with RBAC and enable encryption at rest. Base64 encoding
is not encryption. See [Kubernetes Secret practices](https://kubernetes.io/docs/concepts/security/secrets-good-practices/).

## Plan for loss, compromise and people leaving

A lost device with an unexposed key can use a saved backup. A suspected exposed identity needs
ban/retirement in each affected community and a clean replacement; restoring the same key does
not undo exposure. For an owner, arrange the ownership handover with the operator first.
Pairing copies the same identity to the phone, so a compromised phone matters too.

Remove departed people's community, Staff, network, host and vault access. Rotate credentials
they could have copied. Removing access cannot erase messages or files already copied elsewhere.
Use short-lived, limited-use invites. There is no single-link cancellation procedure in this guide;
banning an issuer revokes its durable v2 invitations, while legacy links have different rules.
Do not use an issuer ban as routine invitation management.

If a relay key or host is exposed, isolate it, revoke other exposed credentials and plan recovery.
Do not regenerate the relay key as a troubleshooting step:
[rotation still needs migration work](https://github.com/block/buzz/issues/7357). Restoring the
original key is different from changing identity; old signatures still verify under the old key.
