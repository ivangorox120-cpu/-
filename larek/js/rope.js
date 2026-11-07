// Упрощённый «мягкий» ремень: цепочка точек (интегрирование Верле) с ограничениями длины,
// переносом инерции при движении оружия в руках и натяжением на гвозде на стене.
import * as THREE from 'three';

export class Rope {
  constructor(parent, { n = 14, length = .44, width = .024, thick = .007, color = 0x4a321e, follow = 0, sagMin = 0, sagMax = .042, sideCurve = 0 } = {}) {
    this.n = n; this.seg = length / (n - 1);
    this.follow = follow;
    this.sagMin = sagMin;
    this.sagMax = sagMax;
    this.sideCurve = sideCurve;
    this.p = Array.from({ length: n }, () => new THREE.Vector3());
    this.o = Array.from({ length: n }, () => new THREE.Vector3());
    this.prevA = new THREE.Vector3();
    this.prevB = new THREE.Vector3();
    this.inited = false;
    const geo = new THREE.BoxGeometry(width, thick, 1); geo.translate(0, 0, .5);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: .78, metalness: .05 }), n - 1);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; parent.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1);
    this._d = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
    this._da = new THREE.Vector3(); this._db = new THREE.Vector3();
  }
  // a, b — концы ремня (в координатах родителя); floorY — ниже не опускается; pin — точка гвоздя, на котором висит ремень посредине
  update(a, b, dt, floorY = -1e9, pin = null) {
    const p = this.p, o = this.o, n = this.n, mid = Math.floor(n / 2);
    // Когда ружьё висит на гвозде (pin), ремень натянут под весом ружья от передней и задней антабок прямо к гвоздю без провисания сквозь стволы
    if (pin) {
      for (let i = 0; i < n; i++) {
        if (i <= mid) {
          const u = i / mid;
          p[i].lerpVectors(a, pin, u);
          p[i].y -= Math.sin(u * Math.PI) * .0025;
        } else {
          const u = (i - mid) / (n - 1 - mid);
          p[i].lerpVectors(pin, b, u);
          p[i].y -= Math.sin(u * Math.PI) * .0025;
        }
        o[i].copy(p[i]);
      }
      this.inited = true;
      for (let i = 0; i < n - 1; i++) {
        const d = this._d.subVectors(p[i + 1], p[i]), L = d.length();
        this._q.setFromUnitVectors(this._z, d.normalize()); this._s.set(1, 1, Math.max(L, .001));
        this._m.compose(p[i], this._q, this._s); this.mesh.setMatrixAt(i, this._m);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      return;
    }

    if (!this.inited) {
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), s = Math.sin(t * Math.PI);
        p[i].lerpVectors(a, b, t);
        p[i].y -= s * Math.max(.028, this.sagMin);
        p[i].x += s * this.sideCurve;
        o[i].copy(p[i]);
      }
      this.prevA.copy(a);
      this.prevB.copy(b);
      this.inited = true;
    } else if (this.follow > 0) {
      this._da.subVectors(a, this.prevA);
      this._db.subVectors(b, this.prevB);
      if (this._da.lengthSq() + this._db.lengthSq() > .25) {
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1), s = Math.sin(t * Math.PI);
          p[i].lerpVectors(a, b, t);
          p[i].y -= s * Math.max(.028, this.sagMin);
          p[i].x += s * this.sideCurve;
          o[i].copy(p[i]);
        }
      } else {
        for (let i = 1; i < n - 1; i++) {
          const t = i / (n - 1);
          const dx = (this._da.x * (1 - t) + this._db.x * t) * this.follow;
          const dy = (this._da.y * (1 - t) + this._db.y * t) * this.follow;
          const dz = (this._da.z * (1 - t) + this._db.z * t) * this.follow;
          p[i].x += dx; p[i].y += dy; p[i].z += dz;
          o[i].x += dx; o[i].y += dy; o[i].z += dz;
        }
      }
    }
    this.prevA.copy(a);
    this.prevB.copy(b);

    const stepDt = Math.min(dt, .033);
    const g = -6.5 * stepDt * stepDt, damp = .92;
    for (let i = 1; i < n - 1; i++) {
      const v = this._d.subVectors(p[i], o[i]).multiplyScalar(damp);
      o[i].copy(p[i]); p[i].add(v); p[i].y += g;
      if (p[i].y < floorY) p[i].y = floorY;
    }
    p[0].copy(a); p[n - 1].copy(b);
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < n - 1; i++) {
        const d = this._d.subVectors(p[i + 1], p[i]), L = d.length() || 1e-6, diff = (L - this.seg) / L;
        const p0Fixed = i === 0, p1Fixed = i + 1 === n - 1;
        if (p0Fixed) p[i + 1].addScaledVector(d, -diff);
        else if (p1Fixed) p[i].addScaledVector(d, diff);
        else { p[i].addScaledVector(d, diff * .5); p[i + 1].addScaledVector(d, -diff * .5); }
      }
      if (this.sagMin > 0) {
        for (let i = 1; i < n - 1; i++) {
          const t = i / (n - 1), s = Math.sin(t * Math.PI);
          const lineY = a.y * (1 - t) + b.y * t;
          const lineX = a.x * (1 - t) + b.x * t;
          const maxY = lineY - s * this.sagMin;
          const minY = lineY - s * this.sagMax;
          if (p[i].y > maxY) { p[i].y = maxY; if (o[i].y > maxY) o[i].y = maxY; }
          if (p[i].y < minY) { p[i].y = minY; if (o[i].y < minY) o[i].y = minY; }
          if (this.sideCurve !== 0) {
            const targetX = lineX + s * this.sideCurve;
            p[i].x += (targetX - p[i].x) * .25;
          }
        }
      }
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
