// The 9JA RESCUE logo: the owner's artwork (15 Oct; the rescuer above "9JA
// RESCUE" in cream, green and gold), one image on every screen. Transparent
// WebP, 560 px wide, about 1.14 : 1.
export function logo(cls = '') {
  return `<img class="logo ${cls}" src="ui/logo.webp" alt="9JA Rescue" width="560" height="490" decoding="async" draggable="false">`;
}
