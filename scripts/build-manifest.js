/*
  Build data/collection.json (the 64-piece manifest) from window.nfts in index.html.
  Run: node scripts/build-manifest.js
  Fails loudly on a null origin unless the piece is in ALLOW_NULL_ORIGIN.
*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const EXPECTED_PIECES = 64;
// Piece 19 (EclipseBow #3) has no inscriptionId on the site yet. Remove once filled in.
const ALLOW_NULL_ORIGIN = new Set([19]);

function parseNfts(indexHtml) {
  const marker = 'window.nfts = [';
  const start = indexHtml.indexOf(marker);
  if (start === -1) throw new Error('window.nfts not found in index.html');
  const arrStart = start + marker.length - 1;
  const arrEnd = indexHtml.indexOf('];', arrStart) + 1;
  const sandbox = {};
  new vm.Script('_ = ' + indexHtml.slice(arrStart, arrEnd)).runInNewContext(sandbox);
  return sandbox._;
}

function buildManifest(nfts) {
  return nfts.map((n, i) => {
    const image = `images/${n.id}.JPG`;
    return {
      piece: i + 1,
      id: n.id,
      name: n.title,
      subtitle: n.subtitle || '',
      rarity: n.rarity || 'Common',
      origin: n.inscriptionId ? `${n.inscriptionId}_0` : null,
      image: fs.existsSync(path.join(ROOT, image)) ? image.replace(/#/g, '%23') : null,
      // Printify product's external.id (the number in its printify.me link): maps a print sale to this piece
      printifyId: ((n.printifyUrl || '').match(/\/product\/(\d+)/) || [])[1] || null,
    };
  });
}

function validateManifest(manifest, allowNull = ALLOW_NULL_ORIGIN) {
  const errors = [];
  if (manifest.length !== EXPECTED_PIECES) errors.push(`expected ${EXPECTED_PIECES} pieces, got ${manifest.length}`);
  const seen = new Set();
  for (const p of manifest) {
    if (!p.origin) {
      if (!allowNull.has(p.piece)) errors.push(`piece ${p.piece} (${p.name}) has no origin`);
      continue;
    }
    if (!/^[0-9a-f]{64}_\d+$/.test(p.origin)) errors.push(`piece ${p.piece} has a malformed origin: ${p.origin}`);
    if (seen.has(p.origin)) errors.push(`duplicate origin ${p.origin} (piece ${p.piece})`);
    seen.add(p.origin);
  }
  return errors;
}

if (require.main === module) {
  const manifest = buildManifest(parseNfts(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
  const errors = validateManifest(manifest);
  if (errors.length) {
    console.error('Manifest invalid:\n - ' + errors.join('\n - '));
    process.exit(1);
  }
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data', 'collection.json'), JSON.stringify(manifest, null, 2) + '\n');
  const missing = manifest.filter(p => !p.origin).map(p => `#${p.piece} ${p.name}`);
  const noImage = manifest.filter(p => !p.image).map(p => `#${p.piece} ${p.name}`);
  console.log(`Wrote data/collection.json: ${manifest.length} pieces.`);
  if (missing.length) console.warn('Pieces without an origin (skipped by the checker): ' + missing.join(', '));
  if (noImage.length) console.warn('Pieces without an image file: ' + noImage.join(', '));
}

module.exports = { parseNfts, buildManifest, validateManifest };
