'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('node:vm').runInThisContext(fs.readFileSync(path.join(__dirname, '../gift-preview-history.js'), 'utf8'));
const {create} = globalThis.GiftPreviewHistory;

const strokes = Object.freeze([]);
const snapshot = (zoom = 1, extras = {}) => Object.freeze({
  settings: Object.freeze({zoom, offsetX: 0, rotation: 0, flipX: false}),
  strokes, mode: 'feather', side: 200, ...extras
});

const first = snapshot();
const second = snapshot(2);
const third = snapshot(3);
const history = create(first);
assert.equal(history.current(), first);
assert.equal(history.canUndo(), false);
assert.equal(history.canRedo(), false);
assert.equal(history.undo(), null);
assert.equal(history.redo(), null);
assert.equal(history.current(), first, 'empty undo and redo preserve the current snapshot');

assert.equal(history.push(second), true);
assert.equal(history.canUndo(), true);
assert.equal(history.canRedo(), false);
assert.equal(history.current(), second, 'snapshots retain their original reference');
assert.equal(history.push(second), false, 'the same snapshot is not recorded twice');
assert.equal(history.push(snapshot(2)), false, 'equal settings and shared strokes are a no-op');
assert.equal(history.undo(), first);
assert.equal(history.canRedo(), true);
assert.equal(history.push(snapshot()), false, 'a no-op while undone preserves the redo branch');
assert.equal(history.canRedo(), true);
assert.equal(history.redo(), second);
assert.equal(history.push(third), true);
assert.equal(history.undo(), second);
const branch = snapshot(4);
assert.equal(history.push(branch), true);
assert.equal(history.redo(), null, 'new edits discard the previous redo branch');
assert.equal(history.undo(), second);
assert.equal(history.undo(), first);
assert.equal(history.undo(), null);
assert.equal(history.redo(), second);
assert.equal(history.redo(), branch);

history.reset(third);
assert.equal(history.current(), third);
assert.equal(history.canUndo(), false);
assert.equal(history.canRedo(), false);
assert.equal(history.undo(), null);
assert.equal(history.redo(), null);

assert.equal(history.push(snapshot(3, {side: 400})), true, 'size edits are recorded');
assert.equal(history.push(snapshot(3, {side: 400, mode: 'transparent'})), true, 'mode edits are recorded');
assert.equal(history.push(snapshot(3, {side: 400, mode: 'transparent', settings: {rotation: 0, offsetX: 0, zoom: 3, flipX: false}})), false, 'setting key order does not create a false edit');
assert.equal(history.push(snapshot(3, {settings: {zoom: 3, offsetX: 0, rotation: 0, flipX: true}})), true, 'boolean transform edits are recorded');
assert.equal(history.push(snapshot(3, {settings: {zoom: 3, offsetX: 0, rotation: 0, flipY: true}})), true, 'different settings keys with equal key counts are not a no-op');

const point = Object.freeze({x: 0.2, y: 0.3});
const stroke = Object.freeze({points: Object.freeze([point]), size: 0.1, mode: 'erase'});
const drawnStrokes = Object.freeze([stroke]);
const painted = snapshot(3, {strokes: drawnStrokes});
history.reset(first);
assert.equal(history.push(painted), true, 'a changed stroke array is an edit');
assert.equal(history.current().strokes, drawnStrokes, 'stroke arrays are shared without cloning');
assert.equal(history.current().strokes[0], stroke, 'stroke objects are shared without cloning');
assert.equal(history.undo(), first);
assert.equal(history.redo(), painted);
assert.equal(drawnStrokes.length, 1);
assert.equal(drawnStrokes[0].points[0], point, 'history operations never mutate strokes or points');

const bounded = create(first, {limit: 2});
bounded.push(second);
bounded.push(third);
bounded.push(branch);
assert.equal(bounded.undo(), third);
assert.equal(bounded.undo(), second);
assert.equal(bounded.undo(), null, 'a two-step history retains three snapshots');
assert.equal(bounded.redo(), third);
assert.equal(bounded.redo(), branch);

const defaultLimit = create(snapshot(0));
for (let i = 1; i <= 50; i++) defaultLimit.push(snapshot(i));
for (let i = 49; i >= 10; i--) assert.equal(defaultLimit.undo().settings.zoom, i);
assert.equal(defaultLimit.undo(), null, 'the default retains exactly forty undo steps');
const zeroLimit = create(first, {limit: 0});
zeroLimit.push(second);
assert.equal(zeroLimit.current(), second);
assert.equal(zeroLimit.undo(), null, 'zero limit retains only the current snapshot');

console.log('gift-preview-history: undo, redo, no-op edits, branch truncation, reset, bounds and shared immutable strokes passed');
