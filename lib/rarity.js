// Shared rarity -> reward-share weight scale, so an Exotic component ordinal earns
// proportionally more of a mint's holder pool than a Common one.
const SCALE = { exotic: 0.5, legendary: 0.4, epic: 0.3, rare: 0.2, uncommon: 0.1, common: 0.05 };

function rarityMultiplier(rarity) {
  return SCALE[(rarity || '').toLowerCase()] ?? SCALE.common;
}

module.exports = { rarityMultiplier };
