// Shifts strongly red texture pixels (e.g. a bright red roof) towards rusty
// brown, keeping their shading. Usage: node recolor.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
const [,, inp, out] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
for (const tex of doc.getRoot().listTextures()) {
  const img = sharp(Buffer.from(tex.getImage()));
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let changed = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 90 && r > g * 1.7 && r > b * 1.7) {
      const l = (r * 0.5 + g * 0.3 + b * 0.2) / 255;
      const n = ((i * 2654435761) >>> 0) / 4294967296; // streaks of variation
      data[i] = Math.min(255, (120 + 40 * n) * l * 1.6);
      data[i + 1] = Math.min(255, (70 + 20 * n) * l * 1.6);
      data[i + 2] = Math.min(255, (45 + 10 * n) * l * 1.6);
      changed++;
    }
  }
  tex.setImage(await sharp(data, { raw: info }).jpeg({ quality: 88 }).toBuffer()).setMimeType('image/jpeg');
  console.log('recoloured pixels', changed);
}
await io.write(out, doc);
