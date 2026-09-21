/* Мир: три локации, процедурная отрисовка земли и расстановка декораций.
   Всё детерминировано (seed), поэтому 2D и 3D версии видят одну и ту же карту.
   Координаты - пиксели зоны 1280x800. Переход между зонами: Y < 20 (вверх) и Y > 780 (вниз). */
(function (g) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const T = 40, W = 1280, H = 800;

  const ZONES = {
    town: { id: 'town', name: 'Стартовый Город', up: null, down: 'forest', dark: 0.28, ambient: 0x8fa0ff, sky: '#0a1024', mobs: [] },
    forest: { id: 'forest', name: 'Лесной Туннель', up: 'town', down: 'dungeon', dark: 0.5, ambient: 0x6fa08a, sky: '#06120c', mobs: [{ kind: 'slime', max: 6 }, { kind: 'orc', max: 2 }] },
    dungeon: { id: 'dungeon', name: 'Мрачное Подземелье', up: 'forest', down: null, dark: 0.66, ambient: 0x8a6fd0, sky: '#080612', mobs: [{ kind: 'orc', max: 3 }, { kind: 'skeleton', max: 4 }, { kind: 'bat', max: 3 }] }
  };

  const forestPathX = y => 640 + Math.sin(y / 95) * 170;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- Декорации ----------
  const propCache = {};
  function propsFor(zoneId) {
    if (propCache[zoneId]) return propCache[zoneId];
    const rand = mulberry({ town: 101, forest: 202, dungeon: 303 }[zoneId]);
    const list = [];
    const add = (model, x, y, solid, extra) => list.push(Object.assign({ model, x: Math.round(x), y: Math.round(y), solid: solid || null }, extra || {}));
    const near = (x, y, d) => list.some(p => Math.abs(p.x - x) < d && Math.abs(p.y - y) < d * 0.8);
    const scatter = (n, models, region, gap, solid) => {
      let placed = 0, tries = 0;
      while (placed < n && tries < n * 40) {
        tries++;
        const x = 30 + rand() * (W - 60), y = 45 + rand() * (H - 75);
        if (!region(x, y) || near(x, y, gap)) continue;
        add(models[Math.floor(rand() * models.length)], x, y, solid);
        placed++;
      }
    };
    const TREE = { hw: 7, hh: 5 };

    if (zoneId === 'town') {
      const houses = [['house1', 190, 230], ['house2', 400, 150], ['house1', 900, 150], ['house2', 1090, 240], ['house1', 170, 570], ['house2', 1110, 570]];
      houses.forEach(h => add(h[0], h[1], h[2], h[0] === 'house1' ? { hw: 40, hh: 19 } : { hw: 31, hh: 17 }));
      add('fountain', 640, 385, { hw: 36, hh: 26 });
      add('board', 470, 335, { hw: 24, hh: 5 }, { id: 'board', interact: 'board' });
      [[380, 275], [900, 275], [380, 545], [900, 545], [560, 650], [720, 650], [560, 750], [720, 750]].forEach(p => add('lamp', p[0], p[1], { hw: 3, hh: 3 }));
      [['barrel', 262, 268], ['crate', 140, 285], ['barrel', 455, 185], ['crate', 950, 190], ['barrel', 1030, 285], ['crate', 250, 600], ['barrel', 1050, 610]].forEach(p => add(p[0], p[1], p[2], { hw: 5, hh: 4 }));
      const nearHouse = (x, y) => houses.some(h => Math.abs(x - h[1]) < 75 && y > h[2] - 75 && y < h[2] + 55);
      const road = x => x > 520 && x < 760;
      scatter(34, ['tree_a'], (x, y) => !nearHouse(x, y) && (y < 95 || x < 85 || x > 1195 || (y > 700 && !road(x))), 40, TREE);
      scatter(16, ['tree_a'], (x, y) => !nearHouse(x, y) && !(x > 330 && x < 950 && y > 200 && y < 600) && !road(x) && x > 90 && x < 1190 && y > 100 && y < 700, 90, TREE);
      scatter(12, ['bush'], (x, y) => !nearHouse(x, y) && !(x > 330 && x < 950 && y > 200 && y < 800) && !(x > 500 && x < 780), 60, { hw: 6, hh: 4 });
    } else if (zoneId === 'forest') {
      scatter(120, ['tree_b', 'pine', 'pine'], (x, y) => Math.abs(x - forestPathX(y)) > 115, 36, TREE);
      scatter(10, ['mushroom'], (x, y) => { const d = Math.abs(x - forestPathX(y)); return d > 100 && d < 175; }, 70, null);
      scatter(8, ['rock'], (x, y) => Math.abs(x - forestPathX(y)) > 125, 60, { hw: 8, hh: 5 });
      scatter(6, ['stump'], (x, y) => Math.abs(x - forestPathX(y)) > 100, 80, { hw: 5, hh: 4 });
      scatter(10, ['bush'], (x, y) => Math.abs(x - forestPathX(y)) > 110, 60, { hw: 6, hh: 4 });
    } else {
      [140, 330, 520, 710].forEach(y => { add('pillar', 300, y, { hw: 8, hh: 6 }); add('pillar', 980, y, { hw: 8, hh: 6 }); });
      [230, 430, 630].forEach(y => { add('brazier', 345, y, { hw: 5, hh: 4 }); add('brazier', 935, y, { hw: 5, hh: 4 }); });
      scatter(46, ['rock_dark'], (x, y) => x < 175 || x > 1105, 34, { hw: 9, hh: 6 });
      scatter(9, ['crystal'], (x, y) => x < 260 || x > 1020, 90, { hw: 9, hh: 5 });
      scatter(8, ['bones'], (x, y) => x > 380 && x < 900, 90, null);
      scatter(5, ['barrel', 'crate'], (x, y) => x > 380 && x < 900, 120, { hw: 5, hh: 4 });
    }
    list.sort((a, b) => a.y - b.y);
    propCache[zoneId] = list;
    return list;
  }

  const solidCache = {};
  function solidsFor(zoneId) {
    if (!solidCache[zoneId]) solidCache[zoneId] = propsFor(zoneId).filter(p => p.solid).map(p => ({ x: p.x, y: p.y, hw: p.solid.hw, hh: p.solid.hh }));
    return solidCache[zoneId];
  }
  function blocked(solids, x, y, hw, hh) {
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (Math.abs(x - s.x) < s.hw + hw && Math.abs(y - s.y) < s.hh + hh) return true;
    }
    return false;
  }
  function randomSpot(zoneId, rand, avoid) {
    const solids = solidsFor(zoneId);
    for (let i = 0; i < 80; i++) {
      const y = 90 + rand() * (H - 180);
      let x = zoneId === 'forest' ? forestPathX(y) + (rand() - 0.5) * 220 : 120 + rand() * (W - 240);
      if (zoneId === 'dungeon') x = 220 + rand() * (W - 440);
      x = clamp(x, 60, W - 60);
      if (blocked(solids, x, y, 14, 9)) continue;
      if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < avoid.r) continue;
      return { x, y };
    }
    return { x: W / 2, y: H / 2 };
  }

  // ---------- Земля ----------
  function blocks(ctx, pal, size, rand) {
    for (let y = 0; y < H; y += size) for (let x = 0; x < W; x += size) {
      ctx.fillStyle = pal[Math.floor(rand() * pal.length)];
      ctx.fillRect(x, y, size, size);
    }
  }
  function glowStroke(ctx, color, blur, width, fn) {
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); fn(ctx); ctx.stroke(); ctx.restore();
  }
  function cobbles(ctx, x0, y0, w, h, rand) {
    ctx.fillStyle = '#171b2b'; ctx.fillRect(x0, y0, w, h);
    const pal = ['#2b3146', '#31384f', '#272c40', '#363e58'];
    for (let y = y0; y < y0 + h; y += 20) for (let x = x0; x < x0 + w; x += 20) {
      ctx.fillStyle = pal[Math.floor(rand() * pal.length)];
      ctx.fillRect(x + 1, y + 1, 18, 18);
    }
  }
  function groundTown(ctx, rand) {
    blocks(ctx, ['#0f2a1c', '#123222', '#0d2418', '#153826'], 8, rand);
    ctx.strokeStyle = '#1f5a35'; ctx.lineWidth = 1;
    for (let i = 0; i < 380; i++) { const x = rand() * W, y = rand() * H; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 1, y - 4); ctx.moveTo(x + 2, y); ctx.lineTo(x + 3, y - 5); ctx.stroke(); }
    const fl = ['#ff7ae8', '#ffd166', '#7df0ff'];
    for (let i = 0; i < 60; i++) { ctx.fillStyle = fl[Math.floor(rand() * 3)]; ctx.fillRect(rand() * W | 0, rand() * H | 0, 2, 2); }
    cobbles(ctx, 360, 240, 560, 320, rand);
    cobbles(ctx, 560, 560, 160, 240, rand);
    glowStroke(ctx, '#00e5ff', 12, 3, c => { c.rect(361, 241, 558, 318); });
    glowStroke(ctx, '#00e5ff', 8, 2, c => { c.moveTo(561, 560); c.lineTo(561, H); c.moveTo(719, 560); c.lineTo(719, H); });
    glowStroke(ctx, '#ff3fd0', 14, 2, c => { c.ellipse(640, 392, 120, 80, 0, 0, Math.PI * 2); });
    ctx.save(); ctx.setLineDash([6, 8]);
    glowStroke(ctx, '#ff3fd0', 8, 2, c => { c.ellipse(640, 392, 90, 58, 0, 0, Math.PI * 2); });
    ctx.restore();
  }
  function groundForest(ctx, rand) {
    blocks(ctx, ['#0b1d13', '#0e2318', '#0a1911', '#10281b'], 8, rand);
    const dirt = ['#3a2b1d', '#42321f', '#33261a', '#4a3823'];
    for (let y = 0; y < H; y += 6) {
      const cx = forestPathX(y);
      for (let x = cx - 100; x < cx + 100; x += 8) {
        const edge = Math.abs(x - cx) > 84;
        ctx.fillStyle = edge ? '#241a12' : dirt[Math.floor(rand() * dirt.length)];
        ctx.fillRect(Math.round(x), y, 8, 6);
      }
    }
    for (let i = 0; i < 28; i++) {
      const x = rand() * W, y = rand() * H, r = 40 + rand() * 50;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(57,255,136,0.13)'); gr.addColorStop(1, 'rgba(57,255,136,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const lf = ['#c9772b', '#e0a13a', '#8a4b1f'];
    for (let i = 0; i < 160; i++) { const y = rand() * H, x = forestPathX(y) + (rand() - 0.5) * 240; ctx.fillStyle = lf[Math.floor(rand() * 3)]; ctx.fillRect(x | 0, y | 0, 2, 2); }
  }
  function groundDungeon(ctx, rand) {
    blocks(ctx, ['#151126', '#181330', '#120e20', '#1b1536'], 8, rand);
    ctx.fillStyle = 'rgba(140,100,230,0.07)'; ctx.fillRect(200, 0, 880, H);
    ctx.strokeStyle = 'rgba(8,6,16,0.8)'; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += T) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += T) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
    ctx.strokeStyle = '#0b0812';
    for (let i = 0; i < 34; i++) {
      let x = rand() * W, y = rand() * H; ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (rand() - 0.5) * 26; y += (rand() - 0.2) * 18; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    glowStroke(ctx, '#7a5cff', 10, 2, c => { c.moveTo(200.5, 0); c.lineTo(200.5, H); c.moveTo(1079.5, 0); c.lineTo(1079.5, H); });
    const rc = ['#00e5ff', '#ff3fd0'];
    for (let i = 0; i < 18; i++) {
      const x = 260 + rand() * 760, y = 40 + rand() * 720, col = rc[i % 2];
      glowStroke(ctx, col, 10, 2, c => { c.rect(x, y, 10, 10); c.moveTo(x + 5, y - 4); c.lineTo(x + 5, y + 14); c.moveTo(x - 4, y + 5); c.lineTo(x + 14, y + 5); });
    }
  }
  function edgeGlow(ctx, zone) {
    const col = zone.id === 'dungeon' ? '255,63,208' : '0,229,255';
    if (zone.down) { const gr = ctx.createLinearGradient(0, H - 46, 0, H); gr.addColorStop(0, 'rgba(' + col + ',0)'); gr.addColorStop(1, 'rgba(' + col + ',0.28)'); ctx.fillStyle = gr; ctx.fillRect(0, H - 46, W, 46); }
    if (zone.up) { const gr = ctx.createLinearGradient(0, 46, 0, 0); gr.addColorStop(0, 'rgba(' + col + ',0)'); gr.addColorStop(1, 'rgba(' + col + ',0.28)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 46); }
  }
  // Рисует землю зоны в ctx размером 1280x800 (используется и как текстура в 3D)
  function drawGround(ctx, zoneId) {
    const rand = mulberry({ town: 7, forest: 8, dungeon: 9 }[zoneId]);
    if (zoneId === 'town') groundTown(ctx, rand); else if (zoneId === 'forest') groundForest(ctx, rand); else groundDungeon(ctx, rand);
    edgeGlow(ctx, ZONES[zoneId]);
  }

  const api = { T, W, H, ZONES, propsFor, solidsFor, blocked, randomSpot, drawGround, forestPathX };
  if (isNode) module.exports = api; else g.World = api;
})(typeof self !== 'undefined' ? self : globalThis);
