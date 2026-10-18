/*
  Wallet pill (header + sticky bar) and slide-out side panel.
  Stays out of the way until opened; listens for or-wallet-changed / or-rewards-changed / or-wallet-error.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ORWalletPanel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const bsv = sats => (Number(sats || 0) / 1e8).toFixed(8);

  function waitingTotal(ownedIds, rewards) {
    return ownedIds.reduce((total, id) => total + (Number(rewards[id]) || 0), 0);
  }

  function pillLabel({ available, connected, ownedCount, waitingSats, loading }) {
    if (!available) return 'Get Yours Wallet ↗';
    if (!connected) return '🔗 Connect';
    if (loading) return '⭐ …';
    return `⭐ ${ownedCount}` + (waitingSats > 0 ? ` · ⚡ ${bsv(waitingSats)} BSV` : '');
  }

  function shortAddress(addr) { return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''; }

  const api = { pillLabel, waitingTotal, shortAddress };

  function initBrowser() {
    const panel = document.getElementById('wallet-panel');
    const backdrop = document.getElementById('wallet-backdrop');
    const toastEl = document.getElementById('wallet-toast');
    if (!panel || !backdrop) return;
    let lastFocus = null;
    let toastTimer = null;
    const ownedIds = () => (window.userOwnedInscriptions || []).map(i => i.inscriptionId);
    const available = () => Boolean(window.ORWallet && window.ORWallet.available());

    function refresh() {
      const rewards = window.rewardsByInscription || {};
      const ids = ownedIds();
      const connected = Boolean(window.currentWalletAddress);
      const loading = connected && !window._ordinalFetchAttempted;
      const label = pillLabel({ available: available(), connected, ownedCount: ids.length, waitingSats: waitingTotal(ids, rewards), loading });
      document.querySelectorAll('[data-action="wallet"]').forEach(p => {
        if (!p.disabled) p.textContent = label;
        p.classList.toggle('is-connected', connected);
      });
      if (!connected) { close(); return; }

      panel.querySelector('.wp-address').textContent = shortAddress(window.currentWalletAddress);
      panel.querySelector('[data-copy-address]').dataset.copyAddress = window.currentWalletAddress;
      const list = panel.querySelector('.wp-pieces');
      list.innerHTML = '';
      const pieces = (window.nfts || []).filter(n => n.inscriptionId && ids.includes(n.inscriptionId));
      if (!pieces.length) {
        const li = document.createElement('li');
        li.className = 'wp-empty';
        li.textContent = loading ? 'Loading your pieces…' : 'No ORDINAL•RAINBOWS pieces in this wallet yet.';
        list.appendChild(li);
      }
      pieces.forEach(n => {
        const sats = Number(rewards[n.inscriptionId]) || 0;
        const li = document.createElement('li');
        li.innerHTML = `<button type="button" class="wp-piece" data-id="${n.id}">
            <img src="${window.ORGallery.imagePath(n, 'sm')}" alt="" loading="lazy">
            <span>${n.title}</span>${sats > 0 ? `<span class="wp-waiting">⚡ ${bsv(sats)}</span>` : ''}</button>`;
        list.appendChild(li);
      });
      panel.querySelector('.wp-total').textContent = `${bsv(waitingTotal(ids, rewards))} BSV`;
    }

    function open() {
      if (!window.currentWalletAddress) return;
      lastFocus = document.activeElement;
      refresh();
      panel.hidden = false;
      backdrop.hidden = false;
      document.body.classList.add('wallet-panel-open');
      panel.querySelector('.wp-close').focus();
    }

    function close() {
      if (panel.hidden) return;
      panel.hidden = true;
      backdrop.hidden = true;
      document.body.classList.remove('wallet-panel-open');
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    }

    function toast(message) {
      if (!toastEl) return;
      toastEl.textContent = message;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 6000);
    }

    document.addEventListener('click', e => {
      const pill = e.target.closest('[data-action="wallet"]');
      if (pill) {
        if (!available()) { window.open('https://yours.org', '_blank', 'noopener'); return; }
        if (window.currentWalletAddress) open(); else window.showWalletConnection();
        return;
      }
      if (e.target === backdrop || e.target.closest('.wp-close')) { close(); return; }
      const piece = e.target.closest('.wp-piece');
      if (piece) { close(); window.openCard3DModal(piece.dataset.id); return; }
      const copy = e.target.closest('[data-copy-address]');
      if (copy && copy.dataset.copyAddress) { navigator.clipboard.writeText(copy.dataset.copyAddress); toast('Address copied'); return; }
      if (e.target.closest('[data-action="disconnect"]')) { close(); window.disconnectWallet(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    window.addEventListener('or-wallet-changed', refresh);
    window.addEventListener('or-rewards-changed', refresh);
    window.addEventListener('or-wallet-error', e => toast(e.detail));
    refresh();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBrowser);
    else initBrowser();
  }
  return api;
});
