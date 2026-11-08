// Общественный транспорт: советский автобус ПАЗ-3205 («ПАЗик») по маршруту №7
// со складывающимися внутрь четырёхстворчатыми ширмовыми дверями («гармошкой»),
// свободным входом/выходом пешком через открытые двери и посадкой на любое выбранное место.
import * as THREE from 'three';
import { Human, makeLook } from './npc.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export const STOPS = {
  kiosk:          { name: 'Ларёк (на Завод)',         x: 8,    sideZ: 5.2,  laneZ: 8.4,  north: false },
  factory:        { name: 'Завод (проходная)',        x: -334, sideZ: 5.2,  laneZ: 8.4,  north: false },
  factory_return: { name: 'Завод (в сторону ларька)', x: -334, sideZ: 15.2, laneZ: 12.0, north: true },
  kiosk_return:   { name: 'Ларёк (северная сторона)', x: 8,    sideZ: 15.2, laneZ: 12.0, north: true },
};

export function createTransport(env) {
  const { scene, std, routePoint, route, P, camera, ctx } = env;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), ray = new THREE.Raycaster();

  // ---------- модель автобуса ПАЗ-3205 (бежево-охристый с красной полосой, капотом у водителя и ширмовыми дверями) ----------
  const bus = new THREE.Group(); scene.add(bus);
  const L = 7.0, Wd = 2.46, H = 2.88;
  const ochreM = std({ color: 0xcc6d22, roughness: .48, metalness: .18 });
  const creamM = std({ color: 0xe8dfc8, roughness: .46, metalness: .15 });
  const pillarM = std({ color: 0xe2d8be, roughness: .5, metalness: .15 });
  const darkM = std({ color: 0x1c1c1e, roughness: .65, metalness: .2 });
  const rubberM = std({ color: 0x161618, roughness: .9 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x22323a, roughness: .08, metalness: .55, transparent: true, opacity: .54, depthWrite: false });
  const skyGlassM = new THREE.MeshStandardMaterial({ color: 0x183c4e, roughness: .1, metalness: .5, transparent: true, opacity: .68, depthWrite: false });
  const inner = std({ color: 0x868274, roughness: .9, side: THREE.BackSide });

  const B = (w, h, d, m, x, y, z, p = bus) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o;
  };

  // Профиль кузова ПАЗ со скруглёнными углами и скосом крыши
  const ext = (pts, y0, depth, bev, stp = 10) => {
    const sh = new THREE.Shape();
    pts.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
    const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bev * 2, steps: stp, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * .16, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, y0, -depth / 2 + bev); g.rotateY(Math.PI / 2); g.computeVertexNormals(); return g;
  };
  const rr = (w, h, rb, rt) => {
    const P_ = [], seg = 3, hw = w / 2;
    const arc = (cx, cy, r, a0, a1) => { for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * i / seg; P_.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    arc(hw - rb, rb, rb, -Math.PI / 2, 0); arc(hw - rt, h - rt, rt, 0, Math.PI / 2); arc(-hw + rt, h - rt, rt, Math.PI / 2, Math.PI); arc(-hw + rb, rb, rb, Math.PI, Math.PI * 1.5);
    return P_;
  };

  // У ПАЗа две двери по правому борту (+Z в локальных координатах автобуса = к тротуару и остановке):
  const DOOR_X = [1.05, -2.05], DOOR_HW = .46, DS = 1;
  const inGap = x => DOOR_X.some(d => Math.abs(x - d) < DOOR_HW);
  const cutDoors = g => {
    const P_ = g.attributes.position, keep = [];
    for (let t = 0; t < P_.count; t += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let v = 0; v < 3; v++) { cx += P_.getX(t + v); cy += P_.getY(t + v); cz += P_.getZ(t + v); }
      cx /= 3; cy /= 3; cz /= 3;
      const isDoorHole = (cz * DS > Wd / 2 - .32 && cy > .42 && inGap(cx));
      const isTopCap = (cy > 1.42 && Math.abs(cz) < Wd / 2 - .16 && Math.abs(cx) < L / 2 - .22);
      if (!isDoorHole && !isTopCap) keep.push(t);
    }
    const out = new THREE.BufferGeometry();
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name], n = a.itemSize, arr = new Float32Array(keep.length * 3 * n);
      keep.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) arr[(i * 3 + v) * n + c] = a.array[(t + v) * n + c]; });
      out.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    return out;
  };

  // Нижний охристый пояс кузова ПАЗ и скруглённая бежевая крыша
  const lower = new THREE.Mesh(cutDoors(ext(rr(Wd - .08, 1.12, .10, .04), .38, L, .26, 12)), ochreM);
  bus.add(lower); lower.castShadow = lower.receiveShadow = true;
  lower.material = ochreM.clone(); lower.material.side = THREE.DoubleSide;

  const roof = new THREE.Mesh(ext(rr(Wd - .12, .48, .02, .34), 2.38, L - .08, .30, 2), creamM);
  bus.add(roof); roof.castShadow = true;
  bus.add(new THREE.Mesh(lower.geometry, inner), new THREE.Mesh(roof.geometry, std({ color: 0xd8d2c0, roughness: .9, side: THREE.BackSide })));

  // Два характерных вентиляционных люка на крыше ПАЗа и шапка снега
  for (const hx of [-1.05, 1.05]) {
    B(.62, .07, .62, creamM, hx, 2.86, 0);
    B(.58, .02, .58, darkM, hx, 2.83, 0);
  }
  const roofSnow = B(L - .85, .045, Wd - .65, std({ color: 0xf0f3f6, roughness: .95 }), -.05, 2.86, 0);
  roofSnow.castShadow = false;

  // Характерные для советского ПАЗа тонированные окошки на скруглённых скатах крыши
  for (const sd of [-1, 1]) {
    for (let x = -2.45; x <= 2.15; x += 1.12) {
      const sk = B(.82, .16, .025, skyGlassM, x, 2.62, sd * (Wd / 2 - .11));
      sk.rotation.x = sd * .58;
    }
  }

  // Бортовая текстура ПАЗ: красные полосы, рельефные гофры, колёсные арки, следы зимней грязи
  const WHEEL_X = [-1.85, 1.75];
  const mkSide = flip => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d');
    g.clearRect(0, 0, 1024, 160);
    const X = m => ((flip ? -m : m) / L + .5) * 1024, Y = m => (1 - (m - .38) / 1.12) * 160;
    g.fillStyle = '#8f2418';
    g.fillRect(0, Y(1.47), 1024, Y(1.34) - Y(1.47));
    g.fillRect(0, Y(.72), 1024, Y(.64) - Y(.72));
    g.fillStyle = '#e6dec6'; g.fillRect(0, Y(1.34), 1024, 3);
    g.fillStyle = 'rgba(65,30,10,.45)';
    for (const ym of [1.14, .96, .80]) g.fillRect(0, Y(ym), 1024, 3);
    g.fillStyle = '#2d2824'; g.fillRect(0, Y(.52), 1024, 160 - Y(.52));
    for (let i = 0; i < 450; i++) {
      g.fillStyle = Math.random() < .5 ? 'rgba(55,48,42,.38)' : 'rgba(165,160,152,.22)';
      g.fillRect(Math.random() * 1024, Y(.78) + Math.random() * (160 - Y(.78)), 2 + Math.random() * 6, 2 + Math.random() * 4);
    }
    g.fillStyle = '#181615';
    for (const wx of WHEEL_X) {
      g.beginPath(); g.ellipse(X(wx), Y(.38), 76, 78, 0, Math.PI, 0); g.fill();
      g.strokeStyle = '#101010'; g.lineWidth = 6; g.stroke();
    }
    g.strokeStyle = 'rgba(40,22,10,.6)'; g.lineWidth = 2;
    for (let x = -L / 2 + .65; x < L / 2 - .45; x += .92) {
      g.beginPath(); g.moveTo(X(x), Y(1.46)); g.lineTo(X(x), Y(.45)); g.stroke();
    }
    if (flip) { g.strokeRect(X(-.45), Y(1.02), 34, 28); }
    if (!flip) for (const d of DOOR_X) g.clearRect(X(d) - DOOR_HW / L * 1024, 0, DOOR_HW * 2 / L * 1024, 160);
    g.fillStyle = '#f2ead2'; g.font = 'bold 20px Arial'; g.textAlign = 'center';
    g.fillText('ПАЗ-3205', X(2.65), Y(1.20));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const sideTex = mkSide(true), doorSideTex = mkSide(false);
  for (const sd of [-1, 1]) {
    const pl = new THREE.Mesh(
      new THREE.PlaneGeometry(L - .36, 1.12),
      std({ map: sd === DS ? doorSideTex : sideTex, transparent: true, roughness: .52, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    pl.position.set(0, .38 + .56, sd * ((Wd - .08) / 2 + .26 * .16 + .006));
    if (sd < 0) pl.rotation.y = Math.PI;
    bus.add(pl);
  }

  // Оконный пояс ПАЗ: широкие окна с форточками и бежевыми стойками
  B(L - .55, .88, .04, glassM, -.04, 1.94, -DS * (Wd / 2 - .06));
  {
    const edges = [-L / 2 + .26, ...DOOR_X.slice().sort((a, b) => a - b).flatMap(d => [d - DOOR_HW, d + DOOR_HW]), L / 2 - .32];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      if (b - a > .05) B(b - a, .88, .04, glassM, (a + b) / 2, 1.94, DS * (Wd / 2 - .06));
    }
  }
  for (let x = -L / 2 + .35; x <= L / 2 - .4; x += .92) {
    for (const sd of [-1, 1]) {
      if (!(sd === DS && inGap(x))) {
        B(.085, .90, .06, pillarM, x, 1.94, sd * (Wd / 2 - .06));
        B(.84, .022, .05, darkM, x + .46, 2.18, sd * (Wd / 2 - .06));
      }
    }
  }
  // Проёмы ширмовых дверей и ступеньки
  for (const d of DOOR_X) {
    for (const e of [-1, 1]) B(.065, 2.02, .1, pillarM, d + e * (DOOR_HW + .02), 1.42, DS * (Wd / 2 - .05));
    B(DOOR_HW * 2 + .16, .08, .1, pillarM, d, 2.42, DS * (Wd / 2 - .05));
    B(DOOR_HW * 2, .04, .46, std({ color: 0x262626, roughness: .9 }), d, .42, DS * (Wd / 2 - .28));
    B(DOOR_HW * 2, .16, .04, std({ color: 0x363634, roughness: .8 }), d, .48, DS * (Wd / 2 - .48));
  }

  // Лобовое стекло ПАЗ и заднее стекло
  for (const sd of [-1, 1]) {
    const ws = B(.045, .96, Wd / 2 - .14, glassM, L / 2 - .10, 1.95, sd * (Wd / 4 - .02));
    ws.rotation.z = -.14;
    const wiper = B(.02, .42, .018, darkM, L / 2 - .03, 1.68, sd * .42);
    wiper.rotation.z = -.14; wiper.rotation.x = .28;
  }
  B(.05, .96, .055, darkM, L / 2 - .10, 1.95, 0).rotation.z = -.14;
  B(.045, .78, Wd - .42, glassM, -L / 2 + .06, 1.96, 0);

  // Боковые зеркала ПАЗ
  for (const sd of [-1, 1]) {
    B(.02, .42, .02, darkM, L / 2 - .06, 1.88, sd * (Wd / 2 + .12));
    B(.02, .02, .16, darkM, L / 2 - .06, 2.08, sd * (Wd / 2 + .04));
    B(.02, .02, .16, darkM, L / 2 - .06, 1.68, sd * (Wd / 2 + .04));
    B(.04, .24, .14, darkM, L / 2 - .05, 1.88, sd * (Wd / 2 + .13));
  }

  // Передняя маска ПАЗ: решётка радиатора с эмблемой «ПАЗ», круглые фары, поворотники, бамперы
  B(.16, .20, Wd - .06, darkM, L / 2 + .03, .48, 0);
  B(.16, .20, Wd - .06, darkM, -L / 2 - .03, .48, 0);

  const grilleTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#9e4e14'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#1b1918';
    for (let y = 14; y < 114; y += 16) g.fillRect(16, y, 224, 9);
    g.fillStyle = '#d8d2c2'; g.strokeStyle = '#1b1918'; g.lineWidth = 4;
    g.strokeRect(86, 38, 84, 46); g.fillRect(88, 40, 80, 42);
    g.fillStyle = '#181615'; g.font = '900 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ПАЗ', 128, 63);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .42), std({ map: grilleTex, roughness: .5 }));
  grille.position.set(L / 2 + .018, .92, 0); grille.rotation.y = Math.PI / 2; bus.add(grille);

  const numTex = (() => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 48; const g = c.getContext('2d');
    g.fillStyle = '#f0ece0'; g.fillRect(0, 0, 160, 48); g.strokeStyle = '#1a1a1a'; g.lineWidth = 4; g.strokeRect(2, 2, 156, 44);
    g.fillStyle = '#151515'; g.font = '900 26px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('74-18 ГОР', 80, 25);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const numMat = std({ map: numTex, roughness: .6 });
  const npF = new THREE.Mesh(new THREE.PlaneGeometry(.42, .12), numMat); npF.position.set(L / 2 + .115, .48, 0); npF.rotation.y = Math.PI / 2; bus.add(npF);
  const npR = new THREE.Mesh(new THREE.PlaneGeometry(.42, .12), numMat); npR.position.set(-L / 2 - .115, .48, 0); npR.rotation.y = -Math.PI / 2; bus.add(npR);

  const hl = std({ color: 0xffffee, emissive: 0xfff2c0, emissiveIntensity: 0 });
  const blinkerM = std({ color: 0xff9a18, emissive: 0xff7a00, emissiveIntensity: .45, roughness: .3 });
  const fogM = std({ color: 0xffd838, emissive: 0xffb810, emissiveIntensity: .35, roughness: .25 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(.125, .125, .06, 14), hl);
    h.rotation.z = Math.PI / 2; h.position.set(L / 2 + .01, .86, s * .86); bus.add(h);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.13, .018, 6, 14), darkM);
    rim.rotation.y = Math.PI / 2; rim.position.copy(h.position); bus.add(rim);
    const bl = new THREE.Mesh(new THREE.CylinderGeometry(.052, .052, .05, 10), blinkerM);
    bl.rotation.z = Math.PI / 2; bl.position.set(L / 2 + .01, 1.12, s * .92); bus.add(bl);
    B(.05, .09, .16, fogM, L / 2 + .08, .36, s * .72);
  }
  for (const oz of [-.18, 0, .18]) {
    const ml = new THREE.Mesh(new THREE.SphereGeometry(.034, 8, 6), blinkerM);
    ml.position.set(L / 2 - .07, 2.74, oz); bus.add(ml);
  }

  const tl = std({ color: 0x9a1a12, emissive: 0xff2a10, emissiveIntensity: .35 });
  for (const s of [-1, 1]) {
    B(.05, .26, .16, tl, -L / 2 - .01, .88, s * .94);
    B(.055, .10, .16, blinkerM, -L / 2 - .01, 1.06, s * .94);
  }

  const plate = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#f2ead0'; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#222'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 60);
    g.fillStyle = '#b0281a'; g.font = '900 38px Arial'; g.fillText('7', 14, 46);
    g.fillStyle = '#181818'; g.font = '800 18px Arial'; g.fillText('ЗАВОД — ЛАРЁК', 50, 40);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const routeMat = std({ map: plate, emissive: 0xfff0d0, emissiveMap: plate, emissiveIntensity: .35 });
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.12, .25), routeMat);
  pl.position.set(L / 2 - .032, 2.53, 0); pl.rotation.y = Math.PI / 2; bus.add(pl);
  const plSide = new THREE.Mesh(new THREE.PlaneGeometry(.62, .16), routeMat);
  plSide.position.set(1.78, 1.62, DS * (Wd / 2 - .03)); plSide.rotation.y = 0; bus.add(plSide);

  // Колёса ПАЗ
  const hubM = std({ color: 0xc8c2b2, metalness: .65, roughness: .38 });
  const nutM = std({ color: 0x2b2824, metalness: .7, roughness: .4 });
  const wheels = [];
  const modelWheels = [], modelDoors = []; let modelSteer = null; const exhaustLocal = new THREE.Vector3(-L / 2 + .15, .38, -.75); // части новой модели (заполняются в setModel)
  for (const x of WHEEL_X) {
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(.46, .46, .30, 16), rubberM);
      w.rotation.x = Math.PI / 2; w.position.set(x, .46, s * (Wd / 2 - .03)); bus.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.23, .26, .04, 12), hubM);
      hub.position.y = s * .155; w.add(hub);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.08, .09, .06, 10), nutM);
      cap.position.y = s * .165; w.add(cap);
      wheels.push(w);
      B(.02, .34, .32, rubberM, x - .54, .34, s * (Wd / 2 - .12));
    }
  }

  // Четырёхстворчатые ширмовые двери ПАЗ-3205, складывающиеся «в гармошку» внутрь салона при открытии
  const doorsSide = DS;
  const doors = [];
  const leafM = (() => {
    const c = document.createElement('canvas'); c.width = 48; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#cc6d22'; g.fillRect(0, 118, 48, 138);
    g.fillStyle = '#e8dfc8'; g.fillRect(0, 0, 48, 118);
    g.fillStyle = '#8f2418'; g.fillRect(0, 112, 48, 14);
    // Узкое вертикальное стекло в каждой секции створки ширмовой двери
    g.fillStyle = 'rgba(28,38,44,.88)';
    g.fillRect(8, 14, 32, 92);
    g.fillRect(8, 134, 32, 56);
    // Резиновый уплотнитель по краям секции
    g.fillStyle = '#181818';
    g.fillRect(0, 0, 4, 256); g.fillRect(44, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return std({ map: t, roughness: .45, metalness: .18 });
  })();
  const wLeaf = .225;
  for (const dx of DOOR_X) {
    const pair = [];
    for (const s of [-1, 1]) {
      // Внешняя петля у стойки дверного проёма
      const piv1 = new THREE.Group();
      piv1.position.set(dx + s * (DOOR_HW - .005), 1.40, doorsSide * (Wd / 2 - .025));
      bus.add(piv1);
      const leaf1 = B(wLeaf, 1.98, .036, leafM, -s * (wLeaf / 2), 0, 0, piv1);
      // Средняя петля «гармошки» между внешней и внутренней секциями створки
      const piv2 = new THREE.Group();
      piv2.position.set(-s * wLeaf, 0, 0);
      piv1.add(piv2);
      const leaf2 = B(wLeaf, 1.98, .036, leafM, -s * (wLeaf / 2), 0, 0, piv2);
      pair.push({ piv1, piv2, leaf1, leaf2, s });
    }
    doors.push({ x: dx, pair });
  }

  // Салон ПАЗа: рифлёный резиновый пол, кожух двигателя (капот), сиденья (с возможностью сесть на любое), поручни и плафоны
  const ribTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#383632'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#262422';
    for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(L * 2, Wd * 2); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  B(L - .42, .04, Wd - .24, std({ map: ribTex, roughness: .95 }), 0, .56, 0);

  const chromeM = std({ color: 0xc8c8c4, metalness: .88, roughness: .22 });
  const seatM = std({ color: 0x7c2c1e, roughness: .62 });
  const frameM = std({ color: 0x323232, metalness: .5, roughness: .5 });
  const tube = (x1, y1, z1, x2, y2, z2, r = .015, m = chromeM) => {
    const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2), len = a.distanceTo(b);
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), m);
    o.position.copy(a).add(b).multiplyScalar(.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    bus.add(o); return o;
  };

  const seats = [];
  const seatMeshes = [];
  const makeSeat = (x, sd) => {
    const z = sd * .66;
    const cush = B(.44, .10, .78, seatM, x, .96, z); cush.rotation.z = .05;
    const back = B(.08, .52, .78, seatM, x - .20, 1.28, z); back.rotation.z = .12;
    tube(x - .24, 1.56, z - .34, x - .24, 1.56, z + .34, .013);
    tube(x - .05, .57, z + sd * .26, x - .05, .91, z + sd * .26, .018, frameM);
    const sObj = {
      id: seats.length,
      x, z, sd,
      cush, back,
      sitLocal: new THREE.Vector3(x + .06, 1.62, z),
      standLocal: new THREE.Vector3(clamp(x + .12, -2.85, 1.85), 2.22, 0),
    };
    cush.userData.busSeat = sObj;
    back.userData.busSeat = sObj;
    seats.push(sObj);
    seatMeshes.push(cush, back);
  };
  for (let x = -2.75; x <= 1.85; x += .86) {
    for (const sd of [-1, 1]) {
      if (sd === DS && DOOR_X.some(d => Math.abs(x - d) < .82)) continue;
      if (sd === DS && x > 1.2) continue;
      makeSeat(x, sd);
    }
  }
  for (const sd of [-1, 1]) tube(-L / 2 + .45, 2.22, sd * .52, L / 2 - 1.1, 2.22, sd * .52, .015);
  for (const d of DOOR_X) for (const e of [-1, 1]) tube(d + e * (DOOR_HW - .04), .88, DS * (Wd / 2 - .28), d + e * (DOOR_HW - .04), 2.18, DS * (Wd / 2 - .28), .016);

  const plafM = std({ color: 0xfff6e0, emissive: 0xffeecc, emissiveIntensity: .6, roughness: .4 });
  for (const px of [-2.1, -.4, 1.3]) B(.46, .03, .20, plafM, px, 2.46, 0);

  // Кабина водителя ПАЗа, капот двигателя и водитель Дядя Коля за рулём
  B(.04, 1.18, Wd / 2 - .12, frameM, L / 2 - 1.12, 1.18, (Wd / 4) * -DS);
  B(.42, .10, .48, std({ color: 0x3a281e, roughness: .7 }), L / 2 - .68, .98, -DS * .62);
  B(.08, .56, .48, std({ color: 0x3a281e, roughness: .7 }), L / 2 - .92, 1.28, -DS * .62);
  const hood = B(.92, .48, .56, std({ color: 0xb86220, roughness: .55, metalness: .2 }), L / 2 - .58, .80, -.04);
  hood.rotation.z = -.06;
  // Рулевая колонка и рулевое колесо ПАЗа со спицами
  const steerPivot = new THREE.Group();
  steerPivot.position.set(L / 2 - .40, 1.38, -DS * .62);
  steerPivot.rotation.z = .42;
  bus.add(steerPivot);
  const wheelS = new THREE.Mesh(new THREE.TorusGeometry(.21, .018, 6, 16), darkM);
  wheelS.rotation.x = Math.PI / 2;
  steerPivot.add(wheelS);
  const spoke1 = new THREE.Mesh(new THREE.CylinderGeometry(.010, .010, .40, 6), darkM);
  spoke1.rotation.x = Math.PI / 2; steerPivot.add(spoke1);
  const spoke2 = new THREE.Mesh(new THREE.CylinderGeometry(.010, .010, .20, 6), darkM);
  spoke2.position.x = -.10; spoke2.rotation.z = Math.PI / 2; steerPivot.add(spoke2);
  const colShaft = new THREE.Mesh(new THREE.CylinderGeometry(.024, .028, .56, 8), frameM);
  colShaft.position.y = -.28; steerPivot.add(colShaft);
  B(.36, .28, Wd - .28, std({ color: 0x2a2826, roughness: .6 }), L / 2 - .28, 1.26, 0);

  // Водитель автобуса — Дядя Коля (сидит на водительском кресле и крутит руль)
  const kolyaLook = makeLook('worker');
  Object.assign(kolyaLook, {
    male: true, age: 52, height: 1.76, build: 1.15,
    top: '#2b3a4a', puffy: true, leather: false,
    pants: '#22252a', boots: '#181615',
    hat: 'kepka', hatC: '#22262e',
    hair: '#7d7870', hairStyle: 'short', facial: 'mustache',
    gloves: null, scarf: '#6a2a2a', bag: null, coat: false, stripes: null, apron: null,
  });
  let driver = new Human(kolyaLook, null);
  let dR = driver.R;
  driver.obj.position.set(L / 2 - .68, 1.05 - dR.legLen, -DS * .62);
  driver.obj.rotation.y = Math.PI / 2; // смотрит вперёд по ходу автобуса (+X)
  bus.add(driver.obj);
  const driverMeshes = [];
  driver.obj.traverse(o => { if (o.isMesh) { o.userData.driverKolya = true; driverMeshes.push(o); } });

  let driverT = 0, driverTalkT = 0;
  function updateDriverPose(dt, turnRate) {
    driverT += dt;
    if (driverTalkT > 0) driverTalkT = Math.max(0, driverTalkT - dt);
    const steer = clamp(turnRate * 3.5 + Math.sin(driverT * 1.4) * (B_.v > .5 ? .18 : .02), -.65, .65);
    steerPivot.rotation.y = steer; if (modelSteer) modelSteer.setRotationFromAxisAngle(modelSteer.userData.axis, steer * 2.2); // руль модели
    // Сидячая поза Дяди Коли: бёдра горизонтально на подушке кресла, голени к педалям, руки держат обод руля
    dR.body.position.set(0, 0, 0);
    dR.body.rotation.set(0, 0, 0);
    dR.hips.rotation.set(0, 0, 0);
    dR.spine.rotation.set(.10, steer * .08, 0);
    dR.thL.rotation.set(-1.42, 0, .08);
    dR.thR.rotation.set(-1.42, 0, -.08);
    dR.knL.rotation.set(1.24, 0, 0);
    dR.knR.rotation.set(1.18 + Math.sin(driverT * 1.8) * (B_.v > .5 ? .05 : 0), 0, 0);
    // Руки вытянуты вперёд и разведены к внешнему ободу рулевого колеса (хват слева и справа по ободу)
    dR.shL.rotation.set(-1.04 + steer * .20,  .22,  .22);
    dR.shR.rotation.set(-1.04 - steer * .20, -.22, -.22);
    dR.elL.rotation.set(-.58 - steer * .12, 0, -.10);
    dR.elR.rotation.set(-.58 + steer * .12, 0,  .10);
    // На остановке Дядя Коля поглядывает в правое зеркало и в салон, а при разговоре — поворачивает голову к игроку
    let headYaw = 0, headPitch = .04;
    if (driverTalkT > 0) {
      headYaw = -.48;
      headPitch = .04 + Math.sin(driverT * 8) * .022;
      driver.setExpr('talk');
    } else if (B_.state === 'stop') {
      headYaw = -.32 + Math.sin(driverT * .9) * .10;
      driver.setExpr('neutral');
    } else {
      headYaw = steer * .20 + Math.sin(driverT * .6) * .05;
      driver.setExpr('neutral');
    }
    dR.neck.rotation.set(0, headYaw * .35, 0);
    dR.head.rotation.set(headPitch, headYaw * .65, 0);
    driver.updateFace(dt);
  }

  const lamp = new THREE.PointLight(0xffe8c0, .6, 7.5, 1.8); lamp.position.set(1.05, 2.32, 0); bus.add(lamp);
  const lampRear = new THREE.PointLight(0xffe8c0, .6, 7.5, 1.8); lampRear.position.set(-1.75, 2.32, 0); bus.add(lampRear);
  bus.traverse(o => { if (o.isMesh) o.userData.bus = true; });

  // ---------- движение по маршруту, остановки и нахождение игрока в салоне ----------
  const B_ = { s: 120, v: 0, vmax: 9.5, heading: Math.PI, prevHeading: Math.PI, prevX: 0, prevZ: 0, dx: 0, dz: 0, accel: 0, turnRate: 0, bumpX: 0, bumpZ: 0, state: 'drive', t: 0, stop: null, doorK: 0, served: {}, stopSeq: 0 };
  const busPassengers = []; // NPC-пассажиры внутри автобуса { p, state, seat, doorIdx, lx, ly, lz, ry, boardedSeq }
  updateDriverPose(.016, 0);
  const routeLen = routePoint(route, 0)[2];
  const stopS = {};
  for (const [k, st] of Object.entries(STOPS)) {
    let best = 0, bd = 1e9;
    for (let s = 0; s < routeLen; s += .5) {
      const [x, z] = routePoint(route, s);
      const d = Math.hypot(x - (st.x + DOOR_X[0]), z - st.laneZ);
      if (d < bd) { bd = d; best = s; }
    }
    stopS[k] = best;
  }

  // Начальная установка матрицы автобуса
  {
    const [x0, z0] = routePoint(route, B_.s), [ax0, az0] = routePoint(route, B_.s + 3);
    B_.heading = -Math.atan2(az0 - z0, ax0 - x0);
    bus.position.set(x0, 0, z0);
    bus.rotation.y = B_.heading;
    bus.updateMatrixWorld(true);
  }

  let onBoard = false;
  let seatedSeat = null;
  let boardedStop = null;
  let sitAnim = null; // плавная посадка/вставание внутри салона
  const doorLocal = new THREE.Vector3(DOOR_X[0], 1.0, doorsSide * (Wd / 2 + .55));

  // Перевод мировых координат (x, z) в локальные координаты автобуса (lx, lz)
  function worldToBus(wx, wz) {
    const dx = wx - bus.position.x, dz = wz - bus.position.z;
    const c = Math.cos(B_.heading), s_ = Math.sin(B_.heading);
    return {
      lx:  dx * c - dz * s_,
      lz:  dx * s_ + dz * c,
    };
  }
  function busToWorld(lx, ly, lz, out = tmp) {
    const c = Math.cos(B_.heading), s_ = Math.sin(B_.heading);
    return out.set(
      bus.position.x + lx * c + lz * s_,
      ly,
      bus.position.z - lx * s_ + lz * c
    );
  }

  const inDoorGap = lx => DOOR_X.some(d => Math.abs(lx - d) < .43);

  // Проверка столкновения игрока со стенками автобуса:
  // когда ширмовые двери открыты (doorK > 0.45), через оба дверных проёма можно свободно зайти внутрь салона и выйти наружу!
  function playerBlocked(wx, wz, r = .24) {
    if (seatedSeat) return false;
    const { lx, lz } = worldToBus(wx, wz);
    if (Math.abs(lx) >= L / 2 + r || Math.abs(lz) >= Wd / 2 + r) return false;
    // Коридор открытых дверей (передняя и задняя дверь по правому борту +Z)
    if (B_.doorK > .45 && inDoorGap(lx) && lz * DS > .10 && lz * DS < Wd / 2 + r + .25) {
      return false;
    }
    // Внутри салона ПАЗа (проход и площадка у дверей)
    if (lx > -L / 2 + .30 && lx < L / 2 - 1.15 && Math.abs(lz) < Wd / 2 - .22) {
      return false;
    }
    return true;
  }

  // Высота пола под ногами игрока, когда он заходит по ступенькам или находится в салоне ПАЗа
  function floorHeightAt(wx, wz) {
    if (seatedSeat) return .72;
    const { lx, lz } = worldToBus(wx, wz);
    if (Math.abs(lx) > L / 2 - .12 || Math.abs(lz) > Wd / 2 + .18) return 0;
    if (Math.abs(lz) <= Wd / 2 - .22) return .72;
    if (inDoorGap(lx) && lz * DS > Wd / 2 - .22 && lz * DS <= Wd / 2 + .18) {
      const u = clamp((Wd / 2 + .18 - lz * DS) / .40, 0, 1);
      return u * .72;
    }
    return onBoard ? .72 : 0;
  }

  // Поиск сиденья, на которое смотрит игрок (или по экранным координатам ndcX, ndcY при нажатии)
  function lookedSeat(ndcX = 0, ndcY = 0, maxD = 2.6) {
    if (!onBoard && B_.doorK < .45) return null;
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    ray.far = maxD;
    const hits = ray.intersectObjects(seatMeshes, false);
    if (hits.length > 0 && hits[0].object.userData.busSeat) {
      const s = hits[0].object.userData.busSeat;
      if (s.occupant) return null; // место уже занято пассажиром
      return s;
    }
    return null;
  }

  function sitOnSeat(seat) {
    if (!seat || seat.occupant) return false;
    const curLocal = worldToBus(P.x, P.z);
    onBoard = true;
    seatedSeat = seat;
    boardedStop = boardedStop || B_.stop;
    sitAnim = {
      mode: 'sit',
      t: 0,
      from: new THREE.Vector3(curLocal.lx, P.h, curLocal.lz),
      to: seat.sitLocal.clone(),
    };
    P.seated = true;
    P.crouch = false;
    P.vx = P.vz = 0;
    env.audio && env.audio.click(520, .35, 0, .05);
    env.onCtl && env.onCtl();
    return true;
  }

  function standFromSeat() {
    if (!seatedSeat) return false;
    const seat = seatedSeat;
    seatedSeat = null;
    sitAnim = {
      mode: 'stand',
      t: 0,
      from: seat.sitLocal.clone(),
      to: seat.standLocal.clone(),
    };
    P.seated = false;
    P.vx = P.vz = 0;
    env.audio && env.audio.click(640, .3, 0, .05);
    env.onCtl && env.onCtl();
    return true;
  }

  // Поверхности внутри автобуса (пол, капот, сиденья) для размещения и физики предметов
  function isInsideBus(wx, wz, margin = 0) {
    const { lx, lz } = worldToBus(wx, wz);
    return lx > -L / 2 + .22 - margin && lx < L / 2 - .28 + margin && Math.abs(lz) < Wd / 2 - .10 + margin;
  }
  function busSurfaceAt(wx, wz, yTop = 3.0) {
    const { lx, lz } = worldToBus(wx, wz);
    if (lx <= -L / 2 + .18 || lx >= L / 2 - .20 || Math.abs(lz) >= Wd / 2 + .18) return -1;
    let bestY = .775; // уровень пола салона ПАЗ
    // Ступеньки у дверей
    if (inDoorGap(lx) && lz * DS > .78) {
      if (lz * DS > 1.08) bestY = .42;
      else if (lz * DS > .90) bestY = .58;
      else bestY = .74;
    }
    // Капот двигателя со стёганым одеялом справа от водителя
    if (lx > 1.88 && lx < 2.96 && lz > -.16 && lz < .58 && yTop >= 1.18) {
      bestY = Math.max(bestY, 1.31);
    }
    // Сиденье кондуктора справа у передней двери
    if (lx > 1.92 && lx < 2.40 && lz > .40 && lz < .84 && yTop >= 1.02) {
      bestY = Math.max(bestY, 1.14);
    }
    // Подушки пассажирских сидений
    if (yTop >= 1.00) {
      for (const s of seats) {
        const halfZ = s.sd === 0 ? 1.16 : .43;
        if (Math.abs(lx - s.x) < .26 && Math.abs(lz - s.z) < halfZ) {
          bestY = Math.max(bestY, 1.15);
          break;
        }
      }
    }
    return bestY;
  }

  // Посадка и высадка реальных 3D-пассажиров с заходом по ступенькам и рассадкой на места в салоне
  function freeSeatsForNpc() {
    return seats.filter(s => !s.occupant && s !== seatedSeat);
  }
  function boardNpcPassenger(p, doorIdx = 0) {
    if (!p || !p.h || !p.h.obj || busPassengers.some(bp => bp.p === p)) return false;
    const free = freeSeatsForNpc();
    if (!free.length) return false;
    const seat = free[Math.floor(Math.random() * free.length)];
    seat.occupant = p;
    const dX = DOOR_X[doorIdx] ?? DOOR_X[0];
    if (p.h.obj.parent !== bus) {
      scene.remove(p.h.obj);
      bus.add(p.h.obj);
    }
    p.inBus = true;
    p.state = 'bus_ride';
    p.path = [];
    p.then = null;
    const bp = {
      p,
      seat,
      doorIdx,
      state: 'climb_steps',
      lx: dX,
      ly: .41,
      lz: 1.18,
      ry: Math.PI, // лицом внутрь салона (-Z)
      boardedSeq: B_.stopSeq,
    };
    p.h.obj.position.set(bp.lx, bp.ly, bp.lz);
    p.h.obj.rotation.y = bp.ry;
    busPassengers.push(bp);
    return true;
  }
  function triggerStopAlighting() {
    B_.stopSeq++;
    // Выходят пассажиры, которые проехали хотя бы одну перегонку
    const candidates = busPassengers.filter(bp => bp.state === 'seated' && bp.boardedSeq < B_.stopSeq);
    if (!candidates.length) return;
    const nOut = Math.min(candidates.length, Math.random() < .65 ? 2 : 1);
    for (let i = 0; i < nOut; i++) {
      const bp = candidates[i];
      if (bp.seat) { bp.seat.occupant = null; bp.seat = null; }
      bp.doorIdx = Math.abs(bp.lx - DOOR_X[1]) < Math.abs(bp.lx - DOOR_X[0]) ? 1 : 0;
      bp.state = 'stand_to_aisle';
    }
  }
  function updateBusPassengers(dt) {
    for (const bp of busPassengers.slice()) {
      const p = bp.p;
      if (!p || p.dead) {
        if (bp.seat) bp.seat.occupant = null;
        const idx = busPassengers.indexOf(bp);
        if (idx >= 0) busPassengers.splice(idx, 1);
        continue;
      }
      p.h.obj.visible = true;
      let moveDist = 0;
      if (bp.state === 'climb_steps') {
        const dX = DOOR_X[bp.doorIdx] ?? DOOR_X[0];
        const stepSpd = 1.05 * dt;
        bp.lz = Math.max(.05, bp.lz - stepSpd);
        bp.lx += (dX - bp.lx) * Math.min(1, dt * 6);
        // Поднимаемся по ступенькам от y=0.41 (z=1.18) к полу салона y=0.775 (z<=0.76)
        const u = clamp((1.18 - bp.lz) / .42, 0, 1);
        bp.ly = .41 + u * .365;
        bp.ry = Math.PI;
        moveDist = stepSpd;
        p.h.setAnim('walk');
        if (bp.lz <= .08) {
          bp.lz = 0; bp.ly = .775;
          bp.state = 'walk_aisle';
        }
      } else if (bp.state === 'walk_aisle') {
        const targetX = bp.seat ? bp.seat.x : 0;
        const dx = targetX - bp.lx;
        const step = Math.sign(dx) * Math.min(Math.abs(dx), 1.25 * dt);
        bp.lx += step;
        bp.lz += (0 - bp.lz) * Math.min(1, dt * 8);
        bp.ly = .775;
        bp.ry = dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
        moveDist = Math.abs(step);
        p.h.setAnim('walk');
        if (Math.abs(dx) < .06) {
          bp.state = 'slide_into_seat';
        }
      } else if (bp.state === 'slide_into_seat') {
        if (!bp.seat) { bp.state = 'walk_to_door'; continue; }
        const tz = bp.seat.z;
        const dz = tz - bp.lz;
        const step = Math.sign(dz) * Math.min(Math.abs(dz), 1.15 * dt);
        bp.lz += step;
        bp.lx += (bp.seat.x - bp.lx) * Math.min(1, dt * 8);
        bp.ly = .775;
        bp.ry = Math.PI / 2;
        moveDist = Math.abs(step);
        p.h.setAnim('walk');
        if (Math.abs(dz) < .05) {
          bp.lx = bp.seat.x;
          bp.lz = bp.seat.z;
          bp.ly = .75;
          bp.ry = Math.PI / 2;
          bp.state = 'seated';
        }
      } else if (bp.state === 'seated') {
        bp.lx = bp.seat ? bp.seat.x : bp.lx;
        bp.lz = bp.seat ? bp.seat.z : bp.lz;
        bp.ly = .75;
        bp.ry = Math.PI / 2;
        p.h.setAnim('sit');
        // Лёгкое покачивание корпуса сидящего пассажира в такт разгону, торможению и поворотам автобуса
        if (p.h.R && p.h.R.spine) {
          p.h.R.spine.rotation.z = clamp((B_.turnRate || 0) * .12, -.12, .12);
          p.h.R.spine.rotation.x += clamp(-(B_.accel || 0) * .025, -.09, .09);
        }
      } else if (bp.state === 'stand_to_aisle') {
        const dz = 0 - bp.lz;
        const step = Math.sign(dz) * Math.min(Math.abs(dz), 1.15 * dt);
        bp.lz += step;
        bp.ly = .775;
        bp.ry = dz >= 0 ? 0 : Math.PI;
        moveDist = Math.abs(step);
        p.h.setAnim('walk');
        if (Math.abs(dz) < .06) {
          bp.lz = 0;
          bp.state = 'walk_to_door';
        }
      } else if (bp.state === 'walk_to_door') {
        const dX = DOOR_X[bp.doorIdx] ?? DOOR_X[0];
        const dx = dX - bp.lx;
        const step = Math.sign(dx) * Math.min(Math.abs(dx), 1.30 * dt);
        bp.lx += step;
        bp.lz += (0 - bp.lz) * Math.min(1, dt * 8);
        bp.ly = .775;
        bp.ry = dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
        moveDist = Math.abs(step);
        p.h.setAnim('walk');
        if (Math.abs(dx) < .06 && B_.doorK > .5) {
          bp.lx = dX;
          bp.state = 'step_down';
        } else if (Math.abs(dx) < .06) {
          p.h.setAnim('wait');
        }
      } else if (bp.state === 'step_down') {
        const stepSpd = 1.15 * dt;
        bp.lz += stepSpd;
        const u = clamp((1.22 - bp.lz) / .46, 0, 1);
        bp.ly = .05 + u * .725;
        bp.ry = 0; // лицом к выходу (+Z)
        moveDist = stepSpd;
        p.h.setAnim('walk');
        if (bp.lz >= 1.32) {
          // Пассажир спустился по ступенькам на тротуар — переводим его обратно в глобальную сцену мира
          const wp = busToWorld(bp.lx, 0, bp.lz + .22, new THREE.Vector3());
          bus.remove(p.h.obj);
          scene.add(p.h.obj);
          p.inBus = false;
          p.h.obj.position.set(wp.x, 0, wp.z);
          p.h.obj.rotation.y = B_.heading;
          const idx = busPassengers.indexOf(bp);
          if (idx >= 0) busPassengers.splice(idx, 1);
          if (env.onNpcAlighted) env.onNpcAlighted(p, wp.x, wp.z);
          continue;
        }
      }
      p.h.obj.position.set(bp.lx, bp.ly, bp.lz);
      p.h.obj.rotation.y = bp.ry;
      p.h.update(dt, moveDist);
    }
  }

  function tick(dt, obstacles) {
    // Запоминаем локальные координаты игрока и скорость относительно автобуса ДО смещения автобуса в текущем кадре
    const prevLocal = onBoard ? worldToBus(P.x, P.z) : null;
    const prevHeading = B_.heading;
    const prevV = B_.v;
    const prevBusX = bus.position.x, prevBusZ = bus.position.z;

    const [x, z] = routePoint(route, B_.s), [ax, az] = routePoint(route, B_.s + 3), dirx = ax - x, dirz = az - z, dl = Math.hypot(dirx, dirz) || 1;
    let ahead = 1e9, key = null;
    for (const [k, s0] of Object.entries(stopS)) {
      const ds = ((s0 - B_.s) % routeLen + routeLen) % routeLen;
      if (ds < ahead && !(B_.served[k] && (ds > routeLen - 30 || ds < 8))) { ahead = ds; key = k; }
    }
    if (B_.state === 'drive') {
      let target = B_.vmax;
      if (ahead < 40) target = Math.min(target, Math.sqrt(2 * 1.6 * Math.max(0, ahead - .3)));
      const [bx, bz] = routePoint(route, B_.s + 10);
      const turn = Math.abs(Math.atan2(bz - az, bx - ax) - Math.atan2(dirz, dirx));
      if (Math.min(turn, 2 * Math.PI - turn) > .3) target = Math.min(target, 4.5);
      for (const o of obstacles) {
        const vx = o.x - x, vz = o.z - z, al = (vx * dirx + vz * dirz) / dl, lat = Math.abs(vx * dirz - vz * dirx) / dl;
        if (al > 0 && al < 12 && lat < 1.65) target = Math.min(target, Math.max(0, (al - 5.0) * 1.2));
      }
      B_.v += clamp(target - B_.v, -6 * dt, 1.5 * dt);
      B_.s = (B_.s + B_.v * dt) % routeLen;
      B_.doorK = Math.max(0, B_.doorK - dt * 1.8);
      if (ahead < .6 && B_.v < .3) {
        B_.state = 'stop'; B_.t = 0; B_.stop = key; B_.served = { [key]: true };
        env.audio && env.audio.door(true);
        triggerStopAlighting();
        env.onArrive && env.onArrive(key, doorWorld(0), doorWorld(1));
        if (onBoard && STOPS[key]) {
          ctx.toast && ctx.toast(`Остановка «${STOPS[key].name}». Встаньте с места и выходите через открытую дверь.`);
        }
      }
    } else if (B_.state === 'stop') {
      B_.t += dt; B_.v = 0;
      // На каждой остановке двери открываются; пока пассажиры входят/выходят по ступенькам или игрок стоит в проходе, двери ждут
      const npcUsingSteps = busPassengers.some(bp => bp.state === 'climb_steps' || bp.state === 'walk_to_door' || bp.state === 'step_down');
      const waitTime = (onBoard && !seatedSeat) || npcUsingSteps ? 20 : 15;
      if (B_.t < 1.0) B_.doorK = ease(B_.t);
      else if (B_.t < waitTime) B_.doorK = 1;
      else {
        if (B_.doorK === 1) env.audio && env.audio.door(false);
        B_.doorK = Math.max(0, B_.doorK - dt * 1.25);
      }
      if (B_.t > waitTime + 1 && B_.doorK <= 0) {
        env.audio && env.audio.horn && env.audio.horn(null, .5); // автобус сигналит, трогаясь с остановки
        B_.state = 'drive'; B_.stop = null;
      }
    }

    // Анимация складывания ширмовых дверей «в гармошку» внутрь салона
    const foldAng = B_.doorK * 1.38;
    for (const d of doors) {
      for (const p of d.pair) {
        p.piv1.rotation.y = -p.s * doorsSide * foldAng;
        p.piv2.rotation.y =  2 * p.s * doorsSide * foldAng;
      }
    }

    const [nx, nz] = routePoint(route, B_.s), [nax, naz] = routePoint(route, B_.s + 3);
    const h = Math.atan2(naz - nz, nax - nx);
    let dh = -h - B_.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const stepYaw = dh * Math.min(1, dt * 5);
    B_.prevHeading = prevHeading;
    B_.heading += stepYaw;
    B_.accel = clamp((B_.v - prevV) / Math.max(dt, .008), -12, 12);
    B_.turnRate = clamp(stepYaw / Math.max(dt, .008), -3.5, 3.5);
    B_.dx = nx - prevBusX;
    B_.dz = nz - prevBusZ;
    // Вибрация кузова на неровностях зимней дороги при движении
    const spdRatio = clamp(B_.v / B_.vmax, 0, 1);
    B_.bumpX = spdRatio * (Math.sin(B_.s * 2.3) * .35 + Math.cos(B_.s * 5.7) * .22);
    B_.bumpZ = spdRatio * (Math.cos(B_.s * 1.9) * .30 + Math.sin(B_.s * 6.3) * .18);
    updateDriverPose(dt, dh);
    const roadPitch = clamp(-B_.accel * .0035, -.018, .018) + spdRatio * Math.sin(B_.s * 3.1) * .004;
    const roadRoll = clamp(B_.turnRate * B_.v * .003, -.028, .028) + spdRatio * Math.cos(B_.s * 2.7) * .005;
    bus.position.set(nx, spdRatio * Math.abs(Math.sin(B_.s * 4.2)) * .012, nz);
    bus.rotation.set(roadRoll, B_.heading, roadPitch);
    bus.updateMatrixWorld(true);
    updateBusPassengers(dt);

    wheels.forEach(w => w.rotation.y -= B_.v * dt / .46);
    for (const w of modelWheels) w.rotation.z -= B_.v * dt / w.userData.r; // колёса новой модели
    { const th = B_.doorK * 1.38; for (const d of modelDoors) d.rotation.y = d.userData.sgn * (d.userData.mult || 1) * th; } // четырёхстворчатые двери «гармошкой» внутрь проёма
    const night = env.night();
    hl.emissiveIntensity = night ? 3 : 0;
    lamp.intensity = lampRear.intensity = night || onBoard ? 3.8 : B_.doorK > .1 ? 1.8 : .6;
    plafM.emissiveIntensity = night || B_.doorK > .1 || onBoard ? 1.4 : .3;
    env.audio && env.audio.carState('bus', nx, nz, B_.v * .7);

    // Если игрок уже был в салоне — переносим его позицию и взгляд вместе с движением и поворотом автобуса без малейшей задержки
    if (onBoard && prevLocal) {
      const dYaw = B_.heading - prevHeading;
      P.yaw += Math.atan2(Math.sin(dYaw), Math.cos(dYaw));

      if (sitAnim) {
        sitAnim.t += dt * 3.2;
        const k = ease(Math.min(1, sitAnim.t));
        const curL = tmp2.lerpVectors(sitAnim.from, sitAnim.to, k);
        const wp = busToWorld(curL.x, curL.y, curL.z, tmp);
        P.x = wp.x; P.z = wp.z; P.h = curL.y;
        if (sitAnim.t >= 1) {
          if (sitAnim.mode === 'sit' && seatedSeat) {
            const wp2 = busToWorld(seatedSeat.sitLocal.x, seatedSeat.sitLocal.y, seatedSeat.sitLocal.z, tmp);
            P.x = wp2.x; P.z = wp2.z; P.h = seatedSeat.sitLocal.y;
          }
          sitAnim = null;
        }
      } else if (seatedSeat) {
        const wp = busToWorld(seatedSeat.sitLocal.x, seatedSeat.sitLocal.y, seatedSeat.sitLocal.z, tmp);
        P.x = wp.x; P.z = wp.z; P.h = seatedSeat.sitLocal.y;
      } else {
        // Игрок стоит/идёт в салоне: переносим его локальную координату с предыдущего кадра на новый кадр автобуса
        let lx = prevLocal.lx, lz = prevLocal.lz;
        // Если двери закрыты (автобус едет), удерживаем стоящего игрока внутри габаритов салона
        if (B_.doorK < .45) {
          lx = clamp(lx, -L / 2 + .34, L / 2 - 1.18);
          lz = clamp(lz, -Wd / 2 + .26, Wd / 2 - .26);
        }
        const wp = busToWorld(lx, P.h, lz, tmp);
        P.x = wp.x; P.z = wp.z;
      }
    }

    // Физика покачивания камеры игрока при езде в автобусе (разгон, торможение, повороты и кочки)
    if (onBoard && B_.v > .15) {
      P.pitch = clamp(P.pitch + (-B_.accel * .0018 + B_.bumpX * .0025) * dt * 8, -1.35, 1.25);
      P.roll = (P.roll || 0) + (B_.turnRate * B_.v * .0045 + B_.bumpZ * .004 - (P.roll || 0) * .25) * Math.min(1, dt * 8);
    }

    // Проверяем вход и выход игрока пешком через открытые двери
    syncPlayerBoarding();
  }

  function syncPlayerBoarding() {
    if (seatedSeat) { onBoard = true; return; }
    const { lx, lz } = worldToBus(P.x, P.z);
    const insideCabin = lx > -L / 2 + .25 && lx < L / 2 - .95 && Math.abs(lz) < Wd / 2 - .06;
    if (!onBoard && insideCabin) {
      onBoard = true;
      boardedStop = B_.stop;
      env.onCtl && env.onCtl();
      ctx.toast && ctx.toast('Вы зашли в автобус №7. Наведите на любое сиденье и нажмите, чтобы сесть.');
    } else if (onBoard && !insideCabin && (Math.abs(lz) > Wd / 2 + .08 || Math.abs(lx) > L / 2)) {
      onBoard = false;
      sitAnim = null;
      P.seated = false;
      const stopKey = B_.stop;
      if (stopKey && STOPS[stopKey] && boardedStop && boardedStop !== stopKey) {
        ctx.toast && ctx.toast('Вышли на остановке «' + STOPS[stopKey].name + '».');
      }
      boardedStop = null;
      env.onCtl && env.onCtl();
    }
  }

  const doorWorld = (idx = 0) => {
    bus.updateMatrixWorld(true);
    const dl = new THREE.Vector3(DOOR_X[idx] ?? DOOR_X[0], 1.0, doorsSide * (Wd / 2 + .55));
    return bus.localToWorld(dl);
  };
  // ---------- модель ПАЗ-652 из присланного файла: заменяет процедурный кузов (логика посадки, сиденья, проёмы — прежние) ----------
  function splitMeshByTris(mesh, pick) { // вырезать из меша треугольники, для которых pick(cx, cy, cz, i, ymin, ymax, zmin, zmax) истинно -> новая геометрия
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, P_ = g.attributes.position, keep = [], take = [];
    for (let i = 0; i < P_.count; i += 3) {
      const x0 = P_.getX(i), x1 = P_.getX(i + 1), x2 = P_.getX(i + 2);
      const y0 = P_.getY(i), y1 = P_.getY(i + 1), y2 = P_.getY(i + 2);
      const z0 = P_.getZ(i), z1 = P_.getZ(i + 1), z2 = P_.getZ(i + 2);
      const cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3, cz = (z0 + z1 + z2) / 3;
      const ymin = Math.min(y0, y1, y2), ymax = Math.max(y0, y1, y2), zmin = Math.min(z0, z1, z2), zmax = Math.max(z0, z1, z2);
      (pick(cx, cy, cz, i, ymin, ymax, zmin, zmax) ? take : keep).push(i);
    }
    const build = list => { const o = new THREE.BufferGeometry(); for (const [n, a] of Object.entries(g.attributes)) { const s = a.itemSize, arr = new Float32Array(list.length * 3 * s); const G = ['getX', 'getY', 'getZ', 'getW']; list.forEach((i, j) => { for (let v = 0; v < 3; v++) for (let c = 0; c < s; c++) arr[(j * 3 + v) * s + c] = a[G[c]](i + v); }); o.setAttribute(n, new THREE.BufferAttribute(arr, s)); } o.computeBoundingBox(); return o; };
    return [build(take), build(keep)];
  }
  function setModel(gltf, driverParts) {
    // процедурный кузов прячем; ниже создадим чистый салон ПАЗа (как на эталонном фото), ровные колёса, ступеньки и сиденья
    bus.traverse(o => { if (o.isMesh && !o.userData.driverKolya) o.visible = false; });
    const root = gltf.scene.clone(true); root.updateMatrixWorld(true); const g = new THREE.Group(); bus.add(g);
    const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
    const gTube = (x1, y1, z1, x2, y2, z2, r = .016, m = chromeM) => {
      const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2), len = a.distanceTo(b);
      const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
      o.position.copy(a).add(b).multiplyScalar(.5);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      o.castShadow = true; o.userData.bus = true; g.add(o); return o;
    };
    // Точные координаты проёмов четырёхстворчатых ширмовых дверей ПАЗ-652 по правому борту (+Z)
    const DOORS = [{ c: 1.144, hw: .396, pivs: {} }, { c: -2.241, hw: .396, pivs: {} }];
    DOOR_X[0] = DOORS[0].c; DOOR_X[1] = DOORS[1].c; doorLocal.x = DOORS[0].c;
    for (const d of DOORS) {
      for (const sgn of [1, -1]) {
        const piv1 = new THREE.Group(); piv1.position.set(d.c - sgn * .393, 0, 1.298); piv1.userData = { sgn, mult: 1 }; g.add(piv1); modelDoors.push(piv1);
        const piv2 = new THREE.Group(); piv2.position.set(sgn * .194, 0, 0); piv2.userData = { sgn, mult: -2 }; piv1.add(piv2); modelDoors.push(piv2);
        d.pivs[sgn] = { piv1, piv2, x1: d.c - sgn * .393, x2: d.c - sgn * .199, z0: 1.298 };
      }
    }
    let driverSeatMat = null;
    for (const m of meshes) {
      const mat = m.material, mn = mat.name || '';
      mat.normalMap = null;
      if (/(WallGlass|MainGlass|HLGlass$)/i.test(mn)) {
        mat.map = null; mat.color.setHex(0x8fa8b4); mat.transparent = true; mat.opacity = .24; mat.alphaTest = 0; mat.depthWrite = false; mat.roughness = .12; mat.metalness = .25; mat.side = THREE.DoubleSide; m.renderOrder = 2;
      } else {
        mat.side = THREE.DoubleSide;
      }
      mat.needsUpdate = true;
      if (/DriverSeat/.test(mn)) driverSeatMat = mat;
      // Пропускаем рваные колёса, сиденья и стеклянную перегородку (PAZ_Wall / PAZ_WallGlass) из GLB — ниже строим салон точно как на фото 5875.jpg
      if ((/Tire|Wheel$|PAZ_Wheel/.test(mn) && !/SWheel/.test(mn)) || /Seats/.test(mn) || /^PAZ_Wall(Glass)?$/i.test(mn)) continue;
      m.castShadow = !/Glass|Seats|Inside|Floor/i.test(mn); m.receiveShadow = true; m.userData.bus = true;
      let geo = m.geometry.clone(); geo.applyMatrix4(m.matrixWorld);
      let tmpM = new THREE.Mesh(geo, mat);
      if (/SWheel/.test(mn)) {
        geo.computeBoundingBox(); const c = geo.boundingBox.getCenter(new THREE.Vector3()); geo.translate(-c.x, -c.y, -c.z);
        modelSteer = new THREE.Mesh(geo, mat); modelSteer.position.copy(c); modelSteer.userData.axis = new THREE.Vector3(-.62, .78, 0).normalize(); g.add(modelSteer); continue;
      }
      // В PAZ_BodyDetals убираем рваные треугольники ступенек в проёмах дверей и верхних люков (пол PAZ_Floor не режем, чтобы не было дыр у 2-й двери!)
      if (/BodyDetals/.test(mn)) {
        const [, keepD] = splitMeshByTris(tmpM, (cx, cy, cz) => cy > 2.32 || (cz > .56 && cy < .88 && DOORS.some(d => Math.abs(cx - d.c) < .48)));
        geo = keepD; tmpM = new THREE.Mesh(geo, mat);
      }
      // Четырёхстворчатые ширмовые двери («гармошка»): вырезаем точно по контуру створок
      if (/BodyDetals|BodyOut|MainGlass/.test(mn)) {
        let rest = tmpM;
        const zMaxDoor = /BodyOut/.test(mn) ? 1.310 : 1.325;
        for (const d of DOORS) {
          const [door, keep] = splitMeshByTris(rest, (x, y, z, i, ymin, ymax, zmin, zmax) => zmin > 1.27 && zmax < zMaxDoor && Math.abs(x - d.c) < d.hw && ymin > .415 && ymax < 2.16);
          rest = new THREE.Mesh(keep, mat);
          for (const sgn of [1, -1]) {
            const [half] = splitMeshByTris(new THREE.Mesh(door, mat), x => (x < d.c) === (sgn === 1));
            if (!half.attributes.position.count) continue;
            const [outerLeaf, innerLeaf] = splitMeshByTris(new THREE.Mesh(half, mat), x => Math.abs(x - d.c) >= .199);
            const pv = d.pivs[sgn];
            if (outerLeaf.attributes.position.count) {
              outerLeaf.translate(-pv.x1, 0, -pv.z0);
              const lm1 = new THREE.Mesh(outerLeaf, mat); lm1.renderOrder = m.renderOrder; lm1.userData.bus = true; lm1.castShadow = m.castShadow; pv.piv1.add(lm1);
            }
            if (innerLeaf.attributes.position.count) {
              innerLeaf.translate(-pv.x2, 0, -pv.z0);
              const lm2 = new THREE.Mesh(innerLeaf, mat); lm2.renderOrder = m.renderOrder; lm2.userData.bus = true; lm2.castShadow = m.castShadow; pv.piv2.add(lm2);
            }
          }
        }
        geo = rest.geometry;
      }
      const om = new THREE.Mesh(geo, mat); om.castShadow = m.castShadow; om.receiveShadow = true; om.renderOrder = m.renderOrder; om.userData.bus = true; g.add(om);
      if (/DriverSeat/.test(mn)) { geo.computeBoundingBox(); g.userData.driverSeat = geo.boundingBox.clone(); }
    }

    // ---------- 1. ИДЕАЛЬНО КРУГЛЫЕ 3D-КОЛЁСА ПАЗ/ГАЗ БЕЗ ВЫПИРАЮЩИХ ПОДКРЫЛКОВ ----------
    const tireSideTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const cx = c.getContext('2d');
      cx.fillStyle = '#1a1a1d'; cx.fillRect(0, 0, 256, 256);
      cx.strokeStyle = '#2c2c30'; cx.lineWidth = 10; cx.beginPath(); cx.arc(128, 128, 104, 0, Math.PI * 2); cx.stroke();
      cx.strokeStyle = '#111113'; cx.lineWidth = 6; cx.beginPath(); cx.arc(128, 128, 84, 0, Math.PI * 2); cx.stroke();
      cx.strokeStyle = '#252529'; cx.lineWidth = 4;
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        cx.beginPath(); cx.moveTo(128 + Math.cos(a) * 106, 128 + Math.sin(a) * 106);
        cx.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); cx.stroke();
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const tireTreadTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const cx = c.getContext('2d');
      cx.fillStyle = '#18181b'; cx.fillRect(0, 0, 256, 64);
      cx.fillStyle = '#28282c';
      for (let x = 0; x < 256; x += 16) { cx.fillRect(x, 4, 9, 16); cx.fillRect(x + 4, 24, 9, 16); cx.fillRect(x, 44, 9, 16); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const tireTreadM = std({ map: tireTreadTex, roughness: .85, metalness: .08 });
    const tireSideM = std({ map: tireSideTex, roughness: .82, metalness: .08 });
    const rimDiskM = std({ color: 0xd4cebc, roughness: .40, metalness: .45 });
    const hubDarkM = std({ color: 0x222428, roughness: .42, metalness: .60 });
    const archBackM = std({ color: 0x121315, roughness: .95, side: THREE.DoubleSide });

    modelWheels.length = 0;
    const WHEEL_SPECS = [
      { key: 'f1',  x:  2.201, y: .452, z:  1.065, sd:  1, dual: false },
      { key: 'f-1', x:  2.201, y: .452, z: -1.065, sd: -1, dual: false },
      { key: 'r1',  x: -1.214, y: .454, z:  .955,  sd:  1, dual: true  },
      { key: 'r-1', x: -1.214, y: .454, z: -.955,  sd: -1, dual: true  },
    ];
    for (const ws of WHEEL_SPECS) {
      // Плоский внутренний щиток глубоко внутри ниши колеса (z = ±0.66), не выступающий наружу и не перекрывающий колесо!
      B(.92, .48, .03, archBackM, ws.x, ws.y + .18, ws.sd * .66, g);

      const piv = new THREE.Group();
      piv.position.set(ws.x, ws.y, ws.z);
      piv.userData = { key: ws.key, r: .452 };
      g.add(piv); modelWheels.push(piv);

      const buildTireUnit = (zOff, isOuter) => {
        const w = .27;
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(.452, .452, w, 32), [tireTreadM, tireSideM, tireSideM]);
        cyl.rotation.x = Math.PI / 2; cyl.position.z = zOff; cyl.castShadow = true; cyl.userData.bus = true; piv.add(cyl);
        for (const s of [-1, 1]) {
          const bul = new THREE.Mesh(new THREE.TorusGeometry(.366, .086, 12, 32), tireTreadM);
          bul.position.z = zOff + s * (w * .36); bul.castShadow = true; bul.userData.bus = true; piv.add(bul);
        }
        if (isOuter) {
          const zFace = zOff + ws.sd * (w * .48);
          const rimOuter = new THREE.Mesh(new THREE.CylinderGeometry(.275, .275, .045, 28), rimDiskM);
          rimOuter.rotation.x = Math.PI / 2; rimOuter.position.z = zFace; piv.add(rimOuter);
          const rimDish = new THREE.Mesh(new THREE.TorusGeometry(.205, .032, 10, 28), rimDiskM);
          rimDish.position.z = zFace + ws.sd * .016; piv.add(rimDish);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(.092, .108, .075, 18), hubDarkM);
          hub.rotation.x = Math.PI / 2; hub.position.z = zFace + ws.sd * .032; piv.add(hub);
          for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * Math.PI * 2;
            const nut = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .04, 8), hubDarkM);
            nut.rotation.x = Math.PI / 2;
            nut.position.set(Math.cos(ang) * .15, Math.sin(ang) * .15, zFace + ws.sd * .024);
            piv.add(nut);
          }
        }
      };
      if (ws.dual) {
        buildTireUnit(-ws.sd * .12, false);
        buildTireUnit( ws.sd * .14, true);
      } else {
        buildTireUnit(0, true);
      }
    }

    // ---------- 2. ЧИСТЫЕ ТРЁХСТУПЕНЧАТЫЕ ПОДНОЖКИ У ОБЕИХ ДВЕРЕЙ ПАЗа БЕЗ ЩЕЛЕЙ И ДЫР В ПОЛУ ----------
    const stepTreadM = std({ map: ribTex, color: 0x262628, roughness: .92, side: THREE.DoubleSide });
    const stepRiserM = std({ color: 0xc87228, roughness: .55, metalness: .14, side: THREE.DoubleSide });
    const stepNoseM  = std({ color: 0xc8c8c4, roughness: .35, metalness: .75 });
    for (const d of DOORS) {
      const sw = d.hw * 2 - .01;
      // Широкая накладка уровня пола салона (y = 0.772) вокруг ступенек + глухая подложка (y = 0.39), полностью закрывающая выемку у 2-й двери!
      B(1.18, .026, .34, stepTreadM, d.c + .12, .772, .72, g);
      B(.36, .028, .56, stepTreadM, d.c + .54, .772, 1.00, g);
      B(1.16, .025, .60, stepRiserM, d.c + .10, .39, 1.00, g);
      B(1.16, .39, .028, stepRiserM, d.c + .10, .585, .74, g);
      // Боковые щёчки лестницы
      for (const sgn of [-1, 1]) {
        B(.032, .40, .54, stepRiserM, d.c + sgn * (sw / 2), .585, 1.02, g);
      }
      // 3 ступеньки от нижнего порога двери (y=0.41) к уровню пола салона (y=0.77)
      const steps = [
        { y: .41, z: 1.18, d: .22, h: .16 },
        { y: .57, z: 1.00, d: .20, h: .16 },
        { y: .73, z:  .83, d: .18, h: .06 },
      ];
      for (const st of steps) {
        B(sw, .03, st.d, stepTreadM, d.c, st.y, st.z, g);
        B(sw, st.h, .025, stepRiserM, d.c, st.y + st.h / 2, st.z - st.d / 2 + .01, g);
        B(sw, .018, .022, stepNoseM, d.c, st.y + .01, st.z + st.d / 2 - .01, g);
      }
    }

    // ---------- 3. ПЕРЕДНЯЯ ЧАСТЬ САЛОНА У ДЯДИ КОЛИ БЕЗ СТЕКЛА ПЕРЕГОРОДКИ — ТОЧНО КАК НА ФОТО 5875.jpg ----------
    const pazOchreM = std({ color: 0xc87228, roughness: .52, metalness: .14, side: THREE.DoubleSide });
    const partBoardM = std({ color: 0x2c3238, roughness: .72, metalness: .15, side: THREE.DoubleSide });
    // Охристо-оранжевая нижняя тумба перегородки за спиной Дяди Коли (z = -1.25 .. -0.10) с плавным переходом к капоту
    B(.048, .70, 1.16, pazOchreM, 1.58, 1.12, -.68, g);
    B(.42, .48, .045, pazOchreM, 1.78, 1.01, -.10, g);
    B(.054, .028, 1.16, chromeM, 1.58, 1.48, -.68, g);

    // Верхний щит перегородки ТОЛЬКО слева за спиной водителя (z = -1.18 .. -0.14, y = 1.48 .. 2.12) — БЕЗ стекла справа над капотом!
    B(.028, .64, 1.04, partBoardM, 1.58, 1.80, -.66, g);
    // Верхняя хромированная планка щита с крепежами и левая стойка
    gTube(1.58, 2.13, -1.22, 1.58, 2.13, -.06, .015, chromeM);
    gTube(1.58, 1.48, -1.20, 1.58, 2.13, -1.20, .015, chromeM);
    for (const cz of [-1.05, -.66, -.26]) B(.04, .05, .03, chromeM, 1.58, 2.13, cz, g);

    // Охристый надлобовой козырёк с вентиляционными прорезями НАД ЛОБОВЫМ СТЕКЛОМ (впереди у крыши, x = 2.74, как на фото 5875.jpg)
    const headerTex = (() => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128; const cx = c.getContext('2d');
      cx.fillStyle = '#c87228'; cx.fillRect(0, 0, 512, 128);
      cx.fillStyle = '#a85a1a'; cx.fillRect(0, 110, 512, 18);
      cx.fillStyle = '#2b160c';
      for (let x = 70; x <= 210; x += 12) cx.fillRect(x, 36, 5, 38);
      for (let x = 250; x <= 390; x += 12) cx.fillRect(x, 36, 5, 38);
      cx.fillStyle = '#18181c';
      cx.beginPath(); cx.ellipse(36, 62, 22, 16, 0, 0, Math.PI * 2); cx.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const headerM = std({ map: headerTex, roughness: .52, metalness: .12, side: THREE.DoubleSide });
    const hdrL = B(.05, .36, 1.36, headerM, 2.72, 2.42, -.56, g); hdrL.rotation.z = .18;
    const hdrR = B(.05, .34, 1.18, pazOchreM, 2.72, 2.42,  .62, g); hdrR.rotation.z = .18;

    // Красный огнетушитель на левой стойке перегородки за водителем (5875.jpg)
    const extRedM = std({ color: 0xb81d18, roughness: .38, metalness: .25 });
    const extCyl = new THREE.Mesh(new THREE.CylinderGeometry(.058, .058, .38, 14), extRedM);
    extCyl.position.set(1.53, 1.80, -1.16); extCyl.castShadow = true; extCyl.userData.bus = true; g.add(extCyl);
    const extTop = new THREE.Mesh(new THREE.SphereGeometry(.058, 12, 8), extRedM);
    extTop.position.set(1.53, 1.99, -1.16); g.add(extTop);
    B(.04, .07, .05, darkM, 1.53, 2.05, -1.16, g);
    B(.02, .025, .14, darkM, 1.53, 1.72, -1.16, g);
    B(.02, .025, .14, darkM, 1.53, 1.90, -1.16, g);

    // Листовки, схема маршрута и цветной постер на щите за Дядей Колей (5875.jpg)
    const partPostersTex = (() => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 320; const cx = c.getContext('2d');
      cx.fillStyle = '#2c3238'; cx.fillRect(0, 0, 512, 320);
      cx.fillStyle = '#ece8dc';
      cx.fillRect(16, 14, 142, 152);
      cx.fillRect(162, 16, 148, 120);
      cx.fillStyle = '#e5dac2';
      cx.fillRect(316, 14, 178, 118);
      cx.fillStyle = '#ece8dc'; cx.fillRect(18, 170, 138, 72);
      cx.fillStyle = '#0e6eb8';
      cx.beginPath(); cx.moveTo(26, 214); cx.lineTo(74, 180); cx.lineTo(138, 180); cx.lineTo(118, 228); cx.closePath(); cx.fill();
      cx.fillStyle = '#383838';
      for (const [bx, by, bw, bh] of [[24, 26, 124, 124], [170, 26, 130, 98], [324, 24, 160, 98]]) {
        for (let y = by; y < by + bh; y += 7) cx.fillRect(bx, y, bw - (y % 14 === 0 ? 18 : 4), 3);
      }
      cx.fillStyle = '#ebe7db'; cx.fillRect(314, 138, 180, 134);
      cx.fillStyle = '#383838';
      for (let y = 150; y < 258; y += 7) cx.fillRect(322, y, 162, 3);
      cx.fillStyle = '#181c20'; cx.fillRect(160, 140, 148, 164);
      cx.fillStyle = '#8b989e'; cx.fillRect(166, 146, 136, 70);
      cx.fillStyle = '#25282c'; cx.fillRect(180, 160, 36, 48); cx.fillRect(235, 156, 42, 52);
      cx.fillStyle = '#e8c828'; cx.font = '900 18px Arial'; cx.textAlign = 'center';
      cx.fillText('BRAINWASHER', 234, 236);
      cx.fillStyle = '#b89638'; cx.fillRect(202, 248, 98, 46);
      cx.strokeStyle = '#3a2810'; cx.lineWidth = 2; cx.strokeRect(205, 251, 92, 40);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const partPostersM = std({ map: partPostersTex, roughness: .58, side: THREE.DoubleSide });
    const pmMesh = new THREE.Mesh(new THREE.PlaneGeometry(.98, .62), partPostersM);
    pmMesh.position.set(1.562, 1.80, -.66); pmMesh.rotation.y = -Math.PI / 2; pmMesh.userData.bus = true; g.add(pmMesh);

    // Широкое салонное зеркало над перегородкой и зеркало водителя по центру лобового стекла (5875.jpg)
    const mirrorM = std({ color: 0x9ab0bc, roughness: .12, metalness: .85 });
    B(.04, .13, .40, darkM, 1.62, 2.25, -.74, g);
    B(.042, .11, .37, mirrorM, 1.615, 2.25, -.74, g);
    B(.035, .10, .26, darkM, 1.62, 2.08, -.16, g);

    // Кожух двигателя (капот) справа от водителя со стёганым узорчатым одеялом и светлой бахромой (5875.jpg)
    const quiltTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256; const cx = c.getContext('2d');
      cx.fillStyle = '#6e221c'; cx.fillRect(0, 0, 256, 256);
      cx.strokeStyle = '#d49b38'; cx.lineWidth = 3;
      for (let i = -256; i < 512; i += 28) {
        cx.beginPath(); cx.moveTo(i, 0); cx.lineTo(i + 256, 256); cx.stroke();
        cx.beginPath(); cx.moveTo(i + 256, 0); cx.lineTo(i, 256); cx.stroke();
      }
      cx.fillStyle = '#c87228';
      for (let y = 14; y < 256; y += 28) for (let x = 14; x < 256; x += 28) cx.fillRect(x - 4, y - 4, 8, 8);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const fringeTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const cx = c.getContext('2d');
      cx.fillStyle = '#dfd6be'; cx.fillRect(0, 0, 256, 26);
      cx.fillStyle = '#c8be9e';
      for (let x = 0; x < 256; x += 5) cx.fillRect(x, 26, 3, 36);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const quiltM = std({ map: quiltTex, roughness: .78, side: THREE.DoubleSide });
    const fringeM = std({ map: fringeTex, roughness: .82, side: THREE.DoubleSide });
    // Охристый короб капота, стёганый чехол сверху и светлая бахрома по периметру
    B(1.06, .46, .74, pazOchreM, 2.45, 1.00, .22, g);
    B(1.08, .09, .76, quiltM, 2.45, 1.26, .22, g);
    B(1.09, .11, .77, fringeM, 2.45, 1.17, .22, g);

    // Табличка маршрута под правым лобовым стеклом и чёрная кассетница на капоте (5875.jpg)
    const dashSignTex = (() => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128; const cx = c.getContext('2d');
      cx.fillStyle = '#e8e4da'; cx.fillRect(0, 0, 512, 128);
      cx.strokeStyle = '#222'; cx.lineWidth = 4; cx.strokeRect(4, 4, 504, 120);
      cx.strokeStyle = '#333'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(130, 4); cx.lineTo(130, 124); cx.stroke();
      cx.fillStyle = '#a81c14'; cx.font = '900 68px Arial'; cx.textAlign = 'center'; cx.fillText('7', 65, 88);
      cx.fillStyle = '#182232'; cx.font = '700 32px Arial'; cx.fillText('З. ВОКЗАЛ — ЗАВОД', 318, 52);
      cx.fillText('УЛ. ЗАВОДСКАЯ (ЛАРЁК)', 318, 98);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const dashSign = new THREE.Mesh(new THREE.PlaneGeometry(.62, .16), std({ map: dashSignTex, roughness: .5, side: THREE.DoubleSide }));
    dashSign.position.set(2.92, 1.42, .16); dashSign.rotation.y = -Math.PI / 2 - .10; dashSign.userData.bus = true; g.add(dashSign);
    B(.14, .09, .24, darkM, 2.66, 1.34, .02, g);
    B(.145, .035, .06, std({ color: 0xd8b828, roughness: .5 }), 2.66, 1.36, .02, g);

    // Тумба и коричневое кожаное сиденье кондуктора справа от капота + узкая охристая стойка у передней двери и шторка (5875.jpg)
    const pazSeatM = driverSeatMat ? driverSeatMat.clone() : std({ color: 0x5c3628, roughness: .62, side: THREE.DoubleSide });
    pazSeatM.side = THREE.DoubleSide;
    B(.48, .26, .42, pazOchreM, 2.16, .90, .62, g);
    B(.42, .11, .38, pazSeatM, 2.16, 1.08, .62, g);
    // Узкая охристая перегородка справа у передней двери (z = 0.84 .. 1.18) с вертикальным проёмом без стекла и тёмной шторкой
    B(.04, .70, .34, pazOchreM, 1.58, 1.12, 1.01, g);
    B(.04, .92, .08, pazOchreM, 1.58, 1.92, .88, g);
    B(.04, .92, .08, pazOchreM, 1.58, 1.92, 1.14, g);
    B(.04, .14, .34, pazOchreM, 1.58, 2.32, 1.01, g);
    const curtainM = std({ color: 0x2c1a16, roughness: .85, side: THREE.DoubleSide });
    B(.06, 1.18, .12, curtainM, 1.54, 1.80, 1.21, g);

    // ---------- 4. РОВНЫЕ ХРОМИРОВАННЫЕ ПОРУЧНИ С КРЕПЛЕНИЯМИ К ПОТОЛКУ И ПОЛУ ----------
    // Два продольных потолочных поручня с кронштейнами к потолку (ничего не висит в воздухе!)
    for (const sd of [-1, 1]) {
      const hz = sd * .48, hy = 2.48;
      gTube(-3.10, hy, hz, 1.60, hy, hz, .016, chromeM);
      for (const bx of [-3.05, -2.10, -1.15, -.20, .75, 1.58]) {
        gTube(bx, hy, hz, bx, 2.75, hz + sd * .08, .012, chromeM);
      }
    }
    // Два центральных вертикальных поручня в проходе у капота и перегородки (точно как на фото 5875.jpg)
    gTube(1.60, .77, -.04, 1.60, 2.66, -.04, .018, chromeM);
    gTube(1.94, .77, -.02, 1.94, 2.66, -.02, .018, chromeM);
    gTube(1.60, 1.18, -.04, 1.94, 1.18, -.02, .014, chromeM);
    // Вертикальные поручни у дверных проёмов
    for (const d of DOORS) {
      for (const sgn of [-1, 1]) {
        const px = d.c + sgn * (d.hw + .04);
        gTube(px, .77, .82, px, 2.58, .82, .016, chromeM);
      }
    }
    // Плафоны освещения салона на потолке (без серых прямоугольников под люками)
    for (const px of [-2.2, -.4, 1.25]) B(.44, .03, .18, plafM, px, 2.78, 0, g);

    // ---------- 5. ЧИСТЫЕ СИДЕНЬЯ С ХРОМИРОВАННЫМИ КАРКАСАМИ И ВЗРОСЛОЙ ВЫСОТОЙ КАМЕРЫ (sitLocal.y = 2.02) ----------
    seats.length = 0; seatMeshes.length = 0;
    const addCleanSeat = (xb, z, wZ, sd) => {
      const cush = B(.48, .13, wZ, pazSeatM, xb + .23, 1.08, z, g); cush.rotation.z = .04;
      const back = B(.09, .44, wZ, pazSeatM, xb, 1.40, z, g); back.rotation.z = .09;
      if (wZ < 1.2) {
        // Верхняя хромированная дуга-поручень спинки и боковые стойки-ножки до пола
        const zIn = z - sd * (wZ / 2 - .03), zOut = z + sd * (wZ / 2 - .03);
        gTube(xb - .03, 1.65, zIn, xb - .03, 1.65, zOut, .014, chromeM);
        gTube(xb - .03, 1.16, zIn, xb - .03, 1.65, zIn, .014, chromeM);
        gTube(xb - .03, 1.16, zOut, xb - .03, 1.65, zOut, .014, chromeM);
        // Ножки сиденья со стороны прохода
        gTube(xb + .04, .77, zIn + sd * .05, xb + .04, 1.04, zIn + sd * .05, .016, frameM);
        gTube(xb + .38, .77, zIn + sd * .05, xb + .38, 1.04, zIn + sd * .05, .016, frameM);
      }
      const sObj = {
        id: seats.length, x: xb + .23, z, sd, cush, back,
        // Высота глаз сидящего взрослого человека (2.02 м в координатах автобуса = середина окон 1.63..2.33 м)
        sitLocal: new THREE.Vector3(xb + .24, 2.02, z),
        standLocal: new THREE.Vector3(clamp(xb + .26, -2.55, 1.35), 2.38, 0),
      };
      cush.userData.busSeat = sObj; cush.userData.bus = true;
      back.userData.busSeat = sObj; back.userData.bus = true;
      seats.push(sObj); seatMeshes.push(cush, back);
    };
    for (const xb of [-1.64, -.81, -.01, .82]) addCleanSeat(xb, -.76, .89, -1);
    for (const xb of [-1.64, -.79, -.04]) addCleanSeat(xb, .76, .89, 1);
    addCleanSeat(-3.28, 0, 2.38, 0);

    // ---------- 6. ВОДИТЕЛЬ ДЯДЯ КОЛЯ ТОЧНО ПО ЦЕНТРУ РУЛЯ ПАЗ-652 ----------
    if (driverParts) {
      bus.remove(driver.obj); driverMeshes.length = 0;
      const look = makeLook('worker'); look.height = 1.79; look.male = true;
      driver = new Human(look, driverParts); dR = driver.R;
      const sb = g.userData.driverSeat;
      const sx = sb ? (sb.min.x + sb.max.x) / 2 + .06 : 2.24;
      const sy = sb ? sb.min.y + (sb.max.y - sb.min.y) * .38 : 1.08;
      // Центрируем водителя строго по оси рулевого колеса (z = -0.689), чтобы обе руки лежали точно на ободе
      const sz = modelSteer ? modelSteer.position.z : -.689;
      driver.obj.position.set(sx, sy - dR.legLen, sz); driver.obj.rotation.y = Math.PI / 2; bus.add(driver.obj);
      driver.obj.traverse(o => { if (o.isMesh) { o.userData.driverKolya = true; o.userData.bus = true; driverMeshes.push(o); } });
    }
  }
  const exhaustWorld = new THREE.Vector3();
  function exhaust() { busToWorld(exhaustLocal.x, exhaustLocal.y, exhaustLocal.z, exhaustWorld); return { pos: exhaustWorld, v: B_.v, heading: B_.heading }; }
  function canBoard() { return false; } // вход в автобус теперь осуществляется пешком через открывающиеся двери
  function board() {}
  function canAlight() { return !!seatedSeat; }
  function alight() { if (seatedSeat) standFromSeat(); }

  function lookingAtDriver(maxD = 2.8) {
    if (!onBoard && B_.doorK < .45) return false;
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    ray.far = maxD;
    return ray.intersectObjects(driverMeshes, false).length > 0;
  }
  function talkToDriver() {
    driverTalkT = 7;
    if (!ctx || !ctx.dialog) return;
    const S = ctx.getS ? ctx.getS() : null;
    const mem = S ? (S.npcMemory = S.npcMemory || { talks: {}, crimes: { gunAimed: 0, brawls: 0, kills: 0 } }) : { talks: {}, crimes: {} };
    mem.talks.kolya = (mem.talks.kolya || 0) + 1;
    const tc = mem.talks.kolya;
    const curStop = B_.stop && STOPS[B_.stop] ? STOPS[B_.stop].name : null;
    const passCnt = busPassengers.length;
    const crimeNote = (mem.crimes && mem.crimes.kills > 0)
      ? ' Слышь, сосед… По району разговоры нехорошие ходят, будто у твоего ларька человека порешили. Ты в моём автобусе без фокусов давай!'
      : (mem.crimes && mem.crimes.gunAimed > 0)
      ? ' Ты только двустволкой своей в салоне не маши, у меня пассажиры нервные!'
      : '';
    const greet = tc === 1
      ? `Здорово, сосед! Садись в салон, печка в ПАЗике греет знатно. Маршрут №7 — ходит кольцом от твоего ларька до Краснозаводского завода и обратно.${crimeNote}`
      : tc === 2
      ? `Снова ты, коммерсант! Уже второй раз за смену с тобой толкуем.${curStop ? ' Сейчас стоим на остановке «' + curStop + '».' : ' Едем по маршруту, держись за поручень!'}${crimeNote}`
      : `Ну ты, брат, разговорчивый сегодня — уже в ${tc}-й раз подходишь! В салоне сейчас ${passCnt ? passCnt + ' пасс.' : 'свободно'}, коробки можешь прямо на пол ставить, только на поворотах держи, чтоб не укатились!`;
    ctx.dialog({
      name: 'Дядя Коля (водитель ПАЗ-652)',
      text: greet,
      options: [
        { label: 'Как дорога и расписание сегодня?', fn: () => {
          driverTalkT = 6;
          ctx.dialog({
            name: 'Дядя Коля',
            text: `Дорогу с утра подморозило, на поворотах у разворота заносит маленько — если бутылки или коробки на пол в салоне бросишь, при торможении покатятся! А хожу я строго по графику на табличке остановки.`,
            options: [{ label: 'Понял, буду иметь в виду!', fn: () => ctx.closeDialog() }]
          });
        } },
        { label: 'Что на заводе слышно?', fn: () => {
          driverTalkT = 6;
          ctx.dialog({
            name: 'Дядя Коля',
            text: `У проходной Краснозаводского завода кладовщик Гена дежурит. У него заводское пиво, тушёнку, лимонад и сигареты со скидкой 20% берут прямо ящиками — ставь ящик ко мне в салон и вези к ларьку бесплатно!`,
            options: [{ label: 'Отлично, спасибо Дядь Коль!', fn: () => ctx.closeDialog() }]
          });
        } },
        { label: 'Не отвлекаю от руля!', fn: () => ctx.closeDialog() },
      ]
    });
  }

  return {
    tick, board, alight, canBoard, canAlight,
    lookedSeat, sitOnSeat, standFromSeat,
    lookingAtDriver, talkToDriver, get driver() { return driver; }, setModel, exhaust,
    playerBlocked, floorHeightAt, syncPlayerBoarding,
    worldToBus, busToWorld, isInsideBus, busSurfaceAt,
    boardNpcPassenger, get busPassengers() { return busPassengers; },
    busMotion: () => ({ v: B_.v, accel: B_.accel || 0, turnRate: B_.turnRate || 0, heading: B_.heading, prevHeading: B_.prevHeading || B_.heading, dx: B_.dx || 0, dz: B_.dz || 0, bumpX: B_.bumpX || 0, bumpZ: B_.bumpZ || 0, doorK: B_.doorK }),
    get doorK() { return B_.doorK; }, bus,
    get riding() { return !!seatedSeat; },
    get onBoard() { return onBoard; },
    get seated() { return !!seatedSeat; },
    get stopKey() { return B_.stop; },
    get state() { return B_.state; },
    obstacle: () => ({ x: bus.position.x, z: bus.position.z, heading: B_.heading, hx: L / 2 + .25, hz: Wd / 2 + .18, v: B_.v }),
    doorWorld, bus,
    nextStopName() { const k = B_.stop || Object.keys(STOPS).find(k => !B_.served[k]); return k ? STOPS[k].name : ''; },
  };
}
