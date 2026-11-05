// Быт ларька: физические предметы (коробки), доставка, телефон, блокнот на прилавке, руки, курение, выпивка, опьянение.
import * as THREE from 'three';
import { makeRigHand, makeCigarette, HAND_POSES } from './hand.js';
import { createPhone } from './phone.js';

const R = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export function createLife(env) {
  const { scene, camera, P, ctx, KW, KD, std, colliders, addCol } = env;
  const S = () => ctx.getS();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), ray = new THREE.Raycaster();

  // ================= поверхности, на которые можно ставить =================
  const SURF = [
    { name: 'floor', y: .02, x1: -KW + .08, x2: KW - .08, z1: -KD + .08, z2: KD - .5 },
    { name: 'counter', y: 1.005, x1: -1.42, x2: 1.42, z1: KD - .43, z2: KD - .02 },
    { name: 'shelf', y: .762, x1: -1.42, x2: .26, z1: -KD + .03, z2: -KD + .31 },
    { name: 'shelf', y: 1.212, x1: -1.42, x2: .26, z1: -KD + .03, z2: -KD + .31 },
    { name: 'shelf', y: 1.662, x1: -1.42, x2: .26, z1: -KD + .03, z2: -KD + .31 },
  ];
  const inK = (x, z) => Math.abs(x) < KW && Math.abs(z) < KD;
  function surfaceBelow(x, z, yTop) {
    let best = inK(x, z) ? .02 : 0;
    for (const s of SURF) if (x > s.x1 && x < s.x2 && z > s.z1 && z < s.z2 && s.y <= yTop + .02 && s.y > best) best = s.y;
    for (const it of items) if (it.state === 'rest' && it.stack && Math.abs(x - it.obj.position.x) < it.half.x && Math.abs(z - it.obj.position.z) < it.half.z) { const top = it.obj.position.y + it.half.y * 2; if (top <= yTop + .02 && top > best) best = top; }
    return best;
  }
  function rayPlace(maxD, held) {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera); const o = ray.ray.origin, d = ray.ray.direction;
    let best = null;
    const cand = SURF.slice(); if (!inK(P.x, P.z)) cand.push({ name: 'ground', y: 0, x1: -999, x2: 999, z1: -999, z2: 999 });
    for (const it of items) if (it !== held && it.state === 'rest' && it.stack) { const p = it.obj.position; cand.push({ name: 'item', y: p.y + it.half.y * 2, x1: p.x - it.half.x, x2: p.x + it.half.x, z1: p.z - it.half.z, z2: p.z + it.half.z }); }
    for (const s of cand) { if (Math.abs(d.y) < 1e-3) continue; const t = (s.y - o.y) / d.y; if (t <= 0 || t > maxD) continue; const x = o.x + d.x * t, z = o.z + d.z * t; if (x > s.x1 && x < s.x2 && z > s.z1 && z < s.z2 && (!best || t < best.t)) best = { t, x, z, y: s.y, s }; }
    return best;
  }

  // ================= предметы =================
  const items = [];
  let held = null, heldYaw = 0, heldYawT = 0;
  const boxTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#b08d5c'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 2500; i++) { g.fillStyle = Math.random() < .5 ? '#9a7a4c' : '#c4a06c'; g.globalAlpha = .4; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } g.globalAlpha = 1;
    g.fillStyle = '#c9b48a'; g.fillRect(112, 0, 32, 256); g.fillStyle = '#5a3a1a'; g.font = '900 30px Arial'; g.textAlign = 'center'; g.fillText('ОПТТОРГ', 128, 90); g.font = '700 18px Arial'; g.fillText('ОСТОРОЖНО · НЕ КАНТОВАТЬ', 128, 120);
    g.strokeStyle = '#7a2a1a'; g.lineWidth = 4; g.beginPath(); g.arc(70, 190, 30, 0, 7); g.stroke(); g.font = '700 14px Arial'; g.fillStyle = '#7a2a1a'; g.fillText('ОТК', 70, 195);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const boxMat = std({ map: boxTex, roughness: .9 });
  // изнанка гофрокартона: светлее и чище снаружи, с волокнами, полосами гофры и следами клея
  const kraftTex = (inner) => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = inner ? '#b39268' : '#a6845a'; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 6) { g.fillStyle = `rgba(${inner ? '90,64,34' : '70,50,28'},${.05 + Math.random() * .04})`; g.fillRect(x, 0, 3, 256); } // гофра просвечивает
    for (let i = 0; i < 3500; i++) { const v = Math.random(); g.fillStyle = v < .5 ? 'rgba(120,90,55,.35)' : 'rgba(210,185,140,.3)'; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1); }
    if (inner) { g.fillStyle = 'rgba(80,55,30,.18)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 40, 8 + Math.random() * 20, Math.random() * 3, 0, 7); g.fill(); } // пятна от товара
      g.fillStyle = 'rgba(60,40,20,.5)'; g.font = '700 14px Arial'; g.fillText('ГОСТ 9142-84', 14, 240); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const inMat = std({ map: kraftTex(true), roughness: .95 }), flapOutMat = std({ map: kraftTex(false), roughness: .92 }), floorInMat = std({ map: kraftTex(true), color: 0xcdbca2, roughness: .97 });
  // открытая коробка: дно и 4 стенки из тонких листов картона (снаружи — печать «Оптторг», внутри — изнанка), 4 отогнутых клапана
  function makeOpenBox(w, h, d) {
    const g = new THREE.Group(), t = .008, I = inMat, O = boxMat;
    const slab = (sx, sy, sz, x, y, z, mats, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mats); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
    slab(w, t, d, 0, t / 2, 0, floorInMat);
    slab(w, h, t, 0, h / 2, d / 2 - t / 2, [I, I, I, I, O, I]); slab(w, h, t, 0, h / 2, -d / 2 + t / 2, [I, I, I, I, I, O]);
    slab(t, h, d - 2 * t, w / 2 - t / 2, h / 2, 0, [O, I, I, I, I, I]); slab(t, h, d - 2 * t, -w / 2 + t / 2, h / 2, 0, [I, O, I, I, I, I]);
    const FM = [I, I, I, flapOutMat, I, I]; // сверху у отогнутого клапана — изнанка
    for (const s of [-1, 1]) { // длинные клапаны (по стенкам ±z) и короткие (по ±x)
      const pz = new THREE.Group(); pz.position.set(0, h, s * d / 2); g.add(pz); slab(w - .01, t, d * .48, 0, 0, s * d * .24, FM, pz); pz.rotation.x = s * (.18 + Math.random() * .35);
      const px = new THREE.Group(); px.position.set(s * w / 2, h, 0); g.add(px); slab(w * .3, t, d - .02, s * w * .15, 0, 0, FM, px); px.rotation.z = -s * (.25 + Math.random() * .4);
    }
    return g;
  }
  function makeBoxMesh(w, h, d, open) {
    if (open) return makeOpenBox(w, h, d);
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat); b.position.y = h / 2; b.castShadow = b.receiveShadow = true; g.add(b);
    return g;
  }
  function addItem(rec) { // rec: { kind, x, y, z, ry, data }
    const it = { id: rec.id || ('i' + Math.random().toString(36).slice(2, 8)), kind: rec.kind, data: rec.data || {}, state: 'rest', vy: 0 };
    if (rec.kind === 'box') { const w = .5, h = .36, d = .4; it.obj = makeBoxMesh(w, h, d, !!(it.data.opened)); it.half = { x: w / 2, y: h / 2, z: d / 2 }; it.mass = it.data.opened ? 1 : 12; it.stack = true; }
    else if (rec.kind === 'bottle') { it.obj = emptyBottleMesh(); it.half = { x: .04, y: .15, z: .04 }; it.mass = .4; it.stack = false; }
    else if (rec.kind === 'gun') { it.obj = env.gunWorldMesh(); it.half = { x: .55, y: .04, z: .1 }; it.mass = 3.4; it.stack = false; }
    it.obj.position.set(rec.x, rec.y, rec.z); it.obj.rotation.y = rec.ry || 0; it.obj.traverse(o => { if (o.isMesh) o.userData.item = it; });
    scene.add(it.obj); items.push(it); syncCol(it); return it;
  }
  function syncCol(it) {
    if (it.col) { const i = colliders.indexOf(it.col); if (i >= 0) colliders.splice(i, 1); it.col = null; }
    if (it.state === 'rest' && it.kind === 'box' && it.obj.position.y < .3) { const p = it.obj.position, c = Math.abs(Math.cos(it.obj.rotation.y)), s = Math.abs(Math.sin(it.obj.rotation.y)); const hx = it.half.x * c + it.half.z * s, hz = it.half.x * s + it.half.z * c; it.col = addCol(p.x - hx, p.x + hx, p.z - hz, p.z + hz, 'item'); }
  }
  function removeItem(it) { if (it.col) { const i = colliders.indexOf(it.col); if (i >= 0) colliders.splice(i, 1); } scene.remove(it.obj); items.splice(items.indexOf(it), 1); if (held === it) held = null; persist(); }
  function persist() { const s = S(); if (!s) return; s.items = items.filter(i => i !== held || true).map(i => ({ id: i.id, kind: i.kind, x: +i.obj.position.x.toFixed(3), y: +(i === held ? surfaceBelow(P.x, P.z, 3) : i.obj.position.y).toFixed(3), z: +i.obj.position.z.toFixed(3), ry: +i.obj.rotation.y.toFixed(3), data: i.data })); if (held) { const r = s.items.find(x => x.id === held.id); if (r) { r.x = +P.x.toFixed(3); r.z = +P.z.toFixed(3); } } }
  function loadItems() { items.slice().forEach(i => { scene.remove(i.obj); if (i.col) colliders.splice(colliders.indexOf(i.col), 1); }); items.length = 0; held = null; const s = S(); (s && s.items || []).forEach(addItem); }
  function lookItem(maxD = 2.2) {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera); ray.far = maxD;
    const objs = items.filter(i => i !== held && i.state !== 'trash' && i.state !== 'sink').map(i => i.obj); const h = ray.intersectObjects(objs, true)[0];
    return h ? h.object.userData.item : null;
  }
  function pick(it) { held = it; it.state = 'held'; heldYaw = it.obj.rotation.y - P.yaw; heldYawT = heldYaw; syncCol(it); env.audio && env.audio.click(700, .4, 0, .05); env.onCtl(); }
  function placeHeld() {
    if (!held) return false;
    const t = rayPlace(2.4, held); if (!t) return false;
    const it = held; held = null; it.state = 'place'; it.from = it.obj.position.clone(); it.to = new THREE.Vector3(t.x, t.y, t.z); it.pt = 0; it.ry = it.obj.rotation.y;
    env.onCtl(); return true;
  }
  function dropHeld() { if (!held) return; const it = held; held = null; it.state = 'fall'; it.vy = 0; env.onCtl(); }
  function rotateHeld() { if (held) heldYawT += Math.PI / 2; }
  // выбросить предмет в мусорный бак: подлетает к проёму бака и проваливается внутрь, затем удаляется
  function trashHeld(bin, done) {
    if (!held) return false; const it = held; held = null; it.state = 'trash'; it.from = it.obj.position.clone(); it.to = new THREE.Vector3(bin.x, bin.y, bin.z); it.pt = 0; it.done = done; env.onCtl(); return true;
  }
  function itemsTick(dt) {
    for (const it of items) {
      if (it === held) {
        heldYaw += (heldYawT - heldYaw) * Math.min(1, dt * 10);
        camera.getWorldDirection(tmp); tmp.y = 0; tmp.normalize();
        const tgt = tmp2.copy(camera.position).addScaledVector(tmp, .62); tgt.y = camera.position.y - .55;
        it.obj.position.lerp(tgt, Math.min(1, dt * 14)); it.obj.rotation.y = P.yaw + heldYaw;
      } else if (it.state === 'place') {
        it.pt += dt * 3.5; const k = ease(Math.min(1, it.pt)); it.obj.position.lerpVectors(it.from, it.to, k); it.obj.position.y += Math.sin(k * Math.PI) * .12;
        if (it.pt >= 1) { it.state = 'rest'; it.obj.position.copy(it.to); env.audio && env.audio.thud(.25 + it.mass * .02); syncCol(it); persist(); }
      } else if (it.state === 'trash') {
        it.pt += dt * 2.6; const k = ease(Math.min(1, it.pt)); it.obj.position.lerpVectors(it.from, it.to, k); it.obj.position.y += Math.sin(k * Math.PI) * .35; it.obj.rotation.x = k * .5;
        if (it.pt >= 1) { it.state = 'sink'; it.vy = 0; }
      } else if (it.state === 'sink') {
        it.vy -= 9.8 * dt; it.obj.position.y += it.vy * dt;
        if (it.obj.position.y < it.to.y - .7) { env.audio && env.audio.thud(.5 + it.mass * .03); const d = it.done; removeItem(it); d && d(it); return; }
      } else if (it.state === 'fall') {
        it.vy -= 9.8 * dt; it.obj.position.y += it.vy * dt; const fl = surfaceBelow(it.obj.position.x, it.obj.position.z, it.obj.position.y + .05);
        if (it.obj.position.y <= fl) { it.obj.position.y = fl; if (it.vy < -2.5) { it.vy *= -.25; env.audio && env.audio.thud(.4 + it.mass * .03); } else { it.vy = 0; it.state = 'rest'; syncCol(it); persist(); } }
      }
    }
  }

  // ================= доставка =================
  const DOORSTEP = { x: .8, z: -KD - .75 };
  let knockT = 0;
  // слова реплики с таймингами (распознано по записи dostavka_pribila.mp3)
  const DELIVERY_WORDS = [[0, .7, 'Доставка'], [.7, 1.2, 'товара.'], [1.62, 2.12, 'Открывайте.']];
  function deliveryTick(dt) {
    if (knockT > 0) { const prev = knockT; knockT -= dt; const door = new THREE.Vector3(DOORSTEP.x, 1.3, -KD - .3);
      if (prev >= 3 && knockT < 3) { const r = env.audio && env.audio.sample && env.audio.sample('stuk', 1.1, door); if (!r) for (const t of [0, .3, .6]) setTimeout(() => env.audio && env.audio.knock(), t * 1000); } // стук
      if (prev > 1.1 && knockT <= 1.1) { const r = env.audio && env.audio.sample && env.audio.sample('dostavka', 1.3, door); // голос из-за двери + субтитры в реальном времени
        env.ctx.subtitles && env.ctx.subtitles('Доставщик', DELIVERY_WORDS, r ? r.start : null); } }
    const s = S(); if (!s || !s.deliveries || !s.deliveries.length) return;
    for (const d of s.deliveries) {
      if (d.state === 'way') { d.eta -= dt; if (d.eta <= 0) d.state = 'arrive'; }
      if (d.state === 'arrive') {
        // коробку ставим только когда крыльцо не видно (дверь закрыта или игрок смотрит в другую сторону)
        const seen = env.visibleFromPlayer(DOORSTEP.x, DOORSTEP.z) && (env.doorOpen() > .3 || !inK(P.x, P.z));
        const near = Math.hypot(P.x - DOORSTEP.x, P.z - DOORSTEP.z) < 2.2;
        if (!seen && !near) {
          const off = (s.items || []).filter(i => Math.hypot(i.x - DOORSTEP.x, i.z - DOORSTEP.z) < 1.2).length;
          addItem({ kind: 'box', x: DOORSTEP.x + (off % 2 ? .3 : -.3) * Math.min(off, 1), y: 0, z: DOORSTEP.z - Math.floor(off / 2) * .5, ry: R(-.3, .3), data: { contents: d.contents, hidden: d.hidden, label: d.label } });
          d.state = 'done'; knockT = 3.01; persist(); env.onDelivered && env.onDelivered(d);
        }
      }
    }
    s.deliveries = s.deliveries.filter(d => d.state !== 'done');

  }
  function unpack(it) {
    if (!it || it.kind !== 'box' || it.data.opened) return false;
    it.data.opened = true; const pos = it.obj.position.clone(), ry = it.obj.rotation.y;
    scene.remove(it.obj); it.obj = makeBoxMesh(.5, .36, .4, true); it.obj.position.copy(pos); it.obj.rotation.y = ry; it.obj.traverse(o => { if (o.isMesh) o.userData.item = it; }); scene.add(it.obj);
    it.mass = 1; env.onUnpack && env.onUnpack(it.data); it.data.contents = null; persist(); return true;
  }

  // ================= дисковый телефон на прилавке (js/phone.js) =================
  const ph = createPhone({ scene, camera, std, audio: env.audio });
  ph.root.position.set(-1.05, 1.005, KD - .22); ph.root.rotation.y = Math.PI * .85;
  ph.setCounter({ x1: -1.45, x2: 1.45, z1: KD - .45, z2: KD }, 1.005);
  let phoneBox = ph.box();
  function setPhoneModel() {} // присланная кнопочная модель больше не используется: аппарат дисковый
  function phoneTick(dt) { ph.tick(dt); if (!ph.calling) phoneBox = ph.box(); }
  function startCall() { ph.startCall(); }
  function setDialing() {}
  function dialNumber(d, done) { ph.dialNumber(d, done); }
  function hangUp() { ph.hangUp(); }

  // ================= блокнот на прилавке =================
  const NOTE_REST = { x: .05, y: 1.005, z: KD - .31, ry: Math.PI + .2 };
  let note = null, noteState = 'rest', noteT = 0, noteOnDone = null;
  function setNotepadModel(o) {
    note = o; note.position.set(NOTE_REST.x, NOTE_REST.y, NOTE_REST.z); note.rotation.set(0, NOTE_REST.ry, 0); scene.add(note);
    note.traverse(m => { if (m.isMesh) { m.castShadow = true; m.userData.notepad = true; } });
  }
  const noteBox = () => note ? new THREE.Box3().setFromObject(note).expandByScalar(.04) : null;
  const restPos = new THREE.Vector3(), restQ = new THREE.Quaternion(), holdQ = new THREE.Quaternion();
  function openNotepad(done) { if (!note || noteState !== 'rest') return; noteState = 'lift'; noteT = 0; noteOnDone = done; restPos.copy(note.position); restQ.copy(note.quaternion); }
  function closeNotepad(done) { if (!note || noteState !== 'held') return; noteState = 'lower'; noteT = 0; noteOnDone = done; }
  function noteTick(dt) {
    if (!note || noteState === 'rest') return;
    noteT += dt;
    // в руках: перед камерой, страницей к игроку
    const hold = tmp.copy(camera.position).add(tmp2.set(0, -.08, -.36).applyQuaternion(camera.quaternion));
    holdQ.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - .25, 0, 0)));
    if (noteState === 'lift') { const k = ease(Math.min(1, noteT / .7)); note.position.lerpVectors(restPos, hold, k); note.position.y += Math.sin(k * Math.PI) * .08; note.quaternion.slerpQuaternions(restQ, holdQ, k); if (noteT >= .7) { noteState = 'held'; const f = noteOnDone; noteOnDone = null; f && f(); } }
    else if (noteState === 'held') { note.position.copy(hold); note.quaternion.copy(holdQ); }
    else if (noteState === 'lower') { const k = ease(Math.min(1, noteT / .6)); note.position.lerpVectors(hold, restPos, k); note.quaternion.slerpQuaternions(holdQ, restQ, k); if (noteT >= .6) { noteState = 'rest'; note.position.copy(restPos); note.quaternion.copy(restQ); const f = noteOnDone; noteOnDone = null; f && f(); } }
  }

  // ================= пепельница =================
  const ashtray = new THREE.Group(); ashtray.position.set(.7, 1.005, KD - .28); scene.add(ashtray);
  const ashM = new THREE.MeshStandardMaterial({ color: 0x9aa8a8, roughness: .1, metalness: .2, transparent: true, opacity: .8 });
  const at = new THREE.Mesh(new THREE.CylinderGeometry(.06, .055, .03, 20), ashM); at.position.y = .015; ashtray.add(at);
  const ashIn = new THREE.Mesh(new THREE.CylinderGeometry(.048, .048, .005, 16), std({ color: 0x5a5550, roughness: 1 })); ashIn.position.y = .02; ashtray.add(ashIn);
  const butts = []; const buttM = std({ color: 0xc8a070, roughness: .8 });
  function setButts(n) { while (butts.length < Math.min(n, 12)) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .025, 6), buttM); b.rotation.set(Math.PI / 2 - .3, R(0, 6), R(-.4, .4)); b.position.set(R(-.03, .03), .028, R(-.03, .03)); ashtray.add(b); butts.push(b); } while (butts.length > n) ashtray.remove(butts.pop()); }
  const ashBox = new THREE.Box3().setFromObject(ashtray).expandByScalar(.08);

  // ================= руки и привычки (рисуются поверх, в сцене оружия) =================
  const vm = env.overlayScene;
  const skin = std({ color: 0xd9a888, roughness: .7 }), sleeveM = std({ color: 0x2f3a46, roughness: .85 }), nailM = std({ color: 0xe8c0a8, roughness: .5 });
  function makeHand(side = 1) {
    const g = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(.075, .022, .085), skin); g.add(palm);
    const fingers = [];
    for (let i = 0; i < 4; i++) { const f = new THREE.Group(); f.position.set((-.028 + i * .019) * side, 0, -.045); g.add(f); const len = [.03, .034, .032, .026][i];
      const p1 = new THREE.Mesh(new THREE.CapsuleGeometry(.008, len, 3, 6), skin); p1.rotation.x = Math.PI / 2; p1.position.z = -len / 2; f.add(p1);
      const j = new THREE.Group(); j.position.z = -len; f.add(j); const p2 = new THREE.Mesh(new THREE.CapsuleGeometry(.0075, len * .8, 3, 6), skin); p2.rotation.x = Math.PI / 2; p2.position.z = -len * .4; j.add(p2);
      const nail = new THREE.Mesh(new THREE.BoxGeometry(.01, .002, .01), nailM); nail.position.set(0, .0075, -len * .75); j.add(nail); fingers.push([f, j]); }
    const th = new THREE.Group(); th.position.set(.04 * side, -.004, -.005); th.rotation.y = -.6 * side; g.add(th);
    const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(.009, .03, 3, 6), skin); t1.rotation.x = Math.PI / 2; t1.position.z = -.02; th.add(t1);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(.03, .034, .05, 10), skin); wrist.rotation.x = Math.PI / 2; wrist.position.z = .06; g.add(wrist);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(.042, .05, .28, 12), sleeveM); sl.rotation.x = Math.PI / 2; sl.position.z = .22; g.add(sl);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(.046, .008, 6, 14), sleeveM); cuff.position.z = .08; g.add(cuff);
    g.userData = { fingers, thumb: th };
    g.curl = (k) => { fingers.forEach(([f, j]) => { f.rotation.x = -k * 1.1; j.rotation.x = -k * 1.3; }); th.rotation.x = -k * .6; };
    g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    return g;
  }
  const hab = { busy: null, t: 0 };
  // скелетная кисть (js/hand.js): позы суставов пальцев, предмет жёстко сидит в руке, ориентация кисти считается от предмета
  const handR = makeRigHand(std); handR.visible = false; vm.add(handR);
  // сигарета — между указательным и средним пальцем, поперёк пальцев: фильтр со стороны ладони, огонёк с тыльной
  const cig = makeCigarette(std); const cigNode = new THREE.Group(); cigNode.position.set(-.018, -.001, -.11); cigNode.rotation.x = -.75; cigNode.add(cig); handR.add(cigNode);
  const emberLight = new THREE.PointLight(0xff7030, 0, .6, 2); cig.add(emberLight); emberLight.position.y = .06;
  let cigModel = null; function setCigaretteModel(o) { cigModel = o; } // модель из файла больше не нужна: процедурная точнее (фильтр, пепел, огонёк)
  const cigFilterLocal = () => { cigNode.updateMatrix(); return cig.userData.filterEnd.clone().applyMatrix4(cigNode.matrix); };
  // бутылка — в кулаке поперёк пальцев: ось бутылки вдоль −X кисти, горлышко со стороны большого пальца
  let bottleModel = null; const bottleNode = new THREE.Group(); bottleNode.position.set(-.004, -.042, -.104); bottleNode.rotation.z = Math.PI / 2; handR.add(bottleNode);
  const GRIP_Y = .12, NECK = .3; // хват на высоте 12 см от дна, высота бутылки 30 см
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .018, 12), std({ color: 0xc8b06a, metalness: .8, roughness: .3 })); cap.frustumCulled = false;
  // пустая бутылка (мелкий мусор): копия модели водки без крышки, стоит вертикально
  function emptyBottleMesh() { const g = new THREE.Group(); if (bottleModel) { const c = bottleModel.clone(true); c.traverse(m => { if (m === cap || m.geometry === cap.geometry) m.visible = false; if (m.isMesh) { m.castShadow = true; m.frustumCulled = true; } }); c.rotation.set(0, 0, 0); c.position.set(0, 0, 0); g.add(c); }
    else { const m = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .3, 10), std({ color: 0xcfe0e0, roughness: .1, transparent: true, opacity: .7 })); m.position.y = .15; g.add(m); } return g; }
  function giveEmptyBottle() { const it = addItem({ kind: 'bottle', x: P.x, y: camera.position.y - .5, z: P.z, ry: 0 }); pick(it); }
  function setBottleModel(o) { bottleModel = o; o.traverse(m => { if (m.isMesh) m.frustumCulled = false; }); bottleNode.add(o); o.position.set(0, -GRIP_Y, 0); cap.position.set(0, .295, 0); o.add(cap); }
  // дым
  const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(225,225,225,.55)'); gr.addColorStop(1, 'rgba(225,225,225,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const puffs = []; for (let i = 0; i < 28; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })); sp.visible = false; scene.add(sp); puffs.push({ sp, life: 0, v: new THREE.Vector3() }); }
  function puff(at, dir, n = 3, big = 1) { for (let i = 0; i < n; i++) { const p = puffs.find(q => q.life <= 0); if (!p) return; p.life = R(1.6, 2.6); p.sp.visible = true; p.sp.position.copy(at); p.v.copy(dir).multiplyScalar(R(.25, .5) * big).add(tmp2.set(R(-.05, .05), R(.08, .18), R(-.05, .05))); p.sp.scale.setScalar(.05 * big); } }
  function smokeTick(dt) { for (const p of puffs) if (p.life > 0) { p.life -= dt; p.sp.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * .8); p.v.x += env.wind().x * dt * .3; p.sp.scale.multiplyScalar(1 + dt * .9); p.sp.material.opacity = Math.min(.45, p.life * .25); if (p.life <= 0) p.sp.visible = false; } }

  const fx = { smoke: 0, drunk: 0, drunkTarget: 0 };
  function startSmoke() { if (hab.busy) return false; Object.assign(hab, { busy: 'smoke', t: 0, out: 0, lit: false, doneAsk: false, puffs: 0, burn: 1, ashLen: 0, flick: 0 }); handR.visible = true; cigNode.visible = true; bottleNode.visible = false; cig.userData.setBurn(1, 0, 0); emberLight.intensity = 0; handR.position.set(.22, -.6, -.3); env.onCtl(); return true; }
  function startDrink(kind) { if (hab.busy) return false; Object.assign(hab, { busy: 'drink', kind, t: 0, out: 0, sips: 0, gulps: 0, flick: 0, capOff: false }); handR.visible = true; cigNode.visible = false; bottleNode.visible = true; cap.visible = true; cap.position.set(0, .295, 0); cap.rotation.set(0, 0, 0); handR.position.set(.22, -.6, -.3); env.onCtl(); return true; }
  function finishHabit(how) { // how: 'ashtray' | 'throw' | 'done'
    if (hab.busy === 'smoke') {
      if (how === 'ashtray') { const s = S(); s.butts = (s.butts || 0) + 1; setButts(s.butts); }
      else if (how === 'urn') { env.audio && env.audio.click(500, .3, 0, .04); }
      else { // выбросить окурок — летит и гаснет
        const b = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .025, 6), buttM); camera.getWorldDirection(tmp); b.position.copy(camera.position).addScaledVector(tmp, .3); b.userData.v = tmp.clone().multiplyScalar(3).add(tmp2.set(0, 1.5, 0)); scene.add(b); thrown.push(b); }
    }
    hab.busy = null; hab.out = .4; env.onCtl();
  }
  const thrown = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _p2 = new THREE.Vector3();
  // кисть по направлению пальцев f и тыльной стороны b (в пространстве взгляда)
  const quatFB = (f, b, out) => { const z = f.clone().normalize().negate(), y = b.clone().addScaledVector(z, -b.dot(z)).normalize(), x = new THREE.Vector3().crossVectors(y, z); return out.setFromRotationMatrix(_m.makeBasis(x, y, z)); };
  // кисть по оси бутылки n (от хвата к горлышку) и тыльной стороне b: ось бутылки = −X кисти
  const quatBottle = (n, b, out) => { const x = n.clone().normalize().negate(), y = b.clone().addScaledVector(x, -b.dot(x)).normalize(), z = new THREE.Vector3().crossVectors(x, y); return out.setFromRotationMatrix(_m.makeBasis(x, y, z)); };
  // ключевые положения (координаты камеры: X вправо, Y вверх, −Z вперёд; губы ≈ (0, −.08, −.06))
  const LIPS = V(0, -.115, -.1); // чуть ниже и дальше центра взгляда — рука у рта видна снизу кадра, не закрывая обзор
  const SM = { restQ: quatFB(V(-.4, .3, -1), V(.25, 1, .3), new THREE.Quaternion()), restP: V(.15, -.2, -.36),
               mouthQ: quatFB(V(-.12, 1, .12), V(.05, .1, -1), new THREE.Quaternion()) };
  const DR = { restQ: quatBottle(V(.08, 1, .05), V(.7, 0, .7), new THREE.Quaternion()), restP: V(.17, -.17, -.42),
               mouthQ: quatBottle(V(0, -.3, 1), V(1, 0, 0), new THREE.Quaternion()) };
  const P_ = HAND_POSES;
  function placeByLocal(q, localPt, target) { _p.copy(localPt).applyQuaternion(q); return _p2.copy(target).sub(_p); } // позиция кисти, чтобы точка кисти localPt оказалась в target
  function habitTick(dt) {
    smokeTick(dt);
    for (const b of thrown.slice()) { b.userData.v.y -= 9.8 * dt; b.position.addScaledVector(b.userData.v, dt); b.rotation.x += dt * 10; if (b.position.y <= .01) { b.position.y = .01; b.userData.v.set(0, 0, 0); b.userData.life = (b.userData.life || 20) - dt; if (b.userData.life <= 0) { scene.remove(b); thrown.splice(thrown.indexOf(b), 1); } } }
    fx.smoke = Math.max(0, fx.smoke - dt / 70);
    fx.drunk += (fx.drunkTarget - fx.drunk) * Math.min(1, dt * .25); fx.drunkTarget = Math.max(0, fx.drunkTarget - dt / 75); // трезвеем: глоток водки (.35) проходит примерно за полминуты
    if (hab.out > 0) { hab.out -= dt; handR.position.lerp(_p.set(.22, -.62, -.28), Math.min(1, dt * 7)); handR.pose(P_.relaxed, dt, 8); if (hab.out <= 0) handR.visible = false; return; }
    if (!hab.busy) return;
    if (!hab.freeze) hab.t += dt; const t = hab.t, k = Math.min(1, dt * 11);
    if (hab.busy === 'smoke') {
      // 0–.5 достать из кармана; .5–1.0 к губам; .9 вспышка спички, 1.0 огонёк; 1.0–1.5 первая затяжка; далее циклы по 4.5 с:
      // к губам .7 с → затяжка .9 с (огонёк ярче, пальцы сжимают фильтр) → вниз .6 с → у груди, на 1.2 с от опускания стряхнуть пепел щелчком большого пальца
      let toMouth, inhale = 0, c = -1;
      if (t < .5) toMouth = 0; else if (t < 1.0) toMouth = ease((t - .5) / .5); else if (t < 1.5) { toMouth = 1; inhale = 1; } else if (t < 2.0) toMouth = 1 - ease((t - 1.5) / .5);
      else { c = (t - 2.0) % 4.5; toMouth = c < .7 ? ease(c / .7) : c < 1.6 ? 1 : c < 2.2 ? 1 - ease((c - 1.6) / .6) : 0; inhale = c > .75 && c < 1.55 ? 1 : 0; }
      if (t > .9 && !hab.lit) { hab.lit = true; env.audio && env.audio.click(3000, .3, 0, .08); emberLight.intensity = 2; cig.updateMatrixWorld(true); }
      // тление: при затяжке ярче и быстрее
      if (hab.lit) { hab.burn = Math.max(.12, hab.burn - dt * (inhale ? .045 : .006)); hab.ashLen = Math.min(.018, hab.ashLen + dt * (inhale ? .006 : .0012)); }
      const glow = !hab.lit ? 0 : inhale ? 2.6 : 1.1 + Math.sin(t * 7) * .15; emberLight.intensity = glow * .25 * (hab.lit ? 1 : 0);
      // стряхнуть пепел: у груди, когда пепла набралось
      if (c > 3.3 && c < 3.3 + dt + .001 && hab.ashLen > .004) { hab.flick = .35; }
      if (hab.flick > 0) { hab.flick -= dt; if (hab.flick < .2 && hab.ashLen > 0) { cig.getWorldPosition(_p); puff(_p.add(V(0, .05, 0)), V(0, -1, 0), 1, .3); hab.ashLen = 0; } }
      cig.userData.setBurn(hab.burn, hab.ashLen, glow);
      if (c > 2.25 && c < 2.25 + dt + .001) { hab.puffs++; fx.smoke = Math.min(1, fx.smoke + .25); camera.getWorldDirection(_p); puff(_p2.copy(camera.position).addScaledVector(_p, .25).add(V(0, -.05, 0)), _p, 5, 1.4); } // выдох
      if (c > 3 && Math.random() < dt * 2) { cig.getWorldPosition(_p); puff(_p.add(V(0, .06, 0)), V(0, 1, 0), 1, .5); } // дымок с кончика
      if (hab.puffs >= 4 && c > 2.4 && !hab.doneAsk) { hab.doneAsk = true; env.onCtl(); }
      // кисть: у груди → ладонью к лицу, фильтр точно у губ
      _q.copy(SM.restQ).slerp(SM.mouthQ, toMouth);
      const rest = _p2.copy(SM.restP); if (t < .5) rest.y -= (1 - ease(t / .5)) * .4; // поднимается снизу
      const atLips = placeByLocal(_q, cigFilterLocal(), LIPS).clone();
      const tgt = rest.clone().lerp(atLips, toMouth);
      if (hab.flick > 0) { const f = Math.sin((1 - hab.flick / .35) * Math.PI); tgt.y += f * .012; _q2.setFromAxisAngle(V(1, 0, 0), f * .18); _q.multiply(_q2); } // постукивание при стряхивании
      handR.position.lerp(tgt, k); handR.quaternion.slerp(_q, k);
      const pose = hab.flick > 0 ? handR.mix([P_.pinch, 1], [P_.thumbFlick, 1.5]) : inhale ? P_.pinchHard : t < .3 ? P_.open : P_.pinch;
      handR.pose(pose, dt, 16, .02, t);
    } else if (hab.busy === 'drink') {
      // 0–.45 рука поднимается, пальцы смыкаются вокруг бутылки; .45–.8 большой палец отщёлкивает крышку;
      // .8–1.4 к губам; 1.4–2.9 три глотка (наклон чуть больше на каждом); 2.9–3.5 опустить
      let toMouth = t < .8 ? 0 : t < 1.4 ? ease((t - .8) / .6) : t < 2.9 ? 1 : t < 3.5 ? 1 - ease((t - 2.9) / .6) : 0;
      if (t > .55 && cap.visible && !hab.capOff) { hab.capOff = true; hab.flick = .3; env.audio && env.audio.click(1800, .5, 0, .06); }
      if (hab.capOff && cap.visible) { cap.position.y += dt * .6; cap.position.x += dt * .25; cap.rotation.z += dt * 18; if (cap.position.y > .5) cap.visible = false; }
      if (hab.flick > 0) hab.flick -= dt;
      let gulp = 0; if (t > 1.4 && t < 2.9) { const gp = (t - 1.4) / .5, gi = Math.floor(gp), gf = gp - gi; gulp = Math.sin(gf * Math.PI); if (gi > hab.gulps - 1 && gf > .5 && hab.gulps < 3) { hab.gulps++; env.audio && env.audio.gulp && env.audio.gulp(); } }
      if (t > 1.6 && hab.sips === 0) { hab.sips = 1; const strong = { vodka: .35, samogon: .5, beer: .12 }[hab.kind] || 0; fx.drunkTarget = Math.min(1.6, fx.drunkTarget + strong); env.onDrink && env.onDrink(hab.kind, strong); }
      if (t > 3.5) { hab.capOff = false; finishHabit('done'); const f = hab.onDrinkEnd; f && f(); return; }
      // ось бутылки: вертикально → горлышком к губам, на глотках запрокидывается сильнее
      // у губ бутылка идёт по диагонали: горлышко ко рту, корпус уходит вправо-вперёд-вверх (иначе издалека дно выглядит как горлышко)
      const n = V(.08, 1, .05).lerp(V(-.55, -.32 - gulp * .18, .78), toMouth).normalize();
      quatBottle(n, V(.7, 0, .7).lerp(V(.55, .75, -.35), toMouth), _q);
      const neckLocal = V(-(NECK - GRIP_Y), 0, 0).add(bottleNode.position); // кончик горлышка в координатах кисти
      const rest = _p2.copy(DR.restP); if (t < .45) rest.y -= (1 - ease(t / .45)) * .4;
      const restPos = placeByLocal(_q, bottleNode.position, rest).clone(), mouthPos = placeByLocal(_q, neckLocal, LIPS).clone();
      handR.position.lerp(restPos.lerp(mouthPos, toMouth), k); handR.quaternion.slerp(_q, k);
      const closeK = Math.min(1, t / .45);
      handR.pose(hab.flick > 0 ? handR.mix([P_.grip, 1], [P_.thumbFlick, 1.2]) : handR.mix([P_.open, 1 - closeK], [P_.grip, closeK + .001]), dt, 18, .01, t);
    }
  }
  const habit = { get busy() { return hab.busy; }, get canFinish() { return hab.busy === 'smoke' && hab.doneAsk; }, startSmoke, startDrink, finishHabit, giveEmptyBottle, set onDrinkEnd(f) { hab.onDrinkEnd = f; }, debugPose(t) { hab.t = t; hab.freeze = t != null; }, get hand() { return handR; } }; // debugPose — для тестов анимации

  return {
    makeHand, items, addItem, removeItem, loadItems, persist, lookItem, pick, placeHeld, dropHeld, rotateHeld, trashHeld, unpack, get held() { return held; },
    canPlace: () => !!(held && rayPlace(2.4, held)),
    lookingAtPhone: () => { ray.setFromCamera(new THREE.Vector2(0, 0), camera); const h = ray.ray.intersectBox(phoneBox, tmp); return h && h.distanceTo(camera.position) < 1.8; },
    lookingAtNotepad: () => { const b = noteBox(); if (!b) return false; ray.setFromCamera(new THREE.Vector2(0, 0), camera); const h = ray.ray.intersectBox(b, tmp); return h && h.distanceTo(camera.position) < 1.6; },
    lookingAtAshtray: () => { ray.setFromCamera(new THREE.Vector2(0, 0), camera); const h = ray.ray.intersectBox(ashBox, tmp); return h && h.distanceTo(camera.position) < 1.6; },
    setPhoneModel, startCall, setDialing, dialNumber, hangUp, get calling() { return ph.calling; }, phone: ph,
    setNotepadModel, openNotepad, closeNotepad, get notepadState() { return noteState; },
    setCigaretteModel, setBottleModel, setButts, habit, fx,
    tick(dt) { itemsTick(dt); deliveryTick(dt); phoneTick(dt); noteTick(dt); habitTick(dt); },
    heavy: () => held ? held.mass : 0,
  };
}
