/* 2D-рендер вокселей: модель рисуется кодом в спрайт (вид 3/4 сверху), спрайты кэшируются.
   dir: 0 - юг (лицом к игроку), 1 - запад, 2 - север, 3 - восток. */
(function (g) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const VM = isNode ? require('./voxel-models.js') : g.VoxelModels;

  const TOP = 0.6;                 // высота верхней грани относительно фронтальной
  const SW = [0, 1, 0, -1];        // цикл шага
  const OUTLINE = '#0b0a14';
  let makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const cache = new Map();

  function animOffset(anim, f, pose) {
    if (pose === 'attack') {
      if (anim === 'armR') return [[0, -1, 4], [0, 3, 1], [0, 1, 0]][f] || [0, 0, 0];
      if (anim === 'armL') return [0, 0, 0];
    }
    switch (anim) {
      case 'legL': return [0, SW[f & 3], 0];
      case 'legR': return [0, -SW[f & 3], 0];
      case 'armL': return [0, -SW[f & 3], 0];
      case 'armR': return [0, SW[f & 3], 0];
      case 'wingL': case 'wingR': return [0, 0, 2 * SW[f & 3]];
      default: return [0, 0, 0];
    }
  }

  // поворот индекса клетки на r * 90° (r=1: лицом на запад)
  function rot(x, y, r) {
    switch (r & 3) {
      case 0: return [x, y];
      case 1: return [-y - 1, x];
      case 2: return [-x - 1, -y - 1];
      default: return [y, -x - 1];
    }
  }
  const key = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  const shade = (rgb, k) => 'rgb(' + Math.min(255, rgb[0] * k | 0) + ',' + Math.min(255, rgb[1] * k | 0) + ',' + Math.min(255, rgb[2] * k | 0) + ')';

  function build(id, dir, frame, pose, s) {
    const model = VM.MODELS[id];
    const grid = new Map();
    for (const name in model.parts) {
      const part = model.parts[name];
      const off = animOffset(part.anim, frame, pose);
      for (const v of VM.expandPart(part)) {
        const p = rot(v[0] + off[0], v[1] + off[1], dir), z = v[2] + off[2];
        grid.set(key(p[0], p[1], z), [p[0], p[1], z, v[3], v[4], v[5]]);
      }
    }
    const list = Array.from(grid.values()).sort((a, b) => (a[1] - b[1]) || (a[2] - b[2]) || (a[0] - b[0]));
    const sx = x => Math.round(x * s);
    const sy = (y, z) => Math.round(y * s * TOP - z * s);

    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const v of list) {
      minX = Math.min(minX, sx(v[0])); maxX = Math.max(maxX, sx(v[0] + 1));
      minY = Math.min(minY, sy(v[1], v[2] + 1)); maxY = Math.max(maxY, sy(v[1] + 1, v[2]));
    }
    const pad = 2, w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
    const ax = -minX + pad, ay = -minY + pad;
    const main = makeCanvas(w, h), c = main.getContext('2d');
    for (const v of list) {
      const x0 = sx(v[0]) + ax, x1 = sx(v[0] + 1) + ax, rgb = [v[3], v[4], v[5]];
      const yt = sy(v[1], v[2] + 1) + ay, ym = sy(v[1] + 1, v[2] + 1) + ay, yb = sy(v[1] + 1, v[2]) + ay;
      if (!grid.has(key(v[0], v[1], v[2] + 1))) { c.fillStyle = shade(rgb, 1.16); c.fillRect(x0, yt, x1 - x0, ym - yt); }
      if (!grid.has(key(v[0], v[1] + 1, v[2]))) { c.fillStyle = shade(rgb, 0.8); c.fillRect(x0, ym, x1 - x0, yb - ym); }
    }
    // контур
    const tint = makeCanvas(w, h), tc = tint.getContext('2d');
    tc.drawImage(main, 0, 0);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = OUTLINE; tc.fillRect(0, 0, w, h);
    const out = makeCanvas(w, h), oc = out.getContext('2d');
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(d => oc.drawImage(tint, d[0], d[1]));
    oc.drawImage(main, 0, 0);
    return { canvas: out, ax, ay, w, h, flash: null };
  }

  function getSprite(id, dir, frame, pose, s) {
    const k = id + '|' + dir + '|' + frame + '|' + pose + '|' + s;
    let spr = cache.get(k);
    if (!spr) { spr = build(id, dir, frame, pose, s); cache.set(k, spr); }
    return spr;
  }

  function flashOf(spr) {
    if (!spr.flash) {
      const f = makeCanvas(spr.w, spr.h), fc = f.getContext('2d');
      fc.drawImage(spr.canvas, 0, 0);
      fc.globalCompositeOperation = 'source-in';
      fc.fillStyle = '#ffffff'; fc.fillRect(0, 0, spr.w, spr.h);
      spr.flash = f;
    }
    return spr.flash;
  }

  /* Рисует модель, (x, y) - точка на земле под центром модели.
     o: { dir, frame, pose, s, shadow, flash(0..1), sx, sy, alpha } */
  function draw(ctx, id, x, y, o) {
    o = o || {};
    const model = VM.MODELS[id];
    const s = Math.round((o.s || 3) * (model.size || 1) * 100) / 100;
    const spr = getSprite(id, o.dir | 0, o.frame | 0, o.pose || '', s);
    const px = Math.round(x), py = Math.round(y);
    if (o.shadow !== false) {
      const r = (model.shadowR || 6) * s * 0.9;
      ctx.save();
      ctx.globalAlpha = 0.35 * (o.alpha == null ? 1 : o.alpha);
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    const lift = (model.hover || 0) * s;
    ctx.save();
    ctx.translate(px, py - lift);
    if (o.sx || o.sy) ctx.scale(o.sx || 1, o.sy || 1);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.drawImage(spr.canvas, -spr.ax, -spr.ay);
    if (o.flash > 0) {
      ctx.globalAlpha = Math.min(1, o.flash) * 0.75 * (o.alpha == null ? 1 : o.alpha);
      ctx.drawImage(flashOf(spr), -spr.ax, -spr.ay);
    }
    ctx.restore();
  }

  const api = {
    TOP, draw, getSprite,
    setCanvasFactory(fn) { makeCanvas = fn; cache.clear(); },
    heightPx(id, s) { const m = VM.MODELS[id]; return m.h * (s || 3) * (m.size || 1); }
  };
  if (isNode) module.exports = api; else g.VoxelSprites = api;
})(typeof self !== 'undefined' ? self : globalThis);
