// One pronunciation for a touch that may emit pointerup, touchend and click.
export function createAudioTap(activate, now = Date.now) {
  let start = null, moved = false, handled = false, lastTouch = -Infinity;
  return {
    down(point) { start = { clientX: point.clientX, clientY: point.clientY }; moved = false; handled = false; },
    move(point) { if (start && Math.hypot(point.clientX - start.clientX, point.clientY - start.clientY) > 10) moved = true; },
    cancel() { moved = true; },
    end(point) {
      if (!start || moved || handled || Math.hypot(point.clientX - start.clientX, point.clientY - start.clientY) > 10) return;
      handled = true; lastTouch = now(); activate();
    },
    click(keyboard = false) { if (now() - lastTouch > 700 && (keyboard || !moved)) activate(); },
  };
}
