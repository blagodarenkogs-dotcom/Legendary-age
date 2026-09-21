/* База данных процедурной графики Legendary Age.
   Общий файл для лаунчера, игрового клиента (2D и 3D) и сервера:
   - палитры (кожа, цвета волос), длины волос, пол;
   - 9 классов: характеристики, умения, цвета и «комплект» экипировки;
   - сборщик воксельной модели персонажа (2D-версия): базовая матрица тела зависит от пола,
     поверх неё накладываются слои: причёска -> головной убор -> одежда -> оружие.
   3D-версия использует те же цвета и «комплекты» (см. buildCharacter3D в game.html). */
(function (g) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const VM = isNode ? require('./voxel-models.js') : g.VoxelModels;
  const B = VM.B;

  const SKIN = '#f3c9a2';
  const GENDERS = { male: { label: 'Мужской', sym: '♂' }, female: { label: 'Женский', sym: '♀' } };
  const HAIR_COLORS = {
    blonde: { label: 'Блонд', hex: '#f2d16b' },
    black: { label: 'Чёрный', hex: '#1b1a22' },
    white: { label: 'Белый', hex: '#f1f1f5' },
    pink: { label: 'Розовый', hex: '#ff7ac8' },
    blue: { label: 'Синий', hex: '#4aa8ff' }
  };
  const HAIR_LENGTHS = { short: { label: 'Короткие' }, long: { label: 'Длинные' }, twin: { label: 'Хвостики' } };

  // s1 - основное умение (клавиша 1), s2 - рывок (клавиша 2)
  const CLASSES = {
    knight: {
      icon: '🛡', name: { male: 'Рыцарь', female: 'Рыцарь' }, desc: 'Классический танк в тяжёлых доспехах', hp: 170, speed: 150,
      pal: { main: '#9aa6b8', trim: '#d0d8e6', dark: '#4e5666', accent: '#3a5ea8' },
      kit: { weapon: 'sword_shield', head: 'helm', pads: true, skirtM: 'none', skirtF: 'short', legs: 'dark', boots: '#23262e' },
      s1: { name: 'Удар мечом', cd: 0.65, range: 74, dot: 0.25, dmg: 15, kb: 30, fx: 'arc', color: '#cfe3ff' }, s2: { name: 'Рывок щитом', cd: 3.5, dist: 130 }
    },
    berserk: {
      icon: '🪓', name: { male: 'Берсерк', female: 'Берсерк' }, desc: 'Воин с огромным двуручным топором', hp: 150, speed: 165,
      pal: { main: '#8a5a3a', trim: '#c9a06a', dark: '#3a2418', accent: '#c0392b' },
      kit: { weapon: 'axe2h', head: 'horns', bare: true, fur: true, skirtM: 'none', skirtF: 'short', skirtColor: '#5a3a24', legs: 'dark', belt: '#c9a06a', boots: '#2a1810' },
      s1: { name: 'Удар топором', cd: 0.9, range: 86, dot: -0.1, dmg: 26, kb: 40, fx: 'arc', color: '#ff5a3c' }, s2: { name: 'Ярость', cd: 3, dist: 170 }
    },
    paladin: {
      icon: '⚡', name: { male: 'Паладин', female: 'Паладин' }, desc: 'Святой защитник в золотой броне', hp: 160, speed: 155,
      pal: { main: '#e8c14a', trim: '#fff3c0', dark: '#a37a1c', accent: '#f5f5ff' },
      kit: { weapon: 'mace_shield', head: 'halo', pads: true, cape: '#f5f5ff', skirtM: 'none', skirtF: 'short', legs: 'dark', boots: '#7a5a14' },
      s1: { name: 'Святой удар', cd: 0.7, range: 78, dot: 0.2, dmg: 17, kb: 26, fx: 'arc', color: '#ffe27a' }, s2: { name: 'Рывок света', cd: 3.2, dist: 140 }
    },
    mage: {
      icon: '🔮', name: { male: 'Маг', female: 'Маг' }, desc: 'Заклинатель стихий в роскошной мантии', hp: 90, speed: 158,
      pal: { main: '#5b3fa8', trim: '#f2c14e', dark: '#3a2a7a', accent: '#4de8ff' },
      kit: { weapon: 'staff', head: 'witch', skirtM: 'long', skirtF: 'long', legs: 'dark', boots: '#2a1f3a', belt: '#f2c14e' },
      s1: { name: 'Магический взрыв', cd: 0.9, range: 130, dot: -0.3, dmg: 21, kb: 16, fx: 'arc', color: '#b57bff' }, s2: { name: 'Телепорт', cd: 3, dist: 150 }
    },
    necromancer: {
      icon: '💀', name: { male: 'Некромант', female: 'Некромант' }, desc: 'Повелитель костей в мрачном готическом облачении', hp: 95, speed: 158,
      pal: { main: '#2a2438', trim: '#7d6bb0', dark: '#141018', accent: '#7dff9a' },
      kit: { weapon: 'skullstaff', head: 'crown', cape: '#1c1626', skirtM: 'long', skirtF: 'long', legs: 'dark', boots: '#0e0a12' },
      s1: { name: 'Костяной шип', cd: 0.8, range: 170, dot: 0.8, dmg: 19, kb: 12, fx: 'beam', color: '#7dff9a' }, s2: { name: 'Теневой шаг', cd: 3, dist: 150 }
    },
    priest: {
      icon: '✨', name: { male: 'Жрец', female: 'Жрица' }, desc: 'Прекрасная целительница в откровенном жреческом наряде', hp: 100, speed: 160,
      pal: { main: '#f4f1ea', trim: '#f2c14e', dark: '#c9c3b4', accent: '#9fe8ff' },
      kit: { weapon: 'starstaff', head: 'veil', skirtM: 'long', skirtF: 'short', legs: 'dark', boots: '#e0d9c6', openChest: true },
      s1: { name: 'Святой свет', cd: 0.85, range: 140, dot: 0.5, dmg: 14, kb: 10, fx: 'beam', color: '#fff3b0' }, s2: { name: 'Шаг света', cd: 3, dist: 140 }
    },
    archer: {
      icon: '🏹', name: { male: 'Лучник', female: 'Лучница' }, desc: 'Меткий стрелок в капюшоне', hp: 105, speed: 170,
      pal: { main: '#3f7d4a', trim: '#8a5a2b', dark: '#24472b', accent: '#e6e6d0' },
      kit: { weapon: 'bow', head: 'hood', cape: '#24472b', quiver: true, skirtM: 'none', skirtF: 'short', legs: 'trim', boots: '#3a2a1c', belt: '#6b4423' },
      s1: { name: 'Меткий выстрел', cd: 0.7, range: 210, dot: 0.9, dmg: 17, kb: 12, fx: 'beam', color: '#7cff6b' }, s2: { name: 'Кувырок', cd: 2.8, dist: 160 }
    },
    assassin: {
      icon: '🗡', name: { male: 'Ассасин', female: 'Ассасин' }, desc: 'Скрытный убийца в маске и облегающем костюме', hp: 100, speed: 182,
      pal: { main: '#22222f', trim: '#c1121f', dark: '#101018', accent: '#d8dde6' },
      kit: { weapon: 'daggers', head: 'mask', scarf: true, skirtM: 'none', skirtF: 'none', legs: 'dark', boots: '#0c0c12', belt: '#3a2a1c' },
      s1: { name: 'Удар в спину', cd: 0.45, range: 60, dot: 0.1, dmg: 19, kb: 10, fx: 'arc', color: '#ff2b6d' }, s2: { name: 'Тень', cd: 2.5, dist: 190 }
    },
    monk: {
      icon: '🥋', name: { male: 'Монах', female: 'Монах' }, desc: 'Мастер рукопашного боя в восточном кимоно', hp: 120, speed: 172,
      pal: { main: '#e07b2b', trim: '#f3e9d2', dark: '#7a3a12', accent: '#f3e9d2' },
      kit: { weapon: 'fists', head: 'band', skirtM: 'mid', skirtF: 'mid', legs: 'dark', boots: '#3a2a1c', belt: '#f3e9d2', glove: '#f3e9d2' },
      s1: { name: 'Серия ударов', cd: 0.5, range: 62, dot: 0.0, dmg: 15, kb: 14, fx: 'arc', color: '#ffb347' }, s2: { name: 'Рывок ветра', cd: 2.8, dist: 165 }
    }
  };
  const CLASS_IDS = Object.keys(CLASSES);
  const needXp = lvl => 40 + lvl * 35;

  // ---------- проверка данных (используют лаунчер, клиент и сервер) ----------
  function cleanAppearance(o) {
    if (!o || typeof o !== 'object') return null;
    if (!GENDERS[o.gender] || !CLASSES[o.cls] || !HAIR_COLORS[o.hairColor] || !HAIR_LENGTHS[o.hairLen]) return null;
    return { gender: o.gender, cls: o.cls, hairColor: o.hairColor, hairLen: o.hairLen };
  }
  function cleanName(s) {
    s = String(s == null ? '' : s).trim();
    return /^[\p{L}\p{N}_ -]{2,16}$/u.test(s) ? s : null;
  }
  function mix(a, b, t) {
    const pa = VM.hexToRgb(a), pb = VM.hexToRgb(b);
    return '#' + [0, 1, 2].map(i => Math.round(pa[i] + (pb[i] - pa[i]) * t).toString(16).padStart(2, '0')).join('');
  }

  // ---------- сборщик воксельного персонажа ----------
  function characterModel(a) {
    const c = CLASSES[a.cls], p = c.pal, k = c.kit, female = a.gender === 'female';
    const hair = HAIR_COLORS[a.hairColor].hex, hl = a.hairLen, eye = '#161624';
    const torsoBare = k.bare && !female;
    const top = torsoBare ? SKIN : p.main;
    const legC = p[k.legs || 'dark'], boots = k.boots || p.dark;
    const sleeve = k.bare ? SKIN : (k.sleeve === 'main' ? p.main : p.main);
    const glove = k.glove || (k.bare ? SKIN : p.dark);
    const ax = female ? 3 : 4, lx = -ax - 2, wx = ax + 1, wl = lx + 1;

    const legL = { anim: 'legL', pivot: [-1.5, 0.5, 6], boxes: [B(-3, -1, 2, 3, 3, 4, legC), B(-3, -1, 0, 3, 4, 2, boots)] };
    const legR = { anim: 'legR', pivot: [1.5, 0.5, 6], boxes: [B(0, -1, 2, 3, 3, 4, legC), B(0, -1, 0, 3, 4, 2, boots)] };

    // --- торс: женская фигура (узкая талия + выраженная грудь) или мужская
    const t = [];
    if (female) {
      // талия + бёдра
      t.push(B(-2, -2, 6, 4, 4, 1, k.belt || p.trim));
      t.push(B(-2, -2, 7, 4, 4, 2, top));
      // грудь (увеличенная)
      t.push(B(-4, -2, 9, 8, 4, 3, top));
      t.push(B(-4, 2, 9, 3, 1, 3, mix(top, '#ffffff', 0.12))); // левая
      t.push(B(1, 2, 9, 3, 1, 3, mix(top, '#ffffff', 0.12)));  // правая
      // дополнительный объём груди вперёд
      t.push(B(-3, 3, 9, 2, 1, 2, mix(top, '#ffffff', 0.18)));
      t.push(B(1, 3, 9, 2, 1, 2, mix(top, '#ffffff', 0.18)));
      // открытое декольте для жрицы и похожих нарядов
      if (k.openChest) {
        t.push(B(-2, 2, 10, 4, 1, 2, mix(SKIN, '#ffb0b0', 0.15))); // кожа в вырезе
        t.push(B(-1, 3, 11, 2, 1, 1, mix(SKIN, '#ffb0b0', 0.1)));
      }
    } else {
      t.push(B(-3, -2, 6, 6, 4, 1, k.belt || p.trim), B(-3, -2, 7, 6, 4, 2, top), B(-4, -2, 9, 8, 4, 3, top),
        B(-3, 2, 10, 3, 1, 2, mix(top, torsoBare ? '#ffffff' : '#000000', 0.12)), B(0, 2, 10, 3, 1, 2, mix(top, torsoBare ? '#ffffff' : '#000000', 0.12)));
      if (torsoBare) t.push(B(-1, 2, 7, 2, 1, 3, mix(SKIN, '#000000', 0.15)));
    }
    if (!torsoBare && (k.head === 'helm' || k.head === 'halo' || k.head === 'crown' || k.head === 'veil' || k.head === 'witch')) t.push(B(-1, 2, 7, 2, 1, 3, p.trim));
    if (k.scarf) t.push(B(-ax - 1, -3, 11, 2 * ax + 2, 6, 1, p.trim), B(-ax - 1, -3, 6, 2, 1, 5, p.trim));
    if (k.fur) t.push(B(-ax - 1, -3, 11, 2 * ax + 2, 6, 2, p.trim));
    if (k.cape) t.push(B(-ax, -3, 3, 2 * ax, 1, 9, k.cape));
    if (k.quiver) t.push(B(-2, -4, 7, 2, 1, 6, '#6b4423'), B(-2, -4, 13, 1, 1, 2, '#ffffff'), B(-1, -4, 13, 1, 1, 2, '#d0d0d0'));
    const sk = female ? k.skirtF : k.skirtM, skC = k.skirtColor || p.main;
    const skH = { short: 3, mid: 5, long: 6 }[sk];
    if (skH) t.push(B(-4, -3, 7 - skH, 8, 6, skH, skC), B(-4, 2, 7 - skH, 8, 1, 1, p.trim));

    // --- голова и причёска
    const head = [B(-3, -3, 12, 6, 6, 6, SKIN)];
    head.push(B(-3, -3, 16, 6, 6, 2, hair), B(-3, -3, 12, 6, 2, 4, hair), B(-3, -1, 14, 1, 3, 2, hair), B(2, -1, 14, 1, 3, 2, hair), B(-3, 2, 15, 6, 1, 1, hair));
    if (hl === 'long') head.push(B(-3, -4, 7, 6, 2, 10, hair), B(-4, -2, 9, 1, 3, 7, hair), B(3, -2, 9, 1, 3, 7, hair));
    if (hl === 'twin') head.push(B(-5, -1, 15, 2, 2, 2, p.trim), B(3, -1, 15, 2, 2, 2, p.trim), B(-6, -2, 8, 2, 2, 9, hair), B(4, -2, 8, 2, 2, 9, hair));
    head.push(B(-2, 2, 14, 1, 1, 1, eye), B(1, 2, 14, 1, 1, 1, eye));
    if (female) head.push(B(-2, 2, 13, 1, 1, 1, '#ffb0b0'), B(1, 2, 13, 1, 1, 1, '#ffb0b0'));

    const armL = { anim: 'armL', pivot: [lx + 1, 0.5, 12], boxes: [B(lx, -1, 8, 2, 3, 4, sleeve), B(lx, -1, 6, 2, 3, 2, glove)] };
    const armR = { anim: 'armR', pivot: [ax + 1, 0.5, 12], boxes: [B(ax, -1, 8, 2, 3, 4, sleeve), B(ax, -1, 6, 2, 3, 2, glove)] };
    let glow = null;

    // --- головные уборы
    switch (k.head) {
      case 'helm':
        head.push(B(-4, -4, 16, 8, 8, 2, p.main), B(-4, -4, 12, 8, 2, 4, p.main), B(-4, -2, 12, 1, 5, 3, p.main), B(3, -2, 12, 1, 5, 3, p.main),
          B(-1, 3, 12, 2, 1, 4, p.main), B(-1, -4, 18, 2, 7, 2, '#d0213a'));
        break;
      case 'horns':
        head.push(B(-3, -3, 15, 6, 6, 1, p.accent), B(-5, -1, 16, 2, 2, 1, '#eee8d0'), B(-6, -1, 17, 1, 2, 2, '#eee8d0'), B(3, -1, 16, 2, 2, 1, '#eee8d0'), B(5, -1, 17, 1, 2, 2, '#eee8d0'),
          B(-2, 2, 13, 1, 1, 1, p.accent), B(1, 2, 13, 1, 1, 1, p.accent));
        break;
      case 'halo':
        head.push(B(-4, -4, 16, 8, 8, 2, p.main), B(-4, -4, 12, 8, 2, 4, p.main), B(-6, -1, 16, 2, 1, 2, p.trim), B(4, -1, 16, 2, 1, 2, p.trim),
          B(-3, -3, 20, 6, 1, 1, '#fff3a0'), B(-3, 2, 20, 6, 1, 1, '#fff3a0'), B(-3, -2, 20, 1, 4, 1, '#fff3a0'), B(2, -2, 20, 1, 4, 1, '#fff3a0'));
        glow = { c: '#ffe27a', r: 70, x: 0, y: 0, z: 21 };
        break;
      case 'witch':
        head.push(B(-5, -5, 16, 10, 10, 1, p.dark), B(-3, -3, 17, 6, 6, 2, p.dark), B(-3, -3, 17, 6, 6, 1, p.trim), B(-2, -2, 19, 4, 4, 2, p.dark), B(-1, -1, 21, 2, 2, 2, p.dark), B(0, 0, 23, 1, 1, 1, p.dark));
        break;
      case 'crown':
        head.push(B(-4, -4, 16, 8, 1, 1, p.dark), B(-4, 3, 16, 8, 1, 1, p.dark), B(-4, -3, 16, 1, 6, 1, p.dark), B(3, -3, 16, 1, 6, 1, p.dark),
          B(-4, -1, 17, 1, 1, 3, '#eee8d0'), B(3, -1, 17, 1, 1, 3, '#eee8d0'), B(-1, 3, 16, 2, 1, 1, p.accent), B(-1, 4, 15, 2, 1, 1, p.accent));
        break;
      case 'veil':
        head.push(B(-3, -3, 16, 6, 6, 1, p.trim), B(-1, 2, 16, 2, 1, 1, p.accent), B(-4, -5, 9, 8, 1, 8, p.main));
        break;
      case 'hood':
        head.push(B(-4, -4, 16, 8, 8, 2, p.dark), B(-4, -4, 12, 8, 2, 4, p.dark), B(-4, -2, 12, 1, 5, 3, p.dark), B(3, -2, 12, 1, 5, 3, p.dark));
        break;
      case 'mask':
        head.push(B(-4, -4, 16, 8, 8, 2, p.dark), B(-4, -4, 12, 8, 2, 4, p.dark), B(-4, -2, 12, 1, 5, 3, p.dark), B(3, -2, 12, 1, 5, 3, p.dark), B(-3, 2, 12, 6, 1, 2, p.dark));
        break;
      case 'band':
        head.push(B(-3, -3, 15, 6, 6, 1, '#c0392b'), B(-1, -5, 15, 1, 2, 3, '#c0392b'));
        break;
    }

    // --- оружие
    switch (k.weapon) {
      case 'sword_shield':
        armR.boxes.push(B(wx, 2, 5, 1, 1, 3, '#6b4423'), B(wx - 1, 2, 8, 3, 1, 1, '#e8c14a'), B(wx, 2, 9, 1, 1, 10, '#d8e2f0'), B(wx, 2, 19, 1, 1, 1, '#ffffff'));
        armL.boxes.push(B(wl - 2, 2, 3, 4, 1, 10, p.accent), B(wl - 2, 2, 3, 4, 1, 1, p.trim), B(wl - 2, 2, 12, 4, 1, 1, p.trim), B(wl - 1, 3, 6, 2, 1, 3, '#ffd166'));
        break;
      case 'axe2h':
        armR.boxes.push(B(wx, 2, 1, 1, 1, 17, '#6b4423'), B(wx - 3, 2, 14, 3, 1, 5, '#c8c8d4'), B(wx + 1, 2, 14, 3, 1, 5, '#c8c8d4'), B(wx, 2, 15, 1, 1, 3, '#3a3a44'));
        break;
      case 'mace_shield':
        armR.boxes.push(B(wx, 2, 4, 1, 1, 6, '#6b4423'), B(wx - 1, 2, 10, 3, 3, 3, '#e8c14a'), B(wx, 3, 13, 1, 1, 1, '#fff3c0'));
        armL.boxes.push(B(wl - 2, 2, 3, 4, 1, 10, '#f5f5ff'), B(wl - 2, 2, 12, 4, 1, 1, '#e8c14a'), B(wl - 1, 3, 5, 2, 1, 6, '#e8c14a'), B(wl - 2, 3, 8, 4, 1, 2, '#e8c14a'));
        break;
      case 'staff':
        armR.boxes.push(B(wx, 2, 0, 1, 1, 19, '#6b4a2b'), B(wx - 1, 2, 19, 3, 3, 3, p.accent), B(wx, 3, 20, 1, 1, 1, '#ffffff'));
        glow = { c: p.accent, r: 60, x: wx, y: 3, z: 20 };
        break;
      case 'skullstaff':
        armR.boxes.push(B(wx, 2, 0, 1, 1, 19, '#3a3048'), B(wx - 1, 2, 19, 3, 3, 3, '#e8e4d0'), B(wx - 1, 4, 20, 1, 1, 1, p.accent), B(wx + 1, 4, 20, 1, 1, 1, p.accent), B(wx - 1, 4, 19, 3, 1, 1, '#c8c4b0'));
        glow = { c: p.accent, r: 60, x: wx, y: 4, z: 20 };
        break;
      case 'starstaff':
        armR.boxes.push(B(wx, 2, 0, 1, 1, 19, '#f0e6c8'), B(wx - 1, 2, 20, 3, 1, 1, p.trim), B(wx, 2, 19, 1, 1, 3, p.trim), B(wx, 3, 20, 1, 1, 1, '#ffffff'));
        glow = { c: p.accent, r: 60, x: wx, y: 3, z: 20 };
        break;
      case 'bow': {
        const bx = lx - 1, wd = '#8a5a2b';
        armL.boxes.push(B(bx, 3, 6, 1, 1, 4, wd), B(bx, 2, 10, 1, 1, 2, wd), B(bx, 1, 12, 1, 1, 2, wd), B(bx, 2, 4, 1, 1, 2, wd), B(bx, 1, 2, 1, 1, 2, wd), B(bx, 1, 4, 1, 1, 8, '#e6e6d0'));
        break;
      }
      case 'daggers':
        armR.boxes.push(B(wx, 2, 6, 1, 1, 1, '#3a2a1c'), B(wx, 2, 7, 1, 4, 1, '#d8dde6'));
        armL.boxes.push(B(wl, 2, 6, 1, 1, 1, '#3a2a1c'), B(wl, 2, 7, 1, 4, 1, '#d8dde6'));
        break;
      default: break;
    }
    if (k.pads) { armR.boxes.push(B(ax, -2, 11, 3, 4, 2, p.main)); armL.boxes.push(B(lx - 1, -2, 11, 3, 4, 2, p.main)); }

    const parts = { legL, legR, torso: { anim: null, pivot: [0, 0, 9], boxes: t }, head: { anim: 'head', pivot: [0, 0, 12], boxes: head }, armL, armR };
    let h = 0;
    Object.keys(parts).forEach(n => parts[n].boxes.forEach(b => { h = Math.max(h, b[2] + b[5]); }));
    const model = { parts, size: 1, shadowR: 6, h };
    if (glow) model.glow = glow;
    return model;
  }

  function modelId(a) { return 'char:' + a.cls + ':' + a.gender + ':' + a.hairColor + ':' + a.hairLen; }
  // Регистрирует модель персонажа в VoxelModels.MODELS (её затем рисует voxel2d.js)
  function ensureModel(a) {
    const id = modelId(a);
    if (!VM.MODELS[id]) { const m = characterModel(a); m.id = id; VM.MODELS[id] = m; }
    return id;
  }

  const api = { SKIN, GENDERS, HAIR_COLORS, HAIR_LENGTHS, CLASSES, CLASS_IDS, needXp, cleanAppearance, cleanName, mix, characterModel, ensureModel, modelId };
  if (isNode) module.exports = api; else g.VoxelDB = api;
})(typeof self !== 'undefined' ? self : globalThis);
