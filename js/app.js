'use strict';

const HISTORY_LIMIT = 100;
const MIN_DRAG = 4;
// X 网页端单张图片上限约 5 MB
const X_IMAGE_LIMIT = 5 * 1024 * 1024;
const PREFS_KEY = 'magicpin:prefs:v1';
const THUMB_MAX = 360;

// [id, 名称, 快捷键]；null 表示分组分隔线
const TOOLS = [
  ['select', '选择', 'v'], ['crop', '裁剪', 'c'], null,
  ['mask', '遮挡', 'm'], null,
  ['text', '文字', 't'], ['arrow', '箭头', 'a'], ['rect', '矩形', 'r'], ['ellipse', '椭圆', 'o'], ['line', '直线', 'l'], ['pen', '画笔', 'p'], null,
  ['number', '序号', 'n'], ['highlight', '高亮', 'h'], ['spotlight', '聚光', 'f'], ['magnifier', '放大镜', 'z'], ['sticker', '贴纸', 'e'],
];
const TOOL_LIST = TOOLS.filter(Boolean);

const TOOL_HINTS = {
  crop: '点击要裁剪的图片（也可以在选择工具下双击图片）',
  mask: '拖出矩形遮挡；跨多张图时会按图片自动拆分',
  text: '点击放置文字，⌘Enter 完成，双击可再次编辑',
  arrow: '拖动画箭头',
  rect: '拖动画矩形框',
  ellipse: '拖动画椭圆',
  line: '拖动画直线',
  pen: '按住拖动自由绘制',
  number: '点击放置序号，自动递增',
  highlight: '拖出半透明高亮区域',
  spotlight: '拖出要突出的区域，其余部分变暗',
  magnifier: '点击放置，选中后拖四角调整大小',
  sticker: '选一个表情，再点击图片放置；选中后拖四角调整大小',
};

const MASK_HINTS = {
  solid: '适合号码、账号等敏感信息，导出后不可还原',
  mosaic: '仅作视觉弱化，号码类内容请用纯色',
  blur: '仅作视觉弱化，号码类内容请用纯色',
};

const TYPE_NAMES = {
  mask: '遮挡', text: '文字', arrow: '箭头', rect: '矩形', ellipse: '椭圆', line: '直线', pen: '画笔',
  number: '序号', highlight: '高亮', spotlight: '聚光', magnifier: '放大镜', sticker: '贴纸',
};

const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6', '#111111', '#ffffff'];
const MASK_COLORS = ['#000000', '#ffffff', '#6b7280'];
const BG_COLORS = ['#ffffff', '#f4f4f5', '#f3eee6', '#e9e4da', '#e6ebf1', '#e7ece3', '#18181b', '#0a0a0b'];
const WM_COLORS = ['auto', '#ffffff', '#111111', '#5b5bf0', '#ef4444'];
const EMOJIS = ['👉', '👈', '👆', '👇', '✅', '❌', '⚠️', '❗', '❓', '💡', '🔥', '⭐', '❤️', '👍', '👎', '🎉', '😂', '🤔', '👀', '💯'];
const STROKE_TYPES = new Set(['arrow', 'line', 'rect', 'ellipse', 'pen']);

const FRAMES = [
  ['none', '无'], ['glass', '玻璃'], ['white', '白边'], ['black', '黑边'],
  ['iphone', 'iPhone'],
  ['mac-light', 'Mac 浅色'], ['mac-dark', 'Mac 深色'], ['browser-light', '浏览器'], ['browser-dark', '浏览器深色'],
];
const FRAME_IDS = new Set(FRAMES.map(([id]) => id));
// 旧版本有四种颜色的 iPhone 外框，现在统一成一个
const normalizeFrame = (f) => (f?.startsWith('iphone') ? 'iphone' : FRAME_IDS.has(f) ? f : 'none');

// 模板：padding、border、radius、shadow 以“单位”计，应用时按当前图片尺寸换算成像素
const STYLE_KEYS = ['frame', 'bg', 'mesh', 'gradient', 'color', 'noise', 'pattern', 'padding', 'border', 'radius', 'shadow'];
// 每种外框至少一个模板，背景轮流用弥散、渐变、纯色加图案、模糊原图；统一留白和颗粒，配色只用同一组低饱和色。
// 网格背景序号：0 奶油 1 雾蓝 2 鼠尾草 3 玫瑰灰 4 薰衣草 5 午夜 6 石墨 7 极光 8 余晖 9 深林
// 渐变序号：0 象牙 1 雾灰 2 晨曦 3 海盐 4 抹茶 5 杏子 6 靛夜 7 紫夜 8 深海 9 石墨
const PRESETS = [
  { name: '无', none: true, style: { frame: 'none', bg: 'none', noise: false, pattern: 'none', padding: 0, radius: 0, shadow: 0 } },
  { name: '圆角', style: { frame: 'none', bg: 'mesh', mesh: 1, noise: true, pattern: 'none', padding: 68, radius: 8, shadow: 18 } },
  { name: '白边', style: { frame: 'white', bg: 'solid', color: '#ece6dc', noise: true, pattern: 'none', padding: 68, border: 10, radius: 4, shadow: 14 } },
  { name: 'iPhone', style: { frame: 'iphone', bg: 'gradient', gradient: 2, noise: true, pattern: 'none', padding: 68, radius: 0, shadow: 20 } },
  { name: 'Mac 窗口', style: { frame: 'mac-light', bg: 'mesh', mesh: 2, noise: true, pattern: 'none', padding: 68, radius: 0, shadow: 18 } },
  { name: '浏览器', style: { frame: 'browser-light', bg: 'solid', color: '#f4f4f5', noise: false, pattern: 'dots', padding: 68, radius: 0, shadow: 16 } },
  { name: '模糊', style: { frame: 'none', bg: 'blur', noise: true, pattern: 'none', padding: 68, radius: 8, shadow: 24 } },
  { name: '网格', style: { frame: 'white', bg: 'solid', color: '#eef1f5', noise: false, pattern: 'grid', padding: 68, border: 6, radius: 6, shadow: 14 } },
  { name: '黑边', style: { frame: 'black', bg: 'gradient', gradient: 1, noise: true, pattern: 'none', padding: 68, border: 12, radius: 3, shadow: 22 } },
  { name: '玻璃', style: { frame: 'glass', bg: 'mesh', mesh: 7, noise: true, pattern: 'none', padding: 68, border: 9, radius: 6, shadow: 26 } },
  { name: 'Mac 深色', style: { frame: 'mac-dark', bg: 'gradient', gradient: 8, noise: true, pattern: 'none', padding: 68, radius: 0, shadow: 28 } },
  { name: '浏览器深色', style: { frame: 'browser-dark', bg: 'solid', color: '#141416', noise: true, pattern: 'grid', padding: 68, radius: 0, shadow: 26 } },
];

const $ = (id) => document.getElementById(id);
hydrateIcons();
const els = {
  app: $('app'), workspace: $('workspace'),
  add: $('add'), addZone: $('add-zone'), emptyAdd: $('empty-add'), demo: $('demo'), file: $('file'), clear: $('clear'),
  list: $('list'), imageCount: $('image-count'),
  layoutSeg: $('layout-seg'), columnsRow: $('columns-row'), columnsSeg: $('columns-seg'), fitSeg: $('fit-seg'), fitLabel: $('fit-label'), alignSeg: $('align-seg'), fitRow: $('fit-row'), alignRow: $('align-row'),
  gap: $('gap'), gapOut: $('gap-out'), stitch: $('stitch'), resetCrops: $('reset-crops'),
  gallery: $('gallery'), shuffle: $('shuffle'), saveStyle: $('save-style'), frames: $('frames'),
  titleRow: $('title-row'), titleLabel: $('title-label'), windowTitle: $('window-title'),
  bgEnabled: $('bg-enabled'), bgBody: $('bg-body'), bgOffNote: $('bg-off-note'),
  bgSeg: $('bg-seg'), bgOptions: $('bg-options'), bgFile: $('bg-file'), noise: $('noise'),
  ratioChips: $('ratio-chips'), padding: $('padding'), paddingOut: $('padding-out'),
  radiusRow: $('radius-row'), radius: $('radius'), radiusOut: $('radius-out'), shadow: $('shadow'), shadowOut: $('shadow-out'),
  patternSeg: $('pattern-seg'), patternStrength: $('pattern-strength'), patternStrengthOut: $('pattern-strength-out'), patternStrengthRow: $('pattern-strength-row'),
  shadowRow: $('shadow-row'), shadowNote: $('shadow-note'), shadowBgOn: $('shadow-bg-on'),
  borderRow: $('border-row'), border: $('border'), borderOut: $('border-out'),
  fitCanvas: $('fit-canvas'), wmSection: $('wm-section'), bgSection: $('bg-section'), rightSections: document.querySelectorAll('.sidebar.right > details.panel-section'), wmEnabled: $('wm-enabled'), wmText: $('wm-text'), wmPosition: $('wm-position'),
  wmTileFields: $('wm-tile-fields'), wmDensity: $('wm-density'), wmDensityOut: $('wm-density-out'),
  wmAngle: $('wm-angle'), wmAngleOut: $('wm-angle-out'), wmSize: $('wm-size'), wmSizeOut: $('wm-size-out'),
  wmOpacity: $('wm-opacity'), wmOpacityOut: $('wm-opacity-out'), wmColors: $('wm-colors'),
  tools: $('tools'), dockActions: $('dock-actions'), undo: $('undo'), redo: $('redo'), resetAll: $('reset-all'),
  zoomOut: $('zoom-out'), zoomIn: $('zoom-in'), zoomLabel: $('zoom-label'), zoomFit: $('zoom-fit'),
  zoomCtl: $('zoom-ctl'), zoomSlider: $('zoom-slider'), zoomMenu: $('zoom-menu'),
  copy: $('copy'), exportToggle: $('export-toggle'), exportPop: $('export-pop'), exportFormat: $('export-format'),
  exportScale: $('export-scale'), exportMode: $('export-mode'), exportX: $('export-x'), exportMeta: $('export-meta'), popCopy: $('pop-copy'), download: $('download'),
  shortcuts: $('shortcuts'), shortcutsModal: $('shortcuts-modal'), shortcutGrid: $('shortcut-grid'),
  props: $('props'), viewport: $('viewport'), empty: $('empty'), wrap: $('wrap'),
  canvas: $('canvas'), editor: $('editor'), sizeInfo: $('size-info'), notice: $('notice'),
};

// 已导入的图片不随撤销删除，状态里只记录 id，撤销“删除图片”时才能找回
const sources = new Map();
let nextImageId = 1;
let nextObjectId = 1;
let booting = true;

// 遮挡和标注存在所属图片的局部坐标里（anchor 为图片 id），布局变化时跟着图片走
let state = {
  images: [],
  layout: { mode: 'vertical', columns: 2, fit: 'none', align: 'start', gap: 0 },
  style: {
    frame: 'none', bg: 'none', bgLast: 'mesh', color: '#ffffff', gradient: 0, mesh: 0, bgImage: null, noise: false,
    pattern: 'none', patternStrength: 50, ratio: 'auto', padding: 0, border: 0, radius: 0, shadow: 0, title: '',
  },
  watermark: { enabled: false, text: '', position: 'br', size: 9, opacity: 0.7, color: 'auto', density: 5, angle: -30 },
  objects: [],
};
const undoStack = [];
const redoStack = [];
let liveBase = null;

const defaults = {
  mask: { mode: 'solid', color: '#000000', strength: { mosaic: 20, blur: 28 } },
  text: { color: '#ef4444', level: 1, bold: true, style: 'outline', font: 'sans', align: 'left' },
  arrow: { color: '#ef4444', level: 1 },
  rect: { color: '#ef4444', level: 1 },
  ellipse: { color: '#ef4444', level: 1 },
  line: { color: '#ef4444', level: 1 },
  pen: { color: '#ef4444', level: 1 },
  number: { color: '#ef4444', level: 1 },
  highlight: { color: '#facc15' },
  spotlight: {},
  magnifier: { color: '#ffffff', zoom: 2 },
  sticker: { char: '👉', level: 1 },
};

// sections：右栏各块的展开状态，按区块 id 记
const prefs = { export: { format: 'image/png', scale: 1, x: true, mode: 'all' }, userPresets: [], theme: 'system', sections: {} };

// shift：调整截取范围时画布的临时平移，让没裁掉的部分在屏幕上原地不动
const view = { zoom: 1, fit: true, shift: { x: 0, y: 0 } };
let tool = 'select';
let selectedId = null;
// 多选时放在 multi 里，此时 selectedId 为 null；单选只用 selectedId
let multi = [];
let spaceDown = false;
// 悬停反馈：画布上的对象、图片，以及左侧列表里指向的图片
let hoverId = null;
let hoverImage = null;
let listHoverImage = null;
let drag = null;
let editing = null;
// 选择工具下点中的图片：显示四角控制点，拖角等比缩放
let imageSel = null;
// 画框类工具还没按下时，鼠标所在点能对齐的参考线，先对准再按
let hoverGuides = [];
let geo = null;
let base = null;
let geoKey = '';
let frame = 0;
let noticeTimer = 0;
let previewTimer = 0;
let previewKey = '';
let prefsTimer = 0;
let dragIndex = null;
// 在画布上调整某张图的截取范围：{ id }；进入后点击和拖动都交给裁切处理
let cropEdit = null;
const magnifierSample = document.createElement('canvas');

// ---------- 偏好 ----------

function loadPrefs() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
  } catch {
    saved = null;
  }
  if (!saved) return;
  if (saved.style) {
    Object.assign(state.style, saved.style, { bgImage: null });
    state.style.frame = normalizeFrame(state.style.frame);
    if (state.style.bg === 'image') state.style.bg = 'mesh';
    if (state.style.bgLast === 'image' || state.style.bgLast === 'none') state.style.bgLast = 'mesh';
  }
  if (saved.layout) Object.assign(state.layout, saved.layout);
  if (saved.watermark) Object.assign(state.watermark, saved.watermark);
  if (saved.defaults) {
    for (const [k, v] of Object.entries(saved.defaults)) if (defaults[k]) Object.assign(defaults[k], v);
  }
  if (saved.export) Object.assign(prefs.export, saved.export);
  if (Array.isArray(saved.userPresets)) prefs.userPresets = saved.userPresets;
  if (['system', 'light', 'dark'].includes(saved.theme)) prefs.theme = saved.theme;
  if (saved.sections && typeof saved.sections === 'object') prefs.sections = saved.sections;
}

const THEMES = { system: ['contrast', '外观：跟随系统'], light: ['sun', '外观：浅色'], dark: ['moon', '外观：深色'] };

function applyTheme() {
  if (prefs.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = prefs.theme;
  const [name, tip] = THEMES[prefs.theme];
  const btn = $('theme');
  btn.innerHTML = icon(name);
  btn.dataset.tip = tip;
  requestRender();
}

$('theme').addEventListener('click', () => {
  prefs.theme = { system: 'light', light: 'dark', dark: 'system' }[prefs.theme];
  applyTheme();
  savePrefs();
});

function savePrefs() {
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    try {
      const { bgImage, ...style } = state.style;
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        style, layout: state.layout, watermark: state.watermark, defaults, export: prefs.export, userPresets: prefs.userPresets, theme: prefs.theme, sections: prefs.sections,
      }));
    } catch {
      // 隐私模式或存储被禁用时不记忆偏好，不影响使用
    }
  }, 300);
}

// ---------- 状态与历史 ----------

function pushHistory(snapshot) {
  undoStack.push(snapshot);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function commit(change) {
  endLive();
  const next = structuredClone(state);
  change(next);
  pushHistory(state);
  state = next;
  refresh();
}

// 滑块、颜色、输入框拖动过程中实时预览，松手时只记一条历史
function live(change) {
  if (!liveBase) liveBase = structuredClone(state);
  change(state);
  updateGeometry();
  requestRender();
}

function endLive() {
  if (!liveBase) return;
  pushHistory(liveBase);
  liveBase = null;
  refresh();
}

function undo() {
  endLive();
  if (!undoStack.length) return;
  redoStack.push(state);
  state = undoStack.pop();
  clearSelection();
  refresh();
}

function redo() {
  endLive();
  if (!redoStack.length) return;
  undoStack.push(state);
  state = redoStack.pop();
  clearSelection();
  refresh();
}

function refresh() {
  updateGeometry();
  if (selectedId != null && !findObject(selectedId)) selectedId = null;
  if (multi.length) setSelection(multi);
  if (cropEdit && !state.images.some((im) => im.id === cropEdit.id)) {
    cropEdit = null;
    canvasHold = null;
  }
  if (imageSel != null && !state.images.some((im) => im.id === imageSel)) imageSel = null;
  renderList();
  syncPanels();
  renderProps();
  schedulePreviews();
  requestRender();
  savePrefs();
  scheduleSessionSave();
}

function updateGeometry() {
  // 锁定的画布尺寸只在排版设置不变时有效；换了排列、留白、比例、外框或增删图片就作废
  if (state.canvasLock && !canvasLock(state)) delete state.canvasLock;
  const hold = canvasHold ?? canvasLock(state);
  const key = JSON.stringify([state.images, state.layout, state.style, hold]);
  if (key === geoKey) return;
  geoKey = key;
  geo = computeGeometry(state, sources, hold);
  base = geo ? buildBase(geo, state.style, { bgImage: bgImageSource() }) : null;
  // 调整截取范围时不自动适应窗口，否则图片裁小后会被放大显示
  if (view.fit && !cropEdit && !holdView) fitZoom();
  else applyZoom();
  updateStatus();
}

function bgImageSource() {
  return state.style.bgImage != null ? sources.get(state.style.bgImage) : null;
}

function findObject(id) {
  return state.objects.find((o) => o.id === id);
}

function currentUnit() {
  return geo?.unit ?? 2.5;
}

// ---------- 对象存取 ----------

function storeObject(c, anchor, id) {
  return { ...toLocalObject(geo, c, anchor), id };
}

// 遮挡按所覆盖的图片拆开，各自跟随对应图片，改布局后不会错位漏出内容
function placeObject(c, id) {
  if (c.type === 'mask') {
    const pieces = [];
    for (const r of geo.rects.values()) {
      const part = intersectRect(c, r);
      if (part) pieces.push(storeObject({ ...c, ...part }, r.id, pieces.length ? nextObjectId++ : id));
    }
    if (pieces.length) return pieces;
  }
  return [storeObject(c, anchorAt(geo, centerOf(c)), id)];
}

function addObject(c) {
  const objs = placeObject(c, nextObjectId++);
  commit((s) => s.objects.push(...objs));
  return objs;
}

function replaceObject(id, c) {
  const objs = placeObject(c, id);
  commit((s) => {
    const i = s.objects.findIndex((o) => o.id === id);
    s.objects.splice(i, 1, ...objs);
  });
  return objs;
}

// 只改属性不改位置，保留原 anchor
function patchObject(s, id, patch) {
  const i = s.objects.findIndex((o) => o.id === id);
  if (i < 0) return;
  const o = s.objects[i];
  s.objects[i] = storeObject({ ...toCanvasObject(geo, o), ...patch }, o.anchor, id);
}

// ---------- 选择 ----------

function selectionIds() {
  if (multi.length) return multi.slice();
  return selectedId != null ? [selectedId] : [];
}

// 一个就是单选，两个以上进入多选
function setSelection(ids) {
  const valid = [...new Set(ids)].filter((id) => findObject(id));
  if (valid.length > 1) {
    multi = valid;
    selectedId = null;
  } else {
    multi = [];
    selectedId = valid[0] ?? null;
  }
}

function clearSelection() {
  multi = [];
  selectedId = null;
}

function deleteSelected() {
  const ids = new Set(selectionIds());
  if (!ids.size) return;
  clearSelection();
  commit((s) => { s.objects = s.objects.filter((o) => !ids.has(o.id)); });
  if (ids.size > 1) notify(`已删除 ${ids.size} 个对象`, 'info', true);
}

// 一次提交移动多个对象；遮挡可能被重新拆分，返回新的 id 列表
function moveObjects(ids, dx, dy, overrides) {
  const next = [];
  commit((s) => {
    for (const id of ids) {
      const i = s.objects.findIndex((o) => o.id === id);
      if (i < 0) continue;
      const c = overrides?.get(id) ?? moveObject(toCanvasObject(geo, s.objects[i]), dx, dy);
      const objs = placeObject(c, id);
      s.objects.splice(i, 1, ...objs);
      next.push(...objs.map((o) => o.id));
    }
  });
  return next;
}

function duplicateSelected() {
  const ids = selectionIds();
  if (!ids.length) return;
  const offset = 16 * currentUnit() / 2.5;
  const copies = [];
  let n = nextNumber();
  for (const id of ids) {
    const c = moveObject(toCanvasObject(geo, findObject(id)), offset, offset);
    if (c.type === 'number') c.n = n++;
    copies.push(...placeObject(c, nextObjectId++));
  }
  commit((s) => s.objects.push(...copies));
  const keep = copies.filter((o) => ids.length > 1 || o.type !== 'mask').map((o) => o.id);
  setSelection(keep);
  renderProps();
  requestRender();
}

// dir 为 1 置顶、-1 置底；多选时保持彼此的前后顺序
function reorderSelected(dir) {
  const ids = new Set(selectionIds());
  if (!ids.size) return;
  commit((s) => {
    const picked = s.objects.filter((o) => ids.has(o.id));
    const rest = s.objects.filter((o) => !ids.has(o.id));
    s.objects = dir > 0 ? [...rest, ...picked] : [...picked, ...rest];
  });
}

const COLOR_TYPES = new Set(['text', 'arrow', 'rect', 'ellipse', 'line', 'pen', 'number', 'highlight']);

function recolorSelected(color) {
  const ids = new Set(selectionIds());
  commit((s) => {
    for (const o of s.objects) if (ids.has(o.id) && COLOR_TYPES.has(o.type)) o.color = color;
  });
}

function unionBounds(list) {
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  return { x, y, w: Math.max(...list.map((b) => b.x + b.w)) - x, h: Math.max(...list.map((b) => b.y + b.h)) - y };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function nextNumber() {
  return state.objects.reduce((max, o) => (o.type === 'number' ? Math.max(max, o.n) : max), 0) + 1;
}

function newObject(type, a, b) {
  const d = defaults[type];
  const u = geo.unit;
  const width = d.width ?? LINE_LEVELS[d.level ?? 1] * u;
  switch (type) {
    case 'mask':
      return { type, ...rectFromPoints(a, b), mode: d.mode, color: d.color, strength: d.strength[d.mode] ?? d.strength.mosaic };
    case 'highlight':
      return { type, ...rectFromPoints(a, b), color: d.color };
    case 'spotlight':
      return { type, ...rectFromPoints(a, b) };
    case 'magnifier':
      return { type, x: a.x, y: a.y, r: d.r ?? 45 * u, zoom: d.zoom, color: d.color };
    case 'sticker':
      return { type, x: a.x, y: a.y, char: d.char, size: d.size ?? FONT_LEVELS[d.level] * u * 2 };
    case 'rect':
    case 'ellipse':
      return { type, ...rectFromPoints(a, b), color: d.color, width };
    case 'arrow':
    case 'line':
      return { type, x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: d.color, width };
    case 'pen':
      return { type, points: [[a.x, a.y]], color: d.color, width };
    case 'number':
      return { type, x: a.x, y: a.y, n: nextNumber(), color: d.color, size: d.size ?? FONT_LEVELS[d.level] * u };
    case 'text': {
      const size = d.size ?? FONT_LEVELS[d.level] * u;
      return { type, x: a.x, y: a.y - size * 0.65, text: '', color: d.color, size, bold: d.bold, style: d.style, font: d.font, align: d.align };
    }
  }
  return null;
}

function isValidNew(o) {
  const min = MIN_DRAG / view.zoom;
  if (RECT_TYPES.has(o.type)) return o.w >= min && o.h >= min;
  if (LINE_TYPES.has(o.type)) return Math.hypot(o.x2 - o.x1, o.y2 - o.y1) >= min;
  if (o.type === 'pen') return o.points.length >= 2;
  return true;
}

// ---------- 画面 ----------

function requestRender() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    render();
  });
}

function canvasObjects() {
  const list = [];
  for (const o of state.objects) {
    if (editing && o.id === editing.id) continue;
    if (drag?.cur && drag.id === o.id) list.push(drag.cur);
    else if (drag?.kind === 'moveMulti' && drag.cur?.has(o.id)) list.push(drag.cur.get(o.id));
    else list.push(toCanvasObject(geo, o));
  }
  if (drag?.kind === 'create' && drag.cur) list.push(drag.cur);
  return list;
}

// g、b 默认是当前拼图；逐张导出时传入单张图片的几何与底图
function composite(target, objs, g = geo, b = base) {
  if (target.width !== g.width) target.width = g.width;
  if (target.height !== g.height) target.height = g.height;
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(b, 0, 0);
  // 遮挡总是最先画：聚光、放大镜和其他标注都建立在已遮挡的画面上
  const masks = [];
  const spots = [];
  const rest = [];
  for (const o of objs) (o.type === 'mask' ? masks : o.type === 'spotlight' ? spots : rest).push(o);
  for (const o of masks) drawObject(ctx, o, b);
  let sample = null;
  if (rest.some((o) => o.type === 'magnifier')) {
    magnifierSample.width = target.width;
    magnifierSample.height = target.height;
    magnifierSample.getContext('2d').drawImage(target, 0, 0);
    sample = magnifierSample;
  }
  if (spots.length) drawSpotlights(ctx, spots, target.width, target.height);
  for (const o of rest) drawObject(ctx, o, b, sample);
  drawWatermark(ctx, g, state.watermark);
}

function render() {
  const hasImages = Boolean(geo);
  els.wrap.hidden = !hasImages;
  // 启动时先等会话恢复，免得空状态一闪而过
  els.empty.hidden = hasImages || booting;
  if (!hasImages) return;
  const objs = canvasObjects();
  composite(els.canvas, objs);
  drawOverlay(objs);
}

// ---------- 对齐吸附 ----------
// 拖动对象时，让它的左/中/右、上/中/下贴到画布中线、图片边缘与中线、其他对象的边缘与中线；
// 画新的框、拖控制点调大小时，鼠标所在的点也一样吸附。按住 ⌥ 临时关闭

const SNAP_PX = 6;

function snapTargets(exclude) {
  const xs = [geo.width / 2];
  const ys = [geo.height / 2];
  const add = (b) => {
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  };
  for (const r of geo.rects.values()) {
    add(r);
    if (r.frame) add(r.frame);
  }
  for (const o of state.objects) if (!exclude.has(o.id)) add(objectBounds(toCanvasObject(geo, o)));
  return { xs, ys };
}

function snapAxis(edges, targets, tol) {
  let best = null;
  for (const e of edges) {
    for (const t of targets) {
      const d = t - e;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t };
    }
  }
  return best;
}

// b0：拖动前的外框（多选时是整体外框）；exclude：正在拖的对象不当作吸附目标
function snapMove(b0, dx, dy, exclude) {
  const b = { ...b0, x: b0.x + dx, y: b0.y + dy };
  const { xs, ys } = snapTargets(exclude);
  const tol = SNAP_PX / view.zoom;
  const sx = snapAxis([b.x, b.x + b.w / 2, b.x + b.w], xs, tol);
  const sy = snapAxis([b.y, b.y + b.h / 2, b.y + b.h], ys, tol);
  const guides = [];
  if (sx) guides.push({ x: sx.at });
  if (sy) guides.push({ y: sy.at });
  return { dx: sx ? sx.d : 0, dy: sy ? sy.d : 0, guides };
}

// 本身没有边线的框：拖动时要描边才看得出范围
const BOX_TYPES = new Set(['mask', 'highlight', 'spotlight']);

// 拖动画出来的工具：起点、终点都吸附
const SNAP_TOOLS = new Set(['mask', 'highlight', 'spotlight', 'rect', 'ellipse', 'arrow', 'line']);

// 单个点吸附：画框的起点和终点、拖动的控制点
function snapPoint(p, exclude = new Set()) {
  const { xs, ys } = snapTargets(exclude);
  const tol = SNAP_PX / view.zoom;
  const sx = snapAxis([p.x], xs, tol);
  const sy = snapAxis([p.y], ys, tol);
  const guides = [];
  if (sx) guides.push({ x: sx.at });
  if (sy) guides.push({ y: sy.at });
  return { p: { x: p.x + (sx ? sx.d : 0), y: p.y + (sy ? sy.d : 0) }, guides };
}

// 拖图片时吸附到其他图片的边缘和中线。坐标都相对排版原点，画布尺寸变化时也不受影响
function imageSnapInfo(id) {
  const rel = (b) => ({ x: b.x - geo.origin.x, y: b.y - geo.origin.y, w: b.w, h: b.h });
  const xs = [];
  const ys = [];
  for (const r of geo.rects.values()) {
    if (r.id === id) continue;
    const b = rel(r.frame);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { box: rel(geo.rects.get(id).frame), targets: { xs, ys } };
}

// ---------- 缩放图片 ----------
// 拖四个角等比缩放：往外拖放大、往里拖缩小。只有这张图在变：对角固定不动，其他图也不被挤开
// （差值记进各自的 offset，放大后可以叠在别的图上）。吸附到原始大小和其他图片的宽高，按住 ⌥ 不吸附

const IMAGE_MIN = 24;

function imageBox(id) {
  const r = geo?.rects.get(id);
  if (!r) return null;
  return geo.group ? { x: r.x, y: r.y, w: r.w, h: r.h } : r.frame;
}

function imageHandles(id) {
  const b = imageBox(id);
  if (!b) return [];
  return [['nw', b.x, b.y], ['ne', b.x + b.w, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.w, b.y + b.h]].map(([name, x, y]) => ({ name, x, y }));
}

function imageHandleAt(p) {
  if (imageSel == null || cropEdit || !p) return null;
  const tol = 8 / view.zoom;
  const h = imageHandles(imageSel).find((q) => Math.hypot(q.x - p.x, q.y - p.y) <= tol);
  return h ? h.name : null;
}

// 统一宽度开着时先按当前显示的大小写进每张图，再关掉，缩放从眼前的样子开始
function unfreezeFit(s) {
  if (s.layout.fit === 'none') return false;
  for (const im of s.images) im.scale = geo.rects.get(im.id).s;
  s.layout.fit = 'none';
  return true;
}

function startImageScale(id, corner, e) {
  const r = geo.rects.get(id);
  drag = { kind: 'scale', id, corner, start: clientPoint(e), w0: r.w, h0: r.h, cw: r.cw, fitOff: false, moved: false, snap: null, pins: imagePins(id, corner) };
  holdView = true;
  holdCanvas();
  requestRender();
}

// 每张图要固定的点（相对排版原点）：缩放的那张是拖动角的对角，其他图是左上角
function imagePins(id, corner) {
  const pins = new Map();
  for (const r of geo.rects.values()) {
    const x = r.id === id && !corner.includes('e') ? r.x + r.w : r.x;
    const y = r.id === id && !corner.includes('s') ? r.y + r.h : r.y;
    pins.set(r.id, { x: x - geo.origin.x, y: y - geo.origin.y });
  }
  return pins;
}

function scaleImage(d, c, free) {
  const sx = d.corner.includes('e') ? 1 : -1;
  const sy = d.corner.includes('s') ? 1 : -1;
  const dx = (c.x - d.start.x) * sx;
  const dy = (c.y - d.start.y) * sy;
  if (!d.moved && Math.hypot(dx, dy) * view.zoom < 2) return;
  if (!d.moved) {
    // 真正拖起来才关统一宽度，只点一下控制点不改任何设置
    d.moved = true;
    if (state.layout.fit !== 'none') live((s) => { d.fitOff = unfreezeFit(s); });
  }
  // 鼠标位移投影到对角线上，斜着拖、横着拖、竖着拖都跟手
  const k = 1 + (dx * d.w0 + dy * d.h0) / (d.w0 * d.w0 + d.h0 * d.h0);
  let w = Math.max(IMAGE_MIN, d.w0 * k);
  d.snap = null;
  if (!free) {
    const tol = SNAP_PX / view.zoom;
    const aspect = d.w0 / d.h0;
    const targets = [[d.cw, null]];
    for (const r of geo.rects.values()) {
      if (r.id === d.id) continue;
      targets.push([r.w, '和其他图同宽'], [r.h * aspect, '和其他图同高']);
    }
    let best = tol;
    for (const [tw, label] of targets) {
      if (Math.abs(tw - w) < best) {
        best = Math.abs(tw - w);
        w = tw;
        d.snap = label;
      }
    }
  }
  const screen = originOnScreen();
  live((s) => { s.images.find((x) => x.id === d.id).scale = w / d.cw; });
  // 排版重新算过后，把每张图挪回固定点
  const now = imagePins(d.id, d.corner);
  live((s) => {
    for (const im of s.images) {
      const want = d.pins.get(im.id);
      const got = now.get(im.id);
      if (!want || !got) continue;
      const dx = Math.round(want.x - got.x);
      const dy = Math.round(want.y - got.y);
      if (dx || dy) im.offset = { x: (im.offset?.x ?? 0) + dx, y: (im.offset?.y ?? 0) + dy };
    }
  });
  keepOrigin(screen);
}

function moveImage(d, c, free) {
  let dx = c.x - d.start.x;
  let dy = c.y - d.start.y;
  if (!d.moved && Math.hypot(dx, dy) * view.zoom < 3) return;
  d.moved = true;
  d.guides = [];
  if (!free) {
    const b = { x: d.box.x + dx, y: d.box.y + dy, w: d.box.w, h: d.box.h };
    const tol = SNAP_PX / view.zoom;
    const sx = snapAxis([b.x, b.x + b.w / 2, b.x + b.w], d.targets.xs, tol);
    const sy = snapAxis([b.y, b.y + b.h / 2, b.y + b.h], d.targets.ys, tol);
    if (sx) {
      dx += sx.d;
      d.guides.push({ x: sx.at });
    }
    if (sy) {
      dy += sy.d;
      d.guides.push({ y: sy.at });
    }
  }
  const screen = originOnScreen();
  live((s) => {
    s.images.find((x) => x.id === d.id).offset = { x: Math.round(d.orig.x + dx), y: Math.round(d.orig.y + dy) };
  });
  keepOrigin(screen);
}

function drawHandle(ctx, x, y, px) {
  const hs = 9 * px;
  ctx.beginPath();
  ctx.roundRect(x - hs / 2, y - hs / 2, hs, hs, 2.5 * px);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 3 * px;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.stroke();
}

function drawScaleLabel(ctx, d, px) {
  const r = geo.rects.get(d.id);
  const h = imageHandles(d.id).find((q) => q.name === d.corner);
  if (!r || !h) return;
  const pct = Math.round(r.s * 100);
  const text = [`${pct}%`, d.snap, pct > 100 ? '放大后可能变糊' : null].filter(Boolean).join(' · ');
  ctx.save();
  ctx.font = `500 ${12 * px}px ${FONT_STACK}`;
  const w = ctx.measureText(text).width + 16 * px;
  const hgt = 22 * px;
  const x = h.x + (d.corner.includes('e') ? 10 * px : -10 * px - w);
  const y = h.y + (d.corner.includes('s') ? 10 * px : -10 * px - hgt);
  ctx.fillStyle = pct > 100 ? '#b45309' : 'rgba(17, 17, 20, 0.86)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, hgt, 6 * px);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 8 * px, y + hgt / 2);
  ctx.restore();
}

function accentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b5bf0';
}

function drawOverlay(objs) {
  const ctx = els.canvas.getContext('2d');
  const px = 1 / view.zoom;
  const accent = accentColor();
  ctx.save();
  ctx.lineWidth = 1.5 * px;

  const imageGuides = drag?.kind === 'image' && drag.moved;
  // 画遮挡、高亮、聚光时描出框的四条边：模糊、马赛克盖在纯色区域上几乎看不出范围
  const boxDrag = (drag?.kind === 'create' || drag?.kind === 'move' || drag?.kind === 'resize') && drag.cur;
  if (boxDrag && BOX_TYPES.has(drag.cur.type)) {
    const c = drag.cur;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5 * px;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(c.x, c.y, c.w, c.h);
    ctx.setLineDash([5 * px, 4 * px]);
    ctx.strokeStyle = accent;
    ctx.strokeRect(c.x, c.y, c.w, c.h);
    ctx.restore();
  }

  const objectGuides = ['move', 'moveMulti', 'create', 'resize'].includes(drag?.kind) && drag.cur;
  const guideList = (objectGuides || imageGuides) ? drag.guides : !drag ? hoverGuides : null;
  if (guideList?.length) {
    const gx = imageGuides ? geo.origin.x : 0;
    const gy = imageGuides ? geo.origin.y : 0;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1 * px;
    ctx.strokeStyle = '#ff3b8d';
    for (const g of guideList) {
      ctx.beginPath();
      if (g.x != null) {
        ctx.moveTo(g.x + gx, 0);
        ctx.lineTo(g.x + gx, geo.height);
      } else {
        ctx.moveTo(0, g.y + gy);
        ctx.lineTo(geo.width, g.y + gy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  if (multi.length) {
    const picked = objs.filter((o) => multi.includes(o.id)).map(objectBounds);
    ctx.setLineDash([]);
    ctx.strokeStyle = accent;
    for (const b of picked) ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (picked.length) {
      const u = unionBounds(picked);
      const pad = 6 * px;
      ctx.setLineDash([4 * px, 3 * px]);
      ctx.strokeRect(u.x - pad, u.y - pad, u.w + 2 * pad, u.h + 2 * pad);
    }
  }
  // 拖动时隐藏截取框，只看拼接效果；松手后再显示
  if (hoverId != null && !drag) {
    const h = objs.find((o) => o.id === hoverId);
    if (h) {
      const b = objectBounds(h);
      const pad = 4 * px;
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = accent;
      ctx.strokeRect(b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad);
      ctx.globalAlpha = 1;
    }
  }
  const listRect = listHoverImage != null && !cropEdit && geo.rects.get(listHoverImage);
  if (listRect) {
    // 沿外框外沿描一圈，圆角跟外框一致
    const f = listRect.frame;
    // 合成一整张时，单张只是其中一段：沿这段内侧描直角框，不往外扩到相邻的图上
    const pad = geo.group ? -1.25 * px : 5 * px;
    const spec = listRect.spec ?? geo.frame;
    const inner = Math.min(state.style.radius * (listRect.k ?? 1), listRect.w / 2);
    const radius = geo.group ? 0 : (spec.radius ?? (inner > 0 ? inner + (spec.pad ?? 0) : 0)) + pad;
    ctx.setLineDash([]);
    ctx.lineWidth = 2.5 * px;
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.roundRect(f.x - pad, f.y - pad, f.w + 2 * pad, f.h + 2 * pad, radius);
    ctx.stroke();
    ctx.lineWidth = 1.5 * px;
  }
  if (cropEdit && !(drag?.kind === 'crop' && drag.moved)) drawCropOverlay(ctx, px);
  if (drag?.kind === 'marquee' && drag.rect) {
    const r = drag.rect;
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.08;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accent;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  // 选中的图片：描边加四角控制点；缩放时在拖动的角旁边显示比例
  if (tool === 'select' && imageSel != null && !cropEdit && !(drag?.kind === 'image' && drag.moved)) {
    const b = imageBox(imageSel);
    if (b) {
      ctx.setLineDash([]);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5 * px;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      for (const h of imageHandles(imageSel)) drawHandle(ctx, h.x, h.y, px);
    }
    if (drag?.kind === 'scale' && drag.moved) drawScaleLabel(ctx, drag, px);
  }

  const sel = selectedId != null && objs.find((o) => o.id === selectedId);
  if (sel) {
    const b = objectBounds(sel);
    const pad = 4 * px;
    ctx.setLineDash([]);
    ctx.strokeStyle = accent;
    ctx.strokeRect(b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad);
    const hs = 9 * px;
    for (const h of handlesOf(sel)) {
      ctx.beginPath();
      ctx.roundRect(h.x - hs / 2, h.y - hs / 2, hs, hs, 2.5 * px);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = 3 * px;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------- 缩放 ----------

function fitZoom() {
  view.fit = true;
  setShift(0, 0);
  if (!geo) return;
  view.zoom = fitZoomValue();
  applyZoom();
}

function fitZoomValue() {
  const vp = els.viewport;
  const cs = getComputedStyle(vp);
  const aw = vp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = vp.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  return Math.max(0.02, Math.min(aw / geo.width, ah / geo.height, 1));
}

// 滑块按对数刻度映射，小比例和大比例都好拖
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;
const zoomToSlider = (z) => (Math.log(z / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)) * 100;
const sliderToZoom = (t) => ZOOM_MIN * (ZOOM_MAX / ZOOM_MIN) ** (t / 100);

function applyZoom() {
  els.zoomLabel.firstChild.textContent = `${Math.round(view.zoom * 100)}%`;
  els.zoomCtl.classList.toggle('disabled', !geo);
  if (document.activeElement !== els.zoomSlider) {
    els.zoomSlider.value = zoomToSlider(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom)));
  }
  setFill(els.zoomSlider);
  els.zoomMenu.querySelectorAll('button').forEach((b) => {
    const z = b.dataset.zoom;
    b.setAttribute('aria-pressed', String(z === 'fit' ? view.fit : !view.fit && Math.abs(view.zoom - Number(z)) < 0.001));
  });
  if (!geo) return;
  els.wrap.style.width = `${geo.width * view.zoom}px`;
  els.wrap.style.height = `${geo.height * view.zoom}px`;
  if (editing) styleEditor();
  requestRender();
}

// 以 client 坐标处为中心缩放，鼠标下的内容保持不动
function zoomTo(z, client) {
  if (!geo) return;
  setShift(0, 0);
  const r0 = els.wrap.getBoundingClientRect();
  const vr = els.viewport.getBoundingClientRect();
  const at = client ?? { x: vr.left + vr.width / 2, y: vr.top + vr.height / 2 };
  const px = (at.x - r0.left) / view.zoom;
  const py = (at.y - r0.top) / view.zoom;
  view.zoom = Math.min(ZOOM_MAX, Math.max(0.02, z));
  view.fit = false;
  applyZoom();
  const r1 = els.wrap.getBoundingClientRect();
  els.viewport.scrollLeft += r1.left + px * view.zoom - at.x;
  els.viewport.scrollTop += r1.top + py * view.zoom - at.y;
}

// ---------- 文字编辑 ----------

function startTextEdit(target, point) {
  finishTextEdit(true);
  const obj = target ? toCanvasObject(geo, target) : newObject('text', point, point);
  editing = { id: target ? target.id : null, obj };
  clearSelection();
  els.editor.value = obj.text;
  els.editor.hidden = false;
  styleEditor();
  els.editor.focus();
  if (target) els.editor.select();
  renderProps();
  requestRender();
}

function styleEditor() {
  const o = editing.obj;
  const z = view.zoom;
  const L = textLayout({ ...o, text: els.editor.value || ' ' });
  Object.assign(els.editor.style, {
    left: `${o.x * z}px`,
    top: `${o.y * z}px`,
    width: `${(L.w + o.size) * z}px`,
    height: `${L.h * z}px`,
    font: fontOf(o, z),
    lineHeight: '1.3',
    textAlign: o.align ?? 'left',
    color: o.style === 'label' ? contrastColor(o.color) : o.color,
    background: o.style === 'label' ? o.color : 'transparent',
  });
}

function finishTextEdit(save) {
  if (!editing) return;
  const { id, obj } = editing;
  editing = null;
  els.editor.hidden = true;
  const text = els.editor.value.replace(/\s+$/, '');
  if (save && text) {
    const objs = id != null ? replaceObject(id, { ...obj, text }) : addObject({ ...obj, text });
    selectedId = objs[0].id;
    renderProps();
    requestRender();
  } else if (save && id != null) {
    commit((s) => { s.objects = s.objects.filter((o) => o.id !== id); });
  } else {
    renderProps();
    requestRender();
  }
}

// ---------- 画布交互 ----------

function clientPoint(e) {
  return { x: e.clientX / view.zoom, y: e.clientY / view.zoom };
}

function toCanvasPoint(e) {
  const r = els.canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / view.zoom, y: (e.clientY - r.top) / view.zoom };
}

// type：只命中这一类对象。用画图工具时只抓同类对象，其余照常在上面画，
// 否则箭头起点落在遮挡、高亮上就会变成拖动它们
function hitTest(p, loose, type) {
  const tol = 6 / view.zoom;
  for (let i = state.objects.length - 1; i >= 0; i--) {
    const o = state.objects[i];
    if (type && o.type !== type) continue;
    if (hitObject(toCanvasObject(geo, o), p, tol, loose)) return o;
  }
  return null;
}

function handleAt(p) {
  const sel = selectedId != null && findObject(selectedId);
  if (!sel) return null;
  const tol = 8 / view.zoom;
  const h = handlesOf(toCanvasObject(geo, sel)).find((h) => Math.hypot(h.x - p.x, h.y - p.y) <= tol);
  return h ? h.name : null;
}

els.canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  e.preventDefault();
  closeExport();
  if (editing) {
    finishTextEdit(true);
    return;
  }
  endLive();
  els.canvas.setPointerCapture(e.pointerId);
  const p = toCanvasPoint(e);

  // 按住空格或鼠标中键拖动：平移画面
  if (spaceDown || e.button === 1) {
    drag = { kind: 'pan', x: e.clientX, y: e.clientY, left: els.viewport.scrollLeft, top: els.viewport.scrollTop };
    els.canvas.style.cursor = 'grabbing';
    return;
  }

  if (cropEdit) {
    const zone = cropZoneAt(p);
    const r = cropRect();
    if (!zone || !r) {
      // 点到另一张图：换成裁剪那一张；点空白处：完成裁剪
      const other = anchorAt(geo, p);
      if (other != null && other !== cropEdit.id) {
        exitCropEdit(false);
        enterCropEdit(other);
      } else {
        exitCropEdit();
      }
      return;
    }
    const im = state.images.find((x) => x.id === cropEdit.id);
    // 画布在拖动中会平移，位移按屏幕坐标算，起点也记屏幕坐标（换算成画布单位）
    drag = { kind: 'crop', id: im.id, zone, start: clientPoint(e), orig: { ...im.crop }, s: r.s, size: { w: r.src.w, h: r.src.h }, ratio: cropRatioValue(r) };
    if (zone === 'move') els.canvas.style.cursor = 'grabbing';
    return;
  }

  if (tool === 'crop') {
    const id = anchorAt(geo, p);
    if (id != null) enterCropEdit(id);
    return;
  }

  const corner = tool === 'select' && imageHandleAt(p);
  if (corner) {
    startImageScale(imageSel, corner, e);
    return;
  }

  const handle = handleAt(p);
  if (handle) {
    drag = { kind: 'resize', id: selectedId, handle, orig: toCanvasObject(geo, findObject(selectedId)), cur: null };
    return;
  }

  const hit = tool === 'pen' ? null : hitTest(p, tool === 'select', tool === 'select' ? null : tool);
  if (hit) imageSel = null;
  if (hit && e.shiftKey) {
    // ⇧ 点击：加入或移出选择
    const ids = selectionIds();
    setSelection(ids.includes(hit.id) ? ids.filter((id) => id !== hit.id) : [...ids, hit.id]);
  } else if (hit && multi.includes(hit.id)) {
    const origs = new Map(multi.map((id) => [id, toCanvasObject(geo, findObject(id))]));
    drag = { kind: 'moveMulti', ids: multi.slice(), start: p, origs, bounds: unionBounds([...origs.values()].map(objectBounds)), cur: null };
  } else if (hit) {
    setSelection([hit.id]);
    // 文字工具下按住文字：拖动就移动，原地点一下才进入编辑
    drag = { kind: 'move', id: hit.id, start: p, orig: toCanvasObject(geo, hit), cur: null, editOnClick: tool === 'text' && hit.type === 'text' };
  } else {
    const base = e.shiftKey ? selectionIds() : [];
    setSelection(base);
    const imageId = tool === 'select' && !e.shiftKey ? anchorAt(geo, p) : null;
    imageSel = imageId;
    if (imageId != null) {
      // 按住图片拖动：移动这张图，位置由用户决定
      const im = state.images.find((x) => x.id === imageId);
      drag = { kind: 'image', id: imageId, start: clientPoint(e), orig: { x: im.offset?.x ?? 0, y: im.offset?.y ?? 0 }, moved: false, guides: [], ...imageSnapInfo(imageId) };
      holdView = true;
      holdCanvas();
    } else if (tool === 'select') {
      // 空白处拖动：框选；按住 ⇧ 在原有选择上追加
      drag = { kind: 'marquee', start: p, base, rect: null };
    } else if (tool === 'text') {
      startTextEdit(null, p);
    } else if (tool === 'number' || tool === 'magnifier' || tool === 'sticker') {
      const objs = addObject(newObject(tool, p, p));
      selectedId = objs[0].id;
    } else {
      const snap = SNAP_TOOLS.has(tool) && !e.altKey ? snapPoint(p) : { p, guides: [] };
      // 起点对齐的参考线整个拖动过程都保留，免得松开前看不出起点有没有对齐
      drag = { kind: 'create', start: snap.p, cur: newObject(tool, snap.p, snap.p), startGuides: snap.guides, guides: snap.guides };
      hoverGuides = [];
    }
  }
  renderProps();
  requestRender();
});

els.canvas.addEventListener('pointermove', (e) => {
  const p = toCanvasPoint(e);
  if (!drag) {
    updateCursor(p, e.altKey);
    return;
  }
  if (drag.kind === 'pan') {
    els.viewport.scrollLeft = drag.left - (e.clientX - drag.x);
    els.viewport.scrollTop = drag.top - (e.clientY - drag.y);
    return;
  }
  if (drag.kind === 'crop') {
    drag.moved = true;
    const screen = originOnScreen();
    const content = contentOrigin(drag.id);
    setCrop(drag.id, nextCrop(drag, clientPoint(e)));
    keepCropContent(drag.id, drag.zone, content);
    keepOrigin(screen);
    return;
  }
  if (drag.kind === 'image') {
    moveImage(drag, clientPoint(e), e.altKey);
    return;
  }
  if (drag.kind === 'scale') {
    scaleImage(drag, clientPoint(e), e.altKey);
    return;
  }
  if (drag.kind === 'marquee') {
    drag.rect = rectFromPoints(drag.start, p);
    const hits = state.objects.filter((o) => rectsOverlap(objectBounds(toCanvasObject(geo, o)), drag.rect)).map((o) => o.id);
    setSelection([...drag.base, ...hits]);
  } else if (drag.kind === 'move' || drag.kind === 'moveMulti') {
    // 手抖的几像素不算拖动，免得点一下就把对象挪了位
    if (!drag.cur && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) * view.zoom < 3) return;
    const ids = drag.kind === 'move' ? [drag.id] : drag.ids;
    const b0 = drag.kind === 'move' ? objectBounds(drag.orig) : drag.bounds;
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    const snap = e.altKey ? { dx: 0, dy: 0, guides: [] } : snapMove(b0, dx, dy, new Set(ids));
    drag.guides = snap.guides;
    if (drag.kind === 'move') drag.cur = moveObject(drag.orig, dx + snap.dx, dy + snap.dy);
    else drag.cur = new Map([...drag.origs].map(([id, o]) => [id, moveObject(o, dx + snap.dx, dy + snap.dy)]));
  } else if (drag.kind === 'resize') {
    const snap = e.altKey ? { p, guides: [] } : snapPoint(p, new Set([drag.id]));
    drag.guides = snap.guides;
    drag.cur = resizeObject(drag.orig, drag.handle, snap.p);
  } else if (drag.cur.type === 'pen') {
    drag.cur.points.push([p.x, p.y]);
  } else {
    // 按住 Shift：直线和箭头吸附到 45° 方向，框类保持正方形
    let q = p;
    if (e.shiftKey) {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (LINE_TYPES.has(tool)) {
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        q = { x: drag.start.x + Math.cos(angle) * len, y: drag.start.y + Math.sin(angle) * len };
      } else {
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        q = { x: drag.start.x + Math.sign(dx || 1) * side, y: drag.start.y + Math.sign(dy || 1) * side };
      }
    }
    drag.guides = drag.startGuides ?? [];
    if (!e.shiftKey && !e.altKey) {
      const snap = snapPoint(q);
      q = snap.p;
      drag.guides = [...drag.guides, ...snap.guides];
    }
    drag.cur = newObject(tool, drag.start, q);
  }
  requestRender();
});

els.canvas.addEventListener('pointerup', (e) => {
  const d = drag;
  drag = null;
  if (!d) return;
  if (d.kind === 'crop') {
    endLive();
    updateCursor(toCanvasPoint(e));
  } else if (d.kind === 'pan') {
    updateCursor(toCanvasPoint(e));
  } else if (d.kind === 'move' && d.editOnClick && !d.cur) {
    startTextEdit(findObject(d.id));
    return;
  } else if ((d.kind === 'move' || d.kind === 'resize') && d.cur) {
    const objs = replaceObject(d.id, d.cur);
    selectedId = objs.length === 1 ? objs[0].id : null;
    renderProps();
  } else if (d.kind === 'moveMulti' && d.cur) {
    setSelection(moveObjects(d.ids, 0, 0, d.cur));
    renderProps();
  } else if (d.kind === 'image' || d.kind === 'scale') {
    endLive();
    releaseCanvas();
    releaseView();
    if (d.kind === 'scale' && d.fitOff && d.moved) notify('已关闭统一宽度，每张图可以单独调整大小');
    updateCursor(toCanvasPoint(e));
    requestRender();
  } else if (d.kind === 'marquee') {
    renderProps();
  } else if (d.kind === 'create' && d.cur && isValidNew(d.cur)) {
    const objs = addObject(d.cur);
    // 遮挡画完不选中：否则接着切换模式会把刚画的纯色遮挡改成马赛克
    selectedId = d.cur.type === 'mask' ? null : objs[0].id;
    renderProps();
  }
  requestRender();
});

els.canvas.addEventListener('pointerleave', () => {
  if (hoverGuides.length) {
    hoverGuides = [];
    requestRender();
  }
  if (!drag) updateHover(null);
});

// 拖到一半被系统打断（切走窗口、触控被接管）：已经拖出的结果照常记入历史，画面恢复正常
els.canvas.addEventListener('pointercancel', () => {
  const d = drag;
  drag = null;
  if (d?.kind === 'crop' || d?.kind === 'image' || d?.kind === 'scale') endLive();
  if (d?.kind === 'image' || d?.kind === 'scale') {
    releaseCanvas();
    releaseView();
  }
  requestRender();
});

els.canvas.addEventListener('dblclick', (e) => {
  const p = toCanvasPoint(e);
  if (tool === 'select' && imageHandleAt(p)) {
    const id = imageSel;
    commit((s) => {
      unfreezeFit(s);
      s.images.find((x) => x.id === id).scale = 1;
    });
    notify('已恢复原始大小');
    return;
  }
  if (cropEdit && cropZoneAt(p)) return;
  const hit = !cropEdit && hitTest(p, true);
  if (hit?.type === 'text') {
    startTextEdit(hit);
    return;
  }
  // 双击图片空白处：在画布上调整这张图的截取范围
  if (!hit && (tool === 'select' || tool === 'crop' || cropEdit)) {
    const id = anchorAt(geo, p);
    if (id != null && id !== cropEdit?.id) enterCropEdit(id);
  }
});

function updateHover(p) {
  // 画图工具下只提示同类对象，和按下时能抓起的对象一致
  const hoverable = tool !== 'pen' && tool !== 'crop';
  const hit = p && !cropEdit && hoverable && !spaceDown ? hitTest(p, tool === 'select', tool === 'select' ? null : tool) : null;
  const img = p && !hit && tool === 'select' && !cropEdit ? anchorAt(geo, p) : null;
  const nextId = hit && hit.id !== selectedId && !multi.includes(hit.id) ? hit.id : null;
  if (nextId !== hoverId) {
    hoverId = nextId;
    requestRender();
  }
  if (img !== hoverImage) {
    hoverImage = img;
    updateStatus();
    // 左侧列表里对应的那一项也亮起来
    const index = state.images.findIndex((im) => im.id === img);
    els.list.querySelectorAll('li').forEach((li, i) => li.classList.toggle('linked', i === index));
  }
}

function updateCursor(p, alt = false) {
  updateHover(p);
  const guides = p && !alt && !cropEdit && !spaceDown && SNAP_TOOLS.has(tool) ? snapPoint(p).guides : [];
  if (JSON.stringify(guides) !== JSON.stringify(hoverGuides)) {
    hoverGuides = guides;
    requestRender();
  }
  const handle = handleAt(p);
  let cursor;
  if (spaceDown) {
    cursor = 'grab';
  } else if (cropEdit) {
    cursor = { t: 'ns-resize', b: 'ns-resize', l: 'ew-resize', r: 'ew-resize', tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', move: 'grab' }[cropZoneAt(p)] ?? 'default';
  } else if (tool === 'select' && imageHandleAt(p)) {
    cursor = /^(nw|se)$/.test(imageHandleAt(p)) ? 'nwse-resize' : 'nesw-resize';
  } else if (handle) {
    cursor = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' }[handle.replace(/^s(?=[ns][ew]$)/, '')] ?? 'move';
  } else if (tool !== 'pen' && hitTest(p, tool === 'select', tool === 'select' ? null : tool)) {
    cursor = 'move';
  } else {
    cursor = tool === 'select' || tool === 'crop' ? (anchorAt(geo, p) != null ? (tool === 'crop' ? 'pointer' : 'move') : 'default') : tool === 'text' ? 'text' : 'crosshair';
  }
  els.canvas.style.cursor = cursor;
}

function setTool(next) {
  finishTextEdit(true);
  if (cropEdit) exitCropEdit(false);
  imageSel = null;
  markTool(next);
  clearSelection();
  updateHover(null);
  // 只有一张图时，选裁剪工具直接进入裁剪
  if (next === 'crop' && state.images.length === 1) {
    enterCropEdit(state.images[0].id);
    return;
  }
  renderProps();
  requestRender();
}

function markTool(next) {
  tool = next;
  els.tools.querySelectorAll('.tool[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
}

// ---------- 属性栏 ----------

function propContext() {
  if (editing) return { type: 'text', obj: editing.obj, source: 'editing' };
  if (cropEdit) return { type: 'crop', obj: null, source: 'crop' };
  if (multi.length) return { type: 'multi', obj: null, source: 'multi' };
  const sel = selectedId != null && findObject(selectedId);
  if (sel) return { type: sel.type, obj: toCanvasObject(geo, sel), source: 'selected' };
  if (tool !== 'select') return { type: tool, obj: null, source: 'tool' };
  return null;
}

// 修改属性：同时更新该类对象的默认值；有选中或正在编辑的对象时一并修改它
function setProp(type, patch, applyDefault) {
  applyDefault(defaults[type]);
  savePrefs();
  if (editing) {
    Object.assign(editing.obj, patch);
    styleEditor();
    renderProps();
    requestRender();
  } else if (selectedId != null) {
    const id = selectedId;
    commit((s) => patchObject(s, id, patch));
  } else {
    renderProps();
  }
}

// 直接输入像素值（按 1× 导出尺寸计）；拖动左侧文字也能左右拖改数值。
// scale：显示值与存储值的比例，放大镜存半径、显示直径
function pxField(text, type, key, value, min, max, scale = 1) {
  const wrap = document.createElement('label');
  wrap.className = 'px-field';
  wrap.dataset.key = key;
  const name = document.createElement('span');
  name.className = 'px-name';
  name.textContent = text;
  name.title = '左右拖动调整';
  const input = document.createElement('input');
  Object.assign(input, { type: 'number', min, max, step: 1, value: Math.round(value * scale) });
  const unit = document.createElement('span');
  unit.className = 'px-unit';
  unit.textContent = 'px';
  wrap.append(name, input, unit);

  const apply = (v, done) => {
    const display = Math.round(Math.min(max, Math.max(min, v)));
    if (Number.isFinite(display)) {
      const stored = display / scale;
      defaults[type][key] = stored;
      savePrefs();
      if (editing) {
        editing.obj[key] = stored;
        styleEditor();
        requestRender();
      } else if (selectedId != null) {
        const id = selectedId;
        live((s) => patchObject(s, id, { [key]: stored }));
      }
    }
    if (done) {
      endLive();
      if (selectedId == null && !editing) renderProps();
    }
  };
  input.addEventListener('input', () => {
    if (input.value !== '') apply(Number(input.value), false);
  });
  input.addEventListener('change', () => {
    const v = Math.round(Math.min(max, Math.max(min, Number(input.value) || min)));
    input.value = v;
    apply(v, true);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });

  // 像 Figma 一样按住名称左右拖：每像素 1，按住 Shift 每像素 10
  name.addEventListener('pointerdown', (e) => {
    name.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const v0 = Number(input.value) || min;
    const move = (ev) => {
      const v = Math.round(Math.min(max, Math.max(min, v0 + (ev.clientX - x0) * (ev.shiftKey ? 10 : 1))));
      input.value = v;
      apply(v, false);
    };
    const up = () => {
      name.removeEventListener('pointermove', move);
      name.removeEventListener('pointerup', up);
      name.removeEventListener('pointercancel', up);
      apply(Number(input.value), true);
    };
    name.addEventListener('pointermove', move);
    name.addEventListener('pointerup', up);
    name.addEventListener('pointercancel', up);
  });
  return wrap;
}

function renderProps() {
  const bar = els.props;
  const pc = geo && propContext();
  bar.hidden = !pc;
  bar.replaceChildren();
  if (!pc) return;
  const { type, obj, source } = pc;
  if (type === 'multi') {
    renderMultiProps(bar);
    return;
  }
  if (type === 'crop') {
    if (cropEdit) renderCropProps(bar);
    else bar.append(labelText('裁剪'), vsep(), hintText(TOOL_HINTS.crop));
    return;
  }
  const d = defaults[type];
  const label = document.createElement('span');
  label.className = 'prop-label';
  label.textContent = source === 'selected' ? `${TYPE_NAMES[type]} · 已选中` : TYPE_NAMES[type];
  bar.append(label, vsep());

  if (type === 'spotlight') {
    bar.append(hintText(TOOL_HINTS.spotlight));
  } else if (type === 'magnifier') {
    bar.append(segmented([[1.5, '1.5×'], [2, '2×'], [3, '3×']], obj ? obj.zoom : d.zoom, (z) => {
      setProp('magnifier', { zoom: z }, (dd) => { dd.zoom = z; });
    }));
    bar.append(pxField('直径', 'magnifier', 'r', obj ? obj.r : d.r ?? 45 * geo.unit, 20, 2000, 2));
    bar.append(swatches(['#ffffff', '#111111', '#ef4444', '#5b5bf0'], obj ? obj.color : d.color, (c) => {
      setProp('magnifier', { color: c }, (dd) => { dd.color = c; });
    }));
  } else if (type === 'sticker') {
    const grid = document.createElement('div');
    grid.className = 'emojis';
    const cur = obj ? obj.char : d.char;
    for (const ch of EMOJIS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = ch;
      b.setAttribute('aria-pressed', String(ch === cur));
      b.addEventListener('click', () => setProp('sticker', { char: ch }, (dd) => { dd.char = ch; }));
      grid.append(b);
    }
    bar.append(grid, vsep());
    bar.append(pxField('大小', 'sticker', 'size', obj ? obj.size : d.size ?? FONT_LEVELS[d.level] * geo.unit * 2, 8, 1000));
  } else if (type === 'mask') {
    const mode = obj ? obj.mode : d.mode;
    bar.append(segmented([['solid', '纯色'], ['mosaic', '马赛克'], ['blur', '模糊']], mode, (m) => {
      const strength = m === 'solid' ? undefined : d.strength[m];
      setProp('mask', strength ? { mode: m, strength } : { mode: m }, (dd) => { dd.mode = m; });
    }));
    if (mode === 'solid') {
      bar.append(swatches(MASK_COLORS, obj ? obj.color : d.color, (c) => setProp('mask', { color: c }, (dd) => { dd.color = c; })));
    } else {
      bar.append(slider('强度', STRENGTH_MIN, 80, 2, Math.round(obj ? obj.strength : d.strength[mode]), (v, done) => {
        d.strength[mode] = v;
        savePrefs();
        if (selectedId == null) return;
        const id = selectedId;
        if (done) endLive();
        else live((s) => patchObject(s, id, { strength: v }));
      }));
    }
    bar.append(vsep(), hintText(MASK_HINTS[mode]));
  } else {
    bar.append(swatches(COLORS, obj ? obj.color : d.color, (c) => setProp(type, { color: c }, (dd) => { dd.color = c; })));
    if (STROKE_TYPES.has(type)) {
      bar.append(vsep(), pxField('粗细', type, 'width', obj ? obj.width : d.width ?? LINE_LEVELS[d.level ?? 1] * geo.unit, 1, 200));
    }
    if (type === 'text' || type === 'number') {
      bar.append(vsep(), pxField(type === 'text' ? '字号' : '大小', type, 'size', obj ? obj.size : d.size ?? FONT_LEVELS[d.level] * geo.unit, 6, 1000));
    }
    if (type === 'text') {
      const bold = obj ? obj.bold : d.bold;
      const style = obj ? obj.style : d.style;
      const font = obj ? obj.font ?? 'sans' : d.font;
      const align = obj ? obj.align ?? 'left' : d.align;
      bar.append(
        vsep(),
        fontSelect(font, (f) => setProp('text', { font: f }, (dd) => { dd.font = f; })),
        segmented([[true, '粗'], [false, '常规']], bold, (b) => setProp('text', { bold: b }, (dd) => { dd.bold = b; })),
        iconSegmented([['left', 'alignLeft', '左对齐'], ['center', 'alignCenter', '居中'], ['right', 'alignRight', '右对齐']], align, (al) => {
          setProp('text', { align: al }, (dd) => { dd.align = al; });
        }),
        segmented([['none', '纯文字'], ['outline', '描边'], ['shadow', '阴影'], ['label', '标签']], style, (st) => {
          setProp('text', { style: st }, (dd) => { dd.style = st; });
        }),
      );
    }
  }

  if (source === 'selected') {
    bar.append(
      vsep(),
      iconAction('duplicate', '复制一份 ⌘D', duplicateSelected),
      iconAction('bringFront', '置于顶层 ]', () => reorderSelected(1)),
      iconAction('trash', '删除 ⌫', deleteSelected),
    );
  } else if (source === 'editing') {
    bar.append(vsep(), hintText('⌘Enter 完成 · Esc 取消'));
  } else if (type === 'number') {
    bar.append(vsep(), hintText(`点击放置序号，下一个是 ${nextNumber()}`));
  } else if (TOOL_HINTS[type] && type !== 'spotlight' && type !== 'mask') {
    bar.append(vsep(), hintText(TOOL_HINTS[type]));
  }
}

// 多选：统一改颜色，一起复制、置顶、删除
function renderMultiProps(bar) {
  const objs = multi.map(findObject).filter(Boolean);
  const label = document.createElement('span');
  label.className = 'prop-label';
  label.textContent = `已选 ${objs.length} 个`;
  bar.append(label, vsep());
  const colored = objs.filter((o) => COLOR_TYPES.has(o.type));
  if (colored.length) {
    const same = colored.every((o) => o.color === colored[0].color) ? colored[0].color : '';
    bar.append(swatches(COLORS, same, recolorSelected), vsep());
  }
  bar.append(
    iconAction('duplicate', '复制一份 ⌘D', duplicateSelected),
    iconAction('bringFront', '置于顶层 ]', () => reorderSelected(1)),
    iconAction('trash', '删除 ⌫', deleteSelected),
    vsep(),
    hintText('拖动一起移动 · ⇧ 点击增减'),
  );
}

function vsep() {
  const s = document.createElement('span');
  s.className = 'vsep';
  return s;
}

function labelText(text) {
  const span = document.createElement('span');
  span.className = 'prop-label';
  span.textContent = text;
  return span;
}

function hintText(text) {
  const span = document.createElement('span');
  span.className = 'hint';
  span.textContent = text;
  return span;
}

function iconAction(name, tip, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn small';
  b.dataset.tip = tip;
  b.setAttribute('aria-label', tip);
  b.innerHTML = icon(name, 16);
  b.addEventListener('click', onClick);
  return b;
}

function segmented(options, current, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'seg compact';
  for (const [value, text] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => onPick(value));
    wrap.append(b);
  }
  return wrap;
}

const FONT_OPTIONS = [['sans', '默认'], ['rounded', '圆体'], ['serif', '宋体'], ['kai', '楷体'], ['mono', '等宽']];

function fontSelect(current, onPick) {
  const sel = document.createElement('select');
  sel.className = 'font-select';
  sel.setAttribute('aria-label', '字体');
  for (const [value, name] of FONT_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = name;
    opt.style.fontFamily = TEXT_FONTS[value];
    sel.append(opt);
  }
  sel.value = current;
  sel.style.fontFamily = TEXT_FONTS[current];
  sel.addEventListener('change', () => onPick(sel.value));
  return sel;
}

function iconSegmented(options, current, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'seg compact icon-seg';
  for (const [value, name, tip] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = icon(name, 15);
    b.dataset.tip = tip;
    b.setAttribute('aria-label', tip);
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => onPick(value));
    wrap.append(b);
  }
  return wrap;
}

function swatches(colors, current, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'swatches';
  const cur = current.toLowerCase();
  for (const c of colors) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    // auto：按背景明暗自动选黑白
    b.style.background = c === 'auto' ? 'linear-gradient(135deg, #ffffff 50%, #111111 50%)' : c;
    b.title = c === 'auto' ? '自动（按背景明暗）' : c;
    b.setAttribute('aria-label', c === 'auto' ? '自动颜色' : `颜色 ${c}`);
    b.setAttribute('aria-pressed', String(c.toLowerCase() === cur));
    b.addEventListener('click', () => onPick(c));
    wrap.append(b);
  }
  const picker = document.createElement('label');
  picker.className = 'color-picker';
  picker.title = '自定义颜色';
  const input = document.createElement('input');
  input.type = 'color';
  input.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#000000';
  input.addEventListener('change', () => onPick(input.value));
  picker.append(input);
  wrap.append(picker);
  return wrap;
}

function slider(text, min, max, step, value, onChange) {
  const label = document.createElement('label');
  label.className = 'prop-slider';
  const span = document.createElement('span');
  span.textContent = text;
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min, max, step, value });
  const out = document.createElement('output');
  out.textContent = value;
  setFill(input);
  input.addEventListener('input', () => {
    out.textContent = input.value;
    setFill(input);
    onChange(Number(input.value), false);
  });
  input.addEventListener('change', () => onChange(Number(input.value), true));
  label.append(span, input, out);
  return label;
}

// 点属性栏按钮时不让文字输入框失焦
els.props.addEventListener('mousedown', (e) => {
  if (!editing) return;
  if (e.target.closest('button, .px-name')) {
    e.preventDefault();
    return;
  }
  // 点数值框会让文字框失焦、完成编辑并重建属性栏，重建后把焦点还给同一个数值框
  if (e.target.closest('.font-select')) {
    setTimeout(() => {
      try {
        els.props.querySelector('.font-select')?.showPicker();
      } catch {
        // 不支持 showPicker 的浏览器再点一次即可
      }
    });
    return;
  }
  const field = e.target.closest('.px-field');
  if (field) {
    const key = field.dataset.key;
    setTimeout(() => els.props.querySelector(`.px-field[data-key="${key}"] input`)?.select());
  }
});

// ---------- 通用控件 ----------

function setFill(input) {
  const pct = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}

function setRange(input, output, value, text = value) {
  if (document.activeElement !== input) input.value = value;
  setFill(input);
  if (output) output.textContent = text;
}

function syncSeg(container, value) {
  container.querySelectorAll('button[data-value]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(value))));
}

function bindSeg(container, onPick) {
  container.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (b) onPick(b.dataset.value);
  });
}

// 滑块：拖动时实时预览，松手记一条历史
function bindRange(input, output, apply, format = (v) => v) {
  input.addEventListener('input', () => {
    setFill(input);
    if (output) output.textContent = format(Number(input.value));
    live((s) => apply(s, Number(input.value)));
  });
  input.addEventListener('change', endLive);
}

// undoable：在提示里放一个“撤销”按钮，删除、清空这类操作点错了一键找回
function notify(text, kind = 'info', undoable = false) {
  els.notice.replaceChildren(text);
  if (undoable) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = '撤销';
    b.addEventListener('click', () => {
      undo();
      els.notice.classList.remove('show');
    });
    els.notice.append(b);
  }
  els.notice.dataset.kind = kind;
  els.notice.classList.toggle('actionable', undoable);
  els.notice.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => els.notice.classList.remove('show'), kind === 'error' ? 5000 : undoable ? 5000 : 2600);
}

// ---------- 左侧：图片 ----------

function renderList() {
  const items = state.images.map((im, i) => {
    const src = sources.get(im.id);
    const oriented = orientedSource(src, im.rotate, im.flip);
    const open = cropEdit?.id === im.id;
    const li = document.createElement('li');
    li.className = `item${open ? ' editing' : ''}`;
    li.draggable = true;
    li.dataset.index = i;

    const row = document.createElement('div');
    row.className = 'item-row';
    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.innerHTML = icon('grip', 14);
    const thumb = document.createElement('img');
    thumb.src = src.url;
    thumb.alt = '';
    thumb.draggable = false;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = src.name;
    name.title = src.name;
    const dims = document.createElement('div');
    dims.className = 'dims';
    const c = im.crop;
    const edited = c.t || c.b || c.l || c.r || im.rotate || im.flip;
    dims.textContent = `${oriented.w - c.l - c.r} × ${oriented.h - c.t - c.b}${edited ? ' · 已编辑' : ''}`;
    meta.append(name, dims);
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(
      listAction('crop', '在画布上调整截取范围 · 旋转 · 翻转', 'edit', i, open),
      listAction('trash', '移除', 'remove', i),
    );
    row.append(grip, thumb, meta, actions);
    li.append(row);

    if (open) {
      const panel = document.createElement('div');
      panel.className = 'edit-panel';
      const crop = document.createElement('div');
      crop.className = 'crop-grid';
      for (const [side, text] of [['t', '裁上'], ['b', '裁下'], ['l', '裁左'], ['r', '裁右']]) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        Object.assign(input, { type: 'number', min: 0, step: 1, value: c[side] });
        input.dataset.index = i;
        input.dataset.side = side;
        label.append(text, input);
        crop.append(label);
      }
      const ops = document.createElement('div');
      ops.className = 'edit-ops';
      for (const [action, ico, text] of [['rotate', 'rotate', '旋转'], ['flip', 'flip', '翻转'], ['reset', 'reset', '还原']]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn';
        b.innerHTML = `${icon(ico, 14)}${text}`;
        b.dataset.action = action;
        b.dataset.index = i;
        ops.append(b);
      }
      panel.append(crop, ops);
      li.append(panel);
    }
    return li;
  });
  els.list.replaceChildren(...items);
  els.imageCount.textContent = state.images.length ? state.images.length : '';
  els.addZone.hidden = state.images.length > 0;
}

function listAction(name, tip, action, index, pressed) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn small';
  b.innerHTML = icon(name, 15);
  b.dataset.tip = tip;
  b.setAttribute('aria-label', tip);
  b.dataset.action = action;
  b.dataset.index = index;
  if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
  return b;
}

els.list.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const i = Number(btn.dataset.index);
  const id = state.images[i].id;
  const action = btn.dataset.action;
  switch (action) {
    case 'edit':
      if (cropEdit?.id === id) exitCropEdit();
      else enterCropEdit(id);
      break;
    case 'rotate':
    case 'flip':
    case 'reset':
      // 旋转翻转会改变图片坐标系，已有遮挡会错位，宁可拦住也不能让遮挡偏离敏感内容
      if (action !== 'reset' && state.objects.some((o) => o.anchor === id)) {
        notify('这张图上已有标注或遮挡，请先旋转或翻转，再标注', 'error');
        break;
      }
      commit((s) => {
        const im = s.images[i];
        if (action === 'rotate') im.rotate = (im.rotate + 90) % 360;
        else if (action === 'flip') im.flip = !im.flip;
        if (action === 'reset' && state.objects.every((o) => o.anchor !== id)) {
          im.rotate = 0;
          im.flip = false;
        }
        im.crop = { t: 0, r: 0, b: 0, l: 0 };
      });
      break;
    case 'remove': {
      const lost = state.objects.filter((o) => o.anchor === id).length;
      commit((s) => {
        s.images.splice(i, 1);
        s.objects = s.objects.filter((o) => o.anchor !== id);
        if (s.style.bgImage === id) s.style.bgImage = null;
      });
      notify(`已移除“${sources.get(id).name}”${lost ? `和上面的 ${lost} 个标注` : ''}`, 'info', true);
      break;
    }
  }
});

els.list.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-side]');
  if (!input) return;
  const i = Number(input.dataset.index);
  const side = input.dataset.side;
  const im = state.images[i];
  const src = orientedSource(sources.get(im.id), im.rotate, im.flip);
  commit((s) => {
    const c = s.images[i].crop;
    const opposite = { t: 'b', b: 't', l: 'r', r: 'l' }[side];
    const total = side === 't' || side === 'b' ? src.h : src.w;
    // 至少保留 10px，避免裁没
    c[side] = Math.max(0, Math.min(Math.round(Number(input.value) || 0), total - c[opposite] - 10));
  });
});

els.list.addEventListener('pointerover', (e) => {
  const li = e.target.closest('li[data-index]');
  const id = li ? state.images[Number(li.dataset.index)]?.id ?? null : null;
  if (id !== listHoverImage) {
    listHoverImage = id;
    requestRender();
  }
});
els.list.addEventListener('pointerleave', () => {
  listHoverImage = null;
  requestRender();
});

els.list.addEventListener('dragstart', (e) => {
  const li = e.target.closest('li[data-index]');
  if (!li || e.target.closest('input')) return;
  dragIndex = Number(li.dataset.index);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragIndex));
  li.classList.add('dragging-item');
});
els.list.addEventListener('dragover', (e) => {
  if (dragIndex == null) return;
  e.preventDefault();
  e.stopPropagation();
  els.list.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
  e.target.closest('li[data-index]')?.classList.add('drop-target');
});
els.list.addEventListener('drop', (e) => {
  if (dragIndex == null) return;
  e.preventDefault();
  e.stopPropagation();
  const li = e.target.closest('li[data-index]');
  const from = dragIndex;
  dragIndex = null;
  const to = li ? Number(li.dataset.index) : from;
  if (to === from) {
    renderList();
    return;
  }
  commit((s) => {
    const [moved] = s.images.splice(from, 1);
    s.images.splice(to, 0, moved);
  });
});
els.list.addEventListener('dragend', () => {
  dragIndex = null;
  els.list.querySelectorAll('.dragging-item, .drop-target').forEach((el) => el.classList.remove('dragging-item', 'drop-target'));
});

// ---------- 右侧：模板 ----------

function styleToPx(style, unit) {
  const out = { ...style, frame: normalizeFrame(style.frame) };
  out.padding = Math.round(((style.padding ?? 0) * unit) / 4) * 4;
  out.border = Math.round((style.border ?? 7) * unit / 2) * 2;
  out.radius = Math.round((style.radius ?? 0) * unit);
  out.shadow = Math.round((style.shadow ?? 0) * unit);
  return out;
}

function styleToUnits(style, unit) {
  const out = {};
  for (const k of STYLE_KEYS) out[k] = style[k];
  out.padding = +(style.padding / unit).toFixed(1);
  out.border = +((style.border ?? 0) / unit).toFixed(1);
  out.radius = +(style.radius / unit).toFixed(1);
  out.shadow = +(style.shadow / unit).toFixed(1);
  return out;
}

function allPresets() {
  return [...PRESETS, ...prefs.userPresets.map((p) => ({ ...p, user: true }))];
}

// 第一个是“无”，其余是真正的模板；返回当前套用中的模板，没有则为 null
function activePreset() {
  if (!geo) return null;
  return allPresets().find((p) => !p.none && presetMatches(p)) ?? null;
}

// 从“自己的外观”切到模板前记下来，取消模板时还原
let templateBase = null;
function rememberTemplateBase() {
  if (!activePreset()) templateBase = structuredClone(state.style);
}

function applyPreset(preset) {
  if (preset.none || activePreset() === preset) {
    clearTemplate();
    return;
  }
  rememberTemplateBase();
  commit((s) => {
    Object.assign(s.style, styleToPx(preset.style, currentUnit()));
    if (s.style.bg === 'image' && s.style.bgImage == null) s.style.bg = 'mesh';
  });
}

function clearTemplate() {
  if (!activePreset()) return;
  const base = templateBase;
  templateBase = null;
  commit((s) => {
    if (base) Object.assign(s.style, base, { bgImage: s.style.bgImage, title: s.style.title });
    else Object.assign(s.style, styleToPx(PRESETS[0].style, currentUnit()));
  });
  notify('已取消模板，外观已还原', 'info', true);
}

// 当前样式和预设的外观字段一致时，高亮对应缩略图
function presetMatches(preset) {
  const st = state.style;
  const p = { ...preset.style, frame: normalizeFrame(preset.style.frame) };
  return ['frame', 'bg', 'noise', 'pattern'].every((k) => (p[k] ?? st[k]) === st[k])
    && (p.bg !== 'mesh' || p.mesh === st.mesh)
    && (p.bg !== 'gradient' || p.gradient === st.gradient)
    && (p.bg !== 'solid' || p.color === st.color)
    && Math.abs(styleToPx(p, currentUnit()).padding - st.padding) <= 4;
}

function renderGallery() {
  const tiles = allPresets().map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'style-tile';
    b.dataset.index = i;
    const cv = document.createElement('canvas');
    cv.width = 240;
    cv.height = 180;
    const name = document.createElement('span');
    name.textContent = p.name;
    b.append(cv, name);
    b.addEventListener('click', () => applyPreset(p));
    if (p.user) {
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        prefs.userPresets = prefs.userPresets.filter((u) => u !== prefs.userPresets[i - PRESETS.length]);
        savePrefs();
        previewKey = '';
        renderGallery();
        notify(`已删除“${p.name}”`);
      });
    }
    return b;
  });
  els.gallery.replaceChildren(...tiles);
  syncGallery();
  schedulePreviews(true);
}

function syncGallery() {
  const presets = allPresets();
  const active = activePreset();
  els.gallery.querySelectorAll('.style-tile').forEach((t) => {
    const p = presets[Number(t.dataset.index)];
    const pressed = Boolean(geo) && (p.none ? !active : p === active);
    t.setAttribute('aria-pressed', String(pressed));
    t.title = p.user ? '右键删除' : pressed && !p.none ? '再点一次取消模板' : '';
  });
}

// 缩略图用缩小后的图片渲染，切换模板前就能看到自己的图套上效果
function schedulePreviews(force) {
  const key = JSON.stringify([state.images, state.layout, state.style.ratio, state.style.title, state.style.bgImage, prefs.userPresets.length]);
  if (!force && key === previewKey) return;
  previewKey = key;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreviews, 60);
}

function renderPreviews() {
  const presets = allPresets();
  const canvases = els.gallery.querySelectorAll('.style-tile canvas');
  if (!state.images.length) {
    canvases.forEach((cv, i) => drawPlaceholderTile(cv, presets[i]));
    return;
  }
  const thumbs = new Map();
  const images = state.images.map((im) => {
    const t = sources.get(im.id).thumb;
    thumbs.set(im.id, t);
    const k = t.k;
    return { ...im, offset: null, crop: { t: Math.round(im.crop.t * k), r: Math.round(im.crop.r * k), b: Math.round(im.crop.b * k), l: Math.round(im.crop.l * k) } };
  });
  const bgImage = bgImageSource()?.thumb;
  canvases.forEach((cv, i) => {
    const preset = presets[i];
    const plain = isPlain(preset);
    // 缩略图固定 4:3，背景自然铺满两侧，外框和背景都完整可见
    const style = { ...state.style, ...preset.style, padding: 0, radius: 0, shadow: 0, ratio: plain ? 'auto' : '4:3' };
    const s = { images, layout: { ...state.layout }, style };
    const g0 = computeGeometry(s, thumbs);
    const u = g0.unit;
    s.layout.gap = Math.round((state.layout.gap / currentUnit()) * u);
    Object.assign(style, styleToPx(preset.style, u));
    if (style.bg === 'image' && !bgImage) style.bg = 'mesh';
    const g = computeGeometry(s, thumbs);
    drawTile(cv, buildBase(g, style, { bgImage }), plain);
  });
}

function isPlain(preset) {
  return preset.style.bg === 'none' || (preset.style.bg === 'solid' && !preset.style.padding);
}

function drawTile(cv, img, inset) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  // 无背景的模板在缩略图里留白，其余铺满
  const pad = inset ? 18 : 0;
  const scale = inset
    ? Math.min((cv.width - pad * 2) / img.width, (cv.height - pad * 2) / img.height)
    : Math.max(cv.width / img.width, cv.height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
}

// 还没有图片时，用一张示意卡片展示每个模板
function drawPlaceholderTile(cv, preset) {
  const placeholder = getPlaceholderSource();
  const plain = isPlain(preset);
  const style = { ...state.style, ...styleToPx(preset.style, 0.4), title: '', ratio: plain ? 'auto' : '4:3' };
  if (style.bg === 'blur' || style.bg === 'image') style.bg = 'mesh';
  const s = { images: [{ id: 0, crop: { t: 0, r: 0, b: 0, l: 0 }, rotate: 0, flip: false }], layout: { mode: 'vertical', columns: 2, fit: 'min', gap: 0 }, style };
  const g = computeGeometry(s, new Map([[0, placeholder]]));
  drawTile(cv, buildBase(g, style, {}), plain);
}

let placeholderSource = null;
function getPlaceholderSource() {
  if (placeholderSource) return placeholderSource;
  const c = document.createElement('canvas');
  c.width = 120;
  c.height = 200;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 120, 200);
  x.fillStyle = '#e4e4ea';
  x.fillRect(12, 26, 60, 9);
  for (let i = 0; i < 6; i++) {
    x.fillStyle = i === 0 ? '#c7c7f7' : '#f0f0f4';
    x.beginPath();
    x.roundRect(12, 48 + i * 24, 96, 18, 4);
    x.fill();
  }
  placeholderSource = { img: c, w: 120, h: 200 };
  return placeholderSource;
}

els.shuffle.addEventListener('click', shuffleStyle);
function shuffleStyle() {
  if (!geo) return;
  const portrait = [...geo.rects.values()].every((r) => r.h > r.w * 1.4);
  const frames = ['none', 'none', 'glass', 'white', 'mac-light', 'mac-dark', 'browser-light'];
  if (portrait) frames.push('iphone', 'iphone');
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const useMesh = Math.random() < 0.65;
  rememberTemplateBase();
  commit((s) => {
    s.style.frame = pick(frames);
    s.style.bg = useMesh ? 'mesh' : 'gradient';
    if (useMesh) s.style.mesh = Math.floor(Math.random() * MESHES.length);
    else s.style.gradient = Math.floor(Math.random() * GRADIENTS.length);
    s.style.noise = Math.random() < 0.6;
    s.style.pattern = 'none';
    const u = currentUnit();
    s.style.padding = Math.round((32 + Math.random() * 16) * u / 4) * 4;
    s.style.shadow = Math.round((14 + Math.random() * 14) * u);
    if (s.style.frame === 'none' || s.style.frame === 'glass' || s.style.frame === 'white') s.style.radius = Math.round(4 * u);
  });
}

els.saveStyle.addEventListener('click', () => {
  if (!geo) {
    notify('先添加图片，调好外观后再保存', 'error');
    return;
  }
  const n = prefs.userPresets.length + 1;
  prefs.userPresets.push({ name: `我的模板 ${n}`, style: styleToUnits(state.style, currentUnit()) });
  savePrefs();
  renderGallery();
  notify(`已保存为“我的模板 ${n}”，右键可删除`);
});

// ---------- 右侧：外框 ----------

function frameSvg(kind) {
  const family = frameFamily(kind);
  if (family === 'iphone') {
    const [light, mid, dark] = IPHONE_COLORS.iphone;
    return `<svg viewBox="0 0 34 30"><defs><linearGradient id="fg-${kind}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".5" stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs><rect x="10" y="1" width="14" height="28" rx="4" fill="url(#fg-${kind})"/><rect x="11.2" y="2.2" width="11.6" height="25.6" rx="3" fill="#0b0b0d"/><rect x="11.8" y="2.8" width="10.4" height="24.4" rx="2.6" fill="#9aa3ff" opacity=".55"/><rect x="15" y="3.6" width="4" height="1.4" rx=".7" fill="#000"/></svg>`;
  }
  if (family === 'mac' || family === 'browser') {
    const dark = kind.endsWith('dark');
    const bar = dark ? '#3a3a3d' : '#ededef';
    const body = dark ? '#1f1f22' : '#ffffff';
    const addr = family === 'browser' ? `<rect x="13" y="5.4" width="14" height="3.2" rx="1.6" fill="${dark ? '#1b1b1d' : '#fff'}"/>` : '';
    return `<svg viewBox="0 0 34 30"><rect x="2" y="4" width="30" height="22" rx="3" fill="${body}" stroke="rgba(0,0,0,.18)" stroke-width=".6"/><path d="M2 7a3 3 0 013-3h24a3 3 0 013 3v3H2z" fill="${bar}"/><circle cx="5.6" cy="7" r="1.1" fill="#ff5f57"/><circle cx="8.8" cy="7" r="1.1" fill="#febc2e"/><circle cx="12" cy="7" r="1.1" fill="#28c840"/>${addr}<rect x="6" y="13.5" width="14" height="2" rx="1" fill="${dark ? '#3a3a3e' : '#e4e4ea'}"/><rect x="6" y="18" width="20" height="2" rx="1" fill="${dark ? '#2e2e32' : '#efeff3'}"/></svg>`;
  }
  if (family === 'glass') {
    return '<svg viewBox="0 0 34 30"><rect x="3" y="3" width="28" height="24" rx="5" fill="#c4b5fd" opacity=".45" stroke="#fff" stroke-width=".8"/><rect x="6.5" y="6.5" width="21" height="17" rx="2.5" fill="#fff"/></svg>';
  }
  if (family === 'black') {
    return '<svg viewBox="0 0 34 30"><rect x="3" y="3" width="28" height="24" rx="3" fill="#1c1c1f" stroke="rgba(255,255,255,.14)" stroke-width=".6"/><rect x="6" y="6" width="22" height="18" rx="1.5" fill="#a5b4fc"/></svg>';
  }
  if (family === 'white') {
    return '<svg viewBox="0 0 34 30"><rect x="3" y="3" width="28" height="24" rx="3" fill="#fff" stroke="rgba(0,0,0,.12)" stroke-width=".6"/><rect x="6" y="6" width="22" height="18" rx="1.5" fill="#a5b4fc"/></svg>';
  }
  return '<svg viewBox="0 0 34 30"><rect x="5" y="5" width="24" height="20" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2.5 2"/></svg>';
}

function renderFrames() {
  const tiles = FRAMES.map(([id, name]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'frame-tile';
    b.dataset.value = id;
    b.innerHTML = `${frameSvg(id)}<span>${name}</span>`;
    return b;
  });
  els.frames.replaceChildren(...tiles);
}

bindSeg(els.frames, (value) => {
  if (value === state.style.frame) return;
  commit((s) => {
    s.style.frame = value;
    if (value !== 'none') ensurePadding(s);
    if (!s.style.border) s.style.border = Math.round((7 * currentUnit()) / 2) * 2;
  });
});

els.windowTitle.addEventListener('input', () => live((s) => { s.style.title = els.windowTitle.value; }));
els.windowTitle.addEventListener('change', endLive);

// 外边距为 0 时背景和外框都看不出效果，自动留一圈边
function ensurePadding(s) {
  if (s.style.padding === 0) s.style.padding = Math.round((32 * currentUnit()) / 4) * 4;
  if (s.style.shadow === 0) s.style.shadow = Math.round(16 * currentUnit());
}

// ---------- 右侧：背景 ----------

function meshCss(m) {
  const layers = m.blobs.map(([x, y, r, c, a = 1]) => `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${a < 1 ? rgba(c, a) : c} 0, transparent ${Math.round(r * 90)}%)`);
  if (m.glow) {
    const [x, y, r, c, a] = m.glow;
    layers.unshift(`radial-gradient(circle at ${x * 100}% ${y * 100}%, ${rgba(c, Math.min(1, a * 2))} 0, transparent ${Math.round(r * 100)}%)`);
  }
  return `${layers.join(', ')}, ${m.base}`;
}

function renderBgOptions() {
  const st = state.style;
  const box = els.bgOptions;
  box.replaceChildren();
  const swatch = (css, pressed, title, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bg-swatch';
    b.style.background = css;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', onClick);
    box.append(b);
  };
  const note = (text) => {
    const p = document.createElement('p');
    p.className = 'bg-note';
    p.textContent = text;
    box.append(p);
  };
  if (st.bg === 'mesh') {
    MESHES.forEach((m, i) => swatch(meshCss(m), st.mesh === i, m.name, () => commit((s) => { s.style.mesh = i; })));
  } else if (st.bg === 'gradient') {
    GRADIENTS.forEach((g, i) => swatch(`linear-gradient(135deg, ${g.colors[0]}, ${g.colors[1]})`, st.gradient === i, g.name, () => commit((s) => { s.style.gradient = i; })));
  } else if (st.bg === 'solid') {
    BG_COLORS.forEach((c) => swatch(c, st.color.toLowerCase() === c, c, () => commit((s) => { s.style.color = c; })));
    const picker = document.createElement('label');
    picker.className = 'bg-swatch picker';
    picker.title = '自定义颜色';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = st.color;
    input.addEventListener('input', () => live((s) => { s.style.color = input.value; }));
    input.addEventListener('change', endLive);
    picker.append(input);
    box.append(picker);
  } else if (st.bg === 'image') {
    const src = bgImageSource();
    if (src) {
      const prev = document.createElement('div');
      prev.className = 'bg-image-preview';
      prev.style.backgroundImage = `url("${src.url}")`;
      box.append(prev);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn block bg-upload';
    b.innerHTML = `${icon('image', 16)}${src ? '更换背景图' : '选择背景图'}`;
    b.addEventListener('click', () => els.bgFile.click());
    box.append(b);
  } else if (st.bg === 'blur') {
    note('用第一张图片放大模糊后作为背景，颜色与内容天然协调。');
  } else {
    note('背景透明，下载 PNG 或 WebP 时保留透明；JPEG 会垫白底。');
  }
}

bindSeg(els.bgSeg, (value) => {
  if (value === state.style.bg) return;
  if (value === 'image' && state.style.bgImage == null) {
    els.bgFile.click();
    return;
  }
  commit((s) => {
    s.style.bg = value;
    ensurePadding(s);
  });
});

els.shadowBgOn.addEventListener('click', () => {
  els.bgEnabled.checked = true;
  els.bgEnabled.dispatchEvent(new Event('change'));
});

// 关闭时记住原来的背景，再打开直接恢复
els.bgEnabled.addEventListener('change', () => commit((s) => {
  if (els.bgEnabled.checked) {
    els.bgSection.open = true;
    const last = s.style.bgLast ?? 'mesh';
    s.style.bg = last === 'image' && s.style.bgImage == null ? 'mesh' : last;
    ensurePadding(s);
  } else {
    s.style.bgLast = s.style.bg;
    s.style.bg = 'none';
  }
}));

els.bgFile.addEventListener('change', async () => {
  const file = els.bgFile.files[0];
  els.bgFile.value = '';
  if (!file) return;
  try {
    const src = await loadImage(file);
    const id = nextImageId++;
    sources.set(id, src);
    commit((s) => {
      s.style.bg = 'image';
      s.style.bgImage = id;
      ensurePadding(s);
    });
  } catch {
    notify('这张图片无法读取', 'error');
  }
});

els.noise.addEventListener('change', () => commit((s) => { s.style.noise = els.noise.checked; }));

// ---------- 右侧：画布与水印 ----------

bindSeg(els.ratioChips, (value) => commit((s) => { s.style.ratio = value; }));
els.fitCanvas.addEventListener('click', () => {
  commit((s) => { delete s.canvasLock; });
  recenterView();
  notify('画布已贴合内容', 'info', true);
});
bindRange(els.padding, els.paddingOut, (s, v) => { s.style.padding = v; });
bindRange(els.border, els.borderOut, (s, v) => { s.style.border = v; });
bindRange(els.radius, els.radiusOut, (s, v) => { s.style.radius = v; }, (v) => (v ? v : '直角'));
bindRange(els.shadow, els.shadowOut, (s, v) => { s.style.shadow = v; });
// 图案方块：缩略图用当前背景色和深浅实时画，选之前就能看到效果
els.patternSeg.replaceChildren(...PATTERNS.map(([value, name]) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pattern-tile';
  b.dataset.value = value;
  b.dataset.tip = name;
  b.setAttribute('aria-label', name);
  const cv = document.createElement('canvas');
  cv.width = 96;
  cv.height = 96;
  b.append(cv);
  return b;
}));
let patternPreviewKey = '';

function renderPatternPreviews() {
  const st = state.style;
  const tone = st.bg === 'solid' || st.bg === 'gradient' || st.bg === 'mesh' ? backgroundTone(st) : '#ececf0';
  const key = `${tone}|${st.patternStrength}`;
  if (key === patternPreviewKey) return;
  patternPreviewKey = key;
  els.patternSeg.querySelectorAll('.pattern-tile').forEach((b) => {
    const cv = b.querySelector('canvas');
    const ctx = cv.getContext('2d');
    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (b.dataset.value !== 'none') drawPattern(ctx, cv.width, cv.height, b.dataset.value, tone, 1.1, st.patternStrength);
  });
}

bindSeg(els.patternSeg, (value) => commit((s) => {
  s.style.pattern = value;
  if (value !== 'none') ensurePadding(s);
}));
bindRange(els.patternStrength, els.patternStrengthOut, (s, v) => { s.style.patternStrength = v; });

// 右栏每块都能折叠，展开状态记在偏好里，下次打开沿用
function applySections() {
  for (const sec of els.rightSections) if (typeof prefs.sections[sec.id] === 'boolean') sec.open = prefs.sections[sec.id];
}
for (const sec of els.rightSections) {
  sec.addEventListener('toggle', () => {
    prefs.sections[sec.id] = sec.open;
    savePrefs();
  });
}

els.wmEnabled.addEventListener('click', (e) => e.stopPropagation());
els.wmEnabled.addEventListener('change', () => {
  if (els.wmEnabled.checked) els.wmSection.open = true;
  commit((s) => { s.watermark.enabled = els.wmEnabled.checked; });
});
els.wmText.addEventListener('input', () => live((s) => {
  s.watermark.text = els.wmText.value;
  // 输入了文字就自动启用，免得找不到开关
  if (s.watermark.text.trim()) s.watermark.enabled = true;
  els.wmEnabled.checked = s.watermark.enabled;
}));
els.wmText.addEventListener('change', endLive);
bindSeg(els.wmPosition, (value) => commit((s) => {
  s.watermark.position = value;
  if (s.watermark.text.trim()) s.watermark.enabled = true;
}));
bindRange(els.wmDensity, els.wmDensityOut, (s, v) => { s.watermark.density = v; });
bindRange(els.wmAngle, els.wmAngleOut, (s, v) => { s.watermark.angle = v; }, (v) => `${v}°`);
bindRange(els.wmSize, els.wmSizeOut, (s, v) => { s.watermark.size = v; });
bindRange(els.wmOpacity, els.wmOpacityOut, (s, v) => { s.watermark.opacity = v / 100; }, (v) => `${v}%`);

// ---------- 左侧：布局 ----------

// 换排列方式后，原来拖出来的位置没有意义了，一并清掉
const clearOffsets = (s) => s.images.forEach((im) => delete im.offset);
bindSeg(els.layoutSeg, (value) => {
  if (value !== state.layout.mode) {
    commit((s) => { s.layout.mode = value; clearOffsets(s); });
    recenterView();
  }
});
bindSeg(els.columnsSeg, (value) => {
  commit((s) => { s.layout.columns = Number(value); clearOffsets(s); });
  recenterView();
});
// 点对齐方式：所有图按它重新排齐，手动拖过的位置还原；再点一次当前的方式也会重新排齐
bindSeg(els.alignSeg, (value) => {
  const moved = state.images.some((im) => im.offset);
  if (value === (state.layout.align ?? 'start') && !moved) return;
  commit((s) => { s.layout.align = value; clearOffsets(s); });
  recenterView();
  if (moved) notify('已重新对齐，手动拖动的位置已还原', 'info', true);
});
// 切回“关”时每张图回到原始像素尺寸，和以前一样；手动缩放会自动切到“关”并保留缩放后的大小
bindSeg(els.fitSeg, (value) => {
  if (value === state.layout.fit) return;
  commit((s) => {
    s.layout.fit = value;
    for (const im of s.images) delete im.scale;
  });
});
bindRange(els.gap, els.gapOut, (s, v) => { s.layout.gap = v; });

// ---------- 面板同步 ----------

function syncPanels() {
  const { layout, style, watermark: wm } = state;
  const hasImages = state.images.length > 0;
  const vertical = layout.mode !== 'horizontal';

  syncSeg(els.layoutSeg, layout.mode);
  els.columnsRow.hidden = layout.mode !== 'grid';
  // 只有一张图时，统一尺寸和对齐都没有意义
  els.fitRow.hidden = state.images.length < 2;
  els.alignRow.hidden = state.images.length < 2;
  syncSeg(els.columnsSeg, layout.columns);
  els.fitLabel.textContent = vertical ? '统一宽度' : '统一高度';
  const [, fitMin, fitMax] = els.fitSeg.querySelectorAll('button');
  fitMin.textContent = vertical ? '按最窄' : '按最矮';
  fitMax.textContent = vertical ? '按最宽' : '按最高';
  syncSeg(els.fitSeg, layout.fit);
  const alignNames = layout.mode === 'horizontal' ? ['顶部', '居中', '底部'] : layout.mode === 'vertical' ? ['靠左', '居中', '靠右'] : ['左上', '居中', '右下'];
  els.alignSeg.querySelectorAll('button').forEach((b, i) => { b.textContent = alignNames[i]; });
  syncSeg(els.alignSeg, layout.align ?? 'start');
  setRange(els.gap, els.gapOut, layout.gap);
  // 拼接后按钮变成“取消拼接”
  const stitched = Boolean(state.stitch);
  els.stitch.disabled = !stitched && state.images.length < 2;
  if (els.stitch.dataset.stitched !== String(stitched)) {
    els.stitch.dataset.stitched = String(stitched);
    els.stitch.innerHTML = stitched ? `${icon('reset', 16)}取消拼接` : `${icon('wand', 16)}长截图拼接`;
  }
  els.resetCrops.disabled = !state.images.some((im) => im.crop.t || im.crop.b || im.crop.l || im.crop.r);

  syncGallery();
  syncSeg(els.frames, style.frame);
  const family = frameFamily(style.frame);
  els.titleRow.hidden = family !== 'mac' && family !== 'browser';
  els.titleLabel.textContent = family === 'browser' ? '网址' : '窗口标题';
  els.windowTitle.placeholder = family === 'browser' ? 'x.com' : '可留空';
  if (document.activeElement !== els.windowTitle) els.windowTitle.value = style.title;

  const bgOn = style.bg !== 'none';
  els.bgEnabled.checked = bgOn;
  els.bgBody.hidden = !bgOn;
  els.bgOffNote.hidden = bgOn;
  syncSeg(els.bgSeg, style.bg);
  if (bgOn) renderBgOptions();
  els.noise.checked = style.noise;

  syncSeg(els.ratioChips, style.ratio);
  setRange(els.padding, els.paddingOut, style.padding);
  els.radiusRow.hidden = family === 'iphone' || family === 'mac' || family === 'browser';
  setRange(els.radius, els.radiusOut, style.radius, style.radius || '直角');
  els.borderRow.hidden = family !== 'glass' && family !== 'white' && family !== 'black';
  setRange(els.border, els.borderOut, style.border || frameSpec(style.frame, 300 * currentUnit()).t);
  setRange(els.shadow, els.shadowOut, style.shadow);
  els.shadowRow.classList.toggle('disabled', !bgOn);
  els.shadow.disabled = !bgOn;
  els.shadowNote.hidden = bgOn;
  syncSeg(els.patternSeg, style.pattern);
  setRange(els.patternStrength, els.patternStrengthOut, style.patternStrength ?? 50);
  els.patternStrengthRow.hidden = style.pattern === 'none';
  renderPatternPreviews();

  els.wmEnabled.checked = wm.enabled;
  if (document.activeElement !== els.wmText) els.wmText.value = wm.text;
  syncSeg(els.wmPosition, wm.position);
  els.wmTileFields.hidden = wm.position !== 'tile';
  setRange(els.wmDensity, els.wmDensityOut, wm.density);
  setRange(els.wmAngle, els.wmAngleOut, wm.angle, `${wm.angle}°`);
  setRange(els.wmSize, els.wmSizeOut, wm.size);
  setRange(els.wmOpacity, els.wmOpacityOut, Math.round(wm.opacity * 100), `${Math.round(wm.opacity * 100)}%`);
  els.wmColors.replaceChildren(swatches(WM_COLORS, wm.color, (c) => commit((s) => { s.watermark.color = c; })));

  els.undo.disabled = !undoStack.length;
  els.redo.disabled = !redoStack.length;
  els.resetAll.disabled = !hasImages;
  els.fitCanvas.hidden = !canvasLock(state);
  els.copy.disabled = !hasImages;
  els.zoomCtl.classList.toggle('disabled', !hasImages);
  els.exportToggle.disabled = !hasImages;
  els.clear.hidden = !hasImages;
  syncExport();
  updateStatus();
}

function updateStatus() {
  document.title = state.images.length ? `MagicPin · ${state.images.length} 张图` : 'MagicPin';
  els.tools.classList.toggle('idle', !geo);
  if (!geo) {
    els.sizeInfo.textContent = '';
    return;
  }
  const area = geo.width * geo.height;
  // 悬停在图片上时顺带提示双击可以调整截取范围
  const tip = hoverImage != null && !cropEdit ? ' <span class="tip">· 拖动可移动，双击调整截取范围</span>' : '';
  els.sizeInfo.innerHTML = `${geo.width} × ${geo.height}`
    + (area > SAFE_CANVAS_AREA ? ' <span class="warn">· 尺寸过大，部分浏览器可能导出失败</span>' : '')
    + tip;
}

// ---------- 工具栏与缩放 ----------

for (const t of TOOLS) {
  if (!t) {
    const s = document.createElement('span');
    s.className = 'sep';
    els.tools.insertBefore(s, els.dockActions);
    continue;
  }
  const [id, text, key] = t;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tool';
  b.dataset.tool = id;
  b.dataset.tip = `${text}  ${key.toUpperCase()}`;
  b.setAttribute('aria-label', text);
  b.innerHTML = icon(id, 19);
  b.addEventListener('click', () => {
    if (!geo) {
      notify('先添加图片');
      return;
    }
    setTool(id);
  });
  els.tools.insertBefore(b, els.dockActions);
}

els.undo.addEventListener('click', undo);
els.redo.addEventListener('click', redo);
els.resetAll.addEventListener('click', resetAll);
els.zoomIn.addEventListener('click', () => zoomTo(view.zoom * 1.25));
els.zoomOut.addEventListener('click', () => zoomTo(view.zoom / 1.25));
els.zoomFit.addEventListener('click', fitZoom);
els.zoomSlider.addEventListener('input', () => zoomTo(sliderToZoom(Number(els.zoomSlider.value))));

function closeZoomMenu() {
  els.zoomMenu.hidden = true;
  els.zoomLabel.setAttribute('aria-expanded', 'false');
}
els.zoomLabel.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = els.zoomMenu.hidden;
  closeExport();
  els.zoomMenu.hidden = !open;
  els.zoomLabel.setAttribute('aria-expanded', String(open));
});
els.zoomMenu.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-zoom]');
  if (!b) return;
  closeZoomMenu();
  if (b.dataset.zoom === 'fit') fitZoom();
  else zoomTo(Number(b.dataset.zoom));
});
document.addEventListener('click', closeZoomMenu);

els.viewport.addEventListener('wheel', (e) => {
  // 触控板捏合会带 ctrlKey
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  zoomTo(view.zoom * Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY });
}, { passive: false });

window.addEventListener('resize', () => (view.fit ? fitZoom() : requestRender()));

// ---------- 导入 ----------

async function loadImage(file) {
  try {
    return await decodeImage(file);
  } catch (err) {
    // Chrome、Firefox 不认 HEIC（iPhone 照片），转成 JPEG 再读；Safari 原生支持，走不到这里
    if (!(await looksHeic(file))) throw err;
    return decodeImage(await convertHeic(file));
  }
}

async function decodeImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  return { img, url, file, name: file.name || '粘贴的图片', w, h, thumb: makeThumb(img, w, h) };
}

const HEIC_EXT = /\.(heic|heif)$/i;

// 有的系统拖进来的 HEIC 没有 MIME 类型，按扩展名和文件头一起判断
function isImageFile(file) {
  return file.type.startsWith('image/') || HEIC_EXT.test(file.name);
}

async function looksHeic(file) {
  if (/heic|heif/i.test(file.type) || HEIC_EXT.test(file.name)) return true;
  const brand = new TextDecoder().decode(await file.slice(8, 12).arrayBuffer());
  return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
}

// 解码器约 3MB，只在第一次遇到 HEIC 时从本站加载；转换在本机完成，图片不上传
let heicLib = null;
function loadHeicLib() {
  heicLib ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'js/vendor/heic-to.js';
    script.onload = () => resolve(window.HeicTo);
    script.onerror = () => {
      heicLib = null;
      reject(new Error('HEIC 解码器加载失败'));
    };
    document.head.append(script);
  });
  return heicLib;
}

async function convertHeic(file) {
  notify(`正在转换 HEIC：${file.name || '图片'}…`);
  const heicTo = await loadHeicLib();
  const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
  return new File([blob], (file.name || '图片').replace(HEIC_EXT, '') + '.jpg', { type: 'image/jpeg' });
}

// 模板缩略图用的小图
function makeThumb(img, w, h) {
  const k = Math.min(1, THUMB_MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { img: c, w: c.width, h: c.height, k: c.width / w };
}

async function addFiles(fileList, quiet = false) {
  const all = [...fileList];
  const files = all.filter(isImageFile);
  if (!files.length && all.length) notify('只能添加图片文件', 'error');
  if (!files.length) return;
  const ids = [];
  let failed = 0;
  for (const file of files) {
    try {
      const src = await loadImage(file);
      const id = nextImageId++;
      sources.set(id, src);
      ids.push(id);
    } catch {
      failed++;
    }
  }
  if (ids.length) {
    if (!state.images.length) view.fit = true;
    commit((s) => {
      if (!s.images.length) s.origin = importOrigin(s);
      s.images.push(...ids.map((id) => ({ id, crop: { t: 0, r: 0, b: 0, l: 0 }, rotate: 0, flip: false })));
    });
    // 新图加进来画布变大，回到中间，放不下就缩小
    recenterView();
    if (!quiet) notify(`已添加 ${ids.length} 张图片${state.images.length > 1 && ids.length < state.images.length ? `，共 ${state.images.length} 张` : ''}`);
  }
  if (failed) notify(`${failed} 张图片无法读取，文件可能已损坏或格式不受支持`, 'error');
}

for (const el of [els.add, els.addZone, els.emptyAdd]) el.addEventListener('click', () => els.file.click());
els.file.addEventListener('change', () => {
  addFiles(els.file.files);
  els.file.value = '';
});
els.clear.addEventListener('click', () => {
  const n = state.images.length;
  exitCropEdit();
  commit((s) => {
    s.images = [];
    s.objects = [];
    delete s.stitch;
  });
  notify(`已清空 ${n} 张图片`, 'info', true);
});

// 还原：图片按导入顺序回到原样，标注、遮挡、拼接全部去掉，布局、外观、水印回到第一次导入时
function importOrigin(s) {
  return structuredClone({ layout: s.layout, style: s.style, watermark: s.watermark });
}

function resetAll() {
  if (!state.images.length) return;
  finishTextEdit(true);
  exitCropEdit(false);
  commit((s) => {
    s.images = s.images.sort((a, b) => a.id - b.id).map(({ id }) => ({ id, crop: { t: 0, r: 0, b: 0, l: 0 }, rotate: 0, flip: false }));
    s.objects = [];
    delete s.stitch;
    delete s.canvasLock;
    if (s.origin) Object.assign(s, structuredClone(s.origin));
    // 导入时用的自定义背景图后来换掉、刷新后已不在本机
    if (s.style.bgImage != null && !sources.has(s.style.bgImage)) {
      s.style.bgImage = null;
      if (s.style.bg === 'image') s.style.bg = 'mesh';
    }
  });
  recenterView();
  notify('已还原到导入时的样子', 'info', true);
}

// 示例图：三张模拟的手机设置页，带假账号和手机号，可以直接试遮挡
els.demo.addEventListener('click', async () => {
  els.demo.disabled = true;
  els.demo.lastChild.textContent = '正在生成…';
  const files = [];
  const pages = [
    { title: '账号', accent: '#5b5bf0', rows: [['昵称', 'MagicPin'], ['账号', 'demo@magicpin.app'], ['手机号', '138 0000 0000'], ['地区', '上海'], ['会员', '已开通']] },
    { title: '通知', accent: '#f97316', rows: [['推送通知', 'on'], ['声音', 'on'], ['角标', 'off'], ['预览', '始终'], ['勿扰时段', '23:00 – 7:00']] },
    { title: '隐私', accent: '#22c55e', rows: [['位置信息', 'off'], ['相机', 'on'], ['照片', '仅选中'], ['麦克风', 'off'], ['追踪', 'off']] },
  ];
  for (const page of pages) files.push(await demoScreenshot(page));
  await addFiles(files, true);
  // 示例横向排开并套上一个外观，第一眼就能看到效果
  const preset = PRESETS.find((p) => p.name === 'iPhone');
  commit((s) => {
    s.layout.mode = 'horizontal';
    s.layout.gap = Math.round(24 * currentUnit());
    Object.assign(s.style, styleToPx(preset.style, currentUnit()));
    s.origin = importOrigin(s);
  });
  els.demo.disabled = false;
  els.demo.lastChild.textContent = '用示例图试试';
});

async function demoScreenshot({ title, accent, rows }) {
  const W = 750;
  const H = 1624;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#f2f2f7';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#111';
  x.font = `600 32px ${FONT_STACK}`;
  x.fillText('9:41', 82, 66);
  x.fillRect(612, 44, 52, 24);
  x.fillRect(666, 50, 4, 12);
  x.font = `700 68px ${FONT_STACK}`;
  x.fillText(title, 40, 230);
  // 资料卡
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.roundRect(32, 280, W - 64, 150, 24);
  x.fill();
  const g = x.createLinearGradient(64, 300, 164, 400);
  g.addColorStop(0, accent);
  g.addColorStop(1, '#ec4899');
  x.fillStyle = g;
  x.beginPath();
  x.arc(122, 355, 50, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#111';
  x.font = `600 36px ${FONT_STACK}`;
  x.fillText('Sue', 196, 345);
  x.fillStyle = '#8e8e93';
  x.font = `400 26px ${FONT_STACK}`;
  x.fillText('Apple ID、iCloud、媒体与购买项目', 196, 390);
  // 分组列表
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.roundRect(32, 470, W - 64, rows.length * 100, 24);
  x.fill();
  rows.forEach(([label, value], i) => {
    const y = 470 + i * 100;
    x.fillStyle = accent;
    x.beginPath();
    x.roundRect(60, y + 26, 48, 48, 12);
    x.fill();
    x.fillStyle = '#111';
    x.font = `400 32px ${FONT_STACK}`;
    x.fillText(label, 132, y + 61);
    if (value === 'on' || value === 'off') {
      x.fillStyle = value === 'on' ? '#34c759' : '#e5e5ea';
      x.beginPath();
      x.roundRect(W - 154, y + 30, 102, 40, 20);
      x.fill();
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(value === 'on' ? W - 74 : W - 134, y + 50, 17, 0, Math.PI * 2);
      x.fill();
    } else {
      x.fillStyle = '#8e8e93';
      x.textAlign = 'right';
      x.fillText(value, W - 64, y + 61);
      x.textAlign = 'start';
    }
    if (i < rows.length - 1) {
      x.fillStyle = '#e5e5ea';
      x.fillRect(132, y + 99, W - 164, 1.5);
    }
  });
  x.fillStyle = '#8e8e93';
  x.font = `400 26px ${FONT_STACK}`;
  x.fillText('这是一张示例截图，可以试试拼图、遮挡和外框。', 48, 470 + rows.length * 100 + 60);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return new File([blob], `示例-${title}.png`, { type: 'image/png' });
}

// ---------- 长截图拼接 ----------

// 每行压缩成 48 个灰度值，用来比对两张截图哪几行内容相同
function rowProfile(src) {
  const cols = 48;
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = src.h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src.img, 0, 0, src.w, src.h, 0, 0, cols, src.h);
  const data = ctx.getImageData(0, 0, cols, src.h).data;
  const gray = new Float32Array(cols * src.h);
  for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  return { gray, cols, h: src.h };
}

// 从 B 顶部（避开状态栏、导航栏）往下取若干内容足够丰富的横条，逐条到 A 里找完全相同的内容。
// 重叠区一定在 B 的上部，所以从上往下找；只接受“几乎完全一致且全图唯一”的匹配，
// 避免聊天记录这类重复度高的内容被错配。找到后 A 从该行截断、B 从横条处开始，正好接上，
// 同时去掉 A 底部和 B 顶部的固定栏
function findOverlap(a, b) {
  const { cols } = a;
  const S = Math.max(16, Math.round(b.h * 0.025));
  const n = S * cols;
  for (let y0 = Math.round(b.h * 0.12); y0 <= Math.round(b.h * 0.7) - S; y0 += Math.round(S / 2)) {
    if (stripVariance(b, y0, S) < 60) continue;
    const m = matchStrip(a, b, y0, S, n);
    // 截图压缩、滚动条等会带来轻微差异：差异足够小且明显好于其他位置才算数
    if (m && m.best <= 6 && m.second - m.best >= Math.max(6, m.best * 1.5)) return { cutA: m.y, startB: y0 };
  }
  return null;
}

function stripVariance(p, y, S) {
  let sum = 0;
  let sq = 0;
  const n = S * p.cols;
  for (let i = y * p.cols; i < (y + S) * p.cols; i++) {
    sum += p.gray[i];
    sq += p.gray[i] * p.gray[i];
  }
  return sq / n - (sum / n) ** 2;
}

// 返回最佳匹配行、最小差异，以及离最佳位置较远处的次佳差异（用来判断是否唯一）
function matchStrip(a, b, y0, S, n) {
  const { cols } = a;
  const scores = new Float32Array(a.h);
  scores.fill(Infinity);
  let best = Infinity;
  let bestY = -1;
  const offB = y0 * cols;
  for (let y = Math.round(a.h * 0.15); y <= a.h - S; y++) {
    let diff = 0;
    const limit = Math.max(best, 12) * n;
    const offA = y * cols;
    for (let i = 0; i < n && diff < limit; i++) diff += Math.abs(a.gray[offA + i] - b.gray[offB + i]);
    if (diff < limit) {
      scores[y] = diff / n;
      if (scores[y] < best) {
        best = scores[y];
        bestY = y;
      }
    }
  }
  if (bestY < 0) return null;
  let second = Infinity;
  for (let y = 0; y < a.h; y++) if (Math.abs(y - bestY) > S && scores[y] < second) second = scores[y];
  return { y: bestY, best, second };
}

function stitchScreenshots() {
  endLive();
  const list = state.images.map((im) => orientedSource(sources.get(im.id), im.rotate, im.flip));
  const profiles = list.map(rowProfile);
  const results = [];
  for (let i = 0; i + 1 < list.length; i++) {
    results.push(list[i].w === list[i + 1].w ? findOverlap(profiles[i], profiles[i + 1]) : null);
  }
  const found = results.filter(Boolean).length;
  if (!found) {
    notify('没有自动找到重叠部分，可以双击图片手动调整截取范围', 'error');
    return;
  }
  commit((s) => {
    // 记下拼接前的样子，“取消拼接”时原样还原
    s.stitch = {
      layout: { mode: s.layout.mode, gap: s.layout.gap, fit: s.layout.fit },
      crops: Object.fromEntries(s.images.map((im) => [im.id, { ...im.crop }])),
    };
    s.layout.mode = 'vertical';
    s.layout.gap = 0;
    // 长截图拼接要求接缝两边一样宽
    if (s.layout.fit === 'none') s.layout.fit = 'min';
    clearOffsets(s);
    results.forEach((r, i) => {
      // 前一对已经裁过这张图的顶部时，截断点不能落在被裁掉的部分里
      if (!r || r.cutA <= s.images[i].crop.t + 10) return;
      s.images[i].crop.b = list[i].h - r.cutA;
      s.images[i + 1].crop.t = r.startB;
    });
  });
  const missed = results.length - found;
  notify(`已拼接 ${found} 处重叠${missed ? `，${missed} 处未识别` : ''} · 双击图片可手动微调，点“取消拼接”可还原`, 'info', true);
}

els.stitch.addEventListener('click', () => (state.stitch ? cancelStitch() : stitchScreenshots()));

// 取消拼接：把参与拼接的图片裁切和拼接前的布局（排列、间距、统一宽度）都还原
function cancelStitch() {
  const saved = state.stitch;
  if (!saved) return;
  endLive();
  commit((s) => {
    Object.assign(s.layout, saved.layout);
    for (const im of s.images) {
      if (saved.crops[im.id]) im.crop = { ...saved.crops[im.id] };
    }
    clearOffsets(s);
    delete s.stitch;
  });
  recenterView();
  notify('已取消拼接，图片和布局已还原', 'info', true);
}
els.resetCrops.addEventListener('click', () => {
  commit((s) => {
    for (const im of s.images) {
      im.crop = { t: 0, r: 0, b: 0, l: 0 };
      delete im.scale;
    }
    clearOffsets(s);
    // 拼接的结果也一起撤掉，布局回到拼接前
    if (s.stitch) Object.assign(s.layout, s.stitch.layout);
    delete s.stitch;
  });
  recenterView();
  notify('已还原所有图片的裁切和大小', 'info', true);
});

// ---------- 在画布上调整截取范围 ----------
// 双击图片进入：拖四条边裁剪，拖图片本身移动截取窗口（长截图上下滑动对齐接缝）。
// 实时重排，画面和导出一致，接缝效果所见即所得。

const CROP_MIN = 20;

function enterCropEdit(id) {
  finishTextEdit(true);
  clearSelection();
  markTool('crop');
  cropEdit = { id, ratio: null };
  imageSel = null;
  holdCanvas();
  updateHover(null);
  renderList();
  renderProps();
  requestRender();
}

// back：裁完回到选择工具（点完成、Esc、点空白处）；切换工具时由 setTool 自己决定
function exitCropEdit(back = true) {
  if (!cropEdit) return;
  endLive();
  cropEdit = null;
  if (back && tool === 'crop') markTool('select');
  releaseCanvas();
  updateGeometry();
  releaseView();
  renderList();
  renderProps();
  requestRender();
}

// 裁边时保持这张图的内容在“非排列方向”上原地不动：横向不动上下、纵向不动左右、网格两个方向都不动，
// 拖的那条边紧跟鼠标；差值记进这张图的 offset。排列方向上照常紧挨着排（长截图拼接靠这个看接缝）
function keepCropContent(id, zone, before) {
  if (zone === 'move' || !before) return;
  const r = geo.rects.get(id);
  const mode = state.layout.mode;
  const dx = mode === 'horizontal' ? 0 : before.x - (r.ox - geo.origin.x);
  const dy = mode === 'vertical' ? 0 : before.y - (r.oy - geo.origin.y);
  if (!dx && !dy) return;
  live((s) => {
    const im = s.images.find((x) => x.id === id);
    im.offset = { x: (im.offset?.x ?? 0) + dx, y: (im.offset?.y ?? 0) + dy };
  });
}

function contentOrigin(id) {
  const r = geo?.rects.get(id);
  return r && { x: r.ox - geo.origin.x, y: r.oy - geo.origin.y };
}

// ---------- 画面稳定 ----------
// 裁剪、拖动图片时画布尺寸会变，而画布在窗口里是居中的；用平移抵消，让排版原点在屏幕上不动，
// 没被操作的图片就纹丝不动。缩放、适应窗口时清零。

function originOnScreen() {
  if (!geo) return null;
  const c = els.canvas.getBoundingClientRect();
  return { x: c.left + geo.origin.x * view.zoom, y: c.top + geo.origin.y * view.zoom };
}

function keepOrigin(before) {
  const after = originOnScreen();
  if (!before || !after) return;
  setShift(view.shift.x + before.x - after.x, view.shift.y + before.y - after.y);
}

function setShift(x, y) {
  view.shift = { x, y };
  els.wrap.style.translate = x || y ? `${x}px ${y}px` : '';
}

// 裁剪、拖动、缩放图片期间画布只变大不变小，画布和排版原点都留在原地，内容超出才往外扩。
// 结束后：自适应画布收紧到内容加留白；固定比例画布锁住当前尺寸（canvasLock），不再自动缩小，可点“贴合内容”收紧
let canvasHold = null;

function holdCanvas() {
  if (canvasHold || !geo) return;
  canvasHold = { width: geo.width, height: geo.height, origin: { ...geo.origin } };
}

const ratioCanvas = (s) => s.style.bg !== 'none' && Boolean(RATIOS[s.style.ratio]);

function lockKey(s) {
  const { padding, ratio, frame, border, bg } = s.style;
  return JSON.stringify([s.images.map((im) => im.id), s.layout, padding, ratio, frame, border, bg === 'none']);
}

function canvasLock(s) {
  const lock = s.canvasLock;
  return lock && ratioCanvas(s) && lock.key === lockKey(s) ? { width: lock.width, height: lock.height, origin: lock.origin } : null;
}

function releaseCanvas() {
  if (!canvasHold) return;
  const screen = originOnScreen();
  canvasHold = null;
  if (geo && ratioCanvas(state)) {
    const natural = computeGeometry(state, sources);
    const moved = natural.width !== geo.width || natural.height !== geo.height || natural.origin.x !== geo.origin.x || natural.origin.y !== geo.origin.y;
    if (moved) state.canvasLock = { key: lockKey(state), width: geo.width, height: geo.height, origin: { ...geo.origin } };
    else delete state.canvasLock;
  }
  // 收紧时不自动适应窗口（否则裁小后会被放大显示），缩放交给 releaseView 决定
  const held = holdView;
  holdView = true;
  updateGeometry();
  holdView = held;
  keepOrigin(screen);
  settleView();
  syncPanels();
  scheduleSessionSave();
}

// 操作结束后画面保持不动；只有画布跑出窗口可见范围时，才慢慢回到窗口中间（否则连续操作会越跑越偏）
function settleView() {
  if (!view.shift.x && !view.shift.y) return;
  const v = els.viewport.getBoundingClientRect();
  const c = els.canvas.getBoundingClientRect();
  if (c.left >= v.left && c.top >= v.top && c.right <= v.right && c.bottom <= v.bottom) return;
  els.wrap.classList.add('settling');
  requestAnimationFrame(() => setShift(0, 0));
  setTimeout(() => els.wrap.classList.remove('settling'), 320);
}

// 操作期间不自动适应窗口（否则裁小后会被放大显示）；结束后保持当前缩放，只有画布超出窗口时才重新适应
let holdView = false;
// 用户主动重新排版（换排列方式、对齐、还原裁切）后，画布回到窗口中间；放不下时缩小到适应窗口
function recenterView() {
  setShift(0, 0);
  if (!geo) return;
  if (view.fit || fitZoomValue() < view.zoom) fitZoom();
  else applyZoom();
}

function releaseView() {
  holdView = false;
  if (!view.fit || !geo) return;
  if (fitZoomValue() < view.zoom) fitZoom();
  else view.fit = false;
  applyZoom();
}

function cropRect() {
  return cropEdit && geo?.rects.get(cropEdit.id);
}

function cropZoneAt(p) {
  const r = cropRect();
  if (!r) return null;
  const tol = 8 / view.zoom;
  const inX = p.x >= r.x - tol && p.x <= r.x + r.w + tol;
  const inY = p.y >= r.y - tol && p.y <= r.y + r.h + tol;
  // 四个角优先，范围比边大一点，好抓
  const ct = 14 / view.zoom;
  const nearT = Math.abs(p.y - r.y) <= ct;
  const nearB = Math.abs(p.y - (r.y + r.h)) <= ct;
  const nearL = Math.abs(p.x - r.x) <= ct;
  const nearR = Math.abs(p.x - (r.x + r.w)) <= ct;
  if ((nearT || nearB) && (nearL || nearR)) return (nearT ? 't' : 'b') + (nearL ? 'l' : 'r');
  if (inX && Math.abs(p.y - r.y) <= tol) return 't';
  if (inX && Math.abs(p.y - (r.y + r.h)) <= tol) return 'b';
  if (inY && Math.abs(p.x - r.x) <= tol) return 'l';
  if (inY && Math.abs(p.x - (r.x + r.w)) <= tol) return 'r';
  if (insideRect(p, r, 0)) return 'move';
  return null;
}

// 拖动量换算成原图像素；边框拖到哪裁到哪，拖角同时裁两条边，拖中间是整体平移截取窗口
function nextCrop(d, p) {
  const dx = (p.x - d.start.x) / d.s;
  const dy = (p.y - d.start.y) / d.s;
  const c = { ...d.orig };
  const { w, h } = d.size;
  const clamp = (v, max) => Math.round(Math.max(0, Math.min(max, v)));
  if (d.zone !== 'move') {
    if (d.zone.includes('t')) c.t = clamp(d.orig.t + dy, h - c.b - CROP_MIN);
    if (d.zone.includes('b')) c.b = clamp(d.orig.b - dy, h - c.t - CROP_MIN);
    if (d.zone.includes('l')) c.l = clamp(d.orig.l + dx, w - c.r - CROP_MIN);
    if (d.zone.includes('r')) c.r = clamp(d.orig.r - dx, w - c.l - CROP_MIN);
  } else {
    const my = Math.max(-d.orig.t, Math.min(d.orig.b, -dy));
    const mx = Math.max(-d.orig.l, Math.min(d.orig.r, -dx));
    c.t = Math.round(d.orig.t + my);
    c.b = Math.round(d.orig.b - my);
    c.l = Math.round(d.orig.l + mx);
    c.r = Math.round(d.orig.r - mx);
  }
  if (d.ratio && d.zone !== 'move') lockRatio(c, d);
  return c;
}

// 锁定比例时拖一条边，另一个方向以原来的中线为轴等比伸缩；拖角时对角固定，按变化大的方向等比缩放。碰到原图边缘就停
function lockRatio(c, d) {
  const { w, h } = d.size;
  const R = d.ratio;
  const o = d.orig;
  if (d.zone.length === 2) {
    const maxW = d.zone.includes('l') ? w - o.r : w - o.l;
    const maxH = d.zone.includes('t') ? h - o.b : h - o.t;
    const W = Math.min(Math.max(w - c.l - c.r, (h - c.t - c.b) * R), maxW, maxH * R);
    const H = W / R;
    if (d.zone.includes('l')) c.l = Math.round(w - o.r - W);
    else c.r = Math.round(w - o.l - W);
    if (d.zone.includes('t')) c.t = Math.round(h - o.b - H);
    else c.b = Math.round(h - o.t - H);
    return;
  }
  if (d.zone === 't' || d.zone === 'b') {
    let H = h - c.t - c.b;
    let W = H * R;
    if (W > w) {
      W = w;
      H = W / R;
      if (d.zone === 't') c.t = Math.round(h - c.b - H);
      else c.b = Math.round(h - c.t - H);
    }
    const cx = o.l + (w - o.l - o.r) / 2;
    const l = Math.max(0, Math.min(w - W, cx - W / 2));
    c.l = Math.round(l);
    c.r = Math.max(0, Math.round(w - l - W));
  } else {
    let W = w - c.l - c.r;
    let H = W / R;
    if (H > h) {
      H = h;
      W = H * R;
      if (d.zone === 'l') c.l = Math.round(w - c.r - W);
      else c.r = Math.round(w - c.l - W);
    }
    const cy = o.t + (h - o.t - o.b) / 2;
    const t = Math.max(0, Math.min(h - H, cy - H / 2));
    c.t = Math.round(t);
    c.b = Math.max(0, Math.round(h - t - H));
  }
}

// 常用比例：5:2 是 X 文章头图，16:9、1:1 是 X 推文配图常见比例
const CROP_RATIOS = [['free', '自由'], ['orig', '原图'], ['1:1', '1:1'], ['4:3', '4:3'], ['3:4', '3:4'], ['16:9', '16:9'], ['9:16', '9:16'], ['5:2', '5:2']];

function cropRatioValue(r) {
  const key = cropEdit?.ratio;
  if (!key || key === 'free') return null;
  if (key === 'orig') return r.src.w / r.src.h;
  const [a, b] = key.split(':').map(Number);
  return a / b;
}

// 选比例：在整张原图里取这个比例能放下的最大范围，中心对准当前截取范围的中心（碰到边缘就靠边）
function applyCropRatio(key) {
  cropEdit.ratio = key;
  const r = cropRect();
  const R = cropRatioValue(r);
  if (R) {
    const { w, h } = r.src;
    const c = state.images.find((im) => im.id === cropEdit.id).crop;
    const W = Math.round(w / h > R ? h * R : w);
    const H = Math.round(w / h > R ? h : w / R);
    const cx = c.l + (w - c.l - c.r) / 2;
    const cy = c.t + (h - c.t - c.b) / 2;
    const l = Math.round(Math.max(0, Math.min(w - W, cx - W / 2)));
    const t = Math.round(Math.max(0, Math.min(h - H, cy - H / 2)));
    const next = { l, t, r: w - l - W, b: h - t - H };
    const screen = originOnScreen();
    const content = contentOrigin(cropEdit.id);
    setCrop(cropEdit.id, next);
    keepCropContent(cropEdit.id, 'edge', content);
    keepOrigin(screen);
    endLive();
  }
  refresh();
}

function setCrop(id, crop) {
  live((s) => {
    const im = s.images.find((x) => x.id === id);
    if (im) im.crop = crop;
  });
}

function nudgeCrop(dx, dy) {
  const im = state.images.find((x) => x.id === cropEdit.id);
  const r = cropRect();
  if (!im || !r) return;
  const d = { zone: 'move', start: { x: 0, y: 0 }, orig: im.crop, s: 1, size: { w: r.src.w, h: r.src.h } };
  commit((s) => {
    // 和拖动同向：按 ↓ 等于把图片往下拖一点
    s.images.find((x) => x.id === im.id).crop = nextCrop(d, { x: dx, y: dy });
  });
}

// 只画截取框和拖动条，不压暗、不叠半透明原图，画面保持和导出一致，方便看接缝
function drawCropOverlay(ctx, px) {
  const r = cropRect();
  if (!r) return;
  const accent = accentColor();
  ctx.save();
  ctx.setLineDash([]);
  // 框线：主题色 2px，外面垫一圈白色和一圈淡黑，深浅截图上都清楚
  const line = (width, color, inset) => {
    ctx.lineWidth = width * px;
    ctx.strokeStyle = color;
    ctx.strokeRect(r.x - inset * px, r.y - inset * px, r.w + 2 * inset * px, r.h + 2 * inset * px);
  };
  line(5, 'rgba(0, 0, 0, 0.15)', 0);
  line(4, 'rgba(255, 255, 255, 0.85)', 0);
  line(2, accent, 0);

  // 把手：角是贴在框外侧的 L，边中间是骑在线上的短胶囊；主题色实心、白色细边，带一点投影
  const T = 5 * px;
  const C = Math.min(24 * px, r.w / 3, r.h / 3);
  const L = Math.min(28 * px, r.w / 3, r.h / 3);
  const shapes = new Path2D();
  for (const [x, y, sx, sy] of [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]]) {
    // L 的内角正好落在框角上，向外凸出一个把手的厚度
    const ox = x - sx * T;
    const oy = y - sy * T;
    const p = new Path2D();
    p.moveTo(ox, oy);
    p.lineTo(ox + sx * (C + T), oy);
    p.lineTo(ox + sx * (C + T), y);
    p.lineTo(x, y);
    p.lineTo(x, oy + sy * (C + T));
    p.lineTo(ox, oy + sy * (C + T));
    p.closePath();
    shapes.addPath(p);
  }
  shapes.roundRect(r.x + r.w / 2 - L / 2, r.y - T / 2, L, T, T / 2);
  shapes.roundRect(r.x + r.w / 2 - L / 2, r.y + r.h - T / 2, L, T, T / 2);
  shapes.roundRect(r.x - T / 2, r.y + r.h / 2 - L / 2, T, L, T / 2);
  shapes.roundRect(r.x + r.w - T / 2, r.y + r.h / 2 - L / 2, T, L, T / 2);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 4 * px;
  ctx.shadowOffsetY = 1 * px;
  ctx.lineWidth = 1.5 * px;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.stroke(shapes);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = accent;
  ctx.fill(shapes);
  ctx.restore();
}

function renderCropProps(bar) {
  const i = state.images.findIndex((im) => im.id === cropEdit.id);
  const im = state.images[i];
  const label = document.createElement('span');
  label.className = 'prop-label';
  label.textContent = state.images.length > 1 ? `裁剪 · 第 ${i + 1} 张` : '裁剪';
  const c = im.crop;
  const r = cropRect();
  const info = hintText(r ? `${r.cw} × ${r.ch} px` : '');
  const ratios = segmented(CROP_RATIOS, cropEdit.ratio ?? 'free', applyCropRatio);
  ratios.classList.add('ratio-seg');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn';
  reset.innerHTML = `${icon('reset', 14)}还原这张`;
  reset.disabled = !(c.t || c.b || c.l || c.r);
  reset.addEventListener('click', () => {
    cropEdit.ratio = null;
    commit((s) => {
      s.images[i].crop = { t: 0, r: 0, b: 0, l: 0 };
      delete s.images[i].offset;
    });
  });
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'btn primary';
  done.innerHTML = `${icon('check', 14)}完成`;
  done.addEventListener('click', exitCropEdit);
  bar.append(label, vsep(), ratios, info, vsep(), hintText('拖边或角裁剪 · 拖图片移动'), vsep(), reset, done);
}

// ---------- 导出 ----------

function exportExt(type) {
  return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type] ?? 'png';
}

// 导出用全新画布重绘，只含最终像素，不带编辑框和任何原图数据
function currentScene() {
  if (!canvasHold) return { geo, base, objs: state.objects.map((o) => toCanvasObject(geo, o)) };
  // 裁剪途中导出：按松手后的画布算，不带操作期间多留的空白
  const g = computeGeometry(state, sources, canvasLock(state));
  return { geo: g, base: buildBase(g, state.style, { bgImage: bgImageSource() }), objs: state.objects.map((o) => toCanvasObject(g, o)) };
}

// 单张图片套用同样的外框、背景、水印，只带锚定在这张图上的标注和遮挡
function imageScene(im) {
  const g = computeGeometry({ ...state, images: [im] }, sources);
  const b = buildBase(g, state.style, { bgImage: bgImageSource() });
  return { geo: g, base: b, objs: state.objects.filter((o) => o.anchor === im.id).map((o) => toCanvasObject(g, o)) };
}

function renderFinal(type, scale, scene = currentScene()) {
  const canvas = document.createElement('canvas');
  composite(canvas, scene.objs, scene.geo, scene.base);
  // JPEG 不支持透明，垫白底
  const flatten = type === 'image/jpeg' && state.style.bg === 'none';
  if (scale === 1 && !flatten) return canvas;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext('2d');
  if (flatten) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('图片过大或浏览器不支持'))), type, quality);
  });
}

// 适配 X 时超过 5 MB 自动处理：有损格式先降质量，仍超就逐步缩小尺寸
async function exportBlob(type, scene = currentScene()) {
  finishTextEdit(true);
  endLive();
  let scale = Number(prefs.export.scale);
  let quality = 0.92;
  let blob = await canvasToBlob(renderFinal(type, scale, scene), type, quality);
  const notes = [];
  if (prefs.export.x && blob.size > X_IMAGE_LIMIT) {
    if (type !== 'image/png') {
      for (const q of [0.85, 0.78, 0.7]) {
        if (blob.size <= X_IMAGE_LIMIT) break;
        quality = q;
        blob = await canvasToBlob(renderFinal(type, scale, scene), type, quality);
      }
      if (quality < 0.92) notes.push(`质量 ${Math.round(quality * 100)}%`);
    }
    while (blob.size > X_IMAGE_LIMIT && scale > 0.2) {
      scale *= 0.85;
      blob = await canvasToBlob(renderFinal(type, scale, scene), type, quality);
    }
    if (scale < Number(prefs.export.scale)) notes.push(`缩小到 ${Math.round(scale * 100)}%`);
  }
  return { blob, notes };
}

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const splitExport = () => prefs.export.mode === 'each' && state.images.length > 1;

// 导出进行中：按钮图标闪烁、防止连点；完成后按钮短暂打勾
let exporting = false;

function setExporting(on) {
  exporting = on;
  document.body.classList.toggle('exporting', on);
  for (const b of [els.copy, els.popCopy, els.download, els.exportToggle]) b.setAttribute('aria-busy', String(on));
}

function flashDone(button, text) {
  if (button.dataset.label == null) button.dataset.label = button.innerHTML;
  clearTimeout(Number(button.dataset.flash));
  button.innerHTML = `${icon('check', 16)}${text}`;
  button.classList.add('done');
  button.dataset.flash = setTimeout(() => {
    button.innerHTML = button.dataset.label;
    button.classList.remove('done');
  }, 1600);
}

async function download() {
  if (!geo || exporting) return;
  const type = prefs.export.format;
  if (splitExport()) {
    downloadEach(type);
    return;
  }
  setExporting(true);
  try {
    const { blob, notes } = await exportBlob(type);
    saveBlob(blob, `magicpin-${timestamp()}.${exportExt(blob.type)}`);
    const fallback = blob.type !== type ? `（浏览器不支持 ${exportExt(type).toUpperCase()}，已存为 ${exportExt(blob.type).toUpperCase()}）` : '';
    notify(`已下载 · ${formatBytes(blob.size)}${notes.length ? ` · 已${notes.join('、')}以适配 X` : ''}${fallback}`, blob.size > X_IMAGE_LIMIT ? 'error' : 'info');
    closeExport();
    flashDone(els.exportToggle, '已下载');
  } catch (err) {
    notify(`导出失败：${err.message}`, 'error');
  } finally {
    setExporting(false);
  }
}

// 逐张导出：每张图单独一个文件，按列表顺序编号；浏览器第一次可能询问是否允许下载多个文件
async function downloadEach(type) {
  setExporting(true);
  const stamp = timestamp();
  const images = state.images.slice();
  let total = 0;
  let over = 0;
  try {
    for (const [i, im] of images.entries()) {
      const { blob } = await exportBlob(type, imageScene(im));
      saveBlob(blob, `magicpin-${stamp}-${i + 1}.${exportExt(blob.type)}`);
      total += blob.size;
      if (blob.size > X_IMAGE_LIMIT) over++;
      await new Promise((r) => setTimeout(r, 250));
    }
    notify(`已下载 ${images.length} 张 · 共 ${formatBytes(total)}${over ? ` · ${over} 张超过 5 MB` : ''}`, over ? 'error' : 'info');
    closeExport();
    flashDone(els.exportToggle, '已下载');
  } catch (err) {
    notify(`导出失败：${err.message}`, 'error');
  } finally {
    setExporting(false);
  }
}

async function copyImage() {
  if (!geo || exporting) return;
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    notify('当前环境不支持复制图片，请用 localhost 打开或改用下载', 'error');
    return;
  }
  setExporting(true);
  try {
    // Safari 要求在用户手势内同步创建 ClipboardItem，所以传入 Promise
    const job = exportBlob('image/png');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': job.then((r) => r.blob) })]);
    const { blob, notes } = await job;
    notify(`已复制，可以直接粘贴到 X · ${formatBytes(blob.size)}${notes.length ? ` · 已${notes.join('、')}以适配 X` : ''}`, blob.size > X_IMAGE_LIMIT ? 'error' : 'info');
    closeExport();
    flashDone(els.copy, '已复制');
  } catch (err) {
    notify(`复制失败：${err.message}`, 'error');
  } finally {
    setExporting(false);
  }
}

function syncExport() {
  syncSeg(els.exportFormat, prefs.export.format);
  syncSeg(els.exportScale, prefs.export.scale);
  els.exportX.checked = prefs.export.x;
  syncSeg(els.exportMode, prefs.export.mode);
  const multi = state.images.length > 1;
  els.exportMode.querySelector('[data-value="each"]').disabled = !multi;
  const split = splitExport();
  // 剪贴板一次只能放一张图，逐张模式下只能下载
  els.popCopy.hidden = split;
  if (geo) {
    const s = Number(prefs.export.scale);
    const ext = exportExt(prefs.export.format).toUpperCase();
    els.exportMeta.textContent = split
      ? `${state.images.length} 个文件，每张图单独带外框、背景和水印 · ${ext}`
      : `输出 ${Math.round(geo.width * s)} × ${Math.round(geo.height * s)} 像素 · ${ext}`;
  }
}

function openExport() {
  if (!geo) return;
  els.exportPop.hidden = false;
  els.exportToggle.setAttribute('aria-expanded', 'true');
  syncExport();
}

function closeExport() {
  els.exportPop.hidden = true;
  els.exportToggle.setAttribute('aria-expanded', 'false');
}

els.exportToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  if (els.exportPop.hidden) openExport();
  else closeExport();
});
els.exportPop.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', closeExport);
bindSeg(els.exportFormat, (v) => {
  prefs.export.format = v;
  savePrefs();
  syncExport();
});
bindSeg(els.exportScale, (v) => {
  prefs.export.scale = Number(v);
  savePrefs();
  syncExport();
});
els.exportX.addEventListener('change', () => {
  prefs.export.x = els.exportX.checked;
  savePrefs();
});
els.copy.addEventListener('click', copyImage);
els.popCopy.addEventListener('click', copyImage);
bindSeg(els.exportMode, (v) => {
  prefs.export.mode = v;
  savePrefs();
  syncExport();
});
els.download.addEventListener('click', download);

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

// ---------- 快捷键 ----------

const SHORTCUTS = [
  ['选择 / 框选', ['V']], ['遮挡', ['M']], ['文字', ['T']], ['箭头', ['A']], ['矩形', ['R']], ['椭圆', ['O']],
  ['直线', ['L']], ['画笔', ['P']], ['序号', ['N']], ['高亮', ['H']], ['聚光', ['F']], ['放大镜', ['Z']],
  ['贴纸', ['E']], ['随机模板', ['S']], ['撤销 / 重做', ['⌘', 'Z']], ['复制图片', ['⇧', '⌘', 'C']],
  ['下载', ['⌘', 'S']], ['放大 / 缩小', ['⌘', '+ −']], ['适应窗口', ['⌘', '0']], ['实际大小 100%', ['⌘', '1']], ['复制对象', ['⌘', 'D']],
  ['置顶 / 置底', ['] [']], ['删除对象', ['⌫']], ['微移（加 ⇧ 更快）', ['方向键']], ['直线吸附 45°', ['按住 ⇧']],
  ['裁剪', ['C']], ['裁剪（选择工具下）', ['双击图片']],   ['全选对象', ['⌘', 'A']], ['加选 / 减选', ['⇧', '点击']], ['平移画面', ['按住空格']], ['拖动时不吸附', ['按住 ⌥']],
];

function renderShortcuts() {
  els.shortcutGrid.replaceChildren(...SHORTCUTS.map(([label, keys]) => {
    const row = document.createElement('div');
    const span = document.createElement('span');
    span.textContent = label;
    const k = document.createElement('span');
    k.innerHTML = keys.map((key) => `<kbd>${key}</kbd>`).join('');
    row.append(span, k);
    return row;
  }));
}

function toggleShortcuts(show = els.shortcutsModal.hidden) {
  els.shortcutsModal.hidden = !show;
}

els.shortcuts.addEventListener('click', () => toggleShortcuts(true));
els.shortcutsModal.addEventListener('click', (e) => {
  if (e.target === els.shortcutsModal || e.target.closest('[data-close]')) toggleShortcuts(false);
});

// ---------- 全局输入 ----------

els.editor.addEventListener('input', () => {
  if (!editing) return;
  editing.obj.text = els.editor.value;
  styleEditor();
});
els.editor.addEventListener('blur', () => finishTextEdit(true));
els.editor.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    finishTextEdit(false);
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    finishTextEdit(true);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input:not([type="checkbox"]):not([type="range"]), textarea, select')) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (e.key === ' ' && !mod) {
    // 按住空格拖动平移画面
    e.preventDefault();
    if (!spaceDown && !drag) {
      spaceDown = true;
      els.canvas.style.cursor = 'grab';
    }
    return;
  }
  if (cropEdit && !mod) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      exitCropEdit();
      return;
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      nudgeCrop(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') return;
  }
  if (!els.shortcutsModal.hidden && (e.key === 'Escape' || e.key === '?')) {
    toggleShortcuts(false);
    return;
  }
  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (mod && key === 'y') {
    e.preventDefault();
    redo();
  } else if (mod && e.shiftKey && key === 'c') {
    e.preventDefault();
    copyImage();
  } else if (mod && key === 's') {
    e.preventDefault();
    download();
  } else if (mod && key === 'd') {
    e.preventDefault();
    duplicateSelected();
  } else if (mod && key === 'a' && geo) {
    e.preventDefault();
    if (tool !== 'select') setTool('select');
    setSelection(state.objects.map((o) => o.id));
    renderProps();
    requestRender();
  } else if (mod && (key === '=' || key === '+')) {
    e.preventDefault();
    zoomTo(view.zoom * 1.25);
  } else if (mod && key === '-') {
    e.preventDefault();
    zoomTo(view.zoom / 1.25);
  } else if (mod && key === '0') {
    e.preventDefault();
    fitZoom();
  } else if (mod && key === '1') {
    e.preventDefault();
    zoomTo(1);
  } else if (mod) {
    // 其余组合键交给浏览器
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectionIds().length) {
    e.preventDefault();
    deleteSelected();
  } else if (e.key === 'Escape') {
    closeExport();
    closeZoomMenu();
    if (imageSel != null) {
      imageSel = null;
      requestRender();
    } else if (selectionIds().length) {
      clearSelection();
      renderProps();
      requestRender();
    } else if (tool !== 'select') {
      setTool('select');
    }
  } else if (e.key.startsWith('Arrow') && selectionIds().length) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    const ids = moveObjects(selectionIds(), dx, dy);
    setSelection(ids.length === 1 || multi.length ? ids : []);
    renderProps();
  } else if (e.key === ']' || e.key === '[') {
    reorderSelected(e.key === ']' ? 1 : -1);
  } else if (e.key === '?') {
    toggleShortcuts();
  } else if (key === 's' && geo) {
    shuffleStyle();
  } else if (!e.altKey) {
    const match = TOOL_LIST.find(([, , k]) => k === key);
    if (match && geo) setTool(match[0]);
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && spaceDown) {
    spaceDown = false;
    if (!drag) els.canvas.style.cursor = '';
  }
});
window.addEventListener('blur', () => { spaceDown = false; });

document.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files ?? [])];
  if (files.length) {
    e.preventDefault();
    addFiles(files);
  }
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  els.workspace.classList.add('dragging');
});
window.addEventListener('dragleave', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) els.workspace.classList.remove('dragging');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.workspace.classList.remove('dragging');
  if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
});

// ---------- 会话保存 ----------
// 当前作品（图片原文件 + 编辑状态）自动存在本机 IndexedDB，刷新或误关后打开即恢复。
// 只存当前状态，不存撤销历史；数据不离开浏览器。

const DB_NAME = 'magicpin';
let dbPromise = null;
let sessionTimer = 0;
let restoring = false;
const persistedImages = new Set();

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('images');
      req.result.createObjectStore('session');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(() => null);
  return dbPromise;
}

const idbRequest = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

function referencedImageIds(s) {
  const ids = new Set(s.images.map((im) => im.id));
  if (s.style.bgImage != null) ids.add(s.style.bgImage);
  return ids;
}

function scheduleSessionSave() {
  if (restoring || booting) return;
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(saveSession, 500);
}

async function saveSession() {
  clearTimeout(sessionTimer);
  const db = await openDb();
  if (!db) return;
  try {
    const ids = referencedImageIds(state);
    const tx = db.transaction(['images', 'session'], 'readwrite');
    const images = tx.objectStore('images');
    for (const id of ids) {
      const src = sources.get(id);
      if (!persistedImages.has(id) && src?.file) {
        images.put({ blob: src.file, name: src.name }, id);
        persistedImages.add(id);
      }
    }
    // 不再用到的原图删掉；撤销找回时内存里还有，下次保存会重新写入
    for (const id of [...persistedImages]) {
      if (!ids.has(id)) {
        images.delete(id);
        persistedImages.delete(id);
      }
    }
    tx.objectStore('session').put({ state, nextImageId, nextObjectId, savedAt: Date.now() }, 'current');
    await idbDone(tx);
  } catch {
    // 空间不足或隐私模式：不影响编辑，只是刷新后无法恢复
    persistedImages.clear();
  }
}

async function restoreSession() {
  const db = await openDb();
  if (!db) return false;
  restoring = true;
  try {
    const tx = db.transaction(['images', 'session'], 'readonly');
    const saved = await idbRequest(tx.objectStore('session').get('current'));
    if (!saved?.state?.images?.length) return false;
    const ids = [...referencedImageIds(saved.state)];
    const records = await Promise.all(ids.map((id) => idbRequest(tx.objectStore('images').get(id))));
    for (const [i, id] of ids.entries()) {
      const rec = records[i];
      if (!rec) continue;
      try {
        const file = rec.blob instanceof File ? rec.blob : new File([rec.blob], rec.name, { type: rec.blob.type });
        sources.set(id, await loadImage(file));
        persistedImages.add(id);
      } catch {
        // 单张读不出来就跳过
      }
    }
    const s = saved.state;
    s.images = s.images.filter((im) => sources.has(im.id));
    if (!s.images.length) return false;
    s.style.frame = normalizeFrame(s.style.frame);
    if (s.style.bgImage != null && !sources.has(s.style.bgImage)) {
      s.style.bgImage = null;
      if (s.style.bg === 'image') s.style.bg = 'mesh';
    }
    s.objects = s.objects.filter((o) => sources.has(o.anchor));
    // 恢复期间用户已经自己加了图，就不覆盖
    if (state.images.length) return false;
    state = s;
    nextImageId = Math.max(nextImageId, saved.nextImageId ?? 1, ...ids.map((id) => id + 1));
    nextObjectId = Math.max(nextObjectId, saved.nextObjectId ?? 1, ...s.objects.map((o) => o.id + 1));
    view.fit = true;
    refresh();
    return true;
  } catch {
    return false;
  } finally {
    restoring = false;
  }
}

// 关页面或切走时立刻存一次，不等防抖
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !booting) saveSession();
});

// ---------- 启动 ----------

loadPrefs();
applySections();
applyTheme();
renderFrames();
renderShortcuts();
renderGallery();
refresh();
setTool('select');
restoreSession().then((ok) => {
  booting = false;
  requestRender();
  if (state.images.length) scheduleSessionSave();
  if (ok) notify(`已恢复上次的作品（${state.images.length} 张图）`);
});
