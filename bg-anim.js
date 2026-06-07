(function () {
    var BASE = (typeof window.BG_BASE_PATH !== 'undefined') ? window.BG_BASE_PATH : 'images/';

    var BG_IMAGES = [
        BASE + 'AlchemyBow.JPG',
        BASE + 'NebulaBow%231.JPG',
        BASE + 'TunnelBow%231.JPG',
        BASE + 'TieDyeBow%231.JPG',
        BASE + 'HeartBow.JPG',
        BASE + 'GhostyBow%233.JPG',
        BASE + 'MirrorBow%232.JPG',
        BASE + 'FlowBow%233.JPG',
        BASE + 'CosmicBow%232.JPG',
        BASE + 'HazeBow%233.JPG',
        BASE + 'EclipseBow%231.JPG',
        BASE + 'ZippyBow.JPG',
        BASE + 'HummingBow%231.JPG'
    ];

    var cloudAnimT = 0;

    /* Animate the SVG turbulence baseFrequency on every frame */
    function startTurbulenceAnim() {
        var turb  = document.getElementById('cloud-turb');
        var turb2 = document.getElementById('cloud-turb-b');
        if (!turb) return;

        function tick() {
            cloudAnimT += 0.00085;
            var fx  = 0.009 + Math.sin(cloudAnimT * 1.10) * 0.012 + Math.sin(cloudAnimT * 2.30) * 0.006;
            var fy  = 0.011 + Math.cos(cloudAnimT * 0.75) * 0.011 + Math.cos(cloudAnimT * 1.90) * 0.006;
            turb.setAttribute('baseFrequency', fx.toFixed(5) + ' ' + fy.toFixed(5));
            if (turb2) {
                var fx2 = 0.010 + Math.sin(cloudAnimT * 0.85 + 2.10) * 0.012 + Math.sin(cloudAnimT * 1.70) * 0.006;
                var fy2 = 0.009 + Math.cos(cloudAnimT * 0.60 + 1.50) * 0.011 + Math.cos(cloudAnimT * 1.50) * 0.006;
                turb2.setAttribute('baseFrequency', fx2.toFixed(5) + ' ' + fy2.toFixed(5));
            }
            requestAnimationFrame(tick);
        }
        tick();
    }

    /* Crossfade between bgLayerA (bottom) and bgLayerB (top) */
    function initBackgroundCycle() {
        var FADE_MS = 9000;
        var HOLD_MS = 4000;
        var N = BG_IMAGES.length;

        var bgA = document.getElementById('bgLayerA');
        var bgB = document.getElementById('bgLayerB');
        if (!bgA || !bgB) return;

        /* Preload all images */
        BG_IMAGES.forEach(function (src) { var img = new Image(); img.src = src; });

        function setImg(el, src) { el.style.backgroundImage = "url('" + src + "')"; }

        var topIdx = 1;
        var topSrc = BG_IMAGES[1];

        setImg(bgA, BG_IMAGES[0]);
        setImg(bgB, BG_IMAGES[1]);
        bgA.style.opacity = '1';
        bgB.style.opacity = '0';

        var phase = 'hold';
        var phaseStart = null;

        function tick(ts) {
            if (!phaseStart) phaseStart = ts;

            if (phase === 'hold') {
                if (ts - phaseStart >= HOLD_MS) {
                    phase = 'crossfade';
                    phaseStart = ts;
                }
            } else {
                var f = Math.min((ts - phaseStart) / FADE_MS, 1.0);
                bgA.style.opacity = Math.cos(f * Math.PI / 2).toFixed(4);
                bgB.style.opacity = Math.sin(f * Math.PI / 2).toFixed(4);

                if (f >= 1.0) {
                    topIdx = (topIdx + 1) % N;
                    setImg(bgA, topSrc);
                    topSrc = BG_IMAGES[topIdx];
                    setImg(bgB, topSrc);
                    bgA.style.opacity = '1';
                    bgB.style.opacity = '0';
                    phase = 'hold';
                    phaseStart = ts;
                }
            }
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    function init() {
        startTurbulenceAnim();
        initBackgroundCycle();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
