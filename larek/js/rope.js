// Упрощённый «мягкий» ремень: цепочка точек (интегрирование Верле) с ограничениями длины.
// Дёшево: 10–12 точек, 3 итерации ограничений, рисуется инстансами плоских сегментов.
import * as THREE from 'three';

export class Rope {
  constructor(parent, { n = 12, length = .7, width = .03, thick = .004, color = 0x3a2a1c } = {}) {
    this.n = n; this.seg = length / (n - 1);
    this.p = Array.from({ length: n }, () => new THREE.Vector3());
    this.o = Array.from({ length: n }, () => new THREE.Vector3());
    this.inited = false;
    const geo = new THREE.BoxGeometry(width, thick, 1); geo.translate(0, 0, .5);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: .85 }), n - 1);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; parent.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1); this._d = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
  }
  // a, b — концы ремня (в координатах родителя); floorY — ниже не опускается
  update(a, b, dt, floorY = -1e9) {
    const p = this.p, o = this.o, n = this.n;
    if (!this.inited) { for (let i = 0; i < n; i++) { p[i].lerpVectors(a, b, i / (n - 1)); p[i].y -= Math.sin(i / (n - 1) * Math.PI) * .2; o[i].copy(p[i]); } this.inited = true; }
    const g = -9.8 * dt * dt, damp = .985;
    for (let i = 1; i < n - 1; i++) { const v = this._d.subVectors(p[i], o[i]).multiplyScalar(damp); o[i].copy(p[i]); p[i].add(v); p[i].y += g; if (p[i].y < floorY) p[i].y = floorY; }
    p[0].copy(a); p[n - 1].copy(b);
    for (let it = 0; it < 4; it++) for (let i = 0; i < n - 1; i++) {
      const d = this._d.subVectors(p[i + 1], p[i]), L = d.length() || 1e-6, diff = (L - this.seg) / L;
      if (i === 0) p[i + 1].addScaledVector(d, -diff); else if (i + 1 === n - 1) p[i].addScaledVector(d, diff);
      else { p[i].addScaledVector(d, diff * .5); p[i + 1].addScaledVector(d, -diff * .5); }
    }
    for (let i = 0; i < n - 1; i++) {
      const d = this._d.subVectors(p[i + 1], p[i]), L = d.length();
      this._q.setFromUnitVectors(this._z, d.normalize()); this._s.set(1, 1, Math.max(L, .001));
      this._m.compose(p[i], this._q, this._s); this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  reset() { this.inited = false; }
  set visible(v) { this.mesh.visible = v; }
}
