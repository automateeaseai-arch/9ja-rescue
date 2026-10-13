import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, prune, dedup, weld } from '@gltf-transform/functions';
import sharp from 'sharp';
const [,, base, walk, run, out] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(base);
const root = doc.getRoot();
const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
for (const a of root.listAnimations()) a.setName(a.getName() === '' ? 'ReferencePose' : a.getName());
for (const [file, name] of [[walk, 'Walk'], [run, 'Run']]) {
  const src = await io.read(file);
  const sa = src.getRoot().listAnimations()[0];
  const anim = doc.createAnimation(name);
  for (const ch of sa.listChannels()) {
    const target = byName.get(ch.getTargetNode().getName());
    if (!target) continue;
    const s = ch.getSampler();
    const input = doc.createAccessor().setArray(s.getInput().getArray().slice()).setType('SCALAR');
    const output = doc.createAccessor().setArray(s.getOutput().getArray().slice()).setType(s.getOutput().getType());
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
}
const buf = root.listBuffers()[0];
for (const a of root.listAccessors()) a.setBuffer(buf);
await doc.transform(weld(), dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 85 }));
await io.write(out, doc);
