/*
  Screensaver welcome: frosted cards drift over the background, one comes forward with a placard.
  welcome mode (arrival, ✦ button) leaves via Enter Gallery / Esc / clicking the card;
  idle mode (60 s without input) leaves on any input and restores the scroll position.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ORScreensaver = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const IDLE_MS = 60 * 1000;
  const FORWARD_MS = 6000;
  const FLOATERS = 7;
  // Wrapped so they are never called as methods of this object: browsers throw "Illegal invocation".
  const realTimers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: h => clearTimeout(h) };

  function createIdleTimer({ timeoutMs = IDLE_MS, isSuppressed = () => false, onIdle, timers = realTimers }) {
    let handle = null;
    function fire() {
      if (isSuppressed()) { arm(); return; }
      onIdle();
    }
    function arm() {
      timers.clearTimeout(handle);
      handle = timers.setTimeout(fire, timeoutMs);
    }
    arm();
    return { poke: arm, stop() { timers.clearTimeout(handle); } };
  }

  function createScreensaverState() {
    let mode = null;
    return {
      get mode() { return mode; },
      show(m) { if (mode) return false; mode = m; return true; },
      hide() { if (!mode) return false; mode = null; return true; },
      exitsOnInput() { return mode === 'idle'; },
    };
  }

  function nextIndex(i, n) { return (i + 1) % n; }

  // Swallows one click within `windowMs` of being armed — used so the touchstart/pointerdown
  // that dismisses the idle screensaver doesn't also fire its synthesized click on whatever
  // gallery element sits underneath.
  function createClickSwallower({ windowMs = 500, timers = realTimers } = {}) {
    let active = false;
    let handle = null;
    return {
      arm() {
        active = true;
        timers.clearTimeout(handle);
        handle = timers.setTimeout(() => { active = false; }, windowMs);
      },
      shouldSwallow() {
        if (!active) return false;
        active = false;
        timers.clearTimeout(handle);
        return true;
      },
    };
  }

  const api = { IDLE_MS, FORWARD_MS, createIdleTimer, createScreensaverState, nextIndex, createClickSwallower };

  function initBrowser() {
    const root = document.getElementById('screensaver');
    if (!root || !window.nfts || !window.nfts.length) return;
    const pieces = window.nfts;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stage = root.querySelector('.ss-stage');
    const forward = root.querySelector('.ss-forward');
    const forwardImg = forward.querySelector('img');
    const title = root.querySelector('.ss-title');
    const subtitle = root.querySelector('.ss-subtitle');
    const rarity = root.querySelector('.ss-rarity');
    const enter = root.querySelector('.ss-enter');
    const state = createScreensaverState();
    const img = nft => `url('${window.ORGallery.imagePath(nft, 'sm')}')`;
    let index = 0;
    let swaps = 0;
    let cycle = null;
    let savedScroll = 0;

    for (let i = 0; i < FLOATERS; i++) {
      const card = document.createElement('div');
      card.className = 'ss-card';
      card.style.setProperty('--i', String(i));
      card.style.backgroundImage = img(pieces[(i * 9 + 5) % pieces.length]);
      stage.appendChild(card);
    }
    const floaters = [...stage.querySelectorAll('.ss-card')];

    function showForward() {
      const nft = pieces[index];
      forwardImg.src = window.ORGallery.imagePath(nft, 'sm');
      forwardImg.alt = nft.title;
      forward.dataset.id = nft.id;
      title.textContent = nft.title;
      subtitle.textContent = nft.subtitle;
      rarity.textContent = nft.rarity;
      rarity.className = `ss-rarity rarity ${nft.rarity.toLowerCase()}`;
      root.classList.remove('ss-swap');
      void root.offsetWidth; // restart the entrance animation
      root.classList.add('ss-swap');
      floaters[swaps % FLOATERS].style.backgroundImage = img(pieces[(index + 17) % pieces.length]);
      swaps++;
      index = nextIndex(index, pieces.length);
    }

    function show(mode) {
      if (!state.show(mode)) return;
      savedScroll = window.scrollY;
      document.body.classList.add('screensaver-on');
      root.hidden = false;
      showForward();
      cycle = setInterval(showForward, FORWARD_MS);
      enter.focus({ preventScroll: true });
    }

    function hide() {
      if (!state.hide()) return;
      clearInterval(cycle);
      root.hidden = true;
      document.body.classList.remove('screensaver-on');
      window.scrollTo(0, savedScroll);
      idle.poke();
    }

    const isSuppressed = () => Boolean(state.mode) ||
      document.getElementById('card-3d-modal')?.classList.contains('active') ||
      document.body.classList.contains('wallet-panel-open') ||
      Boolean(window.ORWallet && window.ORWallet.busy > 0);
    const idle = createIdleTimer({ isSuppressed, onIdle: () => show('idle') });
    const clickSwallower = createClickSwallower();
    document.addEventListener('click', e => {
      if (clickSwallower.shouldSwallow()) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(type => {
      window.addEventListener(type, () => {
        if (state.exitsOnInput()) {
          // pointerdown/touchstart dismiss the overlay then synthesize a click on the element
          // underneath; swallow that one click so it doesn't open a card or follow a link.
          if (type === 'pointerdown' || type === 'touchstart') clickSwallower.arm();
          hide();
        } else if (!state.mode) idle.poke();
      }, { passive: true });
    });

    root.addEventListener('pointermove', e => {
      if (reduced) return;
      root.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5).toFixed(3));
      root.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5).toFixed(3));
    });
    enter.addEventListener('click', hide);
    forward.addEventListener('click', () => {
      const id = forward.dataset.id;
      hide();
      if (id) window.openCard3DModal(id);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.mode) hide(); });
    document.addEventListener('click', e => {
      if (e.target.closest('[data-action="screensaver"]')) show('welcome');
    });

    api.show = show;
    api.hide = hide;
    show('welcome');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBrowser);
    else initBrowser();
  }
  return api;
});
