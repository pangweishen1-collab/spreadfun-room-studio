// Shared pointer gesture for moving an uploaded item between preview slots.
export function bindPreviewSlotDrag({overlay, buttons, slotAt, assetAt, isBusy, canMove, move, ghostClass}) {
  let drag = null;
  let suppressClick = false;

  function targetAt(event) {
    const index = slotAt(document.elementFromPoint(event.clientX, event.clientY));
    return index !== null && index !== drag.from && canMove(drag.from, index) ? index : null;
  }

  function start() {
    const {element, image} = assetAt(drag.from);
    const style = getComputedStyle(element);
    const ghost = document.createElement('canvas');
    ghost.width = ghost.height = 240;
    ghost.className = ghostClass;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = style.width;
    ghost.style.height = style.height;
    const width = image.naturalWidth ?? image.width;
    const height = image.naturalHeight ?? image.height;
    if (width && height) {
      const scale = Math.min(240 / width, 240 / height);
      const w = width * scale;
      const h = height * scale;
      ghost.getContext('2d').drawImage(image, (240 - w) / 2, (240 - h) / 2, w, h);
    }
    document.body.append(ghost);
    drag.ghost = ghost;
    buttons[drag.from].dataset.moving = 'true';
    suppressClick = true;
  }

  function finish(destination = null) {
    if (!drag) return;
    const {from, target, ghost} = drag;
    drag = null;
    if (!ghost) return;
    ghost.remove();
    delete buttons[from].dataset.moving;
    if (target !== null) delete buttons[target].dataset.moveTarget;
    if (isBusy() || destination === null) return;
    move(from, destination);
    buttons[destination].focus({preventScroll: true});
  }

  overlay.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    if (isBusy() || drag) return;
    const from = slotAt(event.target);
    if (from === null || !assetAt(from)) return;
    drag = {from, pointerId: event.pointerId, x: event.clientX, y: event.clientY, target: null, ghost: null};
  });
  window.addEventListener('pointermove', event => {
    if (drag?.pointerId !== event.pointerId) return;
    if (event.pointerType === 'mouse' && !(event.buttons & 1)) {
      finish();
      return;
    }
    if (!drag.ghost) {
      if (isBusy() || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      start();
    }
    event.preventDefault();
    drag.ghost.style.left = `${event.clientX}px`;
    drag.ghost.style.top = `${event.clientY}px`;
    const index = targetAt(event);
    if (index === drag.target) return;
    if (drag.target !== null) delete buttons[drag.target].dataset.moveTarget;
    drag.target = index;
    if (index !== null) buttons[index].dataset.moveTarget = 'true';
  });
  window.addEventListener('pointerup', event => {
    if (drag?.pointerId === event.pointerId) finish(targetAt(event));
  });
  window.addEventListener('pointercancel', event => {
    if (drag?.pointerId === event.pointerId) finish();
  });
  window.addEventListener('pointerout', event => {
    if (drag?.pointerId === event.pointerId && event.pointerType === 'mouse' && !event.relatedTarget) finish();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag?.ghost) {
      event.preventDefault();
      finish();
    }
  });
  window.addEventListener('blur', () => finish());

  return {
    cancel() { finish(); },
    consumeClick(event) {
      // Suppress the mouse/touch click emitted after dragging, while
      // leaving keyboard activation and new pointer gestures available.
      if (!suppressClick || event.detail === 0) return false;
      suppressClick = false;
      event.preventDefault();
      return true;
    }
  };
}
