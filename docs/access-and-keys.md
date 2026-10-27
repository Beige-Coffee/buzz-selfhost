# Access and keys: what the site's section rests on (2026-10-27)

The site's Access and keys section (`site/src/scenes/access.ts`) gives best practices and how to set
them up. Each answer is a recommendation (ours) resting on Buzz facts, sourced here, and shows the how:
a click-through of Buzz 1.0's own screens where it happens in Buzz, a drawing where it happens on the
server.

## The pictures, and what they're drawn from

- **Click-throughs of Buzz's screens**, in light mode, assuming Buzz is installed:
  - setting up an identity and losing a device: `site/src/scenes/identity.ts`, from block/buzz-app's
    `src/features/identity/IdentitySetup.tsx` (and its CSS and `public/shell-gradient.png`),
    `src/app/shell/ProfileButton.tsx`, `src/app/settings-sections.ts`, `src/app/IdentitySettings.tsx`,
    `src/features/identity/PrivateKey.tsx`, and the Pair mobile page;
  - adding people, roles and removing someone: the people flows in `site/src/scenes/members.ts`, with
    the invite link set to 1 day and 5 uses here;
  - starting an agent: `site/src/scenes/agentflow.ts`, from `src/bundled/agents/AgentsPage.tsx` and
    `AgentCreateDialog.tsx` (and the repo's `docs/assets/readme/create-agent.png`).
  - Layouts were checked against block/buzz-app running in a browser with sample data (`just web` with
    no identity pinned, 2026-10-28), which never touches a real Buzz app or key. The Identity page needs
    an identity to show its rows, so those come from the source.
- **Drawings** for single sign-on, a leak, server access, the relay key, who can read messages and the
  audit log. Keys, names and messages in them are illustrative. Checked against block/buzz `origin/main` at `a38fedb`, block/buzz-app
`origin/main` at `04327c2` and the released app `v0.7.0-preview.190.1`.

## Identity and keys

**How should each person set up their identity?**
Recommended: one work identity per person, made in the Buzz app, with a copy of its private key in
your company's password manager.
1. Install Buzz and create an identity (Create a new identity).
2. Save the private key: Settings, Identity, Copy private key, into the person's own item in the
   password manager.
3. Send the npub to an admin: Settings, Identity, Nostr address (npub).
4. Lock the devices: disk encryption and a screen lock, on the computer and the paired phone.
Note: nobody can reset a Buzz key.
*Facts:* buzz-app `README.md` (identity setup, Copy private key, key in secure storage);
`crates/pairing/src/NIP-AB.md` (pairing copies the key to the phone).

**Can we use single sign-on?**
Recommended: not inside Buzz yet. On a private network, sign in to Tailscale with your identity
provider, so only company accounts reach the relay; keep the member list as the second lock; remove
people in both places.
*Facts:* block/buzz `docs/nips/NIP-FI.md` (draft), `crates/buzz-relay/src/config.rs`
(`BUZZ_NIP_FI_MODE`, off by default), `docs/federated-identity-adapter.md` (planned for enterprise
builds). Tailscale signs users in through Apple, Google, GitHub, Microsoft, Okta and OneLogin, or a
custom OIDC provider (tailscale.com/kb/1013/sso-providers, checked 2026-10-27).

**What do we do when a laptop or phone is lost?** (picture: a two-question decision tree)
Recommended: treat the key as stolen until you know the device was locked and encrypted. Not locked
or not sure: remove the key now. Saved a copy: sign in with it (Use an existing key, or Restore from
backup with a Block account). No copy: new identity, added again, old key removed. Pair the phone
again.
*Facts:* buzz-app `README.md` (Use an existing key); `src/features/identity/IdentitySetup.tsx`
(Restore from backup); `src/features/identity/backup.ts` (backups come from Block sign-ins).

**What if a key leaks?**
Recommended: remove a leaked person's key right away, then add their new identity; replace a leaked
relay key in `.env` and restart; if the server itself was breached, change its logins and assume
every message was read.
*Facts:* keys are global Nostr identities (`NOSTR.md`); relay key in `.env` (skill `compose.md`).

## People and roles

**How should we set up roles?** (picture: who can do what)
Recommended: the person who runs Buzz is the owner; name at least two admins.
*Facts:* buzz-app `src/bundled/moderation/api.ts` (`allowedActions`), `CommunityAdmin.tsx` (only the
owner adds admins); skill `operations.md` (the owner is changed on the server).

**How should we add people?** (picture: the invite link settings)
Recommended: add people you know by npub; for a group, an invite link that expires after 1 day,
limited to the number of people expected; on a private network, Tailscale first.
*Facts:* `CommunityAdmin.tsx` (Add directly; `mintInvite` with expiry and use limit); expiry options 1,
3, 7, 30 days and use limits from Buzz 1.0's screens (2026-10-25).

**What do we do when someone leaves?** (picture: a checklist)
Remove them in Membership (their agents lose access too); remove them from Tailscale (private
network); remove their SSH key and hosting account (if they had them); replace the relay key (if
they could read `.env`); hand over ownership first (if they were the owner). Buzz can't wipe a device.
*Facts:* `.env.example` (`BUZZ_REQUIRE_RELAY_MEMBERSHIP=true`); skill `operations.md`, Agents.

## Agents

**How should we run agents?**
Recommended: run each agent from the Buzz app of the person responsible for it. Shared bots with a key
of their own are added like members, their keys kept in the shared vault. The relay limits agents'
posting separately from people.
*Facts:* `docs/nips/NIP-OA.md`; skill `operations.md`, Agents; `config.rs` (`BUZZ_RATE_LIMIT_AGENT_*`).

## The server

**Who should have access to the server?**
Recommended: two or three people, each with a personal SSH key and two-factor sign-in on the hosting
account. Whoever can log in can read every message.

**Where should we keep the relay key?** (picture: server, shared vault, backups)
Recommended: on the server plus one copy in a shared vault that only the operator and a backup can
open; encrypt backups, which hold `.env` too. Railway keeps it in variables, Kubernetes in a Secret.
*Facts:* skill `compose.md`, `railway.md`, `kubernetes.md`, `operations.md` (backups include `.env`).

**Who can read our messages?**
Recommended: protect the server like the messages: keep access small, encrypt disks and backups,
consider a private network. Messages, direct messages included, are stored as written.
*Facts:* buzz-app `src/features/relay/direct-messages.ts` (direct messages are ordinary kind 9 messages
in a private channel); push carries only a "reconnect" signal (`docs/research.md`).

**How do we keep a record of who did what?**
Recommended: leave the audit log on (the default), back up the database it lives in, and keep the
hosting provider's access logs. Buzz has no screen for the audit log yet.
*Facts:* `crates/buzz-audit/src/action.rs`, `crates/buzz-audit/src/lib.rs`, `config.rs`
(`BUZZ_AUDIT_ENABLED`, on by default).

## Not verified yet

- Replacing the relay key: what the app shows afterwards, on a test relay. The answers give only the
  step (a new key in `.env`, then a restart).
- Which sign-ins offer Restore from backup in the released app (the code hands backups over from the
  hosted-communities and Builderlab sign-ins).
