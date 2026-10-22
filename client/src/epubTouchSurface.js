// Resolve parent-page coordinates without mobile iframe caret/event APIs.
export function framePoint(point, frameBox, frameWidth, frameHeight) {
  if (!frameBox.width || !frameBox.height || !frameWidth || !frameHeight) return null;
  return { x: (point.clientX - frameBox.left) * frameWidth / frameBox.width,
    y: (point.clientY - frameBox.top) * frameHeight / frameBox.height };
}
export function isTap(start, end, moved) {
  return Boolean(start && end && !moved && Math.hypot(end.clientX - start.clientX, end.clientY - start.clientY) <= 10);
}
export function installTouchSurface(iframe, host, { pick, choose, hover, leave, activateLink }) {
  if (!iframe) return { redraw() {}, destroy() {} };
  const doc = host.ownerDocument, win = doc.defaultView;
  const surface = doc.createElement('div');
  surface.setAttribute('data-lr-touch-surface', '');
  surface.setAttribute('aria-hidden', 'true');
  surface.style.cssText = 'position:absolute;inset:0;z-index:2147482000;background:transparent;touch-action:pan-y pinch-zoom;user-select:none;-webkit-user-select:none;';
  const media = win.matchMedia('(pointer: coarse), (max-width: 650px)');
  const setEnabled = () => { surface.style.pointerEvents = media.matches ? 'auto' : 'none'; };
  setEnabled(); media.addEventListener('change', setEnabled);
  host.appendChild(surface);
  let start = null, moved = false, handled = false, lastHandled = 0;
  const pointInFrame = (point) => framePoint(point, iframe.getBoundingClientRect(), iframe.clientWidth, iframe.clientHeight);
  function select(point) {
    const local = pointInFrame(point);
    if (!local) return false;
    const value = pick(local.x, local.y);
    if (!value) return false;
    choose(value); handled = true; lastHandled = Date.now(); return true;
  }
  function down(point) { start = { clientX: point.clientX, clientY: point.clientY }; moved = false; handled = false; }
  function move(point) { if (start && Math.hypot(point.clientX - start.clientX, point.clientY - start.clientY) > 10) moved = true; }
  function finish(point) {
    if (!handled && isTap(start, point, moved)) select(point);
  }
  const handlers = {
    pointerdown: (event) => down(event),
    pointermove: (event) => { move(event); if (event.pointerType === 'mouse') { const p = pointInFrame(event); if (p) hover(p.x, p.y); } },
    pointerup: finish,
    pointercancel: () => { moved = true; },
    pointerleave: leave,
    touchstart: (event) => { if (event.touches.length === 1) down(event.touches[0]); else moved = true; },
    touchmove: (event) => { if (event.touches[0]) move(event.touches[0]); },
    touchend: (event) => { if (event.changedTouches[0]) finish(event.changedTouches[0]); },
    touchcancel: () => { moved = true; },
    click: (event) => {
      if (Date.now() - lastHandled < 700 || moved) return;
      if (!select(event)) { const p = pointInFrame(event); if (p) activateLink(p.x, p.y); }
    },
  };
  for (const [name, handler] of Object.entries(handlers)) surface.addEventListener(name, handler, { passive: true });
  return {
    redraw() {
      const box = iframe.getBoundingClientRect(), parent = host.getBoundingClientRect();
      surface.style.visibility = box.right > parent.left && box.left < parent.right && box.bottom > parent.top && box.top < parent.bottom ? 'visible' : 'hidden';
    },
    destroy() {
      media.removeEventListener('change', setEnabled);
      for (const [name, handler] of Object.entries(handlers)) surface.removeEventListener(name, handler);
      surface.remove();
    },
  };
}
