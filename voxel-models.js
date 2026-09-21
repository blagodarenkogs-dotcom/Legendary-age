/* Воксельные модели: персонажи, монстры, декорации.
   Модель = набор частей (parts), часть = набор боксов [x, y, z, ширина, глубина, высота, цвет].
   Оси: x - вправо, y - ВПЕРЁД (лицом к камере), z - вверх. Один воксель = 1 единица.
   Эти же модели использует и 2D-версия (voxel2d.js), и 3D-версия (game3d.js). */
(function (g) {
  'use strict';

  const B = (x, y, z, w, d, h, c) => [x, y, z, w, d, h, c];

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Эллипсоид из случайно окрашенных вокселей (кроны деревьев, камни, кусты)
  function blob(cx, cy, cz, rx, ry, rz, cols, seed) {
    const r = mulberry(seed), out = [];
    for (let x = -rx; x <= rx; x++) for (let y = -ry; y <= ry; y++) for (let z = -rz; z <= rz; z++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz);
      if (d <= 1 && (d < 0.7 || r() < 0.85)) out.push(B(cx + x, cy + y, cz + z, 1, 1, 1, cols[Math.floor(r() * cols.length)]));
    }
    return out;
  }

  // ---------- Гуманоид ----------
  const HUM = { skin: '#f0c090', hair: '#4a2e1a', eye: '#161624', shirt: '#4a6fa5', sleeve: null, pants: '#3b3b4f', boots: '#2a1f18', belt: '#5a3d22', gloves: null };

  function humanoid(o, extra) {
    o = Object.assign({}, HUM, o);
    const head = [B(-3, -3, 12, 6, 6, 6, o.skin)];
    if (o.hair) {
      head.push(B(-3, -3, 16, 6, 6, 2, o.hair), B(-3, -3, 12, 6, 2, 4, o.hair),
        B(-3, -1, 14, 1, 3, 2, o.hair), B(2, -1, 14, 1, 3, 2, o.hair), B(-3, 2, 15, 6, 1, 1, o.hair));
    }
    head.push(B(-2, 2, 14, 1, 1, 1, o.eye), B(1, 2, 14, 1, 1, 1, o.eye));
    const sleeve = o.sleeve || o.shirt, hand = o.gloves || o.skin;
    const P = {
      legL: { anim: 'legL', pivot: [-1.5, 0.5, 6], boxes: [B(-3, -1, 2, 3, 3, 4, o.pants), B(-3, -1, 0, 3, 4, 2, o.boots)] },
      legR: { anim: 'legR', pivot: [1.5, 0.5, 6], boxes: [B(0, -1, 2, 3, 3, 4, o.pants), B(0, -1, 0, 3, 4, 2, o.boots)] },
      torso: { anim: null, pivot: [0, 0, 9], boxes: [B(-3, -2, 6, 6, 4, 1, o.belt), B(-3, -2, 7, 6, 4, 5, o.shirt)] },
      head: { anim: 'head', pivot: [0, 0, 12], boxes: head },
      armL: { anim: 'armL', pivot: [-4, 0.5, 12], boxes: [B(-5, -1, 8, 2, 3, 4, sleeve), B(-5, -1, 6, 2, 3, 2, hand)] },
      armR: { anim: 'armR', pivot: [4, 0.5, 12], boxes: [B(3, -1, 8, 2, 3, 4, sleeve), B(3, -1, 6, 2, 3, 2, hand)] }
    };
    if (extra) extra(P);
    return { parts: P, size: 1, shadowR: 6 };
  }

  const M = {};
    // ---------- Монстры ----------
  M.slime = {
    size: 1, shadowR: 7, glow: { c: '#39ff88', r: 42, x: 0, y: 0, z: 3 },
    parts: {
      body: {
        anim: null, pivot: [0, 0, 0], boxes: [
          B(-6, -5, 0, 12, 10, 2, '#33d152'), B(-5, -4, 2, 10, 8, 3, '#4df06a'), B(-4, -3, 5, 8, 6, 2, '#66ff85'), B(-2, -2, 7, 4, 4, 1, '#8dffa3'),
          B(-3, -2, 7, 1, 1, 1, '#eafff0'),
          B(-3, 3, 3, 2, 1, 2, '#0b2010'), B(1, 3, 3, 2, 1, 2, '#0b2010'), B(-3, 3, 4, 1, 1, 1, '#ffffff'), B(1, 3, 4, 1, 1, 1, '#ffffff'), B(-1, 3, 2, 2, 1, 1, '#0b2010')
        ]
      }
    }
  };

  M.orc = humanoid({
    skin: '#5c8a3a', hair: null, eye: '#ff3b3b', shirt: '#6b4a2b', sleeve: '#5c8a3a', pants: '#4a3728', boots: '#2a1c14', belt: '#8a6a3a', gloves: '#5c8a3a'
  }, P => {
    P.head.boxes.push(B(-1, -3, 18, 2, 6, 2, '#161616'), B(-2, 3, 12, 1, 1, 2, '#f4f0e0'), B(1, 3, 12, 1, 1, 2, '#f4f0e0'), B(-3, 2, 15, 6, 1, 1, '#3d5c26'));
    P.torso.boxes.push(B(-2, 2, 2, 4, 1, 5, '#8b2a2a'));
    P.armL.boxes.push(B(-6, -1, 11, 2, 2, 2, '#8a8a92'));
    P.armR.boxes.push(B(4, -1, 11, 2, 2, 2, '#8a8a92'), B(4, 2, 4, 1, 1, 4, '#5a3a1e'), B(3, 2, 8, 3, 3, 6, '#7a5230'), B(5, 3, 10, 1, 1, 1, '#c0c0c8'), B(3, 3, 12, 1, 1, 1, '#c0c0c8'));
  });
  M.orc.size = 4 / 3; M.orc.shadowR = 7;

  M.skeleton = humanoid({
    skin: '#e8e4d0', hair: null, eye: '#ff3030', shirt: '#d8d4c0', sleeve: '#cfcab6', pants: '#cfcab6', boots: '#b8b39c', belt: '#8a8a7a', gloves: '#e8e4d0'
  }, P => {
    P.head.boxes.push(B(-3, 2, 13, 2, 1, 2, '#0a0a0a'), B(1, 2, 13, 2, 1, 2, '#0a0a0a'), B(-2, 2, 14, 1, 1, 1, '#ff3030'), B(1, 2, 14, 1, 1, 1, '#ff3030'),
      B(-2, 2, 12, 4, 1, 1, '#f4f0e0'), B(-1, 2, 12, 1, 1, 1, '#222222'), B(1, 2, 12, 1, 1, 1, '#222222'));
    P.torso.boxes.push(B(-2, 1, 8, 4, 1, 1, '#3a3a32'), B(-2, 1, 10, 4, 1, 1, '#3a3a32'));
    P.armR.boxes.push(B(4, 2, 7, 1, 1, 9, '#8c7b6b'), B(3, 2, 7, 3, 1, 1, '#5a4a3a'));
  });

  M.bat = {
    size: 1, hover: 8, shadowR: 4,
    parts: {
      body: { anim: null, pivot: [0, 0, 0], boxes: [B(-2, -1, 0, 4, 3, 3, '#3b2a5a'), B(-2, 0, 3, 1, 1, 1, '#3b2a5a'), B(1, 0, 3, 1, 1, 1, '#3b2a5a'),
        B(-1, 1, 1, 1, 1, 1, '#ff3b6b'), B(0, 1, 1, 1, 1, 1, '#ff3b6b'), B(-1, 1, 0, 1, 1, 1, '#ffffff')] },
      wingL: { anim: 'wingL', pivot: [-2, 0, 2], boxes: [B(-8, -1, 1, 6, 3, 1, '#5a3f8a'), B(-10, 0, 0, 2, 2, 1, '#4a3270')] },
      wingR: { anim: 'wingR', pivot: [2, 0, 2], boxes: [B(2, -1, 1, 6, 3, 1, '#5a3f8a'), B(8, 0, 0, 2, 2, 1, '#4a3270')] }
    }
  };

  // ---------- Декорации ----------
  const prop = (boxes, o) => Object.assign({ size: 1, shadowR: 6, parts: { body: { anim: null, pivot: [0, 0, 0], boxes } } }, o || {});

  const GREEN_TOWN = ['#2f9e4f', '#3cb35f', '#28884a', '#4ac96f'];
  const GREEN_FOREST = ['#1f7a3a', '#26904a', '#1a6a32', '#2fa055'];
  const trunk = [B(-1, -1, 0, 3, 3, 9, '#5a3a1e'), B(0, -1, 0, 1, 3, 4, '#6b4626')];

  M.tree_a = prop(trunk.concat(blob(0, 0, 14, 8, 8, 6, GREEN_TOWN, 11), blob(-4, 1, 11, 5, 5, 4, GREEN_TOWN, 12), blob(4, -1, 12, 5, 5, 4, GREEN_TOWN, 13)), { shadowR: 10 });
  M.tree_b = prop(trunk.concat(blob(0, 0, 15, 7, 7, 7, GREEN_FOREST, 21), blob(3, 2, 11, 5, 5, 4, GREEN_FOREST, 22)), { shadowR: 9 });

  const pineBoxes = [B(-1, -1, 0, 3, 3, 6, '#4a2f1a')];
  [[5, 7], [7, 6], [9, 5], [11, 4], [13, 3], [15, 2]].forEach(([z, w], i) => pineBoxes.push(B(-w, -w, z, 2 * w, 2 * w, 2, i % 2 ? '#15502e' : '#12452a')));
  pineBoxes.push(B(-1, -1, 17, 2, 2, 3, '#1a5c34'));
  M.pine = prop(pineBoxes, { shadowR: 9 });

  M.rock = prop(blob(0, 0, 3, 6, 5, 3, ['#6b7280', '#5a6070', '#7b8392'], 31), { shadowR: 7 });
  M.rock_dark = prop(blob(0, 0, 4, 7, 6, 4, ['#3a3550', '#2f2b44', '#453f60'], 32), { shadowR: 8 });
  M.bush = prop(blob(0, 0, 3, 5, 4, 3, GREEN_TOWN, 41), { shadowR: 6 });
  M.stump = prop([B(-3, -3, 0, 6, 6, 4, '#6b4423'), B(-2, -2, 4, 4, 4, 1, '#8b5a2b')]);

  function house(w2, d2, h, wall, roof, doorX) {
    const b = [B(-w2, -d2, 0, 2 * w2, 2 * d2, h, wall)];
    b.push(B(-w2, d2 - 1, 0, 1, 1, h, '#5a3a1e'), B(w2 - 1, d2 - 1, 0, 1, 1, h, '#5a3a1e'));
    b.push(B(doorX - 3, d2 - 1, 0, 6, 1, 8, '#4a2f1a'), B(doorX - 2, d2 - 1, 0, 4, 1, 7, '#6b4426'));
    b.push(B(-w2 + 3, d2 - 1, 5, 4, 1, 4, '#ffd166'), B(w2 - 7, d2 - 1, 5, 4, 1, 4, '#ffd166'));
    for (let i = 0; ; i++) {
      const x0 = -w2 - 2 + 2 * i, y0 = -d2 - 2 + 2 * i, ww = 2 * (w2 + 2) - 4 * i, dd = 2 * (d2 + 2) - 4 * i;
      if (ww < 2 || dd < 2) break;
      b.push(B(x0, y0, h + 2 * i, ww, dd, 2, i % 2 ? roof[1] : roof[0]));
    }
    b.push(B(w2 - 6, -d2 + 3, h + 4, 4, 4, 6, '#6b6b78'));
    return prop(b, { shadowR: w2 * 0.8, glow: { c: '#ffd166', r: 90, x: 0, y: d2 + 3, z: 7 } });
  }
  M.house1 = house(14, 9, 12, '#b39a78', ['#a63d40', '#8f3336'], 0);
  M.house2 = house(11, 8, 15, '#9aa3b8', ['#3b5bb5', '#324d9c'], 2);

  M.lamp = prop([B(-1, -1, 0, 3, 3, 2, '#3a3a4a'), B(0, 0, 2, 1, 1, 12, '#2a2a3a'), B(-2, -2, 14, 5, 5, 4, '#00e5ff'), B(-3, -3, 18, 7, 7, 1, '#2a2a3a')],
    { shadowR: 4, glow: { c: '#00e5ff', r: 120, x: 0, y: 0, z: 16 } });

  M.board = prop([B(-8, -1, 0, 2, 2, 15, '#5a3a1e'), B(6, -1, 0, 2, 2, 15, '#5a3a1e'), B(-9, 1, 6, 18, 1, 10, '#7a5230'),
    B(-10, -1, 16, 20, 4, 1, '#3a2a1c'), B(-7, 2, 9, 4, 1, 5, '#f5f0dc'), B(-2, 2, 8, 4, 1, 6, '#ffe9a8'), B(3, 2, 10, 4, 1, 4, '#f5f0dc'),
    B(-6, 2, 13, 1, 1, 1, '#ff3b3b'), B(-1, 2, 13, 1, 1, 1, '#ff3b3b'), B(4, 2, 13, 1, 1, 1, '#ff3b3b')],
  { shadowR: 10, glow: { c: '#ffd166', r: 60, x: 0, y: 3, z: 10 } });

  M.barrel = prop([B(-3, -3, 0, 6, 6, 7, '#7a4b25'), B(-3, -3, 2, 6, 6, 1, '#3a3a4a'), B(-3, -3, 5, 6, 6, 1, '#3a3a4a'), B(-2, -2, 7, 4, 4, 1, '#5a3a1e')], { shadowR: 4 });
  M.crate = prop([B(-4, -4, 0, 8, 8, 7, '#8a6238'), B(-4, -4, 6, 8, 8, 1, '#a37a48'), B(-4, 3, 0, 8, 1, 1, '#6b4a26')], { shadowR: 5 });

  M.fountain = prop([B(-12, -12, 0, 24, 24, 3, '#7b8296'), B(-10, -10, 2, 20, 20, 2, '#1fd5ff'), B(-2, -2, 3, 4, 4, 8, '#9aa3b8'),
    B(-5, -5, 9, 10, 10, 2, '#9aa3b8'), B(-4, -4, 11, 8, 8, 1, '#7df0ff'), B(-1, -1, 12, 2, 2, 3, '#c8fbff')],
  { shadowR: 14, glow: { c: '#1fd5ff', r: 150, x: 0, y: 0, z: 6 } });

  M.mushroom = prop([B(0, 0, 0, 2, 2, 3, '#e8dcc0'), B(-2, -2, 3, 6, 6, 2, '#ff2bd6'), B(-1, -1, 5, 4, 4, 1, '#ff7ae8'), B(-1, 2, 3, 1, 1, 1, '#ffffff')],
    { shadowR: 4, glow: { c: '#ff2bd6', r: 60, x: 1, y: 1, z: 4 } });

  M.crystal = prop([B(-2, -2, 0, 5, 5, 9, '#31d0ff'), B(-1, -1, 9, 3, 3, 6, '#7df0ff'), B(0, 0, 15, 1, 1, 2, '#c8fbff'),
    B(-8, 0, 0, 4, 4, 6, '#a855ff'), B(-7, 1, 6, 2, 2, 4, '#d6a8ff'), B(4, -1, 0, 4, 4, 7, '#ff2bd6'), B(5, 0, 7, 2, 2, 4, '#ff8ae8')],
  { shadowR: 8, glow: { c: '#31d0ff', r: 130, x: 0, y: 0, z: 8 } });

  M.pillar = prop([B(-4, -4, 0, 8, 8, 3, '#3a3550'), B(-3, -3, 3, 6, 6, 16, '#4a4466'), B(-4, -4, 19, 8, 8, 3, '#3a3550'), B(-1, 3, 9, 2, 1, 5, '#00e5ff')],
    { shadowR: 6, glow: { c: '#00e5ff', r: 70, x: 0, y: 4, z: 11 } });

  M.brazier = prop([B(-2, -2, 0, 4, 4, 2, '#3a3a3a'), B(-1, -1, 2, 2, 2, 6, '#3a3a3a'), B(-3, -3, 8, 6, 6, 2, '#4a4a4a'), B(-2, -2, 10, 4, 4, 3, '#ff9f1c'), B(-1, -1, 13, 2, 2, 2, '#ffe066')],
    { shadowR: 5, glow: { c: '#ff9f1c', r: 140, x: 0, y: 0, z: 12 } });

  M.bones = prop([B(-3, 0, 0, 6, 1, 1, '#e8e4d0'), B(-2, 2, 0, 5, 1, 1, '#d8d4c0'), B(4, -1, 0, 3, 3, 3, '#e8e4d0'), B(5, 2, 1, 1, 1, 1, '#111111')], { shadowR: 5 });

  // высота модели в вокселях (для полосок здоровья и подписей)
  Object.keys(M).forEach(id => {
    let h = 0;
    Object.values(M[id].parts).forEach(p => p.boxes.forEach(b => { h = Math.max(h, b[2] + b[5]); }));
    M[id].h = h + (M[id].hover || 0);
    M[id].id = id;
  });

  // ---------- Разворачивание в воксели ----------
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hash3(x, y, z) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  const expandCache = new WeakMap();
  // -> массив [x, y, z, r, g, b] с лёгким шумом яркости (даёт «фактуру»)
  function expandPart(part) {
    if (expandCache.has(part)) return expandCache.get(part);
    const map = new Map();
    for (const bx of part.boxes) {
      const [x, y, z, w, d, h, c] = bx, rgb = hexToRgb(c);
      for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) for (let k = 0; k < h; k++) {
        const X = x + i, Y = y + j, Z = z + k;
        const f = 0.94 + hash3(X, Y, Z) * 0.12;
        map.set(((X + 512) * 1024 + (Y + 512)) * 1024 + (Z + 512), [X, Y, Z, clamp(rgb[0] * f), clamp(rgb[1] * f), clamp(rgb[2] * f)]);
      }
    }
    const arr = Array.from(map.values());
    expandCache.set(part, arr);
    return arr;
  }

  const api = { MODELS: M, expandPart, hexToRgb, hash3, mulberry, B };
  if (typeof module === 'object' && module.exports) module.exports = api; else g.VoxelModels = api;
})(typeof self !== 'undefined' ? self : globalThis);
