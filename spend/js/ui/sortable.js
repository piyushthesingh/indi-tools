/* Drag to reorder a <ul> by the handle in each item (li[data-id] >
   .drag-handle). Touch, mouse and pen all use pointer events; the handle
   also moves its item with the up and down arrow keys. onReorder gets the
   ids in their new order. */

export function makeSortable(list, onReorder) {
  const items = () => [...list.children].filter((el) => el.dataset.id);
  const ids = () => items().map((el) => el.dataset.id);

  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || !list.contains(handle)) return;
    e.preventDefault();
    const item = handle.closest('li');
    const all = items();
    const from = all.indexOf(item);
    const rects = all.map((el) => el.getBoundingClientRect());
    const height = rects[from].height;
    const startY = e.clientY;
    let to = from;

    try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    item.classList.add('dragging');

    const move = (ev) => {
      const dy = ev.clientY - startY;
      item.style.transform = `translateY(${dy}px)`;
      const centre = rects[from].top + height / 2 + dy;
      to = from;
      while (to < all.length - 1 && centre > rects[to + 1].top + rects[to + 1].height / 2) to++;
      while (to > 0 && centre < rects[to - 1].top + rects[to - 1].height / 2) to--;
      all.forEach((el, i) => {
        if (el === item) return;
        let shift = 0;
        if (from < to && i > from && i <= to) shift = -height;
        if (from > to && i >= to && i < from) shift = height;
        el.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      all.forEach((el) => { el.style.transform = ''; });
      item.classList.remove('dragging');
      if (to !== from) {
        const ref = all[to];
        list.insertBefore(item, from < to ? ref.nextSibling : ref);
        onReorder(ids());
      }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });

  list.addEventListener('keydown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const item = handle.closest('li');
    const all = items();
    const i = all.indexOf(item);
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (j < 0 || j >= all.length) return;
    list.insertBefore(item, e.key === 'ArrowUp' ? all[j] : all[j].nextSibling);
    handle.focus();
    onReorder(ids());
  });
}
