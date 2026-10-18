const test = require('node:test');
const assert = require('node:assert');
const G = require('../../js/gallery.js');

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const nfts = [
  { id: 'Beta#1', title: 'Beta #1', subtitle: 'Soft glow', rarity: 'Common', inscriptionId: B, printifyUrl: 'https://ordinalrainbows.printify.me/product/1/beta' },
  { id: 'Alpha', title: 'Alpha', subtitle: 'Golden light', rarity: 'Exotic', inscriptionId: A, printifyUrl: 'https://ordinalrainbows.printify.me/product/2/alpha' },
  { id: 'Gamma', title: 'Gamma', subtitle: 'Dark threshold', rarity: 'Rare', inscriptionId: null, printifyUrl: null },
];
const base = { search: '', sort: 'alpha', rarity: 'all', onlyMine: false };
const ctx = { owned: new Set(), rewards: {} };
const ids = list => list.map(n => n.id);

test('sorts A–Z by default', () => {
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, base, ctx)), ['Alpha', 'Beta#1', 'Gamma']);
});

test('search matches title, subtitle or rarity, ignoring case', () => {
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, search: 'GOLDEN' }, ctx)), ['Alpha']);
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, search: 'rare' }, ctx)), ['Gamma']);
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, search: '  beta ' }, ctx)), ['Beta#1']);
});

test('rarity filter keeps only that rarity', () => {
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, rarity: 'Common' }, ctx)), ['Beta#1']);
});

test('rarity sorts high→low and low→high', () => {
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, sort: 'rarity-high' }, ctx)), ['Alpha', 'Gamma', 'Beta#1']);
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, sort: 'rarity-low' }, ctx)), ['Beta#1', 'Gamma', 'Alpha']);
});

test('rewards-waiting sort puts pieces with the most BSV first, then A–Z', () => {
  const rewards = { [B]: 5000, [A]: 2000 };
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, sort: 'rewards' }, { owned: new Set(), rewards })), ['Beta#1', 'Alpha', 'Gamma']);
});

test('only-mine shows only pieces in the connected wallet', () => {
  assert.deepStrictEqual(ids(G.filterAndSort(nfts, { ...base, onlyMine: true }, { owned: new Set([B]), rewards: {} })), ['Beta#1']);
});

test('does not reorder the original array', () => {
  const copy = nfts.map(n => n.id);
  G.filterAndSort(nfts, { ...base, sort: 'rarity-high' }, ctx);
  assert.deepStrictEqual(nfts.map(n => n.id), copy);
});

test('connected wallet with no pieces: only-mine is empty and says why', () => {
  assert.deepStrictEqual(G.filterAndSort(nfts, { ...base, onlyMine: true }, ctx), []);
  assert.match(G.emptyMessage({ ...base, onlyMine: true }, true), /No ORDINAL•RAINBOWS pieces in your wallet yet/);
  assert.match(G.emptyMessage({ ...base, onlyMine: true }, false), /Connect your Yours Wallet/);
  assert.match(G.emptyMessage({ ...base, search: 'zzz' }, true), /No pieces match/);
});

test('disconnecting turns only-mine off; staying connected keeps it', () => {
  assert.strictEqual(G.nextFilters({ ...base, onlyMine: true }, false).onlyMine, false);
  assert.strictEqual(G.nextFilters({ ...base, onlyMine: true }, true).onlyMine, true);
});

test('short ids and BSV amounts', () => {
  assert.strictEqual(G.shortId('abcdef' + '0'.repeat(52) + '123456'), 'abcdef…123456');
  assert.strictEqual(G.shortId(null), '');
  assert.strictEqual(G.formatBsv(3000), '0.00003000');
});

test('card: reward badge and star only when relevant; no PNG size row', () => {
  const plain = G.cardHTML(nfts[0], { owned: false, waitingSats: 0 });
  assert.doesNotMatch(plain, /reward-badge/);
  assert.doesNotMatch(plain, /owned-star/);
  assert.doesNotMatch(plain, /5000px/);
  const rich = G.cardHTML(nfts[0], { owned: true, waitingSats: 3000 });
  assert.match(rich, /⚡ 0\.00003000 BSV to claim/);
  assert.match(rich, /owned-star/);
});

test('card: copy + on-chain view link + Order Prints', () => {
  const html = G.cardHTML(nfts[1], { owned: false, waitingSats: 0 });
  assert.match(html, new RegExp(`data-copy="${A}"`));
  assert.match(html, new RegExp(`href="https://1sat.market/outpoint/${A}_0"`));
  assert.match(html, /aaaaaa…aaaaaa/);
  assert.match(html, /href="https:\/\/ordinalrainbows\.printify\.me\/product\/2\/alpha"[^>]*>Order Prints ↗/);
});

test('card: a piece with no inscription says so and has no copy/view or badge', () => {
  const html = G.cardHTML(nfts[2], { owned: false, waitingSats: 0 });
  assert.match(html, /Not yet inscribed/);
  assert.doesNotMatch(html, /data-copy=/);
  assert.doesNotMatch(html, /1sat\.market/);
  assert.match(html, /Prints coming soon/);
});

test('card image uses the small copy and keeps the full-size image as fallback', () => {
  const html = G.cardHTML(nfts[0], { owned: false, waitingSats: 0 });
  assert.match(html, /src="images\/sm\/Beta%231\.JPG"/);
  assert.match(html, /data-full="images\/Beta%231\.JPG"/);
  assert.match(html, /onerror="ORGallery\.onImageError\(this\)"/);
});
