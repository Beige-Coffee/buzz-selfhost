# Umbrel submission assets

For the pull request's "screenshots and a logo reference". Umbrel makes the final App Store
gallery from them.

## Logo

Buzz's own, from [block/buzz-app](https://github.com/block/buzz-app):

- The app icon, 512 × 512 PNG:
  [`public/app-icon.png`](https://github.com/block/buzz-app/blob/main/public/app-icon.png), the
  yellow-green mark (`#d7d72e`) on black.
- The mark alone, as SVG:
  [`public/buzz-mark.svg`](https://github.com/block/buzz-app/blob/main/public/buzz-mark.svg).

## Screenshots

1440 × 900 at twice the pixel density, from the page's local previews
(`tests/umbrel/local/preview.py`), so only sample data shows. They show the page's image 1.1.0, with
Buzz's screens drawn from Buzz 1.0.5. The run logs in [`tests/runs/`](../../tests/runs/) say how each
was taken; the last time was on 2026-11-18, when 04 came out the same and the others were retaken.

1. [`01-setup.png`](screenshots/01-setup.png): the setup page as it opens.
2. [`02-public-id.png`](screenshots/02-public-id.png): where to find the public ID, in a drawing of
   Buzz's own Settings.
3. [`03-options.png`](screenshots/03-options.png): the three ways in, each with who it's for, with
   your own domain chosen and the full address under its boxes.
4. [`04-cloudflare.png`](screenshots/04-cloudflare.png): connecting your own domain with one
   Cloudflare sign-in, with a bar that shows what's done and what's yours to do.
5. [`05-live.png`](screenshots/05-live.png): the community live, its checks in one card, and the
   next steps as a guide: join, invite people, keep it safe and pair a phone.
6. [`06-add-members.png`](screenshots/06-add-members.png): inviting people with an invite link, a
   step of the guide, in a drawing of Buzz's Membership.
