const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const manifest = require('../../data/collection.json');
const SM = path.join(__dirname, '..', '..', 'images', 'sm');

test('every piece has a small image copy under 300 KB', () => {
  for (const piece of manifest) {
    const file = path.join(SM, `${piece.id}.JPG`);
    assert.ok(fs.existsSync(file), `missing images/sm/${piece.id}.JPG — run python scripts/make-thumbs.py`);
    assert.ok(fs.statSync(file).size < 300 * 1024, `images/sm/${piece.id}.JPG is too large`);
  }
});
