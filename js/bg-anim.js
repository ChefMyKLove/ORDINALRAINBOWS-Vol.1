/*
  Background animation: two cloud layers of the pieces, warped by animated SVG turbulence and
  crossfading between images.
  full (desktop) · fade (crossfade only, no warp: phones/tablets with 800px images, reduced motion,
  or the first 3 s measure a median frame slower than 40 ms). iOS Safari stutters on animated SVG
  filters without the frame timer noticing, so touch devices never get the warp.
*/
(function () {
    var NAMES = [
        'AlchemyBow.JPG', 'NebulaBow%231.JPG', 'TunnelBow%231.JPG', 'TieDyeBow%231.JPG',
        'HeartBow.JPG', 'GhostyBow%233.JPG', 'MirrorBow%232.JPG', 'FlowBow%233.JPG',
        'CosmicBow%232.JPG', 'HazeBow%233.JPG', 'EclipseBow%231.JPG', 'ZippyBow.JPG',
        'HummingBow%231.JPG'
    ];

    function chooseBgMode(opts) {
        return opts.reducedMotion || opts.isPhone ? 'fade' : 'full';
    }

    function isStuttering(intervals) {
        if (intervals.length < 20) return false;
        var sorted = intervals.slice().sort(function (a, b) { return a - b; });
        return sorted[Math.floor(sorted.length / 2)] > 40;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { chooseBgMode: chooseBgMode, isStuttering: isStuttering };
        return;
    }

    var BASE = (typeof window.BG_BASE_PATH !== 'undefined') ? window.BG_BASE_PATH : 'images/';
    var isPhone = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
    var mode = chooseBgMode({ isPhone: isPhone, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
    var BG_IMAGES = NAMES.map(function (n) { return BASE + (isPhone ? 'sm/' : '') + n; });
    var cloudAnimT = 0;

    function enterFade() {
        mode = 'fade';
        document.documentElement.classList.add('bg-fade');
    }

    /* Animate turbulence baseFrequency. */
    function startCloudAnim() {
        var turb = document.getElementById('cloud-turb');
        var turb2 = document.getElementById('cloud-turb-b');
        if (!turb || mode === 'fade') return;
        var last = 0;
        var started = 0;
        var checked = false;
        var intervals = [];
        var step = 0.00065;
        function tick(ts) {
            if (mode === 'fade') return;
            if (!started) started = ts;
            if (!checked) {
                if (last) intervals.push(ts - last);
                if (ts - started >= 3000) {
                    checked = true;
                    if (isStuttering(intervals)) { enterFade(); return; }
                }
            }
            last = ts;
            cloudAnimT += step;
            var fx = 0.009 + Math.sin(cloudAnimT * 1.10) * 0.012 + Math.sin(cloudAnimT * 2.30) * 0.006;
            var fy = 0.011 + Math.cos(cloudAnimT * 0.75) * 0.011 + Math.cos(cloudAnimT * 1.90) * 0.006;
            turb.setAttribute('baseFrequency', fx.toFixed(5) + ' ' + fy.toFixed(5));
            if (turb2) {
                var fx2 = 0.010 + Math.sin(cloudAnimT * 0.85 + 2.10) * 0.012 + Math.sin(cloudAnimT * 1.70) * 0.006;
                var fy2 = 0.009 + Math.cos(cloudAnimT * 0.60 + 1.50) * 0.011 + Math.cos(cloudAnimT * 1.50) * 0.006;
                turb2.setAttribute('baseFrequency', fx2.toFixed(5) + ' ' + fy2.toFixed(5));
            }
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    /* Crossfade images across both cloud layers (runs in every mode). */
    function initBackgroundCycle() {
        var HOLD_MS = 4000;
        var FADE_MS = 9000;
        var N = BG_IMAGES.length;
        var bgBot = document.getElementById('bgLayerA');
        var bgTop = document.getElementById('bgLayerB');
        var c1Bot = document.getElementById('cloud1A');
        var c1Top = document.getElementById('cloud1B');
        var c2Bot = document.getElementById('cloud2A');
        var c2Top = document.getElementById('cloud2B');
        if (!c1Bot || !c1Top) return;

        [bgBot, bgTop].forEach(function (el) {
            if (el) { el.style.transition = 'none'; el.style.opacity = '0'; }
        });
        [c1Bot, c1Top, c2Bot, c2Top].filter(Boolean).forEach(function (el) { el.style.transition = 'none'; });

        var topSrc = BG_IMAGES[1];
        var topIdx = 1;
        var preloaded = {};
        function preload(i) {
            if (preloaded[i]) return;
            preloaded[i] = true;
            var img = new Image();
            img.src = BG_IMAGES[i];
        }
        function setImg(el, src) { if (el) el.style.backgroundImage = "url('" + src + "')"; }
        function setOp(els, v) {
            var s = v.toFixed(4);
            els.forEach(function (el) { if (el) el.style.opacity = s; });
        }
        var botEls = [c1Bot, c2Bot].filter(Boolean);
        var topEls = [c1Top, c2Top].filter(Boolean);
        function applyBot(src) { botEls.forEach(function (el) { setImg(el, src); }); }
        function applyTop(src) { topSrc = src; topEls.forEach(function (el) { setImg(el, src); }); }

        preload(0); preload(1); preload(2);
        applyBot(BG_IMAGES[0]);
        applyTop(BG_IMAGES[1]);
        setOp(botEls, 1.0);
        setOp(topEls, 0.0);

        var phase = 'hold';
        var phaseStart = null;
        function tick(ts) {
            if (!phaseStart) phaseStart = ts;
            if (phase === 'hold') {
                if (ts - phaseStart >= HOLD_MS) { phase = 'crossfade'; phaseStart = ts; }
            } else {
                var f = Math.min((ts - phaseStart) / FADE_MS, 1.0);
                setOp(botEls, Math.cos(f * Math.PI / 2));
                setOp(topEls, Math.sin(f * Math.PI / 2));
                if (f >= 1.0) {
                    topIdx = (topIdx + 1) % N;
                    applyBot(topSrc);
                    applyTop(BG_IMAGES[topIdx]);
                    preload((topIdx + 1) % N);
                    setOp(botEls, 1.0);
                    setOp(topEls, 0.0);
                    phase = 'hold';
                    phaseStart = ts;
                }
            }
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    function init() {
        if (mode === 'fade') document.documentElement.classList.add('bg-fade');
        startCloudAnim();
        initBackgroundCycle();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
