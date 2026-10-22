const tokenPattern = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;
const blockSelector = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,div';
const normalize = (word) => String(word || '').toLowerCase().replaceAll('’', "'");

// Decorations live outside the book body: its XHTML and CFI addresses stay intact.
export function installWordInteractions(contents, onSelect) {
  const doc = contents.document, win = contents.window;
  const overlay = doc.createElement('div');
  overlay.setAttribute('data-lr-overlay', '');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483000!important;';
  const layers = {};
  for (const name of ['saved', 'hover', 'selected']) {
    layers[name] = doc.createElement('div');
    layers[name].setAttribute('data-lr-layer', name);
    layers[name].style.cssText = 'all:initial!important;pointer-events:none!important;';
    overlay.appendChild(layers[name]);
  }
  doc.documentElement.appendChild(overlay);
  let saved = [], hovered = null, selected = null, lastTouch = 0, pointerStart = null, frame = 0, selectionTimer = 0, moved = false, disposed = false;
  const originalCursor = doc.body.style.cursor;
  function paint(name, ranges) {
    const layer = layers[name]; layer.replaceChildren();
    for (const range of ranges) {
      if (!range?.startContainer?.isConnected) continue;
      for (const rect of range.getClientRects()) {
        if (rect.width < .5 || rect.height < .5) continue;
        const mark = doc.createElement('i');
        const background = name === 'selected' ? '#36ad9855' : name === 'hover' ? '#36ad9826' : '#eed88788';
        const border = name === 'saved' ? 'none' : `1px solid ${name === 'selected' ? '#167a6f' : '#167a6f77'}`;
        mark.style.cssText = `all:initial!important;display:block!important;position:fixed!important;pointer-events:none!important;left:${rect.left}px!important;top:${rect.top}px!important;width:${rect.width}px!important;height:${rect.height}px!important;background:${background}!important;outline:${border}!important;border-radius:2px!important;`;
        layer.appendChild(mark);
      }
    }
  }
  function redraw() {
    if (disposed) return;
    paint('saved', saved); paint('hover', hovered ? [hovered.range] : []); paint('selected', selected ? [selected.range] : []);
  }
  function blockData(node) {
    if (!node) return null;
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element || element.closest('a,button,input,textarea,script,style,svg,[data-lr-overlay]')) return null;
    const block = element.closest(blockSelector) || element;
    const walker = doc.createTreeWalker(block, 4);
    const nodes = []; let child, text = '';
    while ((child = walker.nextNode())) {
      if (child.parentElement.closest('script,style,svg,[data-lr-overlay]')) continue;
      nodes.push({ node: child, start: text.length }); text += child.textContent;
    }
    return { block, nodes, text };
  }
  function makeRange(data, start, end) {
    const first = data.nodes.find((item) => start >= item.start && start < item.start + item.node.length);
    const last = data.nodes.find((item) => end > item.start && end <= item.start + item.node.length);
    if (!first || !last) return null;
    const range = doc.createRange(); range.setStart(first.node, start - first.start); range.setEnd(last.node, end - last.start); return range;
  }
  function result(data, match, range) {
    const sentence = [...data.text.matchAll(/[^.!?]+[.!?]+[”’"']?|[^.!?]+$/g)]
      .find((part) => match.index >= part.index && match.index < part.index + part[0].length)?.[0] || data.text;
    return { word: match[0], sentence: sentence.replace(/\s+/g, ' ').trim(), range };
  }
  function atPoint(x, y, tolerance = 1) {
    let caret;
    try {
      caret = doc.caretRangeFromPoint?.(x, y);
      if (!caret) {
        const position = doc.caretPositionFromPoint?.(x, y);
        if (position) { caret = doc.createRange(); caret.setStart(position.offsetNode, position.offset); }
      }
    } catch { /* Fall back to text rectangles on older mobile browsers. */ }
    const data = blockData(caret?.startContainer || doc.elementFromPoint(x, y));
    if (!data) return null;
    const node = data.nodes.find((item) => item.node === caret?.startContainer);
    const offset = node ? node.start + caret.startOffset : -1;
    const matches = [...data.text.matchAll(tokenPattern)];
    const candidates = offset >= 0 ? matches.filter((match) => offset >= match.index && offset <= match.index + match[0].length) : matches;
    for (const match of candidates) {
      const range = makeRange(data, match.index, match.index + match[0].length);
      if (range && [...range.getClientRects()].some((rect) => x >= rect.left - tolerance && x <= rect.right + tolerance && y >= rect.top - tolerance && y <= rect.bottom + tolerance)) return result(data, match, range);
    }
    return null;
  }
  function fromSelection() {
    const selection = win.getSelection();
    const text = selection?.toString().trim();
    if (!text || !/^[A-Za-z]+(?:['’\-][A-Za-z]+)*$/.test(text) || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0).cloneRange();
    const data = blockData(range.startContainer); if (!data) return null;
    const prefix = doc.createRange(); prefix.selectNodeContents(data.block); prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    return result(data, { 0: text, index: start }, range);
  }
  function choose(value) {
    if (!value || disposed) return;
    const same = selected?.range.startContainer === value.range.startContainer && selected?.range.startOffset === value.range.startOffset && selected?.word === value.word;
    selected = value; overlay.dataset.lrSelectedWord = value.word;
    paint('selected', [value.range]);
    if (!same) onSelect(value.word, value.sentence);
  }
  function hover(event) {
    if (event.pointerType === 'touch') { if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 10) moved = true; return; }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      hovered = atPoint(event.clientX, event.clientY);
      overlay.dataset.lrHoveredWord = hovered?.word || '';
      doc.body.style.cursor = hovered ? 'pointer' : originalCursor;
      paint('hover', hovered ? [hovered.range] : []);
    });
  }
  function leave() { hovered = null; overlay.dataset.lrHoveredWord = ''; doc.body.style.cursor = originalCursor; paint('hover', []); }
  function down(event) { moved = false; pointerStart = { x: event.clientX, y: event.clientY }; }
  function up(event) {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    lastTouch = Date.now();
    if (moved || (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 10)) return;
    choose(atPoint(event.clientX, event.clientY, 4) || fromSelection());
  }
  function touch(event) {
    if (Date.now() - lastTouch < 500) return;
    const point = event.changedTouches?.[0]; if (!point) return;
    lastTouch = Date.now();
    if (moved || (pointerStart && Math.hypot(point.clientX - pointerStart.x, point.clientY - pointerStart.y) > 10)) return;
    choose(atPoint(point.clientX, point.clientY, 4) || fromSelection());
  }
  function click(event) { if (Date.now() - lastTouch > 650) choose(atPoint(event.clientX, event.clientY) || fromSelection()); }
  function selectionChanged() { clearTimeout(selectionTimer); selectionTimer = setTimeout(() => choose(fromSelection()), 120); }
  const handlers = { pointermove: hover, mousemove: hover, pointerleave: leave, pointerdown: down, pointerup: up, click, touchstart: (event) => { const point = event.touches?.[0]; if (point) { moved = false; pointerStart = { x: point.clientX, y: point.clientY }; } }, touchmove: (event) => { const point = event.touches?.[0]; if (point && pointerStart && Math.hypot(point.clientX - pointerStart.x, point.clientY - pointerStart.y) > 10) moved = true; }, touchend: touch, selectionchange: selectionChanged };
  for (const [name, handler] of Object.entries(handlers)) doc.addEventListener(name, handler, { passive: true });
  win.addEventListener('resize', redraw); win.addEventListener('scroll', redraw, { passive: true });
  contents.on?.('resize', redraw);
  return {
    setSavedRanges(ranges) {
      if (win.CSS?.highlights && win.Highlight) { win.CSS.highlights.set('lr-vocabulary', new win.Highlight(...ranges)); saved = []; }
      else saved = ranges;
      redraw();
    },
    syncSelection(word) { if (!word || normalize(selected?.word) !== normalize(word)) { selected = null; overlay.dataset.lrSelectedWord = ''; paint('selected', []); } },
    redraw,
    destroy() {
      disposed = true; cancelAnimationFrame(frame); clearTimeout(selectionTimer);
      for (const [name, handler] of Object.entries(handlers)) doc.removeEventListener(name, handler);
      win.removeEventListener('resize', redraw); win.removeEventListener('scroll', redraw); contents.off?.('resize', redraw);
      doc.body.style.cursor = originalCursor; overlay.remove();
    },
  };
}
