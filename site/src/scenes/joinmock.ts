/**
 * Buzz 1.0's first-run "Join a community" screen, recreated in light mode: one field, Join, and Create a community.
 * Wording from block/buzz-app src/features/communities/CommunityLanding.tsx.
 */
export function joinMockHTML(): string {
  return `
<figure class="join-mock">
  <div class="j1-win">
    <div class="b1-lights" aria-hidden="true"><i></i><i></i><i></i></div>
    <h4>Join a community</h4>
    <p class="j1-lab">Invite link or community URL</p>
    <div class="j1-input"><span data-tpl>{{RELAY_URL}}</span></div>
    <div class="j1-join">Join</div>
    <p class="j1-create">Create a community</p>
  </div>
  <figcaption class="src">Recreated from Buzz 1.0's first screen. Paste your community's address, or an invite link.</figcaption>
</figure>`;
}
