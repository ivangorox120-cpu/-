// Дисковый настольный телефон (в духе советских аппаратов 70–80-х): корпус, прозрачный номеронабиратель с упором,
// трубка на рычагах, витой шнур — мягкое тело (цепочка Верле с растяжимыми связями), в кадре — спираль-трубка.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const DEG = Math.PI / 180;

function roundedBox(w, h, d, r, seg = 3) { // скруглённый брусок: экструзия скруглённого прямоугольника с фаской
  const s = new THREE.Shape(), x = -w / 2 + r, y = -d / 2 + r, W = w - 2 * r, D = d - 2 * r;
  s.moveTo(x, y - r); s.lineTo(x + W, y - r); s.quadraticCurveTo(x + W + r, y - r, x + W + r, y); s.lineTo(x + W + r, y + D); s.quadraticCurveTo(x + W + r, y + D + r, x + W, y + D + r);
  s.lineTo(x, y + D + r); s.quadraticCurveTo(x - r, y + D + r, x - r, y + D); s.lineTo(x - r, y); s.quadraticCurveTo(x - r, y - r, x, y - r);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(.001, h - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r * .98, bevelSegments: seg, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, -(h - 2 * r) / 2, 0); g.computeVertexNormals(); return g;
}

export function createPhone({ scene, camera, std, audio, color = 0x9a2b22 }) {
  const root = new THREE.Group(); scene.add(root);
  const plastic = std({ color, roughness: .28, metalness: .05 }), plasticDark = std({ color: 0x1b1714, roughness: .4 }), metal = std({ color: 0xc8c8c4, roughness: .25, metalness: 1 }),
    ivory = std({ color: 0xece4d0, roughness: .45 }), clear = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: .08, metalness: 0, transparent: true, opacity: .45, depthWrite: false });
  const add = (geo, m, x = 0, y = 0, z = 0, parent = root) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  // ---------- корпус ----------
  add(roundedBox(.215, .03, .225, .012), plastic, 0, .015, 0); // основание
  // корпус: боковой профиль (низкая трапеция со скатом вперёд) выдавлен по ширине и скруглён фаской
  { const pr = new THREE.Shape(); pr.moveTo(-.1, 0); pr.lineTo(.104, 0); pr.lineTo(.1, .03); pr.quadraticCurveTo(.098, .04, .09, .043); pr.lineTo(.008, .093); pr.quadraticCurveTo(0, .097, -.01, .097);
    pr.lineTo(-.085, .097); pr.quadraticCurveTo(-.098, .096, -.1, .085); pr.lineTo(-.1, 0);
    const g = new THREE.ExtrudeGeometry(pr, { depth: .17, bevelEnabled: true, bevelThickness: .014, bevelSize: .012, bevelSegments: 4, curveSegments: 8 }); g.rotateY(-Math.PI / 2); g.translate(.085, .016, 0); g.computeVertexNormals();
    add(g, plastic, 0, 0, 0); }
  // наклонная передняя панель с диском (скат ~31°)
  const panel = new THREE.Group(); panel.position.set(0, .085, .05); panel.rotation.x = 31 * DEG; root.add(panel);
  add(roundedBox(.15, .006, .1, .003), plasticDark, 0, -.002, 0, panel);
  // ---------- номеронабиратель ----------
  const dialBase = new THREE.Group(); dialBase.position.set(0, .009, 0); panel.add(dialBase);
  const R0 = .047, RH = .033, HR = .0082;
  // подложка с цифрами (неподвижна)
  const numTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#efe9da'; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
    g.fillStyle = '#1a1a1a'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let n = 1; n <= 10; n++) { const a = (52 + (n - 1) * 30) * DEG, r = 128 * RH / R0; g.fillText(String(n % 10), 128 + Math.cos(a) * r, 128 - Math.sin(a) * r); }
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const plate = add(new THREE.CircleGeometry(R0, 48), new THREE.MeshStandardMaterial({ map: numTex, roughness: .5 }), 0, .0005, 0, dialBase); plate.rotation.x = -Math.PI / 2;
  // вращающееся колесо: прозрачный диск с 10 отверстиями
  const wheel = new THREE.Group(); wheel.position.y = .004; dialBase.add(wheel);
  { const s = new THREE.Shape(); s.absarc(0, 0, R0 - .001, 0, Math.PI * 2, false);
    for (let n = 1; n <= 10; n++) { const a = (52 + (n - 1) * 30) * DEG, h = new THREE.Path(); h.absarc(Math.cos(a) * RH, Math.sin(a) * RH, HR, 0, Math.PI * 2, true); s.holes.push(h); }
    const hc = new THREE.Path(); hc.absarc(0, 0, .013, 0, Math.PI * 2, true); s.holes.push(hc);
    const g = new THREE.ExtrudeGeometry(s, { depth: .003, bevelEnabled: true, bevelThickness: .0008, bevelSize: .0008, bevelSegments: 1, curveSegments: 20 }); g.rotateX(-Math.PI / 2);
    const w = add(g, clear, 0, 0, 0, wheel); w.castShadow = false; w.renderOrder = 3; }
  const hub = add(new THREE.CylinderGeometry(.0135, .0135, .005, 24), ivory, 0, .003, 0, wheel); // центральная наклейка с номером
  { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#f3efe3'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#7a1a14'; g.font = 'bold 14px Arial'; g.textAlign = 'center'; g.fillText('2-17-54', 32, 30); g.font = '9px Arial'; g.fillText('ТЕЛ.', 32, 44); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const lab = add(new THREE.CircleGeometry(.0125, 24), new THREE.MeshStandardMaterial({ map: t, roughness: .6 }), 0, .0056, 0, wheel); lab.rotation.x = -Math.PI / 2; }
  // упор для пальца (металлический крючок)
  const STOP = 18 * DEG;
  { const st = add(new THREE.TorusGeometry(.007, .0018, 6, 12, Math.PI), metal, Math.cos(STOP) * (R0 + .002), .007, -Math.sin(STOP) * (R0 + .002), dialBase); st.rotation.set(Math.PI / 2, 0, -STOP); }
  // ---------- рычаги (вилка) и кнопки рычажного переключателя ----------
  const forks = [], plungers = [];
  for (const sx of [-1, 1]) {
    const f = new THREE.Group(); f.position.set(sx * .078, .125, -.05); root.add(f);
    add(new THREE.CylinderGeometry(.008, .01, .03, 12), plastic, 0, .0, 0, f);
    const cup = add(new THREE.TorusGeometry(.012, .0045, 8, 16, Math.PI), plastic, 0, .017, 0, f); cup.rotation.set(0, Math.PI / 2, 0);
    forks.push(f);
    const pl = add(new THREE.CylinderGeometry(.005, .005, .012, 10), plasticDark, sx * .05, .118, -.05); plungers.push(pl);
  }
  // ---------- трубка ----------
  const handset = new THREE.Group(); scene.add(handset);
  { const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-.1, -.018, 0), new THREE.Vector3(-.06, -.004, 0), new THREE.Vector3(0, .002, 0), new THREE.Vector3(.06, -.004, 0), new THREE.Vector3(.1, -.018, 0)]);
    add(new THREE.TubeGeometry(curve, 24, .0135, 10), plastic, 0, 0, 0, handset);
    const cupProfile = [new THREE.Vector2(.0135, .03), new THREE.Vector2(.02, .018), new THREE.Vector2(.031, .004), new THREE.Vector2(.033, -.002), new THREE.Vector2(.03, -.006), new THREE.Vector2(0, -.006)];
    for (const sx of [-1, 1]) { const c = add(new THREE.LatheGeometry(cupProfile, 18), plastic, sx * .105, -.03, 0, handset); c.rotation.z = sx * 12 * DEG;
      const grill = add(new THREE.CircleGeometry(.024, 18), plasticDark, sx * .106, -.0365, 0, handset); grill.rotation.x = Math.PI / 2; grill.rotation.y = sx * 12 * DEG;
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, h = add(new THREE.CircleGeometry(.0026, 6), new THREE.MeshBasicMaterial({ color: 0x050505 }), sx * .106 + Math.cos(a) * .011, -.0368, Math.sin(a) * .011, handset); h.rotation.x = Math.PI / 2; } }
  }
  const restLocal = new THREE.Vector3(0, .158, -.05), restQ = new THREE.Quaternion(); // трубка лежит на рычагах, чашками вниз
  const socketLocal = new THREE.Vector3(-.112, .026, -.08), handSocket = new THREE.Vector3(-.118, -.03, 0); // гнёзда шнура: сбоку корпуса и в микрофонной чашке
  // ---------- витой шнур: мягкое тело ----------
  const N = 26, REST = .019, pts = Array.from({ length: N }, () => new THREE.Vector3()), old = Array.from({ length: N }, () => new THREE.Vector3());
  let cordInit = false, settleTimer = .5;
  const COILS = 110, RING = 5, M = COILS * 6, cR = .0055, wR = .0016;
  const cordGeo = new THREE.BufferGeometry(); const cPos = new Float32Array((M + 1) * RING * 3), cNor = new Float32Array((M + 1) * RING * 3), cIdx = [];
  for (let j = 0; j < M; j++) for (let r = 0; r < RING; r++) { const a = j * RING + r, b = j * RING + (r + 1) % RING, c = (j + 1) * RING + r, d = (j + 1) * RING + (r + 1) % RING; cIdx.push(a, c, b, b, c, d); }
  cordGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3)); cordGeo.setAttribute('normal', new THREE.BufferAttribute(cNor, 3)); cordGeo.setIndex(cIdx);
  const cord = new THREE.Mesh(cordGeo, std({ color: color, roughness: .5 })); cord.frustumCulled = false; cord.castShadow = true; scene.add(cord);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _bn = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Vector3();
  const spline = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  let floorY = 0, counterY = 1.005, counterBox = null;

  function stepCordPhysics(dt, a, b) {
    const h = Math.min(dt, 1 / 45), g = -9.8 * h * h;
    for (let i = 1; i < N - 1; i++) {
      _p.subVectors(pts[i], old[i]).multiplyScalar(.88);
      old[i].copy(pts[i]);
      pts[i].add(_p);
      pts[i].y += g;
    }
    pts[0].copy(a); pts[N - 1].copy(b);
    old[0].copy(a); old[N - 1].copy(b);
    for (let it = 0; it < 8; it++) {
      for (let i = 0; i < N - 1; i++) {
        _p.subVectors(pts[i + 1], pts[i]);
        const L = _p.length() || 1e-6;
        const target = L < REST ? REST : L > REST * 3.2 ? REST * 3.2 : L - (L - REST) * .12;
        const diff = (L - target) / L;
        const wa = i === 0 ? 0 : .5, wb = i + 1 === N - 1 ? 0 : .5, s = wa + wb || 1;
        pts[i].addScaledVector(_p, diff * wa / s);
        pts[i + 1].addScaledVector(_p, -diff * wb / s);
      }
      for (let i = 1; i < N - 1; i++) {
        const p = pts[i];
        const onCounter = counterBox && p.x > counterBox.x1 && p.x < counterBox.x2 && p.z > counterBox.z1 && p.z < counterBox.z2;
        const fl = onCounter ? counterY + cR : floorY + cR;
        if (p.y < fl && (onCounter ? old[i].y >= counterY - .03 : true)) {
          p.y = fl;
          old[i].y = fl;
          old[i].x += (p.x - old[i].x) * .65;
          old[i].z += (p.z - old[i].z) * .65;
        }
        // Мягкое выталкивание шнура влево от боковой стенки корпуса телефона (без подбрасывания вверх к y = .12)
        _c.copy(p); root.worldToLocal(_c);
        if (Math.abs(_c.x) < .105 && Math.abs(_c.z) < .11 && _c.y < .10 && _c.y > -.01) {
          _c.x = _c.x <= 0 ? -.108 : .108;
          root.localToWorld(_c);
          p.copy(_c);
          old[i].copy(_c);
        }
      }
    }
  }

  function rebuildCordMesh() {
    spline.updateArcLengths && (spline.needsUpdate = true); spline.arcLengthDivisions = 60;
    _n.set(0, 1, 0);
    for (let j = 0; j <= M; j++) {
      const u = j / M; spline.getPoint(u, _a); spline.getPoint(Math.min(1, u + .002), _b); if (u >= .998) spline.getPoint(u - .002, _t), _b.copy(_a).multiplyScalar(2).sub(_t);
      _t.subVectors(_b, _a).normalize(); _bn.crossVectors(_t, _n); if (_bn.lengthSq() < 1e-6) _bn.set(1, 0, 0); _bn.normalize(); _n.crossVectors(_bn, _t).normalize();
      const ang = j / 6 * Math.PI * 2, ex = Math.min(1, Math.min(u, 1 - u) * 30);
      _c.copy(_a).addScaledVector(_n, Math.cos(ang) * cR * ex).addScaledVector(_bn, Math.sin(ang) * cR * ex);
      const tx = -Math.sin(ang), ty = Math.cos(ang); _p.copy(_t).multiplyScalar(.002).addScaledVector(_n, tx * cR * .9 * ex).addScaledVector(_bn, ty * cR * .9 * ex).normalize();
      const n2 = _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _p);
      for (let r = 0; r < RING; r++) { const ra = r / RING * Math.PI * 2; _b.set(Math.cos(ra), Math.sin(ra), 0).applyQuaternion(n2); const k = (j * RING + r) * 3; cPos[k] = _c.x + _b.x * wR; cPos[k + 1] = _c.y + _b.y * wR; cPos[k + 2] = _c.z + _b.z * wR; cNor[k] = _b.x; cNor[k + 1] = _b.y; cNor[k + 2] = _b.z; }
    }
    cordGeo.attributes.position.needsUpdate = true; cordGeo.attributes.normal.needsUpdate = true;
  }

  function cordTick(dt, a, b) {
    if (!cordInit) {
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        pts[i].lerpVectors(a, b, t);
        // Естественная петля шнура слева от корпуса телефона на столе
        _c.copy(pts[i]); root.worldToLocal(_c);
        _c.x -= Math.sin(t * Math.PI) * .045;
        _c.y = Math.max(.012, _c.y - Math.sin(t * Math.PI) * .06);
        root.localToWorld(_c);
        pts[i].copy(_c);
        old[i].copy(pts[i]);
      }
      for (let k = 0; k < 35; k++) stepCordPhysics(1 / 60, a, b);
      for (let i = 0; i < N; i++) old[i].copy(pts[i]);
      rebuildCordMesh();
      cordInit = true;
      settleTimer = 0;
      return;
    }
    if (!call && settleTimer <= 0) return;
    if (!call) settleTimer -= dt;
    stepCordPhysics(dt, a, b);
    if (!call && settleTimer <= 0) {
      for (let i = 0; i < N; i++) old[i].copy(pts[i]);
    }
    rebuildCordMesh();
  }
  // ---------- анимации: снятие трубки, набор, отбой ----------
  let call = null; const dialQ = []; let dialState = null, wheelAng = 0;
  const restPos = new THREE.Vector3(), restRot = new THREE.Quaternion(), earPos = new THREE.Vector3(), earRot = new THREE.Quaternion(), liftPos = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const EAR_OFF = new THREE.Vector3(.12, -.06, -.12), EAR_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.15, -.35, 1.35, 'YXZ'));
  function poses() {
    root.updateMatrixWorld(true); restPos.copy(restLocal); root.localToWorld(restPos); root.getWorldQuaternion(restRot).multiply(restQ);
    earPos.copy(EAR_OFF).applyQuaternion(camera.quaternion).add(camera.position); earRot.copy(camera.quaternion).multiply(EAR_Q);
  }
  function setHandset(k, lift) { // k: 0 — на рычагах, 1 — у уха; lift — фаза «приподнять за ручку» (сначала поднимается дальний край)
    poses(); liftPos.copy(restPos).lerp(earPos, .35); liftPos.y = Math.max(restPos.y, earPos.y) + .12;
    const kk = ease(k); const a = _a.copy(restPos).lerp(liftPos, kk), b = _b.copy(liftPos).lerp(earPos, kk); handset.position.copy(a.lerp(b, kk));
    handset.position.y += lift * .03; handset.quaternion.copy(restRot).slerp(earRot, clamp(kk * 1.15, 0, 1));
    if (lift > 0 && k < .15) { tmpQ.setFromAxisAngle(_t.set(0, 0, 1), lift * .35); handset.quaternion.multiply(tmpQ); }
  }
  function startCall() { call = { t: 0, phase: 'lift' }; settleTimer = .6; audio && audio.click(600, .5, 0, .05); }
  function hangUp() { if (call && call.phase !== "hang") { call.phase = "hang"; call.ht = 0; settleTimer = .6; dialQ.length = 0; dialQ.done = null; dialState = null; } }
  // набор номера: каждая цифра — завод колеса до упора и возврат с щелчками 10 имп/с
  function dialNumber(digits, done) { for (const d of String(digits)) dialQ.push(+d); dialQ.done = done; }
  function dialTick(dt) {
    if (!dialState && dialQ.length) { const d = dialQ.shift() || 10; const holeA = (52 + ((d || 10) - 1) * 30) * DEG; dialState = { d, max: holeA - (-STOP) - 0 * DEG, t: 0, ph: 'wind', clicks: 0 }; dialState.max = holeA + STOP; }
    if (!dialState) { if (dialQ.done && !dialQ.length) { const f = dialQ.done; dialQ.done = null; f(); } return; }
    const s = dialState; s.t += dt;
    if (s.ph === 'wind') { wheelAng = Math.min(s.max, wheelAng + dt * 9); if (wheelAng >= s.max) { s.ph = 'hold'; s.t = 0; audio && audio.click(900, .25, 0, .03); } }
    else if (s.ph === 'hold') { if (s.t > .12) { s.ph = 'ret'; s.ret = 0; } }
    else { const v = 30 * DEG / .1; wheelAng = Math.max(0, wheelAng - dt * v); s.ret += dt * v; const c = Math.floor(s.ret / (30 * DEG)); while (s.clicks < Math.min(s.d || 10, c)) { s.clicks++; audio && audio.click(520, .35, 0, .02); } if (wheelAng <= 0) { dialState = null; } }
    wheel.rotation.y = -wheelAng; // по часовой стрелке, если смотреть на диск
  }
  function tick(dt) {
    poses();
    if (call) { call.t += dt;
      if (call.phase === 'lift') { const k = clamp(call.t / .85, 0, 1), lift = clamp(call.t / .2, 0, 1); setHandset(k, lift); plungers.forEach(p => p.position.y += (.122 - p.position.y) * Math.min(1, dt * 30)); if (k >= 1) call.phase = 'ear'; }
      else if (call.phase === 'ear') { setHandset(1, 0); handset.position.y += Math.sin(call.t * 1.7) * .002; }
      else if (call.phase === 'hang') { call.ht += dt; const k = 1 - clamp(call.ht / .7, 0, 1); setHandset(k, k * .5); if (call.ht >= .7) { call = null; settleTimer = .45; audio && audio.click(300, .8, 0, .07); } }
      dialTick(dt);
    }
    if (!call) { handset.position.copy(restPos); handset.quaternion.copy(restRot); plungers.forEach(p => p.position.y += (.113 - p.position.y) * Math.min(1, dt * 30)); wheelAng = Math.max(0, wheelAng - dt * 5); wheel.rotation.y = -wheelAng; }
    cordTick(dt, root.localToWorld(_a.copy(socketLocal)).clone(), handset.localToWorld(_b.copy(handSocket)).clone());
  }
  return {
    root, handset, cord, tick, startCall, hangUp, dialNumber, setCounter(box, y) { counterBox = box; counterY = y; cordInit = false; }, get calling() { return !!call; },
    get busy() { return !!dialState || dialQ.length > 0; }, get dialAngle() { return wheelAng; },
    box() { root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(root).union(new THREE.Box3().setFromObject(handset)).expandByScalar(.03); },
  };
}
