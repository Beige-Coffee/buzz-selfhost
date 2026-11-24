# Phones and notifications

## Use Block's gateway

Your relay can send notifications to the Buzz app from the App Store on an iPhone. It sends them
through Block's push gateway, `push.buzz.xyz`. You don't need an Apple developer account, Apple
push (APNs) credentials or a gateway of your own. Block's notes for its Compose bundle say the same
thing. They read
["To use the public gateway, keep the template's explicit `BUZZ_PUSH_GATEWAY_DELIVERY_URL` and set `BUZZ_PUSH_ENABLED=true`"](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/deploy/compose/README.md#L41).
Each member's iPhone signs up with the gateway on its own while push is on. Nobody types a gateway
address on the phone.

Notifications were tested with relay 0.3.0 and the App Store's app on a locked iPhone. Block calls
push experimental and promises no level of service. Self-hosters asked Block for a supported path
in block/buzz#5206, and that issue is still open. Run the locked-phone test below before your team
relies on notifications, and run it again after each upgrade. The test records say
[what's covered](https://github.com/Beige-Coffee/buzz-selfhost/blob/main/tests/README.md).

## Turn notifications on

The relay sends notifications when it has these two settings:

```dotenv
BUZZ_PUSH_ENABLED=true
BUZZ_PUSH_GATEWAY_DELIVERY_URL=https://push.buzz.xyz/v1/deliveries/apns
```

This guide's server and private-network setups set both, on Docker Compose and on Kubernetes. A
local test leaves notifications off, because a phone can't pair with it. To turn notifications on
yourself, change the file for your setup and restart the relay.

On Docker Compose, the settings go in the `.env` file in the bundle's folder, `buzz/deploy/compose`.
That file starts as a copy of
[Block's `.env.example`](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/deploy/compose/.env.example#L21),
which already has the delivery address and sets `BUZZ_PUSH_ENABLED=false`. Change that line to
`BUZZ_PUSH_ENABLED=true`. To check, run `grep -E '^BUZZ_PUSH_(ENABLED|GATEWAY_DELIVERY_URL)=' .env`.
It shows both lines. Bundles from before 2026-09-15 have neither line. Upgrade those to a newer tag
first ([operations.md](operations.md)). Then restart the relay from the same folder with
`BUZZ_COMPOSE_TLS=true ./run.sh restart`. On a private network, run `./run.sh restart` without
`BUZZ_COMPOSE_TLS=true`. That flag would start Caddy on the public ports. Members lose the
connection for about 20 seconds.

On Kubernetes, the settings go under `relay.extraEnv` in the Helm chart's values file. This guide's
file, `buzz-values.yaml`, already has them ([kubernetes.md](kubernetes.md) step 3):

```yaml
relay:
  extraEnv:
    - {name: BUZZ_PUSH_GATEWAY_DELIVERY_URL, value: "https://push.buzz.xyz/v1/deliveries/apns"}
    - {name: BUZZ_PUSH_ENABLED, value: "true"}
```

After you change the file, apply it with `helm upgrade` and the chart version you installed, as
the Kubernetes Upgrade in [operations.md](operations.md) does.

The relay must be able to reach the gateway over HTTPS. You don't need a gateway token. The relay
signs each request with its own relay key, and each phone vouches for that key when it signs up
([Block's push spec](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/nips/NIP-PL.md#L345)).

## Pair a phone

Pairing copies your private key from the desktop app to the phone. It goes through the pairing
service on your own server, at `/pair`. The push gateway plays no part in it. Block's Compose
bundle doesn't start the pairing service (block/buzz#7721). This guide's setups add it. On
Compose, [compose.md](compose.md) step 9 adds it, and step 8 tells the relay where phones pair.
On Kubernetes, `pairingRelay` in
[kubernetes.md](kubernetes.md) step 3 turns it on, and the extra Ingress under `extraManifests`
there adds its `/pair` route. When the service works, `check-relay.sh` says `PASS` for phone
pairing.

1. In the Buzz desktop app, open Settings, Mobile app. The page is headed Pair mobile.
2. In the Buzz app on the phone, choose Add community and scan the QR code.
3. If the phone asks for six digits, type the ones the desktop shows. If the phone shows a code
   instead, check that it matches the one on the desktop. If they don't match, cancel and start
   again.
4. Choose Codes match on the desktop. That click sends the key to the phone.

Pair where nobody else can see the screen.

A phone can't pair with a local test. This guide doesn't cover pairing on Kubernetes on a private
network.

## Test with the phone locked

1. In the iPhone's Settings, allow notifications for Buzz. In Buzz, turn on
   notifications for the community if the app offers that setting. Check that Focus or another
   iOS limit isn't silencing Buzz.
2. Open Buzz on the phone once and check that it shows the community. On a private network, keep
   Tailscale connected. A phone runs one VPN at a time. Connecting another VPN turns Tailscale off
   until you turn it on again.
3. Lock the phone and leave the desktop app idle. Ask a second member to send you a direct message
   and a message that mentions you. Check that both notifications arrive, and that tapping one
   opens the conversation.
4. If nothing arrives, check the two settings from Turn notifications on, and check that the relay
   can reach the gateway over HTTPS. Then check the phone's notification settings, and whether the
   desktop app was active. A muted channel sends no notification, even for a mention. A passing health check
   doesn't test delivery. A channel message without a mention doesn't count for this test.

## What Block and Apple see

A notification starts as a wake-up signal, and the signal is the same every time. Your relay sends
it to Block's gateway, the gateway passes it to Apple, and Apple wakes the phone. The phone then
fetches the new message from your relay. No message text, sender, channel or member ID
[passes through the gateway](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-push-gateway/src/model.rs#L15).

Block does see your relay's public key, the address its requests come from, and when it wakes which
phone. Block also keeps each phone's Apple push token. Each phone signs up with `push.buzz.xyz`
directly, so Block sees the phone's IP address and which relays it uses too
([the gateway's records](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-push-gateway/src/model.rs#L59-L91),
[Block's push spec](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/nips/NIP-PL.md#L263)).
Apple sees when a phone is woken. On a private network, the phone needs Tailscale connected to
fetch its messages.

If Block must not see when your team's phones wake, turn notifications off. Set
`BUZZ_PUSH_ENABLED=false` and restart the relay, as Turn notifications on describes.

## Android

The Android app can join and read a self-hosted community. It doesn't get notifications in the
background yet. The app's push code is
[iPhone only](https://github.com/block/buzz/blob/1adde0e6bfe732b1b66a1db140596108c5f294a4/mobile/lib/shared/push/push_bridge.dart#L55).
The work to add Android is open in block/buzz#6092 and block/buzz#3229.

## Run your own gateway

The App Store's Buzz app doesn't need a gateway of your own, and it can't use one. The app that
Block distributes has its gateway set when it's built. A gateway of your own needs an Apple
developer identity, Apple push credentials and App Attest configuration. It also needs a phone app
that you build and sign to match. If you build that, follow
[Block's gateway deployment guide](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/push-gateway-deployment.md).
This guide doesn't cover or test that setup.
