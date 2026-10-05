/**
 * Shared inline SVG defs, injected once per page:
 *  - #bee        the Buzz bee mark (geometry from admin-web/public/favicon.svg)
 *  - #buzz-grain the wordmark blur+grain filter (recipe from BuzzLogoAnimation.tsx)
 *  - #block-mark Block's 3x3 mark (from block.xyz, 2026-09-30)
 */
export const SVG_DEFS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <mask id="bee-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="466" height="309">
      <circle cx="91.7" cy="154.5" r="91.7" fill="white"/>
      <circle cx="374.3" cy="154.5" r="91.7" fill="white"/>
      <rect x="128" y="0" width="210" height="309" rx="34" fill="white"/>
      <circle cx="193.3" cy="84.4" r="27" fill="black"/>
      <circle cx="276" cy="84.4" r="27" fill="black"/>
      <rect x="166.3" y="157.2" width="136.9" height="38.3" rx="5" fill="black"/>
      <rect x="166.9" y="235.1" width="136.2" height="37.6" rx="5" fill="black"/>
    </mask>
    <symbol id="bee" viewBox="0 0 466 309">
      <rect width="466" height="309" mask="url(#bee-mask)" fill="currentColor"/>
    </symbol>
    <symbol id="block-mark" viewBox="0 0 44 44">
      <rect x="0" y="0" width="12" height="12" rx="2" fill="currentColor"/><rect x="16" y="0" width="12" height="12" rx="2" fill="currentColor"/><rect x="32" y="0" width="12" height="12" rx="2" fill="currentColor"/>
      <rect x="0" y="16" width="12" height="12" rx="2" fill="currentColor"/><rect x="16" y="16" width="12" height="12" rx="2" fill="currentColor"/><rect x="32" y="16" width="12" height="12" rx="2" fill="currentColor"/>
      <rect x="0" y="32" width="12" height="12" rx="2" fill="currentColor"/><rect x="16" y="32" width="12" height="12" rx="2" fill="currentColor"/><rect x="32" y="32" width="12" height="12" rx="2" fill="currentColor"/>
    </symbol>
    <filter id="buzz-grain" x="-25%" y="-45%" width="150%" height="190%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3.4" result="softLogo"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.86" numOctaves="5" seed="7" result="textureNoise"/>
      <feDisplacementMap in="softLogo" in2="textureNoise" scale="6" xChannelSelector="R" yChannelSelector="G" result="buzzed"/>
      <feColorMatrix in="textureNoise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .3 .3 .3 0 0" result="grainAlpha"/>
      <feComposite in="buzzed" in2="grainAlpha" operator="in" result="grain"/>
      <feMerge><feMergeNode in="buzzed"/><feMergeNode in="grain"/></feMerge>
    </filter>
  </defs>
</svg>`;

export const bee = (attrs = "") =>
  `<svg viewBox="0 0 466 309" ${attrs} aria-hidden="true"><use href="#bee"/></svg>`;

export const blockMark = (attrs = "") =>
  `<svg viewBox="0 0 44 44" ${attrs} role="img" aria-label="Block"><use href="#block-mark"/></svg>`;
