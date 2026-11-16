import assert from 'node:assert/strict';
import test from 'node:test';
import { createFloorGuidance } from './floor-guidance.ts';

test('asks to scan until the floor is locked, and says so when it takes long', () => {
  const g = createFloorGuidance({ slowScanMs: 8000, aimDelayMs: 1500, blockedDelayMs: 400 });
  assert.equal(g.update({ floorLocked: false, hasPoint: false, timeMs: 100 }), 'scan');
  assert.equal(g.update({ floorLocked: false, hasPoint: true, timeMs: 8000 }), 'scan');
  assert.equal(g.update({ floorLocked: false, hasPoint: true, timeMs: 8100 }), 'scan-slow');
  assert.equal(g.update({ floorLocked: true, hasPoint: true, timeMs: 8200 }), 'none');
});

test('asks to aim at the floor only after the point has been missing for a while', () => {
  const g = createFloorGuidance({ slowScanMs: 8000, aimDelayMs: 1500, blockedDelayMs: 400 });
  assert.equal(g.update({ floorLocked: true, hasPoint: false, timeMs: 0 }), 'none');
  assert.equal(g.update({ floorLocked: true, hasPoint: false, timeMs: 1400 }), 'none');
  assert.equal(g.update({ floorLocked: true, hasPoint: false, timeMs: 1500 }), 'aim-floor');
  assert.equal(g.update({ floorLocked: true, hasPoint: true, timeMs: 1600 }), 'none');
  assert.equal(g.update({ floorLocked: true, hasPoint: false, timeMs: 1700 }), 'none');
});

test('says an obstacle is in the way soon after the aim is blocked', () => {
  const g = createFloorGuidance({ slowScanMs: 8000, aimDelayMs: 1500, blockedDelayMs: 400 });
  assert.equal(g.update({ floorLocked: true, hasPoint: false, blocked: true, timeMs: 0 }), 'none');
  assert.equal(g.update({ floorLocked: true, hasPoint: false, blocked: true, timeMs: 400 }), 'blocked');
  // No longer blocked, still no point: back to the slower aim-at-the-floor timer.
  assert.equal(g.update({ floorLocked: true, hasPoint: false, timeMs: 500 }), 'none');
  assert.equal(g.update({ floorLocked: true, hasPoint: false, timeMs: 1500 }), 'aim-floor');
  assert.equal(g.update({ floorLocked: true, hasPoint: true, timeMs: 1600 }), 'none');
  // While the floor is unknown the scan hint wins.
  assert.equal(g.update({ floorLocked: false, hasPoint: false, blocked: true, timeMs: 1700 }), 'scan');
});

test('reset restarts the timers', () => {
  const g = createFloorGuidance({ slowScanMs: 1000, aimDelayMs: 1500, blockedDelayMs: 400 });
  g.update({ floorLocked: false, hasPoint: false, timeMs: 0 });
  g.reset();
  assert.equal(g.update({ floorLocked: false, hasPoint: false, timeMs: 5000 }), 'scan');
});
