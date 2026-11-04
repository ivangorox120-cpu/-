// Процедурные люди 90-х: скелет из шарниров, разнообразная внешность, позы со смешиванием, мимика.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- общие ресурсы ----------
const matCache = new Map();
function mat(color, rough = .85, metal = 0, extra) {
  const k = color + '|' + rough + '|' + metal + (extra ? JSON.stringify(extra) : '');
  let m = matCache.get(k); if (!m) { m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra || {})); matCache.set(k, m); }
  return m;
}
const G = {
  cap: (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10),
  sph: new THREE.SphereGeometry(1, 16, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cone: new THREE.CylinderGeometry(.7, 1, 1, 16, 1, true),
  half: new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * .5),
  torus: new THREE.TorusGeometry(1, .28, 8, 18),
};
const capCache = new Map();
const capG = (r, l) => { const k = r.toFixed(3) + '_' + l.toFixed(3); let g = capCache.get(k); if (!g) { g = G.cap(r, l); capCache.set(k, g); } return g; };
function part(geo, m, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0, parent, shadow = false) {
  const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = shadow; parent.add(o); return o;
}
function pivot(parent, x, y, z) { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; }

// стипы ткани: полоски «Адидас» на спортивных костюмах
const stripeTex = (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 16, 64); const t = new THREE.CanvasTexture(c); return t; })();

// ---------- палитры эпохи ----------
const SKIN = ['#e8bfa0', '#d9a888', '#cf9c7c', '#e2b494', '#c99272'];
const HAIR = ['#2a1d14', '#3b2a1c', '#4e3826', '#1a1612', '#6b5236', '#8a6b48'];
const GRAY = ['#9a958e', '#b8b3ab', '#d0ccc4', '#7d7870'];
const DARK_COATS = ['#23272b', '#2e2a26', '#30353a', '#3a3328', '#262c35', '#3d3a36'];
const BOLONYA = ['#28405e', '#4a2a2e', '#2f4a3a', '#5a4a2e', '#3b3f52', '#5e2f25'];
const OLD_COATS = ['#4a3b33', '#5b4a3f', '#3c3f4a', '#6a5546', '#4e4237', '#5a3d3d'];
const SCARF = ['#8a2a2a', '#6a5a8a', '#4f6a4a', '#a88a3a', '#7a3a5a', '#bbb39e'];
const HATS = ['#2b2b2b', '#4a3a2a', '#5a2a2a', '#283a5a', '#3a4a3a', '#6a6a6a'];
const TRACK = [['#1d2f6b', '#ffffff'], ['#151515', '#ffffff'], ['#5a1a1a', '#ffffff'], ['#1f4a3a', '#ffffff'], ['#3a2a6a', '#e8e8e8']];

// ---------- генерация внешности ----------
export function makeLook(kind) {
  const L = { kind };
  const male = kind !== 'babka' && kind !== 'neighbor' && !(kind === 'vendor' && Math.random() < .45);
  L.male = male;
  L.age = { worker: rnd(30, 55), babka: rnd(58, 76), neighbor: rnd(50, 70), youth: rnd(17, 25), school: rnd(12, 15), gopnik: rnd(18, 30), vendor: rnd(35, 60), police: rnd(28, 50), newrus: rnd(28, 45), racket: rnd(22, 35), chelnok: rnd(30, 50) }[kind] || rnd(25, 50);
  L.height = (male ? rnd(1.68, 1.9) : rnd(1.52, 1.68)) * (kind === 'school' ? .86 : 1) * (L.age > 60 ? .97 : 1);
  L.build = { worker: rnd(1, 1.2), gopnik: rnd(1.05, 1.25), youth: rnd(.85, 1.05), school: rnd(.8, .95), babka: rnd(.9, 1.15), vendor: rnd(1, 1.25), newrus: rnd(1.1, 1.35), racket: rnd(1.1, 1.3), police: rnd(1, 1.15), neighbor: rnd(1, 1.2), chelnok: rnd(1, 1.2) }[kind] || 1;
  L.stoop = L.age > 55 ? rnd(.12, .25) : kind === 'worker' ? rnd(.03, .1) : kind === 'gopnik' ? rnd(.04, .1) : rnd(0, .05);
  L.skin = pick(SKIN); L.headScale = rnd(.95, 1.08); L.jaw = rnd(.9, 1.12);
  L.hair = L.age > 55 ? pick(GRAY) : pick(HAIR);
  L.hairStyle = male ? (kind === 'gopnik' || kind === 'racket' ? pick(['buzz', 'buzz', 'bald']) : pick(['short', 'short', 'buzz', 'side'])) : pick(['bun', 'short', 'perm']);
  L.facial = male && L.age > 20 ? pick(['none', 'stubble', 'stubble', 'mustache', kind === 'worker' ? 'mustache' : 'none']) : 'none';
  L.gloves = Math.random() < .5 ? pick(['#2a2a2a', '#4a3a2a', '#6a2a2a']) : null;
  L.scarf = Math.random() < (kind === 'babka' ? .8 : .45) ? pick(SCARF) : null;
  L.bag = null; L.stripes = null;
  switch (kind) {
    case 'babka': case 'neighbor':
      L.top = pick(OLD_COATS); L.coat = true; L.pants = '#2a2622'; L.boots = pick(['#2a1f18', '#1c1a18']);
      L.hat = kind === 'babka' && Math.random() < .55 ? 'platok' : pick(['beret', 'shapka']); L.hatC = L.hat === 'platok' ? pick(['#7a2a2a', '#5a4a6a', '#8a7a5a', '#3a4a6a']) : pick(HATS);
      L.bag = pick(['avoska', 'sumka']); break;
    case 'worker': case 'chelnok':
      L.top = Math.random() < .5 ? pick(BOLONYA) : pick(DARK_COATS); L.puffy = Math.random() < .5; L.pants = pick(['#22252a', '#2d2a26', '#33302b']);
      L.boots = pick(['#1c1a18', '#2a1f18']); L.hat = pick(['shapka', 'shapka', 'ushanka', 'kepka', 'none']); L.hatC = pick(HATS);
      if (kind === 'chelnok') L.bag = 'kletchataya'; break;
    case 'youth': case 'school': {
      const sporty = Math.random() < .5;
      if (sporty) { const [c, s] = pick(TRACK); L.top = c; L.stripes = s; L.pants = c; } else { L.top = pick(['#151515', '#2a1d16', ...BOLONYA]); L.leather = L.top === '#151515' || L.top === '#2a1d16'; L.pants = pick(['#5d7ea8', '#4a6a94', '#3b4f70']); }
      L.boots = pick(['#1a1a1a', '#e0e0e0', '#2a2a2a']); L.hat = pick(['shapka', 'none', 'kepka', 'none']); L.hatC = pick(HATS);
      if (kind === 'school') L.bag = 'ranec'; break;
    }
    case 'gopnik': case 'racket': {
      const [c, s] = pick(TRACK);
      if (Math.random() < .55) { L.top = c; L.stripes = s; L.pants = c; } else { L.top = pick(['#121212', '#1b1b1d', '#222']); L.leather = true; L.puffy = !L.leather; L.pants = Math.random() < .6 ? c : '#1d1d20'; L.stripes = L.pants === c ? s : null; L.legStripes = !!L.stripes; L.stripes = null; }
      if (L.stripes) L.legStripes = true;
      L.boots = pick(['#111', '#1a1a1a', '#e8e8e8']); L.hat = pick(['kepka', 'shapka', 'none', 'none']); L.hatC = pick(['#111', '#1a1a2a', '#2a2a2a']);
      L.facial = pick(['none', 'stubble']); if (kind === 'racket') { L.chain = true; L.hat = 'none'; } break;
    }
    case 'vendor':
      L.top = pick(['#5a4a3a', '#3a4a3a', '#6a5a4a', '#4a3a3a']); L.apron = pick(['#c8c0b0', '#8a9aa8', '#b06a5a']); L.pants = '#2a2622'; L.boots = '#1c1a18';
      L.hat = pick(['shapka', 'platok', 'ushanka']); L.hatC = L.hat === 'platok' ? '#7a3a3a' : pick(HATS); L.puffy = true; break;
    case 'police':
      L.top = '#3b4a5e'; L.pants = '#3b4a5e'; L.boots = '#111'; L.hat = 'zimnyaya'; L.hatC = '#4a4a52'; L.facial = pick(['none', 'mustache']); L.puffy = true; break;
    case 'newrus':
      L.top = '#9a1d42'; L.pants = '#1a1a1e'; L.boots = '#111'; L.hat = 'none'; L.chain = true; L.hairStyle = 'buzz'; break;
    default:
      L.top = pick(DARK_COATS); L.pants = '#2a2a2a'; L.boots = '#1c1a18'; L.hat = 'shapka'; L.hatC = pick(HATS);
  }
  // характер
  L.walkSpeed = { babka: rnd(.75, .95), neighbor: rnd(.8, 1), school: rnd(1.25, 1.45), youth: rnd(1.2, 1.4), gopnik: rnd(1.05, 1.25) }[kind] || rnd(1.05, 1.3);
  L.aggression = kind === 'gopnik' || kind === 'racket' ? rnd(.35, 1) : kind === 'youth' ? rnd(0, .45) : rnd(0, .15);
  L.nerve = kind === 'gopnik' ? rnd(.2, .9) : rnd(0, .4); // смелость против угроз
  L.swagger = kind === 'gopnik' || kind === 'racket' ? rnd(.5, 1) : kind === 'youth' ? rnd(0, .5) : 0;
  return L;
}

// ---------- построение тела ----------
export function buildHuman(L, staticModel) {
  const H = L.height, b = L.build;
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);
  const legLen = H * .47, torsoLen = H * .29, headR = H * .067 * L.headScale;
  const hipW = .09 * b + (L.male ? 0 : .015), shW = .19 * b + (L.male ? .02 : 0);
  const topM = L.leather ? mat(L.top, .38, .1) : L.puffy ? mat(L.top, .55, .05) : mat(L.top, .88);
  const pantsM = mat(L.pants, L.pants.startsWith('#5') || L.pants.startsWith('#4a6') || L.pants.startsWith('#3b4f') ? .9 : .82);
  const skinM = mat(L.skin, .7), bootM = mat(L.boots, .45, .05), hairM = mat(L.hair, .95);
  const R = { root, body, L };
  const hips = pivot(body, 0, legLen, 0); R.hips = hips;
  const spine = pivot(hips, 0, .02, 0); R.spine = spine;

  if (staticModel) {
    // рабочий из присланной модели: части меша закреплены на тех же шарнирах
    const s = H / 1.93;
    const P = staticModel; // { torso, head, armL, armR, legL, legR } (геометрии с центром в шарнире)
    root.userData.static = true;
    const sm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
    hips.position.y = .95 * s; spine.position.y = 0;
    part(P.torso, sm, s, s, s, 0, -0.95 * s, 0, spine, true);
    R.neck = pivot(spine, 0, (1.55 - .95) * s, 0); R.head = pivot(R.neck, 0, 0, 0); part(P.head, sm, s, s, s, 0, 0, 0, R.head, true);
    R.shL = pivot(spine, .2 * s, (1.45 - .95) * s, 0); R.shR = pivot(spine, -.2 * s, (1.45 - .95) * s, 0);
    part(P.armL, sm, s, s, s, 0, 0, 0, R.shL, true); part(P.armR, sm, s, s, s, 0, 0, 0, R.shR, true);
    R.elL = pivot(R.shL, 0, -.3 * s, 0); R.elR = pivot(R.shR, 0, -.3 * s, 0);
    R.thL = pivot(hips, .1 * s, 0, 0); R.thR = pivot(hips, -.1 * s, 0, 0);
    part(P.legL, sm, s, s, s, 0, 0, 0, R.thL, true); part(P.legR, sm, s, s, s, 0, 0, 0, R.thR, true);
    R.knL = pivot(R.thL, 0, -.45 * s, 0); R.knR = pivot(R.thR, 0, -.45 * s, 0);
    R.face = null; R.legLen = .95 * s; R.stride = .65 * s;
    return R;
  }

  // ноги
  const thighL = legLen * .5, shinL = legLen * .5, legR = .062 * b;
  for (const side of [1, -1]) {
    const th = pivot(hips, side * hipW, 0, 0);
    part(capG(legR, thighL - legR * 2), pantsM, 1, 1, 1, 0, -thighL / 2, 0, th, true);
    const kn = pivot(th, 0, -thighL, 0);
    part(capG(legR * .82, shinL - legR * 2), pantsM, 1, 1, 1, 0, -shinL / 2, 0, kn, true);
    if (L.legStripes) part(G.box, mat(L.stripes || '#fff', .8), .012, legLen * .9, .02, side * legR * .95, -legLen * .2, 0, th);
    const ft = part(G.box, bootM, .11 * Math.min(b, 1.1), .1, .26, 0, -shinL + .02, .05, kn, true);
    if (side > 0) { R.thL = th; R.knL = kn; R.ftL = ft; } else { R.thR = th; R.knR = kn; R.ftR = ft; }
  }
  // длинное пальто — юбка-конус от бёдер
  if (L.coat) { const sk = part(G.cone, topM, .2 * b + .04, legLen * .55, .16 * b + .03, 0, -legLen * .25, 0, hips, true); sk.material = mat(L.top, .9, 0, { side: THREE.DoubleSide }); R.skirt = sk; }
  // туловище
  const puff = L.puffy ? 1.12 : 1;
  const torso = part(capG(.16 * b * puff, torsoLen * .62), topM, (shW / .16 / b) * .82, 1, .72, 0, torsoLen * .5, 0, spine, true);
  torso.scale.x = (shW + .02) / (.16 * b * puff); R.torso = torso;
  if (L.apron) part(G.box, mat(L.apron, .9), shW * 1.5, torsoLen * 1.1, .02, 0, torsoLen * .25, .13 * b, spine);
  if (L.stripes) for (const s of [1, -1]) part(G.box, mat(L.stripes, .8), .02, torsoLen * .5, .02, s * .06, torsoLen * .62, .12 * b * puff, spine);
  if (L.leather) part(G.box, mat('#0c0c0c', .3), .16 * b, .06, .05, 0, torsoLen * .95, .1 * b, spine); // воротник
  if (L.chain) { const c = part(G.torus, mat('#d4a72c', .25, .9), .085, .085, .085, 0, torsoLen * .92, .07, spine); c.rotation.x = Math.PI / 2.3; }
  if (L.scarf) { const sc = part(G.torus, mat(L.scarf, .95), .075 * b, .075 * b, .1, 0, torsoLen + .02, 0, spine); sc.rotation.x = Math.PI / 2; part(G.box, mat(L.scarf, .95), .06, .22, .03, .04, torsoLen * .8, .1 * b, spine); }
  if (L.kind === 'police') { part(G.box, mat('#c9a227', .4, .7), .03, .03, .01, .08, torsoLen * .8, .13 * b, spine); }
  // руки
  const upA = H * .17, foA = H * .16, armR = .05 * b * puff;
  for (const side of [1, -1]) {
    const sh = pivot(spine, side * (shW + .01), torsoLen * .92, 0);
    part(capG(armR, upA - armR * 2), topM, 1, 1, 1, 0, -upA / 2, 0, sh, true);
    if (L.stripes) part(G.box, mat(L.stripes, .8), .012, upA * .9, .015, side * armR * .95, -upA / 2, 0, sh);
    const el = pivot(sh, 0, -upA, 0);
    part(capG(armR * .85, foA - armR * 1.8), topM, 1, 1, 1, 0, -foA / 2, 0, el, true);
    const hand = part(G.sph, L.gloves ? mat(L.gloves, .8) : skinM, .045, .06, .03, 0, -foA - .02, 0, el);
    if (side > 0) { R.shL = sh; R.elL = el; R.handL = hand; } else { R.shR = sh; R.elR = el; R.handR = hand; }
  }
  // сумки
  if (L.bag === 'avoska') { const a = part(G.sph, mat('#6b8f4f', .9, 0, { wireframe: true }), .12, .14, .08, 0, -foA - .16, .02, R.elR); R.bag = a; }
  if (L.bag === 'sumka') part(G.box, mat('#3a2a20', .5), .22, .18, .08, 0, -foA - .12, 0, R.elR, true);
  if (L.bag === 'kletchataya') { const t = new THREE.MeshStandardMaterial({ map: checkerTex(), roughness: .8 }); part(G.box, t, .55, .42, .28, 0, -foA - .2, .05, R.elR, true); }
  if (L.bag === 'ranec') part(G.box, mat('#7a3a2a', .7), .28, .32, .14, 0, torsoLen * .5, -.16 * b, spine, true);
  // шея и голова
  R.neck = pivot(spine, 0, torsoLen + .02, 0);
  part(G.cyl, skinM, .045, .08, .045, 0, .04, 0, R.neck);
  const head = pivot(R.neck, 0, .08 + headR, 0); R.head = head;
  part(G.sph, skinM, headR * .92, headR * 1.08, headR * .98, 0, 0, 0, head, true);
  part(G.sph, skinM, headR * .75 * L.jaw, headR * .55, headR * .8, 0, -headR * .45, .01, head); // челюсть
  part(G.sph, skinM, headR * .18, headR * .28, headR * .14, headR * .93, 0, 0, head); part(G.sph, skinM, headR * .18, headR * .28, headR * .14, -headR * .93, 0, 0, head); // уши
  part(G.box, skinM, headR * .22, headR * .42, headR * .3, 0, -headR * .05, headR * .95, head); // нос
  // лицо
  const eyeM = mat('#141414', .4), F = {};
  F.eyeL = part(G.sph, eyeM, headR * .1, headR * .08, headR * .05, headR * .34, headR * .17, headR * .86, head);
  F.eyeR = part(G.sph, eyeM, headR * .1, headR * .08, headR * .05, -headR * .34, headR * .17, headR * .86, head);
  const browM = mat(L.age > 55 ? '#8a857e' : L.hair, .95);
  F.browL = part(G.box, browM, headR * .34, headR * .07, headR * .06, headR * .34, headR * .36, headR * .87, head);
  F.browR = part(G.box, browM, headR * .34, headR * .07, headR * .06, -headR * .34, headR * .36, headR * .87, head);
  F.mouth = part(G.box, mat('#6a3a32', .6), headR * .4, headR * .07, headR * .05, 0, -headR * .42, headR * .86, head);
  if (L.age > 50) for (const s of [1, -1]) part(G.box, mat('#b98f75', .8), headR * .02, headR * .25, headR * .02, s * headR * .32, -headR * .25, headR * .88, head); // морщины-складки
  if (L.facial === 'stubble') part(G.sph, mat('#3a3029', .95, 0, { transparent: true, opacity: .45 }), headR * .78 * L.jaw, headR * .5, headR * .82, 0, -headR * .5, .012, head);
  if (L.facial === 'mustache') part(G.box, mat(L.age > 55 ? '#8a857e' : L.hair, .95), headR * .5, headR * .1, headR * .08, 0, -headR * .27, headR * .9, head);
  R.face = F;
  // волосы и шапки
  const hatM = mat(L.hatC || '#333', .95);
  const hairCap = (sy = .62) => part(G.half, hairM, headR * 1.0, headR * sy * 1.6, headR * 1.03, 0, headR * .12, -headR * .03, head);
  if (L.hat === 'none' || L.hat === 'kepka') {
    if (L.hairStyle === 'short' || L.hairStyle === 'side') hairCap(.62);
    else if (L.hairStyle === 'buzz') part(G.half, mat(L.hair, .98, 0, { transparent: true, opacity: .7 }), headR * .96, headR * 1.0, headR * 1.0, 0, headR * .12, -headR * .02, head);
    else if (L.hairStyle === 'perm') { hairCap(.7); part(G.sph, hairM, headR * 1.1, headR * .8, headR * 1.05, 0, headR * .35, -headR * .12, head); }
    else if (L.hairStyle === 'bun') { hairCap(.65); part(G.sph, hairM, headR * .35, headR * .35, headR * .35, 0, headR * .35, -headR * 1.0, head); }
  }
  if (L.hat === 'shapka') { part(G.half, hatM, headR * 1.06, headR * 1.25, headR * 1.08, 0, headR * .15, 0, head); part(G.cyl, hatM, headR * 1.07, headR * .3, headR * 1.08, 0, headR * .25, 0, head); }
  if (L.hat === 'ushanka') { const um = mat(pick(['#4a3a2a', '#2a2622', '#5a4a3a']), 1); part(G.cyl, um, headR * 1.18, headR * .75, headR * 1.15, 0, headR * .55, 0, head); for (const s of [1, -1]) part(G.box, um, headR * .25, headR * .8, headR * .8, s * headR * 1.0, headR * .0, 0, head); part(G.box, um, headR * 1.6, headR * .35, headR * .3, 0, headR * .62, headR * .95, head); }
  if (L.hat === 'kepka') { part(G.cyl, hatM, headR * 1.08, headR * .3, headR * 1.1, 0, headR * .62, 0, head); part(G.box, hatM, headR * 1.3, headR * .06, headR * .8, 0, headR * .55, headR * .9, head); }
  if (L.hat === 'beret') part(G.sph, hatM, headR * 1.15, headR * .4, headR * 1.15, 0, headR * .72, -headR * .05, head);
  if (L.hat === 'platok') { part(G.sph, hatM, headR * 1.08, headR * 1.1, headR * 1.08, 0, headR * .12, -headR * .06, head); part(G.box, hatM, headR * .5, headR * .5, headR * .2, 0, -headR * 1.0, -headR * .2, head).rotation.x = .4; }
  if (L.hat === 'zimnyaya') { part(G.cyl, hatM, headR * 1.15, headR * .8, headR * 1.15, 0, headR * .55, 0, head); part(G.box, mat('#c9a227', .4, .7), headR * .25, headR * .25, headR * .05, 0, headR * .6, headR * 1.15, head); }
  R.legLen = legLen; R.stride = legLen * 1.25;
  return R;
}
let _checker;
function checkerTex() { if (_checker) return _checker; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#b03a2e' : '#2d4f86'; g.fillRect(i * 16, j * 16, 16, 16); } g.strokeStyle = '#eee'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, 64); g.stroke(); g.beginPath(); g.moveTo(0, i * 16); g.lineTo(64, i * 16); g.stroke(); } _checker = new THREE.CanvasTexture(c); _checker.colorSpace = THREE.SRGBColorSpace; return _checker; }

// разрезаем статичную модель рабочего на части по положению треугольников
export function splitStaticModel(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color;
  const parts = { torso: [], head: [], armL: [], armR: [], legL: [], legR: [] };
  const n = pos.count;
  for (let t = 0; t < n; t += 3) {
    let cx = 0, cy = 0; for (let k = 0; k < 3; k++) { cx += pos.getX(t + k); cy += pos.getY(t + k); } cx /= 3; cy /= 3;
    let p = 'torso';
    if (cy > 1.56) p = 'head'; else if (cy < .93) p = cx > 0 ? 'legL' : 'legR'; else if (Math.abs(cx) > .21 && cy < 1.52) p = cx > 0 ? 'armL' : 'armR';
    parts[p].push(t);
  }
  const PIV = { torso: [0, .95, 0], head: [0, 1.55, 0], armL: [.2, 1.45, 0], armR: [-.2, 1.45, 0], legL: [.1, .95, 0], legR: [-.1, .95, 0] };
  const out = {};
  for (const k in parts) {
    const tris = parts[k], m = tris.length * 3, P = new Float32Array(m * 3), N = new Float32Array(m * 3), C = col ? new Float32Array(m * 3) : null;
    let i = 0; const [px, py, pz] = k === 'torso' ? [0, 0, 0] : PIV[k];
    for (const t of tris) for (let v = 0; v < 3; v++, i++) {
      P[i * 3] = pos.getX(t + v) - px; P[i * 3 + 1] = pos.getY(t + v) - py; P[i * 3 + 2] = pos.getZ(t + v) - pz;
      N[i * 3] = nor.getX(t + v); N[i * 3 + 1] = nor.getY(t + v); N[i * 3 + 2] = nor.getZ(t + v);
      if (C) { C[i * 3] = col.getX(t + v); C[i * 3 + 1] = col.getY(t + v); C[i * 3 + 2] = col.getZ(t + v); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); if (C) g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    out[k] = g;
  }
  return out;
}

// ---------- позы и анимация ----------
// у каждого шарнира есть целевые углы; текущие плавно тянутся к целям (смешивание)
const JOINTS = ['hips', 'spine', 'neck', 'head', 'shL', 'shR', 'elL', 'elR', 'thL', 'thR', 'knL', 'knR'];
export class Human {
  constructor(look, staticModel) {
    this.L = look; this.R = buildHuman(look, staticModel); this.obj = this.R.root;
    this.anim = 'idle'; this.phase = Math.random() * 6; this.t = Math.random() * 10; this.expr = 'neutral';
    this.target = {}; for (const j of JOINTS) this.target[j] = new THREE.Euler();
    this.lookYaw = 0; this.lookPitch = 0; this.nextGlance = rnd(2, 6); this.blend = 7; this.speed = 0;
    this.obj.userData.human = this;
  }
  setAnim(a) { if (this.anim !== a) { this.anim = a; this.t = 0; } }
  // dist — пройденное за кадр расстояние (шаг привязан к нему, ноги не скользят)
  update(dt, dist = 0, onStep) {
    const R = this.R, L = this.L, T = this.target, a = this.anim;
    this.t += dt;
    for (const j of JOINTS) T[j].set(0, 0, 0);
    let bob = 0, lean = L.stoop, sway = 0;
    const moving = a === 'walk' || a === 'run' || a === 'flee';
    if (moving) {
      const stride = R.stride * (a === 'walk' ? 1 : 1.5);
      const prev = this.phase; this.phase += (dist / stride) * Math.PI;
      if (onStep && Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) onStep();
      const p = this.phase, run = a !== 'walk', amp = run ? .8 : .42 * (L.age > 60 ? .7 : 1);
      T.thL.x = Math.sin(p) * amp; T.thR.x = -Math.sin(p) * amp;
      T.knL.x = Math.max(0, -Math.cos(p)) * amp * (run ? 1.6 : 1.2) + .05; T.knR.x = Math.max(0, Math.cos(p)) * amp * (run ? 1.6 : 1.2) + .05;
      const arm = (run ? .9 : .38) * (L.swagger > .5 ? 1.3 : 1);
      T.shL.x = -Math.sin(p) * arm; T.shR.x = Math.sin(p) * arm; T.elL.x = -(run ? 1.3 : .25); T.elR.x = -(run ? 1.3 : .25);
      T.shL.z = .08 + L.swagger * .12; T.shR.z = -.08 - L.swagger * .12;
      T.spine.y = Math.sin(p) * (.06 + L.swagger * .12);
      bob = Math.abs(Math.cos(p)) * (run ? .05 : .025); lean += run ? .22 : .04; sway = Math.sin(p) * (.02 + L.swagger * .03);
      if (a === 'flee') { T.head.y = Math.sin(this.t * 3) * .4; }
    } else {
      const br = Math.sin(this.t * 1.7) * .02;
      T.spine.x = br; T.shL.z = .07; T.shR.z = -.07; T.elL.x = -.12; T.elR.x = -.12;
      sway = Math.sin(this.t * .5) * .012; T.hips.z = Math.sin(this.t * .5) * .03;
      if (a === 'idle' || a === 'wait') { this.nextGlance -= dt; if (this.nextGlance < 0) { this.nextGlance = rnd(2, 6); this.lookYaw = rnd(-.7, .7); this.lookPitch = rnd(-.15, .1); } }
      if (a === 'wait' && (this.t % 9) > 7) { T.shL.x = -1.1; T.elL.x = -1.6; T.shL.z = .3; T.head.x = .35; this.lookYaw = .4; } // смотрит на часы
      if (a === 'wait') { T.thL.x = Math.max(0, Math.sin(this.t * 1.3)) * .1; T.knL.x = T.thL.x * 1.5; } // переминается
      if (a === 'inspect') { lean += .18; T.head.x = .35; T.shR.x = -.9; T.elR.x = -1.9; T.shR.z = .2; this.lookYaw = Math.sin(this.t * .7) * .35; this.lookPitch = .2; }
      if (a === 'talk') { T.shR.x = -.6 + Math.sin(this.t * 4) * .3; T.elR.x = -1.0 + Math.sin(this.t * 5.3) * .3; T.head.x = Math.sin(this.t * 3.1) * .08; this.lookYaw *= .9; }
      if (a === 'pay' || a === 'receive') { T.shR.x = -1.25; T.elR.x = -.35; if (a === 'receive') { T.shL.x = -1.1; T.elL.x = -.4; } lean += .08; }
      if (a === 'count') { T.shL.x = -.9; T.elL.x = -1.2; T.shR.x = -.9; T.elR.x = -1.3 + Math.sin(this.t * 9) * .15; T.head.x = .45; }
      if (a === 'threaten') { T.shR.x = -1.6 + Math.sin(this.t * 6) * .25; T.elR.x = -1.4; T.shR.z = -.2; lean += .14; T.head.x = -.1; T.shL.z = .3; T.elL.x = -.9; }
      if (a === 'smoke') { const k = (this.t % 6) < 2 ? 1 : 0; T.shR.x = -.3 - k * 1.2; T.elR.x = -.5 - k * 1.7; T.shR.z = -.15; T.shL.x = .1; T.elL.x = -.4; }
      if (a === 'handsUp') { T.shL.x = -2.9; T.shR.x = -2.9; T.shL.z = .35; T.shR.z = -.35; T.elL.x = -.5; T.elR.x = -.5; lean -= .05; this.lookYaw = 0; }
      if (a === 'scared') { lean -= .15; T.shL.x = -1.4; T.shR.x = -1.4; T.elL.x = -1.6; T.elR.x = -1.6; T.shL.z = -.25; T.shR.z = .25; T.head.x = .25; T.thL.x = .15; T.knL.x = .3; }
      if (a === 'pocket') { T.shL.x = .15; T.shR.x = .15; T.elL.x = -.6; T.elR.x = -.6; T.shL.z = .25; T.shR.z = -.25; }
    }
    if (a !== 'handsUp' && a !== 'scared') { T.neck.y = this.lookYaw * .4; T.head.y = this.lookYaw * .6; T.head.x += this.lookPitch; }
    T.spine.x += lean;
    // смешивание
    const k = 1 - Math.exp(-this.blend * dt);
    for (const j of JOINTS) { const o = R[j]; if (!o) continue; const tg = T[j]; o.rotation.x += (tg.x - o.rotation.x) * k; o.rotation.y += (tg.y - o.rotation.y) * k; o.rotation.z += (tg.z - o.rotation.z) * k; }
    R.body.position.y += (bob - R.body.position.y) * Math.min(1, dt * 20); R.body.rotation.z += (sway - R.body.rotation.z) * k;
    if (R.skirt) R.skirt.rotation.x = -(R.thL.rotation.x + R.thR.rotation.x) * .15;
    this.updateFace(dt);
  }
  setExpr(e) { this.expr = e; }
  updateFace(dt) {
    const F = this.R.face; if (!F) return;
    const e = this.expr, k = Math.min(1, dt * 8);
    const tg = { neutral: [1, 1, 0, 0], smile: [1.2, .8, .1, 0], angry: [1.1, .9, -.35, -.04], scared: [.6, 3.2, .3, .03], talk: [1, 1 + Math.abs(Math.sin(this.t * 14)) * 2.5, 0, 0], tired: [.9, .8, .15, -.02] }[e] || [1, 1, 0, 0];
    F.mouth.scale.x += (tg[0] * this.R.head.children[0].scale.x * .4 / 1 - F.mouth.scale.x) * 0; // ширину рта держим
    const base = F.mouth.userData.base || (F.mouth.userData.base = F.mouth.scale.clone());
    F.mouth.scale.x += (base.x * tg[0] - F.mouth.scale.x) * k; F.mouth.scale.y += (base.y * tg[1] - F.mouth.scale.y) * k;
    F.browL.rotation.z += (tg[2] - F.browL.rotation.z) * k; F.browR.rotation.z += (-tg[2] - F.browR.rotation.z) * k;
    const by = F.browL.userData.y ?? (F.browL.userData.y = F.browL.position.y);
    F.browL.position.y = F.browR.position.y = by + tg[3];
    // моргание
    const bl = (this.t % 4.3) < .12 ? .15 : 1; F.eyeL.scale.y = F.eyeR.scale.y = (F.eyeL.userData.sy ?? (F.eyeL.userData.sy = F.eyeL.scale.y)) * bl;
  }
}
