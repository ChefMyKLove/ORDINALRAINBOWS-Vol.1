/*
  ORDINAL•RAINBOWS gallery: cards, search/sort/rarity, ⭐ Only mine, reward badges, sticky bar.
  Pure helpers are exported for Node tests; the browser part runs only when a document exists.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ORGallery = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const RARITY_ORDER = { Legendary: 6, Exotic: 5, Epic: 4, Rare: 3, Uncommon: 2, Common: 1 };
  const VIEW_BASE = 'https://1sat.market/outpoint/';
  const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='%231a1630' width='400' height='400'/%3E%3Ctext fill='%23ffffff' fill-opacity='.6' font-family='sans-serif' font-size='22' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3EImage unavailable%3C/text%3E%3C/svg%3E";

  function formatBsv(sats) { return (Number(sats || 0) / 1e8).toFixed(8); }
  function shortId(id) { return id ? `${id.slice(0, 6)}…${id.slice(-6)}` : ''; }
  function imagePath(nft, size) {
    const file = `${encodeURIComponent(nft.id)}.JPG`;
    return size === 'sm' ? `images/sm/${file}` : `images/${file}`;
  }

  function filterAndSort(nfts, filters, ctx) {
    const q = String(filters.search || '').trim().toLowerCase();
    const owned = (ctx && ctx.owned) || new Set();
    const rewards = (ctx && ctx.rewards) || {};
    const list = nfts.filter(n =>
      (!q || n.title.toLowerCase().includes(q) || n.subtitle.toLowerCase().includes(q) || n.rarity.toLowerCase().includes(q)) &&
      (!filters.rarity || filters.rarity === 'all' || n.rarity === filters.rarity) &&
      (!filters.onlyMine || owned.has(n.inscriptionId)));
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    const rank = n => RARITY_ORDER[n.rarity] || 0;
    const waiting = n => Number(rewards[n.inscriptionId]) || 0;
    const sorters = {
      alpha: byTitle,
      'rarity-high': (a, b) => rank(b) - rank(a) || byTitle(a, b),
      'rarity-low': (a, b) => rank(a) - rank(b) || byTitle(a, b),
      rewards: (a, b) => waiting(b) - waiting(a) || byTitle(a, b),
    };
    return list.sort(sorters[filters.sort] || byTitle);
  }

  function emptyMessage(filters, connected, loading) {
    if (filters.onlyMine) {
      if (!connected) return 'Connect your Yours Wallet to see your pieces.';
      if (loading) return 'Loading your pieces…';
      return 'No ORDINAL•RAINBOWS pieces in your wallet yet.';
    }
    return 'No pieces match your search.';
  }

  function nextFilters(filters, connected) {
    return connected ? filters : { ...filters, onlyMine: false };
  }

  function cardHTML(nft, state) {
    const owned = Boolean(state && state.owned);
    const waiting = Number(state && state.waitingSats) || 0;
    const id = nft.inscriptionId;
    const idRow = id
      ? `<span class="card-id" title="${id}">${shortId(id)}` +
        `<button type="button" class="icon-btn" data-copy="${id}" aria-label="Copy inscription ID">📋</button>` +
        `<a class="icon-btn" href="${VIEW_BASE}${id}_0" target="_blank" rel="noopener" aria-label="View on-chain">↗</a></span>`
      : '<span class="card-id muted">Not yet inscribed</span>';
    const prints = nft.printifyUrl
      ? `<a class="prints-btn" href="${nft.printifyUrl}" target="_blank" rel="noopener">Order Prints ↗</a>`
      : '<span class="prints-btn unavailable">Prints coming soon</span>';
    return `
      ${waiting > 0 ? `<div class="reward-badge">⚡ ${formatBsv(waiting)} BSV to claim</div>` : ''}
      ${owned ? '<div class="owned-star" aria-label="In your wallet">⭐</div>' : ''}
      <button type="button" class="nft-open" aria-label="Open ${nft.title}">
        <img class="nft-image" src="${imagePath(nft, 'sm')}" data-full="${imagePath(nft)}" alt=""
             loading="lazy" decoding="async" onerror="ORGallery.onImageError(this)">
      </button>
      <div class="card-text">
        <h3 class="nft-title">${nft.title}</h3>
        <p class="nft-subtitle">${nft.subtitle}</p>
      </div>
      <div class="card-meta"><span class="rarity ${nft.rarity.toLowerCase()}">${nft.rarity}</span>${idRow}</div>
      ${prints}`;
  }

  // Small copy missing → full-size image → placeholder.
  function onImageError(img) {
    if (img.dataset.full && img.src.indexOf('/sm/') !== -1) { img.src = img.dataset.full; return; }
    img.onerror = null;
    img.src = PLACEHOLDER;
  }

  const api = { RARITY_ORDER, formatBsv, shortId, imagePath, filterAndSort, emptyMessage, nextFilters, cardHTML, onImageError };

  function initBrowser() {
    const gallery = document.getElementById('gallery');
    if (!gallery || !window.nfts) return;
    const state = { search: '', sort: 'alpha', rarity: 'all', onlyMine: false };
    const connected = () => Boolean(window.currentWalletAddress);
    const ownedSet = () => new Set((window.userOwnedInscriptions || []).map(i => i.inscriptionId));

    function syncControls() {
      document.querySelectorAll('[data-filter]').forEach(el => {
        const v = state[el.dataset.filter];
        if (el.value !== v) el.value = v;
      });
      document.querySelectorAll('[data-action="only-mine"]').forEach(b => {
        b.setAttribute('aria-pressed', String(state.onlyMine));
        if (b.dataset.compact) b.title = connected() ? 'Only mine' : 'Connect to see yours';
        else b.textContent = connected() ? '⭐ Only mine' : '⭐ Connect to see yours';
      });
    }

    function render() {
      const owned = ownedSet();
      const rewards = window.rewardsByInscription || {};
      const list = filterAndSort(window.nfts, state, { owned, rewards });
      gallery.innerHTML = '';
      if (!list.length) {
        const p = document.createElement('p');
        p.className = 'gallery-empty';
        p.textContent = emptyMessage(state, connected(), connected() && !window._ordinalFetchAttempted);
        gallery.appendChild(p);
        return;
      }
      const frag = document.createDocumentFragment();
      list.forEach(nft => {
        const isOwned = owned.has(nft.inscriptionId);
        const card = document.createElement('article');
        card.className = 'nft-card' + (isOwned ? ' is-owned' : '');
        card.dataset.id = nft.id;
        card.innerHTML = cardHTML(nft, { owned: isOwned, waitingSats: rewards[nft.inscriptionId] || 0 });
        frag.appendChild(card);
      });
      gallery.appendChild(frag);
    }

    document.addEventListener('input', e => {
      const key = e.target && e.target.dataset && e.target.dataset.filter;
      if (!key) return;
      state[key] = e.target.value;
      syncControls();
      render();
    });

    document.addEventListener('click', e => {
      const mine = e.target.closest('[data-action="only-mine"]');
      if (mine) {
        if (!connected()) { window.showWalletConnection(); return; }
        state.onlyMine = !state.onlyMine;
        syncControls();
        render();
      }
    });

    gallery.addEventListener('click', e => {
      const copy = e.target.closest('[data-copy]');
      if (copy) {
        navigator.clipboard.writeText(copy.dataset.copy).then(() => {
          copy.textContent = '✓';
          copy.setAttribute('aria-label', 'Copied!');
          setTimeout(() => { copy.textContent = '📋'; copy.setAttribute('aria-label', 'Copy inscription ID'); }, 1400);
        });
        return;
      }
      const openBtn = e.target.closest('.nft-open');
      if (openBtn) window.openCard3DModal(openBtn.closest('.nft-card').dataset.id);
    });

    window.addEventListener('or-wallet-changed', () => {
      Object.assign(state, nextFilters(state, connected()));
      syncControls();
      render();
    });
    window.addEventListener('or-rewards-changed', render);

    async function loadRewardBadges() {
      try {
        const j = await (await fetch('/api/rewards')).json();
        window.rewardsByInscription = Object.fromEntries((j.rewards || []).map(a => [a.inscription_id, Number(a.bsv_claimable)]));
        window.dispatchEvent(new Event('or-rewards-changed'));
      } catch (err) {
        console.warn('[gallery] could not load reward badges', err);
      }
    }
    window.loadRewardBadges = loadRewardBadges;

    // Sticky bar: shown once the header has scrolled out of view.
    const header = document.getElementById('main-header');
    const bar = document.getElementById('sticky-bar');
    if (header && bar && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        const show = !entry.isIntersecting;
        bar.classList.toggle('is-visible', show);
        if (show) bar.removeAttribute('inert'); else bar.setAttribute('inert', '');
      }).observe(header);
    }

    syncControls();
    render();
    loadRewardBadges();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBrowser);
    else initBrowser();
  }
  return api;
});
