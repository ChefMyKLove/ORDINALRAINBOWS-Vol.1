/* ============================================================
   bubble-physics.js — shared pool-table physics engine.

   Generalized core extracted from bubble-pool.js (the Contact
   page's engine, which stays untouched). This module takes any
   set of DOM elements as physics bodies and uses their CURRENT
   rendered position (after normal CSS layout) as their home —
   unlike bubble-pool.js's fixed "big bubble in center, others
   orbit" layout, which is specific to the Contact page.

   Usage:
     const controller = BubblePhysics.createField({
       field: document.getElementById('pageField'),   // position:relative
       bodies: [el1, el2, ...],                        // already laid out
       shrinkTriggerEl: el1,                           // optional — see below
       constants: { ... }                              // optional overrides
     });
     controller.retarget(el, { x, y }, { detour: { x, y } });
     controller.destroy();

   shrinkTriggerEl + constants.SHRINK_TO_DIAMETER: when set, every body
   eases toward SHRINK_TO_DIAMETER (px) while shrinkTriggerEl specifically
   is moving (drag or fling), and back to full size once it's idle again.
   Omit shrinkTriggerEl to have ANY body's motion trigger the shrink instead.
   ============================================================ */
(function (global) {
  'use strict';

  const DEFAULTS = {
    RESTITUTION: 0.96,
    DAMPING: 0.99,
    SPRING: 0.02,
    SPRING_DAMPING: 0.9,
    HOMING_CAP: 10,
    CLICK_MS: 180,
    CLICK_PX: 6,
    MAX_LAUNCH: 70,
    SLOW_SPEED: 1.8,
    HIT_COOLDOWN: 900,
    DRIFT_AMP_MIN: 10,
    DRIFT_AMP_MAX: 18,
    MIN_FIELD_WIDTH: 340,
    // Opt-in: when set, every body shrinks toward this diameter (px)
    // while ANY body in the field is moving (dragging/flinging/homing),
    // then grows back to its full reading size once everything is idle
    // again. null/0 = feature off, bodies always render at full size.
    SHRINK_TO_DIAMETER: null,
    SCALE_LERP: 0.15
  };

  function createField(options) {
    const field = options.field;
    const els = (options.bodies || []).slice();
    if (!field || els.length < 1) return null;
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

    const C = Object.assign({}, DEFAULTS, options.constants || {});

    let fieldW = 0, fieldH = 0;
    function measureField() {
      const rect = field.getBoundingClientRect();
      fieldW = rect.width;
      fieldH = rect.height;
    }
    measureField();
    if (fieldW < C.MIN_FIELD_WIDTH) return null;

    field.classList.add('pool-active');

    // Measure every body's rect BEFORE mutating any of them. When several
    // bodies share a normal-flow container (e.g. a flex row), switching
    // one to position:absolute reflows its still-in-flow siblings — so
    // measuring and mutating in the same pass would corrupt every
    // subsequent body's captured home position.
    const fieldRectForMeasure = field.getBoundingClientRect();
    const measured = els.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        el,
        cx: rect.left - fieldRectForMeasure.left + rect.width / 2,
        cy: rect.top - fieldRectForMeasure.top + rect.height / 2,
        r: Math.max(rect.width, rect.height) / 2
      };
    });
    measured.forEach((m) => {
      m.el.style.position = 'absolute';
      m.el.style.top = '0';
      m.el.style.left = '0';
      m.el.style.margin = '0';
    });

    const bodies = measured.map(({ el, cx, cy, r }) => {
      return {
        el, r, m: r,
        x: cx, y: cy, vx: 0, vy: 0,
        scale: 1,
        home: { x: cx, y: cy },
        detour: null,
        state: 'idle',
        homing: false,
        lastHit: 0,
        slowSince: 0,
        ampX: C.DRIFT_AMP_MIN + Math.random() * (C.DRIFT_AMP_MAX - C.DRIFT_AMP_MIN),
        ampY: C.DRIFT_AMP_MIN + Math.random() * (C.DRIFT_AMP_MAX - C.DRIFT_AMP_MIN),
        freqX: 0.2 + Math.random() * 0.2,
        freqY: 0.2 + Math.random() * 0.2,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        pointerId: null,
        grabDX: 0, grabDY: 0,
        pressT: 0, pressX: 0, pressY: 0,
        samples: [],
        suppressClick: false
      };
    });

    const shrinkTriggerBody = options.shrinkTriggerEl
      ? bodies.find((b) => b.el === options.shrinkTriggerEl) || null
      : null;

    function render(b) {
      // translate3d positions the body's own (unscaled) box so its center
      // lands at (x,y); scale() then grows/shrinks it around that same
      // center — transform-origin defaults to 50%/50%, so the visual
      // anchor point never moves as scale changes.
      b.el.style.transform = 'translate3d(' + (b.x - b.r).toFixed(1) + 'px, ' + (b.y - b.r).toFixed(1) + 'px, 0) scale(' + b.scale.toFixed(3) + ')';
    }
    bodies.forEach(render);

    function pointerToField(e) {
      const rect = field.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function excite(b, now) {
      if (b.state !== 'drag') b.state = 'excited';
      b.lastHit = now;
    }

    let rafId = null;

    function step(now) {
      const t = now / 1000;

      // Shrink-while-moving: every body eases toward a smaller reading→
      // in-motion size as soon as the trigger condition is active, and
      // eases back to full size once it settles to idle again. By
      // default the trigger is "any body is moving"; if the caller
      // named a specific trigger body (shrinkTriggerBody), only THAT
      // body's motion counts — grabbing something else doesn't shrink
      // the field.
      if (C.SHRINK_TO_DIAMETER) {
        const anyActive = shrinkTriggerBody
          ? shrinkTriggerBody.state !== 'idle'
          : bodies.some((b) => b.state !== 'idle');
        for (const b of bodies) {
          const targetScale = anyActive ? Math.min(1, C.SHRINK_TO_DIAMETER / (2 * b.r)) : 1;
          b.scale += (targetScale - b.scale) * C.SCALE_LERP;
        }
      }

      for (const b of bodies) {
        if (b.state === 'idle') {
          b.x = b.home.x + b.ampX * Math.sin(t * b.freqX * Math.PI * 2 + b.phaseX);
          b.y = b.home.y + b.ampY * Math.sin(t * b.freqY * Math.PI * 2 + b.phaseY);
          b.vx = 0; b.vy = 0;
        }
      }

      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          if (a.state === 'idle' && b.state === 'idle') continue;
          if (a.homing || b.homing) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 1;
          const minDist = a.r * a.scale + b.r * b.scale;
          if (dist < minDist) {
            const nx = dx / dist, ny = dy / dist;
            const invA = a.state === 'drag' ? 0 : 1 / a.m;
            const invB = b.state === 'drag' ? 0 : 1 / b.m;
            const invSum = invA + invB;
            if (invSum === 0) continue;
            const overlap = minDist - dist;
            a.x -= nx * overlap * (invA / invSum);
            a.y -= ny * overlap * (invA / invSum);
            b.x += nx * overlap * (invB / invSum);
            b.y += ny * overlap * (invB / invSum);
            const relVx = b.vx - a.vx, relVy = b.vy - a.vy;
            const relSpeed = relVx * nx + relVy * ny;
            if (relSpeed < 0) {
              const impulse = -(1 + C.RESTITUTION) * relSpeed / invSum;
              a.vx -= impulse * invA * nx; a.vy -= impulse * invA * ny;
              b.vx += impulse * invB * nx; b.vy += impulse * invB * ny;
            }
            excite(a, now); excite(b, now);
          }
        }
      }

      for (const b of bodies) {
        if (b.state !== 'excited') { render(b); continue; }

        const speed = Math.abs(b.vx) + Math.abs(b.vy);
        if (speed >= C.SLOW_SPEED) b.slowSince = 0;
        else if (!b.slowSince) b.slowSince = now;
        if (!b.homing && speed < C.SLOW_SPEED &&
            (now - b.lastHit > C.HIT_COOLDOWN || now - b.slowSince > 1200)) {
          b.homing = true;
        }

        if (b.homing) {
          const target = b.detour || b.home;
          b.vx += (target.x - b.x) * C.SPRING;
          b.vy += (target.y - b.y) * C.SPRING;
          b.vx *= C.SPRING_DAMPING;
          b.vy *= C.SPRING_DAMPING;
          const hsp = Math.hypot(b.vx, b.vy);
          if (hsp > C.HOMING_CAP) {
            b.vx = b.vx / hsp * C.HOMING_CAP;
            b.vy = b.vy / hsp * C.HOMING_CAP;
          }
          if (Math.hypot(target.x - b.x, target.y - b.y) < 3 &&
              Math.abs(b.vx) + Math.abs(b.vy) < 0.6) {
            b.x = target.x; b.y = target.y; b.vx = 0; b.vy = 0;
            if (b.detour) {
              b.detour = null;
            } else {
              b.state = 'idle';
              b.homing = false;
              b.phaseX = -t * b.freqX * Math.PI * 2;
              b.phaseY = -t * b.freqY * Math.PI * 2;
            }
          }
        } else {
          b.vx *= C.DAMPING; b.vy *= C.DAMPING;
        }

        const cap = C.MAX_LAUNCH * 1.2;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > cap) { b.vx = b.vx / sp * cap; b.vy = b.vy / sp * cap; }

        b.x += b.vx; b.y += b.vy;

        const effR = b.r * b.scale;
        if (b.x < effR) { b.x = effR; b.vx = Math.abs(b.vx) * C.RESTITUTION; }
        else if (b.x > fieldW - effR) { b.x = fieldW - effR; b.vx = -Math.abs(b.vx) * C.RESTITUTION; }
        if (b.y < effR) { b.y = effR; b.vy = Math.abs(b.vy) * C.RESTITUTION; }
        else if (b.y > fieldH - effR) { b.y = fieldH - effR; b.vy = -Math.abs(b.vy) * C.RESTITUTION; }

        render(b);
      }

      rafId = requestAnimationFrame(step);
    }

    function start() { if (rafId === null) rafId = requestAnimationFrame(step); }
    function stop() { if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } }

    function onVisibility() { if (document.hidden) stop(); else start(); }
    document.addEventListener('visibilitychange', onVisibility);

    bodies.forEach(b => {
      const el = b.el;

      function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* non-active pointer */ }
        b.pointerId = e.pointerId;
        b.state = 'drag';
        b.homing = false;
        b.detour = null;
        b.vx = 0; b.vy = 0;
        el.classList.add('dragging');
        b.pressT = performance.now();
        b.pressX = e.clientX;
        b.pressY = e.clientY;
        const p = pointerToField(e);
        b.grabDX = b.x - p.x;
        b.grabDY = b.y - p.y;
        b.samples = [{ x: e.clientX, y: e.clientY, t: b.pressT }];
      }

      function onPointerMove(e) {
        if (b.state !== 'drag' || e.pointerId !== b.pointerId) return;
        const now = performance.now();
        const p = pointerToField(e);
        const effR = b.r * b.scale;
        let nx = Math.min(Math.max(p.x + b.grabDX, effR), fieldW - effR);
        let ny = Math.min(Math.max(p.y + b.grabDY, effR), fieldH - effR);
        b.vx = nx - b.x; b.vy = ny - b.y;
        b.x = nx; b.y = ny;
        render(b);
        b.samples.push({ x: e.clientX, y: e.clientY, t: now });
        while (b.samples.length > 2 && now - b.samples[0].t > 120) b.samples.shift();
      }

      function release(e) {
        if (b.state !== 'drag' || e.pointerId !== b.pointerId) return;
        const now = performance.now();
        el.classList.remove('dragging');
        b.pointerId = null;
        const dt = now - b.pressT;
        const dist = Math.hypot(e.clientX - b.pressX, e.clientY - b.pressY);

        if (dt <= C.CLICK_MS && dist <= C.CLICK_PX) {
          b.state = 'excited'; b.vx = 0; b.vy = 0; b.lastHit = 0;
          return;
        }

        b.suppressClick = true;
        const recent = b.samples.filter(s => now - s.t <= 100);
        const first = recent[0] || b.samples[0];
        const last = b.samples[b.samples.length - 1];
        const span = Math.max(last.t - first.t, 16);
        let vx = (last.x - first.x) / span * (1000 / 60);
        let vy = (last.y - first.y) / span * (1000 / 60);
        const mag = Math.hypot(vx, vy);
        if (mag > C.MAX_LAUNCH) { vx = vx / mag * C.MAX_LAUNCH; vy = vy / mag * C.MAX_LAUNCH; }
        b.vx = vx; b.vy = vy;
        b.state = 'excited';
        b.lastHit = now;
      }

      function onClick(e) {
        if (b.suppressClick) { e.preventDefault(); e.stopPropagation(); b.suppressClick = false; }
      }

      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('click', onClick, true);

      b._handlers = { onPointerDown, onPointerMove, release, onClick };
    });

    let resizeTimer = null;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        const oldW = fieldW, oldH = fieldH;
        measureField();
        const sx = fieldW / oldW, sy = fieldH / oldH;
        bodies.forEach(b => {
          b.home.x *= sx; b.home.y *= sy;
          if (b.state === 'idle') { b.x = b.home.x; b.y = b.home.y; }
          else {
            const effR = b.r * b.scale;
            b.x = Math.min(Math.max(b.x * sx, effR), fieldW - effR);
            b.y = Math.min(Math.max(b.y * sy, effR), fieldH - effR);
          }
          render(b);
        });
      }, 150);
    }
    global.addEventListener('resize', onResize);

    start();

    function findBody(el) { return bodies.find(function (b) { return b.el === el; }); }

    function retarget(el, newHome, opts) {
      const b = findBody(el);
      if (!b) return;
      opts = opts || {};
      b.home = { x: newHome.x, y: newHome.y };
      b.detour = opts.detour ? { x: opts.detour.x, y: opts.detour.y } : null;
      b.state = 'excited';
      b.homing = true;
      b.slowSince = 0;
      b.lastHit = performance.now();
    }

    function destroy() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      global.removeEventListener('resize', onResize);
      bodies.forEach(b => {
        const h = b._handlers;
        if (!h) return;
        b.el.removeEventListener('pointerdown', h.onPointerDown);
        b.el.removeEventListener('pointermove', h.onPointerMove);
        b.el.removeEventListener('pointerup', h.release);
        b.el.removeEventListener('pointercancel', h.release);
        b.el.removeEventListener('click', h.onClick, true);
      });
      field.classList.remove('pool-active');
    }

    return { bodies, retarget, destroy, findBody };
  }

  global.BubblePhysics = { createField: createField };
})(window);
