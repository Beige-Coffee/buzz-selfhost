/**
 * Buzz Desktop's "Join a community" onboarding screen, recreated.
 * Wording from desktop/src/features/communities/ui/WelcomeSetup.tsx.
 */
export function joinMockHTML(opts: { url?: boolean; npub?: string } = {}): string {
  const showUrl = opts.url ?? true;
  return `
<figure class="join-mock">
  <div class="jm-window">
    <div class="jm-dots" aria-hidden="true"><i></i><i></i><i></i></div>
    <h4>Join a community</h4>
    <p class="jm-sub">Enter the invite link or community URL you received.</p>
    <div class="jm-input${showUrl ? "" : " empty"}">
      <span class="jm-val" ${showUrl ? "data-tpl" : ""}>${showUrl ? "{{RELAY_URL}}" : "Invite link or community URL"}</span>
      <span class="jm-go" aria-hidden="true">→</span>
    </div>
    <div class="jm-private">
      <b>Joining a private community?</b>
      <p>Some communities need the owner to add you before you can join. Copy your public ID and send it to the community owner.</p>
      <div class="jm-npub"><code>${opts.npub ?? "npub1q3x…8kzv"}</code><span class="jm-copy">Copy public ID</span></div>
    </div>
  </div>
  <figcaption class="src">Recreated from Buzz Desktop's onboarding screen (WelcomeSetup.tsx). The npub is an example.</figcaption>
</figure>`;
}
