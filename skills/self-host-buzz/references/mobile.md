# Phones and notifications

## Use Block's gateway

A self-hosted relay can wake the App Store's Buzz app on an iPhone through Block's push gateway,
`push.buzz.xyz`. You need no Apple developer account, no Apple push (APNs) credentials and no
gateway of your own. Block's own notes for the bundle say so:
["To use the public gateway, keep the template's explicit `BUZZ_PUSH_GATEWAY_DELIVERY_URL` and set `BUZZ_PUSH_ENABLED=true`"](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/deploy/compose/README.md#L41).
The app registers by itself: there is no gateway address to type on the phone.

It worked in this guide's tests on 2026-10-23 and 2026-10-27, with a locked iPhone on the App
Store's app. Block calls push experimental and promises no level of service, and the request
from self-hosters for a supported path, block/buzz#5206, is still open. So run the locked-phone
test below before a team relies on it, and again after an upgrade. Test records:
[what's covered](https://github.com/Beige-Coffee/buzz-selfhost/blob/main/tests/README.md).

## Turn notifications on

This guide's server setups turn notifications on; a local test has no use for them. By hand, both
lines go in the deployment's `.env`, where the relay reads them. The bundle
[ships the delivery address and leaves push off](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/deploy/compose/.env.example#L21):

```dotenv
BUZZ_PUSH_ENABLED=true
BUZZ_PUSH_GATEWAY_DELIVERY_URL=https://push.buzz.xyz/v1/deliveries/apns
```

Restart the relay the way your setup's steps do. The Kubernetes steps set the same two values.
The relay needs outbound HTTPS to the gateway. It signs each request with its own relay key, and
each phone vouches for that key when it signs up, so there is no gateway token to request or
paste ([relay settings](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-relay/src/config.rs#L1139)).

## Pair a phone

Pairing copies your private key to the phone through your own deployment's `/pair` service. It
has nothing to do with the push gateway. In the desktop app choose Settings, Mobile app: its page
is headed Pair mobile. On the phone choose Add community and scan the QR code. Type the desktop's
six digits if the phone asks for them, or check that they match if the phone shows a code. Then
choose Codes match on the desktop: that click sends the key. Pair where nobody else can see the
screen.

A local test can't pair phones. This guide doesn't cover pairing on private Kubernetes.

## Test with the phone locked

1. Allow Buzz notifications in iOS, and turn on notifications for the community in Buzz where the
   app offers it. Check Focus and other iOS limits.
2. Open the app once and confirm the phone can read the community. On a private network, keep
   Tailscale connected: a phone runs one VPN at a time, and connecting another switches
   Tailscale off until you turn it on again.
3. Lock the phone and leave the desktop app idle. Have a second member send you a direct message
   and a mention. Check that both arrive and that a tap opens the conversation.
4. Nothing arrives? Check the two settings above, the relay's outbound HTTPS, the phone's
   notification settings and whether the desktop app was active. A muted channel does not notify,
   even for a mention. A passing health check does not test delivery, and plain channel messages
   without a mention are not this test.

## What Block and Apple see

The wake-up travels through Block and Apple, and it is the same fixed signal every time. The
phone then fetches the message from your relay. No message text, sender, channel or member ID
[passes through the gateway](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-push-gateway/src/model.rs#L15). Block does see
your relay's public key, the address its requests come from and when it wakes which phone, and it
keeps each phone's Apple push token. Apple sees when a phone is woken. On a private network the
phone needs Tailscale connected to fetch its messages. Turn notifications off with
`BUZZ_PUSH_ENABLED=false` if Block must not see when your team's phones wake.

## Android

The Android app can join and read a self-hosted community. It gets no notifications in the
background yet: the app's push path is
[iPhone only](https://github.com/block/buzz/blob/1adde0e6bfe732b1b66a1db140596108c5f294a4/mobile/lib/shared/push/push_bridge.dart#L55), and the work to add Android,
block/buzz#6092 and block/buzz#3229, is open.

## Run your own gateway

You don't need one for the App Store's app, and one of your own can't serve it. A gateway needs an
Apple developer identity, Apple push credentials and App Attest configuration, plus a phone app
you build and sign to match: the app Block distributes picks its gateway when it is built. Follow
[Block's gateway deployment guide](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/docs/push-gateway-deployment.md)
only for that separate deployment. It is outside this guide's tested setups.
