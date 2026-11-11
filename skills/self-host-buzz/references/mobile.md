# Phones and notifications

## Use Block's gateway with the official iPhone app

Your self-hosted relay can send iPhone wake-ups through Block's push gateway. You do not need an
Apple developer account, APNs certificate or a gateway of your own for this path. The official
app handles registration; there is no gateway address for a member to find in Settings.

Push is experimental and best effort. Run the locked-phone check below with your current app
and relay before relying on it. See the [recorded validation coverage](https://github.com/Beige-Coffee/buzz-selfhost/blob/main/tests/README.md).

## Configure the relay, not Apple's credentials

For the Compose bundle, both values belong in the deployment's `.env` and must reach the relay
process. The bundle supplies the delivery URL but leaves push off until enabled:

```dotenv
BUZZ_PUSH_ENABLED=true
BUZZ_PUSH_GATEWAY_DELIVERY_URL=https://push.buzz.xyz/v1/deliveries/apns
```

Use the setup's restart procedure after changing its environment. The Kubernetes steps provide
the corresponding relay settings. A custom deployment must pass both variables itself; an
unrelated shell file is not enough. The default executor key ID is `relay-v1`; it is not an Apple
credential. Keep outbound HTTPS to the gateway available. The relay and app authenticate and
register automatically; do not invent a gateway API token.

Source: [bundle defaults](https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/deploy/compose/.env.example#L23)
and [relay validation](https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/crates/buzz-relay/src/config.rs#L1177).

## Pairing, wake-ups and messages are different

Pairing uses your deployment's `/pair` service to transfer the identity to the phone. It is not
the notification gateway. In the desktop app choose Settings, Pair mobile; on the phone choose
Add community, scan the QR code, enter the displayed code, compare the confirmation shown on both devices and choose Codes match
only if they agree. If they do not, cancel and start again.
Do this where nobody else can see the pairing screen.

A notification wake-up travels through Block and Apple. The phone then fetches message content
from your relay. No message text travels through the wake-up gateway, but Block sees the relay's
public key, source address and delivery timing/device metadata. On a private network, the phone
needs Tailscale connected to fetch its messages. Local tests cannot pair phones, and this guide
does not cover pairing on private Kubernetes.

## Test a locked phone

1. Allow Buzz notifications in iOS, and enable Notifications for the community in Buzz when
   the control is available. Check Focus and other iOS notification restrictions.
2. Confirm the phone can read the community with the app open. A paired phone can still have
   notifications disabled. On a private network, confirm Tailscale stays connected.
3. With the phone locked and the desktop inactive, have a second test identity send a DM and an
   explicit mention. Check arrival, the displayed content and the conversation opened on tap.
4. If nothing arrives, check relay capability/configuration, client registration and preferences,
   outbound connectivity and desktop suppression. A successful liveness or capability check does
   not test delivery. Plain channel messages and thread replies without mentions are not this test.

Android messaging is available, but this guide does not promise Android background push. The
reviewed [notification controls](https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/mobile/lib/features/settings/settings_page/notifications_section.dart#L7)
and native push path are iOS-only. Check platform support before depending on notifications.

## When you would run a gateway yourself

An operator-owned gateway needs matching Apple application identity, APNs credentials and App
Attest configuration, plus a matching custom-signed phone app. It is not a drop-in replacement
for the gateway in Block's distributed app. That app selects its gateway at build time.
Follow [Block's gateway deployment guide](https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/docs/push-gateway-deployment.md)
only for that separate deployment. It is outside this guide's tested setup.
