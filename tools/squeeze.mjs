// Shrinks a GLB for slow phone connections: WebP textures (max 1024 px) and
// meshopt-compressed geometry/animation. Usage: node squeeze.mjs in.glb out.glb [texSize]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
const [,, inp, out, size = '1024'] = process.argv;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const n = +size;
await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [n, n], quality: 80 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
