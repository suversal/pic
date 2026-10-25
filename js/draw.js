'use strict';

// 纯绘制与几何：不读写界面状态，供 app.js 调用

// 马赛克和模糊都按“每 N 像素保留一个采样”处理，N 不低于这个值，避免弱到能辨认字形
const STRENGTH_MIN = 12;
// Safari 对单个画布的面积上限约 16.7M 像素
const SAFE_CANVAS_AREA = 16_000_000;
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif';
const EMOJI_STACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// 线宽和字号以“单位”计；单位随图片尺寸变化，不同分辨率的截图上观感一致
const LINE_LEVELS = [1.4, 2.4, 3.6];
const FONT_LEVELS = [11, 16, 22, 30];

const GRADIENTS = [
  { name: '象牙', colors: ['#fbf8f3', '#ebe3d6'] },
  { name: '雾灰', colors: ['#f4f5f7', '#dde1e7'] },
  { name: '晨曦', colors: ['#f7e6ea', '#dfe7f6'] },
  { name: '海盐', colors: ['#e6eef7', '#cbd9ea'] },
  { name: '抹茶', colors: ['#eff2e8', '#d3dcc8'] },
  { name: '杏子', colors: ['#fcebdf', '#efcfbf'] },
  { name: '靛夜', colors: ['#1e1b4b', '#2f4a7a'] },
  { name: '紫夜', colors: ['#190f30', '#43356b'] },
  { name: '深海', colors: ['#0b1220', '#1f3048'] },
  { name: '石墨', colors: ['#141416', '#3a3a40'] },
];

// 网格渐变：底色上叠几团柔和的径向色块，[x, y, 半径, 颜色]，坐标和半径都是相对画布的比例。
// 配色刻意压低饱和度，深色款用 glow 在画面中间打一团微光、vignette 压暗四角，让前景浮起来
const MESHES = [
  { name: '奶油', base: '#f6f1ea', blobs: [[0.05, 0.05, 0.7, '#efdcc8'], [0.95, 0.2, 0.6, '#f3e3d3'], [0.7, 1, 0.75, '#e9d3c6']] },
  { name: '雾蓝', base: '#eef2f6', blobs: [[0.1, 0.1, 0.7, '#d5e0ee'], [0.95, 0.35, 0.65, '#e2e6f1'], [0.4, 1, 0.75, '#cfdbe8']] },
  { name: '鼠尾草', base: '#eef0e8', blobs: [[0.1, 0.15, 0.7, '#d6dece'], [0.9, 0.1, 0.6, '#e8e4d4'], [0.6, 1, 0.75, '#cdd6c4']] },
  { name: '玫瑰灰', base: '#f5eeec', blobs: [[0.1, 0.9, 0.75, '#ead3d1'], [0.9, 0.1, 0.65, '#ece0d6'], [0.85, 0.9, 0.6, '#ddd6e8']] },
  { name: '薰衣草', base: '#efedf8', blobs: [[0.15, 0.1, 0.7, '#dcd5f3'], [0.9, 0.3, 0.6, '#d3dff4'], [0.5, 1, 0.75, '#f0dcea']] },
  { name: '午夜', base: '#08090f', blobs: [[0.5, -0.05, 0.75, '#25336e', 0.9], [0.5, 1.1, 0.7, '#1b1340', 0.9]], glow: [0.5, 0.5, 0.6, '#5468ff', 0.55], vignette: 0.5 },
  { name: '石墨', base: '#121214', blobs: [[0.5, -0.1, 0.9, '#2c2c31', 0.9], [0.9, 1, 0.6, '#1d1b19', 0.8]], glow: [0.5, 0.45, 0.6, '#9a9aaa', 0.22], vignette: 0.45 },
  { name: '极光', base: '#060a14', blobs: [[0.1, 0.1, 0.75, '#22408f', 0.85], [0.95, 0.25, 0.7, '#4a2f8f', 0.7], [0.45, 1.05, 0.8, '#155e63', 0.7]], glow: [0.5, 0.5, 0.6, '#7c8cff', 0.26], vignette: 0.35 },
  { name: '余晖', base: '#100b0a', blobs: [[0.1, 1, 0.8, '#9a3a16', 0.9], [0.95, 0.95, 0.7, '#8a2850', 0.85], [0.7, 0, 0.6, '#45225a', 0.8]], glow: [0.5, 0.55, 0.6, '#ff9a5a', 0.26], vignette: 0.4 },
  { name: '深林', base: '#0a110d', blobs: [[0.15, 0.05, 0.75, '#245039', 0.95], [0.9, 0.9, 0.7, '#2b4a3c', 0.9]], glow: [0.5, 0.5, 0.6, '#6fbf92', 0.24], vignette: 0.4 },
];

const RATIOS = { auto: null, '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4, '16:9': 16 / 9, '9:16': 9 / 16, '5:2': 5 / 2 };

// 钛金属边框：亮、中、暗三档，用来画金属光泽和侧键
const IPHONE_COLORS = {
  iphone: ['#6b6b70', '#2f2f33', '#161618'],
};

const RECT_TYPES = new Set(['mask', 'rect', 'ellipse', 'highlight', 'spotlight']);
const LINE_TYPES = new Set(['arrow', 'line']);

const measureCtx = document.createElement('canvas').getContext('2d');
const scratch = [document.createElement('canvas'), document.createElement('canvas')];
const spotLayer = document.createElement('canvas');
let noiseTile = null;

const clampNum = (v, min, max) => Math.min(Math.max(v, min), max);

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function contrastColor(hex) {
  return luminance(hex) > 0.6 ? '#111111' : '#ffffff';
}

function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// 背景主色，用于判断背景深浅（图案、颗粒的颜色随之变化）
function backgroundTone(st) {
  if (st.bg === 'solid') return st.color;
  if (st.bg === 'gradient') return (GRADIENTS[st.gradient] ?? GRADIENTS[0]).colors[0];
  if (st.bg === 'mesh') return (MESHES[st.mesh] ?? MESHES[0]).base;
  return '#808080';
}

// ---------- 图片方向 ----------

// 旋转、翻转后的图片按参数缓存在原图对象上；先旋转，再在结果上水平翻转
function orientedSource(src, rotate, flip) {
  if (!rotate && !flip) return src;
  const key = `${rotate}:${flip}`;
  src.oriented ??= new Map();
  let o = src.oriented.get(key);
  if (!o) {
    const swap = rotate === 90 || rotate === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? src.h : src.w;
    canvas.height = swap ? src.w : src.h;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    if (flip) ctx.scale(-1, 1);
    ctx.rotate(rotate * Math.PI / 180);
    ctx.drawImage(src.img, -src.w / 2, -src.h / 2);
    o = { img: canvas, w: canvas.width, h: canvas.height };
    src.oriented.set(key, o);
  }
  return o;
}

// ---------- 布局 ----------

function frameFamily(kind) {
  if (kind.startsWith('iphone')) return 'iphone';
  if (kind.startsWith('mac')) return 'mac';
  if (kind.startsWith('browser')) return 'browser';
  return kind;
}

// ref 是图片显示尺寸里的最短边；所有图片用同一套外框尺寸，排版才对齐
// border 是用户设的边框粗细（像素），没设时按图片尺寸给个默认值
function frameSpec(kind, ref, border) {
  const family = frameFamily(kind);
  if (family === 'iphone') {
    // 比例参考 iPhone 15 Pro：屏幕圆角约为屏宽的 14%，钛金属边加黑色屏幕边框约 4%
    const rim = Math.max(2, Math.round(ref * 0.011));
    const bezel = Math.max(4, Math.round(ref * 0.03));
    const b = rim + bezel;
    const screenRadius = Math.round(ref * 0.14);
    return { family, t: b, r: b, b, l: b, rim, bezel, screenRadius, radius: screenRadius + b };
  }
  if (family === 'mac' || family === 'browser') {
    const bar = Math.round(family === 'mac' ? clampNum(ref * 0.052, 28, 76) : clampNum(ref * 0.085, 44, 120));
    return { family, t: bar, r: 0, b: 0, l: 0, bar, radius: Math.round(clampNum(ref * 0.018, 8, 24)) };
  }
  if (family === 'glass' || family === 'white' || family === 'black') {
    const pad = border > 0 ? border : Math.round(clampNum(ref * (family === 'glass' ? 0.028 : 0.02), 6, 48));
    return { family, t: pad, r: pad, b: pad, l: pad, pad };
  }
  return { family: 'none', t: 0, r: 0, b: 0, l: 0 };
}

// 每张图的 rect 带有局部坐标到画布坐标的变换：canvas = o + local * s，
// 遮挡和标注存在图片的局部坐标里，布局变化时跟着图片走。
// 排列方向上按顺序紧挨着排；另一个方向按 layout.align 对齐（默认靠上 / 靠左，不自动居中）。
// 每张图还可以有用户拖出来的 offset，叠加在自动位置上；画布按所有图的实际范围算。
function computeGeometry(s, sources) {
  const items = s.images.map((im) => {
    const src = orientedSource(sources.get(im.id), im.rotate, im.flip);
    return { id: im.id, src, crop: im.crop, offset: im.offset, w: src.w - im.crop.l - im.crop.r, h: src.h - im.crop.t - im.crop.b };
  });
  if (!items.length) return null;

  const { mode, fit, gap } = s.layout;
  const align = s.layout.align ?? 'start';
  const horizontal = mode === 'horizontal';
  // fit 为 none 时每张图保持原始像素尺寸，裁掉多少就小多少；否则按最小或最大边统一宽度（纵向、网格）或高度（横向）
  const uniform = fit !== 'none';
  const pick = (values) => (fit === 'max' ? Math.max(...values) : Math.min(...values));
  const side = uniform ? pick(items.map((it) => (horizontal ? it.h : it.w))) : 0;
  const sizes = items.map((it) => {
    if (!uniform) return { w: it.w, h: it.h };
    return horizontal
      ? { w: Math.round(it.w * side / it.h), h: side }
      : { w: side, h: Math.round(it.h * side / it.w) };
  });

  // 外框粗细按原图（未裁剪）的显示尺寸算，裁剪不会让外框跟着变粗变细
  const frameRef = Math.min(...items.map((it, i) => Math.min(it.src.w, it.src.h) * sizes[i].w / it.w));
  let frame = frameSpec(s.style.frame, frameRef, s.style.border);
  const place = (slot, size) => Math.round(align === 'center' ? (slot - size) / 2 : align === 'end' ? slot - size : 0);

  // 按给定的每张外框尺寸排版，返回每张的位置（含用户拖出的 offset）和包围盒
  const arrange = (outer) => {
    const cells = [];
    if (horizontal) {
      const rowH = Math.max(...outer.map((o) => o.h));
      let x = 0;
      for (const o of outer) {
        cells.push({ x, y: place(rowH, o.h) });
        x += o.w + gap;
      }
    } else {
      const cols = mode === 'grid' ? Math.min(s.layout.columns, items.length) : 1;
      const colW = Array.from({ length: cols }, (_, c) => Math.max(...outer.filter((_, i) => i % cols === c).map((o) => o.w)));
      const colX = colW.map((_, c) => colW.slice(0, c).reduce((sum, w) => sum + w + gap, 0));
      let y = 0;
      for (let start = 0; start < items.length; start += cols) {
        const row = outer.slice(start, start + cols);
        const rowH = Math.max(...row.map((o) => o.h));
        row.forEach((o, c) => cells.push({ x: colX[c] + place(colW[c], o.w), y: y + (mode === 'grid' ? place(rowH, o.h) : 0) }));
        y += rowH + gap;
      }
    }
    items.forEach((it, i) => {
      cells[i].x += Math.round(it.offset?.x ?? 0);
      cells[i].y += Math.round(it.offset?.y ?? 0);
    });
    const minX = Math.min(...cells.map((c) => c.x));
    const minY = Math.min(...cells.map((c) => c.y));
    const iw = Math.max(...cells.map((c, i) => c.x + outer[i].w)) - minX;
    const ih = Math.max(...cells.map((c, i) => c.y + outer[i].h)) - minY;
    return { cells, minX, minY, iw, ih };
  };

  // 间距为 0、几张图正好拼成一个完整的矩形时（长截图拼接就是这样），当成一整张图：
  // 外框、圆角、阴影只在整体外面套一次，否则每段各套一个手机壳、各有圆角，接缝处会断开。
  // 尺寸不一留了空缺、或被拖开 / 叠在一起时，仍然各套各的，免得空缺处露出外框底色和阴影
  const bare = sizes.map((z) => ({ w: z.w, h: z.h }));
  let layout = gap === 0 && items.length > 1 ? arrange(bare) : null;
  const filled = layout && Math.abs(bare.reduce((sum, o) => sum + o.w * o.h, 0) - layout.iw * layout.ih) <= layout.iw * layout.ih * 0.002;
  const grouped = Boolean(filled);
  const each = grouped ? { l: 0, r: 0, t: 0, b: 0 } : frame;
  const outer = grouped ? bare : sizes.map((z) => ({ w: z.w + each.l + each.r, h: z.h + each.t + each.b }));
  if (!grouped) layout = arrange(outer);
  const { cells, minX, minY, iw, ih } = layout;
  // 内容范围：所有图（含外框）的包围盒；拖到左上方时整体平移回正，origin 记下排版原点在画布上的位置
  // 整体外框按整张图的短边重新算粗细，外面再包一圈
  if (grouped) frame = frameSpec(s.style.frame, Math.min(iw, ih), s.style.border);
  const gl = grouped ? frame.l : 0;
  const gt = grouped ? frame.t : 0;
  const cw = iw + gl + (grouped ? frame.r : 0);
  const ch = ih + gt + (grouped ? frame.b : 0);
  for (const c of cells) {
    c.x += gl - minX;
    c.y += gt - minY;
  }

  const unit = Math.max(0.2, sizes.reduce((sum, z) => sum + Math.min(z.w, z.h), 0) / sizes.length / 300);
  const st = s.style;
  // 背景关闭时没有画布：不留白、不套比例，图片紧贴边缘
  const bgOn = st.bg !== 'none';
  const padding = bgOn ? st.padding : 0;
  let width = cw + 2 * padding;
  let height = ch + 2 * padding;
  const ratio = bgOn ? RATIOS[st.ratio] : null;
  if (ratio) {
    if (width / height < ratio) width = Math.round(height * ratio);
    else height = Math.round(width / ratio);
  }
  const ox = Math.round((width - cw) / 2);
  const oy = Math.round((height - ch) / 2);

  const rects = new Map();
  items.forEach((it, i) => {
    const c = cells[i];
    const z = sizes[i];
    const scale = z.w / it.w;
    const x = c.x + ox + each.l;
    const y = c.y + oy + each.t;
    rects.set(it.id, {
      id: it.id,
      src: it.src,
      crop: it.crop,
      cw: it.w,
      ch: it.h,
      x,
      y,
      w: z.w,
      h: z.h,
      s: scale,
      ox: x - it.crop.l * scale,
      oy: y - it.crop.t * scale,
      frame: { x: c.x + ox, y: c.y + oy, w: outer[i].w, h: outer[i].h },
    });
  });
  const group = grouped ? { x: ox + gl, y: oy + gt, w: iw, h: ih, frame: { x: ox, y: oy, w: cw, h: ch } } : null;
  return { width, height, unit, frame, group, origin: { x: ox + gl - minX, y: oy + gt - minY }, content: { x: ox, y: oy, w: cw, h: ch }, rects };
}

// extras.bgImage：自定义背景图（已加载的图片对象）
function buildBase(geo, st, extras = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = geo.width;
  canvas.height = geo.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  drawBackground(ctx, geo, st, extras);
  if (geo.group) drawFramedImage(ctx, groupRect(geo), st, geo.frame);
  else for (const r of geo.rects.values()) drawFramedImage(ctx, r, st, geo.frame);
  return canvas;
}

// 紧贴在一起的几张图先拼成一张，再当作一张图套外框
function groupRect(geo) {
  const g = geo.group;
  const img = document.createElement('canvas');
  img.width = Math.max(1, g.w);
  img.height = Math.max(1, g.h);
  const ctx = img.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  for (const r of geo.rects.values()) {
    ctx.drawImage(r.src.img, r.crop.l, r.crop.t, r.cw, r.ch, r.x - g.x, r.y - g.y, r.w, r.h);
  }
  const src = { img, w: g.w, h: g.h };
  return { src, crop: { t: 0, r: 0, b: 0, l: 0 }, cw: g.w, ch: g.h, x: g.x, y: g.y, w: g.w, h: g.h, s: 1, frame: g.frame };
}

function drawBackground(ctx, geo, st, extras) {
  const W = geo.width;
  const H = geo.height;
  if (st.bg === 'solid') {
    ctx.fillStyle = st.color;
    ctx.fillRect(0, 0, W, H);
  } else if (st.bg === 'gradient') {
    const [a, b] = (GRADIENTS[st.gradient] ?? GRADIENTS[0]).colors;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (st.bg === 'mesh') {
    drawMesh(ctx, W, H, MESHES[st.mesh] ?? MESHES[0]);
  } else if (st.bg === 'blur') {
    drawCover(ctx, geo.rects.values().next().value.src, W, H, true);
  } else if (st.bg === 'image' && extras.bgImage) {
    drawCover(ctx, extras.bgImage, W, H, false);
  }
  if (st.bg === 'none') return;
  if (st.pattern !== 'none' && st.bg !== 'blur' && st.bg !== 'image') {
    drawPattern(ctx, W, H, st.pattern, backgroundTone(st), geo.unit);
  }
  if (st.noise) drawNoise(ctx, W, H);
}

function drawMesh(ctx, W, H, mesh) {
  ctx.fillStyle = mesh.base;
  ctx.fillRect(0, 0, W, H);
  const size = Math.max(W, H);
  const blob = ([x, y, r, color, alpha = 1]) => {
    const cx = x * W;
    const cy = y * H;
    const radius = r * size;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, rgba(color, 0.95 * alpha));
    g.addColorStop(0.45, rgba(color, 0.55 * alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  mesh.blobs.forEach(blob);
  // 微光按短边算半径，横竖画布上都落在内容正后方
  if (mesh.glow) {
    const [x, y, r, color, alpha] = mesh.glow;
    const cx = x * W;
    const cy = y * H;
    const radius = r * Math.min(W, H) * 1.6;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(0.5, rgba(color, alpha * 0.4));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (mesh.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, `rgba(0, 0, 0, ${mesh.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

// 铺满画布；blur 为真时大幅模糊，用作“模糊原图”背景
function drawCover(ctx, src, W, H, blur) {
  // 模糊时再放大一些，原图的边缘落在画布外，不会糊出一道道横线
  const scale = Math.max(W / src.w, H / src.h) * (blur ? 1.3 : 1);
  const dw = src.w * scale;
  const dh = src.h * scale;
  ctx.save();
  if (!blur) {
    ctx.drawImage(src.img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.restore();
    return;
  }
  const mid = document.createElement('canvas');
  mid.width = Math.max(8, Math.round(W / 8));
  mid.height = Math.max(8, Math.round(H / 8));
  const m = mid.getContext('2d');
  m.imageSmoothingQuality = 'high';
  m.drawImage(src.img, (W - dw) / 16, (H - dh) / 16, dw / 8, dh / 8);
  // 在八分之一尺寸上做高斯模糊再放大；四周先铺一层平均色，模糊到边缘时不会发黑。
  // 不支持 canvas filter 的浏览器退回到“缩到很小再放大”
  const soft = document.createElement('canvas');
  soft.width = mid.width;
  soft.height = mid.height;
  const s = soft.getContext('2d');
  if ('filter' in s) {
    s.drawImage(mid, 0, 0, soft.width, soft.height);
    s.drawImage(soft, 0, 0, 1, 1);
    const [r0, g0, b0] = s.getImageData(0, 0, 1, 1).data;
    s.fillStyle = `rgb(${r0}, ${g0}, ${b0})`;
    s.fillRect(0, 0, soft.width, soft.height);
    const radius = Math.max(4, Math.max(soft.width, soft.height) / 16);
    s.filter = `blur(${radius}px)`;
    s.drawImage(mid, -radius, -radius, soft.width + radius * 2, soft.height + radius * 2);
    s.filter = 'none';
  } else {
    const small = document.createElement('canvas');
    small.width = Math.max(4, Math.round(W / 160));
    small.height = Math.max(4, Math.round(H / 160));
    const t = small.getContext('2d');
    t.imageSmoothingQuality = 'high';
    t.drawImage(mid, 0, 0, small.width, small.height);
    s.imageSmoothingQuality = 'high';
    s.drawImage(small, 0, 0, soft.width, soft.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(soft, 0, 0, W, H);
  // 压一层暗色并提一点饱和感，让前景更突出
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawNoise(ctx, W, H) {
  if (!noiseTile) {
    noiseTile = document.createElement('canvas');
    noiseTile.width = 160;
    noiseTile.height = 160;
    const n = noiseTile.getContext('2d');
    const img = n.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    n.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(noiseTile, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

const patternLayer = document.createElement('canvas');

// 图案画在单独的图层上，再用径向渐变让它从中间向四周淡出，边缘不显得生硬
function drawPattern(ctx, W, H, kind, tone, unit) {
  const light = contrastColor(tone) === '#ffffff';
  const color = light ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.07)';
  const step = Math.max(12, Math.round(unit * (kind === 'grid' ? 16 : 10)));
  patternLayer.width = W;
  patternLayer.height = H;
  const p = patternLayer.getContext('2d');
  p.fillStyle = color;
  p.strokeStyle = color;
  p.lineWidth = Math.max(1, unit * 0.35);
  p.beginPath();
  if (kind === 'dots') {
    const r = Math.max(1, unit * 0.9);
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) {
        p.moveTo(x + r, y);
        p.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    p.fill();
  } else if (kind === 'grid') {
    // 网格从中心对齐，左右上下对称
    const ox = (W / 2) % step;
    const oy = (H / 2) % step;
    for (let x = ox; x < W; x += step) { p.moveTo(x, 0); p.lineTo(x, H); }
    for (let y = oy; y < H; y += step) { p.moveTo(0, y); p.lineTo(W, y); }
    p.stroke();
  } else if (kind === 'diagonal') {
    for (let d = -H; d < W; d += step) { p.moveTo(d, H); p.lineTo(d + H, 0); }
    p.stroke();
  }
  const fade = p.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
  fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
  p.globalCompositeOperation = 'destination-in';
  p.fillStyle = fade;
  p.fillRect(0, 0, W, H);
  p.globalCompositeOperation = 'source-over';
  ctx.drawImage(patternLayer, 0, 0);
  patternLayer.width = 1;
  patternLayer.height = 1;
}

// 三层叠加的柔和投影：贴近的接触阴影 + 中距离 + 远处弥散，比单层阴影更有真实感。
// 形状画在画布外，只把阴影偏移回来，半透明的外框下面不会透出黑色底
function castShadow(ctx, x, y, w, h, radius, strength) {
  if (strength <= 0) return;
  const far = 100000;
  const layers = [[0.08, 0.16, 0.02], [0.45, 0.16, 0.14], [1.25, 0.14, 0.36]];
  for (const [blur, alpha, offset] of layers) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`;
    ctx.shadowBlur = strength * blur;
    ctx.shadowOffsetX = far;
    ctx.shadowOffsetY = strength * offset;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(x - far, y, w, h, radius);
    ctx.fill();
    ctx.restore();
  }
}

function drawImageClipped(ctx, r, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.clip();
  ctx.drawImage(r.src.img, r.crop.l, r.crop.t, r.cw, r.ch, r.x, r.y, r.w, r.h);
  ctx.restore();
}

function drawFramedImage(ctx, r, st, frame) {
  const f = r.frame;
  // 阴影投在背景画布上；背景关闭时四周透明，没有地方投影
  const shadow = st.bg === 'none' ? 0 : st.shadow;
  switch (frame.family) {
    case 'iphone':
      castShadow(ctx, f.x, f.y, f.w, f.h, frame.radius, shadow);
      drawIphone(ctx, r, frame, IPHONE_COLORS.iphone);
      return;
    case 'mac':
    case 'browser':
      castShadow(ctx, f.x, f.y, f.w, f.h, frame.radius, shadow);
      drawWindow(ctx, r, frame, st.frame.endsWith('dark'), st.title);
      return;
    case 'glass':
    case 'white':
    case 'black': {
      // 内外同心：图片圆角加上边框粗细就是外框圆角，圆角为 0 时内外都是直角
      const inner = Math.min(st.radius, r.w / 2, r.h / 2);
      const outer = inner > 0 ? inner + frame.pad : 0;
      castShadow(ctx, f.x, f.y, f.w, f.h, outer, shadow);
      ctx.beginPath();
      ctx.roundRect(f.x, f.y, f.w, f.h, outer);
      if (frame.family === 'glass') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fill();
        ctx.lineWidth = Math.max(1, frame.pad * 0.06);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.roundRect(f.x + ctx.lineWidth / 2, f.y + ctx.lineWidth / 2, f.w - ctx.lineWidth, f.h - ctx.lineWidth, outer);
        ctx.stroke();
      } else {
        if (frame.family === 'black') {
          // 黑边带一点从上到下的光泽和顶部高光，像磨砂金属相框而不是一块死黑
          const sheen = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
          sheen.addColorStop(0, '#2a2a2e');
          sheen.addColorStop(1, '#141416');
          ctx.fillStyle = sheen;
          ctx.fill();
          ctx.lineWidth = Math.max(1, frame.pad * 0.05);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.beginPath();
          ctx.roundRect(f.x + ctx.lineWidth / 2, f.y + ctx.lineWidth / 2, f.w - ctx.lineWidth, f.h - ctx.lineWidth, outer);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      }
      drawImageClipped(ctx, r, inner);
      // 图片边缘一道极细的描边，截图和边框颜色接近时也有清晰的边界
      ctx.lineWidth = 1;
      ctx.strokeStyle = frame.family === 'black' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';
      ctx.beginPath();
      ctx.roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, inner);
      ctx.stroke();
      return;
    }
    default: {
      const radius = Math.min(st.radius, r.w / 2, r.h / 2);
      castShadow(ctx, r.x, r.y, r.w, r.h, radius, shadow);
      drawImageClipped(ctx, r, radius);
      // 有背景时给图片描一道极细的边：深色背景上像玻璃的高光，浅色背景上收住白色截图的边缘
      if (st.bg !== 'none' && st.bg !== 'blur' && st.bg !== 'image') {
        ctx.lineWidth = Math.max(1, Math.round(r.w / 900));
        ctx.strokeStyle = luminance(backgroundTone(st)) < 0.4 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.07)';
        ctx.beginPath();
        ctx.roundRect(r.x + ctx.lineWidth / 2, r.y + ctx.lineWidth / 2, r.w - ctx.lineWidth, r.h - ctx.lineWidth, radius);
        ctx.stroke();
      }
    }
  }
}

function drawIphone(ctx, r, frame, [light, mid, dark]) {
  const f = r.frame;
  const { rim, screenRadius } = frame;
  const R = frame.radius;

  // 侧键：在机身后面，露出一窄条
  const bw = Math.max(2, rim * 1.1);
  const button = (x, top, len) => {
    const g = ctx.createLinearGradient(x, 0, x + bw, 0);
    g.addColorStop(0, dark);
    g.addColorStop(0.5, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, f.y + f.h * top, bw, f.h * len, bw / 2);
    ctx.fill();
  };
  button(f.x - bw * 0.8, 0.16, 0.034);
  button(f.x - bw * 0.8, 0.225, 0.062);
  button(f.x - bw * 0.8, 0.3, 0.062);
  button(f.x + f.w - bw * 0.2, 0.255, 0.098);

  // 钛金属边框：斜向的金属光泽
  const metal = ctx.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h);
  metal.addColorStop(0, light);
  metal.addColorStop(0.18, mid);
  metal.addColorStop(0.5, dark);
  metal.addColorStop(0.82, mid);
  metal.addColorStop(1, light);
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.roundRect(f.x, f.y, f.w, f.h, R);
  ctx.fill();

  // 边框内沿的高光细线
  const hl = Math.max(0.75, rim * 0.22);
  ctx.lineWidth = hl;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.roundRect(f.x + rim * 0.55, f.y + rim * 0.55, f.w - rim * 1.1, f.h - rim * 1.1, R - rim * 0.55);
  ctx.stroke();

  // 黑色屏幕边框
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.roundRect(f.x + rim, f.y + rim, f.w - 2 * rim, f.h - 2 * rim, R - rim);
  ctx.fill();

  // 屏幕
  drawImageClipped(ctx, r, screenRadius);

  // 灵动岛，比例取自 iPhone 15 Pro（宽约屏宽 32%，高约 9.3%）；横屏截图时手机横放，灵动岛转到左侧
  const side = Math.min(r.w, r.h);
  const landscape = r.w > r.h;
  const len = side * 0.318;
  const thick = side * 0.093;
  const iw = landscape ? thick : len;
  const ih = landscape ? len : thick;
  const ix = landscape ? r.x + side * 0.03 : r.x + (r.w - iw) / 2;
  const iy = landscape ? r.y + (r.h - ih) / 2 : r.y + side * 0.03;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.roundRect(ix, iy, iw, ih, thick / 2);
  ctx.fill();
  // 前置镜头的一点反光
  const lx = landscape ? ix + iw / 2 : ix + iw - thick * 0.58;
  const ly = landscape ? iy + thick * 0.58 : iy + ih / 2;
  const lens = ctx.createRadialGradient(lx - thick * 0.06, ly - thick * 0.06, 0, lx, ly, thick * 0.22);
  lens.addColorStop(0, '#2a3350');
  lens.addColorStop(1, '#07080c');
  ctx.fillStyle = lens;
  ctx.beginPath();
  ctx.arc(lx, ly, thick * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawWindow(ctx, r, frame, dark, title) {
  const f = r.frame;
  const R = frame.radius;
  const bar = frame.bar;
  const browser = frame.family === 'browser';

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(f.x, f.y, f.w, f.h, R);
  ctx.clip();
  const g = ctx.createLinearGradient(0, f.y, 0, f.y + bar);
  g.addColorStop(0, dark ? '#3b3b3e' : '#fbfbfb');
  g.addColorStop(1, dark ? '#2c2c2f' : '#ececee');
  ctx.fillStyle = g;
  ctx.fillRect(f.x, f.y, f.w, bar);
  ctx.drawImage(r.src.img, r.crop.l, r.crop.t, r.cw, r.ch, r.x, r.y, r.w, r.h);
  ctx.fillStyle = dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.1)';
  ctx.fillRect(f.x, f.y + bar - 1, f.w, 1);
  ctx.restore();

  // 红黄绿按钮：直径约为标题栏高度的 43%，间距 71%，与 macOS 一致
  const cy = f.y + bar / 2;
  const unit = browser ? bar * 0.66 : bar;
  const d = unit * 0.43;
  const x0 = f.x + unit * 0.72;
  [['#ff5f57', '#e0443e'], ['#febc2e', '#dea123'], ['#28c840', '#1aab29']].forEach(([fill, edge], i) => {
    ctx.beginPath();
    ctx.arc(x0 + i * unit * 0.71, cy, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(0.5, d * 0.06);
    ctx.strokeStyle = edge;
    ctx.stroke();
  });

  const textColor = dark ? '#c7c7cc' : '#5b5b60';
  if (browser) {
    // 前进后退箭头
    const ax = x0 + unit * 0.71 * 2 + unit * 0.9;
    const as = bar * 0.12;
    ctx.lineWidth = Math.max(1, bar * 0.035);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = textColor;
    ctx.beginPath();
    ctx.moveTo(ax + as * 0.6, cy - as);
    ctx.lineTo(ax - as * 0.4, cy);
    ctx.lineTo(ax + as * 0.6, cy + as);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(ax + as * 2.4, cy - as);
    ctx.lineTo(ax + as * 3.4, cy);
    ctx.lineTo(ax + as * 2.4, cy + as);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 地址栏
    const aw = Math.min(f.w * 0.56, f.w - (ax - f.x) * 2 - bar);
    const ah = bar * 0.54;
    const axl = f.x + (f.w - aw) / 2;
    ctx.fillStyle = dark ? '#1e1e20' : '#ffffff';
    ctx.beginPath();
    ctx.roundRect(axl, cy - ah / 2, aw, ah, ah * 0.32);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    ctx.stroke();
    const text = title || 'x.com';
    const fs = ah * 0.44;
    ctx.font = `500 ${fs}px ${FONT_STACK}`;
    const tw = ctx.measureText(text).width;
    const lockW = fs * 0.75;
    const start = axl + (aw - tw - lockW - fs * 0.4) / 2;
    drawLock(ctx, start + lockW / 2, cy, fs * 0.72, textColor);
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, start + lockW + fs * 0.4, cy + fs * 0.03);
  } else if (title) {
    const fs = bar * 0.36;
    ctx.font = `600 ${fs}px ${FONT_STACK}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, f.x + f.w / 2, cy, f.w - unit * 4);
    ctx.textAlign = 'start';
  }

  // 窗口描边：浅色外框一圈细灰线；深色内侧一圈高光
  ctx.lineWidth = 1;
  ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.16)';
  ctx.beginPath();
  ctx.roundRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1, R);
  ctx.stroke();
}

function drawLock(ctx, cx, cy, size, color) {
  const w = size * 0.62;
  const h = size * 0.48;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.11);
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h * 0.15, w, h, size * 0.08);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - h * 0.15, w * 0.3, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
}

// ---------- 坐标变换 ----------

function mapObject(o, fx, fy, k) {
  const r = { ...o };
  if ('x' in o) { r.x = fx(o.x); r.y = fy(o.y); }
  if ('w' in o) { r.w = o.w * k; r.h = o.h * k; }
  if ('x1' in o) { r.x1 = fx(o.x1); r.y1 = fy(o.y1); r.x2 = fx(o.x2); r.y2 = fy(o.y2); }
  if (o.points) r.points = o.points.map(([x, y]) => [fx(x), fy(y)]);
  for (const key of ['width', 'size', 'strength', 'r']) if (key in o) r[key] = o[key] * k;
  return r;
}

function anchorTransform(geo, anchor) {
  const r = anchor != null ? geo.rects.get(anchor) : null;
  return r ? { ox: r.ox, oy: r.oy, s: r.s } : { ox: 0, oy: 0, s: 1 };
}

function toCanvasObject(geo, o) {
  const t = anchorTransform(geo, o.anchor);
  return mapObject(o, (x) => t.ox + x * t.s, (y) => t.oy + y * t.s, t.s);
}

function toLocalObject(geo, c, anchor) {
  const t = anchorTransform(geo, anchor);
  const o = mapObject(c, (x) => (x - t.ox) / t.s, (y) => (y - t.oy) / t.s, 1 / t.s);
  o.anchor = anchor;
  return o;
}

function anchorAt(geo, p) {
  for (const r of geo.rects.values()) if (insideRect(p, r, 0)) return r.id;
  return null;
}

function intersectRect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w >= 1 && h >= 1 ? { x, y, w, h } : null;
}

// ---------- 对象几何 ----------

function rectFromPoints(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function insideRect(p, r, pad) {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

function distToSegment(p, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / len2)) : 0;
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}

// 文字字体：系统自带字体，Mac 与 Windows 各有对应，缺字时回落到默认无衬线
const TEXT_FONTS = {
  sans: FONT_STACK,
  rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "Yuanti SC", "YouYuan", sans-serif',
  serif: '"Songti SC", STSong, "Noto Serif SC", "Source Han Serif SC", SimSun, serif',
  kai: '"Kaiti SC", STKaiti, KaiTi, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

function fontFamilyOf(o) {
  return TEXT_FONTS[o.font] ?? FONT_STACK;
}

function fontOf(o, scale = 1) {
  return `${o.bold ? 700 : 500} ${o.size * scale}px ${fontFamilyOf(o)}`;
}

function textLayout(o) {
  measureCtx.font = fontOf(o);
  const lines = o.text.split('\n');
  const lh = o.size * 1.3;
  const w = Math.max(o.size * 0.5, ...lines.map((l) => measureCtx.measureText(l).width));
  const h = lines.length * lh;
  const pad = o.style === 'label' ? o.size * 0.4 : o.style === 'outline' ? o.size * 0.12 : 0;
  return { lines, lh, w, h, box: { x: o.x - pad, y: o.y - pad, w: w + 2 * pad, h: h + 2 * pad } };
}

function numberRadius(o) {
  return o.size * 0.85;
}

function objectBounds(o) {
  if (RECT_TYPES.has(o.type)) return { x: o.x, y: o.y, w: o.w, h: o.h };
  if (o.type === 'text') return textLayout(o).box;
  if (o.type === 'number' || o.type === 'magnifier' || o.type === 'sticker') {
    const r = o.type === 'number' ? numberRadius(o) : o.type === 'magnifier' ? o.r : o.size * 0.62;
    return { x: o.x - r, y: o.y - r, w: 2 * r, h: 2 * r };
  }
  const xs = LINE_TYPES.has(o.type) ? [o.x1, o.x2] : o.points.map((p) => p[0]);
  const ys = LINE_TYPES.has(o.type) ? [o.y1, o.y2] : o.points.map((p) => p[1]);
  const pad = o.width / 2;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

function centerOf(o) {
  const b = objectBounds(o);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

// loose：框类按整个内部命中；否则只命中边框，方便在框里继续画箭头
function hitObject(o, p, tol, loose) {
  switch (o.type) {
    case 'mask':
    case 'highlight':
    case 'sticker':
      return insideRect(p, objectBounds(o), tol);
    case 'rect':
    case 'spotlight': {
      const t = tol + (o.width ?? 0) / 2;
      return insideRect(p, o, t) && (loose || !insideRect(p, o, -t));
    }
    case 'ellipse': {
      const t = tol + o.width / 2;
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const outer = ((p.x - cx) / (o.w / 2 + t)) ** 2 + ((p.y - cy) / (o.h / 2 + t)) ** 2 <= 1;
      if (!outer || loose) return outer;
      const rx = o.w / 2 - t;
      const ry = o.h / 2 - t;
      return rx <= 0 || ry <= 0 || ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 >= 1;
    }
    case 'arrow':
    case 'line':
      return distToSegment(p, o.x1, o.y1, o.x2, o.y2) <= tol + o.width / 2;
    case 'pen':
      return o.points.some((pt, i) => i > 0
        && distToSegment(p, o.points[i - 1][0], o.points[i - 1][1], pt[0], pt[1]) <= tol + o.width / 2);
    case 'text':
      return insideRect(p, textLayout(o).box, tol);
    case 'number':
      return Math.hypot(p.x - o.x, p.y - o.y) <= numberRadius(o) + tol;
    case 'magnifier':
      return Math.hypot(p.x - o.x, p.y - o.y) <= o.r + tol;
    default:
      return false;
  }
}

function handlesOf(o) {
  if (RECT_TYPES.has(o.type)) {
    return [
      { name: 'nw', x: o.x, y: o.y },
      { name: 'ne', x: o.x + o.w, y: o.y },
      { name: 'sw', x: o.x, y: o.y + o.h },
      { name: 'se', x: o.x + o.w, y: o.y + o.h },
    ];
  }
  if (LINE_TYPES.has(o.type)) return [{ name: 'p1', x: o.x1, y: o.y1 }, { name: 'p2', x: o.x2, y: o.y2 }];
  // 贴纸、放大镜、序号、文字：四角手柄等比缩放
  if (SCALE_TYPES.has(o.type)) {
    const b = objectBounds(o);
    return [
      { name: 'snw', x: b.x, y: b.y },
      { name: 'sne', x: b.x + b.w, y: b.y },
      { name: 'ssw', x: b.x, y: b.y + b.h },
      { name: 'sse', x: b.x + b.w, y: b.y + b.h },
    ];
  }
  return [];
}

const SCALE_TYPES = new Set(['sticker', 'magnifier', 'number', 'text']);
const MIN_SCALE_SIZE = 4;

// 以对角（文字）或中心（其余）为基准，按鼠标到基准点的距离比例缩放
function scaleObject(o, handle, p) {
  const b = objectBounds(o);
  const corner = { x: handle.includes('w') ? b.x : b.x + b.w, y: handle.includes('n') ? b.y : b.y + b.h };
  const anchor = o.type === 'text'
    ? { x: handle.includes('w') ? b.x + b.w : b.x, y: handle.includes('n') ? b.y + b.h : b.y }
    : { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const d0 = Math.hypot(corner.x - anchor.x, corner.y - anchor.y);
  if (d0 < 1e-6) return o;
  const key = o.type === 'magnifier' ? 'r' : 'size';
  const k = Math.max(MIN_SCALE_SIZE / o[key], Math.hypot(p.x - anchor.x, p.y - anchor.y) / d0);
  const next = { ...o, [key]: o[key] * k };
  if (o.type === 'text') {
    next.x = anchor.x + (o.x - anchor.x) * k;
    next.y = anchor.y + (o.y - anchor.y) * k;
  }
  return next;
}

function moveObject(o, dx, dy) {
  return mapObject(o, (x) => x + dx, (y) => y + dy, 1);
}

function resizeObject(o, handle, p) {
  if (handle === 'p1') return { ...o, x1: p.x, y1: p.y };
  if (handle === 'p2') return { ...o, x2: p.x, y2: p.y };
  if (SCALE_TYPES.has(o.type)) return scaleObject(o, handle, p);
  const fixed = { x: handle.includes('w') ? o.x + o.w : o.x, y: handle.includes('n') ? o.y + o.h : o.y };
  return { ...o, ...rectFromPoints(fixed, p) };
}

// ---------- 对象绘制 ----------

// sample：已打好遮挡的画面，放大镜从这里取样，不会把遮挡下的内容放大出来
function drawObject(ctx, o, base, sample) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  ctx.lineWidth = o.width ?? 1;
  switch (o.type) {
    case 'mask':
      drawMask(ctx, o, base);
      break;
    case 'rect':
      ctx.beginPath();
      ctx.roundRect(o.x, o.y, o.w, o.h, o.width);
      ctx.stroke();
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'highlight':
      ctx.globalAlpha = 0.35;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      break;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y1);
      ctx.lineTo(o.x2, o.y2);
      ctx.stroke();
      break;
    case 'arrow':
      drawArrow(ctx, o);
      break;
    case 'pen':
      drawPen(ctx, o);
      break;
    case 'text':
      drawText(ctx, o);
      break;
    case 'number':
      drawNumber(ctx, o);
      break;
    case 'magnifier':
      drawMagnifier(ctx, o, sample ?? base);
      break;
    case 'sticker':
      ctx.font = `${o.size}px ${EMOJI_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.char, o.x, o.y);
      break;
  }
  ctx.restore();
}

// 箭头：箭身从细到粗收向箭头，箭头略带内凹，比等宽直线更有手绘标注的质感
function drawArrow(ctx, o) {
  const dx = o.x2 - o.x1;
  const dy = o.y2 - o.y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const head = Math.min(len * 0.5, Math.max(o.width * 5, 14));
  const headW = head * 0.62;
  const baseX = o.x2 - ux * head;
  const baseY = o.y2 - uy * head;
  const tail = o.width * 0.35;
  const neck = o.width * 0.75;
  ctx.beginPath();
  ctx.moveTo(o.x1 + nx * tail, o.y1 + ny * tail);
  ctx.lineTo(baseX + ux * head * 0.25 + nx * neck, baseY + uy * head * 0.25 + ny * neck);
  ctx.lineTo(baseX + nx * headW, baseY + ny * headW);
  ctx.lineTo(o.x2, o.y2);
  ctx.lineTo(baseX - nx * headW, baseY - ny * headW);
  ctx.lineTo(baseX + ux * head * 0.25 - nx * neck, baseY + uy * head * 0.25 - ny * neck);
  ctx.lineTo(o.x1 - nx * tail, o.y1 - ny * tail);
  ctx.closePath();
  ctx.lineWidth = Math.max(1, o.width * 0.3);
  ctx.fill();
  ctx.stroke();
}

function drawPen(ctx, o) {
  const pts = o.points;
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  ctx.stroke();
}

function drawText(ctx, o) {
  const L = textLayout(o);
  ctx.font = fontOf(o);
  ctx.textBaseline = 'middle';
  if (o.style === 'label') {
    ctx.beginPath();
    ctx.roundRect(L.box.x, L.box.y, L.box.w, L.box.h, o.size * 0.3);
    ctx.fill();
  }
  const textColor = o.style === 'label' ? contrastColor(o.color) : o.color;
  const k = { center: 0.5, right: 1 }[o.align] ?? 0;
  L.lines.forEach((line, i) => {
    const y = o.y + i * L.lh + L.lh / 2;
    const x = o.x + (L.w - measureCtx.measureText(line).width) * k;
    if (o.style === 'outline') {
      ctx.lineWidth = o.size * 0.2;
      ctx.strokeStyle = contrastColor(o.color);
      ctx.strokeText(line, x, y);
    }
    if (o.style === 'shadow') {
      // 柔和投影：浅色字压在照片上也看得清
      ctx.shadowColor = contrastColor(o.color) === '#ffffff' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = o.size * 0.35;
      ctx.shadowOffsetY = o.size * 0.06;
    }
    ctx.fillStyle = textColor;
    ctx.fillText(line, x, y);
    ctx.shadowColor = 'transparent';
  });
}

function drawNumber(ctx, o) {
  const r = numberRadius(o);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = r * 0.35;
  ctx.shadowOffsetY = r * 0.08;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = o.size * 0.12;
  ctx.strokeStyle = contrastColor(o.color);
  ctx.stroke();
  ctx.fillStyle = contrastColor(o.color);
  ctx.font = `700 ${o.size}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(o.n), o.x, o.y + o.size * 0.04);
}

function drawMagnifier(ctx, o, sample) {
  const src = (2 * o.r) / o.zoom;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = o.r * 0.25;
  ctx.shadowOffsetY = o.r * 0.06;
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save();
  ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sample, o.x - src / 2, o.y - src / 2, src, src, o.x - o.r, o.y - o.r, 2 * o.r, 2 * o.r);
  ctx.restore();
  ctx.lineWidth = Math.max(2, o.r * 0.05);
  ctx.stroke();
}

// 多个聚光区域合成一层：区域外统一变暗，重叠处不会叠加变黑
function drawSpotlights(ctx, spots, W, H) {
  spotLayer.width = W;
  spotLayer.height = H;
  const s = spotLayer.getContext('2d');
  s.fillStyle = 'rgba(0, 0, 0, 0.55)';
  s.fillRect(0, 0, W, H);
  s.globalCompositeOperation = 'destination-out';
  for (const o of spots) {
    s.beginPath();
    s.roundRect(o.x, o.y, o.w, o.h, Math.min(o.w, o.h) * 0.08);
    s.fill();
  }
  ctx.drawImage(spotLayer, 0, 0);
}

function drawMask(ctx, o, base) {
  // 向外取整，边缘不留半透明像素
  const x = Math.max(0, Math.floor(o.x));
  const y = Math.max(0, Math.floor(o.y));
  const w = Math.min(base.width, Math.ceil(o.x + o.w)) - x;
  const h = Math.min(base.height, Math.ceil(o.y + o.h)) - y;
  if (w < 1 || h < 1) return;
  if (o.mode === 'solid') {
    ctx.fillRect(x, y, w, h);
    return;
  }
  // 先缩小到每 strength 像素一个采样，再放大回去：马赛克用最近邻，模糊用平滑插值。
  // 两者保留的信息量相同，都只取决于 strength
  const factor = Math.max(STRENGTH_MIN, o.strength);
  const sw = Math.max(1, Math.ceil(w / factor));
  const sh = Math.max(1, Math.ceil(h / factor));
  const small = downscale(base, { x, y, w, h }, sw, sh);
  ctx.imageSmoothingEnabled = o.mode === 'blur';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, sw, sh, x, y, w, h);
}

// 一次缩小太多倍时浏览器只取个别像素，色块会忽明忽暗；逐级减半才能得到区域平均色
function downscale(source, rect, sw, sh) {
  let from = source;
  let { x: fx, y: fy, w: fw, h: fh } = rect;
  let i = 0;
  do {
    const tw = Math.max(sw, Math.ceil(fw / 2));
    const th = Math.max(sh, Math.ceil(fh / 2));
    const to = scratch[i % 2];
    to.width = tw;
    to.height = th;
    const c = to.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(from, fx, fy, fw, fh, 0, 0, tw, th);
    from = to;
    fx = 0;
    fy = 0;
    fw = tw;
    fh = th;
    i++;
  } while (fw > sw || fh > sh);
  return from;
}

function drawWatermark(ctx, geo, wm) {
  const text = wm.text.trim();
  if (!wm.enabled || !text) return;
  const W = geo.width;
  const H = geo.height;
  const size = wm.size * geo.unit;
  ctx.save();
  ctx.font = `600 ${size}px ${FONT_STACK}`;
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width;
  const [v, h] = wm.position;
  const m = size;
  const x = h === 'l' ? m : h === 'r' ? W - m - w : (W - w) / 2;
  const y = v === 't' ? m + size / 2 : v === 'b' ? H - m - size / 2 : H / 2;
  // 自动颜色：看水印所在区域（平铺时看整张图）的明暗，选黑或白
  let color = wm.color;
  if (color === 'auto') {
    const area = wm.position === 'tile' ? [0, 0, W, H] : [x, y - size / 2, w, size];
    color = regionLuminance(ctx, ...area) > 0.6 ? '#111111' : '#ffffff';
  }
  ctx.globalAlpha = wm.opacity;
  ctx.fillStyle = color;
  if (wm.position === 'tile') {
    // 密度 1～10：数值越大，文字之间的空隙越小
    const gapK = 9 - wm.density * 0.8;
    const stepX = w + size * gapK;
    const stepY = size * (1.4 + gapK * 0.7);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(wm.angle * Math.PI / 180);
    const R = Math.hypot(W, H) / 2 + stepX;
    let row = 0;
    for (let y = -R; y <= R; y += stepY, row++) {
      for (let x = -R - (row % 2) * stepX / 2; x <= R; x += stepX) ctx.fillText(text, x, y);
    }
  } else {
    // position 取 tl / tr / bl / br / cc，第一位是纵向，第二位是横向。
    // 细描边保证在任何背景上都清晰可读，不用模糊阴影
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.strokeStyle = contrastColor(color) === '#111111' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

// 区域平均亮度（0～1），先缩到小图再取像素，避免读取大面积数据
const lumaCanvas = document.createElement('canvas');
function regionLuminance(ctx, x, y, w, h) {
  lumaCanvas.width = 16;
  lumaCanvas.height = 16;
  const l = lumaCanvas.getContext('2d', { willReadFrequently: true });
  l.drawImage(ctx.canvas, Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h), 0, 0, 16, 16);
  const d = l.getImageData(0, 0, 16, 16).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * (d[i + 3] / 255) + 255 * (1 - d[i + 3] / 255);
  return sum / (256 * 255);
}
