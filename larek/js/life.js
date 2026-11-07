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

  // ================= поверхности, на которые можно ставить (включая все 4 задние полки SH_BACK и все 3 боковые полки SH_SIDE справа от окна) =================
  const SURF = [
    { name: 'floor',   y: .035,  x1: -KW + .08, x2: KW - .08,  z1: -KD + .08, z2: KD - .50 },
    { name: 'counter', y: 1.005, x1: -1.42,     x2: 1.42,      z1: KD - .44,  z2: KD - .02 },
    // 4 задние полки (SH_BACK = 0.75, 1.20, 1.65, 2.05)
    { name: 'shelf',   y: .763,  x1: -1.14,     x2: .27,       z1: -KD + .02, z2: -KD + .33, axis: 'x', rowIdx: 0 },
    { name: 'shelf',   y: 1.213, x1: -1.14,     x2: .27,       z1: -KD + .02, z2: -KD + .33, axis: 'x', rowIdx: 1 },
    { name: 'shelf',   y: 1.663, x1: -1.14,     x2: .27,       z1: -KD + .02, z2: -KD + .33, axis: 'x', rowIdx: 2 },
    { name: 'shelf',   y: 2.063, x1: -1.14,     x2: .27,       z1: -KD + .02, z2: -KD + .33, axis: 'x', rowIdx: 3 },
    // 3 боковые полки справа от окна ларька (SH_SIDE = 0.85, 1.30, 1.75)
    { name: 'shelf',   y: .863,  x1: -KW + .02, x2: -KW + .33, z1: -.78,      z2: .38,       axis: 'z', rowIdx: 4 },
    { name: 'shelf',   y: 1.313, x1: -KW + .02, x2: -KW + .33, z1: -.42,      z2: .38,       axis: 'z', rowIdx: 5 },
    { name: 'shelf',   y: 1.763, x1: -KW + .02, x2: -KW + .33, z1: -.78,      z2: .38,       axis: 'z', rowIdx: 6 },
    // 4 стеклянные полки витрины над прилавком у окна (левая и правая стороны, нижний и верхний ярусы)
    // ниша под прилавком (товар «из-под полы»)
    { name: 'shelf',   y: .42,   x1: -.52,      x2: .52,       z1: KD - .42,  z2: KD - .08,  axis: 'x', rowIdx: 7 },
    { name: 'shelf',   y: 1.368, x1: -1.33,     x2: -.47,      z1: KD - .32,  z2: KD - .02,  axis: 'x', rowIdx: 17 },
    { name: 'shelf',   y: 1.768, x1: -1.33,     x2: -.47,      z1: KD - .32,  z2: KD - .02,  axis: 'x', rowIdx: 18 },
    { name: 'shelf',   y: 1.368, x1: .47,      x2: 1.33,       z1: KD - .32,  z2: KD - .02,  axis: 'x', rowIdx: 19 },
    { name: 'shelf',   y: 1.768, x1: .47,      x2: 1.33,       z1: KD - .32,  z2: KD - .02,  axis: 'x', rowIdx: 20 },
  ];
  const _surfBox = new THREE.Box3(), _surfHit = new THREE.Vector3();
  const inK = (x, z) => Math.abs(x) < KW && Math.abs(z) < KD;
  // Проверка попадания точки (x, z) внутрь открытой коробки (с учётом поворота коробки)
  function pointInBox(x, z, box, margin = .015) {
    const dx = x - box.obj.position.x, dz = z - box.obj.position.z;
    const c = Math.cos(box.obj.rotation.y), s = Math.sin(box.obj.rotation.y);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return {
      inside: Math.abs(lx) < box.half.x - margin && Math.abs(lz) < box.half.z - margin,
      lx, lz, c, s
    };
  }
  function findOpenBoxAt(x, z, y = 0, ignore = null) {
    for (const it of items) {
      if (it === ignore || it.kind !== "box" || !it.data.opened || it.state !== "rest") continue;
      if (y < it.obj.position.y - .05 || y > it.obj.position.y + it.half.y * 2 + .25) continue;
      if (pointInBox(x, z, it, .01).inside) return it;
    }
    return null;
  }
  function groundHeightAt(x, z) {
    if (inK(x, z)) return .035;
    if ((z > 1.2 && z < 6.2) || (z > 14.2 && z < 19.0)) return .026;
    return .022;
  }
  function itemWorldHalf(it, customYaw = null) {
    const ry = customYaw != null ? customYaw : (it && it.obj ? it.obj.rotation.y : 0);
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    const hx0 = (it && it.half && it.half.x) || .05;
    const hz0 = (it && it.half && it.half.z) || .05;
    const hy0 = (it && it.half && it.half.y) || .04;
    return {
      hx: hx0 * c + hz0 * s,
      hz: hx0 * s + hz0 * c,
      hy: hy0,
      h: hy0 * 2
    };
  }
  function shelfPlacementObstacle(p) {
    const gp = GOOD_PHYS[p.id] || GOOD_PHYS.cig;
    const hx0 = gp.r || gp.hx || .045;
    const hz0 = gp.r || gp.hz || .045;
    const h = gp.shape === 'bottle' ? gp.h : gp.shape === 'can' ? gp.h : (gp.hy * 2);
    const ry = p.ry || 0;
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    return {
      isShelfPlacement: true,
      id: p.id,
      uid: p.uid,
      x: p.x,
      y: p.y,
      z: p.z,
      ry,
      hx: hx0 * c + hz0 * s,
      hz: hx0 * s + hz0 * c,
      hy: h * .5,
      h,
      stack: gp.shape !== 'bottle'
    };
  }
  function getAllObstacles(ignoreItem = null) {
    const out = [];
    for (const o of items) {
      // Никогда не учитываем предметы, лежащие внутри открытой коробки (o.inBoxId), как внешние препятствия или опору!
      if (o === ignoreItem || o.state !== "rest" || o.inBoxId) continue;
      const ext = itemWorldHalf(o);
      const isBottlePack = o.kind === "pack" && ["vodka", "beer", "samogon", "soda"].includes(o.data && o.data.goodId);
      out.push({
        isShelfPlacement: false,
        itemRef: o,
        kind: o.kind,
        id: (o.data && o.data.goodId) || o.kind,
        x: o.obj.position.x,
        y: o.obj.position.y,
        z: o.obj.position.z,
        ry: o.obj.rotation.y,
        hx: ext.hx,
        hz: ext.hz,
        hy: ext.hy,
        h: ext.h,
        stack: !!(o.stack && !isBottlePack)
      });
    }
    const s = S();
    if (s && Array.isArray(s.shelfPlacements)) {
      for (const p of s.shelfPlacements) {
        out.push(shelfPlacementObstacle(p));
      }
    }
    return out;
  }
  function canStackHeldOnBase(heldItem, hExt, baseObs) {
    if (!baseObs || !baseObs.stack) return false;
    if (heldItem.kind === "box") {
      return baseObs.kind === "box";
    }
    if (baseObs.kind === "box") {
      if (heldItem.kind === "bottle" || (heldItem.kind === "good" && heldItem.goodPhys && heldItem.goodPhys.shape === "bottle")) return false;
      return true;
    }
    if (heldItem.kind === "bottle") return false;
    if (heldItem.kind === "good" && heldItem.goodPhys && heldItem.goodPhys.shape === "bottle") return false;
    if (heldItem.kind === "pack") {
      return baseObs.kind === "pack" && (hExt.hx <= baseObs.hx + .035 && hExt.hz <= baseObs.hz + .035);
    }
    const hGid = heldItem.data && heldItem.data.goodId;
    if (baseObs.id === hGid) return true;
    return (hExt.hx <= baseObs.hx + .02 && hExt.hz <= baseObs.hz + .02);
  }
  // Разрешение наложений и вертикальное складывание стопкой («вверх по одной») с учётом И предметов life.items, И товаров на полках S.shelfPlacements
  function resolveItemSpot(x, y, z, heldItem, surf = null) {
    if (!heldItem) return { x, y, z, blocked: false };
    const hExt = itemWorldHalf(heldItem, surf && surf.axis === 'z' ? Math.PI / 2 : surf && surf.axis === 'x' ? 0 : (P.yaw + heldYaw));
    let curX = x, curY = y, curZ = z;
    const obstacles = getAllObstacles(heldItem);

    if (inK(curX, curZ)) {
      const wallPadX = Math.min(.48, hExt.hx + .03);
      const wallPadZ = Math.min(.48, hExt.hz + .03);
      curX = clamp(curX, -KW + wallPadX, KW - wallPadX);
      curZ = clamp(curZ, -KD + wallPadZ, KD - wallPadZ);
    }
    const collidesAt = (tx, ty, tz) => {
      if (inK(tx, tz)) {
        if (tx - hExt.hx < -KW + .02 || tx + hExt.hx > KW - .02 || tz - hExt.hz < -KD + .02 || tz + hExt.hz > KD - .02) return { wall: true };
      }
      return obstacles.find(o => {
        const vertHit = (ty < o.y + o.h - .004) && (ty + hExt.h > o.y + .004);
        if (!vertHit) return false;
        const dx = Math.abs(tx - o.x), dz = Math.abs(tz - o.z);
        return dx < (hExt.hx + o.hx - .002) && dz < (hExt.hz + o.hz - .002);
      });
    };

    // 1) Проверяем, не наведён ли предмет прямо на другой предмет/стопку, на который его можно положить сверху («вверх по одной»)
    const underStack = obstacles.filter(o => {
      if (!canStackHeldOnBase(heldItem, hExt, o)) return false;
      const dx = Math.abs(curX - o.x), dz = Math.abs(curZ - o.z);
      return dx < Math.max(hExt.hx, o.hx) * .68 && dz < Math.max(hExt.hz, o.hz) * .68 && o.y >= curY - .05 && o.y < curY + .38;
    });
    if (underStack.length > 0) {
      underStack.sort((a, b) => (b.y + b.h) - (a.y + a.h));
      const topObs = underStack[0];
      const nextY = topObs.y + topObs.h;
      const maxAllowance = (surf && surf.name === 'shelf') ? (surf.y + .34) : (curY + 1.85);
      if (nextY + hExt.h <= maxAllowance && !collidesAt(topObs.x, nextY, topObs.z)) {
        return { x: topObs.x, y: nextY, z: topObs.z, stackedOn: topObs, blocked: false };
      }
    }

    // 2) Проверяем боковое пересечение с любыми предметами (включая бутылки и газеты на полках S.shelfPlacements!)
    const firstHit = collidesAt(curX, curY, curZ);
    if (!firstHit) return { x: curX, y: curY, z: curZ, blocked: false };

    // Ищем ближайшее свободное место на этой же полке / прилавке / полу без наложения моделек
    if (surf && (surf.name === 'shelf' || surf.name === 'counter')) {
      const padX = Math.min(.07, Math.max(.04, hExt.hx * .85));
      const padZ = Math.min(.07, Math.max(.04, hExt.hz * .85));
      const minX = surf.x1 + padX, maxX = surf.x2 - padX;
      const minZ = surf.z1 + padZ, maxZ = surf.z2 - padZ;
      for (let step = .02; step <= 1.65; step += .02) {
        for (const dir of [1, -1]) {
          const tx = surf.axis === 'z' ? clamp(curX, minX, maxX) : clamp(curX + dir * step, minX, maxX);
          const tz = surf.axis === 'x' ? clamp(curZ, minZ, maxZ) : clamp(curZ + dir * step, minZ, maxZ);
          if (!collidesAt(tx, curY, tz)) return { x: tx, y: curY, z: tz, blocked: false };
        }
      }
    } else {
      for (let r = .03; r <= .65; r += .03) {
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,.7],[.7,-.7],[-.7,-.7]]) {
          const tx = curX + dx * r, tz = curZ + dz * r;
          if (!collidesAt(tx, curY, tz)) return { x: tx, y: curY, z: tz, blocked: false };
        }
      }
    }

    // 3) Если сбоку места нет, но на предмет firstHit можно положить сверху — кладём сверху!
    if (canStackHeldOnBase(heldItem, hExt, firstHit)) {
      const nextY = firstHit.y + firstHit.h;
      const maxAllowance = (surf && surf.name === 'shelf') ? (surf.y + .34) : (curY + 1.85);
      if (nextY + hExt.h <= maxAllowance && !collidesAt(firstHit.x, nextY, firstHit.z)) {
        return { x: firstHit.x, y: nextY, z: firstHit.z, stackedOn: firstHit, blocked: false };
      }
    }
    return { x: curX, y: curY, z: curZ, blocked: true };
  }

  function surfaceBelow(x, z, yTop, forItem = null) {
    let best = groundHeightAt(x, z);
    for (const s of SURF) {
      if (forItem && forItem.kind === "box" && s.name === "shelf") continue;
      if (x > s.x1 && x < s.x2 && z > s.z1 && z < s.z2 && s.y <= yTop + .04 && s.y > best) best = s.y;
    }
    for (const it of items) {
      if (it === forItem || it.inBoxId || it.state !== "rest" || !it.stack) continue;
      const { inside } = pointInBox(x, z, it, -.01);
      if (!inside) continue;
      if (it.kind === "box") {
        if (it.data && it.data.opened) {
          if (forItem && forItem.kind === "box") {
            const surfY = it.obj.position.y + it.half.y * 2;
            if (surfY <= yTop + .08 && surfY > best) best = surfY;
          } else {
            const surfY = it.obj.position.y + .028;
            if (surfY <= yTop + .08 && surfY > best) best = surfY;
          }
        } else {
          const surfY = it.obj.position.y + it.half.y * 2;
          if (surfY <= yTop + .08 && surfY > best) best = surfY;
        }
        continue;
      }
      const surfY = it.obj.position.y + it.half.y * 2;
      if (surfY <= yTop + .08 && surfY > best) best = surfY;
    }
    return best;
  }
  function rayPlace(maxD, heldItem) {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera); const o = ray.ray.origin, d = ray.ray.direction;
    let best = null;
    const cand = SURF.filter(s => !(heldItem && heldItem.kind === "box" && s.name === "shelf"));
    if (!inK(P.x, P.z)) cand.push({ name: "ground", y: groundHeightAt(P.x, P.z), x1: -999, x2: 999, z1: -999, z2: 999 });
    for (const it of items) if (it !== heldItem && it.state === "rest" && it.stack && !it.inBoxId) {
      const p = it.obj.position;
      if (it.kind === "box") {
        const ext = itemWorldHalf(it);
        if (it.data && it.data.opened) {
          if (heldItem && heldItem.kind === "box") {
            cand.push({ name: "item", itemRef: it, box: it, y: p.y + ext.h, x1: p.x - ext.hx, x2: p.x + ext.hx, z1: p.z - ext.hz, z2: p.z + ext.hz });
          } else {
            cand.push({ name: "box_inside", itemRef: it, box: it, y: p.y + .028, x1: p.x - ext.hx + .02, x2: p.x + ext.hx - .02, z1: p.z - ext.hz + .02, z2: p.z + ext.hz - .02 });
          }
        } else {
          cand.push({ name: "item", itemRef: it, box: it, y: p.y + ext.h, x1: p.x - ext.hx - .02, x2: p.x + ext.hx + .02, z1: p.z - ext.hz - .02, z2: p.z + ext.hz + .02 });
        }
        continue;
      }
      if (heldItem && heldItem.kind === "box") continue;
      const ext = itemWorldHalf(it);
      cand.push({ name: "item", itemRef: it, box: null, y: p.y + ext.h, x1: p.x - ext.hx - .01, x2: p.x + ext.hx + .01, z1: p.z - ext.hz - .01, z2: p.z + ext.hz + .01 });
    }
    for (const s of cand) {
      let candHit = null;
      // 1) Точное пересечение с горизонтальной плоскостью поверхности
      if (Math.abs(d.y) >= 1e-3) {
        const t = (s.y - o.y) / d.y;
        if (t > 0 && t <= maxD) {
          const x = o.x + d.x * t, z = o.z + d.z * t;
          if (x > s.x1 && x < s.x2 && z > s.z1 && z < s.z2) {
            const dPlayer = Math.hypot(x - P.x, z - P.z);
            const limitD = (s.name === 'shelf' || s.name === 'counter') ? .92 : 1.15;
            if (dPlayer <= limitD) {
              if (s.name === 'item' && s.itemRef) {
                candHit = { t, x: s.itemRef.obj.position.x, z: s.itemRef.obj.position.z, y: s.y, s };
              } else {
                candHit = { t, x, z, y: s.y, s };
              }
            }
          }
        }
      }
      // 2) Для полок (SH_SIDE / SH_BACK), прилавка и лежащих предметов проверяем 3D-объём (высота 0.38м над полкой без мёртвых зон)
      if (!candHit && (s.name === 'shelf' || s.name === 'counter' || s.name === 'item')) {
        const hBot = s.name === 'item' && s.itemRef ? (s.y - s.itemRef.obj.position.y) : .04;
        const hTop = s.name === 'shelf' ? .38 : s.name === 'item' ? .07 : .10;
        _surfBox.min.set(s.x1, s.y - hBot, s.z1);
        _surfBox.max.set(s.x2, s.y + hTop, s.z2);
        const hp = ray.ray.intersectBox(_surfBox, _surfHit);
        if (hp) {
          const t = hp.distanceTo(o);
          if (t > 0 && t <= maxD) {
            const dPlayer = Math.hypot(hp.x - P.x, hp.z - P.z);
            const limitD2 = (s.name === 'shelf' || s.name === 'counter') ? .92 : 1.15;
            if (dPlayer <= limitD2) {
              if (s.name === 'item' && s.itemRef) {
                candHit = { t, x: s.itemRef.obj.position.x, z: s.itemRef.obj.position.z, y: s.y, s };
              } else {
                const padX = Math.min(.06, (s.x2 - s.x1) * .22);
                const padZ = Math.min(.06, (s.z2 - s.z1) * .22);
                const cx = clamp(hp.x, s.x1 + padX, s.x2 - padX);
                const cz = clamp(hp.z, s.z1 + padZ, s.z2 - padZ);
                candHit = { t, x: cx, z: cz, y: s.y, s };
              }
            }
          }
        }
      }
      if (candHit && (!best || candHit.t < best.t)) {
        if (candHit.s.name !== 'box_inside' && heldItem) {
          const res = resolveItemSpot(candHit.x, candHit.y, candHit.z, heldItem, candHit.s);
          if (res.blocked) continue;
          candHit.x = res.x;
          candHit.y = res.y;
          candHit.z = res.z;
        }
        best = candHit;
      }
    }
    return best;
  }
  function lookingAtOpenBox(maxD = 2.4) {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera); ray.far = maxD;
    const openBoxes = items.filter(i => i !== held && i.kind === "box" && i.data.opened && i.state === "rest");
    if (!openBoxes.length) return null;
    const h = ray.intersectObjects(openBoxes.map(b => b.obj), true)[0];
    return h && h.object.userData.item ? h.object.userData.item : null;
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
  const kraftTex = (inner) => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = inner ? '#b39268' : '#a6845a'; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 6) { g.fillStyle = `rgba(${inner ? '90,64,34' : '70,50,28'},${.05 + Math.random() * .04})`; g.fillRect(x, 0, 3, 256); }
    for (let i = 0; i < 3500; i++) { const v = Math.random(); g.fillStyle = v < .5 ? 'rgba(120,90,55,.35)' : 'rgba(210,185,140,.3)'; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1); }
    if (inner) { g.fillStyle = 'rgba(80,55,30,.18)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 40, 8 + Math.random() * 20, Math.random() * 3, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(60,40,20,.5)'; g.font = '700 14px Arial'; g.fillText('ГОСТ 9142-84', 14, 240); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const inMat = std({ map: kraftTex(true), roughness: .95 }), flapOutMat = std({ map: kraftTex(false), roughness: .92 }),
    floorInMat = std({ map: kraftTex(true), color: 0xcdbca2, roughness: .97, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -2 });
  function makeOpenBox(w, h, d) {
    const g = new THREE.Group(), t = .010, tBot = .026, I = inMat, O = boxMat;
    const slab = (sx, sy, sz, x, y, z, mats, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mats); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
    // Толстое двойное картонное дно с внутренними клапанами, чтобы дорожка и снег никогда не просвечивали сквозь коробку
    const botMain = slab(w, tBot, d, 0, tBot / 2, 0, [O, O, floorInMat, O, O, O]);
    botMain.renderOrder = 2;
    for (const szSign of [-1, 1]) {
      const innerFlap = slab(w - t * 2.2, .005, d * .46, 0, tBot + .0025, szSign * d * .24, floorInMat);
      innerFlap.renderOrder = 2;
    }
    slab(w, h, t, 0, h / 2, d / 2 - t / 2, [I, I, I, I, O, I]); slab(w, h, t, 0, h / 2, -d / 2 + t / 2, [I, I, I, I, I, O]);
    slab(t, h, d - 2 * t, w / 2 - t / 2, h / 2, 0, [O, I, I, I, I, I]); slab(t, h, d - 2 * t, -w / 2 + t / 2, h / 2, 0, [I, O, I, I, I, I]);
    const FM = [I, I, I, flapOutMat, I, I];
    for (const s of [-1, 1]) {
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
  // Осколки разбитых бутылок (3D-регдолл осколков стекла)
  const shardGeos = [
    new THREE.TetrahedronGeometry(.024, 0),
    new THREE.ConeGeometry(.022, .042, 4),
    new THREE.BoxGeometry(.032, .005, .024),
  ];
  const shards = [];
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(
      shardGeos[i % shardGeos.length],
      new THREE.MeshStandardMaterial({ color: 0x2d5a36, roughness: .12, metalness: .15, transparent: true, opacity: .82, side: THREE.DoubleSide })
    );
    m.visible = false; m.castShadow = true; m.frustumCulled = false;
    scene.add(m);
    shards.push({ m, life: 0, v: new THREE.Vector3(), rv: new THREE.Vector3(), fl: 0, settled: false });
  }
  function playGlassBreak() {
    if (!env.audio) return;
    if (env.audio.thud) env.audio.thud(.35);
    if (env.audio.click) {
      for (const [delay, freq, vol, dur] of [
        [0, 2900, .55, .06], [18, 4100, .48, .05], [42, 2350, .42, .07],
        [75, 3650, .35, .05], [115, 4600, .28, .04], [165, 3100, .22, .05], [220, 4900, .18, .04]
      ]) {
        setTimeout(() => env.audio && env.audio.click(freq + R(-220, 220), vol, 0, dur), delay);
      }
    }
  }
  const GOOD_PHYS = {
    vodka:    { shape: 'bottle', drinkKind: 'vodka',   r: .036, h: .28, mass: .75 },
    beer:     { shape: 'bottle', drinkKind: 'beer',    r: .034, h: .24, mass: .65 },
    samogon:  { shape: 'bottle', drinkKind: 'samogon', r: .038, h: .26, mass: .75 },
    soda:     { shape: 'bottle', drinkKind: 'soda',    r: .032, h: .23, mass: .60 },
    tushonka: { shape: 'can',    r: .046, h: .095, mass: .42 },
    kilka:    { shape: 'can',    r: .052, h: .034, mass: .26 },
    batt:     { shape: 'box',    hx: .042, hy: .052, hz: .014, mass: .18 },
    cig:      { shape: 'box',    hx: .030, hy: .044, hz: .013, mass: .08 },
    kontra:   { shape: 'box',    hx: .058, hy: .044, hz: .024, mass: .22 },
    gum:      { shape: 'box',    hx: .042, hy: .026, hz: .014, mass: .05 },
    choc:     { shape: 'box',    hx: .068, hy: .019, hz: .014, mass: .12 },
    bread:    { shape: 'box',    hx: .100, hy: .045, hz: .052, mass: .40 },
    tape:     { shape: 'box',    hx: .052, hy: .034, hz: .010, mass: .10 },
    paper:    { shape: 'box',    hx: .110, hy: .010, hz: .080, mass: .09 },
    mag:      { shape: 'box',    hx: .075, hy: .095, hz: .008, mass: .15 },
    mag2:     { shape: 'box',    hx: .075, hy: .095, hz: .008, mass: .15 },
    toy:      { shape: 'box',    hx: .038, hy: .068, hz: .012, mass: .16 },
  };
  const isPhysicsProp = it => it && (it.kind === "bottle" || it.kind === "good" || it.kind === "pack");
  const isBreakableGlass = it => it && (it.kind === "bottle" || (it.kind === "good" && it.goodPhys && it.goodPhys.shape === "bottle"));
  const canRollOnSide = it => it && (it.kind === "bottle" || (it.kind === "good" && it.goodPhys && (it.goodPhys.shape === "bottle" || it.goodPhys.shape === "can")));

  function shatterBottle(it) {
    if (!it || !items.includes(it)) return;
    const dk = (it.data && (it.data.drinkKind || it.data.goodId)) || "vodka";
    const col = dk === "beer" ? 0x6b3a16 : dk === "samogon" ? 0xc8d2c4 : dk === "soda" ? 0xc97b28 : 0x2d5a36;
    const pos = it.obj.position.clone();
    const fl = surfaceBelow(pos.x, pos.z, pos.y + .08, it);
    playGlassBreak();
    let spawned = 0;
    for (const sh of shards) {
      if (sh.life > 0 && spawned >= 16) continue;
      if (sh.life > 0) continue;
      sh.life = 14 + R(0, 6);
      sh.settled = false;
      sh.fl = fl;
      sh.m.visible = true;
      sh.m.material.color.setHex(col);
      sh.m.position.set(pos.x + R(-.04, .04), Math.max(fl + .02, pos.y + R(.02, .12)), pos.z + R(-.04, .04));
      sh.m.rotation.set(R(0, 6.28), R(0, 6.28), R(0, 6.28));
      sh.m.scale.set(R(.7, 1.35), R(.6, 1.25), R(.7, 1.35));
      const ang = R(0, Math.PI * 2), sp = R(.8, 2.6);
      sh.v.set(
        Math.cos(ang) * sp + (it.vel ? it.vel.x * .25 : 0),
        R(.9, 2.4),
        Math.sin(ang) * sp + (it.vel ? it.vel.z * .25 : 0)
      );
      sh.rv.set(R(-14, 14), R(-14, 14), R(-14, 14));
      if (++spawned >= 16) break;
    }
    removeItem(it);
    env.ctx && env.ctx.toast && env.ctx.toast("Бутылка разбилась вдребезги!");
  }

  function applyBottlePose(it) {
    if (!it || !isPhysicsProp(it) || !it.obj.userData.piv) return;
    const piv = it.obj.userData.piv, spin = it.obj.userData.spin;
    const standY = it.centerY || .135;
    const lieY = it.rollR || .036;
    if (it.data && it.data.lying && canRollOnSide(it)) {
      piv.position.set(0, lieY, 0);
      piv.rotation.set(Math.PI / 2, 0, 0);
      spin.rotation.set(0, it.data.rollAng || 0, 0);
    } else {
      piv.position.set(0, standY, 0);
      piv.rotation.set(0, 0, 0);
      spin.rotation.set(0, 0, 0);
    }
  }

  function makeGoodPhysMesh(gid) {
    const gp = GOOD_PHYS[gid] || GOOD_PHYS.cig;
    const cy = gp.shape === 'bottle' ? gp.h * .5 : gp.shape === 'can' ? gp.h * .5 : gp.hy;
    const g = new THREE.Group();
    const piv = new THREE.Group();
    piv.position.set(0, cy, 0);
    const spin = new THREE.Group();
    piv.add(spin);
    g.add(piv);
    g.userData.piv = piv;
    g.userData.spin = spin;
    const m = env.getItemMesh ? env.getItemMesh(gid) : new THREE.Mesh(new THREE.BoxGeometry(.06, .08, .03), boxMat);
    m.position.set(0, -cy, 0);
    m.traverse(o => { if (o.isMesh) o.castShadow = true; });
    spin.add(m);
    return { obj: g, gp, cy, rollR: gp.r || gp.hy || .03 };
  }

  function makePackPhysMesh(data) {
    const gid = (data && data.goodId) || "cig";
    const cnt = clamp((data && typeof data.count === "number") ? data.count : 5, 1, (data && data.maxCount) || 5);
    const maxC = (data && data.maxCount) || 5;
    const opened = !!(data && data.opened);
    const isCarton = (gid === "cig" || gid === "kontra");
    const isBundle = (gid === "paper" || gid === "mag" || gid === "mag2");
    const isShowbox = ["gum", "choc", "batt", "tape", "toy"].includes(gid);
    const isBottleTray = ["vodka", "beer", "samogon", "soda"].includes(gid);
    const cy = isCarton ? .027 : isBundle ? (cnt * (gid === "paper" ? .009 : .007) + .003) : isShowbox ? .042 : isBottleTray ? .112 : .042;
    const hx = isCarton ? .12 : isBundle ? (gid === "paper" ? .11 : .075) : isShowbox ? .095 : .13;
    const hz = isCarton ? .049 : isBundle ? (gid === "paper" ? .08 : .095) : isShowbox ? .073 : .09;
    const g = new THREE.Group();
    const piv = new THREE.Group();
    piv.position.set(0, cy, 0);
    const spin = new THREE.Group();
    piv.add(spin);
    g.add(piv);
    g.userData.piv = piv;
    g.userData.spin = spin;
    const m = env.getPackMesh ? env.getPackMesh(gid, cnt, maxC, opened) : new THREE.Mesh(new THREE.BoxGeometry(hx * 2, cy * 2, hz * 2), boxMat);
    m.position.set(0, -cy, 0);
    m.traverse(o => { if (o.isMesh) o.castShadow = true; });
    spin.add(m);
    return { obj: g, cy, rollR: cy, half: { x: hx, y: cy, z: hz }, mass: .32 + Math.max(1, cnt) * .16 };
  }

  function rebuildPackItem(it) {
    if (!it || it.kind !== "pack" || !it.obj) return;
    const pos = it.obj.position.clone(), ry = it.obj.rotation.y;
    scene.remove(it.obj);
    const built = makePackPhysMesh(it.data);
    it.obj = built.obj;
    it.centerY = built.cy;
    it.rollR = built.rollR;
    it.half = built.half;
    it.mass = built.mass;
    it.obj.position.copy(pos);
    it.obj.rotation.y = ry;
    it.obj.traverse(o => { if (o.isMesh) o.userData.item = it; });
    applyBottlePose(it);
    scene.add(it.obj);
    syncCol(it);
    persist();
  }

  function addItem(rec) {
    const it = { id: rec.id || ("i" + Math.random().toString(36).slice(2, 8)), kind: rec.kind, data: rec.data || {}, state: "rest", vy: 0, inBoxId: rec.inBoxId || null, boxOff: rec.boxOff || null };
    if (rec.kind === "box") {
      const w = .5, h = .36, d = .4;
      it.obj = makeBoxMesh(w, h, d, !!(it.data.opened));
      it.half = { x: w / 2, y: h / 2, z: d / 2 };
      it.mass = it.data.opened ? 1 : 12;
      it.stack = true;
    } else if (rec.kind === "bottle") {
      it.obj = emptyBottleMesh(rec.data && rec.data.drinkKind);
      it.half = { x: .04, y: .15, z: .04 };
      it.mass = .4;
      it.centerY = .135;
      it.rollR = .036;
      it.stack = false;
      applyBottlePose(it);
    } else if (rec.kind === "pack") {
      it.data = Object.assign({ goodId: "cig", count: 5, maxCount: 5, opened: false }, it.data);
      const built = makePackPhysMesh(it.data);
      it.obj = built.obj;
      it.centerY = built.cy;
      it.rollR = built.rollR;
      it.half = built.half;
      it.mass = built.mass;
      it.stack = true;
      applyBottlePose(it);
    } else if (rec.kind === "good") {
      const gid = (it.data && it.data.goodId) || "cig";
      const built = makeGoodPhysMesh(gid);
      it.obj = built.obj;
      it.goodPhys = built.gp;
      it.centerY = built.cy;
      it.rollR = built.rollR;
      it.half = { x: built.gp.r || built.gp.hx || .04, y: built.cy, z: built.gp.r || built.gp.hz || .04 };
      it.mass = built.gp.mass || .2;
      it.stack = built.gp.shape !== 'bottle';
      applyBottlePose(it);
    } else if (rec.kind === "gun") {
      it.obj = env.gunWorldMesh();
      it.half = { x: .55, y: .04, z: .1 };
      it.mass = 3.4;
      it.stack = false;
    }
    const baseFl = surfaceBelow(rec.x || 0, rec.z || 0, (rec.y || 0) + .1, it);
    const startY = rec.y == null ? baseFl : Math.max(baseFl, rec.y);
    it.obj.position.set(rec.x, startY, rec.z);
    it.obj.rotation.y = rec.ry || 0;
    it.obj.traverse(o => { if (o.isMesh) o.userData.item = it; });
    scene.add(it.obj); items.push(it); syncCol(it); return it;
  }
  function syncCol(it) {
    if (it.col) { const i = colliders.indexOf(it.col); if (i >= 0) colliders.splice(i, 1); it.col = null; }
    if (it.state === "rest" && it.kind === "box" && it.obj.position.y < .3) { const p = it.obj.position, c = Math.abs(Math.cos(it.obj.rotation.y)), s = Math.abs(Math.sin(it.obj.rotation.y)); const hx = it.half.x * c + it.half.z * s, hz = it.half.x * s + it.half.z * c; it.col = addCol(p.x - hx, p.x + hx, p.z - hz, p.z + hz, "item"); }
    // Привязываем или обновляем привязку предмета к открытой коробке, если он лежит внутри неё
    if (it.kind !== "box" && it.state === "rest") {
      const bx = findOpenBoxAt(it.obj.position.x, it.obj.position.z, it.obj.position.y, it);
      if (bx) {
        const { lx, lz } = pointInBox(it.obj.position.x, it.obj.position.z, bx, 0);
        const keepLy = (it.inBoxId === bx.id && it.boxOff && typeof it.boxOff.ly === "number") ? it.boxOff.ly : Math.max(.028, it.obj.position.y - bx.obj.position.y);
        it.inBoxId = bx.id;
        it.boxOff = { lx, ly: keepLy, lz, lry: it.obj.rotation.y - bx.obj.rotation.y };
      } else {
        it.inBoxId = null; it.boxOff = null;
      }
    }
  }
  function removeItem(it) { if (it.col) { const i = colliders.indexOf(it.col); if (i >= 0) colliders.splice(i, 1); } scene.remove(it.obj); const idx = items.indexOf(it); if (idx >= 0) items.splice(idx, 1); if (held === it) held = null; persist(); }
  function persist() { const s = S(); if (!s) return; s.items = items.filter(i => i !== held || true).map(i => ({ id: i.id, kind: i.kind, x: +i.obj.position.x.toFixed(3), y: +(i === held ? surfaceBelow(P.x, P.z, 3, i) : i.obj.position.y).toFixed(3), z: +i.obj.position.z.toFixed(3), ry: +i.obj.rotation.y.toFixed(3), data: i.data })); if (held) { const r = s.items.find(x => x.id === held.id); if (r) { r.x = +P.x.toFixed(3); r.z = +P.z.toFixed(3); } } }
  function loadItems() {
    items.slice().forEach(i => { scene.remove(i.obj); if (i.col) colliders.splice(colliders.indexOf(i.col), 1); });
    items.length = 0; held = null;
    const s = S();
    if (s && Array.isArray(s.items)) {
      for (const rec of s.items) {
        if (rec.id === 'pk_start_cig' && rec.y < .2)  { rec.x = -.82;  rec.y = 1.213; rec.z = -1.03; rec.ry = 0; }
        if (rec.id === 'pk_start_beer' && rec.y < .2) { rec.x = -.24;  rec.y = 1.213; rec.z = -1.03; rec.ry = 0; }
        if (rec.id === 'pk_start_gum' && rec.y < .2)  { rec.x = -1.33; rec.y = .863;  rec.z = -.22;  rec.ry = Math.PI / 2; }
      }
    }
    (s && s.items || []).forEach(addItem);
    // Опускаем любые зависшие в воздухе коробки/предметы из прошлых сохранений на поверхность под ними
    const freeItems = items.filter(i => !i.inBoxId).sort((a, b) => a.obj.position.y - b.obj.position.y);
    for (const it of freeItems) {
      const fl = surfaceBelow(it.obj.position.x, it.obj.position.z, it.obj.position.y + .05, it);
      if (it.obj.position.y > fl + .02) it.obj.position.y = fl;
    }
    items.forEach(syncCol);
    for (const bx of items.filter(i => i.kind === "box" && i.data && i.data.opened)) {
      // Если в старом сохранении внутри одной открытой коробки оказалось больше 4 упаковок — перекладываем лишние в новую коробку рядом
      const chs = items.filter(ch => ch.inBoxId === bx.id);
      if (chs.length > 4) {
        for (let bStart = 4; bStart < chs.length; bStart += 4) {
          const extraIdx = Math.floor(bStart / 4);
          const newBx = addItem({
            kind: "box",
            x: bx.obj.position.x + (extraIdx % 2 ? .56 : -.56),
            y: bx.obj.position.y,
            z: bx.obj.position.z - Math.floor((extraIdx - 1) / 2) * .48,
            ry: bx.obj.rotation.y,
            data: { opened: true }
          });
          const slice = chs.slice(bStart, bStart + 4);
          slice.forEach((ch, idx) => {
            const slotInLayer = idx % 2, layerIdx = Math.floor(idx / 2);
            ch.inBoxId = newBx.id;
            ch.boxOff = { lx: slotInLayer ? .012 : -.012, ly: .030 + layerIdx * .088, lz: slotInLayer === 0 ? -.094 : .094, lry: slotInLayer ? .02 : -.02 };
          });
          syncBoxChildren(newBx);
        }
      }
      syncBoxChildren(bx);
    }
  }
  function lookItem(maxD = 2.2) {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera); ray.far = maxD;
    const objs = items.filter(i => i !== held && i.state !== "trash" && i.state !== "sink").map(i => i.obj);
    const hits = ray.intersectObjects(objs, true);
    if (!hits.length) return null;
    // Если луч задел и открытую коробку, и предмет внутри неё — позволяем взять сам предмет, если он ближе или в центре прицела
    for (const h of hits) {
      const it = h.object.userData.item;
      if (it && it.kind !== "box") return it;
    }
    return hits[0].object.userData.item || null;
  }
  function pick(it) {
    held = it; it.state = "held"; it.inBoxId = null; it.boxOff = null;
    if (isPhysicsProp(it)) { it.data.lying = false; it.data.rollAng = 0; applyBottlePose(it); }
    // Если поднимаем открытую коробку — фиксируем все предметы, лежащие внутри неё, чтобы нести их вместе с коробкой
    if (it.kind === "box" && it.data.opened) {
      for (const ch of items) {
        if (ch !== it && ch.kind !== "box" && ch.state === "rest") {
          const { inside, lx, lz } = pointInBox(ch.obj.position.x, ch.obj.position.z, it, .005);
          if (inside && ch.obj.position.y >= it.obj.position.y - .02 && ch.obj.position.y <= it.obj.position.y + it.half.y * 2 + .08) {
            ch.inBoxId = it.id;
            ch.boxOff = { lx, ly: Math.max(.028, ch.obj.position.y - it.obj.position.y), lz, lry: ch.obj.rotation.y - it.obj.rotation.y };
          }
        }
      }
    }
    heldYaw = it.obj.rotation.y - P.yaw; heldYawT = heldYaw; syncCol(it); env.audio && env.audio.click(700, .4, 0, .05); env.onCtl();
  }
  function placeHeld() {
    if (!held) return false;
    const openBx = held.kind !== "box" ? lookingAtOpenBox(1.15) : null;
    if (openBx) return throwIntoBox(openBx);
    const t = rayPlace(1.25, held); if (!t) return false;
    const it = held; held = null;
    if (isPhysicsProp(it)) { it.data.lying = false; it.data.rollAng = 0; applyBottlePose(it); }
    if (t.s && t.s.axis === 'z') it.obj.rotation.y = Math.PI / 2;
    else if (t.s && t.s.axis === 'x') it.obj.rotation.y = 0;
    it.state = "place"; it.from = it.obj.position.clone(); it.to = new THREE.Vector3(t.x, t.y, t.z); it.pt = 0; it.ry = it.obj.rotation.y;
    env.onCtl(); return true;
  }
  // Бросить текущий предмет прямо внутрь открытой коробки (чтобы он физически упал на её дно)
  function throwIntoBox(box) {
    if (!held || !box) return false;
    const it = held; held = null;
    it.inBoxId = null; it.boxOff = null;
    const tx = box.obj.position.x + R(-.06, .06), tz = box.obj.position.z + R(-.05, .05);
    const dx = tx - it.obj.position.x, dz = tz - it.obj.position.z;
    if (isPhysicsProp(it)) {
      it.state = "ragdoll";
      it.bounces = 0;
      it.targetBox = box;
      it.vel = new THREE.Vector3(dx * 2.2, 1.05, dz * 2.2);
      it.tiltVel = R(5, 8);
      it.yawVel = R(-2.5, 2.5);
      it.spinVel = R(-6, 6);
    } else {
      it.state = "place";
      it.from = it.obj.position.clone();
      it.to = new THREE.Vector3(tx, box.obj.position.y + .028, tz);
      it.pt = 0;
      it.ry = box.obj.rotation.y + R(-.25, .25);
    }
    env.audio && env.audio.click(620, .35, 0, .05);
    env.onCtl();
    return true;
  }
  function dropHeld() {
    if (!held) return;
    const openBx = held.kind !== "box" ? lookingAtOpenBox(1.35) : null;
    if (openBx) { throwIntoBox(openBx); return; }
    const it = held; held = null;
    it.dropOriginY = camera.position.y;
    if (isPhysicsProp(it)) {
      camera.getWorldDirection(tmp);
      const isCrouched = !!P.crouch;
      const lookingDown = tmp.y < -0.55;
      const softDrop = isCrouched || lookingDown;
      const sp = softDrop ? 1.05 : (2.75 + Math.max(0, tmp.y) * 2.2);
      it.state = "ragdoll";
      it.bounces = 0;
      it.targetBox = null;
      it.vel = new THREE.Vector3(
        tmp.x * sp + (P.vx || 0) * .45,
        softDrop ? -0.35 : (tmp.y * sp + 1.1),
        tmp.z * sp + (P.vz || 0) * .45
      );
      it.tiltVel = softDrop ? R(2.0, 4.0) : R(6.0, 10.0);
      it.yawVel = R(-3.5, 3.5);
      it.spinVel = softDrop ? R(-3, 3) : R(-9, 9);
    } else {
      camera.getWorldDirection(tmp); tmp.y = 0; tmp.normalize();
      it.state = "fall"; it.vy = .8;
      it.vx = tmp.x * 1.15; it.vz = tmp.z * 1.15;
    }
    env.onCtl();
  }
  function rotateHeld(dir = 1) {
    if (!held) return;
    heldYaw = (heldYaw + (Math.PI / 2) * dir);
    heldYawT = heldYaw;
    env.audio && env.audio.click(750, .3, 0, .05);
    if (ctx.toast) ctx.toast('Повернули предмет');
    env.onCtl && env.onCtl();
  }
  function trashHeld(bin, done) {
    if (!held) return false;
    const it = held; held = null;
    // Если выбрасываем коробку вместе с предметами внутри — удаляем и вложенные предметы
    if (it.kind === "box") {
      for (const ch of items.slice()) if (ch.inBoxId === it.id && ch.kind !== "gun") removeItem(ch);
    }
    it.state = "trash"; it.from = it.obj.position.clone(); it.to = new THREE.Vector3(bin.x, bin.y, bin.z); it.pt = 0; it.done = done; env.onCtl(); return true;
  }

  function syncBoxChildren(box) {
    if (!box || box.kind !== "box" || !box.data.opened) return;
    const c = Math.cos(box.obj.rotation.y), s = Math.sin(box.obj.rotation.y);
    for (const ch of items) {
      if (ch.inBoxId === box.id && ch !== held && ch.boxOff) {
        const { lx, ly, lz, lry } = ch.boxOff;
        ch.obj.position.set(
          box.obj.position.x + lx * c + lz * s,
          box.obj.position.y + ly,
          box.obj.position.z - lx * s + lz * c
        );
        ch.obj.rotation.y = box.obj.rotation.y + lry;
      }
    }
  }

  function clampInsideBoxWalls(x, z, box, r = .04) {
    const dx = x - box.obj.position.x, dz = z - box.obj.position.z;
    const c = Math.cos(box.obj.rotation.y), s = Math.sin(box.obj.rotation.y);
    let lx = dx * c - dz * s, lz = dx * s + dz * c;
    let hitWall = false;
    const maxX = Math.max(.02, box.half.x - r), maxZ = Math.max(.02, box.half.z - r);
    if (Math.abs(lx) > maxX) { lx = Math.sign(lx) * maxX; hitWall = true; }
    if (Math.abs(lz) > maxZ) { lz = Math.sign(lz) * maxZ; hitWall = true; }
    return {
      x: box.obj.position.x + lx * c + lz * s,
      z: box.obj.position.z - lx * s + lz * c,
      hitWall,
    };
  }

  function hitsWallCollider(x, z, r = .05) {
    if (Math.abs(x) < KW + r && Math.abs(z) < KD + r) {
      // Стены ларька
      if (Math.abs(Math.abs(x) - KW) < r + .04 || Math.abs(Math.abs(z) - KD) < r + .04) return true;
    }
    for (const b of colliders) {
      if (b.tag === "item" || b.tag === "door") continue;
      if (x > b.x1 - r && x < b.x2 + r && z > b.z1 - r && z < b.z2 + r) return true;
    }
    return false;
  }

  function itemsTick(dt) {
    // Обновляем осколки разбитых бутылок
    for (const sh of shards) if (sh.life > 0) {
      sh.life -= dt;
      if (!sh.settled) {
        sh.v.y -= 9.8 * dt;
        const px = sh.m.position.x, pz = sh.m.position.z, py = sh.m.position.y, wasIn = inK(px, pz);
        sh.m.position.addScaledVector(sh.v, dt);
        // стены ларька: осколок отскакивает, а не пролетает насквозь
        if (wasIn !== inK(sh.m.position.x, sh.m.position.z)) {
          if (wasIn !== inK(sh.m.position.x, pz)) { sh.m.position.x = px; sh.v.x *= -.3; }
          if (wasIn !== inK(sh.m.position.x, sh.m.position.z)) { sh.m.position.z = pz; sh.v.z *= -.3; }
        }
        // поверхность под осколком пересчитывается на лету: слетел с прилавка/полки — падает до пола, а не висит в воздухе
        sh.fl = surfaceBelow(sh.m.position.x, sh.m.position.z, Math.max(py, sh.m.position.y)); // от высоты до шага — быстрый осколок не проскакивает сквозь прилавок
        sh.m.rotation.x += sh.rv.x * dt;
        sh.m.rotation.y += sh.rv.y * dt;
        sh.m.rotation.z += sh.rv.z * dt;
        if (sh.m.position.y <= sh.fl + .008) {
          sh.m.position.y = sh.fl + .008;
          if (Math.abs(sh.v.y) > .65) {
            sh.v.y *= -.28;
            sh.v.x *= .55; sh.v.z *= .55;
            sh.rv.multiplyScalar(.5);
          } else {
            sh.settled = true;
            sh.m.rotation.x = Math.PI / 2;
          }
        }
      }
      if (sh.life <= 0) sh.m.visible = false;
    }

    const pSpd = Math.hypot(P.vx || 0, P.vz || 0);
    for (const it of items.slice()) {
      if (!items.includes(it)) continue;
      if (it === held) {
        heldYaw += (heldYawT - heldYaw) * Math.min(1, dt * 10);
        camera.getWorldDirection(tmp);
        tmp.normalize();
        let tgt;
        if (it.kind === "box") {
          // Коробка в руках несётся плавно и стабильно перед игроком без захода в стены
          const hDirX = -Math.sin(P.yaw), hDirZ = -Math.cos(P.yaw);
          let bReach = .62;
          for (let step = .24; step <= bReach; step += .06) {
            if (hitsWallCollider(camera.position.x + hDirX * step, camera.position.z + hDirZ * step, .26)) {
              bReach = Math.max(.22, step - .06);
              break;
            }
          }
          tgt = tmp2.set(
            camera.position.x + hDirX * bReach,
            clamp(camera.position.y - .42 + tmp.y * .22, groundHeightAt(P.x, P.z) + .04, camera.position.y - .15),
            camera.position.z + hDirZ * bReach
          );
          const nearDoorway = P.x > .2 && P.x < 1.4 && P.z < -KD + .75; // у дверного проёма коробку не держим внутри — иначе её не вынести
          if (inK(P.x, P.z) && !nearDoorway) {
            tgt.x = clamp(tgt.x, -KW + .28, KW - .28);
            tgt.z = clamp(tgt.z, -KD + .28, KD - .28);
          }
          it.obj.rotation.y = P.yaw + heldYaw;
        } else {
          const pl = rayPlace(1.25, it);
          if (pl && (pl.s.name === 'shelf' || pl.s.name === 'counter' || pl.s.name === 'box_inside' || pl.s.name === 'item') && pl.t < 1.25) {
            tgt = tmp2.set(pl.x, pl.y + .008, pl.z);
            if (pl.s.axis === 'z') it.obj.rotation.y = Math.PI / 2;
            else if (pl.s.axis === 'x') it.obj.rotation.y = 0;
            else it.obj.rotation.y = P.yaw + heldYaw;
          } else {
            let reach = it.kind === "pack" ? .48 : it.kind === "gun" ? .46 : .42;
            const vOff = it.kind === "pack" ? -.07 : it.kind === "gun" ? -.10 : -.05;
            const itemR = it.kind === "gun" ? .28 : .14;
            if (inK(camera.position.x, camera.position.z)) {
              const toWallX = tmp.x > 0 ? (KW - camera.position.x) / tmp.x : (-KW - camera.position.x) / tmp.x;
              const toWallZ = tmp.z > 0 ? (KD - camera.position.z) / tmp.z : (-KD - camera.position.z) / tmp.z;
              const wDist = Math.min(toWallX > 0 ? toWallX : 99, toWallZ > 0 ? toWallZ : 99);
              if (wDist < reach + itemR) reach = Math.max(.18, wDist - itemR);
            }
            for (let step = .18; step <= reach; step += .05) {
              if (hitsWallCollider(camera.position.x + tmp.x * step, camera.position.z + tmp.z * step, itemR * .65)) {
                reach = Math.max(.18, step - .05);
                break;
              }
            }
            tgt = tmp2.copy(camera.position).addScaledVector(tmp, reach);
            tgt.y += vOff;
            if (inK(P.x, P.z)) {
              const padW = it.kind === "gun" ? .36 : .14;
              tgt.x = clamp(tgt.x, -KW + padW, KW - padW);
              tgt.z = clamp(tgt.z, -KD + padW, KD - padW);
            }
            const minFl = groundHeightAt(tgt.x, tgt.z);
            if (tgt.y < minFl + .02) tgt.y = minFl + .02;
            it.obj.rotation.y = P.yaw + heldYaw;
          }
        }
        it.obj.position.lerp(tgt, Math.min(1, dt * 16));
        syncBoxChildren(it);
      } else if (it.state === "place") {
        it.pt += dt * 3.5; const k = ease(Math.min(1, it.pt)); it.obj.position.lerpVectors(it.from, it.to, k); it.obj.position.y += Math.sin(k * Math.PI) * .12;
        syncBoxChildren(it);
        if (it.pt >= 1) { it.state = "rest"; it.obj.position.copy(it.to); env.audio && env.audio.thud(.25 + it.mass * .02); syncCol(it); syncBoxChildren(it); persist(); }
      } else if (it.state === "trash") {
        it.pt += dt * 2.6; const k = ease(Math.min(1, it.pt)); it.obj.position.lerpVectors(it.from, it.to, k); it.obj.position.y += Math.sin(k * Math.PI) * .35; it.obj.rotation.x = k * .5;
        syncBoxChildren(it);
        if (it.pt >= 1) { it.state = "sink"; it.vy = 0; }
      } else if (it.state === "sink") {
        it.vy -= 9.8 * dt; it.obj.position.y += it.vy * dt;
        syncBoxChildren(it);
        if (it.obj.position.y < it.to.y - .7) { env.audio && env.audio.thud(.5 + it.mass * .03); const d = it.done; removeItem(it); d && d(it); return; }
      } else if (it.state === "ragdoll" && isPhysicsProp(it)) {
        // 3D-полёт, вращение и отскоки любого брошенного предмета (бутылок, консервов, пачек сигарет, продуктов)
        it.vel.y -= 9.8 * dt;
        let nx = it.obj.position.x + it.vel.x * dt;
        let nz = it.obj.position.z + it.vel.z * dt;
        const ny = it.obj.position.y + it.vel.y * dt;
        const standY = it.centerY || .135;
        const lieY = it.rollR || .036;

        // Если предмет летит внутри открытой коробки — удерживаем его стенками коробки
        const bx = it.targetBox || findOpenBoxAt(nx, nz, ny, it);
        if (bx && ny < bx.obj.position.y + bx.half.y * 2 + .04) {
          const cl = clampInsideBoxWalls(nx, nz, bx, .07);
          if (cl.hitWall) {
            nx = cl.x; nz = cl.z;
            it.vel.x *= -.32; it.vel.z *= -.32;
          }
        } else if (hitsWallCollider(nx, nz, .06)) {
          const hSpd = Math.hypot(it.vel.x, it.vel.z);
          if (isBreakableGlass(it) && hSpd > 2.35) { shatterBottle(it); continue; }
          it.vel.x *= -.42; it.vel.z *= -.42;
          nx = it.obj.position.x + it.vel.x * dt;
          nz = it.obj.position.z + it.vel.z * dt;
          env.audio && env.audio.click(isBreakableGlass(it) ? 1750 : 620, .28, 0, .05);
        }

        it.obj.position.set(nx, ny, nz);
        it.obj.rotation.y += (it.yawVel || 0) * dt;
        const piv = it.obj.userData.piv, spin = it.obj.userData.spin;
        if (piv && spin) {
          piv.rotation.x += (it.tiltVel || 6) * dt;
          spin.rotation.y += (it.spinVel || 4) * dt;
          piv.position.y = lieY + (1 - Math.abs(Math.sin(piv.rotation.x))) * Math.max(0, standY - lieY);
        }

        const fl = bx ? (bx.obj.position.y + .028) : surfaceBelow(nx, nz, ny + .08, it);
        if (it.obj.position.y <= fl) {
          it.obj.position.y = fl;
          const hSpd = Math.hypot(it.vel.x, it.vel.z);
          const imp = Math.abs(it.vel.y) + hSpd * .42;
          const fallDist = (it.dropOriginY != null ? it.dropOriginY : (fl + 1.3)) - fl;
          if (!bx && isBreakableGlass(it)) {
            const highOrFar = fallDist > 0.65 || imp > 2.85 || hSpd > 1.75;
            const softDrop = fallDist < 0.48 && imp < 2.45 && hSpd < 1.35;
            if (highOrFar && !softDrop && Math.random() < 0.85) {
              shatterBottle(it);
              continue;
            }
          }
          it.bounces = (it.bounces || 0) + 1;
          if (isBreakableGlass(it)) env.audio && env.audio.click(1650 + R(-220, 220), Math.min(.5, imp * .09), 0, .05);
          else if (canRollOnSide(it)) env.audio && env.audio.click(940 + R(-140, 140), Math.min(.45, imp * .08), 0, .05);
          else env.audio && env.audio.thud(Math.min(.4, .12 + imp * .05));

          if (!bx && it.bounces === 1 && Math.abs(it.vel.y) > 1.25) {
            it.vel.y = -it.vel.y * (canRollOnSide(it) ? .28 : .22);
            it.vel.x *= .62; it.vel.z *= .62;
            it.tiltVel = R(4.0, 7.0);
          } else if (canRollOnSide(it)) {
            it.data.lying = true;
            if (piv && spin) {
              piv.position.set(0, lieY, 0);
              piv.rotation.set(Math.PI / 2, 0, 0);
            }
            const moveAng = hSpd > .08 ? Math.atan2(it.vel.x, -it.vel.z) : it.obj.rotation.y;
            it.obj.rotation.y = moveAng;
            it.rollSpd = bx ? Math.min(.32, hSpd * .32) : (hSpd * .78 + R(.18, .48));
            it.state = "roll";
          } else {
            // Пачки сигарет, хлеб, шоколад, журналы, кассеты и др. слегка скользят по инерции и ложатся ровно
            it.data.lying = false;
            applyBottlePose(it);
            const moveAng = hSpd > .08 ? Math.atan2(it.vel.x, -it.vel.z) : it.obj.rotation.y;
            it.obj.rotation.y = moveAng;
            it.rollSpd = bx ? Math.min(.18, hSpd * .22) : Math.min(1.2, hSpd * .55);
            it.state = "roll";
          }
        }
      } else if (it.state === "roll" && isPhysicsProp(it)) {
        // Качение бутылок/банок и скольжение по инерции пачек/продуктов
        const ds = (it.rollSpd || 0) * dt;
        const rx = Math.cos(it.obj.rotation.y), rz = -Math.sin(it.obj.rotation.y);
        let nx = it.obj.position.x + rx * ds;
        let nz = it.obj.position.z + rz * ds;
        const bx = findOpenBoxAt(it.obj.position.x, it.obj.position.z, it.obj.position.y + .02, it);
        if (bx) {
          const cl = clampInsideBoxWalls(nx, nz, bx, .08);
          if (cl.hitWall) {
            nx = cl.x; nz = cl.z;
            it.rollSpd *= -.25;
          }
          it.obj.position.y = bx.obj.position.y + .028;
        } else if (hitsWallCollider(nx, nz, .06)) {
          it.rollSpd *= -.35;
          nx = it.obj.position.x; nz = it.obj.position.z;
          env.audio && env.audio.click(isBreakableGlass(it) ? 1550 : 620, .2, 0, .04);
        } else {
          it.obj.position.y = surfaceBelow(nx, nz, it.obj.position.y + .06, it);
        }
        it.obj.position.x = nx;
        it.obj.position.z = nz;
        if (canRollOnSide(it)) {
          it.obj.rotation.y += ds * .38;
          const spin = it.obj.userData.spin;
          if (spin) {
            spin.rotation.y -= ds / Math.max(.025, it.rollR || .036);
            it.data.rollAng = spin.rotation.y;
          }
        }
        const baseDamp = canRollOnSide(it) ? (inK(nx, nz) || (nz > 6.3 && nz < 14.1) ? 1.45 : 2.6) : 5.2;
        const damp = bx ? 6.0 : baseDamp;
        it.rollSpd *= Math.max(0, 1 - dt * damp);
        if (Math.abs(it.rollSpd) < .03) {
          it.rollSpd = 0;
          it.state = "rest";
          syncCol(it);
          persist();
        }
      } else if (it.state === "fall") {
        it.vy -= 9.8 * dt;
        it.obj.position.y += it.vy * dt;
        if (it.vx || it.vz) {
          let nx = it.obj.position.x + (it.vx || 0) * dt;
          let nz = it.obj.position.z + (it.vz || 0) * dt;
          const wallR = it.kind === "gun" ? .32 : it.kind === "box" ? .24 : .08;
          const bx = findOpenBoxAt(nx, nz, it.obj.position.y, it);
          if (bx && it.obj.position.y < bx.obj.position.y + bx.half.y * 2 + .05) {
            const cl = clampInsideBoxWalls(nx, nz, bx, .06);
            nx = cl.x; nz = cl.z;
            if (cl.hitWall) { it.vx *= -.25; it.vz *= -.25; }
          } else if (hitsWallCollider(nx, nz, wallR)) {
            it.vx *= -.3; it.vz *= -.3;
            nx = it.obj.position.x; nz = it.obj.position.z;
          }
          if (inK(it.obj.position.x, it.obj.position.z)) {
            nx = clamp(nx, -KW + wallR, KW - wallR);
            nz = clamp(nz, -KD + wallR, KD - wallR);
          }
          it.obj.position.x = nx; it.obj.position.z = nz;
        }
        const fl = surfaceBelow(it.obj.position.x, it.obj.position.z, it.obj.position.y + .05, it);
        syncBoxChildren(it);
        if (it.obj.position.y <= fl) {
          it.obj.position.y = fl;
          if (it.vy < -2.5) {
            it.vy *= -.25;
            it.vx = (it.vx || 0) * .5; it.vz = (it.vz || 0) * .5;
            env.audio && env.audio.thud(.4 + it.mass * .03);
          } else {
            it.vy = 0; it.vx = 0; it.vz = 0;
            it.state = "rest";
            syncCol(it);
            syncBoxChildren(it);
            persist();
          }
        }
      } else if (it.state === "rest" && !it.inBoxId) {
        const fl = surfaceBelow(it.obj.position.x, it.obj.position.z, it.obj.position.y + .04, it);
        if (it.obj.position.y > fl + .018) {
          it.state = "fall";
          it.vy = 0;
          it.vx = 0;
          it.vz = 0;
          continue;
        }
        if (isPhysicsProp(it) && pSpd > .35) {
        // Если игрок наступает/пинает лежащий на полу предмет — он откатывается или сдвигается
        const dx = it.obj.position.x - P.x, dz = it.obj.position.z - P.z;
        const d = Math.hypot(dx, dz);
        if (d < .36 && Math.abs(it.obj.position.y - surfaceBelow(P.x, P.z, 2)) < .15) {
          if (canRollOnSide(it)) it.data.lying = true;
          applyBottlePose(it);
          it.obj.rotation.y = Math.atan2(dx, -dz);
          it.rollSpd = Math.min(2.2, pSpd * (canRollOnSide(it) ? .65 : .42) + .35);
          it.state = "roll";
          env.audio && env.audio.click(isBreakableGlass(it) ? 1600 : 720, .24, 0, .05);
        }
        }
      }
    }
  }

  // ================= доставка =================
  const DOORSTEP = { x: .8, z: -KD - .75 };
  let knockT = 0;
  const DELIVERY_WORDS = [[0, .7, 'Доставка'], [.7, 1.2, 'товара.'], [1.62, 2.12, 'Открывайте.']];
  // Разбивка заказа на несколько коробок по вместимости:
  // В одной коробке (0.50 × 0.36 × 0.40) помещается максимум 2 колонки (lz = -0.094 и +0.094) по 2 яруса (итого 4 слота),
  // причём высокий лоток с бутылками (vodka, beer, samogon, soda) занимает всю высоту своей колонки (2 слота),
  // поэтому в одну коробку никогда не набивается гора товара выше бортиков!
  function splitOrderIntoBoxChunks(contents) {
    const outfits = {};
    const packList = [];
    for (const [k, val] of Object.entries(contents || {})) {
      const q = Array.isArray(val) ? val[0] : (val | 0);
      const unit = Array.isArray(val) ? val[1] : undefined;
      if (k.startsWith('outfit:')) {
        outfits[k] = [q, unit];
        continue;
      }
      let rem = q;
      const isTall = ['vodka', 'beer', 'samogon', 'soda'].includes(k);
      while (rem > 0) {
        const cnt = Math.min(5, rem);
        rem -= cnt;
        packList.push({ goodId: k, count: cnt, unitCost: unit, slots: isTall ? 2 : 1 });
      }
    }
    const boxes = [];
    for (const pk of packList) {
      let placed = false;
      for (const b of boxes) {
        for (let col = 0; col < 2; col++) {
          if (b.colSlots[col] + pk.slots <= 2) {
            b.packs.push({ ...pk, col, layer: b.colSlots[col] });
            b.colSlots[col] += pk.slots;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) {
        const nb = { colSlots: [pk.slots, 0], packs: [{ ...pk, col: 0, layer: 0 }], contents: {} };
        boxes.push(nb);
      }
    }
    if (boxes.length === 0) {
      boxes.push({ colSlots: [0, 0], packs: [], contents: {} });
    }
    for (const b of boxes) {
      for (const p of b.packs) {
        const cur = b.contents[p.goodId] ? b.contents[p.goodId][0] : 0;
        b.contents[p.goodId] = [cur + p.count, p.unitCost];
      }
    }
    if (Object.keys(outfits).length > 0) {
      Object.assign(boxes[0].contents, outfits);
    }
    return boxes;
  }

  function doorstepBoxSpot(idx) {
    // коробки доставки: вразнобой у двери — рядом друг с другом или одна на другой (не выше двух), всегда на земле или на коробке
    const H = .36, near = items.filter(i => i.kind === 'box' && i.state === 'rest' && Math.hypot(i.obj.position.x - DOORSTEP.x, i.obj.position.z - DOORSTEP.z) < 2.2);
    const base = near.filter(b => b.obj.position.y < groundHeightAt(b.obj.position.x, b.obj.position.z) + .1 && !near.some(o => o !== b && Math.hypot(o.obj.position.x - b.obj.position.x, o.obj.position.z - b.obj.position.z) < .2 && o.obj.position.y > b.obj.position.y + .2));
    if (base.length && Math.random() < .4) { const b = base[Math.floor(Math.random() * base.length)]; return { x: b.obj.position.x + R(-.05, .05), y: b.obj.position.y + H, z: b.obj.position.z + R(-.04, .04), ry: b.obj.rotation.y + R(-.35, .35) }; }
    for (let k = 0; k < 30; k++) {
      const x = DOORSTEP.x + R(-1.0, 1.0), z = DOORSTEP.z - R(0, .9);
      if (near.some(b => Math.abs(b.obj.position.x - x) < .52 && Math.abs(b.obj.position.z - z) < .44)) continue;
      return { x, y: groundHeightAt(x, z), z, ry: R(-.6, .6) };
    }
    const col = idx % 3, row = Math.floor(idx / 3); const x = DOORSTEP.x + [-.56, 0, .56][col], z = DOORSTEP.z - row * .48;
    return { x, y: groundHeightAt(x, z), z, ry: R(-.1, .1) };
  }


  function deliveryTick(dt, dHour = dt / 90) {
    if (knockT > 0) { const prev = knockT; knockT -= dt; const door = new THREE.Vector3(DOORSTEP.x, 1.3, -KD - .3);
      if (prev >= 3 && knockT < 3) { const r = env.audio && env.audio.sample && env.audio.sample('stuk', 1.1, door); if (!r) for (const t of [0, .3, .6]) setTimeout(() => env.audio && env.audio.knock(), t * 1000); }
      if (prev > 1.1 && knockT <= 1.1) { const r = env.audio && env.audio.sample && env.audio.sample('dostavka', 1.3, door);
        env.ctx.subtitles && env.ctx.subtitles('Доставщик', DELIVERY_WORDS, r ? r.start : null); } }
    const s = S(); if (!s || !s.deliveries || !s.deliveries.length) return;
    for (const d of s.deliveries) {
      if (d.state === 'way') {
        if (d.etaHours != null) { d.etaHours -= dHour; if (d.etaHours <= 0) d.state = 'arrive'; }
        else { d.eta -= dt; if (d.eta <= 0) d.state = 'arrive'; }
      }
      if (d.state === 'arrive') {
        const doorVisible = env.doorOpen() > .3 && env.visibleFromPlayer(DOORSTEP.x, DOORSTEP.z);
        const outsideNear = !inK(P.x, P.z) && Math.hypot(P.x - DOORSTEP.x, P.z - DOORSTEP.z) < 1.8 && env.visibleFromPlayer(DOORSTEP.x, DOORSTEP.z);
        if (!doorVisible && !outsideNear) {
          const baseOff = items.filter(i => i.kind === 'box' && Math.hypot(i.obj.position.x - DOORSTEP.x, i.obj.position.z - DOORSTEP.z) < 1.8).length;
          const chunks = splitOrderIntoBoxChunks(d.contents);
          chunks.forEach((ch, idx) => {
            const sp = doorstepBoxSpot(baseOff + idx);
            addItem({ kind: 'box', x: sp.x, y: sp.y, z: sp.z, ry: sp.ry, data: { contents: ch.contents, hidden: d.hidden, label: d.label } });
          });
          d.state = 'done'; knockT = 3.01; persist(); env.onDelivered && env.onDelivered(d, chunks.length);
        }
      }
    }
    s.deliveries = s.deliveries.filter(d => d.state !== 'done');
  }
  function unpack(it) {
    if (!it || it.kind !== 'box' || it.data.opened) return false;
    it.data.opened = true; const pos = it.obj.position.clone(), ry = it.obj.rotation.y;
    scene.remove(it.obj); it.obj = makeBoxMesh(.5, .36, .4, true); it.obj.position.copy(pos); it.obj.rotation.y = ry; it.obj.traverse(o => { if (o.isMesh) o.userData.item = it; }); scene.add(it.obj);
    it.mass = 1;
    const rawContents = it.data.contents || {};
    const outfitsOnly = {};
    for (const [k, val] of Object.entries(rawContents)) {
      if (k.startsWith('outfit:')) outfitsOnly[k] = Array.isArray(val) ? val : [val | 0, 0];
    }
    const chunks = splitOrderIntoBoxChunks(rawContents);
    const firstChunk = chunks[0] || { packs: [] };
    // Если коробка из старого сохранения содержала слишком много товара — спавним дополнительные закрытые коробки рядом!
    if (chunks.length > 1) {
      for (let bIdx = 1; bIdx < chunks.length; bIdx++) {
        addItem({
          kind: 'box',
          x: pos.x + (bIdx % 2 ? .56 : -.56),
          y: pos.y,
          z: pos.z - Math.floor((bIdx - 1) / 2) * .48,
          ry: ry + R(-.1, .1),
          data: { contents: chunks[bIdx].contents, hidden: it.data.hidden, label: it.data.label }
        });
      }
    }
    const cCos = Math.cos(ry), cSin = Math.sin(ry);
    let packIdx = 0;
    for (const p of firstChunk.packs) {
      const lx = (p.col ? 0.010 : -0.010);
      const lz = (p.col === 0 ? -0.094 : 0.094);
      const ly = 0.030 + p.layer * 0.088;
      const wx = pos.x + lx * cCos + lz * cSin;
      const wz = pos.z - lx * cSin + lz * cCos;
      const wy = pos.y + ly;
      const lry = (p.col ? 0.02 : -0.02);
      const pk = addItem({
        kind: 'pack',
        x: wx, y: wy, z: wz,
        ry: ry + lry,
        inBoxId: it.id,
        boxOff: { lx, ly, lz, lry },
        data: { goodId: p.goodId, count: p.count, maxCount: Math.max(5, p.count), unitCost: p.unitCost, opened: false, hidden: !!it.data.hidden }
      });
      pk.inBoxId = it.id;
      pk.boxOff = { lx, ly, lz, lry };
      packIdx++;
    }
    env.onUnpack && env.onUnpack({ contents: outfitsOnly, hidden: it.data.hidden, spawnedPacks: packIdx, extraBoxes: Math.max(0, chunks.length - 1) });
    it.data.contents = null;
    persist();
    return true;
  }

  // ================= дисковый телефон на прилавке (js/phone.js) =================
  const ph = createPhone({ scene, camera, std, audio: env.audio });
  ph.root.position.set(-1.05, 1.005, KD - .22); ph.root.rotation.y = Math.PI * .85;
  ph.setCounter({ x1: -1.45, x2: 1.45, z1: KD - .45, z2: KD }, 1.005);
  let phoneBox = ph.box();
  function setPhoneModel() {}
  function phoneTick(dt) { ph.tick(dt); if (!ph.calling) phoneBox = ph.box(); }
  function startCall() { ph.startCall(); }
  function setDialing() {}
  function dialNumber(d, done) { ph.dialNumber(d, done); }
  function hangUp() { ph.hangUp(); }

  // ================= блокнот на прилавке =================
  const NOTE_REST = { x: -.66, y: 1.005, z: KD - .24, ry: Math.PI + .14 };
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
    const hold = tmp.copy(camera.position).add(tmp2.set(0, -.08, -.36).applyQuaternion(camera.quaternion));
    holdQ.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - .25, 0, 0)));
    if (noteState === 'lift') { const k = ease(Math.min(1, noteT / .7)); note.position.lerpVectors(restPos, hold, k); note.position.y += Math.sin(k * Math.PI) * .08; note.quaternion.slerpQuaternions(restQ, holdQ, k); if (noteT >= .7) { noteState = 'held'; const f = noteOnDone; noteOnDone = null; f && f(); } }
    else if (noteState === 'held') { note.position.copy(hold); note.quaternion.copy(holdQ); }
    else if (noteState === 'lower') { const k = ease(Math.min(1, noteT / .6)); note.position.lerpVectors(hold, restPos, k); note.quaternion.slerpQuaternions(holdQ, restQ, k); if (noteT >= .6) { noteState = 'rest'; note.position.copy(restPos); note.quaternion.copy(restQ); const f = noteOnDone; noteOnDone = null; f && f(); } }
  }

  // ================= пепельница =================
  const ashtray = new THREE.Group(); ashtray.position.set(.7, 1.005, KD - .28); ashtray.visible = false; scene.add(ashtray);
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
  const handR = makeRigHand(std); handR.visible = false; vm.add(handR);

  // Сигарета зажата между указательным (x = -.026) и средним (x = -.008) пальцами:
  // фильтр (−Y сигареты) выступает на ладонную сторону вправо-вниз к большому пальцу (−X, −Y кисти),
  // а белая часть с тлеющим кончиком (+Y сигареты) уходит влево-вверх (+X, −Z кисти) за средний палец.
  const cig = makeCigarette(std);
  const cigNode = new THREE.Group();
  // Сигарета зажата в верхней части между указательным и средним пальцами
  cigNode.position.set(-.016, -.013, -.148);
  const cigBaseQ = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(.641, -.022, -.767).normalize()
  );
  // У рта сигарета разворачивается оранжевым фильтром на передний план (+Z) круто вниз-вправо прямо к губам игрока, а тлеющим кончиком — вперёд-вверх-влево (−Z)
  const cigMouthQ = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(.495, .059, -.867).normalize()
  );
  // При развороте кисти для стряхивания пепла сигарета наклоняется кончиком влево-вниз, а фильтром — вверх-вправо к большому пальцу
  const cigAshQ = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(.565, -.755, .332).normalize()
  );
  cigNode.quaternion.copy(cigBaseQ);
  cigNode.add(cig);
  handR.add(cigNode);

  const emberLight = new THREE.PointLight(0xff6828, 0, .55, 2); cig.add(emberLight); emberLight.position.y = .065;
  let cigModel = null; function setCigaretteModel(o) { cigModel = o; }

  // бутылка — в ладони поперёк пальцев: ось бутылки вдоль −X кисти, горлышко со стороны большого и указательного пальцев
  let bottleModel = null; const bottleNode = new THREE.Group(); bottleNode.position.set(-.006, -.036, -.088); bottleNode.rotation.z = Math.PI / 2; handR.add(bottleNode);
  const GRIP_Y = .135, NECK = .275;
  const capMat = std({ color: 0xc8b06a, metalness: .75, roughness: .32 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.0142, .0142, .018, 14), capMat); cap.frustumCulled = false;
  const bore = new THREE.Mesh(new THREE.CylinderGeometry(.0108, .0108, .003, 14), std({ color: 0x0d110f, roughness: .92 })); bore.frustumCulled = false;
  const btlLabelMats = {};
  function getBottleLabelMat(kind = 'vodka') {
    if (btlLabelMats[kind]) return btlLabelMats[kind];
    const c = document.createElement('canvas'); c.width = 512; c.height = 192;
    const g = c.getContext('2d');
    const cfg = kind === 'beer'
      ? { bg: '#f0d278', border: '#8a2818', title: 'ПИВО', sub: 'ЗАВОДСКОЕ · СВЕТЛОЕ', fg: '#1e1610', accent: '#a82818' }
      : kind === 'samogon'
      ? { bg: '#dfd3b8', border: '#4a3622', title: 'САМОГОН', sub: 'ДОМАШНИЙ ПЕРВАЧ · 60°', fg: '#2b1e12', accent: '#7a2216' }
      : kind === 'soda'
      ? { bg: '#f6df68', border: '#c42b1c', title: 'ЛИМОНАД', sub: 'БУРАТИНО · ГОСТ', fg: '#a81e14', accent: '#1e6b34' }
      : { bg: '#f4efe2', border: '#b8281c', title: 'ВОДКА', sub: 'СПИРТ «КОРОЛЬ» · 0.5 Л', fg: '#181818', accent: '#b8281c' };
    g.fillStyle = cfg.bg; g.fillRect(0, 0, 512, 192);
    g.strokeStyle = cfg.border; g.lineWidth = 8; g.strokeRect(6, 6, 500, 180);
    g.strokeStyle = cfg.accent; g.lineWidth = 3; g.strokeRect(16, 16, 480, 160);
    for (const cx of [128, 384]) {
      g.fillStyle = cfg.accent; g.font = '900 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(cfg.title, cx, 78);
      g.fillStyle = cfg.fg; g.font = '900 22px Arial, sans-serif';
      g.fillText(cfg.sub, cx, 132);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return (btlLabelMats[kind] = new THREE.MeshStandardMaterial({ map: t, roughness: .55, metalness: .04 }));
  }
  const btlLabelGeo = new THREE.CylinderGeometry(.0365, .0365, .092, 18, 1, true);
  const fpLabelMesh = new THREE.Mesh(btlLabelGeo, getBottleLabelMat('vodka'));
  fpLabelMesh.position.set(0, .105, 0);
  fpLabelMesh.frustumCulled = false;
  let curDrinkMesh = null;
  function updateDrinkBottleMesh(kind) {
    while (bottleNode.children.length > 0) {
      bottleNode.remove(bottleNode.children[0]);
    }
    curDrinkMesh = null;
    const g = new THREE.Group();
    const drinkId = (kind === 'buratino' || kind === 'soda') ? 'soda' : (kind || 'vodka');
    const bMesh = env.getItemMesh ? env.getItemMesh(drinkId) : null;
    const bH = drinkId === 'beer' ? .24 : drinkId === 'samogon' ? .26 : drinkId === 'soda' ? .23 : .28;
    if (bMesh) {
      const capsToRemove = [];
      bMesh.traverse(m => {
        if (m.userData && m.userData.isCap) {
          capsToRemove.push(m);
          return;
        }
        if (m.isMesh && m.position && m.position.y > bH * .91) {
          capsToRemove.push(m);
          return;
        }
        if (m.isMesh) {
          m.frustumCulled = false;
          if (m.material) {
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach(mt => {
              mt.depthWrite = true;
              mt.depthTest = true;
              if (mt.transparent && mt.opacity < .70) mt.opacity = .82;
            });
          }
        }
      });
      for (const cm of capsToRemove) if (cm.parent) cm.parent.remove(cm);
      bMesh.position.set(0, -GRIP_Y, 0);
      g.add(bMesh);
    } else {
      const cfg = drinkId === 'beer'
        ? { glass: 0x5c3214, cap: 0xd4a72c }
        : drinkId === 'samogon'
        ? { glass: 0xc8d2c4, cap: 0x5c432e }
        : drinkId === 'soda'
        ? { glass: 0xc97b28, cap: 0xc0392b }
        : { glass: 0x2d5a36, cap: 0xc8b06a };
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .27, 14), std({ color: cfg.glass, roughness: .14, transparent: true, opacity: .88, depthWrite: true }));
      bm.position.set(0, 0, 0); g.add(bm);
      const lm = new THREE.Mesh(btlLabelGeo, getBottleLabelMat(drinkId));
      lm.position.set(0, 0, 0); g.add(lm);
    }
    const capC = (drinkId === 'beer' || drinkId === 'vodka') ? 0xd4a72c : (drinkId === 'samogon') ? 0x5c3c24 : 0xc0392b;
    capMat.color.setHex(capC);
    const capY = bH * .945 - GRIP_Y;
    cap.userData.restY = capY;
    cap.position.set(0, capY, 0);
    cap.rotation.set(0, 0, 0);
    g.add(cap);
    curDrinkMesh = g;
    bottleNode.add(curDrinkMesh);
  }
  function styleBottle(kind) {
    updateDrinkBottleMesh(kind);
  }
  function emptyBottleMesh(kind = "vodka") {
    const drinkId = (kind === 'buratino' || kind === 'soda') ? 'soda' : (kind || 'vodka');
    const cfg = drinkId === "beer"
      ? { glass: 0x5c3214, op: .85, rgh: .15, h: .24, r: .034 }
      : drinkId === "samogon"
      ? { glass: 0xc8d2c4, op: .75, rgh: .30, h: .26, r: .038 }
      : drinkId === "soda"
      ? { glass: 0xc97b28, op: .80, rgh: .14, h: .23, r: .032 }
      : { glass: 0x2d5a36, op: .78, rgh: .12, h: .28, r: .036 };
    const g = new THREE.Group();
    const piv = new THREE.Group();
    piv.position.set(0, cfg.h / 2, 0);
    const spin = new THREE.Group();
    piv.add(spin);
    g.add(piv);
    g.userData.piv = piv;
    g.userData.spin = spin;

    // Честная стеклянная бутылка стандартного размера (23-28 см) с горлышком и этикеткой
    const bm = new THREE.MeshStandardMaterial({ color: cfg.glass, roughness: cfg.rgh, metalness: .08, transparent: true, opacity: cfg.op, depthWrite: true });
    // Корпус бутылки
    const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(cfg.r, cfg.r, cfg.h * .62, 14), bm);
    bodyM.position.y = -cfg.h * .19; bodyM.castShadow = true; spin.add(bodyM);
    // Плечи бутылки
    const shM = new THREE.Mesh(new THREE.CylinderGeometry(cfg.r * .40, cfg.r, cfg.h * .20, 12), bm);
    shM.position.y = cfg.h * .22; shM.castShadow = true; spin.add(shM);
    // Горлышко
    const nkM = new THREE.Mesh(new THREE.CylinderGeometry(cfg.r * .36, cfg.r * .36, cfg.h * .18, 10), bm);
    nkM.position.y = cfg.h * .41; nkM.castShadow = true; spin.add(nkM);

    // Этикетка на пустой бутылке
    const lbMat = getBottleLabelMat(drinkId);
    const lbGeo = new THREE.CylinderGeometry(cfg.r * 1.02, cfg.r * 1.02, cfg.h * .34, 16, 1, true);
    const lb = new THREE.Mesh(lbGeo, lbMat);
    lb.position.y = -cfg.h * .18;
    lb.castShadow = true;
    spin.add(lb);
    return g;
  }
  function stashHeldBottle() {
    if (!held || held.kind !== 'bottle') return;
    const it = held; held = null;
    if (inK(P.x, P.z)) {
      const existing = items.filter(x => x !== it && x.kind === 'bottle' && inK(x.obj.position.x, x.obj.position.z)).length;
      const slots = [
        [-1.15, .035, .48], [-1.02, .035, .52], [-1.22, .035, .34], [-.92, .035, .52],
        [-.78, .035, -.68], [-.62, .035, -.72], [-.46, .035, -.72], [-.30, .035, -.72]
      ];
      const sl = slots[existing % slots.length];
      it.state = 'rest';
      it.obj.position.set(sl[0] + R(-.04, .04), sl[1], sl[2] + R(-.03, .03));
      it.obj.rotation.set(0, R(0, 6.28), 0);
      syncCol(it); persist();
    } else {
      it.obj.position.set(P.x + R(-.25, .25), Math.max(.05, camera.position.y - .45), P.z + R(-.25, .25));
      it.state = 'fall'; it.vy = 0; persist();
    }
    env.onCtl && env.onCtl();
  }
  function giveEmptyBottle(kind = hab.kind || 'vodka', autoStash = false) {
    if (held && held.kind === 'bottle') stashHeldBottle();
    const it = addItem({ kind: 'bottle', x: P.x + R(-.08, .08), y: Math.max(.1, camera.position.y - .5), z: P.z + R(-.08, .08), ry: R(0, 6.28), data: { drinkKind: kind } });
    pick(it);
    if (autoStash) stashHeldBottle();
    else persist();
    return it;
  }
  function setBottleModel(o) {
    bottleModel = o;
    // Обновляем уже созданные пустые бутылки в мире, чтобы у них тоже была 3D-модель
    for (const it of items) if (it.kind === "bottle") {
      const pos = it.obj.position.clone(), ry = it.obj.rotation.y;
      scene.remove(it.obj);
      it.obj = emptyBottleMesh(it.data && it.data.drinkKind);
      it.obj.position.copy(pos); it.obj.rotation.y = ry;
      it.obj.traverse(m => { if (m.isMesh) m.userData.item = it; });
      applyBottlePose(it);
      scene.add(it.obj);
    }
  }

  // Клубы дыма от первого лица (в overlayScene)
  const smokeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 60);
    gr.addColorStop(0, 'rgba(205,202,196,.42)');
    gr.addColorStop(.48, 'rgba(185,182,176,.20)');
    gr.addColorStop(1, 'rgba(170,168,162,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const puffs = [];
  for (let i = 0; i < 36; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.visible = false; vm.add(sp);
    puffs.push({ sp, life: 0, maxLife: 1, v: new THREE.Vector3(), grow: .08 });
  }
  function puff(at, dir, n = 4, big = 1) {
    for (let i = 0; i < n; i++) {
      const p = puffs.find(q => q.life <= 0); if (!p) return;
      p.maxLife = R(1.8, 2.7); p.life = p.maxLife;
      p.sp.visible = true;
      p.sp.position.copy(at).add(tmp2.set(R(-.025, .025) * big, R(-.02, .02) * big, R(-.015, .015) * big));
      p.v.copy(dir).multiplyScalar(R(.04, .09) * big).add(tmp2.set(R(-.028, .028), R(.035, .075), R(-.015, .015)));
      p.sp.scale.setScalar(R(.065, .105) * big);
      p.grow = R(.055, .095) * big;
    }
  }
  // Падающие частицы стряхнутого пепла (3–4 маленьких серых кубика при щелчке пальцем)
  const ashPartM = std({ color: 0xa8a49e, roughness: .95 });
  const ashDrops = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.0042, .0042, .0042), ashPartM);
    m.visible = false; m.frustumCulled = false; vm.add(m);
    ashDrops.push({ m, life: 0, v: new THREE.Vector3(), rv: new THREE.Vector3() });
  }
  function spawnAshDrops(at) {
    for (let i = 0; i < 4; i++) {
      const a = ashDrops.find(q => q.life <= 0); if (!a) break;
      a.life = .75; a.m.visible = true;
      a.m.position.copy(at).add(tmp2.set((i - 1.5) * .0035 + R(-.001, .001), R(-.003, .002), R(-.002, .002)));
      a.v.set(R(-.015, .015), R(-.16, -.24), R(-.01, .01));
      a.rv.set(R(-8, 8), R(-8, 8), R(-8, 8));
    }
  }
  function smokeTick(dt) {
    for (const p of puffs) if (p.life > 0) {
      p.life -= dt;
      p.sp.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - dt * .65);
      p.sp.scale.addScalar(p.grow * dt);
      const u = 1 - p.life / p.maxLife;
      const fadeIn = Math.min(1, u * 4.5);
      const fadeOut = Math.pow(Math.max(0, p.life / p.maxLife), 1.25);
      p.sp.material.opacity = .14 * envLum * fadeIn * fadeOut;
      p.sp.material.color.copy(envSmokeCol);
      if (p.life <= 0) p.sp.visible = false;
    }
    for (const a of ashDrops) if (a.life > 0) {
      a.life -= dt;
      a.v.y -= .65 * dt;
      a.m.position.addScaledVector(a.v, dt);
      a.m.rotation.x += a.rv.x * dt; a.m.rotation.y += a.rv.y * dt; a.m.rotation.z += a.rv.z * dt;
      if (a.life <= 0) a.m.visible = false;
    }
  }

  const envSmokeCol = new THREE.Color(0x9a9e9e); let envLum = .65;
  function setEnvLight(skyCol, warmCol, warmMix, lum) {
    envLum = lum;
    envSmokeCol.copy(skyCol).lerp(warmCol, warmMix).multiplyScalar(clamp(lum * 1.15, .28, .95));
  }
  const fx = { smoke: 0, drunk: 0, drunkTarget: 0, handOut: false, smokePitch: 0 };
  function startSmoke() {
    if (hab.busy) return false;
    Object.assign(hab, { busy: 'smoke', t: 0, out: 0, lit: true, doneAsk: false, puffs: 0, burn: 1, ashLen: .003, lastCycle: -1, exhaledCycle: -1, flickedCycle: -1 });
    handR.visible = true; cigNode.visible = true; bottleNode.visible = false;
    cig.userData.setBurn(1, .003, 1.1); emberLight.intensity = .3;
    handR.position.set(.075, -.38, -.29);
    handR.quaternion.copy(SM.restQ);
    handR.pose(HAND_POSES.pinch, null);
    env.audio && env.audio.click(3000, .3, 0, .08);
    env.onCtl();
    return true;
  }
  function startDrink(kind, firstSip = true) {
    if (hab.busy) return false;
    updateDrinkBottleMesh(kind);
    Object.assign(hab, { busy: 'drink', kind, firstSip, t: 0, out: 0, sips: 0, gulps: 0, flick: 0, capOff: !firstSip });
    handR.visible = true; cigNode.visible = false; bottleNode.visible = true;
    cap.visible = !!firstSip; cap.position.set(0, cap.userData.restY ?? (.25 - GRIP_Y), 0); cap.rotation.set(0, 0, 0);
    handR.position.set(.14, -.42, -.34);
    handR.pose(HAND_POSES.grip, null);
    env.onCtl();
    return true;
  }
  function finishHabit(how) {
    if (hab.busy === 'smoke') {
      if (how === 'ashtray') { const s = S(); s.butts = (s.butts || 0) + 1; setButts(s.butts); }
      else if (how === 'urn') { env.audio && env.audio.click(500, .3, 0, .04); }
      else if (how === 'throw') {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .025, 6), buttM); camera.getWorldDirection(tmp); b.position.copy(camera.position).addScaledVector(tmp, .3); b.userData.v = tmp.clone().multiplyScalar(3).add(tmp2.set(0, 1.5, 0)); scene.add(b); thrown.push(b); }
    } else if (hab.busy === 'drink') {
      bottleNode.visible = false;
    }
    hab.busy = null; hab.out = .4; fx.handOut = true; env.onCtl();
  }
  const thrown = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _p2 = new THREE.Vector3();
  const quatFB = (f, b, out) => { const z = f.clone().normalize().negate(), y = b.clone().addScaledVector(z, -b.dot(z)).normalize(), x = new THREE.Vector3().crossVectors(y, z); return out.setFromRotationMatrix(_m.makeBasis(x, y, z)); };
  const quatBottle = (n, b, out) => { const x = n.clone().normalize().negate(), y = b.clone().addScaledVector(x, -b.dot(x)).normalize(), z = new THREE.Vector3().crossVectors(x, y); return out.setFromRotationMatrix(_m.makeBasis(x, y, z)); };

  // Ключевые положения руки для курения:
  // 1) Покой (справа снизу, ладонь полуоборотом к лицу, сигарета под углом ~42° влево-вверх)
  // 2) Затяжка у рта (рука приближается вплотную к губам снизу по центру-слева, фильтр уходит прямо в рот у нижнего края экрана, а сигарета с тлеющим кончиком поднимается под ~58° перед глазами, не перекрываясь пальцами)
  // 3) Стряхивание пепла (кисть поворачивается боком так, что указательный и средний пальцы стоят вертикально, указательный спереди, средний чуть выше сзади, сигарета наклонена влево-вниз, а большой палец щёлкает по фильтру)
  const SM = {
    restP:  V(.078, -.262, -.320),
    restQ:  quatFB(V(-.16, .97, -.18), V(.26, -.18, -.95), new THREE.Quaternion()),
    mouthP: V(-.022, -.246, -.188),
    mouthQ: quatFB(V(-.12, .98, -.16), V(.32, -.16, -.93), new THREE.Quaternion()),
    ashP:   V(.068, -.194, -.235),
    ashQ:   quatFB(V(-.14, .98, -.14), V(.76, .16, -.63), new THREE.Quaternion()),
  };
  const LIPS = V(0, -.115, -.1);
  const DR = { restQ: quatBottle(V(.08, 1, .05), V(.7, 0, .7), new THREE.Quaternion()), restP: V(.17, -.17, -.42),
               mouthQ: quatBottle(V(0, -.3, 1), V(1, 0, 0), new THREE.Quaternion()) };
  const P_ = HAND_POSES;
  function placeByLocal(q, localPt, target) { _p.copy(localPt).applyQuaternion(q); return _p2.copy(target).sub(_p); }

  function habitTick(dt) {
    smokeTick(dt);
    for (const b of thrown.slice()) { b.userData.v.y -= 9.8 * dt; b.position.addScaledVector(b.userData.v, dt); b.rotation.x += dt * 10; if (b.position.y <= .01) { b.position.y = .01; b.userData.v.set(0, 0, 0); b.userData.life = (b.userData.life || 20) - dt; if (b.userData.life <= 0) { scene.remove(b); thrown.splice(thrown.indexOf(b), 1); } } }
    fx.smoke = Math.max(0, fx.smoke - dt / 70);
    fx.drunk += (fx.drunkTarget - fx.drunk) * Math.min(1, dt * .45);
    if (hab.busy !== 'drink') fx.drunkTarget = Math.max(0, fx.drunkTarget - dt / 135);
    if (hab.out > 0) {
      hab.out -= dt; fx.handOut = hab.out > 0;
      handR.position.lerp(_p.set(.15, -.52, -.32), Math.min(1, dt * 8));
      handR.pose(P_.relaxed, dt, 8);
      fx.smokePitch = 0; if (hab.out <= 0) { handR.visible = false; fx.handOut = false; }
      return;
    }
    if (!hab.busy) { fx.smokePitch = 0; return; }
    if (!hab.freeze) hab.t += dt;
    const t = hab.t, k = Math.min(1, dt * 12);

    if (hab.busy === 'smoke') {
      const cycIdx = Math.floor(t / 8.0);
      const c = t % 8.0;

      let toMouth = 0, toAsh = 0, inhale = 0;
      if (c >= 1.25 && c < 1.85) toMouth = ease((c - 1.25) / .60);
      else if (c >= 1.85 && c < 3.20) { toMouth = 1; inhale = 1; }
      else if (c >= 3.20 && c < 3.75) toMouth = 1 - ease((c - 3.20) / .55);
      else if (c >= 5.50 && c < 5.90) toAsh = ease((c - 5.50) / .40);
      else if (c >= 5.90 && c < 7.20) toAsh = 1;
      else if (c >= 7.20 && c < 7.75) toAsh = 1 - ease((c - 7.20) / .55);

      if (hab.lit) {
        // Сигарета заметно сгорает с каждой затяжкой (~24% длины за цикл, полностью до окурка за 4 затяжки)
        hab.burn = Math.max(0, hab.burn - dt * (inhale ? .145 : .0065));
        hab.ashLen = Math.min(.0095, hab.ashLen + dt * (inhale ? .0048 : .0003));
      }
      fx.smokePitch += (-toMouth * .055 - fx.smokePitch) * Math.min(1, dt * 10);
      const glow = inhale ? 3.2 : (hab.burn > .02 ? 1.05 + Math.sin(t * 6) * .12 : .35);
      emberLight.position.y = .008 + hab.burn * .058;
      emberLight.intensity = glow * .38;

      if (c >= 3.70 && c < 4.65) {
        if (hab.exhaledCycle !== cycIdx) {
          hab.exhaledCycle = cycIdx;
          hab.puffs++;
          fx.smoke = Math.min(1, fx.smoke + .25);
          if (!hab.doneAsk) { hab.doneAsk = true; env.onCtl(); }
          puff(V(-.028, -.105, -.28), V(-.016, .042, -.01), 6, .95);
        } else if (Math.random() < dt * 9) {
          puff(V(-.030 + R(-.025, .025), -.095 + R(-.018, .018), -.28), V(-.012, .045, -.01), 2, .9);
        }
      }

      let flickJolt = 0;
      if (c >= 6.75 && c < 7.15) {
        const u = (c - 6.75) / .40;
        flickJolt = Math.sin(u * Math.PI);
        if (c >= 6.82 && hab.flickedCycle !== cycIdx) {
          hab.flickedCycle = cycIdx;
          handR.updateMatrixWorld(true);
          cig.userData.tipNode.getWorldPosition(_p);
          spawnAshDrops(_p);
          hab.ashLen = .002;
          env.audio && env.audio.click(2200, .18, 0, .04);
        }
      }

      cig.userData.setBurn(hab.burn, hab.ashLen, glow);
      // Плавный поворот самой сигареты между пальцами: к губам (круто вверх-влево от фильтра у рта) и при стряхивании пепла (кончиком влево-вниз)
      _q2.setFromAxisAngle(V(0, 0, 1), -flickJolt * .11);
      cigNode.quaternion.copy(cigBaseQ);
      if (toMouth > 0) cigNode.quaternion.slerp(cigMouthQ, toMouth);
      else if (toAsh > 0) cigNode.quaternion.slerp(cigAshQ, toAsh);
      cigNode.quaternion.multiply(_q2);
      cigNode.position.set(
        -.017 - toMouth * .005,
        -.016 - toMouth * .012 + toAsh * .012,
        -.152 - toMouth * .014 + toAsh * .024
      );

      // Позиция и поворот кисти
      _q.copy(SM.restQ);
      if (toMouth > 0) _q.slerp(SM.mouthQ, toMouth);
      else if (toAsh > 0) _q.slerp(SM.ashQ, toAsh);

      const tgt = _p.copy(SM.restP);
      if (toMouth > 0) {
        tgt.lerp(SM.mouthP, toMouth);
        // Во время самой затяжки фильтр чуть плотнее прижимается к губам
        if (inhale) {
          const drawK = Math.sin(clamp((c - 1.85) / 1.35, 0, 1) * Math.PI);
          tgt.z += drawK * .006;
          tgt.y -= drawK * .003;
        }
      } else if (toAsh > 0) {
        tgt.lerp(SM.ashP, toAsh);
      }
      if (t < .35) tgt.y -= (1 - ease(t / .35)) * .22;
      tgt.y += Math.sin(t * 2.2) * .002 + flickJolt * .005;

      handR.position.lerp(tgt, k);
      handR.quaternion.slerp(_q, k);

      // Поза пальцев: в затяжке средний палец сгибается под сигарету (не перекрывая её), при стряхивании — указательный спереди, средний вертикально сзади
      let pose = P_.pinch;
      if (toMouth > 0) {
        pose = handR.mix([P_.pinch, 1 - toMouth], [P_.pinchHard, toMouth + .001]);
      } else if (toAsh > 0) {
        pose = (c >= 6.75 && c < 7.18) ? P_.ashFlick : handR.mix([P_.pinch, 1 - toAsh], [P_.ashReady, toAsh + .001]);
      }
      handR.pose(pose, dt, 15, .006, t);
      if (hab.burn <= .01 && c >= 7.65) {
        finishHabit(inK(P.x, P.z) ? 'ashtray' : 'throw');
      }
    } else if (hab.busy === 'drink') {
      // Фазы анимации выпивания (3.8 с):
      // 0.00..0.45 — рука плавно поднимает бутылку справа снизу (горлышком вверх-влево, этикеткой и пальцами к игроку)
      // 0.45..0.95 — если бутылка новая, большой палец со щелчком сбивает крышку вверх
      // 0.95..1.55 — поднесение горлышка бутылки прямо к губам игрока снизу по центру
      // 1.55..3.15 — три выраженных глотка: на каждом глотке бутылка сильнее запрокидывается донышком вверх-вперёд, а голова игрока слегка откидывается назад
      // 3.15..3.80 — плавное опускание бутылки обратно
      let toMouth = 0;
      if (t >= .95 && t < 1.55) toMouth = ease((t - .95) / .60);
      else if (t >= 1.55 && t < 3.15) toMouth = 1;
      else if (t >= 3.15 && t < 3.75) toMouth = 1 - ease((t - 3.15) / .60);

      if (t > .52 && cap.visible && !hab.capOff) {
        hab.capOff = true; hab.flick = .32;
        env.audio && env.audio.click(1800, .5, 0, .06);
      }
      if (hab.capOff && cap.visible) {
        cap.position.y += dt * .65; cap.position.x -= dt * .22; cap.rotation.z += dt * 18;
        if (cap.position.y > .52) cap.visible = false;
      }
      if (hab.flick > 0) hab.flick -= dt;

      let gulp = 0;
      if (t >= 1.55 && t < 3.15) {
        const gp = (t - 1.55) / .52, gi = Math.floor(gp), gf = gp - gi;
        gulp = Math.sin(gf * Math.PI);
        if (gi > hab.gulps - 1 && gf > .35 && hab.gulps < 3) {
          hab.gulps++;
          env.audio && env.audio.gulp && env.audio.gulp();
        }
      }
      // Начисление опьянения зависит от крепости напитка и дозы:
      // самогон (+0.55 за приём — пьянит быстрее всего), спирт/водка (+0.36 — средне), пиво (+0.18 — слабее, но с нескольких порций тоже развозит)
      if (t > 1.75 && hab.sips === 0) {
        hab.sips = 1;
        const strong = hab.kind === 'soda' ? 0 : ({ samogon: .70, vodka: .48, beer: .28 }[hab.kind] || .28);
        fx.drunkTarget = Math.min(1.8, fx.drunkTarget + strong);
        env.onDrink && env.onDrink(hab.kind, strong, fx.drunkTarget);
      }
      if (t > 3.80) {
        const dKind = hab.kind || 'vodka';
        const willBlackout = fx.drunkTarget >= 1.35;
        hab.capOff = false; fx.smokePitch = 0;
        finishHabit('done');
        const f = hab.onDrinkEnd;
        if (f) { hab.onDrinkEnd = null; f(dKind, willBlackout); }
        if (willBlackout && env.onBlackout) env.onBlackout();
        return;
      }

      // Лёгкое запрокидывание головы назад при глотках
      fx.smokePitch += (toMouth * (.045 + gulp * .038) - fx.smokePitch) * Math.min(1, dt * 10);

      // Ось бутылки n (от дна к горлышку = −X кисти):
      // В покое: бутылка стоит почти вертикально справа снизу, чуть наклонена горлышком влево-вверх.
      // У рта: горлышко направлено прямо к губам игрока (+Z к камере, снизу по центру), а корпус уходит вправо-вниз-вперёд;
      // на каждом глотке донышко приподнимается выше (бутылка запрокидывается сильнее).
      // Ось бутылки n (от дна к горлышку = −X кисти):
      // В покое (t < 0.95): бутылка стоит справа снизу горлышком вверх.
      // При поднесении ко рту (toMouth → 1): бутылка наклоняется горлышком вниз-влево-назад прямо в рот игрока (LIPS),
      // а корпус и донышко поднимаются вверх-вправо-вперёд и запрокидываются сильнее на каждом из 3 глотков!
      // Предплечье (+Z кисти) всегда естественно уходит вниз-вправо к правому плечу игрока (b = elbowDir × (−n)).
      const nRest = V(-.12, .98, -.12);
      const nMouth = V(-.34, -.26 - gulp * .22, .88);
      const n = nRest.lerp(nMouth, toMouth).normalize();

      const elbowRest = V(.35, -.82, .45);
      const elbowMouth = V(.55, -.78, .32);
      const elbowDir = elbowRest.lerp(elbowMouth, toMouth).normalize();
      const b = new THREE.Vector3().crossVectors(elbowDir, n.clone().negate()).normalize();
      quatBottle(n, b, _q);

      const neckLocal = V(-(NECK - GRIP_Y), 0, 0).add(bottleNode.position);
      const restTarget = _p2.set(.125, -.165, -.33);
      if (t < .45) restTarget.y -= (1 - ease(t / .45)) * .28;
      // Позиция горлышка прямо у губ игрока у нижнего края экрана (корпус и донышко бутылки поднимаются перед глазами и запрокидываются выше на каждом глотке)
      const mouthTarget = V(.005, -.074 - gulp * .004, -.122);

      const restPos2 = placeByLocal(_q, bottleNode.position, restTarget).clone();
      const mouthPos = placeByLocal(_q, neckLocal, mouthTarget).clone();
      handR.position.lerp(restPos2.lerp(mouthPos, toMouth), k);
      handR.quaternion.slerp(_q, k);

      const closeK = Math.min(1, t / .40);
      const pose = hab.flick > 0
        ? handR.mix([P_.grip, 1], [P_.thumbFlick, 1.35])
        : handR.mix([P_.open, 1 - closeK], [P_.grip, closeK + .001]);
      handR.pose(pose, dt, 16, .008, t);
    }
  }
  const habit = { get busy() { return hab.busy; }, get canFinish() { return hab.busy === 'smoke' && hab.doneAsk; }, startSmoke, startDrink, finishHabit, giveEmptyBottle, stashHeldBottle, set onDrinkEnd(f) { hab.onDrinkEnd = f; }, debugPose(t) { hab.t = t; hab.freeze = t != null; }, get hand() { return handR; } };

  return {
    makeHand, items, addItem, removeItem, rebuildPackItem, loadItems, persist, lookItem, pick, placeHeld, dropHeld, trashHeld, unpack, lookingAtOpenBox, throwIntoBox, shatterBottle, rayPlace, surfaceBelow, get held() { return held; },
    canPlace: () => {
      if (!held) return false;
      const pl = rayPlace(1.25, held);
      return !!pl;
    },
    rayPlaceShelf: (maxD = 1.05) => {
      const pl = rayPlace(maxD, held);
      return (pl && pl.s && pl.s.name === 'shelf') ? { point: new THREE.Vector3(pl.x, pl.y, pl.z), rowIdx: pl.s.rowIdx } : null;
    },
    lookingAtPhone: () => { ray.setFromCamera(new THREE.Vector2(0, 0), camera); const h = ray.ray.intersectBox(phoneBox, tmp); return h && h.distanceTo(camera.position) < 1.8; },
    lookingAtNotepad: () => { const b = noteBox(); if (!b) return false; ray.setFromCamera(new THREE.Vector2(0, 0), camera); const h = ray.ray.intersectBox(b, tmp); return h && h.distanceTo(camera.position) < 1.6; },
    lookingAtAshtray: () => { ray.setFromCamera(new THREE.Vector2(0, 0), camera); const h = ray.ray.intersectBox(ashBox, tmp); return h && h.distanceTo(camera.position) < 1.6; },
    setPhoneModel, startCall, setDialing, dialNumber, hangUp, get calling() { return ph.calling; }, phone: ph,
    setNotepadModel, openNotepad, closeNotepad, get notepadState() { return noteState; },
    setCigaretteModel, setBottleModel, setButts, setEnvLight, habit, fx,
    tick(dt, dHour) { itemsTick(dt); deliveryTick(dt, dHour); phoneTick(dt); noteTick(dt); habitTick(dt); }, stashHeldBottle,
    heavy: () => held ? held.mass : 0,
  };
}
