(function (root) {
  'use strict';

  function same(left, right) {
    if (left === right) return true;
    if (!left || !right || left.mode !== right.mode || left.side !== right.side || left.strokes !== right.strokes || left.baseMask !== right.baseMask) return false;
    const leftSettings = left.settings || {};
    const rightSettings = right.settings || {};
    const keys = Object.keys(leftSettings);
    return keys.length === Object.keys(rightSettings).length && keys.every(key =>
      Object.prototype.hasOwnProperty.call(rightSettings, key) && Object.is(leftSettings[key], rightSettings[key]));
  }

  function create(initial, options = {}) {
    const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : 40;
    let snapshots = [initial];
    let index = 0;

    return {
      push(snapshot) {
        if (same(snapshots[index], snapshot)) return false;
        snapshots = snapshots.slice(0, index + 1);
        snapshots.push(snapshot);
        if (snapshots.length > limit + 1) snapshots.splice(0, snapshots.length - limit - 1);
        index = snapshots.length - 1;
        return true;
      },
      undo() { return index > 0 ? snapshots[--index] : null; },
      redo() { return index < snapshots.length - 1 ? snapshots[++index] : null; },
      reset(snapshot) { snapshots = [snapshot]; index = 0; },
      canUndo() { return index > 0; },
      canRedo() { return index < snapshots.length - 1; },
      current() { return snapshots[index]; }
    };
  }

  root.GiftPreviewHistory = {create};
})(typeof window === 'undefined' ? globalThis : window);
