// Textures painted on a canvas at start-up: no downloads, no credits.
// Foliage textures have transparent backgrounds for alpha-tested cards.
import * as THREE from 'three';
import { canvasTexture } from '../world.js';

const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

function repeat(tex) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Draws one pointed leaf (an almond shape) with a midrib.
function leaf(g, x, y, len, wid, ang, fill, rib = 'rgba(255,255,220,0.25)') {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.45, -wid, len, 0);
  g.quadraticCurveTo(len * 0.45, wid, 0, 0);
  g.fill();
  g.strokeStyle = rib;
  g.lineWidth = Math.max(1, wid * 0.12);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.95, 0);
  g.stroke();
  g.restore();
}

// Dense cluster of glossy broad leaves for rainforest canopies.
export function broadleafTexture(rand, hue = 95, light = 30) {
  return canvasTexture(256, (g, n) => {
    for (let i = 0; i < 230; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.pow(rand(), 0.55) * n * 0.44;
      const x = n / 2 + Math.cos(a) * r, y = n / 2 + Math.sin(a) * r * 0.85;
      const l = light + rand() * 16 - (r / n) * 10;
      leaf(g, x, y, 14 + rand() * 16, 5 + rand() * 5, rand() * Math.PI * 2, hsl(hue + rand() * 22 - 8, 38 + rand() * 22, l));
    }
    // Sun-catching highlights on the upper side.
    for (let i = 0; i < 40; i++) {
      const x = n * (0.2 + rand() * 0.6), y = n * (0.15 + rand() * 0.4);
      leaf(g, x, y, 12 + rand() * 10, 4 + rand() * 3, rand() * 6.28, hsl(hue - 10 + rand() * 10, 50, light + 22, 0.9));
    }
  });
}

// Oil/coconut palm frond: a long midrib with drooping leaflets either side.
// Drawn along +x from the left edge (the base) to the right (the tip).
export function palmFrondTexture(rand, hue = 88) {
  return canvasTexture(256, (g, n) => {
    const mid = n / 2;
    g.strokeStyle = hsl(50, 30, 32);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, mid);
    g.quadraticCurveTo(n * 0.5, mid - 4, n, mid + 6);
    g.stroke();
    for (let i = 0; i < 64; i++) {
      const t = i / 64;
      const x = 10 + t * (n - 16);
      const y = mid - 4 * Math.sin(t * Math.PI) + t * 6;
      const len = (1 - Math.abs(t - 0.45) * 1.2) * n * 0.42 + 8;
      for (const side of [-1, 1]) {
        const ang = side * (1.15 + rand() * 0.25) - 0.25 + t * 0.2;
        leaf(g, x, y, len * (0.85 + rand() * 0.2), 3 + rand() * 2.5, ang, hsl(hue + rand() * 16, 40 + rand() * 20, 26 + rand() * 16), 'rgba(0,0,0,0)');
      }
    }
  });
}

// Fern frond with finely divided pinnae, base at the bottom.
export function fernTexture(rand, hue = 100) {
  return canvasTexture(256, (g, n) => {
    for (let f = 0; f < 5; f++) {
      const bx = n * (0.3 + f * 0.1), lean = (f - 2) * 0.22;
      g.strokeStyle = hsl(80, 35, 25);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bx, n);
      g.quadraticCurveTo(bx + lean * n * 0.4, n * 0.5, bx + lean * n * 0.9, n * 0.05);
      g.stroke();
      for (let i = 0; i < 30; i++) {
        const t = i / 30;
        const x = bx + lean * n * 0.9 * t * t, y = n - t * n * 0.93;
        const len = (1 - t) * 34 + 6;
        for (const side of [-1, 1]) {
          leaf(g, x, y, len, 3 + (1 - t) * 3, -Math.PI / 2 + side * 1.2 + lean, hsl(hue + rand() * 14, 45 + rand() * 15, 24 + rand() * 18), 'rgba(0,0,0,0)');
        }
      }
    }
  });
}

// Banana / plantain leaf: one big paddle with torn edges. Base at the left.
export function bananaTexture(rand) {
  return canvasTexture(256, (g, n) => {
    const mid = n / 2;
    g.fillStyle = hsl(92, 48, 34);
    g.beginPath();
    g.moveTo(0, mid);
    g.bezierCurveTo(n * 0.2, mid - n * 0.32, n * 0.8, mid - n * 0.34, n, mid);
    g.bezierCurveTo(n * 0.8, mid + n * 0.34, n * 0.2, mid + n * 0.32, 0, mid);
    g.fill();
    // Parallel veins and lighter top half.
    g.fillStyle = hsl(85, 50, 45, 0.35);
    g.fillRect(0, mid - n * 0.3, n, n * 0.3);
    g.strokeStyle = hsl(80, 30, 22, 0.35);
    for (let x = 10; x < n; x += 6) {
      g.beginPath(); g.moveTo(x, mid); g.lineTo(x + 18, mid - n * 0.3); g.moveTo(x, mid); g.lineTo(x + 18, mid + n * 0.3); g.stroke();
    }
    // Wind tears.
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) {
      const x = 30 + rand() * (n - 50), side = rand() < 0.5 ? -1 : 1;
      g.beginPath();
      g.moveTo(x, mid + side * n * 0.36);
      g.lineTo(x + 3 + rand() * 4, mid + side * (n * 0.08 + rand() * n * 0.12));
      g.lineTo(x + 7 + rand() * 4, mid + side * n * 0.36);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = hsl(70, 35, 60);
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, mid); g.lineTo(n, mid); g.stroke();
  });
}

// Heart-shaped elephant-ear / cocoyam leaves, several per card.
export function taroTexture(rand) {
  return canvasTexture(256, (g, n) => {
    for (let i = 0; i < 6; i++) {
      const cx = n * (0.2 + rand() * 0.6), cy = n * (0.25 + rand() * 0.4), s = 40 + rand() * 30;
      g.strokeStyle = hsl(90, 30, 30);
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(n / 2 + (rand() - 0.5) * 30, n); g.stroke();
      g.fillStyle = hsl(95 + rand() * 20, 45, 28 + rand() * 14);
      g.beginPath();
      g.moveTo(cx, cy - s * 0.1);
      g.bezierCurveTo(cx - s, cy - s * 0.9, cx - s * 1.1, cy + s * 0.5, cx, cy + s);
      g.bezierCurveTo(cx + s * 1.1, cy + s * 0.5, cx + s, cy - s * 0.9, cx, cy - s * 0.1);
      g.fill();
      g.strokeStyle = 'rgba(230,240,200,0.3)';
      g.lineWidth = 1.5;
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + k * s * 0.35, cy + s * 0.8); g.stroke(); }
    }
  });
}

// Grass tuft; `hue`/`light` switch between dry gold and lush green.
export function grassTuftTexture(rand, hue = 70, light = 34, blades = 70) {
  return canvasTexture(256, (g, n) => {
    for (let i = 0; i < blades; i++) {
      const x0 = n * (0.2 + rand() * 0.6), h = n * (0.45 + rand() * 0.52), lean = (rand() - 0.5) * n * 0.5, w = 2 + rand() * 3;
      const grad = g.createLinearGradient(0, n, 0, n - h);
      const hh = hue + rand() * 16;
      grad.addColorStop(0, hsl(hh, 40, light * 0.6));
      grad.addColorStop(0.6, hsl(hh, 50, light + rand() * 10));
      grad.addColorStop(1, hsl(hh + 8, 55, light + 18 + rand() * 10));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x0 - w, n);
      g.quadraticCurveTo(x0 + lean * 0.3, n - h * 0.6, x0 + lean, n - h);
      g.quadraticCurveTo(x0 + lean * 0.3 + w * 0.5, n - h * 0.6, x0 + w, n);
      g.fill();
    }
  });
}

// Floating water-lily pads (seen from above), several on one card.
export function lilyTexture(rand) {
  return canvasTexture(128, (g, n) => {
    for (let i = 0; i < 7; i++) {
      const x = n * (0.15 + rand() * 0.7), y = n * (0.15 + rand() * 0.7), r = 8 + rand() * 10, a = rand() * 6.28;
      g.fillStyle = hsl(95 + rand() * 15, 40, 26 + rand() * 12);
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a + 0.3, a + Math.PI * 2 - 0.05); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(200,230,170,0.25)';
      g.beginPath(); g.arc(x, y, r * 0.95, a + 0.3, a + 6.2); g.stroke();
      if (rand() < 0.25) { g.fillStyle = '#f4f0f2'; g.beginPath(); g.arc(x + r * 0.3, y, 2.5, 0, 6.28); g.fill(); }
    }
  });
}

// Hanging vine strands with small leaves; top of the card is the anchor.
export function vineTexture(rand) {
  return canvasTexture(128, (g, n) => {
    for (let v = 0; v < 4; v++) {
      let x = n * (0.15 + v * 0.22 + rand() * 0.05);
      g.strokeStyle = hsl(60, 25, 28);
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y < n; y += 8) { x += (rand() - 0.5) * 3; g.lineTo(x, y); }
      g.stroke();
      for (let y = 4; y < n * (0.6 + rand() * 0.4); y += 5) {
        leaf(g, x + (rand() - 0.5) * 3, y, 6 + rand() * 5, 2.5, rand() < 0.5 ? 0.6 : Math.PI - 0.6, hsl(95 + rand() * 20, 45, 25 + rand() * 15), 'rgba(0,0,0,0)');
      }
    }
  });
}

// Tall maize stalks with ribbon leaves (reference 12 field).
export function maizeTexture(rand) {
  return canvasTexture(128, (g, n) => {
    for (let s = 0; s < 4; s++) {
      const x = n * (0.15 + s * 0.23);
      g.strokeStyle = hsl(65, 35, 40); g.lineWidth = 3;
      g.beginPath(); g.moveTo(x, n); g.lineTo(x + (rand() - 0.5) * 6, 4); g.stroke();
      for (let y = n - 15; y > 15; y -= 12) {
        const side = rand() < 0.5 ? -1 : 1;
        g.strokeStyle = hsl(70 + rand() * 15, 40, 35 + rand() * 15); g.lineWidth = 3.5;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + side * 14, y - 10, x + side * 24, y + 6); g.stroke();
      }
      g.fillStyle = hsl(45, 50, 60); g.fillRect(x - 2, 2, 4, 10); // tassel
    }
  });
}

// ---- Building surfaces ----

// Lime plaster with peeling patches, mildew streaks running down from the
// top and dirt splashed up from the bottom (references 3, 4 and 5).
export function plasterTexture(rand, base = '#e6dcc4', size = 512) {
  return repeat(canvasTexture(size, (g, n) => {
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '120,100,70' : '255,250,235'},${rand() * 0.06})`;
      g.fillRect(rand() * n, rand() * n, 6 + rand() * 30, 6 + rand() * 30);
    }
    // Peeled patches show the grey render or (rarely) brick beneath.
    for (let i = 0; i < 22; i++) {
      const x = rand() * n, y = rand() * n, w = 6 + rand() * 22, h = 4 + rand() * 16;
      g.fillStyle = rand() < 0.85 ? '#aea592' : '#9a6a52';
      g.beginPath();
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        g.lineTo(x + Math.cos(a) * w * (0.6 + rand() * 0.4), y + Math.sin(a) * h * (0.6 + rand() * 0.4));
      }
      g.fill();
      g.strokeStyle = 'rgba(90,70,50,0.35)';
      g.stroke();
    }
    // Mildew streaks.
    for (let i = 0; i < 40; i++) {
      const x = rand() * n, len = n * (0.1 + rand() * 0.45);
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(60,62,45,0.28)');
      grad.addColorStop(1, 'rgba(60,62,45,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, 2 + rand() * 8, len);
    }
    // Hairline cracks.
    g.strokeStyle = 'rgba(70,60,50,0.4)';
    for (let i = 0; i < 12; i++) {
      let x = rand() * n, y = rand() * n;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rand() - 0.5) * 30; y += rand() * 20; g.lineTo(x, y); }
      g.stroke();
    }
  }));
}

export function concreteTexture(rand) {
  return repeat(canvasTexture(256, (g, n) => {
    g.fillStyle = '#b3aa98';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) {
      const v = rand() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${rand() * 0.07})`;
      g.fillRect(rand() * n, rand() * n, 2 + rand() * 6, 2 + rand() * 6);
    }
    for (let i = 0; i < 20; i++) {
      const x = rand() * n, len = n * (0.2 + rand() * 0.6);
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(50,45,35,0.3)'); grad.addColorStop(1, 'rgba(50,45,35,0)');
      g.fillStyle = grad; g.fillRect(x, 0, 3 + rand() * 12, len);
    }
    // Form-work seams.
    g.strokeStyle = 'rgba(60,55,45,0.35)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, n / 2); g.lineTo(n, n / 2); g.moveTo(n / 2, 0); g.lineTo(n / 2, n); g.stroke();
  }));
}

// Corrugated iron: ridged stripes, rust blooms and a faded painted base.
export function corrugatedTexture(rand, paint = '#7d7f78') {
  return repeat(canvasTexture(256, (g, n) => {
    g.fillStyle = paint;
    g.fillRect(0, 0, n, n);
    for (let x = 0; x < n; x += 8) {
      const grad = g.createLinearGradient(x, 0, x + 8, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.28)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = grad; g.fillRect(x, 0, 8, n);
    }
    for (let i = 0; i < 70; i++) {
      const x = rand() * n, y = rand() * n, r = 6 + rand() * 40;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const c = rand() < 0.7 ? '150,72,32' : '95,50,28';
      grad.addColorStop(0, `rgba(${c},0.8)`); grad.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Rust runs down the sheet.
    for (let i = 0; i < 30; i++) {
      const x = rand() * n;
      g.fillStyle = `rgba(120,55,25,${0.2 + rand() * 0.3})`;
      g.fillRect(x, rand() * n * 0.5, 2 + rand() * 3, n * (0.2 + rand() * 0.5));
    }
  }));
}

// Weathered planks with gaps; boards run along u.
export function planksTexture(rand, tone = 32, light = 34) {
  return repeat(canvasTexture(256, (g, n) => {
    const boards = 8;
    for (let b = 0; b < boards; b++) {
      const y = (b / boards) * n, h = n / boards;
      g.fillStyle = hsl(tone + rand() * 8, 18 + rand() * 12, light - 6 + rand() * 12);
      g.fillRect(0, y, n, h);
      for (let k = 0; k < 18; k++) {
        g.fillStyle = `rgba(30,20,10,${rand() * 0.2})`;
        g.fillRect(0, y + rand() * h, n, 1);
      }
      g.fillStyle = 'rgba(20,14,8,0.85)';
      g.fillRect(0, y, n, 2); // gap between boards
      if (rand() < 0.5) { g.fillStyle = 'rgba(40,30,20,0.7)'; g.beginPath(); g.arc(rand() * n, y + h / 2, 2 + rand() * 3, 0, 6.28); g.fill(); }
    }
    // Green damp on some boards.
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `rgba(70,90,40,${rand() * 0.25})`;
      g.fillRect(rand() * n, rand() * n, 20 + rand() * 40, 6 + rand() * 20);
    }
  }));
}

// Bark: vertical fissures for tree trunks and posts.
export function barkTexture(rand, base = '#6b5a48') {
  return repeat(canvasTexture(128, (g, n) => {
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(30,22,15,${0.2 + rand() * 0.4})`;
      g.lineWidth = 1 + rand() * 2;
      let x = rand() * n;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= n; y += 16) { x += (rand() - 0.5) * 6; g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '160,170,140' : '90,110,60'},${rand() * 0.3})`;
      g.fillRect(rand() * n, rand() * n, 4 + rand() * 14, 3 + rand() * 10);
    }
  }));
}
