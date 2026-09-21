/* Legendary Age — мультиплеерный сервер (Node.js + ws).
   Запуск отдельно:            npm run server
   Запуск вместе с клиентом:   "Legendary Age.exe" --server   (или: npm run start:local)
   Сервер авторитарный: клиент присылает только нажатые клавиши, а позиции, урон, опыт, золото,
   монстров и переходы между зонами считает сервер. Аккаунты и персонажи хранятся в data/accounts.json. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const World = require('./world.js');
const DB = require('./voxel-db.js');

const W = World.W, H = World.H;
const TICK_MS = 50;                       // 20 тиков в секунду, снимок мира отправляется каждый тик
const ATK_TIME = 0.3, DASH_TIME = 0.18;

const MOBS = {
  slime: { hp: 40, dmg: 6, speed: 55, xp: 12, gold: [2, 5], aggro: 170, atkRange: 26, atkCd: 1.1, r: 10 },
  orc: { hp: 110, dmg: 16, speed: 70, xp: 35, gold: [10, 20], aggro: 210, atkRange: 38, atkCd: 1.4, r: 14 },
  skeleton: { hp: 80, dmg: 12, speed: 85, xp: 26, gold: [6, 14], aggro: 230, atkRange: 34, atkCd: 1.0, r: 11 },
  bat: { hp: 30, dmg: 7, speed: 120, xp: 16, gold: [3, 8], aggro: 260, atkRange: 24, atkCd: 0.9, r: 9 }
};

function start(opts) {
  opts = opts || {};
  const PORT = opts.port || Number(process.env.PORT) || 8080;
  const HOST = opts.host || process.env.HOST || '0.0.0.0';
  const DATA_DIR = opts.dataDir || process.env.LA_DATA_DIR || path.join(__dirname, 'data');
  const FILE = path.join(DATA_DIR, 'accounts.json');
  const log = opts.quiet ? () => {} : (...a) => console.log('[server]', ...a);

  // ---------- хранилище ----------
  let db = { accounts: {} };
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (!db.accounts) db.accounts = {}; } catch (e) { db = { accounts: {} }; }
  let saveTimer = null;
  function flush() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(db));
      fs.renameSync(FILE + '.tmp', FILE);
    } catch (e) { console.error('[server] не удалось сохранить данные:', e.message); }
  }
  function saveSoon() { if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; flush(); }, 2000); }

  const hashPass = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex');
  const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  // ---------- состояние мира ----------
  const zones = {};
  Object.keys(World.ZONES).forEach(id => { zones[id] = { id, cfg: World.ZONES[id], players: new Set(), mobs: [], solids: World.solidsFor(id), spawnT: 0, evs: [], emptyT: 0 }; });
  const tokens = new Map();        // токен -> ключ аккаунта
  const online = new Map();        // ключ аккаунта -> игрок
  const failures = new Map();      // ip -> { n, t }
  let nextId = 1, tick = 0;
  const rnd = Math.random;

  const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  const dirVec = (x, y) => { const l = Math.hypot(x, y); return l > 0 ? [x / l, y / l] : [0, 0]; };

  function makePlayer(ws, key, ch) {
    const c = DB.CLASSES[ch.cls], lvl = Math.max(1, ch.lvl | 0);
    const maxHp = c.hp + (lvl - 1) * 15;
    return {
      id: nextId++, key, ws, name: ch.name, cls: ch.cls, gender: ch.gender, hairColor: ch.hairColor, hairLen: ch.hairLen,
      lvl, xp: ch.xp | 0, gold: ch.gold | 0, maxHp, hp: maxHp, x: 640, y: 620, fx: 0, fy: 1, moving: false,
      cd1: 0, cd2: 0, atkT: 0, dashT: 0, dashDx: 0, dashDy: 1, inp: { mx: 0, my: 0, s1: false, s2: false },
      dead: false, respawnT: 0, zone: null, chatT: 0
    };
  }
  function persist(p) {
    const a = db.accounts[p.key];
    if (a && a.char) { a.char.lvl = p.lvl; a.char.xp = p.xp; a.char.gold = p.gold; a.char.zone = p.zone; saveSoon(); }
  }
  function txt(z, x, y, lift, text, color) { z.evs.push({ k: 'txt', x: r1(x), y: r1(y), l: lift, s: text, c: color }); }

  function placeInZone(p, id, from) {
    if (p.zone) zones[p.zone].players.delete(p);
    const z = zones[id];
    p.zone = id; p.dashT = 0;
    if (from === 'start') { p.y = id === 'town' ? 620 : 60; p.x = id === 'forest' ? World.forestPathX(60) : 640; }
    else if (from === 'down') { p.y = 40; p.x = id === 'forest' ? World.forestPathX(40) : 640; }
    else { p.y = H - 40; p.x = id === 'forest' ? World.forestPathX(H - 40) : 640; }
    z.players.add(p); z.emptyT = 0;
    fillSpawns(z, true);
    send(p.ws, { t: 'zone', z: id });
    persist(p);
  }

  // ---------- монстры ----------
  const alive = (z, kind) => { let n = 0; for (const m of z.mobs) if (!m.dead && m.kind === kind) n++; return n; };
  function fillSpawns(z, all) {
    for (const cfg of z.cfg.mobs) {
      while (alive(z, cfg.kind) < cfg.max) {
        spawnMob(z, cfg.kind);
        if (!all) break;
      }
    }
  }
  function spawnMob(z, kind) {
    const t = MOBS[kind], ps = Array.from(z.players);
    const avoid = ps.length ? ps[Math.floor(rnd() * ps.length)] : null;
    const s = World.randomSpot(z.id, rnd, avoid ? { x: avoid.x, y: avoid.y, r: 240 } : null);
    z.mobs.push({ id: nextId++, kind, x: s.x, y: s.y, hp: t.hp, maxHp: t.hp, r: t.r, fx: 0, fy: 1, moving: false, atkCd: rnd(), atkT: 0, wt: 0, wdx: 0, wdy: 0, dead: false, fade: 0 });
  }

  function hitMob(z, p, m, dmg, nx, ny, kb) {
    const crit = rnd() < 0.1;
    if (crit) dmg = Math.round(dmg * 1.5);
    m.hp -= dmg;
    const ox = m.x + nx * kb, oy = m.y + ny * kb;
    if (!World.blocked(z.solids, ox, m.y, m.r, m.r * 0.6)) m.x = Math.max(30, Math.min(W - 30, ox));
    if (!World.blocked(z.solids, m.x, oy, m.r, m.r * 0.6)) m.y = Math.max(30, Math.min(H - 30, oy));
    txt(z, m.x, m.y, 40, String(dmg), crit ? '#ffd166' : '#ffffff');
    if (m.hp <= 0) killMob(z, p, m);
  }
  function killMob(z, p, m) {
    const t = MOBS[m.kind], gold = t.gold[0] + Math.floor(rnd() * (t.gold[1] - t.gold[0] + 1));
    m.dead = true; m.fade = 0.3; p.xp += t.xp; p.gold += gold;
    txt(z, m.x, m.y, 56, '+' + t.xp + ' XP', '#4de8ff');
    txt(z, m.x + 10, m.y, 30, '+' + gold + ' gold', '#ffd166');
    while (p.xp >= DB.needXp(p.lvl)) {
      p.xp -= DB.needXp(p.lvl); p.lvl++; p.maxHp += 15; p.hp = p.maxHp;
      txt(z, p.x, p.y, 80, 'LEVEL UP!', '#ff3fd0');
      send(p.ws, { t: 'sys', s: 'Новый уровень: ' + p.lvl });
    }
    persist(p);
  }
  function hurtPlayer(z, p, dmg) {
    if (p.dead || p.dashT > 0) return;
    p.hp -= dmg;
    txt(z, p.x, p.y, 60, '-' + dmg, '#ff5a6a');
    if (p.hp <= 0) { p.hp = 0; p.dead = true; p.respawnT = 3; p.moving = false; }
  }

  function updateMobs(z, dt) {
    const ps = Array.from(z.players).filter(p => !p.dead);
    for (let i = z.mobs.length - 1; i >= 0; i--) {
      const m = z.mobs[i];
      if (m.dead) { m.fade -= dt; if (m.fade <= 0) z.mobs.splice(i, 1); continue; }
      const t = MOBS[m.kind];
      m.atkCd -= dt; m.atkT = Math.max(0, m.atkT - dt);
      let target = null, best = t.aggro;
      for (const p of ps) { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < best) { best = d; target = p; } }
      let mvx = 0, mvy = 0;
      if (target) {
        const dx = target.x - m.x, dy = target.y - m.y, d = best || 1;
        if (d > t.atkRange * 0.85) { mvx = dx / d; mvy = dy / d; }
        else if (m.atkCd <= 0) { m.atkCd = t.atkCd; m.atkT = ATK_TIME; hurtPlayer(z, target, t.dmg); }
        m.fx = dx / d; m.fy = dy / d;
      } else {
        m.wt -= dt;
        if (m.wt <= 0) { m.wt = 1 + rnd() * 2.5; if (rnd() < 0.55) { const a = rnd() * Math.PI * 2; m.wdx = Math.cos(a); m.wdy = Math.sin(a); } else { m.wdx = 0; m.wdy = 0; } }
        mvx = m.wdx * 0.4; mvy = m.wdy * 0.4;
        if (mvx || mvy) { m.fx = m.wdx; m.fy = m.wdy; }
      }
      m.moving = !!(mvx || mvy);
      if (m.moving) {
        const nx = m.x + mvx * t.speed * dt, ny = m.y + mvy * t.speed * dt;
        if (!World.blocked(z.solids, nx, m.y, m.r, m.r * 0.6)) m.x = Math.max(30, Math.min(W - 30, nx)); else m.wdx = -m.wdx;
        if (!World.blocked(z.solids, m.x, ny, m.r, m.r * 0.6)) m.y = Math.max(30, Math.min(H - 30, ny)); else m.wdy = -m.wdy;
      }
    }
  }

  // ---------- игроки ----------
  function useSkill1(z, p) {
    const c = DB.CLASSES[p.cls].s1;
    p.cd1 = c.cd; p.atkT = ATK_TIME;
    for (const m of z.mobs) {
      if (m.dead) continue;
      const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
      if (d > c.range + m.r) continue;
      if ((d > 0 ? (dx * p.fx + dy * p.fy) / d : 1) < c.dot) continue;
      hitMob(z, p, m, c.dmg + (p.lvl - 1) * 3 + Math.floor(rnd() * 5), d > 0 ? dx / d : 0, d > 0 ? dy / d : 1, c.kb);
    }
    z.evs.push({ k: 'fx', t: c.fx, x: r1(p.x), y: r1(p.y), fx: r2(p.fx), fy: r2(p.fy), range: c.range, c: c.color });
  }

  function updatePlayer(z, p, dt) {
    const c = DB.CLASSES[p.cls];
    p.cd1 = Math.max(0, p.cd1 - dt); p.cd2 = Math.max(0, p.cd2 - dt); p.atkT = Math.max(0, p.atkT - dt);
    if (p.dead) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) { p.dead = false; p.hp = p.maxHp; placeInZone(p, 'town', 'start'); }
      return;
    }
    let [mx, my] = dirVec(p.inp.mx, p.inp.my);
    const wants = mx !== 0 || my !== 0;
    let speed = c.speed;
    if (p.dashT > 0) { p.dashT -= dt; mx = p.dashDx; my = p.dashDy; speed = c.s2.dist / DASH_TIME; }
    p.moving = wants || p.dashT > 0;
    if (p.moving) {
      if (p.atkT <= 0 || p.dashT > 0) { p.fx = mx; p.fy = my; }
      const nx = p.x + mx * speed * dt, ny = p.y + my * speed * dt;
      if (!World.blocked(z.solids, nx, p.y, 8, 5)) p.x = nx;
      if (!World.blocked(z.solids, p.x, ny, 8, 5)) p.y = ny;
      p.x = Math.max(16, Math.min(W - 16, p.x));
    }
    if (p.y < 20) { if (z.cfg.up) { placeInZone(p, z.cfg.up, 'up'); return; } p.y = 20; }
    else if (p.y > 780) { if (z.cfg.down) { placeInZone(p, z.cfg.down, 'down'); return; } p.y = 780; }
    if (p.inp.s1 && p.cd1 <= 0) useSkill1(z, p);
    if (p.inp.s2 && p.cd2 <= 0) { p.cd2 = c.s2.cd; p.dashT = DASH_TIME; p.dashDx = mx || p.fx; p.dashDy = my || p.fy; }
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (z.id === 'town' ? 0.05 : 0.008) * dt);
  }

  function dropPlayer(p) {
    if (!p || p.gone) return;
    p.gone = true;
    if (p.zone) zones[p.zone].players.delete(p);
    if (online.get(p.key) === p) online.delete(p.key);
    persist(p);
    broadcastSys(p.name + ' покинул игру');
  }
  function broadcastSys(s) { online.forEach(p => send(p.ws, { t: 'sys', s })); }

  // ---------- главный цикл ----------
  let last = Date.now();
  const loop = setInterval(() => {
    const now = Date.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; tick++;
    for (const id in zones) {
      const z = zones[id];
      if (!z.players.size) { z.emptyT += dt; if (z.emptyT > 30 && z.mobs.length) z.mobs = []; continue; }
      for (const p of Array.from(z.players)) updatePlayer(z, p, dt);
      updateMobs(z, dt);
      z.spawnT -= dt;
      if (z.spawnT <= 0) { z.spawnT = 2.5; fillSpawns(z, false); }
      broadcastZone(z);
    }
  }, TICK_MS);

  function broadcastZone(z) {
    const pl = [], mo = [];
    for (const p of z.players) {
      pl.push({ id: p.id, n: p.name, c: p.cls, g: p.gender, hc: p.hairColor, hl: p.hairLen, x: r1(p.x), y: r1(p.y), fx: r2(p.fx), fy: r2(p.fy),
        hp: Math.ceil(p.hp), mh: p.maxHp, lv: p.lvl, mv: p.moving ? 1 : 0, at: r2(p.atkT), ds: p.dashT > 0 ? 1 : 0, dd: p.dead ? 1 : 0 });
    }
    for (const m of z.mobs) mo.push({ id: m.id, k: m.kind, x: r1(m.x), y: r1(m.y), fx: r2(m.fx), fy: r2(m.fy), hp: Math.ceil(m.hp), mh: m.maxHp, mv: m.moving ? 1 : 0, at: r2(m.atkT), dd: m.dead ? 1 : 0 });
    const shared = JSON.stringify({ p: pl, m: mo, e: z.evs, o: online.size }).slice(1);
    z.evs = [];
    for (const p of z.players) {
      if (p.ws.readyState !== 1) continue;
      const you = { id: p.id, hp: Math.ceil(p.hp), mh: p.maxHp, lv: p.lvl, xp: p.xp, nx: DB.needXp(p.lvl), gold: p.gold, c1: r2(p.cd1), c2: r2(p.cd2), dd: p.dead ? 1 : 0, rs: r1(p.respawnT) };
      p.ws.send('{"t":"s","k":' + tick + ',"z":"' + z.id + '","you":' + JSON.stringify(you) + ',' + shared);
    }
  }

  // ---------- сеть ----------
  const wss = new WebSocketServer({ port: PORT, host: HOST, maxPayload: 4096, perMessageDeflate: false });
  wss.on('listening', () => {
    log('запущен на порту ' + PORT);
    const ips = [];
    Object.values(os.networkInterfaces()).forEach(l => (l || []).forEach(i => { if (i.family === 'IPv4' && !i.internal) ips.push(i.address); }));
    log('адрес для игры на этом компьютере: ws://localhost:' + PORT);
    ips.forEach(ip => log('адрес для друзей в локальной сети: ws://' + ip + ':' + PORT));
  });
  wss.on('error', e => { console.error('[server] ошибка:', e.message); if (opts.onError) opts.onError(e); });

  const pinger = setInterval(() => {
    wss.clients.forEach(ws => { if (ws.isAlive === false) return ws.terminate(); ws.isAlive = false; ws.ping(); });
  }, 20000);

  const tooMany = ip => { const f = failures.get(ip); return !!f && f.n >= 8 && Date.now() - f.t < 60000; };
  const fail = ip => { const f = failures.get(ip); if (!f || Date.now() - f.t > 60000) failures.set(ip, { n: 1, t: Date.now() }); else f.n++; };

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress || '?';
    const c = { ws, player: null, win: Date.now(), cnt: 0 };
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    send(ws, { t: 'hello', v: 1, online: online.size });

    ws.on('message', raw => {
      const now = Date.now();
      if (now - c.win > 1000) { c.win = now; c.cnt = 0; }
      if (++c.cnt > 120) { ws.close(1008, 'flood'); return; }
      let m;
      try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (!m || typeof m.t !== 'string') return;
      try { handle(c, m, ip); } catch (e) { console.error('[server] ошибка обработки', m.t, e.message); }
    });
    ws.on('close', () => dropPlayer(c.player));
  });

  function account(m) { const key = m.token && tokens.get(String(m.token)); return key && db.accounts[key] ? { key, acct: db.accounts[key] } : null; }
  const publicChar = a => a.char ? { name: a.char.name, gender: a.char.gender, cls: a.char.cls, hairColor: a.char.hairColor, hairLen: a.char.hairLen, lvl: a.char.lvl, xp: a.char.xp, gold: a.char.gold } : null;

  function handle(c, m, ip) {
    const ws = c.ws;
    switch (m.t) {
      case 'register':
      case 'login': {
        if (tooMany(ip)) return send(ws, { t: 'auth', ok: false, error: 'Слишком много попыток. Подождите минуту.' });
        const login = String(m.login || '').trim(), pass = String(m.pass || ''), key = login.toLowerCase();
        if (!/^[A-Za-z0-9_]{3,16}$/.test(login) || pass.length < 6 || pass.length > 64) { fail(ip); return send(ws, { t: 'auth', ok: false, error: 'Логин: 3–16 символов (латиница, цифры, _). Пароль: 6–64 символа.' }); }
        let a = db.accounts[key];
        if (m.t === 'register') {
          if (a) return send(ws, { t: 'auth', ok: false, error: 'Этот логин уже занят.' });
          const salt = crypto.randomBytes(16).toString('hex');
          a = db.accounts[key] = { login, salt, hash: hashPass(pass, salt), char: null, created: Date.now() };
          saveSoon();
        } else if (!a || !safeEq(a.hash, hashPass(pass, a.salt))) {
          fail(ip); return send(ws, { t: 'auth', ok: false, error: 'Неверный логин или пароль.' });
        }
        const token = crypto.randomBytes(24).toString('hex');
        tokens.set(token, key);
        return send(ws, { t: 'auth', ok: true, token, login: a.login, char: publicChar(a) });
      }
      case 'me': {   // возобновление сессии по токену (лаунчер при повторном запуске)
        const ac = account(m);
        return send(ws, ac ? { t: 'auth', ok: true, token: String(m.token), login: ac.acct.login, char: publicChar(ac.acct) } : { t: 'auth', ok: false, error: 'Сессия истекла.' });
      }
      case 'create': {
        const ac = account(m); if (!ac) return send(ws, { t: 'char', ok: false, error: 'Сессия истекла, войдите заново.' });
        if (ac.acct.char) return send(ws, { t: 'char', ok: false, error: 'Персонаж уже создан.' });
        const look = DB.cleanAppearance(m.char), name = DB.cleanName(m.char && m.char.name);
        if (!look) return send(ws, { t: 'char', ok: false, error: 'Выберите пол, класс, цвет и длину волос.' });
        if (!name) return send(ws, { t: 'char', ok: false, error: 'Имя: 2–16 символов, буквы, цифры, пробел, «_» или «-».' });
        for (const k in db.accounts) { const o = db.accounts[k].char; if (o && o.name.toLowerCase() === name.toLowerCase()) return send(ws, { t: 'char', ok: false, error: 'Это имя уже занято.' }); }
        ac.acct.char = Object.assign({ name, lvl: 1, xp: 0, gold: 0, zone: 'town' }, look);
        saveSoon();
        return send(ws, { t: 'char', ok: true, char: publicChar(ac.acct) });
      }
      case 'hair': {   // пол и класс после создания менять нельзя, причёску - можно
        const ac = account(m); if (!ac || !ac.acct.char) return send(ws, { t: 'char', ok: false, error: 'Сессия истекла, войдите заново.' });
        const look = DB.cleanAppearance(Object.assign({}, ac.acct.char, { hairColor: m.hairColor, hairLen: m.hairLen }));
        if (!look) return send(ws, { t: 'char', ok: false, error: 'Неверные параметры причёски.' });
        ac.acct.char.hairColor = look.hairColor; ac.acct.char.hairLen = look.hairLen;
        saveSoon();
        return send(ws, { t: 'char', ok: true, char: publicChar(ac.acct) });
      }
      case 'join': {
        const ac = account(m);
        if (!ac || !ac.acct.char) return send(ws, { t: 'error', error: 'Нет активной сессии или персонажа. Вернитесь в лаунчер.' });
        const old = online.get(ac.key);
        if (old) { send(old.ws, { t: 'error', error: 'Вы вошли с другого места.' }); old.ws.close(4001, 'duplicate'); dropPlayer(old); }
        const p = makePlayer(ws, ac.key, ac.acct.char);
        c.player = p; online.set(ac.key, p);
        const start = World.ZONES[ac.acct.char.zone] ? ac.acct.char.zone : 'town';
        send(ws, { t: 'welcome', id: p.id, name: p.name });
        placeInZone(p, start, 'start');
        broadcastSys(p.name + ' вошёл в игру');
        return;
      }
      case 'input': {
        const p = c.player; if (!p) return;
        const i = p.inp, n = v => (typeof v === 'number' && isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
        i.mx = n(m.mx); i.my = n(m.my); i.s1 = m.s1 === true || m.s1 === 1; i.s2 = m.s2 === true || m.s2 === 1;
        return;
      }
      case 'chat': {
        const p = c.player; if (!p) return;
        const now = Date.now(); if (now - p.chatT < 700) return;
        const text = String(m.text || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
        if (!text) return;
        p.chatT = now;
        online.forEach(o => send(o.ws, { t: 'chat', id: p.id, from: p.name, text }));
        return;
      }
      case 'ping': return send(ws, { t: 'pong', ts: m.ts });
      default: return;
    }
  }

  function stop() {
    clearInterval(loop); clearInterval(pinger);
    wss.clients.forEach(ws => ws.close());
    wss.close();
    flush();
  }
  return { wss, stop, db: () => db, port: PORT };
}

module.exports = { start };

if (require.main === module) {
  const srv = start();
  const bye = () => { srv.stop(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
