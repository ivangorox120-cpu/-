// Общественный транспорт: автобус по маршруту с остановками, посадка/поездка/высадка игрока и пассажиров.
// Маршруты и остановки описаны данными — новые линии и локации добавляются в ROUTES_BUS / STOPS.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export const STOPS = {
  kiosk:   { name: 'Ларёк (ул. Заводская)', x: 8,   sideZ: 5.2, laneZ: 8.4 },
  factory: { name: 'Завод (конечная)',      x: -54, sideZ: 5.2, laneZ: 8.4 },
};

export function createTransport(env) {
  const { scene, std, routePoint, route, P, camera, ctx } = env;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  // ---------- модель автобуса (ЛиАЗ-677: кремово-жёлтый, лента окон, двери-гармошки справа) ----------
  const bus = new THREE.Group(); scene.add(bus);
  const L = 10.5, Wd = 2.5, H = 2.95;
  const bodyM = std({ color: 0xe0c070, roughness: .5, metalness: .2 }), stripeM = std({ color: 0xb03a2a, roughness: .5 }), darkM = std({ color: 0x181818, roughness: .6 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x223038, roughness: .08, metalness: .6, transparent: true, opacity: .55, depthWrite: false });
  const inner = std({ color: 0x8a8a7a, roughness: .9, side: THREE.BackSide });
  const B = (w, h, d, m, x, y, z, p = bus) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; };
  // корпус ЛиАЗ-677: сечения со скруглёнными кромками, вытянутые вдоль X (нос в +X), закруглённые торцы
  const ext = (pts, y0, depth, bev) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
    const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bev * 2, steps: Math.ceil(depth / .1), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * .15, bevelSegments: 4, curveSegments: 8 });
    g.translate(0, y0, -depth / 2 + bev); g.rotateY(Math.PI / 2); g.computeVertexNormals(); return g; };
  const rr = (w, h, rb, rt) => { const P_ = [], seg = 6, hw = w / 2; // скруглённый прямоугольник: радиусы снизу и сверху
    const arc = (cx, cy, r, a0, a1) => { for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * i / seg; P_.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    arc(hw - rb, rb, rb, -Math.PI / 2, 0); arc(hw - rt, h - rt, rt, 0, Math.PI / 2); arc(-hw + rt, h - rt, rt, Math.PI / 2, Math.PI); arc(-hw + rb, rb, rb, Math.PI, Math.PI * 1.5); return P_; };
  const lowerM = std({ color: 0xdcb65e, roughness: .45, metalness: .25 }), creamM = std({ color: 0xebe2c8, roughness: .45, metalness: .2 }), pillarM = std({ color: 0xd8cfb4, roughness: .5, metalness: .2 });
  const DOOR_X = [3.6, -.6], DOOR_HW = .58, DS = -1; // дверные проёмы: центры по X, полуширина, сторона (−Z — к тротуару)
  const inGap = x => DOOR_X.some(d => Math.abs(x - d) < DOOR_HW);
  // вырезаем в обшивке проёмы: убираем треугольники борта со стороны дверей в пределах проёма выше подножки
  const cutDoors = g => { const P_ = g.attributes.position, keep = [];
    for (let t = 0; t < P_.count; t += 3) { let cx = 0, cy = 0, cz = 0; for (let v = 0; v < 3; v++) { cx += P_.getX(t + v); cy += P_.getY(t + v); cz += P_.getZ(t + v); } cx /= 3; cy /= 3; cz /= 3;
      if (!(cz * DS > Wd / 2 - .3 && cy > .42 && inGap(cx))) keep.push(t); }
    const out = new THREE.BufferGeometry(); for (const name of Object.keys(g.attributes)) { const a = g.attributes[name], n = a.itemSize, arr = new Float32Array(keep.length * 3 * n);
      keep.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) arr[(i * 3 + v) * n + c] = a.array[(t + v) * n + c]; }); out.setAttribute(name, new THREE.BufferAttribute(arr, n)); }
    return out; };
  const lower = new THREE.Mesh(cutDoors(ext(rr(Wd - .1, 1.12, .12, .05), .36, L, .32)), lowerM); bus.add(lower); lower.castShadow = lower.receiveShadow = true;
  lower.material = lowerM.clone(); lower.material.side = THREE.DoubleSide;
  const roof = new THREE.Mesh(ext(rr(Wd - .14, .5, .02, .38), 2.42, L - .1, .36), creamM); bus.add(roof); roof.castShadow = true;
  bus.add(new THREE.Mesh(lower.geometry, inner), new THREE.Mesh(roof.geometry, std({ color: 0xd8d4c4, roughness: .9, side: THREE.BackSide }))); // салон изнутри: стенки и потолок
  // фальшборт: рисунок на бортах — молдинги, полоса, арки, контуры дверей, шильдик
  const mkSide = flip => { const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 1024, 128);
    const X = m => ((flip ? -m : m) / L + .5) * 1024, Y = m => (1 - (m - .36) / 1.12) * 128;
    g.fillStyle = '#8a2a1c'; g.fillRect(0, Y(1.46), 1024, Y(1.33) - Y(1.46)); // полоса под окнами
    g.fillStyle = '#d8d8d0'; g.fillRect(0, Y(1.03), 1024, 3); g.fillRect(0, Y(.5), 1024, 2); // молдинги
    g.fillStyle = '#2b2620'; for (const wx of [-3.2, 3.4]) { g.beginPath(); g.ellipse(X(wx), Y(.36), 62, 66, 0, Math.PI, 0); g.fill(); } // арки колёс
    g.strokeStyle = 'rgba(40,30,20,.55)'; g.lineWidth = 2; for (let x = -L / 2 + .7; x < L / 2 - .4; x += 1.05) { g.beginPath(); g.moveTo(X(x), Y(1.32)); g.lineTo(X(x), Y(1.1)); g.stroke(); } // швы панелей
    if (flip) for (const d of DOOR_X) g.clearRect(X(d) - DOOR_HW / L * 1024, 0, DOOR_HW * 2 / L * 1024, 128); // проёмы дверей
    g.fillStyle = '#20180f'; g.font = 'italic 900 20px Arial'; g.textAlign = 'center'; g.fillText('ЛиАЗ', X(4.3), Y(.75));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const sideTex = mkSide(false), doorSideTex = mkSide(true); // у борта с дверями детали в зеркальном порядке, надпись читается нормально
  for (const sd of [-1, 1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(L - .5, 1.12), std({ map: sd > 0 ? sideTex : doorSideTex, transparent: true, roughness: .5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    pl.position.set(0, .36 + .56, sd * ((Wd - .1) / 2 + .32 * .15 + .006)); if (sd < 0) pl.rotation.y = Math.PI; bus.add(pl); }
  // оконная лента: стекло и стойки
  B(L - .7, .9, .04, glassM, -.05, 1.96, Wd / 2 - .07);
  { const edges = [-L / 2 + .3, ...DOOR_X.slice().sort((a, b) => a - b).flatMap(d => [d - DOOR_HW, d + DOOR_HW]), L / 2 - .4]; // стекло со стороны дверей — кусками между проёмами
    for (let i = 0; i < edges.length; i += 2) { const a = edges[i], b = edges[i + 1]; if (b - a > .05) B(b - a, .9, .04, glassM, (a + b) / 2, 1.96, DS * (Wd / 2 - .07)); } }
  for (let x = -L / 2 + .45; x <= L / 2 - .5; x += 1.05) for (const sd of [-1, 1]) if (!(sd === DS && inGap(x))) B(.09, .92, .06, pillarM, x, 1.96, sd * (Wd / 2 - .07));
  for (const d of DOOR_X) { for (const e of [-1, 1]) B(.07, 2.05, .1, pillarM, d + e * (DOOR_HW + .02), 1.43, DS * (Wd / 2 - .06)); B(DOOR_HW * 2 + .18, .08, .1, pillarM, d, 2.44, DS * (Wd / 2 - .06)); // рама проёма
    B(DOOR_HW * 2, .04, .5, std({ color: 0x2a2a2a, roughness: .9 }), d, .42, DS * (Wd / 2 - .3)); B(DOOR_HW * 2, .16, .04, std({ color: 0x3a3a38, roughness: .8 }), d, .48, DS * (Wd / 2 - .52)); } // подножка и ступень
  B(L - .5, .06, Wd - .12, pillarM, 0, 1.49, 0).visible = false;
  // лобовое (два наклонных стекла) и заднее стекло
  for (const sd of [-1, 1]) { const ws = B(.05, 1.05, Wd / 2 - .12, glassM, L / 2 - .12, 1.98, sd * (Wd / 4 - .02)); ws.rotation.z = -.12; }
  B(.05, .98, .06, pillarM, L / 2 - .12, 1.98, 0).rotation.z = -.12;
  B(.05, .82, Wd - .4, glassM, -L / 2 + .08, 2.0, 0);
  // бампер, решётка
  const chrome = std({ color: 0x9a9a9a, metalness: .9, roughness: .25 });
  B(.16, .2, Wd - .1, chrome, L / 2 + .02, .48, 0); B(.16, .2, Wd - .1, chrome, -L / 2 - .02, .48, 0);
  B(.03, .3, .9, darkM, L / 2 + .01, .82, 0);
  const hl = std({ color: 0xffffee, emissive: 0xfff2c0, emissiveIntensity: 0 }); for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .06, 16), hl); h.rotation.z = Math.PI / 2; h.position.set(L / 2 + .0, .8, s * .9); bus.add(h); const rim = new THREE.Mesh(new THREE.TorusGeometry(.135, .018, 6, 16), chrome); rim.rotation.y = Math.PI / 2; rim.position.copy(h.position); bus.add(rim); }
  const tl = std({ color: 0x8a1a12, emissive: 0xff2a10, emissiveIntensity: .3 }); for (const s of [-1, 1]) B(.05, .22, .2, tl, -L / 2 - .01, .82, s * .95);  // табличка маршрута
  const plate = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#f2ead0'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#1a1a1a'; g.font = '900 34px Arial'; g.fillText('7', 12, 46); g.font = '700 18px Arial'; g.fillText('ЗАВОД — РЫНОК', 52, 40); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .35), std({ map: plate })); pl.position.set(L / 2 - .02, 2.62, 0); pl.rotation.y = Math.PI / 2; bus.add(pl);
  // колёса (вращаются)
  const hubM = std({ color: 0xb8b8b0, metalness: .8, roughness: .35 }); const wheels = []; for (const x of [-3.2, 3.4]) for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .32, 20), darkM); w.rotation.x = Math.PI / 2; w.position.set(x, .5, s * (Wd / 2 - .02)); bus.add(w); const hub = new THREE.Mesh(new THREE.CylinderGeometry(.24, .28, .04, 14), hubM); hub.position.y = s * .17; w.add(hub); wheels.push(w); }
  // двери справа (сторона −Z при движении в −X, т.е. к тротуару): две створки-гармошки
  const doorsSide = -1; // локальная сторона дверей
  const doors = [];
  const doorM = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#d8cfb4'; g.fillRect(0, 0, 64, 256);
    g.fillStyle = 'rgba(30,40,46,.85)'; g.fillRect(8, 10, 48, 120); g.fillRect(8, 140, 48, 70); g.fillStyle = '#222'; g.fillRect(0, 0, 3, 256); g.fillRect(61, 0, 3, 256); // стёкла и резиновые уплотнители
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return std({ map: t, roughness: .4, metalness: .2 }); })();
  for (const dx of DOOR_X) { const pair = []; for (const s of [-1, 1]) { const d = B(.55, 2.0, .05, doorM, dx + s * .28, 1.4, doorsSide * (Wd / 2 - .02)); pair.push({ m: d, base: d.position.x, s }); } doors.push({ x: dx, pair }); }
  // салон: пол с рифлёной резиной, нижние панели, сиденья на трубчатых рамах, поручни, плафоны, кабина водителя
  const ribTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#3c3a36'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#2a2826'; for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(L * 2, Wd * 2); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  B(L - .5, .04, Wd - .26, std({ map: ribTex, roughness: .95 }), 0, .56, 0);
  const panelM = std({ color: 0x4a5560, roughness: .7 }); for (const sd of [-1, 1]) for (let x = -L / 2 + .5; x < L / 2 - .6; x += .5) if (!(sd === DS && inGap(x))) B(.5, .8, .02, panelM, x + .25, 1.0, sd * (Wd / 2 - .19)); // нижние панели
  const chromeM = std({ color: 0xc8c8c4, metalness: .9, roughness: .2 }), seatM = std({ color: 0x8a2a22, roughness: .65 }), frameM = std({ color: 0x3a3a3a, metalness: .5, roughness: .5 });
  const tube = (x1, y1, z1, x2, y2, z2, r = .016, m = chromeM) => { const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2), len = a.distanceTo(b); const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m); o.position.copy(a).add(b).multiplyScalar(.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); bus.add(o); return o; };
  const seat = (x, sd) => { const z = sd * .62; // двойное сиденье лицом вперёд (+X): подушка, спинка, рама, ручка сверху спинки
    const cush = B(.44, .1, .86, seatM, x, .98, z); cush.rotation.z = .05; const back = B(.08, .55, .86, seatM, x - .22, 1.3, z); back.rotation.z = .12;
    tube(x - .26, 1.6, z - .36, x - .26, 1.6, z + .36, .014); tube(x - .26, 1.56, z - .36, x - .26, 1.6, z - .36, .014);
    tube(x - .05, .57, z + sd * .3, x - .05, .93, z + sd * .3, .02, frameM); B(.04, .04, .7, frameM, x - .05, .92, z); };
  for (let x = -4.3; x <= 2.7; x += .82) for (const sd of [-1, 1]) { if (sd === DS && DOOR_X.some(d => Math.abs(x - d) < .9)) continue; seat(x, sd); }
  for (const sd of [-1, 1]) tube(-L / 2 + .5, 2.25, sd * .55, L / 2 - 1.3, 2.25, sd * .55, .016); // продольные поручни под потолком
  for (let x = -4; x <= 3; x += 1.75) tube(x, .58, sd0(x), x, 2.27, sd0(x), .02); // вертикальные стойки
  function sd0(x) { return DOOR_X.some(d => Math.abs(x - d) < 1) ? DS * .5 : .45; }
  for (const d of DOOR_X) for (const e of [-1, 1]) tube(d + e * (DOOR_HW - .05), .9, DS * (Wd / 2 - .3), d + e * (DOOR_HW - .05), 2.2, DS * (Wd / 2 - .3), .018); // поручни у дверей
  const plafM = std({ color: 0xfff6e0, emissive: 0xffeecc, emissiveIntensity: .6, roughness: .4 }); for (let x = -4; x <= 3.5; x += 1.5) B(.6, .03, .22, plafM, x, 2.5, 0); // плафоны
  B(.05, 1.2, Wd / 2 - .1, frameM, L / 2 - 1.15, 1.2, (Wd / 4) * -DS); // перегородка кабины водителя
  B(.45, .1, .5, std({ color: 0x3a2a20, roughness: .7 }), L / 2 - .7, 1.0, -DS * .62); B(.08, .6, .5, std({ color: 0x3a2a20, roughness: .7 }), L / 2 - .95, 1.32, -DS * .62); // кресло водителя
  const wheelS = new THREE.Mesh(new THREE.TorusGeometry(.22, .02, 8, 20), darkM); wheelS.position.set(L / 2 - .45, 1.45, -DS * .62); wheelS.rotation.y = Math.PI / 2; wheelS.rotation.x = .5; bus.add(wheelS);
  B(.4, .3, Wd - .3, std({ color: 0x2a2a28, roughness: .6 }), L / 2 - .3, 1.3, 0); // приборная панель
  B(.6, .25, .02, std({ color: 0xe8e0c8, roughness: .7 }), L / 2 - 1.2, 2.2, 0).rotation.y = Math.PI / 2; // табличка «Места для инвалидов…»
  const lamp = new THREE.PointLight(0xffe8c0, .6, 7, 2); lamp.position.set(0, 2.3, 0); bus.add(lamp);
  bus.traverse(o => { if (o.isMesh) o.userData.bus = true; });

  // ---------- движение по маршруту с остановками ----------
  const B_ = { s: 120, v: 0, vmax: 9.5, heading: 0, state: 'drive', t: 0, stop: null, doorK: 0, nextStopKey: null, served: {} };
  const routeLen = routePoint(route, 0)[2];
  // по маршруту на запад (−X) остановки у тротуара проходятся по пути; точка остановки — когда двери напротив павильона
  const stopS = {}; for (const [k, st] of Object.entries(STOPS)) { let best = 0, bd = 1e9; for (let s = 0; s < routeLen; s += .5) { const [x, z] = routePoint(route, s); const d = Math.hypot(x - (st.x - 3.6 * -1), z - st.laneZ); if (d < bd) { bd = d; best = s; } } stopS[k] = best; }
  let rider = null; // { phase: 'board'|'ride'|'alight', t, from, stopKey }
  const seatLocal = new THREE.Vector3(1.6, 1.62, .65), doorLocal = new THREE.Vector3(3.6, 1.0, doorsSide * (Wd / 2 + .6));
  function tick(dt, obstacles) {
    const [x, z] = routePoint(route, B_.s), [ax, az] = routePoint(route, B_.s + 3), dirx = ax - x, dirz = az - z, dl = Math.hypot(dirx, dirz) || 1;
    // ближайшая остановка впереди
    let ahead = 1e9, key = null; for (const [k, s0] of Object.entries(stopS)) { const ds = ((s0 - B_.s) % routeLen + routeLen) % routeLen; if (ds < ahead && !(B_.served[k] && (ds > routeLen - 30 || ds < 8))) { ahead = ds; key = k; } }
    if (B_.state === 'drive') {
      let target = B_.vmax;
      if (ahead < 40) target = Math.min(target, Math.sqrt(2 * 1.6 * Math.max(0, ahead - .3)));
      const [bx, bz] = routePoint(route, B_.s + 10); const turn = Math.abs(Math.atan2(bz - az, bx - ax) - Math.atan2(dirz, dirx)); if (Math.min(turn, 2 * Math.PI - turn) > .3) target = Math.min(target, 4.5);
      // препятствия: игрок, люди, машины
      for (const o of obstacles) { const vx = o.x - x, vz = o.z - z, al = (vx * dirx + vz * dirz) / dl, lat = Math.abs(vx * dirz - vz * dirx) / dl; if (al > 0 && al < 14 && lat < 1.7) target = Math.min(target, Math.max(0, (al - 6.5) * 1.2)); }
      B_.v += clamp(target - B_.v, -6 * dt, 1.5 * dt); B_.s = (B_.s + B_.v * dt) % routeLen;
      if (ahead < .6 && B_.v < .3) { B_.state = 'stop'; B_.t = 0; B_.stop = key; B_.served = { [key]: true }; env.onArrive && env.onArrive(key, doorWorld()); }
    } else if (B_.state === 'stop') {
      B_.t += dt; B_.v = 0;
      B_.doorK = B_.t < 1 ? ease(B_.t) : B_.t > (rider && rider.phase !== 'ride' ? 99 : 12) ? Math.max(0, B_.doorK - dt * 1.2) : 1;
      if (B_.t > 13 && B_.doorK <= 0 && (!rider || rider.phase === 'ride')) { B_.state = 'drive'; B_.stop = null; }
    }
    for (const d of doors) for (const p of d.pair) p.m.position.x = p.base + p.s * B_.doorK * .45;
    const h = Math.atan2(dirz, dirx); let dh = -h - B_.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); B_.heading += dh * Math.min(1, dt * 4);
    bus.position.set(x, 0, z); bus.rotation.y = B_.heading;
    wheels.forEach(w => w.rotation.y -= B_.v * dt / .5);
    const night = env.night(); hl.emissiveIntensity = night ? 3 : 0; lamp.intensity = night || rider ? 6 : B_.doorK > .1 ? 2 : 0; plafM.emissiveIntensity = night || B_.doorK > .1 || rider ? 1.4 : .3;
    env.audio && env.audio.carState('bus', x, z, B_.v * .7);
    // пассажир-игрок
    if (rider) riderTick(dt);
  }
  const doorWorld = () => { bus.updateMatrixWorld(true); return bus.localToWorld(doorLocal.clone()); };
  const seatWorld = () => { bus.updateMatrixWorld(true); return bus.localToWorld(seatLocal.clone()); };
  function canBoard() { if (B_.state !== 'stop' || B_.doorK < .9 || rider) return false; const d = doorWorld(); return Math.hypot(P.x - d.x, P.z - d.z) < 3.2; }
  function board() { if (!canBoard()) return; rider = { phase: 'board', t: 0, from: camera.position.clone(), fromYaw: P.yaw }; env.onCtl(); env.audio && env.audio.door(true); }
  function canAlight() { return rider && rider.phase === 'ride' && B_.state === 'stop' && B_.doorK > .9; }
  function alight() { if (!canAlight()) return; rider.phase = 'alight'; rider.t = 0; rider.from = camera.position.clone(); env.onCtl(); }
  function riderTick(dt) {
    rider.t += dt; const r = rider;
    if (r.phase === 'board') { // к двери, затем на сиденье
      const k = Math.min(1, r.t / 1.8), dw = doorWorld(), sw = seatWorld();
      const p = k < .5 ? tmp.lerpVectors(r.from, dw, ease(k * 2)) : tmp.lerpVectors(dw, sw, ease(k * 2 - 1));
      env.setRiderCam(p, k); if (k >= 1) { r.phase = 'ride'; r.boardedAt = B_.stop; env.onCtl(); ctx.toast && ctx.toast('Сели в автобус №7. Выйти можно на остановке.'); }
    } else if (r.phase === 'ride') { env.setRiderCam(seatWorld(), 1); }
    else if (r.phase === 'alight') {
      const k = Math.min(1, r.t / 1.6), dw = doorWorld(), st = STOPS[B_.stop], out = tmp2.set(bus.position.x + (dw.x - bus.position.x), 0, st.sideZ - .6); out.y = 1.66;
      const p = k < .5 ? tmp.lerpVectors(r.from, dw, ease(k * 2)) : tmp.lerpVectors(dw, out, ease(k * 2 - 1));
      env.setRiderCam(p, 1 - k);
      if (k >= 1) { const key = B_.stop; rider = null; env.onAlight(out.x, out.z, key); env.onCtl(); }
    }
  }
  return {
    tick, board, alight, canBoard, canAlight, get doorK() { return B_.doorK; }, get riding() { return !!rider; }, get rider() { return rider; },
    get stopKey() { return B_.stop; }, get state() { return B_.state; }, obstacle: () => ({ x: bus.position.x, z: bus.position.z, heading: B_.heading, hx: L / 2 + .3, hz: Wd / 2 + .2, v: B_.v }),
    doorWorld, bus, nextStopName() { const k = B_.stop || Object.keys(STOPS).find(k => !B_.served[k]); return k ? STOPS[k].name : ''; },
  };
}
