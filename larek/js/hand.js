// Скелетная правая кисть для привычек (курение, выпивка).
// Система координат кисти: запястье в начале, пальцы смотрят в −Z, тыльная сторона +Y, ладонь −Y, большой палец со стороны −X.
// У каждого пальца три сустава (MCP — пястно-фаланговый, PIP, DIP), у большого — CMC, MCP, IP.
// Поза задаётся углами сгиба (рад, положительный — к ладони) и разведением пальцев; позы плавно смешиваются.
import * as THREE from 'three';

const FINGERS = [ // имя, x костяшки, z костяшки, длины фаланг, радиус
  ['index', -.027, -.088, [.044, .026, .021], .0086],
  ['middle', -.009, -.092, [.048, .029, .023], .0088],
  ['ring', .009, -.089, [.045, .027, .022], .0084],
  ['pinky', .026, -.082, [.035, .021, .018], .0074],
];
const THUMB = [[.04, .011], [.031, .0098], [.026, .009]]; // пястная, проксимальная, дистальная

// библиотека поз: для пальца [MCP, PIP, DIP, разведение], для большого [CMC, MCP, IP, отведение]
export const HAND_POSES = {
  relaxed: { index: [.25, .3, .2, 0], middle: [.3, .35, .2, 0], ring: [.35, .4, .25, 0], pinky: [.4, .45, .3, 0], thumb: [.15, .15, .1, .1] },
  open:    { index: [.05, .05, .03, -.08], middle: [.05, .05, .03, -.02], ring: [.06, .06, .04, .04], pinky: [.08, .08, .05, .1], thumb: [-.1, 0, 0, .35] },
  // сигарета между указательным и средним: они почти прямые и прижаты друг к другу, безымянный и мизинец поджаты
  pinch:   { index: [.18, .16, .1, .07], middle: [.2, .18, .1, -.05], ring: [1.15, 1.35, .85, .02], pinky: [1.25, 1.4, .9, .06], thumb: [.45, .35, .3, .05] },
  // затяжка: пальцы чуть сжимают фильтр
  pinchHard: { index: [.24, .2, .12, .09], middle: [.26, .22, .12, -.07], ring: [1.3, 1.5, .95, .02], pinky: [1.4, 1.55, 1, .06], thumb: [.55, .45, .35, 0] },
  // кулак вокруг бутылки
  grip:    { index: [1.25, 1.5, .95, .02], middle: [1.3, 1.55, 1, 0], ring: [1.32, 1.55, 1, -.02], pinky: [1.35, 1.6, 1, -.05], thumb: [.85, .55, .45, -.2] },
  // большой палец отщёлкивает крышку / стряхивает пепел
  thumbFlick: { thumb: [-.25, -.15, -.2, .4] },
};

export function makeRigHand(std) {
  const skin = std({ color: 0xd9a888, roughness: .65 }), skinDark = std({ color: 0xc89478, roughness: .7 }), nailM = std({ color: 0xeac6b0, roughness: .35 }), sleeveM = std({ color: 0x2f3a46, roughness: .85 });
  const root = new THREE.Group();
  const add = (geo, m, p, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
  // ладонь: пясть чуть сужается к запястью, бугор большого пальца и подушечки под костяшками
  const palmGeo = new THREE.BoxGeometry(.084, .026, .094, 3, 1, 3); { const p = palmGeo.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i), k = .86 + .14 * ((-z + .047) / .094); p.setX(i, p.getX(i) * k); if (p.getY(i) > 0) p.setY(i, p.getY(i) * (1 + .3 * Math.cos(p.getX(i) * 30))); } palmGeo.computeVertexNormals(); }
  add(palmGeo, skin, root, 0, 0, -.047);
  add(new THREE.SphereGeometry(.022, 10, 8), skin, root, -.026, -.012, -.03).scale.set(1, .6, 1.3); // тенар
  add(new THREE.CylinderGeometry(.03, .034, .05, 12), skin, root, 0, 0, .02).rotation.x = Math.PI / 2; // запястье
  add(new THREE.CylinderGeometry(.044, .052, .3, 14), sleeveM, root, 0, .002, .19).rotation.x = Math.PI / 2; // рукав
  add(new THREE.TorusGeometry(.047, .009, 6, 16), sleeveM, root, 0, .002, .045);
  const joints = {};
  const seg = (parent, len, r, nail) => { // фаланга: капсула вдоль −Z + следующий сустав на конце
    const m = add(new THREE.CapsuleGeometry(r, Math.max(.001, len - r * 1.2), 4, 8), skin, parent, 0, 0, -len / 2); m.rotation.x = Math.PI / 2;
    if (nail) add(new THREE.BoxGeometry(r * 1.5, .0016, len * .55), nailM, parent, 0, r * .82, -len * .62);
    const j = new THREE.Group(); j.position.z = -len; parent.add(j); return j;
  };
  for (const [name, x, kz, L, r] of FINGERS) {
    const mcp = new THREE.Group(); mcp.position.set(x, .003, kz); root.add(mcp);
    add(new THREE.SphereGeometry(r * 1.15, 8, 6), skinDark, mcp, 0, r * .25, .002); // костяшка
    const pip = seg(mcp, L[0], r); add(new THREE.SphereGeometry(r * .98, 8, 6), skin, pip);
    const dip = seg(pip, L[1], r * .93); add(new THREE.SphereGeometry(r * .9, 8, 6), skin, dip);
    seg(dip, L[2], r * .86, true);
    joints[name] = [mcp, pip, dip];
  }
  // большой палец: основание под ладонью у запястья, смотрит вперёд-влево и подвёрнут к ладони
  const cmc = new THREE.Group(); cmc.position.set(-.032, -.008, -.022); root.add(cmc);
  const tBase = new THREE.Euler(-.15, .85, .55); // поворот оси большого пальца относительно кисти
  const tAxis = new THREE.Group(); tAxis.rotation.copy(tBase); cmc.add(tAxis);
  const cmcJ = new THREE.Group(); tAxis.add(cmcJ);
  const tm = seg(cmcJ, THUMB[0][0], THUMB[0][1]); const ip0 = new THREE.Group(); tm.add(ip0);
  const tp = seg(ip0, THUMB[1][0], THUMB[1][1]); const ip1 = new THREE.Group(); tp.add(ip1);
  seg(ip1, THUMB[2][0], THUMB[2][1], true);
  joints.thumb = [cmcJ, ip0, ip1];
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });

  // текущее состояние суставов (смешивается к целевому)
  const cur = {}; for (const k of Object.keys(joints)) cur[k] = [...HAND_POSES.relaxed[k]];
  function apply() {
    for (const k of Object.keys(joints)) { const [a, b, c, s] = cur[k], J = joints[k];
      if (k === 'thumb') { J[0].rotation.set(-a, 0, s); J[1].rotation.x = -b; J[2].rotation.x = -c; }
      else { J[0].rotation.set(-a, s, 0); J[1].rotation.x = -b; J[2].rotation.x = -c; } }
  }
  // целевая поза = смесь нескольких поз с весами; overlay — частичные позы поверх (например, щелчок большим пальцем)
  root.pose = (target, dt, speed = 14, jitter = 0, t = 0) => {
    const k = dt == null ? 1 : 1 - Math.exp(-speed * dt);
    for (const name of Object.keys(joints)) { const tg = target[name]; if (!tg) continue; const c = cur[name];
      for (let i = 0; i < 4; i++) { const n = jitter ? Math.sin(t * (1.3 + i * .7) + name.length * 1.7) * jitter : 0; c[i] += (tg[i] + n - c[i]) * k; } }
    apply();
  };
  root.mix = (...pairs) => { // mix([poseA, wA], [poseB, wB], ...) → поза
    const out = {}; for (const name of Object.keys(joints)) { const v = [0, 0, 0, 0]; let w = 0;
      for (const [p, wt] of pairs) { const src = p[name] || HAND_POSES.relaxed[name]; for (let i = 0; i < 4; i++) v[i] += src[i] * wt; w += wt; }
      out[name] = v.map(x => x / (w || 1)); } return out; };
  root.joints = joints;
  apply();
  return root;
}

// процедурная сигарета: ось +Y, фильтр (оранжевый, «под пробку») на −Y, тлеющий кончик на +Y
export function makeCigarette(std) {
  const g = new THREE.Group();
  const filterTex = (() => { const c = document.createElement('canvas'); c.width = 32; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#d8853a'; x.fillRect(0, 0, 32, 64);
    for (let i = 0; i < 160; i++) { x.fillStyle = Math.random() < .5 ? 'rgba(150,80,30,.5)' : 'rgba(240,180,110,.5)'; x.fillRect(Math.random() * 32, Math.random() * 64, 1.5, 1.5); }
    x.fillStyle = '#e8c070'; x.fillRect(0, 0, 32, 3); const t = new THREE.CanvasTexture(x.canvas); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const R = .0042, FL = .022, PL = .058;
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(R, R, FL, 12), std({ map: filterTex, roughness: .8 })); filter.position.y = -FL / 2; g.add(filter);
  const paperM = std({ color: 0xf2f0ea, roughness: .75 }); const paper = new THREE.Mesh(new THREE.CylinderGeometry(R, R, PL, 12), paperM); paper.position.y = PL / 2; g.add(paper);
  const emberM = new THREE.MeshStandardMaterial({ color: 0x3a2a20, emissive: 0xff5a10, emissiveIntensity: 0, roughness: .9 });
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(R * .98, R * .9, .006, 12), emberM); g.add(ember);
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(R * .95, R * .9, .001, 10), std({ color: 0x8c8a86, roughness: 1 })); g.add(ash);
  g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  g.userData = { paper, ember, emberM, ash, PL, FL,
    // burn 1 → целая, 0 → окурок; ashLen — нагоревший столбик пепла
    setBurn(burn, ashLen, glow) { const len = Math.max(.008, PL * (.25 + .75 * burn)); paper.scale.y = len / PL; paper.position.y = len / 2;
      ember.position.y = len + .002; emberM.emissiveIntensity = glow; ash.visible = ashLen > .0005; ash.scale.y = Math.max(1, ashLen / .001); ash.position.y = len + .004 + ashLen / 2; },
    filterEnd: new THREE.Vector3(0, -FL, 0) };
  g.userData.setBurn(1, 0, 0);
  return g;
}
