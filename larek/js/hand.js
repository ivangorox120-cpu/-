// Скелетная правая кисть для привычек (курение, выпивка).
// Система координат кисти: запястье в начале, пальцы смотрят в −Z, тыльная сторона +Y, ладонь −Y, большой палец со стороны −X.
// У каждого пальца три сустава (MCP — пястно-фаланговый, PIP, DIP), у большого — CMC, MCP, IP.
// Поза задаётся углами сгиба (рад, положительный — к ладони) и разведением пальцев; позы плавно смешиваются.
import * as THREE from 'three';

const FINGERS = [ // имя, x костяшки, z костяшки, длины фаланг, радиус
  ['index',  -.026, -.088, [.044, .027, .021], .0096],
  ['middle', -.007, -.092, [.048, .029, .022], .0098],
  ['ring',    .011, -.088, [.043, .026, .020], .0092],
  ['pinky',   .028, -.081, [.035, .021, .017], .0084],
];
const THUMB = [[.038, .012], [.030, .0108], [.025, .0098]]; // пястная, проксимальная, дистальная

// библиотека поз: для пальца [MCP, PIP, DIP, разведение (+ к большому пальцу −X, − к мизинцу +X)], для большого [CMC, MCP, IP, отведение]
export const HAND_POSES = {
  relaxed: { index: [.25, .3, .2, .04], middle: [.3, .35, .2, 0], ring: [.35, .4, .25, -.03], pinky: [.4, .45, .3, -.06], thumb: [.15, .15, .1, .1] },
  open:    { index: [.05, .05, .03, .08], middle: [.05, .05, .03, .02], ring: [.06, .06, .04, -.04], pinky: [.08, .08, .05, -.1], thumb: [-.1, 0, 0, .35] },
  // Покой: сигарета зажата ближе к кончикам между указательным и средним пальцами, кончики пальцев слегка согнуты и выступают над сигаретой совсем немного
  pinch:   { index: [.14, .28, .20, .06], middle: [.18, .32, .22, -.05], ring: [.88, 1.22, .78, -.04], pinky: [1.12, 1.32, .85, -.08], thumb: [.08, .12, .08, .42] },
  // Затяжка у рта: левый (средний) палец согнут чуть сильнее, так что его кончик находится точно на уровне стыка оранжевого фильтра и белой бумаги, а правый (указательный) выступает чуть выше справа
  pinchHard: { index: [.08, .20, .14, .10], middle: [.22, .42, .30, -.08], ring: [1.30, 1.45, .90, -.05], pinky: [1.40, 1.50, .95, -.10], thumb: [.45, .40, .25, .15] },
  // Разворот кисти боком перед стряхиванием пепла: указательный на переднем плане чуть ниже, средний за сигаретой вертикально выше, большой палец у фильтра
  ashReady: { index: [.26, .28, .18, .03], middle: [.04, .06, .04, -.03], ring: [1.32, 1.48, .92, -.06], pinky: [1.42, 1.52, .95, -.12], thumb: [.68, .62, .42, .05] },
  // Щелчок большим пальцем по фильтру
  ashFlick: { index: [.24, .26, .16, .03], middle: [.04, .06, .04, -.03], ring: [1.32, 1.48, .92, -.06], pinky: [1.42, 1.52, .95, -.12], thumb: [.32, .14, -.10, .16] },
  // хват вокруг цилиндра бутылки: пальцы плавно огибают стекло спереди, большой палец фиксирует сбоку
  grip:    { index: [.78, .88, .55, .04], middle: [.82, .92, .58, 0], ring: [.86, .95, .60, -.03], pinky: [.90, .98, .62, -.06], thumb: [.52, .45, .32, .22] },
  // большой палец тянется вверх к горлышку и отщёлкивает пробку
  thumbFlick: { index: [.75, .85, .52, .04], middle: [.80, .90, .56, 0], ring: [.85, .94, .58, -.03], pinky: [.88, .96, .60, -.06], thumb: [-.18, -.12, -.15, .48] },
  // плотно сжатый кулак для кулачного боя
  fist: { index: [1.45, 1.55, 1.0, .02], middle: [1.48, 1.58, 1.02, 0], ring: [1.50, 1.60, 1.02, -.02], pinky: [1.52, 1.62, 1.05, -.05], thumb: [.85, .75, .55, .28] },
};

export function makeRigHand(std) {
  const skin = std({ color: 0xd2987a, roughness: .88, metalness: .02 }), skinDark = std({ color: 0xb67d5e, roughness: .90, metalness: .02 }), nailM = std({ color: 0xdfb49a, roughness: .55 }), sleeveM = std({ color: 0x25303a, roughness: .92 });
  const root = new THREE.Group();
  const add = (geo, m, p, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
  const palmGeo = new THREE.BoxGeometry(.084, .027, .094, 4, 2, 4); { const p = palmGeo.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i), k = .88 + .12 * ((-z + .047) / .094); p.setX(i, p.getX(i) * k); if (p.getY(i) > 0) p.setY(i, p.getY(i) * (1 + .25 * Math.cos(p.getX(i) * 30))); } palmGeo.computeVertexNormals(); }
  add(palmGeo, skin, root, 0, 0, -.047);
  add(new THREE.CapsuleGeometry(.0135, .068, 6, 10), skin, root, -.036, -.001, -.046).rotation.x = Math.PI / 2;
  add(new THREE.CapsuleGeometry(.013, .066, 6, 10), skin, root, .036, -.001, -.045).rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(.023, 12, 10), skin, root, -.025, -.011, -.028).scale.set(1.05, .68, 1.35);
  const wrist = add(new THREE.CylinderGeometry(.034, .040, .065, 14), skin, root, 0, -.001, .024); wrist.rotation.x = Math.PI / 2;
  const forearm = add(new THREE.CylinderGeometry(.044, .052, .22, 14), sleeveM, root, 0, -.001, .145); forearm.rotation.x = Math.PI / 2;
  const joints = {};
  const seg = (parent, len, r, nail) => {
    const m = add(new THREE.CapsuleGeometry(r, Math.max(.001, len - r * 1.15), 6, 12), skin, parent, 0, 0, -len / 2); m.rotation.x = Math.PI / 2;
    if (nail) add(new THREE.BoxGeometry(r * 1.4, .0015, len * .5), nailM, parent, 0, r * .82, -len * .62);
    const j = new THREE.Group(); j.position.z = -len; parent.add(j); return j;
  };
  for (const [name, x, kz, L, r] of FINGERS) {
    const mcp = new THREE.Group(); mcp.position.set(x, .002, kz); root.add(mcp);
    add(new THREE.SphereGeometry(r * 1.12, 10, 8), skinDark, mcp, 0, r * .2, .002);
    const pip = seg(mcp, L[0], r); add(new THREE.SphereGeometry(r * .98, 10, 8), skin, pip);
    const dip = seg(pip, L[1], r * .94); add(new THREE.SphereGeometry(r * .92, 10, 8), skin, dip);
    seg(dip, L[2], r * .88, true);
    joints[name] = [mcp, pip, dip];
  }
  const cmc = new THREE.Group(); cmc.position.set(-.036, -.006, -.026); root.add(cmc);
  const tBase = new THREE.Euler(-.10, .78, .48);
  const tAxis = new THREE.Group(); tAxis.rotation.copy(tBase); cmc.add(tAxis);
  const cmcJ = new THREE.Group(); tAxis.add(cmcJ);
  const tm = seg(cmcJ, THUMB[0][0], THUMB[0][1]); const ip0 = new THREE.Group(); tm.add(ip0);
  const tp = seg(ip0, THUMB[1][0], THUMB[1][1]); const ip1 = new THREE.Group(); tp.add(ip1);
  seg(ip1, THUMB[2][0], THUMB[2][1], true);
  joints.thumb = [cmcJ, ip0, ip1];
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });

  const cur = {}; for (const k of Object.keys(joints)) cur[k] = [...HAND_POSES.relaxed[k]];
  function apply() {
    for (const k of Object.keys(joints)) { const [a, b, c, s] = cur[k], J = joints[k];
      if (k === 'thumb') { J[0].rotation.set(-a, 0, s); J[1].rotation.x = -b; J[2].rotation.x = -c; }
      else { J[0].rotation.set(-a, s, 0); J[1].rotation.x = -b; J[2].rotation.x = -c; } }
  }
  root.pose = (target, dt, speed = 14, jitter = 0, t = 0) => {
    const k = dt == null ? 1 : 1 - Math.exp(-speed * dt);
    for (const name of Object.keys(joints)) { const tg = target[name]; if (!tg) continue; const c = cur[name];
      for (let i = 0; i < 4; i++) { const n = jitter ? Math.sin(t * (1.3 + i * .7) + name.length * 1.7) * jitter : 0; c[i] += (tg[i] + n - c[i]) * k; } }
    apply();
  };
  root.mix = (...pairs) => {
    const out = {}; for (const name of Object.keys(joints)) { const v = [0, 0, 0, 0]; let w = 0;
      for (const [p, wt] of pairs) { const src = p[name] || HAND_POSES.relaxed[name]; for (let i = 0; i < 4; i++) v[i] += src[i] * wt; w += wt; }
      out[name] = v.map(x => x / (w || 1)); } return out; };
  root.joints = joints;
  apply();
  return root;
}

// процедурная сигарета: ось +Y, фильтр (оранжевый, «под пробку») на −Y, тлеющий кончик и пепел на +Y
export function makeCigarette(std) {
  const g = new THREE.Group();
  const filterTex = (() => { const c = document.createElement('canvas'); c.width = 32; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#c87638'; x.fillRect(0, 0, 32, 64);
    for (let i = 0; i < 140; i++) { x.fillStyle = Math.random() < .5 ? 'rgba(140,72,26,.45)' : 'rgba(235,165,98,.45)'; x.fillRect(Math.random() * 32, Math.random() * 64, 1.5, 1.5); }
    x.fillStyle = '#dfc278'; x.fillRect(0, 0, 32, 3); const t = new THREE.CanvasTexture(x.canvas); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const R = .0054, FL = .035, PL = .082;
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(R, R, FL, 14), std({ map: filterTex, roughness: .78 })); filter.position.y = -FL / 2; g.add(filter);
  const paperM = std({ color: 0xdad5ca, roughness: .82 }); const paper = new THREE.Mesh(new THREE.CylinderGeometry(R, R, PL, 14), paperM); paper.position.y = PL / 2; g.add(paper);
  // Обугленный ободок бумаги на границе тления
  const charM = std({ color: 0x2b1d14, roughness: .92 });
  const charRing = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.005, R * 1.005, .0024, 14), charM); g.add(charRing);
  const emberM = new THREE.MeshStandardMaterial({ color: 0x4a2218, emissive: 0xff4510, emissiveIntensity: 0, roughness: .85 });
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(R * .97, R * .92, .0036, 14), emberM); g.add(ember);
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(R * .93, R * .86, .001, 12), std({ color: 0x7c7a76, roughness: .95 })); g.add(ash);
  const tipNode = new THREE.Object3D(); g.add(tipNode);
  g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  g.userData = { paper, charRing, ember, emberM, ash, tipNode, PL, FL,
    // burn: 1 → целая сигарета, 0 → короткий окурок у самого фильтра
    setBurn(burn, ashLen, glow) {
      const b = Math.max(0, Math.min(1, burn));
      const len = PL * (.07 + .93 * b);
      paper.scale.y = len / PL; paper.position.y = len / 2;
      charRing.position.y = Math.max(.0012, len - .0008);
      ember.position.y = len + .0016; emberM.emissiveIntensity = glow;
      const aLen = Math.max(.0018, ashLen);
      ash.visible = aLen > .0005; ash.scale.y = aLen / .001; ash.position.y = len + .0028 + aLen / 2;
      tipNode.position.set(0, len + .003 + aLen, 0);
    },
    filterEnd: new THREE.Vector3(0, -FL, 0) };
  g.userData.setBurn(1, .002, 0);
  return g;
}
