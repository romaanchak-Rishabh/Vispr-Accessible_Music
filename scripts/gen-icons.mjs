// Generates all PWA icon PNGs from the SVG sources in design/red/.
// Requires the `sharp` dev dependency (SVG -> PNG via libvips).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const { default: sharp } = await import('sharp');

mkdirSync('public/icons', { recursive: true });

async function render(svgPath, outPath, size) {
  const svg = readFileSync(svgPath);
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`wrote ${outPath} (${size}x${size})`);
}

await render('design/red/v1-centered-night.svg', 'public/icons/icon-192.png', 192);
await render('design/red/v1-centered-night.svg', 'public/icons/icon-512.png', 512);
await render('design/red/v1-centered-maskable.svg', 'public/icons/icon-maskable-512.png', 512);

// favicon: same artwork as an SVG (browsers scale it)
writeFileSync('public/favicon.svg', readFileSync('design/red/v1-centered-night.svg'));
console.log('wrote public/favicon.svg');
console.log('icons generated');
