// The 9JA RESCUE logo, drawn in SVG so it stays sharp at every size: worn
// off-white "9JA" with the map of Nigeria in the 9, a mountain with a gold
// sun and an acacia, and gold "RESCUE" below. One treatment on every screen.
let n = 0;
const NIGERIA = 'M2 30 L8 22 L10 10 L22 4 L40 8 L55 5 L70 3 L82 8 L92 2 L98 10 L94 25 L98 35 L90 48 L85 60 L80 66 L72 78 L64 80 L58 92 L50 96 L42 90 L34 94 L26 86 L16 82 L8 82 L4 70 L3 50 Z';

export function logo(cls = '') {
  const id = `lg${n++}`;
  return `<svg class="logo ${cls}" viewBox="0 0 400 262" role="img" aria-label="9JA Rescue">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe591"/><stop offset="0.45" stop-color="#f1bd3c"/><stop offset="1" stop-color="#a86e14"/>
    </linearGradient>
    <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbf7ec"/><stop offset="1" stop-color="#d8cfb6"/>
    </linearGradient>
    <filter id="${id}w" x="-5%" y="-5%" width="110%" height="115%">
      <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -22 16.4" result="m"/>
      <feComposite in="SourceGraphic" in2="m" operator="in" result="worn"/>
      <feDropShadow in="worn" dx="0" dy="3" stdDeviation="2.5" flood-color="#06120c" flood-opacity="0.85"/>
    </filter>
  </defs>
  <circle cx="330" cy="70" r="40" fill="url(#${id}g)"/>
  <g fill="#122218" transform="translate(-22 -4)">
    <path d="M362 112 L359 84 C 356 76, 350 70, 342 66 L345 65 C 351 68, 356 72, 360 78 L362 66 L365 66 L364 80 C 368 74, 374 70, 381 67 L383 69 C 375 73, 369 79, 366 87 L366 112 Z"/>
    <path d="M326 64 C 336 56, 384 55, 392 64 C 380 67, 338 68, 326 64 Z"/>
    <path d="M346 58 C 352 51, 372 51, 378 58 C 368 60, 356 60, 346 58 Z"/>
  </g>
  <g filter="url(#${id}w)">
    <path d="M228 156 L306 80 L324 96 L344 86 L392 156 Z" fill="#1a3a28"/>
    <path d="M306 80 L295 93 L303 92 L307 99 L314 91 L322 94 Z M344 86 L337 94 L344 95 L351 92 Z" fill="#f4f1e6"/>
    <text x="30" y="156" font-family="Anton, 'Barlow Condensed', Impact, sans-serif" font-size="140" fill="url(#${id}c)" stroke="#0b1a12" stroke-width="5" paint-order="stroke" letter-spacing="-2">9JA</text>
    <path d="${NIGERIA}" transform="translate(66 52) scale(0.3)" fill="#2a7a42" stroke="#0b1a12" stroke-width="4"/>
    <text x="200" y="248" text-anchor="middle" font-family="Anton, 'Barlow Condensed', Impact, sans-serif" font-size="98" fill="url(#${id}g)" stroke="#0b1a12" stroke-width="5" paint-order="stroke" letter-spacing="3">RESCUE</text>
  </g>
</svg>`;
}
