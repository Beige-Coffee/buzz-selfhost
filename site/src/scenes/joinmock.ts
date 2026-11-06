import { TABLER } from "./tabler";

/**
 * Buzz 1.0's first-run pages after its first screen, recreated in light mode from block/buzz-app as
 * released in v0.7.0-preview.248.1 (#2579): a white card on Buzz's chartreuse, with the bee in the
 * corner (src/features/identity/OnboardingScreen.tsx, IdentitySetup.module.css). The guide's join step
 * shows Join a community, which Other options opens (Welcome.tsx, CommunityUrlField.tsx); the
 * click-throughs use the same card for the pages after it.
 */
const icon = (name: string) => `<svg class="tb-i" viewBox="0 0 24 24" aria-hidden="true">${TABLER[name]}</svg>`;

/** A step page: the window, the bee in its corner, and the card. */
export const onboardingStep = (card: string, cls = "") => `<div class="j1-win${cls ? ` ${cls}` : ""}">
  <div class="b1-lights" aria-hidden="true"><i></i><i></i><i></i></div>
  <svg class="j1-bee" viewBox="0 0 466 309" aria-hidden="true"><use href="#bee"/></svg>
  <div class="j1-card">${card}</div>
</div>`;

/** The round Back button the step pages share (OnboardingBack.tsx). */
export const BACK = `<span class="j1-back">${icon("arrow-left")}</span>`;

/** Join a community: a community's address or an invite link, then Continue. */
export const joinCard = (value: string, hot = false) =>
  onboardingStep(`<h4 class="j1-h">Join a community</h4>
  <p class="j1-sub">Enter a community address or an invite link to continue.</p>
  <p class="j1-lab">Community address or invite link</p>
  <div class="j1-input">${value}</div>
  <div class="j1-acts">${BACK}<span class="j1-go${hot ? " hot" : ""}">Continue</span></div>`);

export function joinMockHTML(): string {
  return `
<figure class="join-mock">
  ${joinCard(`<span data-tpl>{{RELAY_URL}}</span>`)}
  <figcaption class="src">Recreated from Buzz's first run: <b>Other options</b> opens this page. Paste your community's address, or an invite link.</figcaption>
</figure>`;
}
