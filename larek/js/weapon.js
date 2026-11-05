// Охотничье ружьё (двустволка-«вертикалка» в духе ИЖ) от первого лица.
// Используется только для устрашения: дробь уходит в воздух/землю, урон NPC не наносится.
import * as THREE from 'three';
import { Rope } from './rope.js';

const lerp = (a, b, k) => a + (b - a) * k;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export function createWeapon({ audio, onShot }) {
  const scene = new THREE.Scene();               // отдельная сцена — рисуется поверх мира, не протыкает стены
  const cam = new THREE.PerspectiveCamera(60, 1, .01, 10);
  scene.add(new THREE.HemisphereLight(0xdfe6ec, 0x4a443c, 2.6));
  const key = new THREE.DirectionalLight(0xfff0dd, 3.2); key.position.set(-.5, 1, .6); scene.add(key);
  const flashLight = new THREE.PointLight(0xffb060, 0, 3, 2); scene.add(flashLight);

  // ---------- модель ----------
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: .7, roughness: .35 });
  const steelLight = new THREE.MeshStandardMaterial({ color: 0x9a9ca2, metalness: .75, roughness: .3 });
  const woodTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#7a4a24'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${30 + Math.random() * 40},${15 + Math.random() * 20},5,${.2 + Math.random() * .3})`; g.lineWidth = .5 + Math.random() * 2; g.beginPath(); const x = Math.random() * 128; g.moveTo(x, 0); g.bezierCurveTo(x + 10, 80, x - 10, 160, x + 5, 256); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: .55, metalness: 0 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: .9 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x3d4a58, roughness: .8 });
  const B = (w, h, d, m, x, y, z, p) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };
  const C = (r, l, m, x, y, z, p, seg = 14) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); p.add(o); return o; };

  const rig = new THREE.Group(); scene.add(rig);           // положение в руках
  const gun = new THREE.Group(); rig.add(gun);
  // колодка
  B(.044, .055, .13, steelLight, 0, 0, 0, gun);
  B(.03, .03, .05, steel, 0, -.035, .02, gun);              // спусковая скоба
  const tg = new THREE.Mesh(new THREE.TorusGeometry(.018, .004, 6, 12, Math.PI), steel); tg.rotation.z = Math.PI; tg.position.set(0, -.04, .03); gun.add(tg);
  // приклад
  const stock = B(.04, .06, .3, wood, 0, -.03, .2, gun); stock.rotation.x = -.18;
  B(.042, .085, .03, new THREE.MeshStandardMaterial({ color: 0x151312, roughness: .9 }), 0, -.075, .35, gun).rotation.x = -.18;
  B(.034, .045, .08, wood, 0, -.025, .075, gun);            // шейка
  // стволы на шарнире (перелом)
  const hinge = new THREE.Group(); hinge.position.set(0, -.012, -.065); gun.add(hinge);
  C(.0125, .7, steel, 0, .024, -.35, hinge); C(.0125, .7, steel, 0, -.002, -.35, hinge);
  B(.006, .004, .68, steel, 0, .04, -.35, hinge);           // прицельная планка
  const bead = new THREE.Mesh(new THREE.SphereGeometry(.003, 8, 6), steelLight); bead.position.set(0, .044, -.69); hinge.add(bead);
  B(.04, .03, .2, wood, 0, -.028, -.16, hinge);             // цевьё
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, .012, -.71); hinge.add(muzzle);
  // патроны в стволах (видны при переломе)
  const shellM = new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: .6 }), brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: .9, roughness: .3 });
  const mkShell = () => { const g = new THREE.Group(); C(.0105, .06, shellM, 0, 0, 0, g); C(.0115, .012, brass, 0, 0, .03, g); return g; };
  const chamberShells = [mkShell(), mkShell()]; chamberShells[0].position.set(0, .024, -.01); chamberShells[1].position.set(0, -.002, -.01); chamberShells.forEach(s => hinge.add(s));
  // руки
  const handR = new THREE.Group(); gun.add(handR); handR.position.set(.012, -.05, .075);
  B(.05, .045, .09, glove, 0, 0, 0, handR); const slR = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, .35, 10), sleeve); slR.position.set(.06, -.08, .17); slR.rotation.set(1.2, 0, -.5); handR.add(slR);
  const handL = new THREE.Group(); hinge.add(handL); handL.position.set(-.008, -.045, -.17);
  B(.05, .04, .1, glove, 0, 0, 0, handL); const slL = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, .4, 10), sleeve); slL.position.set(-.1, -.12, .12); slL.rotation.set(1.0, 0, .9); handL.add(slL);
  // вспышка
  const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(.3, 'rgba(255,190,90,.9)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(.22, .22), new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.visible = false; muzzle.add(flash);
  const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(200,200,200,.5)'); gr.addColorStop(1, 'rgba(200,200,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const smokes = []; for (let i = 0; i < 10; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; scene.add(s); smokes.push({ s, life: 0, v: new THREE.Vector3() }); }
  const ejected = [mkShell(), mkShell()]; ejected.forEach(e => { e.visible = false; scene.add(e); e.userData.v = new THREE.Vector3(); });
  gun.traverse(o => { if (o.isMesh) o.frustumCulled = false; });

  // ---------- состояние ----------
  const W = { state: 'holstered', t: 0, ammo: 2, reserve: 0, aimK: 0, wantAim: false, recoil: 0, drawK: 0, kick: 0, swayT: 0 };
  const HIP = new THREE.Vector3(.2, -.2, -.44), ADS = new THREE.Vector3(0, -.052, -.27), DOWN = new THREE.Vector3(.2, -.55, -.25);
  const tmp = new THREE.Vector3(), wp = new THREE.Vector3();

  function draw() { if (W.state === 'holstered') { W.state = 'drawing'; W.t = 0; audio && (audio.gunMove ? audio.gunMove() : audio.reloadClose()); return true; } return false; }
  function holster() { if (W.state === 'idle' || W.state === 'aiming') { W.state = 'holstering'; W.t = 0; W.wantAim = false; audio && audio.gunMove && audio.gunMove(); return true; } return false; }
  function toggle() { return W.state === 'holstered' ? draw() : holster(); }
  function aim(on) { W.wantAim = on; if (on && W.state === 'holstered') draw(); }
  function fire() {
    if (W.state !== 'idle' && W.state !== 'aiming') return 'busy';
    if (W.ammo <= 0) { audio && audio.click(900, .4); return 'empty'; }
    W.ammo--; chamberShells[W.ammo].visible = false;
    W.recoil = 1; W.kick = 1; W.t = 0; W.lastState = W.state; W.state = 'firing';
    flash.visible = true; flash.rotation.z = Math.random() * 6; flashLight.intensity = 6;
    audio && audio.shot();
    muzzle.getWorldPosition(wp);
    for (let i = 0; i < 5; i++) { const sm = smokes.find(x => x.life <= 0); if (!sm) break; sm.life = 1.2 + Math.random() * .6; sm.s.visible = true; sm.s.position.copy(wp); sm.v.set((Math.random() - .5) * .08, .05 + Math.random() * .05, -.15 - Math.random() * .2); sm.s.scale.setScalar(.05); }
    onShot && onShot();
    return 'shot';
  }
  function reload() {
    if ((W.state !== 'idle' && W.state !== 'aiming') || W.ammo >= 2 || W.reserve <= 0) return false;
    W.state = 'reloading'; W.t = 0; W.wantAim = false; W.inserted = 0; W.ejectedDone = false; return true;
  }

  function update(dt, { moving = 0, sprint = false, aspect = 1, lookDX = 0, lookDY = 0 } = {}) {
    W.t += dt; W.swayT += dt * (1 + moving * 3);
    cam.aspect = aspect; cam.updateProjectionMatrix();
    // переходы состояний
    if (W.state === 'drawing' && W.t > .45) { W.state = 'idle'; W.t = 0; }
    if (W.state === 'holstering' && W.t > .4) { W.state = 'holstered'; W.t = 0; }
    if (W.state === 'firing' && W.t > .35) { W.state = W.lastState === 'aiming' && W.wantAim ? 'aiming' : 'idle'; W.t = 0; }
    if (W.state === 'idle' && W.wantAim && !sprint) W.state = 'aiming';
    if (W.state === 'aiming' && (!W.wantAim || sprint)) W.state = 'idle';
    // анимация перезарядки: перелом → гильзы → патроны → закрыть
    let breakA = 0;
    if (W.state === 'reloading') {
      const t = W.t, need = Math.min(2 - W.ammo, W.reserve);
      if (t < .35) breakA = ease(t / .35);
      else breakA = 1;
      if (t > .1 && !W.opened) { W.opened = true; audio && audio.reloadOpen(); }
      if (t > .4 && !W.ejectedDone) { W.ejectedDone = true; audio && audio.shellOut(); ejected.forEach((e, i) => { if (i >= 2 - W.ammo) return; e.visible = true; hinge.localToWorld(e.position.set(0, i ? -.002 : .024, .02)); e.userData.v.set(.25 + Math.random() * .2, .6 + Math.random() * .3, .3); e.userData.life = 1.2; }); }
      const insT = [.9, 1.35];
      for (let i = 0; i < need; i++) if (t > insT[i] && W.inserted <= i) { W.inserted = i + 1; const slot = W.ammo + i; chamberShells[slot].visible = true; W.reserve--; audio && audio.shellIn(); }
      const closeT = .9 + need * .45 + .2;
      if (t > closeT) breakA = 1 - ease(Math.min(1, (t - closeT) / .2));
      if (t > closeT + .05 && !W.closed) { W.closed = true; audio && audio.reloadClose(); }
      if (t > closeT + .35) { W.ammo += W.inserted; W.state = 'idle'; W.t = 0; W.opened = W.closed = false; }
    }
    hinge.rotation.x = -breakA * .55;
    // положение в кадре
    const drawn = W.state === 'drawing' ? ease(W.t / .45) : W.state === 'holstering' ? 1 - ease(W.t / .4) : W.state === 'holstered' ? 0 : 1;
    W.aimK = lerp(W.aimK, W.state === 'aiming' || (W.state === 'firing' && W.lastState === 'aiming') ? 1 : 0, Math.min(1, dt * 10));
    tmp.copy(HIP).lerp(ADS, W.aimK);
    if (W.state === 'reloading') tmp.add(new THREE.Vector3(-.05, -.04, .05));
    tmp.lerp(DOWN, 1 - drawn);
    const swayA = (1 - W.aimK * .85) * (1 + moving * 2);
    tmp.x += Math.sin(W.swayT * 1.1) * .004 * swayA + (sprint ? Math.sin(W.swayT * 2) * .02 : 0) - lookDX * .00015;
    tmp.y += Math.sin(W.swayT * 2.2) * .003 * swayA - Math.abs(Math.sin(W.swayT * 2)) * moving * .012 + lookDY * .00015;
    W.recoil = Math.max(0, W.recoil - dt * 4);
    tmp.z += W.recoil * .07;
    rig.position.copy(tmp);
    rig.rotation.set(W.recoil * .35 + (1 - drawn) * -.9 + (W.state === 'reloading' ? .35 + breakA * .1 : 0) + (sprint ? -.25 : 0) + (1 - W.aimK) * .06, (1 - W.aimK) * .2 + (sprint ? .5 : 0), (W.state === 'reloading' ? .4 : 0) + (sprint ? .2 : 0));
    rig.visible = W.state !== 'holstered';
    // вспышка, дым, гильзы
    if (flash.visible && W.t > .05) flash.visible = false;
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 60); muzzle.getWorldPosition(flashLight.position);
    for (const sm of smokes) if (sm.life > 0) { sm.life -= dt; sm.s.position.addScaledVector(sm.v, dt); sm.s.scale.multiplyScalar(1 + dt * 1.6); sm.s.material.opacity = Math.max(0, sm.life * .35); if (sm.life <= 0) sm.s.visible = false; }
    for (const e of ejected) if (e.visible) { e.userData.life -= dt; e.userData.v.y -= 9.8 * dt; e.position.addScaledVector(e.userData.v, dt); e.rotation.x += dt * 12; if (e.userData.life <= 0) e.visible = false; }
    W.kick = Math.max(0, W.kick - dt * 6);
    slingTick(dt);
  }

  // ---------- реальная модель ружья (скан) и нормальные руки ----------
  let sling = null; const slA = new THREE.Object3D(), slB = new THREE.Object3D(); const wa = new THREE.Vector3(), wb = new THREE.Vector3();
  function setModel(model, makeHand) {
    // процедурный корпус прячем, шарнир (для анимации перезарядки) оставляем
    gun.traverse(o => { if (o.isMesh && !chamberShells.some(c => c === o || c.children.includes(o))) o.visible = false; });
    const holder = new THREE.Group(); holder.position.set(0, -.03, .38); gun.add(holder); holder.add(model); // модель: приклад в 0, ствол в −Z
    model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    if (makeHand) {
      const r = makeHand(1); r.position.set(.03, -.06, .1); r.rotation.set(.35, .15, .25); r.curl(.75); gun.add(r);
      const l = makeHand(-1); l.position.set(-.035, -.055, -.22); l.rotation.set(-.15, -.4, -.6); l.curl(.55); hinge.add(l);
      [handR, handL].forEach(h => h.visible = false);
    }
    slA.position.set(0, -.045, -.42); hinge.add(slA); slB.position.set(0, -.085, .3); gun.add(slB);
    sling = new Rope(scene, { n: 12, length: .78, width: .028, thick: .004 });
  }
  function slingTick(dt) { if (!sling) return; sling.visible = rig.visible; if (!rig.visible) { sling.reset(); return; } rig.updateMatrixWorld(true); slA.getWorldPosition(wa); slB.getWorldPosition(wb); sling.update(wa, wb, dt); }

  return {
    setModel, slingTick,
    scene, cam, update, draw, holster, toggle, aim, fire, reload,
    get state() { return W.state; }, get drawn() { return W.state !== 'holstered' && W.state !== 'holstering'; }, get aiming() { return W.aimK > .6; },
    get aimK() { return W.aimK; }, get ammo() { return W.ammo; }, get reserve() { return W.reserve; }, set reserve(v) { W.reserve = v; },
    set ammo(v) { W.ammo = v; chamberShells.forEach((s, i) => s.visible = i < v); }, get kick() { return W.kick; },
  };
}
