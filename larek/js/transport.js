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
  const driver = new Human(kolyaLook, null);
  const dR = driver.R;
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
    steerPivot.rotation.y = steer;
    // Сидячая поза Дяди Коли: бёдра горизонтально на подушке кресла, голени к педалям, руки держат обод руля
    dR.body.position.set(0, 0, 0);
    dR.body.rotation.set(0, 0, 0);
    dR.hips.rotation.set(0, 0, 0);
    dR.spine.rotation.set(.10, steer * .08, 0);
    dR.thL.rotation.set(-1.42, 0, .08);
    dR.thR.rotation.set(-1.42, 0, -.08);
    dR.knL.rotation.set(1.24, 0, 0);
    dR.knR.rotation.set(1.18 + Math.sin(driverT * 1.8) * (B_.v > .5 ? .05 : 0), 0, 0);
    // Руки вытянуты вперёд к рулевому колесу и поворачиваются при рулении
    dR.shL.rotation.set(-.96 + steer * .18, -.10, -.16);
    dR.shR.rotation.set(-.96 - steer * .18,  .10,  .16);
    dR.elL.rotation.set(-.72 - steer * .10, 0, .18);
    dR.elR.rotation.set(-.72 + steer * .10, 0, -.18);
    // На остановке Дядя Коля поглядывает в правое зеркало и в салон, а при разговоре — поворачивает голову к игроку
    let headYaw = 0, headPitch = .04;
    if (driverTalkT > 0) {
      headYaw = -.65;
      headPitch = .08 + Math.sin(driverT * 12) * .04;
      driver.setExpr('talk');
    } else if (B_.state === 'stop') {
      headYaw = -.38 + Math.sin(driverT * .9) * .12;
      driver.setExpr('neutral');
    } else {
      headYaw = steer * .22 + Math.sin(driverT * .6) * .06;
      driver.setExpr('neutral');
    }
    dR.neck.rotation.set(0, headYaw * .4, 0);
    dR.head.rotation.set(headPitch, headYaw * .6, 0);
    driver.updateFace(dt);
  }

  const lamp = new THREE.PointLight(0xffe8c0, .6, 6.5, 2); lamp.position.set(0, 2.25, 0); bus.add(lamp);
  bus.traverse(o => { if (o.isMesh) o.userData.bus = true; });

  // ---------- движение по маршруту, остановки и нахождение игрока в салоне ----------
  const B_ = { s: 120, v: 0, vmax: 9.5, heading: Math.PI, state: 'drive', t: 0, stop: null, doorK: 0, served: {} };
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
    if (seatedSeat) return .58;
    const { lx, lz } = worldToBus(wx, wz);
    if (Math.abs(lx) > L / 2 - .12 || Math.abs(lz) > Wd / 2 + .18) return 0;
    if (Math.abs(lz) <= Wd / 2 - .22) return .58;
    if (inDoorGap(lx) && lz * DS > Wd / 2 - .22 && lz * DS <= Wd / 2 + .18) {
      const u = clamp((Wd / 2 + .18 - lz * DS) / .40, 0, 1);
      return u * .58;
    }
    return onBoard ? .58 : 0;
  }

  // Поиск сиденья, на которое смотрит игрок (или по экранным координатам ndcX, ndcY при нажатии)
  function lookedSeat(ndcX = 0, ndcY = 0, maxD = 2.6) {
    if (!onBoard && B_.doorK < .45) return null;
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    ray.far = maxD;
    const hits = ray.intersectObjects(seatMeshes, false);
    if (hits.length > 0 && hits[0].object.userData.busSeat) {
      return hits[0].object.userData.busSeat;
    }
    return null;
  }

  function sitOnSeat(seat) {
    if (!seat) return false;
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

  function tick(dt, obstacles) {
    // Запоминаем локальные координаты игрока относительно автобуса ДО смещения автобуса в текущем кадре
    const prevLocal = onBoard ? worldToBus(P.x, P.z) : null;
    const prevHeading = B_.heading;

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
        env.onArrive && env.onArrive(key, doorWorld());
        if (onBoard && STOPS[key]) {
          ctx.toast && ctx.toast(`Остановка «${STOPS[key].name}». Встаньте с места и выходите через открытую дверь.`);
        }
      }
    } else if (B_.state === 'stop') {
      B_.t += dt; B_.v = 0;
      // На каждой остановке двери открываются; если игрок встал с места в салоне или стоит в проёме двери, придерживаем двери открытыми чуть дольше
      const waitTime = (onBoard && !seatedSeat) ? 20 : 14;
      if (B_.t < 1.0) B_.doorK = ease(B_.t);
      else if (B_.t < waitTime) B_.doorK = 1;
      else {
        if (B_.doorK === 1) env.audio && env.audio.door(false);
        B_.doorK = Math.max(0, B_.doorK - dt * 1.25);
      }
      if (B_.t > waitTime + 1 && B_.doorK <= 0) {
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
    B_.heading += dh * Math.min(1, dt * 5);
    updateDriverPose(dt, dh);
    bus.position.set(nx, 0, nz);
    bus.rotation.y = B_.heading;
    bus.updateMatrixWorld(true);

    wheels.forEach(w => w.rotation.y -= B_.v * dt / .46);
    const night = env.night();
    hl.emissiveIntensity = night ? 3 : 0;
    lamp.intensity = night || onBoard ? 5.5 : B_.doorK > .1 ? 2 : 0;
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

  const doorWorld = () => { bus.updateMatrixWorld(true); return bus.localToWorld(doorLocal.clone()); };
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
    driverTalkT = 6;
    if (!ctx || !ctx.dialog) return;
    ctx.dialog({
      name: 'Дядя Коля (водитель ПАЗика)',
      text: 'Здорово, сосед! Садись в салон, печка греет. Маршрут седьмой — ходит кольцом по ул. Заводской: от ларька до завода и обратно! Остановки теперь с обеих сторон дороги.',
      options: [
        { label: 'Как смена, Дядь Коль?', fn: () => { driverTalkT = 6; ctx.dialog({ name: 'Дядя Коля', text: 'Да ничего, ПАЗик бегает! Главное — солярку вовремя сливать не забывают, хе-хе. Тебе до какой остановки?', options: [{ label: 'Спасибо, поеду!', fn: () => ctx.closeDialog() }] }); } },
        { label: 'Что на заводе слышно?', fn: () => { driverTalkT = 6; ctx.dialog({ name: 'Дядя Коля', text: 'Остановка прямо у главной проходной Краснозаводского завода! Там у ворот кладовщик Гена стоит — у него заводские товары со склада со скидкой 20% можно взять прямо в коробках!', options: [{ label: 'Отлично, съезжу!', fn: () => ctx.closeDialog() }] }); } },
        { label: 'Удачной дороги!', fn: () => ctx.closeDialog() },
      ]
    });
  }

  return {
    tick, board, alight, canBoard, canAlight,
    lookedSeat, sitOnSeat, standFromSeat,
    lookingAtDriver, talkToDriver, driver,
    playerBlocked, floorHeightAt, syncPlayerBoarding,
    get doorK() { return B_.doorK; },
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
