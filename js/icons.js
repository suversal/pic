'use strict';

// 24×24 线性图标，统一 1.75 描边，圆角端点
const ICON_PATHS = {
  select: '<path d="M5 3.5l13 6.2-5.6 1.7-2.1 5.6z"/><path d="M12.6 12.6l5 5"/>',
  mask: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><rect x="6.5" y="10" width="11" height="4" rx="1" fill="currentColor" stroke="none"/>',
  text: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  arrow: '<path d="M6 18L18 6M9 6h9v9"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="2.5"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  line: '<path d="M5 19L19 5"/>',
  pen: '<path d="M4 20c3-1 4.5-4 7-6.5L18.5 6a2 2 0 00-2.8-2.8L8.2 10.7C5.7 13.2 5 17 4 20z"/>',
  number: '<circle cx="12" cy="12" r="9"/><path d="M10.5 9.2L12.6 8v8"/>',
  highlight: '<path d="M4 20h7"/><path d="M14.5 4.5l5 5-8 8H7.5v-4z"/>',
  spotlight: '<circle cx="12" cy="12" r="3.5"/><path d="M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3"/>',
  magnifier: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6M10.5 8v5M8 10.5h5"/>',
  sticker: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.4"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  imagePlus: '<path d="M20 12.5V18a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h6.5"/><path d="M16 5h6M19 2v6"/><circle cx="9" cy="9.5" r="1.8"/><path d="M20 16l-3.5-3.5L7 20"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="1.8"/><path d="M21 15l-5-5L5 21"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5a1.5 1.5 0 001.5 1.5h6a1.5 1.5 0 001.5-1.5l1-12.5"/>',
  crop: '<path d="M6 2v14a2 2 0 002 2h14"/><path d="M18 22V8a2 2 0 00-2-2H2"/>',
  rotate: '<path d="M20 12a8 8 0 11-2.4-5.7L20 8.5"/><path d="M20 3.5v5h-5"/>',
  flip: '<path d="M12 3v18"/><path d="M8.5 7L4 12l4.5 5zM15.5 7L20 12l-4.5 5z"/>',
  reset: '<path d="M4 12a8 8 0 102.4-5.7L4 8.5"/><path d="M4 3.5v5h5"/>',
  grip: '<circle cx="9" cy="6" r=".9" fill="currentColor"/><circle cx="15" cy="6" r=".9" fill="currentColor"/><circle cx="9" cy="12" r=".9" fill="currentColor"/><circle cx="15" cy="12" r=".9" fill="currentColor"/><circle cx="9" cy="18" r=".9" fill="currentColor"/><circle cx="15" cy="18" r=".9" fill="currentColor"/>',
  vertical: '<rect x="5" y="3" width="14" height="7.5" rx="1.8"/><rect x="5" y="13.5" width="14" height="7.5" rx="1.8"/>',
  horizontal: '<rect x="3" y="5" width="7.5" height="14" rx="1.8"/><rect x="13.5" y="5" width="7.5" height="14" rx="1.8"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  wand: '<path d="M4 20L15 9"/><path d="M15 3v2M15 13v2M9 9h2M19 9h2M18.5 5.5l-1.4 1.4M18.5 12.5l-1.4-1.4"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 00-2.5-2.5H6A2.5 2.5 0 003.5 6v7A2.5 2.5 0 006 15.5h2.5"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M14.5 14.5L21 21M4 4l5 5"/>',
  sparkles: '<path d="M11 3l1.8 4.7L17.5 9.5l-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  fit: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  bookmark: '<path d="M18 21l-6-4-6 4V5a2 2 0 012-2h8a2 2 0 012 2z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  duplicate: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 00-2.5-2.5H6A2.5 2.5 0 003.5 6v7A2.5 2.5 0 006 15.5h2.5"/>',
  bringFront: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5V5a1.5 1.5 0 00-1.5-1.5h-8A1.5 1.5 0 004 5v8a1.5 1.5 0 001.5 1.5H6"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 000-17z" fill="currentColor" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
  alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  palette: '<path d="M12 3a9 9 0 100 18c1.2 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4c0-4.4-4-7.8-9-7.8z"/><path d="M7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01" stroke-width="2.4"/>',
};

function icon(name, size = 18) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] ?? ''}</svg>`;
}

// 页面里写 <i data-icon="name"></i>，启动时换成 SVG
function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => {
    el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 18);
  });
}
