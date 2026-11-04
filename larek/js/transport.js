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
  // корпус: нижняя часть, оконная лента, крыша; ось X — вдоль автобуса (нос в +X)
  B(L, 1.05, Wd, bodyM, 0, .95, 0); B(L, .12, Wd + .02, stripeM, 0, 1.45, 0);
  B(L, .95, .06, glassM, 0, 1.98, Wd / 2 - .03); B(L, .95, .06, glassM, 0, 1.98, -Wd / 2 + .03);
  for (let x = -L / 2 + .3; x <= L / 2 - .3; x += 1.1) { B(.08, .95, Wd + .03, bodyM, x, 1.98, 0); }
  B(L, .5, Wd, bodyM, 0, 2.7, 0); const roofTop = new THREE.Mesh(new THREE.CylinderGeometry(Wd / 2, Wd / 2, L, 16, 1, false, 0, Math.PI), bodyM); roofTop.rotation.z = Math.PI / 2; roofTop.rotation.y = Math.PI / 2; roofTop.scale.set(1, 1, .22); roofTop.position.y = 2.93; bus.add(roofTop);
  B(.06, 1.0, Wd - .2, glassM, L / 2 + .01, 1.95, 0); B(.06, .9, Wd - .2, glassM, -L / 2 - .01, 2.0, 0);
  B(.2, .25, Wd + .1, std({ color: 0x777777, metalness: .8, roughness: .3 }), L / 2 + .05, .5, 0); B(.2, .25, Wd + .1, std({ color: 0x777777, metalness: .8, roughness: .3 }), -L / 2 - .05, .5, 0);
  const hl = std({ color: 0xffffee, emissive: 0xfff2c0, emissiveIntensity: 0 }); for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .05, 14), hl); h.rotation.z = Math.PI / 2; h.position.set(L / 2 + .04, .75, s * .9); bus.add(h); }
  const tl = std({ color: 0x8a1a12, emissive: 0xff2a10, emissiveIntensity: .3 }); for (const s of [-1, 1]) B(.05, .2, .25, tl, -L / 2 - .03, .8, s * .95);
  // табличка маршрута
  const plate = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#f2ead0'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#1a1a1a'; g.font = '900 34px Arial'; g.fillText('7', 12, 46); g.font = '700 18px Arial'; g.fillText('ЗАВОД — РЫНОК', 52, 40); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .35), std({ map: plate })); pl.position.set(L / 2 + .05, 2.6, 0); pl.rotation.y = Math.PI / 2; bus.add(pl);
  // колёса (вращаются)
  const wheels = []; for (const x of [-3.2, 3.4]) for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .32, 16), darkM); w.rotation.x = Math.PI / 2; w.position.set(x, .5, s * (Wd / 2 - .1)); bus.add(w); wheels.push(w); }
  // двери справа (сторона −Z при движении в −X, т.е. к тротуару): две створки-гармошки
  const doorsSide = -1; // локальная сторона дверей
  const doors = [];
  for (const dx of [3.6, -.6]) { const pair = []; for (const s of [-1, 1]) { const d = B(.55, 2.0, .05, glassM, dx + s * .28, 1.4, doorsSide * (Wd / 2 + .01)); pair.push({ m: d, base: d.position.x, s }); } doors.push({ x: dx, pair }); }
  // салон
  const floor = B(L - .4, .05, Wd - .2, std({ color: 0x4a3a2a, roughness: .9 }), 0, .55, 0);
  const seatM = std({ color: 0x8a2a22, roughness: .7 });
  for (let x = -4.4; x <= 2.6; x += 1.0) for (const s of [-1, 1]) { if (s === doorsSide && Math.abs(x + .6) < .7) continue; B(.45, .1, .9, seatM, x, 1.0, s * .65); B(.08, .55, .9, seatM, x - .22, 1.3, s * .65); }
  for (let x = -4; x <= 4; x += 2) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 2.2, 8), std({ color: 0xc0c0c0, metalness: .9, roughness: .2 })); pole.position.set(x, 1.65, 0); bus.add(pole); }
  const lamp = new THREE.PointLight(0xffe8c0, 0, 7, 2); lamp.position.set(0, 2.6, 0); bus.add(lamp);
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
    let ahead = 1e9, key = null; for (const [k, s0] of Object.entries(stopS)) { const ds = ((s0 - B_.s) % routeLen + routeLen) % routeLen; if (ds < ahead && !(B_.served[k] && ds > routeLen - 30)) { ahead = ds; key = k; } }
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
    const night = env.night(); hl.emissiveIntensity = night ? 3 : 0; lamp.intensity = night || rider ? 6 : 0;
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
    tick, board, alight, canBoard, canAlight, get riding() { return !!rider; }, get rider() { return rider; },
    get stopKey() { return B_.stop; }, get state() { return B_.state; }, obstacle: () => ({ x: bus.position.x, z: bus.position.z, heading: B_.heading, hx: L / 2 + .3, hz: Wd / 2 + .2, v: B_.v }),
    doorWorld, bus, nextStopName() { const k = B_.stop || Object.keys(STOPS).find(k => !B_.served[k]); return k ? STOPS[k].name : ''; },
  };
}
