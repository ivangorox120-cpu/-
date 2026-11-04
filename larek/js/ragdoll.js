// Ragdoll на verlet-частицах: точки тела берутся из текущей позы скелета Human,
// дальше — гравитация, связи-«кости», земля и коллайдеры; результат обратно раскладывается на суставы.
import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _m = new THREE.Matrix4();
// индексы частиц
const PELV = 0, CHEST = 1, HEAD = 2, HIPL = 3, HIPR = 4, KNL = 5, KNR = 6, FTL = 7, FTR = 8, SHL = 9, SHR = 10, ELL = 11, ELR = 12, HDL = 13, HDR = 14;
const TORSO = [PELV, CHEST, HIPL, HIPR, SHL, SHR];

export class Ragdoll {
  // h — Human; impulse — вектор удара (м/с); hitY — высота попадания; blocked(x,z) — препятствия
  constructor(h, impulse, hitY, blocked) {
    this.h = h; this.blocked = blocked; this.t = 0; this.sleep = 0;
    const R = h.R; h.obj.updateMatrixWorld(true);
    const wp = (o, y = 0) => o.localToWorld(new THREE.Vector3(0, y, 0));
    const shin = R.knL.position.length() || .45, fore = R.elL.position.length() || .3;
    this.p = [wp(R.hips), wp(R.neck), wp(R.head, .12), wp(R.thL), wp(R.thR), wp(R.knL), wp(R.knR), wp(R.knL, -shin), wp(R.knR, -shin), wp(R.shL), wp(R.shR), wp(R.elL), wp(R.elR), wp(R.elL, -fore), wp(R.elR, -fore)];
    this.o = this.p.map(v => v.clone());
    // удар: сильнее у частиц около точки попадания, тело валится назад, ноги «подсекает»
    this.p.forEach((v, i) => { const k = 1 / (1 + Math.abs(v.y - hitY) * 2.2) * (i === FTL || i === FTR ? .2 : 1); this.o[i].addScaledVector(impulse, -k / 60); });
    const C = [];
    const link = (a, b, stiff = 1) => C.push([a, b, this.p[a].distanceTo(this.p[b]), stiff]);
    for (let i = 0; i < TORSO.length; i++) for (let j = i + 1; j < TORSO.length; j++) link(TORSO[i], TORSO[j]); // жёсткий корпус
    link(CHEST, HEAD); link(SHL, HEAD, .5); link(SHR, HEAD, .5);
    link(HIPL, KNL); link(KNL, FTL); link(HIPR, KNR); link(KNR, FTR);
    link(SHL, ELL); link(ELL, HDL); link(SHR, ELR); link(ELR, HDR);
    this.C = C;
    this.minD = [[FTL, PELV, .35], [FTR, PELV, .35], [HDL, CHEST, .2], [HDR, CHEST, .2], [FTL, FTR, .12], [HEAD, PELV, .5]]; // колени не выворачиваются в корпус
    this.shin = shin; this.fore = fore;
    // окончательно выключаем анимацию суставов
    R.body.position.set(0, 0, 0); R.body.rotation.set(0, 0, 0);
  }
  step(dt) {
    this.t += dt; if (this.sleep > 1.5) return false;
    const n = Math.max(1, Math.ceil(dt / (1 / 60))), h = Math.min(dt, .05) / n, P = this.p, O = this.o;
    let moved = 0;
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < P.length; i++) {
        const p = P[i], o = O[i]; _v.subVectors(p, o).multiplyScalar(p.y < .06 ? .82 : .995); // трение о снег
        o.copy(p); p.add(_v); p.y -= 9.8 * h * h; moved += _v.lengthSq();
      }
      for (let it = 0; it < 6; it++) {
        for (const [a, b, d, k] of this.C) { const A = P[a], B = P[b]; _a.subVectors(B, A); const L = _a.length() || 1e-4, diff = (L - d) / L * .5 * k; A.addScaledVector(_a, diff); B.addScaledVector(_a, -diff); }
        for (const [a, b, d] of this.minD) { const A = P[a], B = P[b]; _a.subVectors(B, A); const L = _a.length() || 1e-4; if (L < d) { const diff = (L - d) / L * .5; A.addScaledVector(_a, diff); B.addScaledVector(_a, -diff); } }
        for (let i = 0; i < P.length; i++) { const p = P[i], r = i === HEAD ? .11 : i === PELV || i === CHEST ? .12 : .06; if (p.y < r) p.y = r;
          if (this.blocked && this.blocked(p.x, p.z) && !this.blocked(O[i].x, O[i].z)) { p.x = O[i].x; p.z = O[i].z; } }
      }
    }
    this.sleep = moved / n < 1e-7 ? this.sleep + dt : 0;
    this.apply(); return true;
  }
  apply() {
    const R = this.h.R, P = this.p, obj = this.h.obj;
    // ориентация корпуса: X — от правого бедра к левому, Y — к груди
    const up = _a.subVectors(P[CHEST], P[PELV]).normalize(), right = _b.subVectors(P[HIPL], P[HIPR]).add(_v.subVectors(P[SHL], P[SHR])).normalize();
    right.addScaledVector(up, -right.dot(up)).normalize(); const fwd = new THREE.Vector3().crossVectors(right, up);
    _m.makeBasis(right, up, fwd); const Q = new THREE.Quaternion().setFromRotationMatrix(_m);
    obj.quaternion.copy(Q); if (obj.parent) obj.quaternion.premultiply(obj.parent.getWorldQuaternion(_pq).invert());
    R.hips.rotation.set(0, 0, 0); R.spine.rotation.set(0, 0, 0);
    const hipOff = new THREE.Vector3().copy(R.hips.position).add(R.body.position).applyQuaternion(Q);
    obj.position.copy(P[PELV]).sub(hipOff); if (obj.parent) obj.parent.worldToLocal(obj.position);
    obj.updateMatrixWorld(true);
    const bone = (j, from, to) => { const o = R[j]; if (!o) return; o.parent.getWorldQuaternion(_pq); _v.subVectors(P[to], P[from]).normalize(); _q.setFromUnitVectors(DOWN, _v); o.quaternion.copy(_pq.invert().multiply(_q)); o.updateMatrixWorld(true); };
    bone('thL', HIPL, KNL); bone('knL', KNL, FTL); bone('thR', HIPR, KNR); bone('knR', KNR, FTR);
    bone('shL', SHL, ELL); bone('elL', ELL, HDL); bone('shR', SHR, ELR); bone('elR', ELR, HDR);
    if (R.neck) { R.neck.getWorldQuaternion(_pq); R.neck.parent.getWorldQuaternion(_pq); _v.subVectors(P[HEAD], P[CHEST]).normalize(); _q.setFromUnitVectors(UP, _v); R.neck.quaternion.copy(_pq.invert().multiply(_q)); if (R.head) R.head.rotation.set(0, 0, 0); }
  }
  // плавное исчезновение: материалы клонируются, чтобы не трогать общих
  startFade() {
    if (this.fadeMats) return; this.fadeMats = [];
    this.h.obj.traverse(o => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; const cl = ms.map(m => { const c = m.clone(); c.transparent = true; c.depthWrite = false; this.fadeMats.push(c); return c; }); o.material = Array.isArray(o.material) ? cl : cl[0]; o.castShadow = false; });
  }
  setFade(a) { for (const m of this.fadeMats || []) m.opacity = a; }
  dispose() { for (const m of this.fadeMats || []) m.dispose(); }
}
