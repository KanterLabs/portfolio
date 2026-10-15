/** Authoring utility: render the sharing image with checksum-pinned site fonts.
 * Run manually with `node site/scripts/build-social-preview.mjs`.
 * Font downloads happen only here; site builds and the deployed site are offline.
 */
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const revision = '94301472b4d809299b4775bc6502592b83dd6934';
const fonts = [
  ['ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf', 'acad6de1fc93436f5c0f1f4137751ef04f1aea3063e7036535970ffcfbd79f72'],
  ['ofl/instrumentserif/InstrumentSerif-Italic.ttf', '08939b8bdf534afec24ae0ef5e03f948940cd9a8fe08e7fecbad040e62327385'],
];
const temp = await mkdtemp(join(tmpdir(), 'portfolio-social-'));
try {
  for (const [index, [path, expected]] of fonts.entries()) {
    const response = await fetch(`https://raw.githubusercontent.com/google/fonts/${revision}/${path}`);
    if (!response.ok) throw new Error(`Font download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Font checksum mismatch');
    await writeFile(join(temp, `${index}.ttf`), bytes);
  }
  const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  const config = join(temp, 'fonts.conf');
  await writeFile(config, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><include>/etc/fonts/fonts.conf</include><dir>${escapeXml(temp)}</dir><cachedir>${escapeXml(temp)}</cachedir></fontconfig>`);
  process.env.FONTCONFIG_FILE = config;
  const { default: sharp } = await import('sharp');
  const output = join(root, 'public/og/portfolio-rack-v2.png');
  await sharp(join(root, 'public/og/portfolio-rack-v2.svg')).png().toFile(output);
  const { width, height } = await sharp(output).metadata();
  console.log(JSON.stringify({ output, width, height, bytes: (await stat(output)).size }));
} finally {
  await rm(temp, { recursive: true, force: true });
}
