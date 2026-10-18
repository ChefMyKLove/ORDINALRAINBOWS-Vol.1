const test = require('node:test');
const assert = require('node:assert');
const S = require('../../js/screensaver.js');

function fakeTimers() {
  let now = 0;
  let nextId = 0;
  const queue = new Map();
  return {
    setTimeout(fn, ms) { const id = ++nextId; queue.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { queue.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...queue.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        queue.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

test('idle start is exactly one minute', () => {
  assert.strictEqual(S.IDLE_MS, 60000);
});

test('fires after a minute without activity, not before', () => {
  const timers = fakeTimers();
  let fired = 0;
  S.createIdleTimer({ timeoutMs: S.IDLE_MS, onIdle: () => fired++, timers });
  timers.advance(59999);
  assert.strictEqual(fired, 0);
  timers.advance(1);
  assert.strictEqual(fired, 1);
});

test('activity restarts the countdown', () => {
  const timers = fakeTimers();
  let fired = 0;
  const idle = S.createIdleTimer({ timeoutMs: S.IDLE_MS, onIdle: () => fired++, timers });
  timers.advance(50000);
  idle.poke();
  timers.advance(50000);
  assert.strictEqual(fired, 0);
  timers.advance(10000);
  assert.strictEqual(fired, 1);
});

test('does not start while a popup, the panel or a wallet prompt is open; tries again later', () => {
  const timers = fakeTimers();
  let fired = 0;
  let suppressed = true;
  S.createIdleTimer({ timeoutMs: S.IDLE_MS, isSuppressed: () => suppressed, onIdle: () => fired++, timers });
  timers.advance(60000);
  assert.strictEqual(fired, 0);
  suppressed = false;
  timers.advance(60000);
  assert.strictEqual(fired, 1);
});

test('stop() cancels', () => {
  const timers = fakeTimers();
  let fired = 0;
  const idle = S.createIdleTimer({ timeoutMs: S.IDLE_MS, onIdle: () => fired++, timers });
  idle.stop();
  timers.advance(120000);
  assert.strictEqual(fired, 0);
});

test('showing while already showing is ignored (no duplicate overlay)', () => {
  const s = S.createScreensaverState();
  assert.strictEqual(s.show('welcome'), true);
  assert.strictEqual(s.show('idle'), false);
  assert.strictEqual(s.mode, 'welcome');
  assert.strictEqual(s.hide(), true);
  assert.strictEqual(s.hide(), false);
});

test('only the idle screensaver leaves on any input', () => {
  const s = S.createScreensaverState();
  s.show('welcome');
  assert.strictEqual(s.exitsOnInput(), false);
  s.hide();
  s.show('idle');
  assert.strictEqual(s.exitsOnInput(), true);
});

test('cycles through every piece and wraps around', () => {
  assert.strictEqual(S.nextIndex(0, 64), 1);
  assert.strictEqual(S.nextIndex(63, 64), 0);
});

test('click swallower: swallows exactly one click after being armed, then stops', () => {
  const timers = fakeTimers();
  const swallower = S.createClickSwallower({ timers });
  assert.strictEqual(swallower.shouldSwallow(), false, 'nothing to swallow before arming');
  swallower.arm();
  assert.strictEqual(swallower.shouldSwallow(), true, 'swallows the next click once armed');
  assert.strictEqual(swallower.shouldSwallow(), false, 'does not swallow a second click');
});

test('click swallower: auto-clears after its window so a later tap is not eaten', () => {
  const timers = fakeTimers();
  const swallower = S.createClickSwallower({ windowMs: 500, timers });
  swallower.arm();
  timers.advance(500);
  assert.strictEqual(swallower.shouldSwallow(), false, 'window elapsed without a click; stops swallowing');
});
