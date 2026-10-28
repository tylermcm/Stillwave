import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileDashboardLayout, navigationSwipe } from '../src/core/mobileDashboard';

test('touch guide fills landscape phones and tablets without distorting either axis', () => {
  for (const [width, height] of [[740, 360], [852, 393], [960, 400], [1280, 800], [640, 320]]) {
    const layout = mobileDashboardLayout(width!, height!);
    assert.ok(Math.abs(layout.width * layout.scale - width!) < .001);
    assert.ok(Math.abs(layout.height * layout.scale - height!) < .001);
    assert.ok(layout.rowHeight * layout.scale >= 44 - .001, 'guide rows remain finger sized');
    const originalScale = Math.min(width! / 1920, (height! - 56) / 1000);
    assert.ok(layout.scale <= originalScale * 1.15, 'zoom stays close to the former landscape layout');
  }
});

test('side navigation responds to inward and outward swipes, not taps or vertical pulls', () => {
  assert.equal(navigationSwipe(32, 5), 'open');
  assert.equal(navigationSwipe(-40, -8), 'close');
  assert.equal(navigationSwipe(8, 0), undefined);
  assert.equal(navigationSwipe(5, 80), undefined);
  assert.equal(navigationSwipe(5, -80), undefined);
  assert.equal(navigationSwipe(30, 30), undefined);
});
