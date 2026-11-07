// Охотничье двуствольное ружьё от первого лица: детализированный хват двумя анатомичными руками, прицеливание по планке,
// объёмная вспышка выстрела с искрами и пороховым дымом, двухфазная отдача 12-го калибра и перелом стволов при перезарядке.
import * as THREE from 'three';
import { Rope } from './rope.js';
import { makeRigHand, HAND_POSES } from './hand.js';

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export function createWeapon({ audio, onShot }) {
  const scene = new THREE.Scene();               // отдельная сцена поверх мира
  const cam = new THREE.PerspectiveCamera(60, 1, .01, 12);
  const hemi = new THREE.HemisphereLight(0xbfc8cc, 0x4a4636, .75); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0dd, 1.1); key.position.set(-.5, 1, .6); scene.add(key);
  const localLight = new THREE.PointLight(0xffc98a, 0, 7, 1.8); scene.add(localLight);
  const flashLight = new THREE.PointLight(0xff9838, 0, 5.5, 1.8); scene.add(flashLight);

  const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: .75, metalness: .05 }, o));
  const steel = new THREE.MeshStandardMaterial({ color: 0x34383e, metalness: .78, roughness: .32 });
  const steelLight = new THREE.MeshStandardMaterial({ color: 0x9a9ca2, metalness: .8, roughness: .28 });
  const woodTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#6e401e'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${30 + Math.random() * 40},${15 + Math.random() * 20},5,${.2 + Math.random() * .3})`;
      g.lineWidth = .5 + Math.random() * 2; g.beginPath();
      const x = Math.random() * 128; g.moveTo(x, 0); g.bezierCurveTo(x + 10, 80, x - 10, 160, x + 5, 256); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: .55, metalness: 0 });
  const B = (w, h, d, m, x, y, z, p) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };
  const C = (r, l, m, x, y, z, p, seg = 14) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); p.add(o); return o; };

  const rig = new THREE.Group(); scene.add(rig);
  const gun = new THREE.Group(); rig.add(gun);

  // Запасной процедурный корпус (до подгрузки GLB-модели)
  const procParts = [];
  const addProc = o => { procParts.push(o); return o; };
  addProc(B(.044, .055, .13, steelLight, 0, 0, 0, gun));
  addProc(B(.03, .03, .05, steel, 0, -.035, .02, gun));
  { const tg = new THREE.Mesh(new THREE.TorusGeometry(.018, .004, 6, 12, Math.PI), steel); tg.rotation.z = Math.PI; tg.position.set(0, -.04, .03); gun.add(tg); procParts.push(tg); }
  { const stock = B(.04, .06, .3, wood, 0, -.03, .2, gun); stock.rotation.x = -.18; procParts.push(stock); }
  { const pad = B(.042, .085, .03, new THREE.MeshStandardMaterial({ color: 0x151312, roughness: .9 }), 0, -.075, .35, gun); pad.rotation.x = -.18; procParts.push(pad); }
  addProc(B(.034, .045, .08, wood, 0, -.025, .075, gun));

  // Шарнир перелома стволов (z = -0.072 в координатах gun)
  const hinge = new THREE.Group(); hinge.position.set(0, -.005, -.072); gun.add(hinge);
  addProc(C(.0125, .64, steel, -.016, .024, -.32, hinge));
  addProc(C(.0125, .64, steel,  .016, .024, -.32, hinge));
  addProc(B(.008, .004, .62, steel, 0, .034, -.32, hinge));
  { const bead = new THREE.Mesh(new THREE.SphereGeometry(.0028, 8, 6), steelLight); bead.position.set(0, .038, -.63); hinge.add(bead); procParts.push(bead); }
  addProc(B(.042, .03, .22, wood, 0, .002, -.16, hinge));

  const muzzle = new THREE.Object3D(); muzzle.position.set(-.016, .024, -.635); hinge.add(muzzle);

  // Патроны 12-го калибра в патронниках (видны при переломе горизонталки: левый и правый ствол)
  const shellM = new THREE.MeshStandardMaterial({ color: 0xb02218, roughness: .52 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4ad32, metalness: .88, roughness: .26 });
  const primerM = new THREE.MeshStandardMaterial({ color: 0xc8c4b8, metalness: .9, roughness: .2 });
  const mkShell = () => {
    const g = new THREE.Group();
    C(.0098, .058, shellM, 0, 0, 0, g, 12);
    C(.0106, .014, brass, 0, 0, .026, g, 12);
    C(.0114, .0025, brass, 0, 0, .0325, g, 12);
    C(.0032, .001, primerM, 0, 0, .0335, g, 8);
    return g;
  };
  const chamberShells = [mkShell(), mkShell()];
  chamberShells[0].position.set(-.0165, .022, -.025);
  chamberShells[1].position.set( .0165, .022, -.025);
  chamberShells.forEach(s => hinge.add(s));

  // Анатомичные 3D-руки с пальцами, суставами и рукавами куртки (из hand.js)
  function orientHand(hand, zSleeve, yBack, flipX = false) {
    const z = zSleeve.clone().normalize();
    const y = yBack.clone().addScaledVector(z, -yBack.dot(z)).normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    if (flipX) x.negate();
    hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }

  // Правая рука плотно обхватывает шейку приклада справа-снизу, указательный палец на спусковом крючке
  const rigHandR = makeRigHand(std);
  rigHandR.scale.set(.64, .64, .64);
  gun.add(rigHandR);
  rigHandR.position.set(.032, -.054, .068);
  orientHand(rigHandR, new THREE.Vector3(.20, -.14, .97), new THREE.Vector3(.92, -.30, -.25), false);

  // Левая рука поддерживает деревянное цевьё снизу
  const rigHandL = makeRigHand(std);
  rigHandL.scale.set(-.64, .64, .64);
  hinge.add(rigHandL);
  const setLeftHandForeend = () => {
    rigHandL.position.set(-.008, -.028, -.185);
    orientHand(rigHandL, new THREE.Vector3(-.20, -.72, .66), new THREE.Vector3(-.22, -.64, -.73), true);
  };
  setLeftHandForeend();

  const POSE_R_IDLE = {
    index:  [.32, .62, .42, .04],
    middle: [1.18, 1.32, .88, 0],
    ring:   [1.24, 1.36, .92, -.04],
    pinky:  [1.30, 1.40, .95, -.08],
    thumb:  [.78, .68, .48, -.12],
  };
  const POSE_R_FIRE = {
    index:  [.88, 1.12, .78, .04],
    middle: [1.22, 1.35, .90, 0],
    ring:   [1.28, 1.38, .94, -.04],
    pinky:  [1.32, 1.42, .96, -.08],
    thumb:  [.82, .72, .50, -.12],
  };
  const POSE_L_FOREEND = {
    index:  [.95, 1.08, .72, .05],
    middle: [1.02, 1.12, .75, 0],
    ring:   [1.06, 1.15, .78, -.03],
    pinky:  [1.10, 1.18, .80, -.06],
    thumb:  [.72, .65, .45, .24],
  };
  const POSE_L_SHELL = {
    index:  [.52, .62, .42, .06],
    middle: [.58, .68, .45, 0],
    ring:   [1.12, 1.25, .82, -.04],
    pinky:  [1.18, 1.30, .85, -.08],
    thumb:  [.58, .52, .38, .32],
  };
  rigHandR.pose(POSE_R_IDLE, null);
  rigHandL.pose(POSE_L_FOREEND, null);

  const reloadShell = mkShell();
  reloadShell.position.set(-.018, -.012, -.095);
  reloadShell.rotation.set(.2, 0, 0);
  reloadShell.visible = false;
  rigHandL.add(reloadShell);

  // ---------- Кожаный погонный ремень от первого лица (всегда отчётливо виден в кадре слева-снизу под цевьём и колодкой) ----------
  const swivMat = steel;
  const strapLoopMat = new THREE.MeshStandardMaterial({ color: 0x4a321e, roughness: .78, metalness: .05 });
  const slA = new THREE.Group(), slB = new THREE.Group();
  // Передняя антабка на стволах перед левой рукой (z = -0.33 в hinge -> z_cam ≈ -0.66)
  slA.position.set(-.018, .008, -.33); hinge.add(slA);
  // Задний выход ремня у колодки/шейки приклада в видимой зоне экрана (z = -0.01 в gun -> z_cam ≈ -0.27)
  slB.position.set(-.022, -.026, -.01); gun.add(slB);
  [slA, slB].forEach(anchor => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.0035, .0035, .012, 8), swivMat);
    post.position.y = .004; anchor.add(post);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.009, .0024, 6, 12), swivMat);
    ring.rotation.y = Math.PI / 2; ring.position.y = -.002; anchor.add(ring);
    const loop = new THREE.Mesh(new THREE.BoxGeometry(.026, .016, .014), strapLoopMat);
    loop.position.y = -.006; anchor.add(loop);
  });
  // Задняя часть ремня вдоль левой стороны приклада к задней антабке
  { const rearStrap = new THREE.Mesh(new THREE.BoxGeometry(.008, .024, .28), strapLoopMat);
    rearStrap.position.set(-.024, -.052, .12);
    rearStrap.rotation.x = -.19;
    rearStrap.frustumCulled = false;
    gun.add(rearStrap); }
  const sling = new Rope(scene, { n: 14, length: .42, width: .024, thick: .007, color: 0x4a321e, follow: .94, sagMin: .022, sagMax: .036, sideCurve: -.016 });
  const wa = new THREE.Vector3(), wb = new THREE.Vector3();

  // ---------- Объёмная 3D-вспышка выстрела, искры и пороховой дым ----------
  const flashSideTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(36, 64, 4, 135, 64, 120);
    gr.addColorStop(0, 'rgba(255,255,240,1)');
    gr.addColorStop(.22, 'rgba(255,220,110,.95)');
    gr.addColorStop(.55, 'rgba(255,125,25,.65)');
    gr.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(8, 64); g.quadraticCurveTo(60, 8, 250, 42); g.lineTo(220, 64); g.lineTo(250, 86); g.quadraticCurveTo(60, 120, 8, 64); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const flashRingTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 60);
    gr.addColorStop(0, 'rgba(255,255,235,1)');
    gr.addColorStop(.32, 'rgba(255,200,90,.92)');
    gr.addColorStop(.68, 'rgba(255,110,20,.45)');
    gr.addColorStop(1, 'rgba(255,50,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();

  const flash = new THREE.Group(); flash.visible = false; muzzle.add(flash);
  const fRingMat = new THREE.MeshBasicMaterial({ map: flashRingTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const fSideMat = new THREE.MeshBasicMaterial({ map: flashSideTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const fDisc = new THREE.Mesh(new THREE.PlaneGeometry(.28, .28), fRingMat); fDisc.position.z = -.02; flash.add(fDisc);
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(.36, .18), fSideMat);
    p.rotation.y = Math.PI / 2;
    p.rotation.z = (i / 3) * Math.PI;
    p.position.z = -.16;
    flash.add(p);
  }

  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd268, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparkGeo = new THREE.BoxGeometry(.0035, .0035, .055);
  const sparks = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(sparkGeo, sparkMat.clone());
    m.visible = false; m.frustumCulled = false; scene.add(m);
    sparks.push({ m, life: 0, maxLife: .18, v: new THREE.Vector3() });
  }

  const smokeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 60);
    gr.addColorStop(0, 'rgba(215,212,206,.48)');
    gr.addColorStop(.45, 'rgba(185,182,176,.24)');
    gr.addColorStop(1, 'rgba(160,158,152,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const smokes = [];
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; s.frustumCulled = false; scene.add(s);
    smokes.push({ s, life: 0, maxLife: 1.4, grow: .22, v: new THREE.Vector3() });
  }
  const ejected = [mkShell(), mkShell()];
  ejected.forEach(e => { e.visible = false; e.frustumCulled = false; scene.add(e); e.userData.v = new THREE.Vector3(); });
  gun.traverse(o => { if (o.isMesh) o.frustumCulled = false; });

  // ---------- состояние и физика удержания/отдачи ----------
  const W = {
    state: 'holstered', t: 0, ammo: 2, reserve: 0,
    aimK: 0, wantAim: false,
    recoil: 0, recoilVel: 0, kick: 0,
    swayT: 0, lookLagX: 0, lookLagY: 0,
    barrelHeat: 0, wispTimer: 0,
  };
  const HIP = new THREE.Vector3(.125, -.092, -.265);
  const ADS = new THREE.Vector3(0, -.042, -.205);
  const DOWN = new THREE.Vector3(.18, -.42, -.22);
  const tmp = new THREE.Vector3(), wp = new THREE.Vector3(), bDir = new THREE.Vector3();

  function spawnSmoke(pos, vx, vy, vz, sc0, grow, maxLife) {
    const sm = smokes.find(x => x.life <= 0);
    if (!sm) return;
    sm.life = sm.maxLife = maxLife;
    sm.grow = grow;
    sm.s.visible = true;
    sm.s.position.copy(pos);
    sm.v.set(vx, vy, vz);
    sm.s.scale.setScalar(sc0);
    sm.s.material.rotation = Math.random() * Math.PI * 2;
  }

  function draw() {
    if (W.state === 'holstered') {
      W.state = 'drawing'; W.t = 0;
      audio && (audio.gunMove ? audio.gunMove() : audio.reloadClose());
      return true;
    }
    return false;
  }
  function holster() {
    if (W.state === 'idle' || W.state === 'aiming') {
      W.state = 'holstering'; W.t = 0; W.wantAim = false;
      audio && audio.gunMove && audio.gunMove();
      return true;
    }
    return false;
  }
  function toggle() { return W.state === 'holstered' ? draw() : holster(); }
  function aim(on) { W.wantAim = on; if (on && W.state === 'holstered') draw(); }

  function fire() {
    if (W.state !== 'idle' && W.state !== 'aiming') return 'busy';
    if (W.ammo <= 0) { audio && audio.click(900, .4); return 'empty'; }
    const barrelX = W.ammo === 2 ? -.0165 : .0165;
    muzzle.position.set(barrelX, .024, -.635);
    W.ammo--;
    chamberShells[W.ammo].visible = false;
    W.recoil = 1.0; W.recoilVel = 3.8; W.kick = 1.25;
    W.barrelHeat = Math.min(1.8, W.barrelHeat + .95);
    W.t = 0; W.lastState = W.state; W.state = 'firing';

    flash.visible = true;
    flash.rotation.z = Math.random() * Math.PI * 2;
    const fScale = .85 + Math.random() * .35;
    flash.scale.set(fScale, fScale, fScale);
    flashLight.intensity = 14;
    audio && audio.shot();

    rig.updateMatrixWorld(true);
    muzzle.getWorldPosition(wp);
    bDir.set(0, 0, -1).transformDirection(muzzle.matrixWorld).normalize();

    for (let i = 0; i < 8; i++) {
      const sp = 1.1 + i * .35 + Math.random() * .5;
      spawnSmoke(
        wp.clone().addScaledVector(bDir, i * .035),
        bDir.x * sp + (Math.random() - .5) * .32,
        bDir.y * sp + .14 + Math.random() * .22,
        bDir.z * sp + (Math.random() - .5) * .25,
        .055 + i * .014,
        .28 + Math.random() * .16,
        .9 + Math.random() * .65
      );
    }
    for (const spk of sparks) {
      spk.life = spk.maxLife = .09 + Math.random() * .09;
      spk.m.visible = true;
      spk.m.position.copy(wp);
      const speed = 7 + Math.random() * 9;
      spk.v.set(
        bDir.x * speed + (Math.random() - .5) * 2.2,
        bDir.y * speed + (Math.random() - .4) * 2.0,
        bDir.z * speed + (Math.random() - .5) * 1.5
      );
      spk.m.lookAt(wp.clone().add(spk.v));
    }

    onShot && onShot();
    return 'shot';
  }

  function reload() {
    if ((W.state !== 'idle' && W.state !== 'aiming') || W.ammo >= 2 || W.reserve <= 0) return false;
    W.state = 'reloading'; W.t = 0; W.wantAim = false; W.inserted = 0; W.ejectedDone = false; W.opened = false; W.closed = false;
    return true;
  }

  function update(dt, { moving = 0, sprint = false, aspect = 1, lookDX = 0, lookDY = 0 } = {}) {
    W.t += dt;
    W.swayT += dt * (1.2 + moving * 3.2 * (sprint ? 1.35 : 1));
    cam.aspect = aspect; cam.updateProjectionMatrix();

    if (W.state === 'drawing' && W.t > .45) { W.state = 'idle'; W.t = 0; }
    if (W.state === 'holstering' && W.t > .4) { W.state = 'holstered'; W.t = 0; }
    if (W.state === 'firing' && W.t > .38) { W.state = W.lastState === 'aiming' && W.wantAim ? 'aiming' : 'idle'; W.t = 0; }
    if (W.state === 'idle' && W.wantAim && !sprint) W.state = 'aiming';
    if (W.state === 'aiming' && (!W.wantAim || sprint)) W.state = 'idle';

    W.lookLagX = lerp(W.lookLagX, clamp(-lookDX * .00028, -.035, .035), Math.min(1, dt * 12));
    W.lookLagY = lerp(W.lookLagY, clamp(lookDY * .00028, -.03, .03), Math.min(1, dt * 12));

    let breakA = 0;
    reloadShell.visible = false;
    setLeftHandForeend();

    if (W.state === 'reloading') {
      const t = W.t, need = Math.min(2 - W.ammo, W.reserve);
      if (t < .35) breakA = ease(t / .35);
      else breakA = 1;

      if (t > .08 && !W.opened) { W.opened = true; audio && audio.reloadOpen(); }
      if (t > .36 && !W.ejectedDone) {
        W.ejectedDone = true;
        audio && audio.shellOut();
        rig.updateMatrixWorld(true);
        ejected.forEach((e, i) => {
          if (i >= 2 - W.ammo) return;
          e.visible = true;
          hinge.localToWorld(e.position.set(i ? .0165 : -.0165, .022, .01));
          e.userData.v.set((i ? .22 : .12) + Math.random() * .15, .68 + Math.random() * .22, .38);
          e.userData.life = 1.25;
          spawnSmoke(e.position, (Math.random() - .5) * .12, .18 + Math.random() * .1, .08, .035, .12, .85);
        });
      }
      const insT = [.88, 1.36];
      for (let i = 0; i < need; i++) {
        const ti = insT[i];
        if (t >= ti - .32 && t < ti + .12) {
          const u = (t - (ti - .32)) / .44;
          const arch = Math.sin(u * Math.PI);
          const slotX = (W.ammo + i) === 0 ? -.0165 : .0165;
          rigHandL.position.set(
            lerp(-.045, slotX - .01, ease(Math.min(1, u * 1.3))),
            lerp(-.14, .015, ease(Math.min(1, u * 1.3))) + arch * .025,
            lerp(.04, .035, u)
          );
          orientHand(rigHandL, new THREE.Vector3(-.28, -.62, .72), new THREE.Vector3(-.65, -.52, -.55), true);
          reloadShell.visible = u < .78;
        }
        if (t > ti && W.inserted <= i) {
          W.inserted = i + 1;
          const slot = W.ammo + i;
          chamberShells[slot].visible = true;
          W.reserve--;
          audio && audio.shellIn();
        }
      }
      const closeT = .88 + need * .46 + .18;
      if (t > closeT) breakA = 1 - ease(Math.min(1, (t - closeT) / .22));
      if (t > closeT + .05 && !W.closed) { W.closed = true; audio && audio.reloadClose(); W.recoil = .22; }
      if (t > closeT + .34) { W.ammo += W.inserted; W.state = 'idle'; W.t = 0; W.opened = W.closed = false; }
    }
    hinge.rotation.x = -breakA * .62;

    const triggerPull = W.state === 'firing' && W.t < .18;
    rigHandR.pose(triggerPull ? POSE_R_FIRE : POSE_R_IDLE, dt, 22, .004, W.swayT);
    rigHandL.pose(reloadShell.visible ? POSE_L_SHELL : POSE_L_FOREEND, dt, 18, .004, W.swayT);

    if (W.recoil > 0 || W.recoilVel !== 0) {
      W.recoil += W.recoilVel * dt;
      W.recoilVel -= (W.recoil * 42 + W.recoilVel * 9.5) * dt;
      if (W.recoil < 0 && Math.abs(W.recoilVel) < .05) { W.recoil = 0; W.recoilVel = 0; }
      W.recoil = Math.max(-.04, W.recoil);
    }

    const drawn = W.state === 'drawing' ? ease(W.t / .45) : W.state === 'holstering' ? 1 - ease(W.t / .4) : W.state === 'holstered' ? 0 : 1;
    W.aimK = lerp(W.aimK, W.state === 'aiming' || (W.state === 'firing' && W.lastState === 'aiming') ? 1 : 0, Math.min(1, dt * 11));
    tmp.copy(HIP).lerp(ADS, W.aimK);
    if (W.state === 'reloading') tmp.add(new THREE.Vector3(-.038, -.025, .035));
    tmp.lerp(DOWN, 1 - drawn);

    const swayA = (1 - W.aimK * .82) * (.35 + moving * 1.45);
    tmp.x += Math.sin(W.swayT * 1.0) * .0045 * swayA + (sprint ? Math.sin(W.swayT * 1.6) * .018 : 0) + W.lookLagX;
    tmp.y += Math.sin(W.swayT * 2.0) * .0035 * swayA - Math.abs(Math.sin(W.swayT * 1.8)) * moving * .010 + W.lookLagY;

    const rec = Math.max(0, W.recoil);
    tmp.z += rec * (.072 - W.aimK * .022);
    tmp.y += rec * .016;
    rig.position.copy(tmp);

    const pitchRec = rec * (.32 - W.aimK * .10);
    const yawBase = (1 - W.aimK) * .11 + (sprint ? .42 : 0) + W.lookLagX * 1.4;
    const pitchBase = (1 - drawn) * -.85 + (W.state === 'reloading' ? .26 + breakA * .10 : 0) + (sprint ? -.22 : 0) + (1 - W.aimK) * .025 + W.lookLagY * 1.2;
    const rollBase = (W.state === 'reloading' ? .34 : -.04 * (1 - W.aimK)) + (sprint ? .18 : 0) - rec * .07;
    rig.rotation.set(pitchBase + pitchRec, yawBase, rollBase);
    rig.visible = W.state !== 'holstered';

    if (flash.visible && W.t > .055) flash.visible = false;
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 160);
    if (rig.visible) muzzle.getWorldPosition(flashLight.position);

    if (W.barrelHeat > 0) {
      W.barrelHeat = Math.max(0, W.barrelHeat - dt * .55);
      W.wispTimer -= dt;
      if (W.wispTimer <= 0 && rig.visible && W.state !== 'holstered') {
        W.wispTimer = .09;
        muzzle.getWorldPosition(wp);
        spawnSmoke(wp, (Math.random() - .5) * .04, .14 + Math.random() * .08, (Math.random() - .5) * .04, .018, .085, .65);
      }
    }

    for (const sm of smokes) if (sm.life > 0) {
      sm.life -= dt;
      sm.s.position.addScaledVector(sm.v, dt);
      sm.v.multiplyScalar(Math.max(0, 1 - dt * 2.4));
      sm.v.y += .18 * dt;
      sm.s.scale.addScalar(sm.grow * dt);
      const u = 1 - sm.life / sm.maxLife;
      const fadeIn = Math.min(1, u * 6);
      const fadeOut = Math.pow(Math.max(0, sm.life / sm.maxLife), 1.3);
      sm.s.material.opacity = .32 * fadeIn * fadeOut;
      if (sm.life <= 0) sm.s.visible = false;
    }
    for (const spk of sparks) if (spk.life > 0) {
      spk.life -= dt;
      spk.v.y -= 6.5 * dt;
      spk.m.position.addScaledVector(spk.v, dt);
      spk.m.material.opacity = Math.max(0, spk.life / spk.maxLife);
      if (spk.life <= 0) spk.m.visible = false;
    }
    for (const e of ejected) if (e.visible) {
      e.userData.life -= dt;
      e.userData.v.y -= 9.8 * dt;
      e.position.addScaledVector(e.userData.v, dt);
      e.rotation.x += dt * 14; e.rotation.z += dt * 8;
      if (e.userData.life <= 0) e.visible = false;
    }
    W.kick = Math.max(0, W.kick - dt * 6.5);
    slingTick(dt);
  }

  // ---------- Подключение 3D-модели двустволки (gun.glb) с разделением на стволы (на шарнире) и приклад/колодку ----------
  function splitGunGeometry(geo, zSplit) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const pos = g.attributes.position, nTris = pos.count / 3;
    const stockTris = [], barrelTris = [];
    for (let t = 0; t < nTris; t++) {
      const i0 = t * 3;
      const cz = (pos.getZ(i0) + pos.getZ(i0 + 1) + pos.getZ(i0 + 2)) / 3;
      if (cz < zSplit) barrelTris.push(t);
      else stockTris.push(t);
    }
    const buildSub = tris => {
      const sub = new THREE.BufferGeometry();
      for (const name of Object.keys(g.attributes)) {
        const a = g.attributes[name], itemSize = a.itemSize;
        const arr = new Float32Array(tris.length * 3 * itemSize);
        for (let k = 0; k < tris.length; k++) {
          const base = tris[k] * 3 * itemSize;
          for (let j = 0; j < 3 * itemSize; j++) arr[k * 3 * itemSize + j] = a.array[base + j];
        }
        sub.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
      }
      return sub;
    };
    return { stockGeo: buildSub(stockTris), barrelGeo: buildSub(barrelTris) };
  }

  function setModel(model) {
    procParts.forEach(o => { o.visible = false; });
    let srcMesh = null;
    model.traverse(o => { if (o.isMesh && !srcMesh) srcMesh = o; });
    const zOffset = .435, yOffset = -.022;
    if (srcMesh && srcMesh.geometry) {
      const { stockGeo, barrelGeo } = splitGunGeometry(srcMesh.geometry, -.490);
      const stockMesh = new THREE.Mesh(stockGeo, srcMesh.material);
      stockMesh.position.set(0, yOffset, zOffset);
      stockMesh.frustumCulled = false;
      gun.add(stockMesh);

      const barrelMesh = new THREE.Mesh(barrelGeo, srcMesh.material);
      barrelMesh.position.set(0, yOffset - hinge.position.y, zOffset - hinge.position.z);
      barrelMesh.frustumCulled = false;
      hinge.add(barrelMesh);
    } else {
      const holder = new THREE.Group();
      holder.position.set(0, yOffset, zOffset);
      model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
      holder.add(model);
      gun.add(holder);
    }
  }

  function slingTick(dt) {
    if (!sling) return;
    sling.visible = rig.visible;
    if (!rig.visible) { sling.reset(); return; }
    rig.updateMatrixWorld(true);
    slA.getWorldPosition(wa);
    slB.getWorldPosition(wb);
    sling.update(wa, wb, dt);
  }

  return {
    lights: { hemi, key, localLight },
    setModel, slingTick,
    scene, cam, update, draw, holster, toggle, aim, fire, reload,
    get state() { return W.state; },
    get drawn() { return W.state !== 'holstered' && W.state !== 'holstering'; },
    get aiming() { return W.aimK > .6; },
    get aimK() { return W.aimK; },
    get ammo() { return W.ammo; },
    get reserve() { return W.reserve; },
    set reserve(v) { W.reserve = v; },
    set ammo(v) { W.ammo = v; chamberShells.forEach((s, i) => s.visible = i < v); },
    get kick() { return W.kick; },
  };
}
