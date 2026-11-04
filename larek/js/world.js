// 3D-мир «Ларька»: город 90-х, ларёк с интерьером, игрок от первого лица, люди, машины, погода, сутки.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Human, makeLook, splitStaticModel, preparePeople } from './npc.js';
import { createWeapon } from './weapon.js';
import { createLife } from './life.js';
import { Rope } from './rope.js';
import { Ragdoll } from './ragdoll.js';
import { createTransport, STOPS } from './transport.js';

const R = (a, b) => a + Math.random() * (b - a);
const RI = (a, b) => Math.floor(R(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

export const QUALITY = {
  low:    { label: 'Низкое',       dpr: .8,  shadows: 0,    draw: 75,  light: 0, snow: 700,  npc: 8,  aniso: 1 },
  medium: { label: 'Среднее',      dpr: 1.1, shadows: 1024, draw: 115, light: 1, snow: 1600, npc: 14, aniso: 2 },
  high:   { label: 'Высокое',      dpr: 1.4, shadows: 2048, draw: 160, light: 2, snow: 3000, npc: 20, aniso: 4 },
  max:    { label: 'Максимальное', dpr: 2,   shadows: 4096, draw: 230, light: 2, snow: 5000, npc: 28, aniso: 8 },
};

export function createWorld(ctx) {
  const cvs = document.getElementById('world');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: false, powerPreference: 'high-performance' }); } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const Q = Object.assign({}, QUALITY[ctx.settings().quality || (isMobile ? 'medium' : 'high')], ctx.settings().custom || {});
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, .05, 400); camera.rotation.order = 'YXZ'; scene.add(camera);
  scene.fog = new THREE.Fog(0x9aa0a0, 20, 160);

  // ---------- пост-обработка ----------
  const gl2 = renderer.capabilities.isWebGL2;
  const halfOk = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: gl2 ? 4 : 0 });
  const post = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, time: { value: 0 }, exposure: { value: 1 }, res: { value: new THREE.Vector2(1, 1) }, vig: { value: 1 }, sat: { value: .72 }, hurt: { value: 0 }, blur: { value: 0 }, dbl: { value: 0 }, smoke: { value: 0 }, dbt: { value: 0 }, retro: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time, exposure, vig, sat, hurt, blur, dbl, smoke, dbt, retro; uniform vec2 res; varying vec2 vUv;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0., 1.); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        if (retro > .5) { float fr = floor(time * 18.0); uv += vec2(hash(vec2(fr, 1.3)) - .5, hash(vec2(fr, 7.1)) - .5) * vec2(.0012, .0018); } // «дрожание» кадра в проекторе
        vec2 d = uv - 0.5; float ca = (0.004 + hurt * 0.02 + retro * .006) * dot(d, d) * 4.0;
        vec3 col = vec3(texture2D(tDiffuse, uv + d*ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d*ca).b);
        if (dbl > 0.001) { vec2 o = vec2(sin(dbt) , cos(dbt * .7)) * dbl; col = mix(col, texture2D(tDiffuse, vUv + o).rgb, .45); }
        if (blur > 0.001) { vec2 px = blur * 6.0 / res; vec3 b = vec3(0.); float w = 0.;
          for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) { float k = 1.0 / (1.0 + float(i*i + j*j)); b += texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * px).rgb * k; w += k; }
          b /= w; vec3 glow = max(b - 0.6, 0.0) * 1.6; col = mix(col, b, blur) + glow * blur; }
        col = aces(col * exposure); col = pow(col, vec3(1.0/2.2));
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, sat * (1.0 - smoke * .25));
        col += vec3(-0.03, 0.006, 0.035) * (1.0 - l) + vec3(0.04, 0.018, -0.03) * l;
        col = (col - 0.5) * 1.12 + 0.5;
        col *= 1.0 - vig * dot(d, d) * 1.5;
        col *= 1.0 - blur * .35;
        col = mix(col, vec3(0.55, 0.05, 0.03), hurt * smoothstep(0.1, 0.6, length(d)) * 0.8);
        col += (hash(vUv * res + fract(time) * 91.7) - 0.5) * (0.05 + smoke * .035);
        if (retro > .5) { // кинематографичный ретро-эффект: плёночная цветокоррекция, крупное зерно, царапины, пыль, мерцание, виньетка и широкоэкранные поля
          float fr = floor(time * 18.0), L = dot(col, vec3(.299, .587, .114));
          col = mix(col, vec3(L) * vec3(1.08, .98, .82), .45); col = mix(col, col * vec3(1.05, .97, .86) + vec3(.02, .015, 0.), .6);
          col = smoothstep(-.05, 1.08, col); col *= .94 + .06 * hash(vec2(fr, 3.3));
          vec2 gp = floor(vUv * res / 2.2); col += (hash(gp + fr * 13.1) - .5) * .09;
          float sx = hash(vec2(fr, 9.9)); if (sx > .55) { float xs = hash(vec2(fr, 5.5)); col *= 1.0 - .35 * smoothstep(.0012, 0., abs(vUv.x - xs)) * step(hash(vec2(fr, 2.2)) * .6, vUv.y); }
          float dust = hash(floor(vUv * res / 3.0) + fr * 7.7); col = mix(col, vec3(.08), step(.9993, dust)); col = mix(col, vec3(.95), step(.99975, hash(floor(vUv * res / 4.0) + fr * 3.1)));
          col *= 1.0 - .55 * pow(length(d * vec2(1.0, .8)) * 1.25, 2.6);
          float bar = .075; col *= step(bar, vUv.y) * step(vUv.y, 1.0 - bar);
        }
        gl_FragColor = vec4(clamp(col, 0., 1.), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
  let DPR = 1;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, Q.dpr);
    renderer.setPixelRatio(DPR); renderer.setSize(w, h, false);
    rt.setSize(Math.round(w * DPR), Math.round(h * DPR)); post.uniforms.res.value.set(w * DPR, h * DPR);
    camera.aspect = w / h; baseFov = w > h ? 66 : 76; camera.updateProjectionMatrix();
  }
  let baseFov = 70;
  window.addEventListener('resize', resize);

  // ---------- текстуры ----------
  const TL = new THREE.TextureLoader();
  function ctex(w, h, draw, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Q.aniso;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    t.userData.canvas = c; return t;
  }
  const allTex = [];
  const regTex = t => { allTex.push(t); return t; };
  function speckle(g, w, h, n, cols, size = 2) { for (let i = 0; i < n; i++) { g.fillStyle = pick(cols); g.globalAlpha = R(.15, .6); const s = R(.5, size); g.fillRect(R(0, w), R(0, h), s, s); } g.globalAlpha = 1; }
  function stains(g, w, h, n, dark = 'rgba(25,20,15,') { for (let i = 0; i < n; i++) { const x = R(0, w), y = R(0, h * .7), sw = R(3, 22), sh = R(20, h * .5); const gr = g.createLinearGradient(0, y, 0, y + sh); gr.addColorStop(0, dark + R(.08, .22) + ')'); gr.addColorStop(1, dark + '0)'); g.fillStyle = gr; g.fillRect(x, y, sw, sh); } }
  const TX = {};
  TX.asphalt = regTex(ctex(512, 512, (g, w, h) => {
    g.fillStyle = '#3b3c3d'; g.fillRect(0, 0, w, h); speckle(g, w, h, 26000, ['#2a2b2c', '#4a4b4c', '#55534f', '#303132'], 2.2);
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(20,20,20,${R(.1, .25)})`; g.beginPath(); g.ellipse(R(0, w), R(0, h), R(20, 80), R(10, 40), R(0, 3), 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(15,15,15,.75)'; g.lineWidth = 1.3;
    for (let i = 0; i < 16; i++) { let x = R(0, w), y = R(0, h); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 9; k++) { x += R(-25, 25); y += R(-25, 25); g.lineTo(x, y); } g.stroke(); }
  }));
  TX.snow = regTex(ctex(512, 512, (g, w, h) => {
    g.fillStyle = '#d9dee2'; g.fillRect(0, 0, w, h); speckle(g, w, h, 14000, ['#c4cad0', '#eef1f4', '#b4bcc4', '#f8f9fa'], 2.5);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(150,160,170,${R(.05, .14)})`; g.beginPath(); g.ellipse(R(0, w), R(0, h), R(10, 60), R(5, 30), R(0, 3), 0, 7); g.fill(); }
    // протоптанные следы
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(120,125,130,.18)'; const x = R(0, w), y = R(0, h); g.beginPath(); g.ellipse(x, y, 4, 9, R(-.3, .3), 0, 7); g.fill(); }
  }));
  TX.dirtySnow = regTex(ctex(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#cfd3d6'); gr.addColorStop(.5, '#8a8478'); gr.addColorStop(1, '#4a443a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, ['#3a352c', '#5a5246', '#9a9488', '#2a2620'], 3);
    for (let i = 0; i < 25; i++) { g.fillStyle = `rgba(40,35,28,${R(.15, .35)})`; g.beginPath(); g.ellipse(R(0, w), R(h * .4, h), R(10, 40), R(4, 12), 0, 0, 7); g.fill(); }
  }));
  TX.road = regTex(ctex(512, 512, (g, w, h) => {
    g.fillStyle = '#2e2f30'; g.fillRect(0, 0, w, h); speckle(g, w, h, 22000, ['#232425', '#3c3d3e', '#47464a'], 2);
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(80,78,70,${R(.12, .25)})`; g.fillRect(R(0, w), R(0, h), R(30, 140), R(20, 70)); }
    g.strokeStyle = 'rgba(10,10,10,.7)'; for (let i = 0; i < 10; i++) { let x = R(0, w), y = R(0, h); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += R(-30, 30); y += R(-15, 15); g.lineTo(x, y); } g.stroke(); }
  }));
  TX.kiosk = regTex(ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#3c6449'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { g.fillStyle = '#2f5039'; g.fillRect(x, 0, 3, h); g.fillStyle = '#4c7a5a'; g.fillRect(x + 3, 0, 2, h); }
    speckle(g, w, h, 3000, ['#2b4533', '#567f62'], 2);
    for (let i = 0; i < 22; i++) { g.fillStyle = `rgba(${RI(110, 140)},${RI(60, 75)},${RI(30, 40)},${R(.25, .6)})`; g.beginPath(); g.ellipse(R(0, w), R(h * .4, h), R(3, 14), R(2, 9), 0, 0, 7); g.fill(); }
    stains(g, w, h, 12, 'rgba(60,35,20,');
  }));
  TX.floor = regTex(ctex(256, 256, (g, w, h) => { // линолеум «под паркет», затёртый
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = pick(['#7a5a3a', '#86643f', '#6d5034', '#80603e']); g.fillRect(x * 64 + (y % 2) * 32, y * 32, 64, 32); g.strokeStyle = '#3a2a1c'; g.strokeRect(x * 64 + (y % 2) * 32, y * 32, 64, 32); }
    g.fillStyle = 'rgba(30,25,20,.35)'; g.beginPath(); g.ellipse(128, 160, 90, 50, 0, 0, 7); g.fill();
    speckle(g, w, h, 4000, ['#3b2c20', '#9a8060', '#2a2018'], 2);
  }, [3, 3]));
  TX.ceiling = regTex(ctex(256, 256, (g, w, h) => { g.fillStyle = '#cfc8b8'; g.fillRect(0, 0, w, h); speckle(g, w, h, 4000, ['#b8b0a0', '#ddd8cc'], 2); stains(g, w, h, 6, 'rgba(120,100,60,'); g.fillStyle = 'rgba(80,70,50,.2)'; g.beginPath(); g.ellipse(128, 128, 30, 30, 0, 0, 7); g.fill(); }));
  TX.ply = regTex(ctex(256, 256, (g, w, h) => { g.fillStyle = '#9c8463'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(80,60,40,.25)'; for (let y = 0; y < h; y += 4) { g.lineWidth = R(.5, 1.2); g.beginPath(); g.moveTo(0, y); for (let x = 0; x < w; x += 32) g.lineTo(x, y + Math.sin(x * .05 + y) * 1.5); g.stroke(); } stains(g, w, h, 4); }));
  TX.rust = regTex(ctex(256, 256, (g, w, h) => { g.fillStyle = '#5c5146'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 22) { g.fillStyle = '#4a4138'; g.fillRect(x, 0, 4, h); } speckle(g, w, h, 5000, ['#7a4a2a', '#8a5a34', '#3d352d'], 3); stains(g, w, h, 14, 'rgba(110,55,25,'); }));
  TX.woodFence = regTex(ctex(256, 256, (g, w, h) => { for (let x = 0; x < w; x += 32) { g.fillStyle = pick(['#5a4a38', '#4e4030', '#665440']); g.fillRect(x, 0, 30, h); g.fillStyle = '#2a2218'; g.fillRect(x + 30, 0, 2, h); } speckle(g, w, h, 4000, ['#3a2e22', '#7a6a55'], 2); stains(g, w, h, 10); }, [6, 1]));
  // обои: «бумага» пользователя + советский узор + потёртости
  function makeWallpaper(img) {
    return regTex(ctex(512, 512, (g, w, h) => {
      if (img) g.drawImage(img, 0, 0, w, h); else { g.fillStyle = '#cbb894'; g.fillRect(0, 0, w, h); }
      g.globalAlpha = .9; g.fillStyle = 'rgba(160,120,70,.25)'; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
      // вертикальные полосы-бордюры и ромбики с цветком
      for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(120,70,40,.28)'; g.fillRect(x, 0, 3, h); g.fillRect(x + 7, 0, 1, h); }
      for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
        const cx = x + 32 + ((y / 64) % 2) * 0, cy = y + 32;
        g.strokeStyle = 'rgba(110,60,35,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - 20); g.lineTo(cx + 16, cy); g.lineTo(cx, cy + 20); g.lineTo(cx - 16, cy); g.closePath(); g.stroke();
        g.fillStyle = 'rgba(150,60,45,.35)'; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 4, 2.5, a, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(90,110,60,.35)'; g.beginPath(); g.ellipse(cx, cy + 10, 2, 6, 0, 0, 7); g.fill();
      }
      // выцветание, пятна, отклеившиеся швы, затёртости у пола
      const gr = g.createLinearGradient(0, h * .7, 0, h); gr.addColorStop(0, 'rgba(60,40,20,0)'); gr.addColorStop(1, 'rgba(60,40,20,.45)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      stains(g, w, h, 18, 'rgba(90,60,30,');
      for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(255,245,220,${R(.08, .2)})`; g.beginPath(); g.ellipse(R(0, w), R(0, h), R(15, 50), R(8, 30), R(0, 3), 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(60,40,20,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(256, 0); g.lineTo(258, h); g.stroke();
      g.fillStyle = 'rgba(240,230,200,.6)'; g.beginPath(); g.moveTo(258, 40); g.lineTo(272, 46); g.lineTo(260, 70); g.fill(); // отклеилось
      speckle(g, w, h, 5000, ['rgba(60,40,20,.5)', 'rgba(255,250,235,.4)'], 2);
    }, [2.2, 1.4]));
  }

  // ---------- материалы ----------
  const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: .85, metalness: 0 }, o));
  const repTex = (t, rx, ry) => { const c = t.clone(); c.needsUpdate = true; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); allTex.push(c); return c; };
  const MAT = {
    kiosk: std({ map: TX.kiosk, roughness: .6, metalness: .35 }),
    wallpaper: std({ map: makeWallpaper(null), roughness: .92 }),
    floor: std({ map: TX.floor, roughness: .65 }),
    ceiling: std({ map: TX.ceiling, roughness: .95 }),
    roofTin: std({ color: 0x5a5d5e, roughness: .5, metalness: .5 }),
    wood: std({ color: 0x6b4f35, roughness: .7 }),
    shelf: std({ map: TX.ply, roughness: .75 }),
    counter: std({ color: 0x7a5a3c, roughness: .55 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xaac4cc, transparent: true, opacity: .1, roughness: .05, metalness: .1, depthWrite: false }),
    steel: std({ color: 0x8a8d8f, roughness: .35, metalness: .8 }),
    dark: std({ color: 0x222426, roughness: .6 }),
    rust: std({ map: TX.rust, roughness: .8, metalness: .25 }),
    concrete: std({ color: 0x8b8880 }),
    lampHead: std({ color: 0x333, emissive: 0xffc070, emissiveIntensity: 0 }),
    bulb: std({ color: 0xfff2d0, emissive: 0xffd9a0, emissiveIntensity: 3 }),
    snow: std({ map: TX.snow, roughness: .95 }),
    woodFence: std({ map: TX.woodFence, roughness: .9 }),
  };
  TL.load('assets/tex/snow_ground.jpg', t => { // фотоснег пользователя: земля, тротуары, обочины; дорога — укатанная, с колеями, наледью и выбоинами
    const img = t.image; t.dispose();
    const mk = (w, h, draw, rx, ry) => { const tx = regTex(ctex(w, h, g => draw(g, w, h))); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(rx, ry); return tx; };
    walk.material.map = mk(1024, 512, (g, w, h) => { g.drawImage(img, 0, 0, w, h); g.fillStyle = 'rgba(70,65,60,.18)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 6, 12, Math.random(), 0, 7); g.fill(); } }, 22, 2.4); walk.material.color.set(0xd0d3d6); walk.material.needsUpdate = true;
    road.material.map = mk(1024, 512, (g, w, h) => {
      g.drawImage(img, 0, 0, w, h); g.fillStyle = 'rgba(40,40,42,.62)'; g.fillRect(0, 0, w, h);
      for (const ly of [.22, .38, .62, .78]) { const gr = g.createLinearGradient(0, h * (ly - .06), 0, h * (ly + .06)); gr.addColorStop(0, 'rgba(25,25,27,0)'); gr.addColorStop(.5, 'rgba(25,25,27,.75)'); gr.addColorStop(1, 'rgba(25,25,27,0)'); g.fillStyle = gr; g.fillRect(0, h * (ly - .06), w, h * .12); }
      g.strokeStyle = 'rgba(10,10,10,.6)'; for (let i = 0; i < 25; i++) { let x = Math.random() * w, y = Math.random() * h; g.lineWidth = Math.random() * 2; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - .5) * 60; y += (Math.random() - .5) * 20; g.lineTo(x, y); } g.stroke(); }
      for (let i = 0; i < 9; i++) { const x = Math.random() * w, y = h * (.15 + Math.random() * .7); g.fillStyle = 'rgba(15,15,15,.75)'; g.beginPath(); g.ellipse(x, y, 14 + Math.random() * 20, 7 + Math.random() * 8, Math.random(), 0, 7); g.fill(); g.strokeStyle = 'rgba(200,200,200,.25)'; g.stroke(); }
      for (let i = 0; i < 6; i++) { const x = Math.random() * w, y = h * (.1 + Math.random() * .8); g.fillStyle = 'rgba(200,215,230,.35)'; g.beginPath(); g.ellipse(x, y, 40 + Math.random() * 60, 10 + Math.random() * 15, 0, 0, 7); g.fill(); }
    }, 14, 1); road.material.roughness = .7; road.material.needsUpdate = true;
  }, undefined, () => {});
  // ---------- снег PBR (ambientCG Snow004/Snow006, CC0): нормали, шероховатость, макро-вариация против повторов, искры ----------
  const snowU = { sparkle: { value: 1 } };
  function snowify(m, worldUV = 0) {
    m.onBeforeCompile = sh => {
      sh.uniforms.snowSparkle = snowU.sparkle;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW;').replace('#include <project_vertex>', '#include <project_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      let f = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSW; uniform float snowSparkle;
float snh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(snh(i), snh(i+vec2(1,0)), f.x), mix(snh(i+vec2(0,1)), snh(i+vec2(1,1)), f.x), f.y); }`);
      if (worldUV) f = f.replace('#include <map_fragment>', `#ifdef USE_MAP
  vec3 snAbs = abs(normalize(cross(dFdx(vSW), dFdy(vSW)))); vec2 snUV = snAbs.y > .6 ? vSW.xz : (snAbs.x > snAbs.z ? vSW.zy : vSW.xy);
  vec4 sampledDiffuseColor = texture2D(map, snUV * ${(1 / worldUV).toFixed(3)}); diffuseColor *= sampledDiffuseColor;
#endif`);
      f = f.replace('#include <color_fragment>', `#include <color_fragment>
{ float mv = snn(vSW.xz * .07) * .6 + snn(vSW.xz * .23) * .4; diffuseColor.rgb *= mix(.84, 1.06, mv); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.92, .96, 1.05), snn(vSW.xz * .04 + 7.0)); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ vec3 cell = floor(vSW * 60.0); float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))) * 43758.5453); vec3 vd = normalize(cameraPosition - vSW);
  float tw = fract(h * 91.7 + dot(vd, vec3(3.1, 5.7, 2.3)) * 3.0); float fade = 1.0 - smoothstep(6.0, 22.0, length(cameraPosition - vSW));
  totalEmissiveRadiance += vec3(.9, .95, 1.0) * step(.988, h) * smoothstep(.85, 1.0, tw) * snowSparkle * fade * 1.8; }`);
      sh.fragmentShader = f;
    };
    m.customProgramCacheKey = () => 'snowify' + worldUV; m.needsUpdate = true;
  }
  TL.load('assets/tex/paper.jpg', img => { MAT.wallpaper.map = makeWallpaper(img.image); MAT.wallpaper.needsUpdate = true; }, undefined, () => {});

  // ---------- свет ----------
  const hemi = new THREE.HemisphereLight(0xbfc8cc, 0x4a4636, .9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = .04;
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 150 });
  scene.add(sun); scene.add(sun.target);
  const bulbLight = new THREE.PointLight(0xffc98a, 7, 7, 2); bulbLight.position.set(0, 2.25, -.1); scene.add(bulbLight);
  bulbLight.shadow.mapSize.set(256, 256); bulbLight.shadow.bias = -0.004; bulbLight.shadow.radius = 3; bulbLight.shadow.camera.far = 3.6; // кубическая тень рисует сцену 6 раз — только ближний радиус
  const fillLight = new THREE.PointLight(0xffe0b0, 1.2, 4, 2); fillLight.position.set(0, 1.0, .2); scene.add(fillLight); // «отражённый» свет от прилавка
  const streetLights = [];
  const flashlight = new THREE.SpotLight(0xfff4e0, 0, 28, .45, .5, 1.5); flashlight.position.set(.15, -.1, 0); camera.add(flashlight); camera.add(flashlight.target); flashlight.target.position.set(0, 0, -5);

  // небо
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, t: { value: 0 }, cloud: { value: .6 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform vec3 top, bot, sunDir, sunCol; uniform float t, cloud; varying vec3 vP;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 9871.3); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float h = clamp(vP.y * 1.7 + .08, 0., 1.); vec3 c = mix(bot, top, h);
        float sd = max(dot(normalize(vP), normalize(sunDir)), 0.); c += sunCol * (pow(sd, 400.) * 2. + pow(sd, 8.) * .25);
        vec2 uv = vP.xz / max(vP.y + .25, .05) * 1.4 + vec2(t * .01, 0.);
        float cl = n2(uv) * .5 + n2(uv * 2.1) * .3 + n2(uv * 4.3) * .2;
        cl = smoothstep(.65 - cloud * .4, .9, cl) * smoothstep(0., .25, vP.y);
        c = mix(c, mix(bot, vec3(dot(top, vec3(.33))) * 1.2, .55), cl * .75);
        gl_FragColor = vec4(c, 1.);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 16), skyMat); scene.add(sky);

  // ---------- геометрия, коллизии ----------
  const colliders = [];
  const addCol = (x1, x2, z1, z2, tag) => { const c = { x1: Math.min(x1, x2), x2: Math.max(x1, x2), z1: Math.min(z1, z2), z2: Math.max(z1, z2), tag }; colliders.push(c); return c; };
  // окклюдеры для проверки видимости — ограничивающие коробки, а не меши (лучи по 70к треугольникам давали секундные лаги)
  const occBoxes = [];
  const occ = o => { o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o); if (!b.isEmpty()) occBoxes.push(b); return o; };
  function box(w, h, d, mat, x, y, z, parent = scene, cast = true) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
  function cyl(rt_, rb, h, mat, x, y, z, seg = 12, parent = scene) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt_, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  function plane(w, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m; }
  function textTex(w, h, text, bg, fg, font, extra) { return regTex(ctex(w, h, g => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); if (extra) extra(g, w, h); speckle(g, w, h, w * h / 60, ['#0003', '#fff1'], 2); stains(g, w, h, 4); })); }

  // ---------- земля ----------
  const winterGround = [], summerGround = [], drainSpots = [];
  const groundSnow = plane(340, 340, std({ map: repTex(TX.snow, 70, 70), roughness: .95 }), 0, 0, 0); winterGround.push(groundSnow);
  const groundDirt = plane(340, 340, std({ map: repTex(TX.asphalt, 60, 60), color: 0x8a8678 }), 0, -.001, 0); summerGround.push(groundDirt);
  const road = plane(170, 8, std({ map: repTex(TX.road, 34, 1.6), roughness: .9 }), 3, .012, 10.2);
  for (const z of [6.55, 13.85]) { const ds = plane(170, .9, std({ map: repTex(TX.dirtySnow, 40, 1), transparent: true, opacity: .95, roughness: .95 }), 3, .02, z); if (z > 10) ds.rotation.z = Math.PI; winterGround.push(ds); }
  const walk = plane(170, 4.9, std({ map: repTex(TX.snow, 40, 1.2), color: 0xb9bcbe }), 3, .008, 3.75); winterGround.push(walk);
  const walkS = plane(170, 4.9, std({ map: repTex(TX.asphalt, 40, 1.2), color: 0xa09c94 }), 3, .007, 3.75); summerGround.push(walkS);
  winterGround.push(road);
  // ---------- бесснежные сезоны: PBR-текстуры ambientCG (CC0) — изношенный асфальт, тротуары, двор (земля с травой), бетон ----------
  const pbrT = (name, rx, ry) => { const ld = (suf, srgb) => { const t = TL.load('assets/tex/pbr/' + name + '_' + suf + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = Q.aniso || 4; return regTex(t); };
    return { map: ld('col', true), normalMap: ld('nrm'), roughnessMap: ld('rgh') }; };
  Object.assign(groundDirt.material, pbrT('ground', 110, 110), { color: new THREE.Color(0xffffff), roughness: 1 }); groundDirt.material.needsUpdate = true;
  const roadS = plane(170, 8, std({ ...pbrT('road', 40, 2), roughness: 1 }), 3, .012, 10.2); summerGround.push(roadS);
  Object.assign(walkS.material, pbrT('walk', 50, 1.5), { color: new THREE.Color(0xb8b4ac), roughness: 1 }); walkS.material.needsUpdate = true;
  // северный тротуар (вдоль домов за дорогой)
  const walkN = plane(170, 4.1, walk.material, 3, .008, 16.3); winterGround.push(walkN);
  const walkNS = plane(170, 4.1, walkS.material, 3, .007, 16.3); summerGround.push(walkNS);
  const curbMat = std({ ...pbrT('concrete', 60, 1), color: 0xc8c4bc, roughness: 1 });
  box(170, .15, .25, curbMat, 3, .075, 6.25, scene, false); box(170, .15, .25, curbMat, 3, .075, 14.15, scene, false); box(170, .1, .15, curbMat, 3, .05, 18.4, scene, false);
  // ливнёвки: чугунные решётки в лотке у бордюра + водоприёмник в бордюре (советский образец), шаг ~16 м
  { const grTex = regTex(ctex(128, 64, (g, w, h) => { g.fillStyle = '#1a1816'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a4540'; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5); g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
      for (let x = 12; x < w - 6; x += 11) g.fillRect(x, 5, 4, h - 10); g.fillStyle = '#5a5249'; g.font = '700 9px Arial'; for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${120 + Math.random() * 60},${60 + Math.random() * 30},30,.35)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }));
    const grMat = std({ map: grTex, roughness: .6, metalness: .6 }), grGeo = new THREE.PlaneGeometry(.8, .4); grGeo.rotateX(-Math.PI / 2);
    const inletGeo = new THREE.PlaneGeometry(.8, .1), inletMat = std({ color: 0x0a0a0a, roughness: 1 });
    const pos = []; for (let x = -76; x < 84; x += 16) { if (Math.abs(x + 2) < 4) continue; pos.push([x, 6.55, 0]); pos.push([x + 8, 13.85, Math.PI]); }
    const gi = new THREE.InstancedMesh(grGeo, grMat, pos.length), ii = new THREE.InstancedMesh(inletGeo, inletMat, pos.length), M4 = new THREE.Matrix4(), Qn = new THREE.Quaternion();
    pos.forEach(([x, z, r], i) => { gi.setMatrixAt(i, M4.compose(new THREE.Vector3(x, .018, z), Qn.setFromEuler(new THREE.Euler(0, r, 0)), new THREE.Vector3(1, 1, 1))); ii.setMatrixAt(i, M4.compose(new THREE.Vector3(x, .07, z + (r ? .23 : -.23)), Qn.setFromEuler(new THREE.Euler(0, r, 0)), new THREE.Vector3(1, 1, 1))); });
    gi.receiveShadow = true; scene.add(gi, ii); drainSpots.push(...pos); }
  const lineMat = std({ color: 0xc9c4b0, roughness: .9 });
  for (let x = -78; x < 84; x += 6) plane(3, .14, lineMat, x, .016, 10.2);
  for (let i = 0; i < 6; i++) plane(.5, 7.6, std({ color: 0xc9c4b0, roughness: .9, transparent: true, opacity: .75 }), -4.5 + i * 1, .017, 10.2); // «зебра»

  // ---------- сугробы: валы вдоль дороги после грейдера, наносы у стен ----------
  const driftMat = std({ color: 0xf4f6f9, roughness: .95 }); const driftGeos = [];
  function drift(x1, z1, x2, z2, w, h, seed = 0) { // вытянутый холм с неровным гребнем
    const L = Math.hypot(x2 - x1, z2 - z1); if (L < .6) return; const nx = Math.max(4, Math.round(L / .8)), g = new THREE.PlaneGeometry(L, w, nx, 6); g.rotateX(-Math.PI / 2);
    const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const u = P.getX(i) / L + .5, v = P.getZ(i) / w * 2; const ends = clamp(Math.min(u, 1 - u) * L / (w * .9), 0, 1); const n = .75 + .25 * Math.sin(u * L * 1.3 + seed) * Math.sin(u * L * .37 + seed * 2.1);
      P.setY(i, Math.max(0, h * Math.pow(Math.max(0, 1 - v * v), .8) * Math.pow(ends, .6) * n)); P.setZ(i, P.getZ(i) * (1 + .15 * Math.sin(u * L * .9 + seed))); }
    g.computeVertexNormals(); g.rotateY(-Math.atan2(z2 - z1, x2 - x1)); g.translate((x1 + x2) / 2, .01, (z1 + z2) / 2); driftGeos.push(g); }
  function flushDrifts() { if (!driftGeos.length) return; const m = new THREE.Mesh(mergeGeometries(driftGeos.map(g => { g.deleteAttribute('uv'); return g; })), driftMat); m.receiveShadow = true; m.castShadow = true; m.userData.winter = true; m.userData.dyn = true; scene.add(m); winterGround.push(m); driftGeos.length = 0; return m; }
  { const gaps = [[-6, 2], [3, 13.5]]; // «зебра», остановка
    let x = -80; while (x < 86) { const L = R(9, 18); let a = x, b = Math.min(86, x + L); const gp = gaps.find(([g1, g2]) => b > g1 && a < g2); if (gp) { if (a < gp[0]) drift(a, 5.85, gp[0] - .4, 5.85, 1.1, .38, x); x = gp[1] + .4; continue; } drift(a, 5.85 + R(-.1, .1), b, 5.85 + R(-.1, .1), R(.9, 1.2), R(.3, .45), x); x = b + R(.8, 2.5); }
    x = -80; while (x < 86) { const L = R(10, 22); const a = x, b = Math.min(86, x + L); if (!(b > -6 && a < 2)) drift(a, 14.6 + R(-.1, .1), b, 14.6 + R(-.1, .1), R(1, 1.4), R(.35, .55), x + 3); x = b + R(1, 3); }
  }
  flushDrifts();
  { const ld = (f, srgb, rx = 1, ry = 1) => { const t = TL.load('assets/tex/snow/' + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = Q.aniso || 4; return regTex(t); };
    const gm = groundSnow.material; gm.map = ld('snow_col.jpg', true, 90, 90); gm.normalMap = ld('snow_nrm.jpg', false, 90, 90); gm.roughnessMap = ld('snow_rgh.jpg', false, 90, 90); gm.normalScale.set(1.3, 1.3); gm.roughness = 1; gm.color.set(0xf2f4f7); snowify(gm);
    const wm = walk.material; wm.normalMap = ld('packed_nrm.jpg', false, 42, 1.2); wm.normalScale.set(.9, .9); snowify(wm);
    MAT.snow.map = ld('snow_col.jpg', true); MAT.snow.normalMap = null; MAT.snow.color.set(0xf4f6f9); snowify(MAT.snow, 3.5);
    driftMat.map = ld('snow_col.jpg', true); snowify(driftMat, 3.5);
  }

  // ---------- ЛАРЁК ----------
  const K = new THREE.Group(); scene.add(K); const seasonHooks = [];
  const KW = 1.5, KD = 1.2, KH = 2.5, T_ = .06;
  drift(KW + .45, -KD + .3, KW + .45, KD - .3, .9, .42, 1); drift(-KW - .45, -KD + .3, -KW - .45, KD - .3, .9, .38, 2); flushDrifts(); // наносы у боковых стен ларька
  const wm = inner => [0, 1, 2, 3, 4, 5].map(i => i === inner ? MAT.wallpaper : MAT.kiosk);
  const kioskWalls = [];
  const kw = (...a) => { const m = box(...a); kioskWalls.push(m); occ(m); return m; };
  kw(1.9, KH, T_, wm(4), -.55, KH / 2, -KD, K); kw(.3, KH, T_, wm(4), 1.35, KH / 2, -KD, K); kw(.8, KH - 2.05, T_, wm(4), .8, 2.05 + (KH - 2.05) / 2, -KD, K);
  kw(KW * 2, 1.0, T_, wm(5), 0, .5, KD, K); kw(KW * 2, KH - 2.15, T_, wm(5), 0, 2.15 + (KH - 2.15) / 2, KD, K);
  kw(.15, 1.15, T_, wm(5), -1.425, 1.575, KD, K); kw(.15, 1.15, T_, wm(5), 1.425, 1.575, KD, K);
  kw(T_, KH, KD * 2, wm(0), -KW, KH / 2, 0, K); kw(T_, KH, KD * 2, wm(1), KW, KH / 2, 0, K);
  box(KW * 2 + .3, .1, KD * 2 + .3, MAT.roofTin, 0, KH + .05, 0, K);
  box(KW * 2 - .02, .02, KD * 2 - .02, MAT.ceiling, 0, KH - .01, 0, K, false);
  box(KW * 2, .02, KD * 2, MAT.floor, 0, .01, 0, K, false);
  // коллизии стен с дверным проёмом x 0.4..1.2
  addCol(-KW - .04, .4, -KD - .04, -KD + .04); addCol(1.2, KW + .04, -KD - .04, -KD + .04);
  addCol(-KW - .04, KW + .04, KD - .04, KD + .04); addCol(-KW - .04, -KW + .04, -KD, KD); addCol(KW - .04, KW + .04, -KD, KD);
  const doorCol = addCol(.4, 1.2, -KD - .05, -KD + .05, 'door');
  const counterCol = addCol(-KW, KW, KD - .48, KD, 'counter');
  addCol(-KW, .3, -KD, -KD + .34, 'shelf'); addCol(-KW, -KW + .3, -KD, .45, 'shelf');
  // козырёк, вывеска
  const stripes = (a, b) => regTex(ctex(128, 128, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 16, 0, 16, h); } speckle(g, w, h, 600, ['#0003', '#fff2'], 2); stains(g, w, h, 5); }));
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(KW * 2 + .2, .9), std({ map: stripes('#a8352a', '#d9d2c0'), side: THREE.DoubleSide }));
  awn.position.set(0, 2.32, KD + .4); awn.rotation.x = -Math.PI / 2 + .55; awn.castShadow = true; K.add(awn);
  const awnSnow = box(KW * 2 + .2, .05, .9, MAT.snow, 0, 2.36, KD + .4, K, false); awnSnow.rotation.x = .55; awnSnow.userData.winter = true;
  const roofSnow = box(KW * 2 + .3, .08, KD * 2 + .3, MAT.snow, 0, KH + .14, 0, K, false); roofSnow.userData.winter = true;
  const signTex = textTex(512, 96, 'ПРОДУКТЫ · 24 ЧАСА', '#d9b23a', '#7a1f16', '900 46px "Arial Black", Arial, sans-serif');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .33), std({ map: signTex, emissive: 0x332200, emissiveMap: signTex, emissiveIntensity: 0 })); sign.position.set(0, 2.32, KD + .035); K.add(sign);
  // панорамная витрина без решёток: стекло в алюминиевой раме; зимой — иней от краёв, в остальное время — пыль и потёки
  const winTexes = (() => { const W = 512, H = 224;
    const mk = draw => { const t = regTex(ctex(W, H, g => draw(g, W, H))); return t; };
    const frost = mk((g, w, h) => { const im = g.createImageData(w, h), d = im.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ex = Math.min(x, w - x) / w, ey = Math.min(y, h - y) / h, e = Math.min(ex * 1.6, ey * 2.2 + (y > h * .5 ? -.18 * (y / h - .5) : 0)); // ближе к краю и низу — гуще
        const n = Math.random(), a = clamp(1 - e * 5.2 + (n - .5) * .5, 0, 1); const i = (y * w + x) * 4; d[i] = 228 + n * 20; d[i + 1] = 236 + n * 15; d[i + 2] = 245; d[i + 3] = 25 + a * 215; }
      g.putImageData(im, 0, 0); g.strokeStyle = 'rgba(255,255,255,.26)';
      for (let k = 0; k < 220; k++) { let x = Math.random() < .5 ? Math.random() * w * .25 : w - Math.random() * w * .25, y = Math.random() * h, a = Math.random() * 6.28; if (Math.random() < .4) { x = Math.random() * w; y = h - Math.random() * h * .3; } g.lineWidth = .5 + Math.random(); g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 8; j++) { a += (Math.random() - .5) * .9; const L = 4 + Math.random() * 8; x += Math.cos(a) * L; y += Math.sin(a) * L; g.lineTo(x, y); g.moveTo(x, y); g.lineTo(x + Math.cos(a + .9) * L * .6, y + Math.sin(a + .9) * L * .6); g.moveTo(x, y); } g.stroke(); } });
    const dirt = mk((g, w, h) => { g.fillStyle = 'rgba(150,140,120,.10)'; g.fillRect(0, 0, w, h);
      const gr = g.createLinearGradient(0, h * .55, 0, h); gr.addColorStop(0, 'rgba(120,105,85,0)'); gr.addColorStop(1, 'rgba(110,95,75,.45)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 70; k++) { const x = Math.random() * w, y0 = Math.random() * h * .5, L = 30 + Math.random() * h * .6; const gg = g.createLinearGradient(0, y0, 0, y0 + L); gg.addColorStop(0, 'rgba(90,80,65,0)'); gg.addColorStop(.6, 'rgba(90,80,65,.16)'); gg.addColorStop(1, 'rgba(90,80,65,0)'); g.fillStyle = gg; g.fillRect(x, y0, 1.5 + Math.random() * 2.5, L); } // потёки
      for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${90 + Math.random() * 60},${85 + Math.random() * 50},70,${Math.random() * .25})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 18; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 40 + Math.random() * 60, Math.random() * 3, Math.random() * 3 + 2); g.stroke(); } }); // разводы от тряпки
    return { frost, dirt }; })();
  const winGlassMat = new THREE.MeshStandardMaterial({ map: winTexes.frost, transparent: true, roughness: .12, metalness: .1, color: 0xffffff, depthWrite: false, side: THREE.DoubleSide });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.86, 1.15), winGlassMat); glass.position.set(0, 1.575, KD + .012); glass.renderOrder = 2; K.add(glass);
  const alu = std({ color: 0x9a9c98, roughness: .45, metalness: .75 });
  box(2.96, .05, .07, alu, 0, 2.15, KD + .01, K); box(2.96, .05, .08, alu, 0, 1.005, KD + .01, K); // рама сверху и снизу
  for (const x of [-1.455, -.5, .5, 1.455]) box(.045, 1.15, .07, alu, x, 1.575, KD + .01, K); // стойки (по центру — окошко выдачи)
  box(.95, .03, .05, alu, 0, 1.36, KD + .015, K); // перемычка над окошком
  seasonHooks.push(w => { winGlassMat.map = w ? winTexes.frost : winTexes.dirt; winGlassMat.needsUpdate = true; });
  // прилавок, витрина
  box(2.9, .05, .45, MAT.counter, 0, .98, KD - .22, K); box(2.9, .93, .06, MAT.wood, 0, .47, KD - .44, K); box(1.0, .04, .25, MAT.counter, 0, 1.0, KD + .14, K);
  { const shelfGlass = new THREE.MeshPhysicalMaterial({ color: 0xcfe6df, roughness: .08, metalness: 0, transparent: true, opacity: .42, depthWrite: false, clearcoat: 1, clearcoatRoughness: .05 }), edge = std({ color: 0x5f9a86, roughness: .15, transparent: true, opacity: .85 }), chrome = std({ color: 0xd0d2d0, roughness: .2, metalness: 1 });
    for (const y of [1.36, 1.76]) for (const sx of [-1, 1]) { const x = sx * .9; // стекло 8 мм с зелёной кромкой и хромированными держателями
      const gsh = box(.86, .008, .28, shelfGlass, x, y, KD - .13, K, false); gsh.renderOrder = 3;
      box(.86, .012, .006, edge, x, y, KD - .267, K, false); box(.86, .012, .006, edge, x, y, KD + .007, K, false); box(.006, .012, .28, edge, x - .43, y, KD - .13, K, false); box(.006, .012, .28, edge, x + .43, y, KD - .13, K, false);
      for (const dx of [-.4, .4]) for (const dz of [-.24, -.02]) { box(.02, .022, .02, chrome, x + dx, y - .012, KD + dz, K, false); } }
    for (const sx of [-1, 1]) for (const ox of [.47, 1.33]) for (const dz of [-.24, -.02]) cyl(.006, .006, 1.13, chrome, sx * ox, 1.575, KD + dz, 8, K); } // стойки витрины
  box(.36, .08, .2, MAT.steel, 0, 1.02, KD - .05, K);
  const stool = new THREE.Group(); K.add(stool); stool.position.set(0, 0, .25);
  cyl(.19, .19, .05, MAT.wood, 0, .62, 0, 16, stool);
  for (let a = 0; a < 3; a++) { const l = cyl(.018, .018, .62, MAT.steel, Math.cos(a * 2.1) * .14, .31, Math.sin(a * 2.1) * .14, 6, stool); l.rotation.z = Math.cos(a * 2.1) * .12; l.rotation.x = -Math.sin(a * 2.1) * .12; }
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), MAT.bulb); bulb.position.set(0, 2.32, -.1); K.add(bulb); cyl(.004, .004, .14, MAT.dark, 0, 2.42, -.1, 4, K);
  box(.3, .12, .22, std({ color: 0x9a968a, roughness: .5 }), -.55, 1.07, KD - .25, K); box(.22, .02, .1, MAT.dark, -.55, 1.135, KD - .28, K);
  box(.28, .02, .16, MAT.wood, .5, 1.015, KD - .3, K);
  // календарь, плакат
  const calTex = regTex(ctex(256, 320, () => {}));
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(.34, .42), std({ map: calTex })); cal.position.set(KW - .035, 1.65, .3); cal.rotation.y = -Math.PI / 2; K.add(cal);
  const posterTex = regTex(ctex(256, 360, (g, w, h) => {
    g.fillStyle = '#1b1b24'; g.fillRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h * .4, 10, w / 2, h * .4, 160); gr.addColorStop(0, '#c0392b'); gr.addColorStop(1, '#1b1b24'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2e6c9'; g.font = '900 34px Arial'; g.textAlign = 'center'; g.fillText('ГРУППА', w / 2, 60); g.font = '900 38px Arial'; g.fillText('«КИНОПЛЁНКА»', w / 2, 110); g.font = '700 22px Arial'; g.fillText('ТУР 1992', w / 2, h - 40);
    g.fillStyle = '#0008'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(50 + i * 52, 210, 26, 0, 7); g.fill(); } speckle(g, w, h, 3000, ['#0003', '#fff2'], 2);
  }));
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(.45, .63), std({ map: posterTex })); poster.position.set(KW - .035, 1.55, -.55); poster.rotation.y = -Math.PI / 2; K.add(poster);

  // ---------- полки с советскими продуктами (инстансинг) ----------
  function label(w, h, bg, fg, top, mid, bot, stripe) {
    return regTex(ctex(w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      if (stripe) { g.fillStyle = stripe; g.fillRect(0, h * .32, w, h * .36); }
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${Math.round(h * .12)}px Arial`; g.fillText(top, w / 2, h * .18);
      g.font = `900 ${Math.round(h * .2)}px Arial`; g.fillText(mid, w / 2, h * .5);
      g.font = `700 ${Math.round(h * .1)}px Arial`; g.fillText(bot, w / 2, h * .82);
      speckle(g, w, h, w * h / 40, ['#0002', '#fff2'], 2); stains(g, w, h, 3);
    }));
  }
  const FOOD = [
    { id: 'tushonka', geo: new THREE.CylinderGeometry(.05, .05, .1, 16), lab: label(256, 128, '#e9e2cc', '#6a1a12', 'ГОСТ', 'ГОВЯДИНА ТУШЁНАЯ', 'В/С · 338 г', null), metal: true, h: .1 },
    { id: 'sgush', geo: new THREE.CylinderGeometry(.038, .038, .085, 16), lab: label(256, 128, '#2a4f8a', '#ffffff', 'ЦЕЛЬНОЕ', 'МОЛОКО СГУЩЁННОЕ', 'С САХАРОМ', '#f0ead8'), metal: true, h: .085 },
    { id: 'kilka', geo: new THREE.CylinderGeometry(.045, .045, .03, 16), lab: label(256, 64, '#c9a227', '#3a2a10', '', 'КИЛЬКА В Т/С', '', null), metal: true, h: .03 },
    { id: 'grechka', geo: new THREE.BoxGeometry(.11, .17, .06), lab: label(128, 256, '#d8cfb2', '#5a3a1a', 'КРУПА', 'ГРЕЧНЕВАЯ', '1 кг', '#c8a46a'), h: .17 },
    { id: 'makarony', geo: new THREE.BoxGeometry(.12, .2, .05), lab: label(128, 256, '#e8d080', '#1a3a7a', 'МАКАРОННЫЕ', 'ИЗДЕЛИЯ', 'ВЫСШ. СОРТ', '#2a5aa0'), h: .2 },
    { id: 'chai', geo: new THREE.BoxGeometry(.08, .12, .05), lab: label(128, 192, '#3a6a3a', '#f0e6c0', 'ЧАЙ', 'ГРУЗИНСКИЙ', '№ 36', '#c9a227'), h: .12 },
    { id: 'sahar', geo: new THREE.BoxGeometry(.1, .14, .07), lab: label(128, 192, '#f0f0ec', '#2a4a8a', 'САХАР', 'РАФИНАД', '1 кг', '#4a7ac0'), h: .14 },
    { id: 'sol', geo: new THREE.BoxGeometry(.07, .12, .05), lab: label(128, 192, '#d8d8d0', '#3a3a3a', 'СОЛЬ', 'ПОВАРЕННАЯ', 'ПИЩЕВАЯ', null), h: .12 },
    { id: 'spichki', geo: new THREE.BoxGeometry(.05, .015, .035), lab: label(128, 64, '#e8d8a8', '#8a1a12', '', 'СПИЧКИ', '', null), h: .015 },
    { id: 'kefir', geo: new THREE.CylinderGeometry(.035, .035, .22, 12), lab: null, color: 0xe8ece8, h: .22 },
    { id: 'buratino', geo: new THREE.CylinderGeometry(.03, .032, .28, 12), lab: null, color: 0x9a6a2a, glass: true, h: .28 },
    { id: 'hleb', geo: new THREE.BoxGeometry(.2, .1, .1), lab: null, color: 0x9a6a38, h: .1 },
    { id: 'baton', geo: new THREE.CapsuleGeometry(.045, .2, 4, 8), lab: null, color: 0xc89a5a, h: .09, rotZ: Math.PI / 2 },
  ];
  const foodGroup = new THREE.Group(); K.add(foodGroup);
  const shelfMat = MAT.shelf;
  // задняя стена (за продавцом): x -1.45..0.3, три полки; боковая левая стена: z -0.85..0.4, три полки
  const SH_BACK = [], SH_SIDE = [];
  for (const y of [.75, 1.2, 1.65, 2.05]) { box(1.72, .025, .3, shelfMat, -.57, y, -KD + .17, K); SH_BACK.push(y); }
  box(.025, 1.5, .3, shelfMat, .29, 1.35, -KD + .17, K); box(.025, 1.5, .3, shelfMat, -1.43, 1.35, -KD + .17, K);
  for (const y of [.85, 1.3, 1.75]) { box(.3, .025, 1.2, shelfMat, -KW + .17, y, -.2, K); SH_SIDE.push(y); }
  function buildFood() {
    foodGroup.clear();
    const placements = new Map(FOOD.map(f => [f.id, []]));
    const rows = [];
    SH_BACK.forEach((y, i) => rows.push({ y, x0: -1.4, x1: .24, z: -KD + .17, axis: 'x', set: [['tushonka', 'sgush', 'kilka'], ['grechka', 'makarony', 'sahar'], ['chai', 'sol', 'spichki', 'kefir'], ['buratino', 'buratino', 'kefir']][i] }));
    SH_SIDE.forEach((y, i) => rows.push({ y, z0: -.78, z1: .38, x: -KW + .17, axis: 'z', set: [['hleb', 'baton'], ['makarony', 'grechka', 'chai'], ['tushonka', 'sgush']][i] }));
    for (const r of rows) {
      let p = r.axis === 'x' ? r.x0 : r.z0; const end = r.axis === 'x' ? r.x1 : r.z1; let gi = 0;
      while (p < end) {
        const id = r.set[gi % r.set.length]; const f = FOOD.find(q => q.id === id);
        const bb = (f.geo.boundingBox || (f.geo.computeBoundingBox(), f.geo.boundingBox)); const w = (bb.max.x - bb.min.x) * (f.rotZ ? 2.2 : 1) + .012;
        const n = RI(3, 6);
        for (let k = 0; k < n && p < end; k++) {
          if (Math.random() < .12) { p += w; continue; } // пустое место — живой магазин
          const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R(-.25, .25) + (r.axis === 'z' ? Math.PI / 2 : 0), f.rotZ || 0));
          const pos = r.axis === 'x' ? new THREE.Vector3(p + w / 2, r.y + .013 + f.h / 2, r.z + R(-.06, .06)) : new THREE.Vector3(r.x + R(-.06, .06), r.y + .013 + f.h / 2, p + w / 2);
          if (f.id === 'buratino' || f.id === 'kefir') pos.y = r.y + .013 + f.h / 2;
          m.compose(pos, q, new THREE.Vector3(1, 1, 1));
          placements.get(id).push(m);
          if ((id === 'tushonka' || id === 'sgush') && Math.random() < .6) { const m2 = m.clone(); m2.elements[13] += f.h + .002; placements.get(id).push(m2); } // стопкой
          p += w;
        }
        gi++; p += .02;
      }
    }
    for (const f of FOOD) {
      const arr = placements.get(f.id); if (!arr.length) continue;
      let mat;
      if (f.model) mat = f.model;
      else if (f.lab) { const side = std({ map: f.lab, roughness: f.metal ? .35 : .8, metalness: f.metal ? .5 : 0 }); mat = f.geo.type.startsWith('Cylinder') ? [side, std({ color: 0xb8bcc0, metalness: .9, roughness: .3 }), std({ color: 0xb8bcc0, metalness: .9, roughness: .3 })] : [side, side, side, side, side, side]; }
      else mat = f.glass ? new THREE.MeshStandardMaterial({ color: f.color, roughness: .1, transparent: true, opacity: .85 }) : std({ color: f.color, roughness: .7 });
      const im = new THREE.InstancedMesh(f.geo, mat, arr.length); arr.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; foodGroup.add(im);
    }
  }
  buildFood();

  // ---------- дверь ----------
  const doorPivot = new THREE.Group(); doorPivot.position.set(1.2, 0, -KD); K.add(doorPivot); doorPivot.userData.dyn = true;
  const doorMesh = box(.8, 2.04, .05, [MAT.kiosk, MAT.kiosk, MAT.kiosk, MAT.kiosk, MAT.wallpaper, MAT.kiosk], -.4, 1.02, 0, doorPivot);
  const handleM = std({ color: 0x777777, metalness: .8, roughness: .3 });
  box(.12, .025, .04, handleM, -.72, 1.0, .05, doorPivot); box(.12, .025, .04, handleM, -.72, 1.0, -.05, doorPivot);
  occ(doorMesh);
  let doorOpen = 0, doorTarget = 0;
  addCol(-KW - .05, KW + .05, KD - .02, KD + .06); // перед окном снаружи — стена

  // ---------- товар на витрине (из игры) ----------
  const SLOT_POS = [[-1.12, .99], [1.12, .99], [-.7, .99], [.7, .99], [-1.12, 1.37], [1.12, 1.37], [-.7, 1.37], [.7, 1.37], [-1.12, 1.77]];
  const shelfGroup = new THREE.Group(); K.add(shelfGroup); shelfGroup.userData.dyn = true;
  function itemMesh(id) {
    const g = new THREE.Group(); const lbl = c => std({ color: c, roughness: .5 });
    const bottle = (h, r, body, cap) => { const bm = new THREE.MeshStandardMaterial({ color: body, roughness: .15, metalness: .1, transparent: true, opacity: .88 }); cyl(r, r, h * .7, bm, 0, h * .35, 0, 10, g); cyl(r * .4, r * .9, h * .2, bm, 0, h * .8, 0, 8, g); cyl(r * .45, r * .45, h * .07, lbl(cap), 0, h * .93, 0, 8, g); cyl(r * 1.02, r * 1.02, h * .25, lbl(0xe8e0c8), 0, h * .35, 0, 10, g); };
    switch (id) {
      case 'gum': box(.08, .05, .025, lbl(0xd14a8a), 0, .025, 0, g); box(.081, .015, .026, lbl(0xf2d34b), 0, .03, 0, g); break;
      case 'paper': box(.24, .02, .17, lbl(0xd8d2c0), 0, .01, 0, g); box(.2, .002, .04, lbl(0x9a2a20), 0, .021, -.05, g); break;
      case 'soda': bottle(.22, .032, 0xd98a2b, 0xc0392b); break;
      case 'choc': box(.13, .035, .025, lbl(0x5a2d1a), 0, .018, 0, g); box(.06, .036, .026, lbl(0xc0392b), 0, .018, 0, g); break;
      case 'cig': box(.055, .085, .022, lbl(0xe8e4dc), 0, .043, 0, g); box(.056, .03, .023, lbl(0xb0302a), 0, .07, 0, g); break;
      case 'beer': bottle(.24, .033, 0x5a3112, 0xd4a72c); break;
      case 'batt': box(.07, .1, .015, lbl(0x1c1c1c), 0, .05, 0, g); box(.05, .06, .02, lbl(0xd4a72c), 0, .045, 0, g); break;
      case 'vodka': bottle(.28, .036, 0xcfe0e0, 0xc0392b); break;
      case 'tape': box(.1, .065, .016, lbl(0x1a1a1a), 0, .033, 0, g); box(.07, .025, .017, lbl(0xe7c84a), 0, .042, 0, g); break;
      case 'tushonka': cyl(.045, .045, .09, std({ color: 0xd8c8a0, metalness: .4, roughness: .4 }), 0, .045, 0, 14, g); cyl(.046, .046, .05, lbl(0xa8352a), 0, .05, 0, 14, g); break;
      case 'kilka': cyl(.045, .045, .03, std({ color: 0xc9a227, metalness: .6, roughness: .35 }), 0, .015, 0, 14, g); break;
      case 'bread': { const b = new THREE.Mesh(new THREE.CapsuleGeometry(.05, .1, 4, 8), lbl(0x7a4a24)); b.rotation.z = Math.PI / 2; b.position.y = .05; g.add(b); break; }
      case 'mag': case 'mag2': { const c = document.createElement('canvas'); c.width = 128; c.height = 160; const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 128, 160); gr.addColorStop(0, id === 'mag' ? '#e04a8a' : '#2a7ad8'); gr.addColorStop(1, id === 'mag' ? '#f2c94c' : '#e8e8e8'); x.fillStyle = gr; x.fillRect(0, 0, 128, 160); x.fillStyle = '#fff'; x.font = '900 22px Arial'; x.fillText(id === 'mag' ? 'MODE' : 'AUTO', 8, 30); x.font = '700 12px Arial'; x.fillText(id === 'mag' ? 'INTERNATIONAL' : 'WELT · 1992', 8, 46); x.fillStyle = '#0003'; x.beginPath(); x.ellipse(64, 105, 34, 44, 0, 0, 7); x.fill();
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.BoxGeometry(.15, .19, .006), [lbl(0xeeeeee), lbl(0xeeeeee), lbl(0xeeeeee), lbl(0xeeeeee), new THREE.MeshStandardMaterial({ map: t, roughness: .25, metalness: .05 }), lbl(0xeeeeee)]); m.position.y = .095; m.rotation.x = -.2; m.castShadow = true; g.add(m); break; }
      case 'toy': { const e = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 10), lbl(0xe57bb0)); e.scale.y = 1.3; e.position.y = .045; g.add(e); box(.03, .02, .005, lbl(0x9fb88a), 0, .05, .033, g); break; }
    }
    return g;
  }
  function priceTag(id, price, q) {
    const t = ctex(160, 80, (g, w, h) => { g.fillStyle = '#f3efe2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b03a2e'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); g.fillStyle = '#1a1a1a'; g.font = '700 22px Arial'; g.textAlign = 'center'; g.fillText(ctx.GOODS[id].short, w / 2, 28); g.fillStyle = '#b03a2e'; g.font = '900 30px Arial'; g.fillText(ctx.fmt(price) + ' р', w / 2, 62); if (!q) { g.fillStyle = '#0009'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 26px Arial'; g.fillText('НЕТ', w / 2, 50); } });
    return new THREE.Mesh(new THREE.PlaneGeometry(.13, .065), std({ map: t, roughness: .9 }));
  }
  const storeGroup = new THREE.Group(); K.add(storeGroup); storeGroup.userData.dyn = true;
  let shelfSig = '';
  function updateShelves() {
    const S = ctx.getS(); if (!S) return;
    const sig = S.slots.join(',') + '|' + S.slots.map(id => id ? Math.min(3, Math.ceil(ctx.qOf(id) / 5)) + ':' + ctx.sellPrice(id) : '').join(',') + '|' + Math.ceil(ctx.stockTotal() / 6) + '|' + S.day;
    if (sig === shelfSig) return; shelfSig = sig;
    shelfGroup.children.slice().forEach(c => { shelfGroup.remove(c); c.traverse(o => { if (o.material && o.material.map) o.material.map.dispose(); if (o.geometry) o.geometry.dispose(); }); });
    S.slots.forEach((id, i) => {
      if (!id || i >= SLOT_POS.length) return;
      const [x, y] = SLOT_POS[i], q = ctx.qOf(id), n = q ? Math.min(3, Math.ceil(q / 5)) : 0;
      for (let k = 0; k < n; k++) { const m = itemMesh(id); m.position.set(x + (k - (n - 1) / 2) * .11, y + .01, KD - .12 + (k % 2) * .05); m.rotation.y = R(-.2, .2); shelfGroup.add(m); }
      const tag = priceTag(id, ctx.sellPrice(id), q); tag.position.set(x, y - .035, KD - .275); tag.rotation.y = Math.PI; tag.rotation.x = -.15; shelfGroup.add(tag);
    });
    storeGroup.children.slice().forEach(c => { storeGroup.remove(c); c.geometry.dispose(); });
    const nBox = Math.min(10, Math.ceil(ctx.stockTotal() / 10)), bm = std({ color: 0x8a6a45, roughness: .9 });
    for (let i = 0; i < nBox; i++) box(R(.28, .4), R(.2, .3), R(.25, .32), bm, R(-.2, .5), .12 + Math.floor(i / 5) * .28, -.55 + (i % 5) * .02, storeGroup).rotation.y = R(-.3, .3);
    drawCalendar(); drawRateBoard();
  }
  function drawCalendar() {
    const S = ctx.getS(), g = calTex.userData.canvas.getContext('2d');
    g.fillStyle = '#efe8d6'; g.fillRect(0, 0, 256, 320);
    const gr = g.createLinearGradient(0, 0, 0, 150); gr.addColorStop(0, '#6c8fb0'); gr.addColorStop(1, '#d8b080'); g.fillStyle = gr; g.fillRect(10, 10, 236, 140);
    g.fillStyle = '#2c3e50'; g.beginPath(); g.moveTo(10, 150); g.lineTo(80, 90); g.lineTo(140, 130); g.lineTo(200, 70); g.lineTo(246, 150); g.fill();
    g.fillStyle = '#b03a2e'; g.font = '900 34px Arial'; g.textAlign = 'center'; g.fillText(ctx.MONTHS[ctx.monthOf(S.day)].toUpperCase(), 128, 190);
    g.fillStyle = '#333'; g.font = '700 26px Arial'; g.fillText(String(ctx.yearOf(S.day)), 128, 222);
    g.font = '14px Arial'; for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) g.fillText(String(r * 7 + k + 1), 30 + k * 33, 250 + r * 18);
    calTex.needsUpdate = true;
  }

  // ---------- обменник ----------
  const BOOTH = { x: 12, z: -1.5 };
  const booth = new THREE.Group(); booth.position.set(BOOTH.x, 0, BOOTH.z); scene.add(booth);
  occ(box(2, 2.4, 2, std({ color: 0xd9d6cc, roughness: .6 }), 0, 1.2, 0, booth));
  box(2.2, .1, 2.2, MAT.roofTin, 0, 2.45, 0, booth); box(2.2, .06, 2.2, MAT.snow, 0, 2.52, 0, booth, false).userData.winter = true;
  box(1.2, .6, .05, std({ color: 0x223, roughness: .1, metalness: .3 }), 0, 1.45, 1.01, booth);
  const exSign = textTex(512, 96, 'ОБМЕН ВАЛЮТ', '#1f3a68', '#f2e6c9', '900 56px Arial');
  const exS = new THREE.Mesh(new THREE.PlaneGeometry(1.9, .36), std({ map: exSign, emissive: 0xffffff, emissiveMap: exSign, emissiveIntensity: 0 })); exS.position.set(0, 2.1, 1.02); booth.add(exS);
  const rateTex = regTex(ctex(256, 128, () => {}));
  const rateBoard = new THREE.Mesh(new THREE.PlaneGeometry(.8, .4), std({ map: rateTex, emissive: 0xffffff, emissiveMap: rateTex, emissiveIntensity: .35 })); rateBoard.position.set(0, .85, 1.02); booth.add(rateBoard);
  function drawRateBoard() { const S = ctx.getS(), g = rateTex.userData.canvas.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#ff4a2a'; g.font = '700 30px "Courier New", monospace'; g.textAlign = 'left'; g.fillText('USD ' + ctx.fmt(S.rate * 1.04), 14, 50); g.fillStyle = '#ffb43a'; g.fillText('    ' + ctx.fmt(S.rate * .96), 14, 100); rateTex.needsUpdate = true; }
  addCol(BOOTH.x - 1.05, BOOTH.x + 1.05, BOOTH.z - 1.05, BOOTH.z + 1.05);

  // ---------- детская площадка (на месте бывшего рынка) ----------
  const MARKET = { x: -23, z: -8 }; // точка площадки (имя оставлено для совместимости графа путей)
  const PG = { x: -23, z: -8 }; let env2Extra = null;
  const pipeM = std({ color: 0x3a6a8a, roughness: .55, metalness: .5 }), pipeR = std({ color: 0xa83a2a, roughness: .55, metalness: .5 }), pipeY = std({ color: 0xc9a227, roughness: .55, metalness: .5 });
  const plank = std({ color: 0x6a4a2e, roughness: .85 });
  const pg = new THREE.Group(); pg.position.set(PG.x, 0, PG.z); scene.add(pg);
  const pipe = (x1, y1, z1, x2, y2, z2, r, m, parent = pg) => { const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2), d = b.clone().sub(a), L = d.length(); const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), m); c.position.copy(a).add(b).multiplyScalar(.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); c.castShadow = true; parent.add(c); return c; };
  // ограждение с проходом к ларьку
  const fence = [[-8, -7, 8, -7], [8, -7, 8, 7], [8, 7, -8, 7], [-8, 7, -8, -7]];
  for (const [x1, z1, x2, z2] of fence) { const L = Math.hypot(x2 - x1, z2 - z1), n = Math.round(L / 1.6);
    for (let k = 0; k <= n; k++) { const t = k / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t; if (x1 === 8 && x2 === 8 && Math.abs(z) < 1.4) continue; pipe(x, 0, z, x, .9, z, .03, pipeM); }
    if (x1 === 8 && x2 === 8) { pipe(8, .85, -7, 8, .85, -1.4, .025, pipeM); pipe(8, .85, 1.4, 8, .85, 7, .025, pipeM); addCol(PG.x + 7.9, PG.x + 8.1, PG.z - 7, PG.z - 1.4); addCol(PG.x + 7.9, PG.x + 8.1, PG.z + 1.4, PG.z + 7); }
    else { pipe(x1, .85, z1, x2, .85, z2, .025, pipeM); addCol(PG.x + Math.min(x1, x2) - .1, PG.x + Math.max(x1, x2) + .1, PG.z + Math.min(z1, z2) - .1, PG.z + Math.max(z1, z2) + .1); } }
  // качели: А-образные стойки, перекладина, два сиденья на цепях
  const swingSeats = [];
  for (const sx of [-1.6, 1.6]) { pipe(sx, 0, -3.8, sx, 2.4, -3, .05, pipeR); pipe(sx, 0, -2.2, sx, 2.4, -3, .05, pipeR); }
  pipe(-1.7, 2.4, -3, 1.7, 2.4, -3, .05, pipeR); addCol(PG.x - 1.8, PG.x + 1.8, PG.z - 3.9, PG.z - 2.1);
  for (const sx of [-.7, .7]) { const piv = new THREE.Group(); piv.position.set(sx, 2.38, -3); pg.add(piv); for (const dx of [-.2, .2]) pipe(dx, 0, 0, dx, -1.85, 0, .008, std({ color: 0x777777, metalness: .9, roughness: .3 }), piv); const seat = new THREE.Mesh(new THREE.BoxGeometry(.5, .04, .22), plank); seat.position.y = -1.87; seat.castShadow = true; piv.add(seat); swingSeats.push({ piv, ph: Math.random() * 6, amp: .05, x: PG.x + sx, z: PG.z - 3 }); }
  // горка: лестница, площадка, металлический скат
  const sl = new THREE.Group(); sl.position.set(4, 0, -1.5); pg.add(sl);
  for (const sx of [-.3, .3]) pipe(sx, 0, 0, sx, 1.6, .3, .04, pipeY, sl);
  for (let k = 1; k < 6; k++) pipe(-.3, k * .28, k * .05, .3, k * .28, k * .05, .02, pipeY, sl);
  const plat = new THREE.Mesh(new THREE.BoxGeometry(.8, .06, .8), plank); plat.position.set(0, 1.6, .7); sl.add(plat); for (const [px, pz] of [[-.38, 1.08], [.38, 1.08]]) pipe(px, 0, pz, px, 1.6, pz, .04, pipeY, sl);
  const chute = new THREE.Mesh(new THREE.BoxGeometry(.6, .03, 2.6), std({ color: 0xb8bcc0, metalness: .85, roughness: .25 })); chute.position.set(0, .85, 2.15); chute.rotation.x = .62; chute.castShadow = true; sl.add(chute);
  for (const sx of [-.3, .3]) { const sd = new THREE.Mesh(new THREE.BoxGeometry(.03, .18, 2.6), pipeY); sd.position.set(sx, .95, 2.15); sd.rotation.x = .62; sl.add(sd); }
  const slSnow = new THREE.Mesh(new THREE.BoxGeometry(.8, .05, .8), MAT.snow); slSnow.position.set(0, 1.66, .7); slSnow.userData.winter = true; sl.add(slSnow);
  addCol(PG.x + 3.5, PG.x + 4.5, PG.z - 1.6, PG.z + 2.2);
  // песочница
  for (const [x, z, w, d] of [[-4, 2.2, 3, .12], [-4, 4.8, 3, .12], [-5.5, 3.5, .12, 2.7], [-2.5, 3.5, .12, 2.7]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, .3, d), plank); b.position.set(x, .15, z); b.castShadow = true; pg.add(b); }
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.5), std({ color: 0xb8a070, roughness: 1 })); sand.rotation.x = -Math.PI / 2; sand.position.set(-4, .12, 3.5); pg.add(sand);
  const sandSnow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.5), MAT.snow); sandSnow.rotation.x = -Math.PI / 2; sandSnow.position.set(-4, .14, 3.5); sandSnow.userData.winter = true; pg.add(sandSnow);
  addCol(PG.x - 5.6, PG.x - 2.4, PG.z + 2.1, PG.z + 4.9);
  // карусель
  const car_ = new THREE.Group(); car_.position.set(-4, 0, -2); pg.add(car_); pipe(0, 0, 0, 0, .9, 0, .06, pipeM, car_);
  const disc = new THREE.Group(); disc.position.y = .35; car_.add(disc); const dm = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, .06, 20), pipeR); dm.castShadow = true; disc.add(dm);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; pipe(Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0, Math.cos(a) * .2, .65, Math.sin(a) * .2, .025, pipeY, disc); }
  const discSnow = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, .02, 20), MAT.snow); discSnow.position.y = .04; discSnow.userData.winter = true; disc.add(discSnow);
  addCol(PG.x - 5.3, PG.x - 2.7, PG.z - 3.3, PG.z - .7);
  let discSpin = 0;
  // лавочки
  const benches = [];
  for (const [bx, bz, ry] of [[1, 5.8, Math.PI], [-6.6, -1, Math.PI / 2]]) { const b = new THREE.Group(); b.position.set(bx, 0, bz); b.rotation.y = ry; pg.add(b);
    for (const dx of [-.7, .7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.06, .45, .4), MAT.dark); l.position.set(dx, .22, 0); b.add(l); }
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.6, .05, .4), plank); st.position.y = .45; st.castShadow = true; b.add(st); const bk = new THREE.Mesh(new THREE.BoxGeometry(1.6, .3, .04), plank); bk.position.set(0, .7, -.2); b.add(bk);
    const bs = new THREE.Mesh(new THREE.BoxGeometry(1.6, .04, .4), MAT.snow); bs.position.y = .49; bs.userData.winter = true; b.add(bs);
    benches.push({ x: PG.x + bx, z: PG.z + bz, ry }); addCol(PG.x + bx - .8, PG.x + bx + .8, PG.z + bz - .3, PG.z + bz + .3); }
  const vendorSpots = [{ x: 4.6, z: 4.0, rot: 0 }, { x: 13.4, z: -.05, rot: Math.PI / 2 }]; // уличные продавцы: семечки у остановки, у обменника
  { const crate = box(.5, .45, .4, std({ color: 0x7a5a3a, roughness: .9 }), 4.6, .22, 4.55); addCol(4.3, 4.9, 4.3, 4.8); }
  let swingRide = null, benchSit = null;
  env2Extra = () => {
    if (swingRide || benchSit) return { label: 'Встать', icon: 'sit', fn: () => { swingRide = null; benchSit = null; P.locked = false; ctx.onCtl(); } };
    for (const sw of swingSeats) if (Math.hypot(P.x - sw.x, P.z - sw.z - .4) < 1.1) return { label: 'Покачаться на качелях', icon: 'sit', fn: () => { swingRide = { sw, t: 0 }; P.locked = true; P.x = sw.x; P.z = sw.z; P.yaw = Math.PI; ctx.audio.click(400, .3, 0, .1); ctx.onCtl(); } };
    if (Math.hypot(P.x - (PG.x - 4), P.z - (PG.z - 2)) < 2.2) return { label: 'Раскрутить карусель', icon: 'rotate', fn: () => { discSpin = Math.min(4, discSpin + 2.2); ctx.audio.click(300, .5, 0, .15); } };
    for (const b of benches) if (Math.hypot(P.x - b.x, P.z - b.z) < 1.3) return { label: 'Посидеть на лавке', icon: 'sit', fn: () => { benchSit = b; P.locked = true; P.x = b.x + Math.sin(b.ry) * .25; P.z = b.z + Math.cos(b.ry) * .25; P.yaw = b.ry + Math.PI; ctx.onCtl(); } };
    return null;
  };
  function playgroundTick(dt) {
    swingSeats.forEach(sw => { sw.ph += dt * 2.1; const a = swingRide && swingRide.sw === sw ? .55 : .04 + windVec.length() * .03; sw.amp += (a - sw.amp) * dt * .6; sw.piv.rotation.x = Math.sin(sw.ph) * sw.amp; });
    discSpin *= Math.pow(.85, dt); disc.rotation.y += discSpin * dt;
    if (swingRide) { const sw = swingRide.sw, ang = sw.piv.rotation.x; P.h = 2.38 - Math.cos(ang) * 1.65 + .02; P.z = sw.z - Math.sin(ang) * 1.65; P.x = sw.x; }
    if (benchSit) P.h = 1.15;
  }
  // ---------- гаражи, деревянный забор, баки, вывески ----------
  for (let i = 0; i < 8; i++) {
    const gx = 26 + i * 4.2, gz = -16;
    occ(box(4, 2.6, 6, MAT.rust, gx, 1.3, gz));
    box(2.8, 2.1, .05, std({ color: pick([0x4a5a4a, 0x5a4a3a, 0x3a4a5a, 0x6a5a3a]), roughness: .7, metalness: .4 }), gx, 1.05, gz + 3.01);
    box(4.1, .08, 6.1, MAT.snow, gx, 2.64, gz, scene, false).userData.winter = true;
    addCol(gx - 2, gx + 2, gz - 3, gz + 3);
  }
  const wf = box(18, 2, .08, MAT.woodFence, 41, 1, -21, scene); addCol(32, 50, -21.1, -20.9);
  for (const [x, z] of [[-6, -5], [-7.4, -5]]) { box(1.2, 1.1, .9, std({ color: 0x3a5a3a, roughness: .6, metalness: .4 }), x, .55, z); addCol(x - .6, x + .6, z - .45, z + .45); }
  box(1.25, .08, .95, MAT.snow, -6, 1.13, -5, scene, false).userData.winter = true;
  const neons = [];
  const signs = [['ВИДЕОПРОКАТ', '#1a2a4a', '#e8d070', -32, 18.95], ['КОМИССИОННЫЙ', '#4a1a1a', '#f0e0c0', 14, 18.95], ['ГАСТРОНОМ', '#2a3a2a', '#e0d8b0', -14, 18.95], ['РЕМОНТ ОБУВИ', '#3a3a3a', '#f0e8d0', 30, 18.95]];
  for (const [t, bg, fg, x, z] of signs) { const tx = textTex(512, 96, t, bg, fg, '900 52px Arial'); const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .6), std({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0 })); m.position.set(x, 3.4, z); scene.add(m); m.userData.neon = true; neons.push(m); }

  // ---------- фонари и провода ----------
  const lampHeads = [], poles = [];
  for (let x = -66; x <= 74; x += 20) {
    const p = cyl(.08, .12, 7.5, std({ color: 0x5a5c5e, metalness: .5, roughness: .6 }), x, 3.75, 5.95, 8); poles.push(new THREE.Vector3(x, 7.2, 5.95));
    const arm = cyl(.035, .035, 1.6, MAT.steel, x, 7.1, 6.6, 6); arm.rotation.x = Math.PI / 2 - .25;
    const hd = box(.55, .14, .3, MAT.lampHead, x, 7.15, 7.35); lampHeads.push(hd);
    addCol(x - .14, x + .14, 5.82, 6.08);
  }
  const wireMat = new THREE.LineBasicMaterial({ color: 0x151515 });
  for (let i = 0; i < poles.length - 1; i++) for (const dy of [0, -.35]) {
    const a = poles[i], b = poles[i + 1], pts = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new THREE.Vector3(lerp(a.x, b.x, t), a.y + dy - Math.sin(t * Math.PI) * .9, a.z)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }
  for (const x of [-6, 14]) { const pl = new THREE.PointLight(0xffb060, 0, 24, 1.6); pl.position.set(x, 6.8, 7.3); scene.add(pl); streetLights.push(pl); }

  // ---------- объединение статической геометрии по материалам (сотни мелких мешей → десятки вызовов отрисовки) ----------
  function batchStatic(root) {
    root.updateMatrixWorld(true);
    const groups = new Map();
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.keep || winterGround.includes(o) || summerGround.includes(o)) return; // сезонные поверхности не сливаем — их видимость переключается
      for (let p = o; p; p = p.parent) if (p.userData && p.userData.dyn) return;
      if (Array.isArray(o.material) || o.material.isShaderMaterial || o.material.transparent) return;
      const key = o.material.uuid + '|' + o.castShadow + '|' + (o.userData.winter ? 1 : 0);
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o);
    });
    let removed = 0, added = 0;
    for (const [, list] of groups) {
      if (list.length < 2) continue;
      const geos = list.map(m => { let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.applyMatrix4(m.matrixWorld); return g; });
      const merged = mergeGeometries(geos, false); if (!merged) continue;
      const mm = new THREE.Mesh(merged, list[0].material); mm.castShadow = list[0].castShadow; mm.receiveShadow = true; mm.userData.winter = !!list[0].userData.winter; scene.add(mm); added++;
      list.forEach(m => { m.parent.remove(m); removed++; });
    }
    return { removed, added };
  }
  const batchInfo = batchStatic(scene);

  // ---------- загрузка моделей ----------
  const loader = new GLTFLoader();
  const ASSETS = {};
  let loadedN = 0; const toLoad = ['apartment', 'busstop', 'beton', 'tree', 'bush', 'radio', 'steelworker', 'people', 'notepad', 'chair', 'poster', 'nodrink', 'vodka', 'cigarette', 'stew', 'gun', 'vaz2101', 'vaz2107', 'vaz2101_lod', 'vaz2107_lod'];
  const winMats = [], winU = { time: { value: 0 }, night: { value: 0 } };
  // детализация фасадов панелек: фактура бетона в мировых координатах (без растяжения по UV), потёки от швов и подоконников, сырость и грязь у цоколя
  const facadeTex = (() => { const t = TL.load('assets/tex/pbr/concrete_col.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return regTex(t); })();
  function facadeDetail(m) {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => { prev && prev.call(m, sh, r);
      sh.uniforms.tFacade = { value: facadeTex };
      if (!sh.vertexShader.includes('varying vec3 vFD;')) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFD; varying vec3 vFN;').replace('#include <project_vertex>', '#include <project_vertex>\nvFD = (modelMatrix * vec4(transformed, 1.0)).xyz; vFN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vFD; varying vec3 vFN; uniform sampler2D tFacade;
float fdh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fdn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(fdh(i), fdh(i+vec2(1,0)), f.x), mix(fdh(i+vec2(0,1)), fdh(i+vec2(1,1)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
{ vec3 an = abs(vFN); vec2 tuv = an.y > .7 ? vFD.xz : (an.x > an.z ? vFD.zy : vFD.xy); float c = dot(texture2D(tFacade, tuv * .35).rgb, vec3(.33));
  float h = (an.x > an.z ? vFD.z : vFD.x);
  float streak = fdn(vec2(h * 3.1, vFD.y * .22)) * fdn(vec2(h * 11.0, vFD.y * .5)); // вертикальные потёки
  float base = 1.0 - smoothstep(.0, 1.6, vFD.y); float patchy = fdn(vFD.xz * .15 + vFD.y * .05);
  diffuseColor.rgb *= mix(.8, 1.12, c) * (1.0 - streak * .32 * smoothstep(1.0, 5.0, vFD.y)) * (1.0 - base * .32) * mix(.92, 1.05, patchy); }`);
    };
    const key = m.customProgramCacheKey ? m.customProgramCacheKey.call(m) : ''; m.customProgramCacheKey = () => key + '|facade'; m.needsUpdate = true;
  }
  function windowShader(m) { // у каждого окна (ячейка мира) своё расписание света и свой оттенок
    m.emissiveIntensity = 1.5;
    m.onBeforeCompile = sh => {
      sh.uniforms.winTime = winU.time; sh.uniforms.winNight = winU.night;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform float winTime, winNight;\nfloat wh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ vec3 cell = floor(vWPos / vec3(3.2, 2.9, 3.2)); float h1 = wh(cell), h2 = wh(cell + 7.1); float per = 25.0 + 80.0 * h2; float slot = floor(winTime / per + h1 * 13.0); float on = step(1.0 - (0.12 + 0.38 * winNight), wh(cell + slot * 3.7)); totalEmissiveRadiance *= on * smoothstep(0.15, 0.6, winNight) * mix(vec3(1.0, .72, .45), vec3(1.0, .93, .8), h2); }');
    };
    m.needsUpdate = true;
  }
  const crowns = { winter: [], summer: [] };
  const loading = Promise.all(toLoad.map(n => loader.loadAsync('assets/models/' + n + '.glb').then(g => { g.__name = n; ASSETS[n] = g; loadedN++; ctx.onLoadProgress && ctx.onLoadProgress(loadedN / toLoad.length); }).catch(e => { console.warn('Не загрузилась модель', n, e); loadedN++; })));
  function meshesOf(g) { const out = []; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh) out.push(o); }); return out; }
  function prepMats(root) { root.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (m[k]) m[k].anisotropy = Q.aniso; }); } }); }
  function placeModel(g, x, z, rotY, scale = 1) { const o = g.scene.clone(true); o.userData.tag = g.__name || "model"; o.position.set(x, 0, z); o.rotation.y = rotY; o.scale.setScalar(scale); scene.add(o); prepMats(o); o.updateMatrixWorld(true); return o; }
  function colFromBox(o, shrink = 0) { const b = new THREE.Box3().setFromObject(o); return addCol(b.min.x + shrink, b.max.x - shrink, b.min.z + shrink, b.max.z - shrink); }
  let staticWorker = null, peopleModels = []; const peopleByOutfit = {};
  const outfitNow = () => { const m = season < 0 ? 0 : season; return (m >= 10 || m <= 2) ? 'winter' : (m >= 5 && m <= 7) ? 'summer' : 'mid'; };
  loading.then(() => {
    // машины: заменить процедурные на модели
    if (ASSETS.vaz2101 || ASSETS.vaz2107) for (const g of carGroups) { const keep = { ...g.userData }; for (const ch of g.children.slice()) g.remove(ch); g.userData = { color: keep.color, parked: keep.parked, dyn: true }; realCar(g); }
    // дома
    if (ASSETS.apartment) {
      const A = ASSETS.apartment;
      // светятся только стёкла горящих окон (оранжевые пиксели ночной текстуры)
      const maskCache = new Map();
      const maskOf = t => { if (maskCache.has(t)) return maskCache.get(t); const img = t.image, w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, w, h);
        for (let i = 0; i < d.data.length; i += 4) { const r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2]; const lit = r > 180 && gg > 120 && b < 140 && r - b > 70; if (!lit) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 0; } }
        g.putImageData(d, 0, 0); const nt = new THREE.CanvasTexture(c); nt.colorSpace = THREE.SRGBColorSpace; nt.flipY = t.flipY; nt.magFilter = THREE.NearestFilter; maskCache.set(t, nt); return nt; };
      A.scene.traverse(o => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.emissiveMap) { try { m.emissiveMap = maskOf(m.emissiveMap); } catch (e) {} m.emissive.set(0xffffff); windowShader(m); winMats.push(m); } }); } });
      { const done = new Set(); A.scene.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!done.has(m)) { done.add(m); facadeDetail(m); } }); }); }
      for (const [x, z, r] of [[-32, 27, Math.PI / 2], [30, 27, Math.PI / 2], [0, -36, -Math.PI / 2], [-66, -10, 0], [70, -6, Math.PI]]) {
        const o = placeModel(A, x, z, r); colFromBox(o, .5); occ(o); reflectLayer(o);
        { const b = new THREE.Box3().setFromObject(o), e = .5; drift(b.min.x, b.min.z - e, b.max.x, b.min.z - e, 1.6, .55, x); drift(b.min.x, b.max.z + e, b.max.x, b.max.z + e, 1.6, .55, z); drift(b.min.x - e, b.min.z, b.min.x - e, b.max.z, 1.5, .5, x + z); drift(b.max.x + e, b.min.z, b.max.x + e, b.max.z, 1.5, .5, x - z); }
      }
      flushDrifts(); season = -1; // пересчитать видимость сезонных объектов
    } else fallbackBuildings();
    // остановка
    if (ASSETS.busstop) { // открытая сторона модели смотрит в +X локально → поворот −90°, к дороге (+Z)
      const o = placeModel(ASSETS.busstop, STOP.x, 4.15, -Math.PI / 2); busStopObj = o;
      o.traverse(m => { if (m.isMesh) { const ms = Array.isArray(m.material) ? m.material : [m.material]; ms.forEach(mt => { if (/glass/i.test(mt.name)) { mt.transparent = true; mt.opacity = .35; mt.depthWrite = false; mt.side = THREE.FrontSide; m.castShadow = false; } }); } });
      occ(o); const b = new THREE.Box3().setFromObject(o); addCol(b.min.x, b.max.x, b.min.z, b.min.z + .2); addCol(b.min.x, b.min.x + .15, b.min.z, b.max.z - .3); addCol(b.max.x - .15, b.max.x, b.min.z, b.max.z - .3);
      // вторая остановка — «Завод»
      const o2 = placeModel(ASSETS.busstop, STOPS.factory.x, 4.15, -Math.PI / 2); o2.traverse(m => { if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => { if (/glass/i.test(mt.name)) { mt.transparent = true; mt.opacity = .35; mt.depthWrite = false; } }); });
      occ(o2); const b2 = new THREE.Box3().setFromObject(o2); addCol(b2.min.x, b2.max.x, b2.min.z, b2.min.z + .2); }
    for (const st of Object.values(STOPS)) { const tx = textTex(256, 128, 'А', '#d9b23a', '#1a1a1a', '900 90px Arial', (g, w, h) => { g.font = '700 16px Arial'; g.fillText(st.name.split(' ')[0].toUpperCase(), w / 2, h - 14); }); cyl(.04, .04, 2.8, MAT.steel, st.x + 2.2, 1.4, 5.7, 6); const sg = new THREE.Mesh(new THREE.PlaneGeometry(.6, .3), std({ map: tx, side: THREE.DoubleSide })); sg.position.set(st.x + 2.2, 2.75, 5.7); scene.add(sg); addCol(st.x + 2.1, st.x + 2.3, 5.6, 5.8); }
    // бетонный забор из плит (инстансинг)
    if (ASSETS.beton) {
      const ms = meshesOf(ASSETS.beton); const m0 = ms[0]; const geo = m0.geometry.clone().applyMatrix4(m0.matrixWorld);
      geo.computeBoundingBox(); const len = geo.boundingBox.max.x - geo.boundingBox.min.x;
      const segs = [[20, -22, 20, -40], [20, -40, 58, -40]]; // по периметру карты теперь вьюга, плиты — только у гаражей
      const mats = []; for (const [x1, z1, x2, z2] of segs) { const L = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(L / len), ang = Math.atan2(z2 - z1, x2 - x1); for (let i = 0; i < n; i++) { const t = (i + .5) / n; mats.push(new THREE.Matrix4().compose(new THREE.Vector3(lerp(x1, x2, t), 0, lerp(z1, z2, t)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -ang, 0)), new THREE.Vector3(1, 1, 1))); } addCol(Math.min(x1, x2) - .25, Math.max(x1, x2) + .25, Math.min(z1, z2) - .25, Math.max(z1, z2) + .25); }
      const im = new THREE.InstancedMesh(geo, m0.material, mats.length); mats.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = true; scene.add(im); prepMats(im);
    }
    // деревья и кусты (модели пользователя), четыре сезона: зима — почти голые и в снегу, весна — молодая листва, лето, осень — жёлто-красные
    if (ASSETS.tree || ASSETS.bush) buildVegetation();
    reflectLayer(sky); reflectLayer(K); scene.traverse(o => { if (o.isLight) o.layers.enable(1); }); // упрощённая сцена для отражений в лужах
    // радио на полке
    if (ASSETS.radio) { const o = placeModel(ASSETS.radio, -KW + .17, -.62, Math.PI / 2, 1.0); o.position.y = 1.315; radioObj = o; radioBox = new THREE.Box3().setFromObject(o).expandByScalar(.03); }
    // модель рабочего — один из вариантов NPC
    if (ASSETS.people) { try { for (const o of ['winter', 'mid', 'summer']) peopleByOutfit[o] = preparePeople(ASSETS.people.scene, o); peopleModels = peopleByOutfit.winter; } catch (e) { console.warn('Модели людей', e); } }
    if (ASSETS.steelworker) { const m = meshesOf(ASSETS.steelworker)[0]; if (m) staticWorker = splitStaticModel(m.geometry.clone().applyMatrix4(m.matrixWorld)); }
    fixNodes();
    // --- предметы интерьера из присланных моделей ---
    if (ASSETS.notepad) life.setNotepadModel(ASSETS.notepad.scene.clone(true));

    if (ASSETS.cigarette) life.setCigaretteModel(ASSETS.cigarette.scene.clone(true));
    if (ASSETS.vodka) life.setBottleModel(ASSETS.vodka.scene.clone(true));
    if (ASSETS.chair) { const c1 = placeModel(ASSETS.chair, -1.05, -.55, .6); c1.scale.setScalar(.95); addCol(-1.3, -.8, -.8, -.3, 'chair'); placeModel(ASSETS.chair, -2.4, -1.9, 2.2); addCol(-2.65, -2.15, -2.15, -1.65, 'chair'); }
    if (ASSETS.poster) { poster.visible = false; const o = placeModel(ASSETS.poster, KW - .025, -.62, -Math.PI / 2, .9); o.position.y = 1.18; }
    if (ASSETS.nodrink) { const ms = meshesOf(ASSETS.nodrink); let big = ms[0]; ms.forEach(m => { m.geometry.computeBoundingBox(); big.geometry.computeBoundingBox(); if (m.geometry.boundingBox.getSize(tmpV).y > big.geometry.boundingBox.getSize(tmpV2).y) big = m; });
      const g = big.geometry.clone().applyMatrix4(big.matrixWorld); g.computeBoundingBox(); const bb = g.boundingBox, c = bb.getCenter(new THREE.Vector3()); g.translate(-c.x, -bb.min.y, -c.z); const sc = .55 / (bb.max.y - bb.min.y); g.scale(sc, sc, sc);
      const m = new THREE.Mesh(g, big.material); m.position.set(-.35, 1.25, -KD + .04); m.rotation.y = Math.abs(bb.max.x - bb.min.x) < Math.abs(bb.max.z - bb.min.z) ? Math.PI / 2 : 0; scene.add(m); }
    if (ASSETS.stew) { const sm = meshesOf(ASSETS.stew)[0]; if (sm) { const f = FOOD.find(q => q.id === 'tushonka'); const g = sm.geometry.clone().applyMatrix4(sm.matrixWorld); g.computeBoundingBox(); const bb = g.boundingBox; g.translate(0, -(bb.min.y + bb.max.y) / 2, 0); f.geo = g; f.model = sm.material; buildFood(); } }
    if (ASSETS.gun) { const gm = meshesOf(ASSETS.gun)[0]; gunGeo = gm.geometry.clone().applyMatrix4(gm.matrixWorld); gunMat = gm.material; weapon.setModel(gunWorldMesh(), life.makeHand); buildWallGun(); }
    spawnMarat();
    for (let i = 0; i < vendorSpots.length; i++) spawnVendor(i);
    season = -1;
    ctx.onLoaded && ctx.onLoaded();
  });
  let radioObj = null, radioBox = null, busStopObj = null;
  const STOP = { x: 8, z: 5.4 }; const radioPos = new THREE.Vector3(-KW + .17, 1.42, -.62);
  // ---------- растительность ----------
  const vegSeason = []; // [{ mesh, seasons: Set }] — видимость по сезону
  function recolorLeaves(img, mode, size = 512) { // перекраска текстуры листвы под сезон (альфа сохраняется)
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.drawImage(img, 0, 0, size, size); const d = g.getImageData(0, 0, size, size), D = d.data;
    const pal = { autumn: [[218, 160, 32], [200, 96, 26], [168, 50, 24], [224, 184, 64], [150, 120, 40]], dry: [[107, 74, 42], [92, 64, 40], [120, 90, 55]], spring: [[150, 205, 90], [170, 215, 100], [130, 190, 80]] }[mode];
    const blot = (x, y) => { const v = Math.sin(x * .021 + Math.sin(y * .017) * 3) * Math.cos(y * .023 - x * .011) * .5 + .5; return v; };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = (y * size + x) * 4; if (D[i + 3] < 8) continue; const L = (D[i] * .3 + D[i + 1] * .59 + D[i + 2] * .11) / 160;
      const p = pal[Math.min(pal.length - 1, Math.floor(blot(x, y) * pal.length))]; D[i] = Math.min(255, p[0] * L); D[i + 1] = Math.min(255, p[1] * L); D[i + 2] = Math.min(255, p[2] * L); }
    g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return regTex(t);
  }
  function cardSubset(geo, keep, seed) { // оставить часть листовых карточек (по 2 треугольника): осенью часть облетела, зимой — единицы
    const idx = geo.index ? geo.index.array : null, n = idx ? idx.length : geo.attributes.position.count, out = [];
    for (let t = 0; t < n; t += 6) { const h = Math.abs(Math.sin((t / 6 + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1; if (h < keep) for (let k = 0; k < 6 && t + k < n; k++) out.push(idx ? idx[t + k] : t + k); }
    const g = geo.clone(); g.setIndex(out); return g;
  }
  function snowShellOf(geo, thick = .05, minNy = .45) { // снег на ветвях: верхние грани коры, приподнятые на толщину снега
    const g0 = geo.index ? geo.toNonIndexed() : geo, P = g0.attributes.position, pos = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i += 3) { a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2); n.subVectors(b, a).cross(c.clone().sub(a)).normalize(); if (n.y < minNy || Math.min(a.y, b.y, c.y) < 1.2) continue;
      for (const v of [a, b, c]) pos.push(v.x + n.x * thick * .3, v.y + thick * (.6 + .4 * n.y), v.z + n.z * thick * .3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  }
  function buildVegetation() {
    const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
    const onPath = (x, z, m = 1.8) => { if (z > .5 && z < 19) return true; for (const k in NODES) for (const e of NODES[k].e) if (segD(x, z, NODES[k].x, NODES[k].z, NODES[e].x, NODES[e].z) < m) return true; return colliders.some(b => x > b.x1 - 1 && x < b.x2 + 1 && z > b.z1 - 1 && z < b.z2 + 1); };
    const inst = (geo, mat, arr, seasons, shadow = true) => { const im = new THREE.InstancedMesh(geo, mat, arr.length); arr.forEach(([x, z, sc, r], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r, 0)), new THREE.Vector3(sc, sc, sc)))); im.castShadow = shadow; im.receiveShadow = true; scene.add(im); vegSeason.push({ mesh: im, seasons: new Set(seasons) }); return im; };
    const snowMat = MAT.snow;
    if (ASSETS.tree) {
      const meshes = meshesOf(ASSETS.tree), bark = meshes.find(m => m.name === 'bark'), leaves = meshes.find(m => m.name === 'leaves');
      const spots = [];
      for (let i = 0; i < 400 && spots.length < 26; i++) { const x = R(-62, 66), z = R(-36, -3); if (onPath(x, z) || Math.abs(x) < 6 && z > -8 || spots.some(([a, b]) => Math.hypot(a - x, b - z) < 7)) continue; spots.push([x, z, R(.55, .75), R(0, 6.28)]); }
      for (const x of [-60, -42, -24, 24, 44, 62]) spots.push([x + R(-2, 2), R(20.2, 22.4), R(.5, .65), R(0, 6.28)]); // за дорогой, вдоль дальнего тротуара
      if (bark) { const bg = bark.geometry.clone().applyMatrix4(bark.matrixWorld); inst(bg, bark.material, spots, ['winter', 'spring', 'summer', 'autumn']); inst(snowShellOf(bg), snowMat, spots, ['winter'], false); }
      if (leaves) { const lg = leaves.geometry.clone().applyMatrix4(leaves.matrixWorld), img = leaves.material.map.image, lm = leaves.material;
        const mk = (map, extra = {}) => Object.assign(lm.clone(), { map, ...extra });
        inst(lg, lm, spots, ['summer']);
        inst(cardSubset(lg, .75, 1), mk(recolorLeaves(img, 'spring')), spots, ['spring']);
        inst(cardSubset(lg, .65, 2), mk(recolorLeaves(img, 'autumn')), spots, ['autumn']);
        inst(cardSubset(lg, .1, 3), mk(recolorLeaves(img, 'dry')), spots, ['winter']);
        // опавшая листва под деревьями осенью
        const fl = regTex(ctex(256, 256, (g, w, h) => { for (let k = 0; k < 420; k++) { const r = Math.hypot(Math.random() - .5, Math.random() - .5); if (r > .5) continue; const x = w / 2 + (Math.random() - .5) * w * .9 * (1 - r), y = h / 2 + (Math.random() - .5) * h * .9 * (1 - r); g.fillStyle = pick(['#c8901e', '#b05a1c', '#93301a', '#d8b040', '#7a5a2a']); g.save(); g.translate(x, y); g.rotate(Math.random() * 6.3); g.beginPath(); g.ellipse(0, 0, 5 + Math.random() * 4, 2.5 + Math.random() * 2, 0, 0, 7); g.fill(); g.restore(); } }));
        const lp = new THREE.PlaneGeometry(7, 7); lp.rotateX(-Math.PI / 2); lp.translate(0, .015, 0); inst(lp, new THREE.MeshStandardMaterial({ map: fl, transparent: true, depthWrite: false, roughness: .95 }), spots.map(([x, z, s, r]) => [x, z, 1, r]), ['autumn'], false); }
      spots.forEach(([x, z]) => addCol(x - .3, x + .3, z - .3, z + .3));
    }
    if (ASSETS.bush) {
      const bm = meshesOf(ASSETS.bush)[0]; const bg = bm.geometry.clone().applyMatrix4(bm.matrixWorld), img = bm.material.map.image;
      const pts = []; for (let i = 0; i < 300 && pts.length < 34; i++) { const x = R(-62, 66), z = pick([R(-36, -4), R(19.2, 22.8)]); if (onPath(x, z, 1.3)) continue; if (Math.abs(x) < 4 && z > -6 && z < 19) continue; if (pts.some(([a, b]) => Math.hypot(a - x, b - z) < 2.5)) continue; pts.push([x, z, R(.8, 1.25), R(0, 6.28)]); }
      // живая изгородь у площадки
      for (let k = 0; k < 6; k++) pts.push([-31.5, -12 + k * 1.6, R(.9, 1.1), R(0, 6.28)]);
      const mk = (map) => Object.assign(bm.material.clone(), { map });
      inst(bg, bm.material, pts, ['summer']); inst(cardSubset(bg, .8, 4), mk(recolorLeaves(img, 'spring')), pts, ['spring']); inst(cardSubset(bg, .7, 5), mk(recolorLeaves(img, 'autumn')), pts, ['autumn']);
      inst(cardSubset(bg, .22, 6), mk(recolorLeaves(img, 'dry')), pts, ['winter']);
      const cap = new THREE.SphereGeometry(.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1.15, .55, 1.1); inst(cap, snowMat, pts, ['winter'], false); // куст под снегом
    }
    applyVegSeason();
  }
  function applyVegSeason() { const m = season < 0 ? 0 : season, sn = (m >= 10 || m <= 2) ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'; vegSeason.forEach(v => v.mesh.visible = v.seasons.has(sn)); }
  function fallbackBuildings() {
    const m = std({ color: 0x8e8a80 });
    for (const [x, z, w, d] of [[-32, 27, 50, 15], [30, 27, 50, 15], [0, -36, 50, 15]]) { const b = box(w, 15, d, m, x, 7.5, z); occ(b); addCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2); }
  }

  // ---------- машины ----------
  // седан 90-х (угловатый «классический» силуэт): кузов — экструзия бокового профиля с арками, хром, круглые фары, грязь по низу
  const CAR = { glass: new THREE.MeshStandardMaterial({ color: 0x1a232a, roughness: .06, metalness: .8, side: THREE.DoubleSide }), chrome: std({ color: 0xc8ccd0, roughness: .2, metalness: 1 }), mud: std({ color: 0x3a3530, roughness: 1, transparent: true, opacity: .7 }), tire: std({ color: 0x141414, roughness: .9 }), grille: std({ color: 0x0e0e0e, roughness: .5, metalness: .4 }), plate: std({ color: 0xe8e8e0, roughness: .6 }) };
  const carGeo = (() => {
    const sh = new THREE.Shape(); const W = .37;
    sh.moveTo(2.08, .36); sh.lineTo(1.25 + W, .36); sh.absarc(1.25, .36, W, 0, Math.PI, false); sh.lineTo(-1.25 + W, .36); sh.absarc(-1.25, .36, W, 0, Math.PI, false);
    sh.lineTo(-2.08, .36); sh.lineTo(-2.1, .8); sh.lineTo(-1.25, .84); sh.lineTo(-.95, .86); sh.lineTo(-.55, 1.31); sh.lineTo(.5, 1.33); sh.lineTo(1.0, .88); sh.lineTo(2.1, .8); sh.lineTo(2.08, .36);
    const body = new THREE.ExtrudeGeometry(sh, { depth: 1.52, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 2, curveSegments: 8 }); body.translate(0, 0, -.76);
    const side = new THREE.Shape(); side.moveTo(-.86, .9); side.lineTo(-.53, 1.26); side.lineTo(.48, 1.28); side.lineTo(.93, .91); side.lineTo(-.86, .9);
    const win = new THREE.ShapeGeometry(side);
    const tire = new THREE.CylinderGeometry(.31, .31, .2, 16); tire.rotateX(Math.PI / 2); const hub = new THREE.CylinderGeometry(.17, .17, .22, 12); hub.rotateX(Math.PI / 2); const spoke = new THREE.BoxGeometry(.3, .05, .225);
    return { body, win, tire, hub, spoke };
  })();
  function mergeByMat(g) { // статичные части машины → один меш на материал (меньше draw calls)
    const by = new Map(); g.updateMatrixWorld(true);
    for (const o of g.children.slice()) { if (!o.isMesh || o.userData.keep) continue; const geo = o.geometry.clone().applyMatrix4(o.matrix); const k = o.material; if (!by.has(k)) by.set(k, []); by.get(k).push(geo.index ? geo.toNonIndexed() : geo); g.remove(o); }
    for (const [m, list] of by) { for (const ge of list) { for (const n of Object.keys(ge.attributes)) if (!['position', 'normal', 'uv'].includes(n)) ge.deleteAttribute(n); if (!ge.attributes.uv) ge.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ge.attributes.position.count * 2), 2)); }
      const mg = mergeGeometries(list, false); const mm = new THREE.Mesh(mg, m); mm.castShadow = m !== CAR.glass; mm.receiveShadow = true; if (m === MAT.snow) mm.userData.winter = true; g.add(mm); list.forEach(x => x.dispose()); }
  }
  // ---------- машины: модели ВАЗ-2101 / ВАЗ-2107 (GitHub, CC-BY), процедурная — пока модели грузятся ----------
  const carGroups = [];
  function carMesh(color, parked = false) {
    const g = new THREE.Group(); g.userData = { color, parked, dyn: true }; carGroups.push(g); scene.add(g);
    if (ASSETS.vaz2101 || ASSETS.vaz2107) realCar(g); else procCar(g, color);
    return g;
  }
  // иней на стёклах: боковые/задние — сплошь, лобовое у едущих — две дуги, расчищенные дворниками
  const FROST = (() => {
    const W = 512, H = 256;
    const frost = (g, a0 = 1) => { const im = g.createImageData(W, H), d = im.data; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, n = Math.random(); const v = 200 + n * 45; d[i] = v; d[i + 1] = v + 6; d[i + 2] = v + 14; d[i + 3] = (175 + n * 70) * a0; } g.putImageData(im, 0, 0);
      g.strokeStyle = 'rgba(255,255,255,.55)'; for (let k = 0; k < 140; k++) { let x = Math.random() * W, y = Math.random() * H, a = Math.random() * 6.28; g.lineWidth = Math.random() * 1.4 + .3; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 7; j++) { a += (Math.random() - .5) * 1.1; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); if (Math.random() < .3) { g.moveTo(x, y); g.lineTo(x + Math.cos(a + 1) * 6, y + Math.sin(a + 1) * 6); g.moveTo(x, y); } } g.stroke(); }
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,.25)'); gr.addColorStop(.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.35)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
    const mk = draw => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); draw(g); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; regTex(t); return t; };
    const full = mk(g => frost(g));
    const wiper = mk(g => { frost(g);
      for (const px of [.27, .66]) { // дуга дворника: стекло почти чистое, по краю — валик снега
        const cx = px * W, cy = H * 1.0, r1 = H * .16, r2 = H * .93, a1 = Math.PI * 1.08, a2 = Math.PI * 1.92;
        g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx, cy, r2, a1, a2); g.arc(cx, cy, r1, a2, a1, true); g.closePath(); g.fillStyle = 'rgba(0,0,0,.9)'; g.fill(); g.restore();
        g.strokeStyle = 'rgba(245,248,255,.95)'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, r2 + 2, a1, a2); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1); g.lineTo(cx + Math.cos(a1) * r2, cy + Math.sin(a1) * r2); g.stroke(); g.beginPath(); g.moveTo(cx + Math.cos(a2) * r1, cy + Math.sin(a2) * r1); g.lineTo(cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; for (let k = 0; k < 10; k++) { const rr = r1 + (r2 - r1) * Math.random(); g.beginPath(); g.arc(cx, cy, rr, a1, a2); g.stroke(); } // разводы
      } });
    const m = map => new THREE.MeshStandardMaterial({ map, transparent: true, roughness: .55, metalness: .1, color: 0xffffff, depthWrite: false, side: THREE.DoubleSide });
    return { side: m(full), full: m(full), wiper: m(wiper) };
  })();
  const CARCFG = { vaz2101: { front: ['material_5', 'material_6'], rear: ['material_10', 'material_0'] }, vaz2107: { front: ['lampglass'], rear: ['lampglass', 'red light'] } };
  const carPrep = {};
  function prepCar(asset) { // один раз на модель: деление фар на передние/задние, размеры для снежных шапок
    if (carPrep[asset]) return carPrep[asset]; const A = ASSETS[asset]; if (!A) return null; const cfg = CARCFG[asset.replace('_lod', '')], root = A.scene; root.updateMatrixWorld(true);
    const lampSplit = [];
    root.traverse(o => { if (!o.isMesh) return; const mn = (o.material.name || '').trim(); if (cfg.front.includes(mn) || cfg.rear.includes(mn)) lampSplit.push([o, mn]); });
    for (const [o, mn] of lampSplit) { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, P = g.attributes.position; const parts = { f: [], r: [] };
      for (let i = 0; i < P.count; i += 3) { const cx = (P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3; const side = cx > 0 ? 'f' : 'r'; if ((side === 'f' && !cfg.front.includes(mn)) || (side === 'r' && !cfg.rear.includes(mn))) continue; for (let k = 0; k < 3; k++) parts[side].push(P.getX(i + k), P.getY(i + k), P.getZ(i + k)); }
      for (const sd of ['f', 'r']) if (parts[sd].length) { const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(parts[sd], 3)); ng.computeVertexNormals(); const m = new THREE.Mesh(ng, o.material); m.userData.lamp = sd; m.position.copy(o.position); m.quaternion.copy(o.quaternion); o.parent.add(m); }
      o.parent.remove(o); }
    let top = 0, roofX = 0, nT = 0, hood = 0, trunk = 0; const v = new THREE.Vector3();
    root.traverse(o => { if (!o.isMesh || (o.material.name || '') !== 'paint') return; const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); top = Math.max(top, v.y); if (v.x > 1.1 && v.x < 1.6 && Math.abs(v.z) < .3) hood = Math.max(hood, v.y); if (v.x < -1.3 && v.x > -1.8 && Math.abs(v.z) < .3) trunk = Math.max(trunk, v.y); } });
    root.traverse(o => { if (!o.isMesh || (o.material.name || '') !== 'paint') return; const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); if (v.y > top * .97) { roofX += v.x; nT++; } } });
    // снежный слой по форме кузова: верхние грани краски, приподнятые на толщину снега (шум по позиции — без щелей)
    const shell = full => { const pos = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
      const th = (x, z) => .025 + .035 * (.5 + .5 * Math.sin(x * 7.1 + z * 3.3) * Math.cos(z * 9.7 - x * 2.1));
      root.traverse(o => { if (!o.isMesh || (o.material.name || '') !== 'paint') return; const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, P = g.attributes.position;
        for (let i = 0; i < P.count; i += 3) { a.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(P, i + 1).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(P, i + 2).applyMatrix4(o.matrixWorld);
          n.subVectors(b, a).cross(c.clone().sub(a)).normalize(); if (n.y < .55) continue; const cx = (a.x + b.x + c.x) / 3;
          if (!full && Math.min(a.y, b.y, c.y) < top * .9) continue; // у едущих — только крыша
          for (const v of [a, b, c]) pos.push(v.x, v.y + th(v.x, v.z) * (full ? 1.6 : 1), v.z); } });
      if (!pos.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      const uv = new Float32Array(pos.length / 3 * 2); for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] * .5; uv[i * 2 + 1] = pos[i * 3 + 2] * .5; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; };
    return carPrep[asset] = { top, roofX: roofX / Math.max(1, nT), hood, trunk, snowFull: shell(true), snowRoof: shell(false) };
  }
  const carBlobGeo = new THREE.PlaneGeometry(5.2, 2.6), carBlobMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: regTex(ctex(128, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(.55, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.setTransform(1, 0, 0, h / w * 1.9, 0, -h * .45); g.fillStyle = gr; g.fillRect(0, 0, w, h * 2); })) }); // мягкая тень-подложка
  const snowCapGeo = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  function realCar(g) {
    const { color, parked } = g.userData; const kinds = ['vaz2101', 'vaz2107'].filter(k => ASSETS[k]); const kind = kinds[(carGroups.indexOf(g) + (parked ? 1 : 0)) % kinds.length];
    const pr = prepCar(kind); const lod = new THREE.LOD(); g.add(lod);
    const levels = [[kind, 0], [kind + '_lod', 14]].filter(([a]) => ASSETS[a]); levels.forEach(([a]) => prepCar(a));
    const paint = std({ color, roughness: parked ? .55 : .3, metalness: .45 }), hl = std({ color: 0xffffee, emissive: 0xfff2c0, emissiveIntensity: 0, roughness: .2 }), tl = std({ color: 0x8a1a12, emissive: 0xff2a10, emissiveIntensity: .3 });
    const wheels = [];
    for (const [a, dist] of levels) { const o = ASSETS[a].scene.clone(true); lod.addLevel(o, dist);
    o.traverse(m => { if (/^wheel\d$/.test(m.name)) wheels.push(m);
      if (!m.isMesh) return; m.castShadow = true; m.receiveShadow = true; const mn = (m.material.name || '').trim();
      if (mn === 'paint') m.material = paint;
      else if (m.name === 'glass_front') { m.material = parked ? FROST.full : FROST.wiper; m.castShadow = false; m.renderOrder = 2; }
      else if (m.name === 'glass_side' || m.name === 'glass_rear') { m.material = FROST.side; m.castShadow = false; m.renderOrder = 2; }
      if (m.userData.lamp === 'f') m.material = hl; else if (m.userData.lamp === 'r') m.material = tl; }); }
    // снег: шапка на крыше у всех, у стоящих — ещё на капоте и багажнике
    { const sg = parked ? pr.snowFull : pr.snowRoof; if (sg) { const c = new THREE.Mesh(sg, MAT.snow); c.castShadow = true; c.receiveShadow = true; c.userData.winter = true; g.add(c); } }
    const blob = new THREE.Mesh(carBlobGeo, carBlobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = .02; blob.renderOrder = 1; g.add(blob);
    Object.assign(g.userData, { hl, tl, wheels, kind, wheelR: kind === 'vaz2107' ? .3 : .28 });
  }
  function procCar(g, color) {
    const body = std({ color, roughness: .32, metalness: .55 });
    const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    add(carGeo.body, body);
    for (const sz of [-.81, .81]) add(carGeo.win, CAR.glass, 0, 0, sz);
    const ws = add(new THREE.PlaneGeometry(1.42, .62), CAR.glass, .76, 1.11, 0); ws.lookAt(.76 + Math.cos(.84), 1.11 + Math.sin(.84), 0);
    const rw = add(new THREE.PlaneGeometry(1.38, .58), CAR.glass, -.74, 1.09, 0); rw.lookAt(-.74 - Math.cos(.84), 1.09 + Math.sin(.84), 0);
    for (const x of [2.16, -2.16]) { add(new THREE.BoxGeometry(.1, .1, 1.72), CAR.chrome, x, .46, 0); add(new THREE.BoxGeometry(.02, .12, .34), CAR.plate, x + Math.sign(x) * .05, .6, 0); }
    add(new THREE.BoxGeometry(.03, .2, .9), CAR.grille, 2.13, .64, 0);
    const hl = std({ color: 0xffffee, emissive: 0xfff2c0, emissiveIntensity: 0 }), tl = std({ color: 0x8a1a12, emissive: 0xff2a10, emissiveIntensity: .3 });
    for (const z of [-.6, -.4, .4, .6]) { const l = add(new THREE.CylinderGeometry(.075, .075, .04, 12), hl, 2.13, .66, z); l.rotation.z = Math.PI / 2; }
    for (const z of [-.55, .55]) add(new THREE.BoxGeometry(.04, .14, .3), tl, -2.13, .66, z);
    for (const sz of [-.8, .8]) { add(new THREE.BoxGeometry(4.1, .14, .03), CAR.mud, 0, .44, sz * 1.03); add(new THREE.BoxGeometry(1.3, .02, .02), CAR.chrome, 1.2 - 1.3, .8, sz * 1.03); }
    add(new THREE.BoxGeometry(1.0, .07, 1.4), MAT.snow, -.02, 1.38, 0); add(new THREE.BoxGeometry(.9, .04, 1.4), MAT.snow, 1.5, .84, 0); add(new THREE.BoxGeometry(.7, .04, 1.4), MAT.snow, -1.6, .86, 0);
    mergeByMat(g);
    const wheels = [];
    for (const [wx, wz] of [[-1.25, -.72], [1.25, -.72], [-1.25, .72], [1.25, .72]]) { const w = new THREE.Group(); w.position.set(wx, .31, wz); const t = new THREE.Mesh(carGeo.tire, CAR.tire), hb = new THREE.Mesh(carGeo.hub, CAR.chrome), sp = new THREE.Mesh(carGeo.spoke, CAR.grille); t.castShadow = true; w.add(t, hb, sp); g.add(w); wheels.push(w); }
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .35, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = .02; g.add(blob);
    Object.assign(g.userData, { hl, tl, wheels, wheelR: .31 });
  }
  for (const [x, z, r, c] of [[18, -7, 0, 0xd8d4c8], [24.5, -7.3, .05, 0x7a2a22], [31, -9.5, Math.PI / 2, 0x3a5a3a], [-8, -2.6, 0, 0xc8b88a]]) { const m = carMesh(c, true); m.position.set(x, 0, z); m.rotation.y = r; const hx = Math.abs(Math.sin(r)) > .5 ? .9 : 2.1, hz = Math.abs(Math.sin(r)) > .5 ? 2.1 : .9; addCol(x - hx, x + hx, z - hz, z + hz); occ(m.children[0]); }
  // кольцевые маршруты (с поворотами за домами)
  const ROUTES = [
    [[-82, 12], [86, 12], [92, 18], [92, 46], [86, 52], [-84, 52], [-90, 46], [-90, 18]],
    [[86, 8.4], [-82, 8.4], [-88, 14], [-88, 44], [-82, 50], [84, 50], [90, 44], [90, 14]],
  ];
  function routePoint(route, s) { // s — пройденная длина
    let total = 0; const segs = []; for (let i = 0; i < route.length; i++) { const a = route[i], b = route[(i + 1) % route.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, l]); total += l; }
    s = ((s % total) + total) % total;
    for (const [a, b, l] of segs) { if (s <= l) { const t = s / l; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), total]; } s -= l; }
    return [route[0][0], route[0][1], total];
  }
  const cars = [];
  function addCar(ri, s0, color) { const m = carMesh(color); cars.push({ m, ri, s: s0, v: 0, vmax: R(8, 11.5), id: cars.length, heading: 0, honk: 0 }); }
  const CAR_COLORS = [0x6a7a8a, 0xb8a070, 0xe0ddd2, 0x7a2a22, 0x2a4a6a, 0x3a5a3a];

  // ---------- игрок ----------
  const P = { x: 0, z: .25, yaw: Math.PI, pitch: -.08, h: 1.18, vx: 0, vz: 0, seated: true, locked: false, crouch: false, sprint: false, stun: 0, bobPh: 0, roll: 0, shake: 0 };
  const STOOL = { x: 0, z: .25 };
  const input = { mx: 0, my: 0, keys: {} };
  const inKiosk = (x = P.x, z = P.z) => Math.abs(x) < KW && Math.abs(z) < KD;
  const PR = .26;
  const hitAny = (x, z, r = PR) => colliders.some(b => x > b.x1 - r && x < b.x2 + r && z > b.z1 - r && z < b.z2 + r);
  function canMove() { return ctx.getS() && !P.seated && !P.locked && !transport.riding && !ctx.cardOpen() && !ctx.sheetOpen() && P.stun <= 0; }
  function sit() { P.seated = true; P.crouch = false; ctx.onCtl(); }
  function stand() { if (P.locked) return; P.seated = false; const S = ctx.getS(); S && (S.flags.stood = true); ctx.onCtl(); }
  let fadeBusy = false;
  function fade(fn) { if (fadeBusy) return; fadeBusy = true; const f = document.getElementById('fade'); f.style.opacity = 1; setTimeout(() => { fn(); setTimeout(() => { f.style.opacity = 0; fadeBusy = false; ctx.onCtl(); }, 120); }, 260); }
  function goCounter(lock) {
    const doIt = () => { P.x = STOOL.x; P.z = STOOL.z; P.yaw = Math.PI; P.pitch = -.1; P.seated = true; P.locked = !!lock; P.vx = P.vz = 0; doorTarget = 0; ctx.onCtl(); };
    if (inKiosk() && P.seated) { P.locked = !!lock; P.yaw = Math.PI; ctx.onCtl(); } else fade(doIt);
  }
  function toggleDoor() { doorTarget = doorTarget > .5 ? 0 : 1; ctx.audio && ctx.audio.door(doorTarget > .5); }

  // ---------- люди ----------
  // граф тротуаров и дворов
  const NODES = {};
  const N = (id, x, z) => NODES[id] = { id, x, z, e: [] };
  const E = (a, b) => { NODES[a].e.push(b); NODES[b].e.push(a); };
  const SWX = [-66, -50, -34, -18, -8, -3, 3, 8, 18, 34, 50, 66];
  SWX.forEach((x, i) => { N('s' + i, x, 3.4); N('f' + i, x, 16.2); if (i) { E('s' + i, 's' + (i - 1)); E('f' + i, 'f' + (i - 1)); } });
  E('s5', 'f5'); // переход по «зебре»
  N('w', 0, 2.75); E('w', 's5'); E('w', 's6');
  N('c1', -8, -5.5); N('c2', 8, -5.5); N('c3', -8, -15); N('c4', 8, -15); N('c5', -18, -20); N('c6', 18, -20); N('m1', -12, -8); N('m2', -23, -8); N('g1', 24, -11); N('kd', .8, -3.2);
  E('c1', 's4'); E('c2', 's7'); E('c1', 'kd'); E('c2', 'kd'); E('c1', 'c3'); E('c2', 'c4'); E('c3', 'c4'); E('c3', 'c5'); E('c4', 'c6'); E('m1', 'c1'); E('m1', 'm2'); E('m1', 's3'); E('g1', 'c2'); E('g1', 'c6');
  const SPAWNS = [];
  [[-48, 18.4, 'f1'], [-36, 18.4, 'f2'], [-20, 18.4, 'f3'], [14, 18.4, 'f8'], [26, 18.4, 'f8'], [40, 18.4, 'f9'], [-12, -27.5, 'c5'], [0, -27.5, 'c3'], [12, -27.5, 'c6'], [-72, 3.4, 's0'], [74, 3.4, 's11'], [48, -18, 'g1'], [-32, -14, 'm2']].forEach(([x, z, n], i) => { N('sp' + i, x, z); E('sp' + i, n); SPAWNS.push('sp' + i); });
  // близкие точки за углами (скрыты стенами ларька, обменником, машинами)
  [[-3.6, -3.2, ['s4', 's5']], [3.6, -3.2, ['s6', 's7']], [12.6, -4.3, ['c2', 's8']], [-9.6, -4.6, ['c1']], [9.6, 5.2, ['s7', 's8']]].forEach(([x, z, ns], i) => { const id = 'nb' + i; N(id, x, z); ns.forEach(n => E(id, n)); SPAWNS.push(id); });
  function nearestNode(x, z, filter) { let best = null, bd = 1e9; for (const k in NODES) { if (filter && !filter(k)) continue; const n = NODES[k], d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = k; } } return best; }
  function path(a, b) { // Дейкстра на маленьком графе
    const dist = { [a]: 0 }, prev = {}, Qs = new Set(Object.keys(NODES));
    while (Qs.size) { let u = null, ud = Infinity; for (const k of Qs) { const d = dist[k] ?? Infinity; if (d < ud) { ud = d; u = k; } } if (u === null || u === b) break; Qs.delete(u);
      for (const v of NODES[u].e) { const nd = ud + Math.hypot(NODES[u].x - NODES[v].x, NODES[u].z - NODES[v].z); if (nd < (dist[v] ?? Infinity)) { dist[v] = nd; prev[v] = u; } } }
    const out = []; let c = b; while (c && c !== a) { out.unshift({ x: NODES[c].x, z: NODES[c].z }); c = prev[c]; } out.unshift({ x: NODES[a].x, z: NODES[a].z }); return out;
  }
  const hitP = new THREE.Vector3();
  const frustum = new THREE.Frustum(), projM = new THREE.Matrix4(), ray = new THREE.Raycaster(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  function visibleFromPlayer(x, z) {
    projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projM);
    tmpV.set(x, 1.2, z); const d = camera.position.distanceTo(tmpV);
    if (d > Q.draw) return false;
    if (!frustum.containsPoint(tmpV) && !frustum.containsPoint(tmpV.set(x, .1, z)) && !frustum.containsPoint(tmpV.set(x, 1.8, z))) return false;
    tmpV.set(x, 1.2, z); ray.set(camera.position, tmpV2.subVectors(tmpV, camera.position).normalize());
    for (const b of occBoxes) { if (b.containsPoint(camera.position)) continue; const hp = ray.ray.intersectBox(b, hitP); if (hp && hp.distanceTo(camera.position) < d - .5) return false; }
    return true;
  }
  function pickSpawn(near) { // точка вне поля зрения, ближе к цели
    const cand = SPAWNS.map(k => NODES[k]).filter(n => Math.hypot(n.x - camera.position.x, n.z - camera.position.z) > 10 && !visibleFromPlayer(n.x, n.z));
    const list = cand.length ? cand : SPAWNS.map(k => NODES[k]);
    list.sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z));
    return list[Math.min(list.length - 1, RI(0, 2))].id;
  }
  const people = []; // { h: Human, role, state, path, ... }
  function newPerson(kind, role, nodeId, extra) {
    const look = makeLook(kind);
    // модели «Зимние люди» для всех, кроме милиции (у неё своя форма); сталевар — среди рабочих
    let model = null;
    if (kind !== 'police') {
      if (staticWorker && kind === 'worker' && Math.random() < .2) model = staticWorker;
      else if (peopleModels.length) {
        const peopleModels = peopleByOutfit[outfitNow()] || peopleByOutfit.winter; // одежда по сезону
        const pool = peopleModels.filter(m => m.female === !look.male);
        const used = new Set(people.map(q => q.modelName));
        const fresh = (pool.length ? pool : peopleModels).filter(m => !used.has(m.name));
        const pm = pick(fresh.length ? fresh : (pool.length ? pool : peopleModels)); model = pm.parts; extra = Object.assign({ modelName: pm.name }, extra || {});
      }
    }
    if (model && kind === 'school') look.height = 1.45;
    const h = new Human(look, model);
    const n = NODES[nodeId]; h.obj.position.set(n.x + R(-.3, .3), 0, n.z + R(-.3, .3)); scene.add(h.obj);
    const shadow = new THREE.Mesh(blobGeo, blobMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; h.obj.add(shadow);
    const p = Object.assign({ h, role, state: 'idle', path: [], speed: look.walkSpeed, timer: 0, kind, fear: 0, id: Math.random() }, extra || {});
    people.push(p); return p;
  }
  const blobGeo = new THREE.CircleGeometry(.32, 16), blobMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .32, depthWrite: false });
  function removePerson(p) { scene.remove(p.h.obj); const i = people.indexOf(p); if (i >= 0) people.splice(i, 1); }
  function goTo(p, x, z, then) {
    if (p.dead) return;
    const o = p.h.obj.position, a = nearestNode(o.x, o.z), b = nearestNode(x, z); const pt = path(a, b); pt.push({ x, z });
    // не возвращаться к узлу, который уже позади
    while (pt.length > 1 && Math.hypot(pt[1].x - o.x, pt[1].z - o.z) <= Math.hypot(pt[1].x - pt[0].x, pt[1].z - pt[0].z) + .2) pt.shift();
    if (Math.hypot(x - o.x, z - o.z) < 6) pt.splice(0, pt.length - 1); // рядом — напрямую
    p.path = pt; p.then = then; p.state = 'walk';
  }
  function leaveWorld(p) { if (p.dead) return; const target = NODES[pickSpawn(p.h.obj.position)]; goTo(p, target.x, target.z, () => removePerson(p)); p.leaving = true; }
  function spawnVendor(i) { const s = vendorSpots[i % vendorSpots.length]; if (!s) return; const p = newPerson(i === 0 ? 'babka' : 'vendor', 'vendor', 'm2'); p.h.obj.position.set(s.x, 0, s.z); p.h.obj.rotation.y = s.rot; p.state = 'stand'; p.anim = 'idle'; }
  const lineFor = {
    babka: ['Ох, сынок, всё дорожает…', 'Пенсию опять задержали.', 'В наше время хлеб по 16 копеек был.', 'Ты бы шапку надел, холодно же.'],
    worker: ['Здорово.', 'Смена тяжёлая была…', 'Завод опять стоит.', 'Не подскажешь, автобус давно был?'],
    youth: ['Чё как?', 'Кассеты новые есть?', 'Видал, что на рынке творится?', 'Ну, бывай.'],
    school: ['Здрасьте!', 'Вкладыши есть?', 'Мне мамка денег дала на хлеб.'],
    gopnik: ['Слышь, ты чё тут ходишь?', 'Закурить есть?', 'С какого района?'],
    vendor: ['Подходи, выбирай!', 'Свежее, утреннее.', 'Для тебя — скидка.'],
    neighbor: ['Здравствуй, соседушка.', 'Говорят, свет опять отключат.'],
  };
  function ambientTick(dt) {
    const S = ctx.getS();
    const peds = people.filter(p => p.role === 'ped').length;
    const night = nightK > .6;
    const want = Math.min(Q.npc - 6, night ? 3 : 7);
    if (peds < want && Math.random() < dt * .4) {
      const kind = night ? pick(['worker', 'youth', 'gopnik']) : pick(['babka', 'worker', 'worker', 'youth', 'school', 'neighbor']);
      const sp = pickSpawn({ x: R(-40, 40), z: R(-15, 10) });
      const p = newPerson(kind, 'ped', sp); wander(p);
    }
    // гопники
    if (S && !gopnikGroup && S.day >= 2 && Math.random() < dt * (night ? .012 : .004) * (S.rep.street >= 30 ? .4 : 1)) spawnGopniks();
  }
  function wander(p) {
    const keys = Object.keys(NODES).filter(k => !k.startsWith('sp') && k !== 'w'); const k = pick(keys);
    goTo(p, NODES[k].x + R(-1, 1), NODES[k].z + R(-.6, .6), () => {
      if (Math.random() < .3) { p.state = 'pause'; p.timer = R(3, 9); p.anim = pick(['idle', 'wait', p.kind === 'gopnik' || p.kind === 'youth' ? 'smoke' : 'idle']); }
      else if (Math.random() < .25) leaveWorld(p); else wander(p);
    });
  }

  // ---------- покупатели ----------
  const WIN = { x: 0, z: 1.95 };
  const QSLOTS = [[1.05, 2.75], [1.9, 3.1], [2.75, 3.35], [3.6, 3.5], [4.45, 3.55], [5.3, 3.6]];
  const CUST_KIND = { babka: 'babka', school: 'school', worker: 'worker', student: 'youth', chelnok: 'chelnok', newrus: 'newrus', racket: 'racket', police: 'police', neighbor: 'neighbor' };
  function spawnCustomer(c) {
    const kind = CUST_KIND[c.k] || 'worker';
    const sp = pickSpawn(WIN);
    const p = newPerson(kind, 'cust', sp, { c }); c.person = p;
    const ins = Math.random() < .7 && !c.special;
    if (ins) goTo(p, R(-.9, .9), 2.25, () => { p.state = 'inspect'; p.timer = R(2, 3.5); p.anim = 'inspect'; });
    else goTo(p, QSLOTS[0][0], QSLOTS[0][1], () => arrive(p));
    return p;
  }
  function arrive(p) { if (p.arrived) return; p.arrived = true; p.state = 'queue'; ctx.arrive(p.c); }
  function customerEvent(c, ev) {
    const p = c && c.person; if (!p) return;
    if (ev === 'sold') { p.anim = 'pay'; p.h.setExpr('smile'); p.timer = 1.4; p.state = 'paying'; }
    if (ev === 'refused') { p.h.setExpr('angry'); }
    if (ev === 'talk') { p.h.setExpr('talk'); p.talkT = 1.2; }
  }
  function custTick(p, dt) {
    const T = ctx.getT(), c = p.c;
    const S = ctx.getS();
    if (p.state === 'paying') { p.timer -= dt; p.anim = p.timer < .6 ? 'receive' : 'pay'; if (p.timer <= 0) { p.anim = 'idle'; leaveWorld(p); } return; }
    const gone = !T || !S || S.phase !== 'trade' || (T.cur !== c && !T.queue.includes(c) && !(T.walking || []).includes(c));
    if (gone && !p.leaving) { p.h.setExpr(p.h.expr === 'smile' ? 'smile' : (c && c.lostAngry ? 'angry' : 'neutral')); leaveWorld(p); return; }
    if (p.leaving) return;
    if (p.state === 'inspect') { p.timer -= dt; faceTo(p, Math.PI, dt); if (p.timer <= 0) { p.anim = 'idle'; goTo(p, qSpot(p).x, qSpot(p).z, () => arrive(p)); } return; }
    if (p.arrived && p.state !== 'walk') {
      const s = qSpot(p); const d = Math.hypot(s.x - p.h.obj.position.x, s.z - p.h.obj.position.z);
      if (d > .15) { p.state = 'step'; moveToward(p, s.x, s.z, dt, .9); }
      else { p.state = 'queue'; faceTo(p, T.cur === c ? Math.PI : Math.PI * .8, dt); const pat = c.pat / c.patMax; p.anim = T.cur === c ? (p.talkT > 0 ? 'talk' : (c.special && c.k === 'racket' ? 'threaten' : pat < .35 ? 'wait' : 'idle')) : (pat < .4 ? 'wait' : 'idle'); if (pat < .3 && !c.special) p.h.setExpr('angry'); if (c.special && c.k === 'racket') p.h.setExpr('angry'); }
      p.talkT = (p.talkT || 0) - dt;
    }
  }
  function qSpot(p) { const T = ctx.getT(); if (!T) return WIN; if (T.cur === p.c) return WIN; const i = T.queue.indexOf(p.c); const s = QSLOTS[clamp(i, 0, QSLOTS.length - 1)]; return { x: s[0], z: s[1] }; }

  // ---------- гопники ----------
  let gopnikGroup = null;
  function spawnGopniks() {
    const n = RI(2, 3), sp = pickSpawn({ x: P.x, z: P.z }); const g = { members: [], state: 'approach', t: 0, demanded: false, id: Math.random() };
    for (let i = 0; i < n; i++) { const p = newPerson('gopnik', 'gop', sp, { group: g, idx: i }); p.speed = p.h.L.walkSpeed; g.members.push(p); }
    g.leader = g.members.reduce((a, b) => a.h.L.aggression > b.h.L.aggression ? a : b);
    gopnikGroup = g;
  }
  function gopTarget() { return inKiosk() ? { x: WIN.x, z: WIN.z + .4 } : { x: P.x, z: P.z }; }
  function gopTick(dt) {
    const g = gopnikGroup; if (!g) return; g.t += dt;
    g.members = g.members.filter(p => people.includes(p)); if (!g.members.length) { gopnikGroup = null; return; }
    if (g.state === 'approach') {
      const tg = gopTarget(), L = g.leader.h.obj.position, d = Math.hypot(tg.x - L.x, tg.z - L.z);
      g.members.forEach((p, i) => { if (p.repath === undefined || (p.repath -= dt) < 0) { p.repath = 1.5; const off = (i - 1) * .9; if (d > 7) goTo(p, tg.x + off, tg.z + (inKiosk() ? .3 : 1.2)); else { p.path = [{ x: tg.x + off + (inKiosk() ? 0 : 1.1 * Math.sign(off || 1)), z: tg.z + (inKiosk() ? .5 + Math.abs(off) * .3 : 1.3) }]; p.state = 'walk'; } } });
      if (d < 2.4 && !g.demanded && !ctx.cardOpen()) { g.demanded = true; g.state = 'demand'; g.members.forEach(p => { p.state = 'stand'; p.anim = p === g.leader ? 'threaten' : pick(['pocket', 'smoke']); p.h.setExpr('angry'); }); ctx.gopnikDemand(g); }
      if (g.t > 70) gopLeave(g, 'bored');
    }
    if (g.state === 'demand' || g.state === 'stand') g.members.forEach(p => { const L = p.h.obj.position; faceTo(p, Math.atan2(camera.position.x - L.x, camera.position.z - L.z), dt); });
  }
  function gopLeave(g, how) {
    if (!g || g.state === 'gone') return; g.state = 'gone';
    g.members.forEach(p => { p.h.setExpr(how === 'flee' ? 'scared' : how === 'paid' ? 'smile' : 'angry'); p.flee = how === 'flee'; leaveWorld(p); if (how === 'flee') p.speed = 3.6; });
    setTimeout(() => { if (gopnikGroup === g) gopnikGroup = null; }, 1500);
  }

  // ---------- движение людей ----------
  function faceTo(p, ang, dt) { let da = ang - p.h.obj.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); p.h.obj.rotation.y += da * Math.min(1, dt * 6); }
  function moveToward(p, tx, tz, dt, spd) {
    const o = p.h.obj.position, dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz);
    if (d < .05) return 0;
    let st = Math.min(d, spd * dt), mx = dx / d * st, mz = dz / d * st;
    // расталкивание с другими людьми и игроком
    for (const q of people) { if (q === p) continue; const qx = q.h.obj.position.x - o.x, qz = q.h.obj.position.z - o.z, qd = Math.hypot(qx, qz); if (qd < .55 && qd > .001) { mx -= qx / qd * (.55 - qd) * .5; mz -= qz / qd * (.55 - qd) * .5; } }
    const ppx = P.x - o.x, ppz = P.z - o.z, pd = Math.hypot(ppx, ppz); if (pd < .6 && pd > .001) { mx -= ppx / pd * (.6 - pd) * .6; mz -= ppz / pd * (.6 - pd) * .6; }
    // стены, машины, ограждения: обход по сторонам, при застревании — новый путь
    if (npcBlocked(o.x + mx, o.z + mz)) {
      const len = Math.hypot(mx, mz) || st, a0 = Math.atan2(mx, mz); let ok = false;
      for (const da of [.5, -.5, 1, -1, 1.5, -1.5, 2.1, -2.1]) { const a = a0 + da * (p.side || 1), nx = Math.sin(a) * len, nz = Math.cos(a) * len; if (!npcBlocked(o.x + nx, o.z + nz)) { mx = nx; mz = nz; ok = true; break; } }
      if (!ok) { mx = mz = 0; }
      p.stuck = (p.stuck || 0) + dt;
      if (p.stuck > 1.6) { p.stuck = 0; p.side = -(p.side || 1); if (p.path && p.path.length) { const fin = p.path[p.path.length - 1], then = p.then; goTo(p, fin.x, fin.z, then); } }
    } else p.stuck = Math.max(0, (p.stuck || 0) - dt);
    o.x += mx; o.z += mz;
    faceTo(p, Math.atan2(mx || dx, mz || dz), dt);
    return Math.hypot(mx, mz);
  }
  function npcBlocked(x, z) {
    { const o = transport.obstacle(), ca = Math.abs(Math.cos(o.heading)), sa = Math.abs(Math.sin(o.heading)), hx = o.hx * ca + o.hz * sa, hz = o.hx * sa + o.hz * ca; if (Math.abs(x - o.x) < hx + .2 && Math.abs(z - o.z) < hz + .2) return true; }
    if (Math.abs(x) < KW + .3 && z > -KD - .3 && z < KD + .3) return true; // ларёк
    for (const b of colliders) if (b.tag !== 'door' && x > b.x1 - .22 && x < b.x2 + .22 && z > b.z1 - .22 && z < b.z2 + .22) return true;
    for (const c of cars) { const cx = c.m.position.x, cz = c.m.position.z, ca = Math.abs(Math.cos(c.heading)), sa = Math.abs(Math.sin(c.heading)), hx = 2.2 * ca + .9 * sa, hz = 2.2 * sa + .9 * ca; if (Math.abs(x - cx) < hx + .25 && Math.abs(z - cz) < hz + .25) return true; }
    return false;
  }
  function fixNodes() { // узлы графа не должны оказаться внутри препятствий
    for (const k in NODES) { const n = NODES[k]; if (!npcBlocked(n.x, n.z)) continue;
      for (let r = .3; r < 4; r += .3) { let done = false; for (let a = 0; a < 6.28; a += .5) { const x = n.x + Math.cos(a) * r, z = n.z + Math.sin(a) * r; if (!npcBlocked(x, z)) { n.x = x; n.z = z; done = true; break; } } if (done) break; } }
  }
  const umbrellaGeo = (() => { const g = new THREE.ConeGeometry(.52, .26, 8, 1, true); g.translate(0, .9, 0); return g; })(), umbrellaStick = new THREE.CylinderGeometry(.008, .008, .9, 5); umbrellaStick.translate(0, .45, 0);
  const umbrellaMats = ['#1a1a1e', '#5a1e22', '#2a3a5a', '#3a4a32', '#6a5a3a'].map(c => std({ color: c, roughness: .6, side: THREE.DoubleSide }));
  function umbrellaTick(p) { // прохожие раскрывают зонт в дождь (не зимой)
    const want = !winter && weather.rain > .3 && p.role !== 'vendor' && p.role !== 'marat' && !p.dead && (p.umbSeed ??= Math.random()) < .75;
    if (want && !p.umb && p.h.R.elR) { const g = new THREE.Group(); g.add(new THREE.Mesh(umbrellaGeo, umbrellaMats[Math.floor(p.umbSeed * 7) % umbrellaMats.length]), new THREE.Mesh(umbrellaStick, MAT.dark)); g.position.set(0, -.26, .02); g.rotation.x = 1.45; g.children[0].castShadow = true; p.h.R.elR.add(g); p.umb = g; p.h.umbrella = true; }
    else if (!want && p.umb) { p.umb.parent.remove(p.umb); p.umb = null; p.h.umbrella = false; }
  }
  function peopleTick(dt) {
    const camPos = camera.position;
    if (marat) { const S3 = ctx.getS(), away = !!(S3 && S3.phase === 'night' && hour > 23); marat.hidden = away; marat.h.obj.visible = !away; const d = Math.hypot(P.x - marat.h.obj.position.x, P.z - marat.h.obj.position.z);
      if (marat.state !== 'scared') { marat.anim = d < 5 ? (marat.talking ? 'talk' : 'idle') : 'smoke'; if (d < 7) faceTo(marat, Math.atan2(P.x - marat.h.obj.position.x, P.z - marat.h.obj.position.z), dt); else faceTo(marat, Math.PI * .6, dt); } }
    for (const p of people.slice()) {
      if (p.dead) { deadTick(p, dt); continue; }
      umbrellaTick(p);
      if (p.role === 'cust') custTick(p, dt);
      let dist = 0;
      if (p.state === 'walk' && p.path.length) {
        const tg = p.path[0], spd = p.flee ? 3.8 : p.speed * (p.role === 'cust' && p.path.length > 2 ? 1.1 : 1);
        dist = moveToward(p, tg.x, tg.z, dt, spd);
        if (Math.hypot(tg.x - p.h.obj.position.x, tg.z - p.h.obj.position.z) < .25) { p.path.shift(); if (!p.path.length) { p.state = 'arrived'; const f = p.then; p.then = null; f && f(); } }
        p.h.setAnim(p.flee ? 'flee' : spd > 2.5 ? 'run' : 'walk');
      } else if (p.state === 'pause') { p.timer -= dt; p.h.setAnim(p.anim || 'idle'); if (p.timer <= 0) wander(p); }
      else if (p.state === 'step') { p.h.setAnim('walk'); dist = .9 * dt; }
      else if (p.state === 'scared') { p.timer -= dt; p.h.setAnim(p.anim); if (p.timer <= 0) { p.h.setExpr('neutral'); if (p.role === 'ped') leaveWorld(p); else p.state = p.prevState || 'idle'; } }
      else if (p.state === 'talking') { p.timer -= dt; p.h.setAnim('talk'); faceTo(p, Math.atan2(P.x - p.h.obj.position.x, P.z - p.h.obj.position.z), dt); if (p.timer <= 0) { p.h.setExpr('neutral'); wander(p); } }
      else p.h.setAnim(p.anim || 'idle');
      // видимость и дальность прорисовки
      const far = Math.hypot(p.h.obj.position.x - camPos.x, p.h.obj.position.z - camPos.z);
      p.h.obj.visible = far < Q.draw * .6;
      if (p.h.obj.visible) p.h.update(dt, dist);
    }
  }

  function busExchange(key, door) {
    for (const p of people) if (p.role === 'ped' && !p.leaving && Math.hypot(p.h.obj.position.x - door.x, p.h.obj.position.z - door.z) < 9) { p.state = 'walk'; p.path = [{ x: door.x, z: door.z }]; p.then = () => { p.inBus = true; removePerson(p); }; }
    const n = Math.random() < .6 ? RI(1, 2) : 0;
    for (let i = 0; i < n && people.length < Q.npc; i++) { const kind = pick(['babka', 'worker', 'youth', 'neighbor']); const id = 'tmpBus' + Math.random(); N(id, door.x, door.z); const pp = newPerson(kind, 'ped', id); delete NODES[id]; pp.h.obj.position.set(door.x + i * .5, 0, door.z); setTimeout(() => people.includes(pp) && wander(pp), 600 + i * 700); }
  }
  // ---------- Марат: посредник на остановке ----------
  let marat = null;
  function spawnMarat() {
    const look = makeLook('worker'); Object.assign(look, { male: true, height: 1.78, build: 1.15, top: '#141414', leather: true, puffy: false, pants: '#1d1d22', boots: '#111', hat: 'kepka', hatC: '#262626', hairStyle: 'short', hair: '#1c1410', facial: 'mustache', chain: true, scarf: null, bag: null, coat: false, stripes: null, apron: null, age: 38, nerve: .7, aggression: .2, swagger: .6, kind: 'worker' });
    const h = new Human(look, null); h.obj.position.set(STOPS.kiosk.x + 3.1, 0, 4.25); scene.add(h.obj);
    const sh = new THREE.Mesh(blobGeo, blobMat); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; h.obj.add(sh);
    marat = { h, role: 'marat', state: 'stand', anim: 'smoke', path: [], kind: 'worker', title: 'Марат', talk: () => ctx.maratTalk && ctx.maratTalk(), id: 'marat' };
    people.push(marat);
  }
  // ---------- ружьё и реакции ----------
  const weapon = createWeapon({ audio: ctx.audio, onShot: () => onShot() });
  // ---------- автобус №7 и остановки ----------
  let riderCam = null;
  const transport = createTransport({ scene, std, routePoint, route: ROUTES[1], P, camera, ctx, audio: ctx.audio, onCtl: () => ctx.onCtl(), night: () => nightK > .45,
    setRiderCam: (p, k) => { riderCam = p.clone(); }, onAlight: (x, z, key) => { riderCam = null; P.x = x; P.z = z; P.vx = P.vz = 0; P.h = 1.66; ctx.toast && ctx.toast('Остановка «' + STOPS[key].name + '»'); },
    onArrive: (key, door) => busExchange(key, door) });
  const busCol = addCol(999, 999, 999, 999, 'bus');
  // ---------- ружьё как физический предмет: на стене / в руках / лежит в мире ----------
  let gunGeo = null, gunMat = null;
  function gunWorldMesh() { const g = new THREE.Group(); if (gunGeo) { const m = new THREE.Mesh(gunGeo, gunMat); m.rotation.x = -Math.PI / 2; m.position.set(0, .04, .55); m.castShadow = true; g.add(m); } else { const m = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, 1.1), MAT.dark); m.position.y = .03; g.add(m); } return g; }
  const RACK = { x: KW - .07, y: 1.92, z: -.05 };
  let wallGun = null, wallRope = null;
  const hookM = std({ color: 0x5a5a5a, metalness: .7, roughness: .4 });
  for (const dz of [-.32, .3]) { const h = box(.06, .03, .03, hookM, RACK.x + .02, RACK.y - .05, RACK.z + dz, K); h.userData.keep = true; }
  function buildWallGun() { if (wallGun) scene.remove(wallGun); wallGun = gunWorldMesh(); scene.add(wallGun); if (!wallRope) wallRope = new Rope(scene, { n: 12, length: .9, width: .028 }); }
  const rackBox = new THREE.Box3(new THREE.Vector3(RACK.x - .2, RACK.y - .25, RACK.z - .65), new THREE.Vector3(RACK.x + .05, RACK.y + .2, RACK.z + .65));
  const gunState = () => { const S = ctx.getS(); return S ? (S.gunState || 'wall') : 'wall'; };
  function setGunState(st) { const S = ctx.getS(); if (!S) return; S.gunState = st; S.gun = st === 'carried'; if (st !== 'carried' && weapon.drawn) weapon.holster(); ctx.onCtl(); }
  function wallGunTick(dt) {
    const on = gunState() === 'wall'; if (wallGun) wallGun.visible = on; if (!wallRope) return; wallRope.visible = on && !!wallGun;
    if (on && wallGun) { wallGun.position.set(RACK.x - .03, RACK.y, RACK.z + .55); wallGun.rotation.set(0, -Math.PI / 2, -Math.PI / 2 + .06); wallGun.updateMatrixWorld(true); const a = wallGun.localToWorld(tmpV.set(0, -.03, -.25)).clone(), b = wallGun.localToWorld(tmpV2.set(0, -.03, .7)).clone(); wallRope.update(a, b, dt, .02); }
  }
  const windVec = new THREE.Vector2();
  const life = createLife({ scene, camera, P, ctx, KW, KD, std, colliders, addCol, audio: ctx.audio, onCtl: () => ctx.onCtl(), overlayScene: weapon.scene,
    visibleFromPlayer: (x, z) => visibleFromPlayer(x, z), doorOpen: () => doorOpen, wind: () => windVec, gunWorldMesh,
    onDelivered: d => ctx.onDelivered && ctx.onDelivered(d), onUnpack: data => ctx.onUnpack && ctx.onUnpack(data), onDrink: (k, s) => ctx.onDrink && ctx.onDrink(k, s) });
  function aimedPerson(maxD = 30) {
    camera.getWorldDirection(tmpV2); let best = null, bd = .5;
    for (const p of people) { if (p.hidden || p.dead) continue; const o = p.h.obj.position; tmpV.set(o.x, 1.3 * p.h.L.height / 1.75, o.z).sub(camera.position); const along = tmpV.dot(tmpV2); if (along < .5 || along > maxD) continue; const perp = tmpV.addScaledVector(tmpV2, -along).length(); if (perp < bd) { bd = perp; best = p; } }
    return best;
  }
  function threaten(p) { // ружьё наведено на человека
    if (p.reacted && p.reacted > performance.now()) return;
    p.reacted = performance.now() + 1500;
    const L = p.h.L, S = ctx.getS();
    if (p.role === 'gop') {
      const g = p.group, lead = g.leader.h.L, brave = lead.nerve + lead.aggression * .3;
      if (brave > .95) { g.members.forEach(m => { m.h.setExpr('angry'); m.anim = 'threaten'; }); ctx.say(g.leader, pick(['Да ты не выстрелишь!', 'Ружьишко-то, поди, незаряженное?', 'Ну давай, стреляй, если смелый!'])); }
      else if (brave > .65) { g.members.forEach(m => { m.h.setExpr('scared'); m.anim = 'idle'; }); ctx.say(g.leader, pick(['Всё, всё, мужик, мы уходим.', 'Ладно, остынь…'])); gopLeave(g, 'back'); ctx.gopResolved && ctx.gopResolved('scared'); }
      else if (brave > .4) { g.members.forEach(m => { m.state = 'scared'; m.anim = 'handsUp'; m.timer = 2; m.h.setExpr('scared'); }); ctx.say(g.leader, pick(['Э-э, ты чё! Мы просто спросить!', 'Не стреляй, не стреляй!'])); setTimeout(() => gopLeave(g, 'flee'), 1800); ctx.gopResolved && ctx.gopResolved('scared'); }
      else { gopLeave(g, 'flee'); ctx.say(g.leader, 'Атас!'); ctx.gopResolved && ctx.gopResolved('scared'); }
      return;
    }
    if (p.role === 'vendor' || p.role === 'marat') { p.state = 'scared'; p.anim = 'handsUp'; p.timer = 4; p.h.setExpr('scared'); if (p.role === 'marat') { const S2 = ctx.getS(); S2 && (S2.flags.maratAngry = S2.day); p.timer = 3; } return; }
    // мирные — пугаются
    p.prevState = p.state; p.state = 'scared'; p.anim = L.nerve > .3 ? 'handsUp' : 'scared'; p.timer = 2.5; p.h.setExpr('scared');
    if (!p.scaredOnce) { p.scaredOnce = true; ctx.rep('folk', -1.5); }
    if (p.role === 'cust' && p.c) { ctx.customerScared(p.c); }
    else setTimeout(() => { if (people.includes(p)) { p.flee = true; leaveWorld(p); p.speed = 3.5; } }, 2200);
  }
  // ---------- смерть NPC: ragdoll, через 60 с тело плавно исчезает ----------
  const rdBlocked = (x, z) => (Math.abs(x) < KW && z > -KD && z < KD) || colliders.some(b => b.tag !== 'door' && x > b.x1 && x < b.x2 && z > b.z1 && z < b.z2);
  function killPerson(p, dir, dist) {
    p.dead = true; p.state = 'dead'; p.path = []; p.then = null; p.flee = false; p.talking = false;
    const force = clamp(11 - dist * .35, 3, 10), imp = dir.clone().setY(0).normalize().multiplyScalar(force); imp.y = 1.2;
    p.rag = new Ragdoll(p.h, imp, camera.position.y - .15, rdBlocked); p.deadT = 0; p.h.setExpr('scared');
    ctx.audio.click && ctx.audio.click(90, .6, 0, .25);
    if (p === marat) marat = null;
    if (p.group) { p.group.members = p.group.members.filter(m => m !== p); if (p.group.state !== 'gone') { gopLeave(p.group, 'flee'); ctx.gopResolved && ctx.gopResolved('shot'); } }
    ctx.onKill && ctx.onKill(p.role, p.c, p.kind);
  }
  function deadTick(p, dt) {
    p.deadT += dt; p.rag.step(dt);
    if (p.deadT > 60) { p.rag.startFade(); const a = 1 - (p.deadT - 60) / 3; p.rag.setFade(Math.max(0, a)); if (a <= 0) { p.rag.dispose(); removePerson(p); } }
  }
  function onShot() {
    P.pitch = Math.min(1.25, P.pitch + .09); P.shake = .4;
    { const hit = aimedPerson(26); if (hit) { camera.getWorldDirection(tmpV2); killPerson(hit, tmpV2.clone(), Math.hypot(hit.h.obj.position.x - P.x, hit.h.obj.position.z - P.z)); } }
    const S = ctx.getS(); if (S) { ctx.rep('law', -4); ctx.rep('folk', -2); }
    for (const p of people) { if (p.dead) continue; const d = Math.hypot(p.h.obj.position.x - P.x, p.h.obj.position.z - P.z); if (d > 45) continue;
      if (p.role === 'gop') { if (p.group && p.group.state !== 'gone') { gopLeave(p.group, 'flee'); ctx.gopResolved && ctx.gopResolved('shot'); } }
      else if (p.role === 'vendor') { p.state = 'scared'; p.anim = 'scared'; p.timer = 5; p.h.setExpr('scared'); }
      else if (p.role === 'cust') { ctx.customerScared(p.c); }
      else { p.flee = true; p.h.setExpr('scared'); leaveWorld(p); p.speed = 3.6; } }
    ctx.onShot && ctx.onShot();
  }

  // ---------- снег ----------
  let snowPts = null, snowN = 0;
  function buildSnow(n) {
    if (snowPts) { scene.remove(snowPts); snowPts.geometry.dispose(); }
    snowN = n; const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), sz = new Float32Array(n), sp = new Float32Array(n), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = R(-22, 22); pos[i * 3 + 1] = R(0, 16); pos[i * 3 + 2] = R(-22, 22); sz[i] = Math.pow(Math.random(), 2) * 1.6 + .45; sp[i] = R(.55, 1.45); ph[i] = Math.random(); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1)); g.setAttribute('spd', new THREE.BufferAttribute(sp, 1)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, windOff: { value: new THREE.Vector2() }, fallOff: { value: 0 }, swirl: { value: .3 }, density: { value: 1 }, origin: { value: new THREE.Vector3() }, light: { value: 1 }, kmin: { value: new THREE.Vector3(-KW, 0, -KD) }, kmax: { value: new THREE.Vector3(KW, KH + .2, KD) }, scale: { value: 300 } },
      vertexShader: `attribute float size, spd, ph; uniform float time, scale, fallOff, swirl, density; uniform vec2 windOff; uniform vec3 origin, kmin, kmax; varying float vA, vRot;
        void main(){
          vec3 p = position;
          p.y = mod(p.y - fallOff * spd, 16.0);
          // вихри: разная траектория у каждой снежинки, усиливаются с ветром
          vec2 sw = vec2(sin(time * (.6 + spd * .5) + ph * 40.0 + p.y * .45), cos(time * (.5 + spd * .4) + ph * 23.0 + p.y * .3)) * (.25 + swirl * 1.4);
          p.x = mod(p.x + windOff.x * (.6 + .7 * spd) + sw.x - origin.x + 22.0, 44.0) - 22.0 + origin.x;
          p.z = mod(p.z + windOff.y * (.6 + .7 * spd) + sw.y - origin.z + 22.0, 44.0) - 22.0 + origin.z;
          vA = step(ph, density); if (all(greaterThan(p, kmin)) && all(lessThan(p, kmax))) vA = 0.0; // внутри ларька снега нет
          vRot = time * (spd - 1.0) * 4.0 + ph * 6.283;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = size * scale / -mv.z; vA *= smoothstep(0.3, 1.5, -mv.z) * (1.0 - smoothstep(18.0, 22.0, -mv.z));
        }`,
      fragmentShader: `uniform float light; varying float vA, vRot; void main(){
          vec2 c = gl_PointCoord - .5; float cs = cos(vRot), sn = sin(vRot); c = mat2(cs, -sn, sn, cs) * c;
          float r = length(c), a = atan(c.y, c.x);
          float star = r * (1.0 - .32 * abs(cos(3.0 * a))); // шестилучевая снежинка, вращается
          float al = smoothstep(.5, .12, star) * vA; if (al < .02) discard; gl_FragColor = vec4(vec3(light), al * .9); }`,
      transparent: true, depthWrite: false,
    });
    snowPts = new THREE.Points(g, m); snowPts.frustumCulled = false; scene.add(snowPts);
  }

  // ---------- граница карты: стена бурана (визуально) + невидимая коллизия внутри ----------
  const BOUND = { x1: -63, x2: 69, z1: -40, z2: 23.5 };
  const stormMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, col: { value: new THREE.Color(0xc8ced2) } },
    vertexShader: 'varying vec2 vU; varying vec3 vW; void main(){ vU = uv; vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }',
    fragmentShader: `uniform float time; uniform vec3 col; varying vec2 vU; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 9871.3); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){ vec2 q = vec2(vW.x + vW.z, vW.y) * .08; float f = n(q + vec2(time * .9, -time * .3)) * .5 + n(q * 2.3 + vec2(time * 1.7, time * .2)) * .3 + n(q * 5.0 + vec2(time * 3.1, 0.)) * .2;
        float a = (.55 + f * .45) * smoothstep(0., .15, vU.y) * (1. - smoothstep(.85, 1., vU.y)); gl_FragColor = vec4(col * (.85 + f * .25), a); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  for (const [x, z, w, ry] of [[BOUND.x1 - 4, (BOUND.z1 + 30) / 2, 90, Math.PI / 2], [BOUND.x2 + 4, (BOUND.z1 + 30) / 2, 90, Math.PI / 2], [(BOUND.x1 + BOUND.x2) / 2, BOUND.z1 - 4, 150, 0], [(BOUND.x1 + BOUND.x2) / 2, 38, 150, 0]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 45), stormMat); m.position.set(x, 18, z); m.rotation.y = ry; m.renderOrder = 5; scene.add(m);
  }
  let stormK = 0;

  // ---------- время суток, погода, сезон ----------
  let hour = 7.5, nightK = 0, season = -1, winter = true, weather = { snow: .6, wind: .3, target: .6, windT: .3, state: 'normal', timer: 60, fog: 0, gust: 0, ang: .3, windOff: new THREE.Vector2(), fallOff: 0 };
  const WEATHER = { light: { snow: .28, wind: .2, fog: 0 }, normal: { snow: .65, wind: .45, fog: .15 }, blizzard: { snow: 1, wind: 1, fog: .8 },
    clear: { snow: 0, wind: .2, fog: 0, rain: 0 }, overcast: { snow: 0, wind: .35, fog: .15, rain: 0 }, drizzle: { snow: 0, wind: .3, fog: .3, rain: .35 }, rain: { snow: 0, wind: .55, fog: .45, rain: 1 } };
  // ---------- дождь (весна/лето/осень, чаще осенью): штрихи-капли, мокрый асфальт, лужи с отражениями ----------
  let rainLines = null; weather.rain = 0; weather.wet = 0;
  function buildRain(n) {
    if (rainLines) { scene.remove(rainLines); rainLines.geometry.dispose(); }
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 6), e = new Float32Array(n * 2), sp = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const x = R(-18, 18), y = R(0, 14), z = R(-18, 18), s_ = R(.8, 1.2); for (let k = 0; k < 2; k++) { pos.set([x, y, z], (i * 2 + k) * 3); e[i * 2 + k] = k; sp[i * 2 + k] = s_; } }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('e', new THREE.BufferAttribute(e, 1)); g.setAttribute('spd', new THREE.BufferAttribute(sp, 1));
    const m = new THREE.ShaderMaterial({ uniforms: { fall: { value: 0 }, wind: { value: new THREE.Vector2() }, origin: { value: new THREE.Vector3() }, amount: { value: 0 }, light: { value: 1 }, kmin: { value: new THREE.Vector3(-KW - .1, 0, -KD - .1) }, kmax: { value: new THREE.Vector3(KW + .1, KH + .3, KD + .5) } },
      vertexShader: `attribute float e, spd; uniform float fall, amount; uniform vec2 wind; uniform vec3 origin, kmin, kmax; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y - fall * spd, 14.0); p.x = mod(p.x + wind.x * p.y * .12 - origin.x + 18.0, 36.0) - 18.0 + origin.x; p.z = mod(p.z + wind.y * p.y * .12 - origin.z + 18.0, 36.0) - 18.0 + origin.z;
          vec3 dir = normalize(vec3(wind.x * .12, -1.0, wind.y * .12)); p -= dir * e * .45 * spd;
          vA = step(fract(spd * 7.31), amount) * (1.0 - e * .7); if (all(greaterThan(p, kmin)) && all(lessThan(p, kmax))) vA = 0.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA *= smoothstep(.3, 1.5, -mv.z) * (1.0 - smoothstep(12.0, 17.0, -mv.z)); }`,
      fragmentShader: 'uniform float light; varying float vA; void main(){ if (vA < .01) discard; gl_FragColor = vec4(vec3(.75, .8, .86) * light, vA * .38); }', transparent: true, depthWrite: false });
    rainLines = new THREE.LineSegments(g, m); rainLines.frustumCulled = false; rainLines.visible = false; scene.add(rainLines);
  }
  // лужи: плоские пятна неровной формы (инстансы) с зеркальным материалом; отражение — кубическая карта, снятая с упрощённой сцены (слой 1) в низком разрешении и обновляемая раз в несколько секунд
  let puddles = null; const cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType }); const cubeCam = new THREE.CubeCamera(.5, 120, cubeRT); cubeCam.layers.set(1); cubeCam.children.forEach(c => c.layers.set(1)); scene.add(cubeCam); let cubeT = 0;
  function buildPuddles(on) {
    if (puddles) { scene.remove(puddles); puddles.geometry.dispose(); puddles = null; } if (!on) return;
    const sh = new THREE.Shape(); for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, r = 1 + .22 * Math.sin(a * 3 + 1.3) + .12 * Math.sin(a * 5 + .4); const x = Math.cos(a) * r, y = Math.sin(a) * r * .55; k ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    const g = new THREE.ShapeGeometry(sh, 2); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: 0x5a6068, metalness: 1, roughness: .04, envMap: cubeRT.texture, envMapIntensity: 1.3, transparent: true, opacity: .92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const spots = []; for (let i = 0; i < 70; i++) { const z = pick([R(7, 8.2), R(12.2, 13.6), R(9, 11.5), R(2, 5.8), R(14.6, 18)]), x = R(-60, 66); spots.push([x, z, R(.35, 1.3), R(0, 6.28)]); }
    puddles = new THREE.InstancedMesh(g, m, spots.length); puddles.userData.spots = spots; puddles.renderOrder = 1; puddles.receiveShadow = false; scene.add(puddles); setPuddles(0);
  }
  const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _ps = new THREE.Vector3(), _pp = new THREE.Vector3();
  function setPuddles(wet) { if (!puddles) return; puddles.userData.spots.forEach(([x, z, s_, r], i) => { const k = clamp(wet * 1.4 - (s_ - .35) * .5, 0, 1) * s_; _pm.compose(_pp.set(x, .022, z), _pq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r), _ps.set(k + .001, 1, k + .001)); puddles.setMatrixAt(i, _pm); }); puddles.instanceMatrix.needsUpdate = true; puddles.userData.wet = wet; }
  function reflectLayer(o) { o.traverse(c => c.layers.enable(1)); }
  const cA = new THREE.Color(), cB = new THREE.Color();
  const PAL = { dayTop: '#73858f', dayBot: '#c6c9c3', duskTop: '#3d485a', duskBot: '#c08058', nightTop: '#060a10', nightBot: '#171d26' };
  function setClock(h) {
    hour = h;
    const S = ctx.getS(), m = S ? ctx.monthOf(S.day) : 0;
    const k = Math.cos((m - 5.5) / 12 * Math.PI * 2); // -1 зимой … +1 летом
    const rise = 6.6 - k * 2.0, set = 18.3 + k * 2.0, maxEl = 33 + k * 22;
    const dayF = (h - rise) / (set - rise);
    const el = dayF > 0 && dayF < 1 ? Math.sin(dayF * Math.PI) * maxEl : -8 - Math.min(Math.abs(h - rise), Math.abs(h - set)) * 3;
    const elR = el * Math.PI / 180, az = (dayF - .5) * Math.PI * .9;
    sun.position.set(Math.sin(az) * 60 * Math.cos(Math.max(elR, .05)) + P.x, Math.sin(Math.max(elR, .08)) * 60, -Math.cos(az) * 50 * .3 + 40 + P.z); sun.target.position.set(P.x, 0, P.z);
    const dayAmt = clamp((el + 4) / 14, 0, 1), dusk = clamp(1 - Math.abs(el - 2) / 9, 0, 1);
    nightK = 1 - dayAmt;
    const top = cA.set(PAL.nightTop).lerp(cB.set(PAL.dayTop), dayAmt), topC = top.clone(); topC.lerp(cB.set(PAL.duskTop), dusk * .6);
    const bot = cA.set(PAL.nightBot).lerp(cB.set(PAL.dayBot), dayAmt).clone(); bot.lerp(cB.set(PAL.duskBot), dusk * .7);
    const over = weather.snow * .35; topC.lerp(cB.set('#8a9096'), over * dayAmt); bot.lerp(cB.set('#a8acae'), over * dayAmt);
    skyMat.uniforms.top.value.copy(topC); skyMat.uniforms.bot.value.copy(bot); skyMat.uniforms.cloud.value = .5 + weather.snow * .5;
    skyMat.uniforms.sunDir.value.copy(sun.position).sub(sun.target.position).normalize(); skyMat.uniforms.sunCol.value.set(el > -2 ? (dusk > .3 ? '#ff9a55' : '#fff1dc') : '#000000').multiplyScalar(1 - over);
    scene.fog.color.copy(bot); scene.fog.near = lerp(8 + (1 - weather.snow) * 25, 1, Math.max(stormK, weather.fog * .7)); scene.fog.far = lerp(Q.draw * (1 - weather.snow * .45) * (1 - weather.fog * .65), 9, stormK);
    sun.color.set(dusk > .3 ? '#ffa565' : '#fff1dc'); sun.intensity = el > 0 ? (2.6 * clamp(el / 15, 0, 1)) * (1 - over * .8) : 0;
    hemi.intensity = .14 + dayAmt * (1.05 - over * .2); hemi.color.copy(topC).lerp(cA.set('#ffffff'), .5); hemi.groundColor.set(winter ? '#9aa0a6' : '#4a4636').multiplyScalar(.5 + dayAmt * .5);
    if (dayAmt < .2) { hemi.color.lerp(cA.set('#5a6a8a'), .6); }
    post.uniforms.exposure.value = 1.05 + nightK * .45;
    winU.night.value = nightK; winU.time.value = tAll; snowU.sparkle.value = 1 - nightK * .7;
    MAT.lampHead.emissiveIntensity = nightK > .35 ? 4 : 0;
    streetLights.forEach(l => l.intensity = nightK > .35 ? 70 * nightK : 0);
    sign.material.emissiveIntensity = nightK * .9; exS.material.emissiveIntensity = nightK * 1.2;
    neons.forEach(o => o.material.emissiveIntensity = nightK * .7);
    cars.forEach(c => { c.m.userData.hl.emissiveIntensity = nightK > .3 ? 3 : 0; });
    bulbLight.intensity = 6 + nightK * 3; MAT.bulb.emissiveIntensity = 3;
    if (snowPts) snowPts.material.uniforms.light.value = .35 + dayAmt * .65;
  }
  function setSeason() {
    const S = ctx.getS(); if (!S) return; const m = window.__larekMonth != null ? window.__larekMonth : ctx.monthOf(S.day); if (m === season) return; season = m; // __larekMonth — только для автотестов
    winter = m >= 10 || m <= 2;
    winterGround.forEach(g => g.visible = winter); summerGround.forEach(g => g.visible = !winter);
    scene.traverse(o => { if (o.userData.winter) o.visible = winter; }); awnSnow.visible = roofSnow.visible = winter;
    weather.target = winter ? pick([0, .3, .6, .6, 1]) : 0; weather.windT = R(.1, .9);
    seasonHooks.forEach(f => f(winter, m)); applyVegSeason();
  }

  // ---------- настройки качества ----------
  function applyQuality(q) {
    Object.assign(Q, q);
    const sh = Q.shadows > 0;
    renderer.shadowMap.enabled = sh;
    sun.castShadow = sh; if (sh) { sun.shadow.mapSize.set(Q.shadows, Q.shadows); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    bulbLight.castShadow = sh && Q.light >= 1; fillLight.visible = Q.light >= 2;
    camera.far = Q.draw + 60; camera.updateProjectionMatrix(); sky.scale.setScalar(Math.min(1, (Q.draw + 40) / 380));
    allTex.forEach(t => { t.anisotropy = Q.aniso; if (t.image) t.needsUpdate = true; });
    buildSnow(Q.snow); buildRain(Math.round(Q.snow * .8)); buildPuddles(Q.light >= 1);
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
    resize();
  }
  applyQuality(Q);

  // ---------- взаимодействия ----------
  function lookingAtBox(b, maxD) { if (!b) return false; ray.setFromCamera(new THREE.Vector2(0, 0), camera); const hp = ray.ray.intersectBox(b, hitP); return !!hp && hp.distanceTo(camera.position) < maxD; }
  function lookingAt(objs, maxD) { ray.setFromCamera(new THREE.Vector2(0, 0), camera); ray.far = maxD; const h = ray.intersectObjects(objs, true)[0]; return h ? h : null; }
  const nearMarket = () => false; // рынка больше нет: товар — заказом по телефону
  const nearBooth = () => !inKiosk() && Math.hypot(P.x - BOOTH.x, P.z - BOOTH.z - 1.6) < 2.6;
  function action() {
    const S = ctx.getS(); if (!S || fadeBusy || ctx.cardOpen() || P.stun > 0 || life.notepadState !== 'rest' || life.calling) return null;
    const hb = life.habit;
    if (hb.busy === 'smoke') return hb.canFinish ? (life.lookingAtAshtray() ? { label: 'Потушить в пепельнице', icon: 'smoke', fn: () => hb.finishHabit('ashtray') } : { label: 'Выбросить окурок', icon: 'smoke', fn: () => hb.finishHabit('throw') }) : null;
    if (hb.busy) return null;
    if (life.held) return { label: life.canPlace() ? 'Поставить' : 'Бросить', icon: life.canPlace() ? 'place' : 'drop', fn: () => { if (!life.placeHeld()) life.dropHeld(); }, alt: { label: 'Повернуть', icon: 'rotate', fn: () => life.rotateHeld() } };
    if (gunState() === 'wall' && inKiosk() && lookingAtBox(rackBox, 2)) return { label: 'Снять ружьё со стены', icon: 'weapon', fn: () => { setGunState('carried'); ctx.audio.reloadClose(); weapon.draw(); } };
    if (gunState() === 'carried' && inKiosk() && lookingAtBox(rackBox, 2) && !weapon.aiming) return { label: 'Повесить ружьё на стену', icon: 'weapon', fn: () => { setGunState('wall'); ctx.audio.click(900, .5, 0, .06); } };
    if (transport.riding) return transport.canAlight() ? { label: 'Выйти: ' + STOPS[transport.stopKey].name, icon: 'bus', fn: () => transport.alight() } : null;
    if (transport.canBoard()) return { label: 'Сесть в автобус №7', icon: 'bus', fn: () => transport.board() };
    const li = life.lookItem(2.2);
    if (li && li.kind === 'gun') return { label: 'Поднять ружьё', icon: 'weapon', fn: () => { life.removeItem(li); setGunState('carried'); weapon.draw(); } };
    if (li && li.kind === 'box') return { label: 'Поднять коробку', icon: 'box', fn: () => life.pick(li),
      alt: li.data.contents && inKiosk(li.obj.position.x, li.obj.position.z) ? { label: 'Распаковать', icon: 'box', fn: () => life.unpack(li) } : null };
    if (inKiosk() && life.lookingAtPhone()) return { label: 'Позвонить', icon: 'phone', fn: () => ctx.phoneCall() };
    if (inKiosk() && life.lookingAtNotepad()) return { label: 'Открыть блокнот заказов', icon: 'notepad', fn: () => ctx.openOrders() };
    if (lookingAt([doorMesh], 2.4)) return { label: doorTarget > .5 ? 'Закрыть дверь' : (inKiosk() ? 'Открыть дверь' : 'Открыть дверь'), icon: '🚪', fn: toggleDoor };
    if (inKiosk()) {
      if (radioObj && lookingAtBox(radioBox, 1.8)) return { label: ctx.audio.radioOn ? 'Выключить радио' : 'Включить радио', icon: 'radio', fn: () => { ctx.audio.radioToggle(); ctx.onCtl(); } };
      if (P.locked) return null;
      if (!P.seated && Math.hypot(P.x - STOOL.x, P.z - STOOL.z) < .9) return { label: S.phase === 'night' ? 'Сесть и уснуть до утра' : 'Сесть за прилавок', icon: '🪑', fn: () => { if (S.phase === 'night') ctx.sleep(); else { sit(); P.x = STOOL.x; P.z = STOOL.z; P.yaw = Math.PI; } } };
      if (P.seated) return { label: 'Встать', icon: '⬆', fn: stand };
      return null;
    }
    const tp = aimedPerson(2.6);
    if (tp && tp.role === 'ped' && tp.state !== 'scared' && !weapon.drawn) return { label: 'Поговорить', icon: 'talk', fn: () => talkTo(tp) };
    if (tp && tp.talk && !weapon.drawn) return { label: 'Поговорить: ' + tp.title, icon: 'talk', fn: () => tp.talk() };
    if (nearBooth()) return { label: 'Обменник', icon: 'money', fn: () => ctx.openSheet('exch') };
    const ext = env2.extraAction && env2.extraAction(); if (ext) return ext;
    return null;
  }
  const env2 = { extraAction: () => env2Extra && env2Extra() };
  function talkTo(p) {
    p.state = 'talking'; p.timer = 6; p.h.setExpr('talk'); p.path = [];
    const lines = lineFor[p.kind] || lineFor.worker; const L = p.h.L;
    const name = { babka: 'Бабушка', worker: 'Мужик', youth: 'Парень', school: 'Школьник', gopnik: 'Пацан', neighbor: 'Соседка', chelnok: 'Челнок' }[p.kind] || 'Прохожий';
    ctx.dialog({ name, text: pick(lines), options: [
      { label: 'Как жизнь?', fn: () => ctx.dialog({ name, text: pick(['Да как… потихоньку. Цены вон опять подняли.', 'Живём, хлеб жуём.', 'Зарплату третий месяц не дают.', 'Нормально, жить можно.']), options: [{ label: 'Ну, держись.', fn: () => { p.h.setExpr('smile'); ctx.closeDialog(); } }] }) },
      { label: 'Заходи в ларёк, у меня дёшево!', fn: () => { ctx.rep('folk', .5); ctx.dialog({ name, text: pick(['Зайду, может.', 'А что есть-то?', 'Посмотрим.']), options: [{ label: 'Жду!', fn: () => ctx.closeDialog() }] }); } },
      { label: 'Бывай.', fn: () => ctx.closeDialog() },
    ] });
  }

  // ---------- кадр ----------
  let tAll = 0, stepPh = 0, actT = 0, lastActLabel = '', curAct = null;
  const surfaceAt = () => inKiosk() ? 'wood' : (winter && !(P.z > 6.3 && P.z < 14.1) ? 'snow' : 'hard');
  function frame(dt) {
    tAll += dt;
    const S = ctx.getS(), T = ctx.getT();
    // часы
    if (!S) setClock(18.2);
    else { const ph = S.phase; if (ph === 'trade' && T) setClock(9 + 12 * clamp(T.t / T.len, 0, 1)); else if (ph === 'evening') setClock(21); else if (ph === 'night') setClock(Math.min(29, hour + dt / 30 + (hour < 21 ? 21 - hour : 0))); else setClock(Math.min(9, Math.max(8, hour < 7.9 || hour > 9.5 ? 8 : hour + dt / 60))); }
    if (window.__larekHour != null) setClock(window.__larekHour); // только для автотестов
    setSeason();
    // погода
    weather.snow += (weather.target - weather.snow) * dt * .05; weather.wind += (weather.windT - weather.wind) * dt * .1;
    weather.timer -= dt;
    if (winter !== (weather.state in { light: 1, normal: 1, blizzard: 1 })) weather.timer = 0;
    if (weather.timer <= 0 || (weather.state === 'blizzard' && nightK < .5)) { weather.timer = R(70, 160);
      if (winter) weather.state = nightK > .6 ? pick(['normal', 'light', 'blizzard', 'blizzard']) : pick(['normal', 'light', 'normal']);
      else { const autumn = season >= 8 && season <= 9, spring = season >= 3 && season <= 4; weather.state = autumn ? pick(['rain', 'rain', 'drizzle', 'overcast', 'drizzle']) : spring ? pick(['overcast', 'drizzle', 'clear', 'rain']) : pick(['clear', 'clear', 'overcast', 'drizzle']); } }
    { const W_ = WEATHER[weather.state]; weather.target = winter ? W_.snow : 0; weather.windT = W_.wind; weather.fog += (W_.fog - weather.fog) * dt * .04; const rt = winter ? 0 : (W_.rain || 0); weather.rain += (rt - weather.rain) * dt * .08;
      weather.wet = clamp(weather.wet + (weather.rain > .2 ? dt * .02 * weather.rain : -dt * .0025), 0, 1); if (winter) weather.wet = 0; }
    if (Math.random() < dt * .12 * (.3 + weather.wind)) { weather.gust = R(.4, 1.4) * (.4 + weather.wind); weather.ang += R(-.8, .8); }
    weather.gust *= Math.pow(.6, dt); weather.ang += Math.sin(tAll * .05) * dt * .05;
    // буран у границы карты
    { const ed = Math.min(P.x - BOUND.x1, BOUND.x2 - P.x, P.z - BOUND.z1); stormK = clamp(1 - ed / 14, 0, 1); }
    // игрок
    P.stun = Math.max(0, P.stun - dt);
    const moveOK = canMove();
    let ix = 0, iz = 0;
    if (moveOK) { ix = input.mx; iz = input.my; const k = input.keys; if (k.KeyW || k.ArrowUp) iz -= 1; if (k.KeyS || k.ArrowDown) iz += 1; if (k.KeyA || k.ArrowLeft) ix -= 1; if (k.KeyD || k.ArrowRight) ix += 1; const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; } }
    const inside = inKiosk();
    if (!inside && S && !S.flags.wentOut) { S.flags.wentOut = true; ctx.onCtl(); }
    const dr = Math.min(1.4, life.fx.drunk);
    if (dr > .05 && !P.seated) { ix += Math.sin(tAll * .73) * dr * .35 + Math.sin(tAll * 1.9) * dr * .12; iz += Math.cos(tAll * .51) * dr * .15; P.yaw += Math.sin(tAll * .37) * dr * .12 * dt; }
    const run = P.sprint && !P.crouch && iz < -.3 && !weapon.aiming && life.heavy() < 8;
    const maxSp = (inside ? (run ? 1.7 : 1.15) : (run ? 4.3 : 1.65)) * (P.crouch ? .5 : 1) * (weapon.aiming ? .55 : 1) * (1 - Math.min(.35, life.heavy() * .025)) * (1 - dr * .15);
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const tvx = (rx * ix - fx * iz) * maxSp, tvz = (rz * ix - fz * iz) * maxSp;
    const acc = (Math.hypot(tvx, tvz) > Math.hypot(P.vx, P.vz) ? 9 : 11) * dt * (1 - dr * .45);
    if (P.stun <= 0) { P.vx += clamp(tvx - P.vx, -acc, acc); P.vz += clamp(tvz - P.vz, -acc, acc); } else { P.vx *= Math.pow(.2, dt); P.vz *= Math.pow(.2, dt); }
    let moved = 0;
    if (!P.seated) {
      doorCol.x1 = doorOpen < .3 ? .4 : 1.17; doorCol.x2 = doorOpen < .3 ? 1.2 : 1.25; doorCol.z1 = doorOpen < .3 ? -KD - .05 : -KD - .8 * Math.min(1, doorOpen); doorCol.z2 = -KD + (doorOpen < .3 ? .05 : 0);
      if (doorOpen > .3 && doorOpen < .75) { doorCol.x1 = doorCol.x2 = 999; }
      const ox = P.x, oz = P.z;
      const nx = P.x + P.vx * dt; if (!hitAny(nx, P.z)) P.x = nx; else P.vx = 0;
      const nz = P.z + P.vz * dt; if (!hitAny(P.x, nz)) P.z = nz; else P.vz = 0;
      P.x = clamp(P.x, BOUND.x1, BOUND.x2); P.z = clamp(P.z, BOUND.z1, BOUND.z2); // невидимая граница внутри бурана
      moved = Math.hypot(P.x - ox, P.z - oz);
    } else { P.vx = P.vz = 0; P.x += (STOOL.x - P.x) * Math.min(1, dt * 6); P.z += (STOOL.z - P.z) * Math.min(1, dt * 6); }
    // шаги — по фазе шага
    const spd = moved / Math.max(dt, 1e-4);
    if (spd > .25) { const stride = run ? 1.25 : P.crouch ? .55 : .75; const prev = stepPh; stepPh += moved / stride; if (Math.floor(prev) !== Math.floor(stepPh)) ctx.audio && ctx.audio.step(surfaceAt(), spd, inside); }
    else stepPh = Math.floor(stepPh) + .5 * (stepPh % 1 > .5 ? 1 : 0); // остановка без «лишнего» шага
    const bobAmt = ctx.settings().bob ?? 1;
    const bobY = !P.seated ? Math.sin(stepPh * Math.PI) ** 2 * .04 * Math.min(1, spd / 1.6) * bobAmt * (run ? 1.6 : 1) : 0;
    const bobX = !P.seated ? Math.sin(stepPh * Math.PI) * .02 * Math.min(1, spd / 1.6) * bobAmt : 0;
    const targetH = P.seated ? 1.18 : P.crouch ? 1.05 : 1.66; P.h += (targetH - P.h) * Math.min(1, dt * 6);
    P.shake = Math.max(0, P.shake - dt * 1.5); P.roll += ((P.stun > 0 ? Math.sin(tAll * 3) * .25 * (P.stun / 2.5) : 0) - P.roll) * Math.min(1, dt * 5);
    const sh = P.shake * .03;
    camera.position.set(P.x + rx * bobX + R(-sh, sh), P.h - bobY + R(-sh, sh), P.z + rz * bobX);
    if (riderCam) { camera.position.copy(riderCam); P.x = riderCam.x; P.z = riderCam.z; }
    const sway = dr * (Math.sin(tAll * .8) * .05 + Math.sin(tAll * 1.7) * .02);
    camera.rotation.set(P.pitch + weapon.kick * .05 + dr * Math.sin(tAll * 1.1) * .02, P.yaw + dr * Math.sin(tAll * .6) * .03, P.roll + bobX * .5 * bobAmt + sway);
    post.uniforms.dbl.value = dr > .2 ? (dr - .2) * .012 : 0; post.uniforms.dbt.value = tAll * .8; post.uniforms.smoke.value = life.fx.smoke;
    post.uniforms.blur.value += ((ctx.notepadOpen && ctx.notepadOpen() ? 1 : 0) - post.uniforms.blur.value) * Math.min(1, dt * 6);
    camera.fov += ((baseFov * (1 - weapon.aimK * .22) * (run ? 1.06 : 1)) - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix();
    post.uniforms.hurt.value = Math.max(0, post.uniforms.hurt.value - dt * .4);
    // дверь
    doorOpen += (doorTarget - doorOpen) * Math.min(1, dt * 5); doorPivot.rotation.y = -doorOpen * 1.6;
    const _t0 = performance.now();
    // машины
    carsTick(dt);
    transport.tick(dt, [...(transport.riding ? [] : [{ x: P.x, z: P.z }]), ...cars.map(c => ({ x: c.m.position.x, z: c.m.position.z })), ...people.filter(p => !p.inBus).map(p => ({ x: p.h.obj.position.x, z: p.h.obj.position.z }))]);
    { const o = transport.obstacle(), ca = Math.abs(Math.cos(o.heading)), sa = Math.abs(Math.sin(o.heading)), hx = o.hx * ca + o.hz * sa, hz = o.hx * sa + o.hz * ca;
      if (transport.riding) { busCol.x1 = busCol.x2 = 999; } else { busCol.x1 = o.x - hx; busCol.x2 = o.x + hx; busCol.z1 = o.z - hz; busCol.z2 = o.z + hz; }
      if (!transport.riding && o.v > 1.5 && P.stun <= 0 && Math.abs(P.x - o.x) < hx + .3 && Math.abs(P.z - o.z) < hz + .3) hitByCar({ v: o.v }, Math.cos(-o.heading), Math.sin(-o.heading)); }
    const _t1 = performance.now();
    // люди
    if (S) { ambientTick(dt); gopTick(dt); }
    peopleTick(dt);
    const _t2 = performance.now();
    // наведение ружья
    if (weapon.drawn) { const p = aimedPerson(weapon.aiming ? 35 : 12); if (p && (weapon.aiming || Math.hypot(p.h.obj.position.x - P.x, p.h.obj.position.z - P.z) < 6)) threaten(p); }
    weapon.update(dt, { moving: Math.min(1, spd / 2), sprint: run, aspect: camera.aspect });
    life.tick(dt); wallGunTick(dt); playgroundTick(dt);
    { const wsp = weather.wind * 1.6 + weather.gust * 2.2 + stormK * 3; windVec.set(Math.cos(weather.ang) * wsp, Math.sin(weather.ang) * wsp); weather.windOff.addScaledVector(windVec, dt); weather.fallOff += dt * (1.1 + weather.gust * .4 + stormK); }
    stormMat.uniforms.time.value = tAll; stormMat.uniforms.col.value.copy(scene.fog.color);
    weapon.cam.fov = camera.fov; weapon.cam.updateProjectionMatrix();
    // снег
    if (rainLines) { const u = rainLines.material.uniforms; u.fall.value = tAll * 9; u.wind.value.set(windVec.x, windVec.y); u.origin.value.copy(camera.position); u.amount.value = weather.rain; u.light.value = .35 + (1 - nightK) * .65; rainLines.visible = weather.rain > .02; }
    if (puddles) { puddles.visible = weather.wet > .03; if (puddles.visible) { if (Math.abs((puddles.userData.wet || 0) - weather.wet) > .02) setPuddles(weather.wet); cubeT -= dt; if (cubeT <= 0) { cubeT = 4; puddles.visible = false; cubeCam.position.set(camera.position.x, .1, camera.position.z); cubeCam.update(renderer, scene); puddles.visible = true; } } }
    { const wt = weather.wet; roadS.material.roughness = 1 - wt * .55; walkS.material.roughness = 1 - wt * .5; roadS.material.color.setScalar(1 - wt * .35); walkS.material.color.set(0xb8b4ac).multiplyScalar(1 - wt * .3); }
    if (snowPts) { const u = snowPts.material.uniforms; u.time.value = tAll; u.origin.value.copy(camera.position); u.windOff.value.copy(weather.windOff); u.fallOff.value = weather.fallOff; u.swirl.value = weather.wind * .6 + weather.gust; u.density.value = Math.max(weather.snow, stormK); snowPts.visible = winter && (weather.snow > .03 || stormK > .05); u.scale.value = window.innerHeight * DPR * .035; }
    sky.position.copy(camera.position); skyMat.uniforms.t.value = tAll;
    bulbLight.intensity *= 1 + Math.sin(tAll * 31) * .01;
    bulbLight.castShadow = renderer.shadowMap.enabled && Q.light >= 2 && inside;
    // звук
    ctx.audio && ctx.audio.update({ camera, radioPos, inside, doorOpen, wind: Math.min(1.5, (winter ? weather.wind : weather.wind * .4) + weather.gust * .5 + stormK), night: nightK > .6, rain: weather.rain });
    // контекстная кнопка
    actT -= dt; if (actT <= 0) { actT = .15; curAct = action(); const l = curAct ? curAct.label : ''; if (l !== lastActLabel) { lastActLabel = l; ctx.onCtl(); } }
    // рендер
    post.uniforms.time.value = tAll;
    renderer.info.reset(); renderer.info.autoReset = false;
    renderer.setRenderTarget(rt); renderer.render(scene, camera);
    if (weapon.state !== 'holstered' || life.habit.busy || life.fx.handOut) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(weapon.scene, weapon.cam); renderer.autoClear = true; }
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
    const _t3 = performance.now(); TIM.cars = _t1 - _t0; TIM.people = _t2 - _t1; TIM.rest = _t3 - _t2;
  }
  const TIM = {};
  function carsTick(dt) {
    const need = { low: 2, medium: 3, high: 4, max: 5 }[ctx.settings().quality] || 3;
    while (cars.length < need) addCar(cars.length % 2, R(0, 400), CAR_COLORS[cars.length % CAR_COLORS.length]);
    for (const c of cars) {
      const route = ROUTES[c.ri];
      const [x, z, total] = routePoint(route, c.s), [ax, az] = routePoint(route, c.s + 2.5);
      const dirx = ax - x, dirz = az - z, dl = Math.hypot(dirx, dirz) || 1;
      // препятствия впереди: другие машины, игрок, пешеходы на дороге
      let block = 99;
      for (const o of cars) if (o !== c && o.ri === c.ri) { const ds = ((o.s - c.s) % total + total) % total; if (ds > 0 && ds < 12) block = Math.min(block, ds - 5); }
      const ahead = (px, pz) => { const vx = px - x, vz = pz - z, al = (vx * dirx + vz * dirz) / dl, lat = Math.abs(vx * dirz - vz * dirx) / dl; return al > 0 && lat < 1.6 ? al : 99; };
      { const bo = transport.obstacle(), ba = ahead(bo.x, bo.z); if (ba < 18) block = Math.min(block, ba - 8); }
      const pAhead = ahead(P.x, P.z); if (pAhead < 9) { block = Math.min(block, pAhead - 2.6); if (c.honk <= 0 && c.v > 3) { ctx.audio && ctx.audio.horn(); c.honk = 4; } }
      for (const p of people) { const a = ahead(p.h.obj.position.x, p.h.obj.position.z); if (a < 10) block = Math.min(block, a - 3); }
      c.honk -= dt;
      const want = block < 99 ? clamp(block * 1.1, 0, c.vmax) : c.vmax;
      // поворот — сбросить скорость
      const [bx, bz] = routePoint(route, c.s + 9), turn = Math.abs(Math.atan2(bz - az, bx - ax) - Math.atan2(dirz, dirx)); const curve = Math.min(Math.PI, turn > Math.PI ? 2 * Math.PI - turn : turn);
      const target = Math.min(want, curve > .3 ? 5 : c.vmax);
      c.v += clamp(target - c.v, -9 * dt, 2.2 * dt); // торможение резче разгона
      c.s += c.v * dt;
      const h = Math.atan2(dirz, dirx); let dh = -h - c.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); c.heading += dh * Math.min(1, dt * 6);
      c.m.position.set(x, 0, z); c.m.rotation.y = c.heading; for (const w of c.m.userData.wheels) w.rotation.z -= c.v * dt / c.m.userData.wheelR;
      c.m.userData.tl.emissiveIntensity = target < c.v - .5 ? 2 : (nightK > .3 ? .8 : .3);
      ctx.audio && ctx.audio.carState(c.id, x, z, c.v);
      // наезд на игрока
      if (!inKiosk() && c.v > 2 && P.stun <= 0) { const vx = P.x - x, vz = P.z - z, al = (vx * dirx + vz * dirz) / dl, lat = Math.abs(vx * dirz - vz * dirx) / dl; if (Math.abs(al) < 2.3 && lat < 1.1) hitByCar(c, dirx / dl, dirz / dl); }
    }
  }
  function hitByCar(c, dx, dz) {
    const sp = c.v; P.stun = 2.5; P.vx = dx * sp * .7 + (Math.random() - .5) * 2; P.vz = dz * sp * .7 + (Math.random() - .5) * 2; P.shake = 1.4; P.pitch = clamp(P.pitch + .5, -1.3, 1.2);
    post.uniforms.hurt.value = 1; c.v *= .3; ctx.audio && ctx.audio.thud(1.2); ctx.audio && ctx.audio.horn();
    if (weapon.drawn) weapon.holster();
    ctx.onHit && ctx.onHit(sp);
  }

  // ---------- ввод ----------
  window.addEventListener('keydown', e => { input.keys[e.code] = true; });
  window.addEventListener('keyup', e => { input.keys[e.code] = false; });
  // свайп камеры по холсту
  const ptrs = new Map();
  cvs.addEventListener('pointerdown', e => { ctx.audio && ctx.audio.ensure(); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() }); cvs.setPointerCapture(e.pointerId); });
  cvs.addEventListener('pointermove', e => { const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; ctx.look(dx, dy, e.pointerType); });
  const pend = e => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (p && e.pointerType === 'mouse' && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 4 && performance.now() - p.t < 300) { if (e.button === 0 && weapon.drawn) weapon.fire(); } };
  cvs.addEventListener('pointerup', pend); cvs.addEventListener('pointercancel', pend);
  cvs.addEventListener('contextmenu', e => { e.preventDefault(); });
  cvs.addEventListener('mousedown', e => { if (e.button === 2) weapon.aim(true); });
  cvs.addEventListener('mouseup', e => { if (e.button === 2) weapon.aim(false); });
  function look(dx, dy, kind) { if (P.stun > 0) return; const s = (kind === 'mouse' ? .0032 : .0052) * (1 - weapon.aimK * .45); P.yaw -= dx * s; P.pitch = clamp(P.pitch - dy * s, -1.35, 1.25); }

  setClock(18.2); resize();
  return {
    scene, frame, updateShelves, goCounter, sit, stand, nearMarket, nearBooth, P, weapon, loading,
    action: () => curAct, isNight: () => nightK > .45, canMove, inKiosk, toggleDoor, look, applyQuality, spawnCustomer, customerEvent,
    move(x, y) { input.mx = x; input.my = y; }, nearDoor() { return Math.hypot(P.x - .8, P.z + KD) < 2.2; }, setSprint(v) { P.sprint = v; }, toggleCrouch() { if (!P.seated) P.crouch = !P.crouch; }, get crouch() { return P.crouch; }, get sprint() { return P.sprint; },
    unlock() { P.locked = false; ctx.onCtl(); },
    toggleFlashlight() { flashlight.intensity = flashlight.intensity > 0 ? 0 : 30; return flashlight.intensity > 0; }, get flashlightOn() { return flashlight.intensity > 0; },
    radioNear() { return inKiosk(); },
    gopLeave, get gopnik() { return gopnikGroup; },
    get hour() { return hour; }, get doorOpen() { return doorOpen; },
    reset() { life.loadItems(); const S0 = ctx.getS(); if (S0) { S0.gunState = S0.gunState || 'wall'; S0.gun = S0.gunState === 'carried'; life.setButts(S0.butts || 0); }
      P.x = STOOL.x; P.z = STOOL.z; P.yaw = Math.PI; P.pitch = -.08; P.seated = true; P.locked = false; P.crouch = false; P.vx = P.vz = 0; shelfSig = ''; season = -1; hour = 8; doorTarget = 0; people.slice().forEach(p => { if (p.role !== 'vendor' && p.role !== 'marat') removePerson(p); }); gopnikGroup = null; },
    transport, life, env2, gunState, setGunState, openNotepadAnim: f => life.openNotepad(f), closeNotepadAnim: f => life.closeNotepad(f),
    putGunDown() { if (gunState() !== 'carried') return; const it = life.addItem({ kind: 'gun', x: P.x, y: camera.position.y - .5, z: P.z, ry: P.yaw }); setGunState('world'); life.pick(it); },
    batchInfo, renderInfo() { const i = renderer.info; let tris = 0; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, progs: (i.programs || []).length, lights: scene.children.filter(o => o.isLight).length }; },
    triStats() { const out = {}; scene.traverse(o => { if (!o.isMesh || !o.visible) return; const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); let k = o.name || o.material && (Array.isArray(o.material) ? o.material[0].name : o.material.name) || o.geometry.type; let p = o; while (p.parent && p.parent !== scene) p = p.parent; k = (p.userData.tag || p.name || p.type) + '/' + k; out[k] = (out[k] || 0) + t; }); return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => k + ':' + Math.round(v)); },
    setRetro(v) { post.uniforms.retro.value = v ? 1 : 0; },
    debug: { spawnPed: () => { const p = newPerson(pick(["worker", "youth", "neighbor", "babka"]), "ped", "s5"); return p; }, TIM, people, cars, carGroups, weather, colliders, NODES, visibleFromPlayer, spawnGopniks, get gop() { return gopnikGroup; } },
  };
}
