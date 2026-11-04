// 3D-мир «Ларька»: город 90-х, ларёк с интерьером, игрок от первого лица, люди, машины, погода, сутки.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Human, makeLook, splitStaticModel } from './npc.js';
import { createWeapon } from './weapon.js';

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
    uniforms: { tDiffuse: { value: rt.texture }, time: { value: 0 }, exposure: { value: 1 }, res: { value: new THREE.Vector2(1, 1) }, vig: { value: 1 }, sat: { value: .72 }, hurt: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time, exposure, vig, sat, hurt; uniform vec2 res; varying vec2 vUv;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0., 1.); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 d = vUv - 0.5; float ca = (0.004 + hurt * 0.02) * dot(d, d) * 4.0;
        vec3 col = vec3(texture2D(tDiffuse, vUv + d*ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d*ca).b);
        col = aces(col * exposure); col = pow(col, vec3(1.0/2.2));
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, sat);
        col += vec3(-0.03, 0.006, 0.035) * (1.0 - l) + vec3(0.04, 0.018, -0.03) * l;
        col = (col - 0.5) * 1.12 + 0.5;
        col *= 1.0 - vig * dot(d, d) * 1.5;
        col = mix(col, vec3(0.55, 0.05, 0.03), hurt * smoothstep(0.1, 0.6, length(d)) * 0.8);
        col += (hash(vUv * res + fract(time) * 91.7) - 0.5) * 0.05;
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
  TL.load('assets/tex/paper.jpg', img => { MAT.wallpaper.map = makeWallpaper(img.image); MAT.wallpaper.needsUpdate = true; }, undefined, () => {});

  // ---------- свет ----------
  const hemi = new THREE.HemisphereLight(0xbfc8cc, 0x4a4636, .9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = .04;
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 180 });
  scene.add(sun); scene.add(sun.target);
  const bulbLight = new THREE.PointLight(0xffc98a, 7, 7, 2); bulbLight.position.set(0, 2.25, -.1); scene.add(bulbLight);
  bulbLight.shadow.mapSize.set(512, 512); bulbLight.shadow.bias = -0.004; bulbLight.shadow.radius = 3;
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
  const occluders = [];
  function box(w, h, d, mat, x, y, z, parent = scene, cast = true) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
  function cyl(rt_, rb, h, mat, x, y, z, seg = 12, parent = scene) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt_, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  function plane(w, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m; }
  function textTex(w, h, text, bg, fg, font, extra) { return regTex(ctex(w, h, g => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); if (extra) extra(g, w, h); speckle(g, w, h, w * h / 60, ['#0003', '#fff1'], 2); stains(g, w, h, 4); })); }

  // ---------- земля ----------
  const winterGround = [], summerGround = [];
  const groundSnow = plane(340, 340, std({ map: repTex(TX.snow, 70, 70), roughness: .95 }), 0, 0, 0); winterGround.push(groundSnow);
  const groundDirt = plane(340, 340, std({ map: repTex(TX.asphalt, 60, 60), color: 0x8a8678 }), 0, -.001, 0); summerGround.push(groundDirt);
  const road = plane(170, 8, std({ map: repTex(TX.road, 34, 1.6), roughness: .9 }), 3, .012, 10.2);
  for (const z of [6.55, 13.85]) { const ds = plane(170, .9, std({ map: repTex(TX.dirtySnow, 40, 1), transparent: true, opacity: .95, roughness: .95 }), 3, .02, z); if (z > 10) ds.rotation.z = Math.PI; winterGround.push(ds); }
  const walk = plane(170, 4.9, std({ map: repTex(TX.snow, 40, 1.2), color: 0xb9bcbe }), 3, .008, 3.75); winterGround.push(walk);
  const walkS = plane(170, 4.9, std({ map: repTex(TX.asphalt, 40, 1.2), color: 0xa09c94 }), 3, .007, 3.75); summerGround.push(walkS);
  box(170, .15, .25, MAT.concrete, 3, .075, 6.25, scene, false); box(170, .15, .25, MAT.concrete, 3, .075, 14.15, scene, false);
  const lineMat = std({ color: 0xc9c4b0, roughness: .9 });
  for (let x = -78; x < 84; x += 6) plane(3, .14, lineMat, x, .016, 10.2);
  for (let i = 0; i < 6; i++) plane(.5, 7.6, std({ color: 0xc9c4b0, roughness: .9, transparent: true, opacity: .75 }), -4.5 + i * 1, .017, 10.2); // «зебра»

  // ---------- ЛАРЁК ----------
  const K = new THREE.Group(); scene.add(K);
  const KW = 1.5, KD = 1.2, KH = 2.5, T_ = .06;
  const wm = inner => [0, 1, 2, 3, 4, 5].map(i => i === inner ? MAT.wallpaper : MAT.kiosk);
  const kioskWalls = [];
  const kw = (...a) => { const m = box(...a); kioskWalls.push(m); occluders.push(m); return m; };
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
  const awnSnow = box(KW * 2 + .2, .05, .9, MAT.snow, 0, 2.36, KD + .4, K, false); awnSnow.rotation.x = .55 - .0; awnSnow.rotation.x = .55;
  const roofSnow = box(KW * 2 + .3, .08, KD * 2 + .3, MAT.snow, 0, KH + .14, 0, K, false);
  const signTex = textTex(512, 96, 'ПРОДУКТЫ · 24 ЧАСА', '#d9b23a', '#7a1f16', '900 46px "Arial Black", Arial, sans-serif');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .33), std({ map: signTex, emissive: 0x332200, emissiveMap: signTex, emissiveIntensity: 0 })); sign.position.set(0, 2.32, KD + .035); K.add(sign);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.15), MAT.glass); glass.position.set(0, 1.575, KD + .01); glass.renderOrder = 2; K.add(glass);
  for (let x = -1.3; x <= 1.31; x += .13) if (Math.abs(x) > .5) cyl(.008, .008, 1.15, MAT.steel, x, 1.575, KD + .05, 6, K);
  box(2.7, .02, .02, MAT.steel, 0, 2.15, KD + .05, K); box(2.7, .02, .02, MAT.steel, 0, 1.0, KD + .05, K);
  // прилавок, витрина
  box(2.9, .05, .45, MAT.counter, 0, .98, KD - .22, K); box(2.9, .93, .06, MAT.wood, 0, .47, KD - .44, K); box(1.0, .04, .25, MAT.counter, 0, 1.0, KD + .14, K);
  for (const y of [1.36, 1.76]) for (const sx of [-1, 1]) box(.88, .015, .3, MAT.glass, sx * .9, y, KD - .12, K, false);
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
      if (f.lab) { const side = std({ map: f.lab, roughness: f.metal ? .35 : .8, metalness: f.metal ? .5 : 0 }); mat = f.geo.type.startsWith('Cylinder') ? [side, std({ color: 0xb8bcc0, metalness: .9, roughness: .3 }), std({ color: 0xb8bcc0, metalness: .9, roughness: .3 })] : [side, side, side, side, side, side]; }
      else mat = f.glass ? new THREE.MeshStandardMaterial({ color: f.color, roughness: .1, transparent: true, opacity: .85 }) : std({ color: f.color, roughness: .7 });
      const im = new THREE.InstancedMesh(f.geo, mat, arr.length); arr.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; foodGroup.add(im);
    }
  }
  buildFood();

  // ---------- дверь ----------
  const doorPivot = new THREE.Group(); doorPivot.position.set(1.2, 0, -KD); K.add(doorPivot);
  const doorMesh = box(.8, 2.04, .05, [MAT.kiosk, MAT.kiosk, MAT.kiosk, MAT.kiosk, MAT.wallpaper, MAT.kiosk], -.4, 1.02, 0, doorPivot);
  const handleM = std({ color: 0x777777, metalness: .8, roughness: .3 });
  box(.12, .025, .04, handleM, -.72, 1.0, .05, doorPivot); box(.12, .025, .04, handleM, -.72, 1.0, -.05, doorPivot);
  occluders.push(doorMesh);
  let doorOpen = 0, doorTarget = 0;
  addCol(-KW - .05, KW + .05, KD - .02, KD + .06); // перед окном снаружи — стена

  // ---------- товар на витрине (из игры) ----------
  const SLOT_POS = [[-1.12, .99], [1.12, .99], [-.7, .99], [.7, .99], [-1.12, 1.37], [1.12, 1.37], [-.7, 1.37], [.7, 1.37], [-1.12, 1.77]];
  const shelfGroup = new THREE.Group(); K.add(shelfGroup);
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
      case 'toy': { const e = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 10), lbl(0xe57bb0)); e.scale.y = 1.3; e.position.y = .045; g.add(e); box(.03, .02, .005, lbl(0x9fb88a), 0, .05, .033, g); break; }
    }
    return g;
  }
  function priceTag(id, price, q) {
    const t = ctex(160, 80, (g, w, h) => { g.fillStyle = '#f3efe2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b03a2e'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); g.fillStyle = '#1a1a1a'; g.font = '700 22px Arial'; g.textAlign = 'center'; g.fillText(ctx.GOODS[id].short, w / 2, 28); g.fillStyle = '#b03a2e'; g.font = '900 30px Arial'; g.fillText(ctx.fmt(price) + ' р', w / 2, 62); if (!q) { g.fillStyle = '#0009'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 26px Arial'; g.fillText('НЕТ', w / 2, 50); } });
    return new THREE.Mesh(new THREE.PlaneGeometry(.13, .065), std({ map: t, roughness: .9 }));
  }
  const storeGroup = new THREE.Group(); K.add(storeGroup);
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
  occluders.push(box(2, 2.4, 2, std({ color: 0xd9d6cc, roughness: .6 }), 0, 1.2, 0, booth));
  box(2.2, .1, 2.2, MAT.roofTin, 0, 2.45, 0, booth); box(2.2, .06, 2.2, MAT.snow, 0, 2.52, 0, booth, false).userData.winter = true;
  box(1.2, .6, .05, std({ color: 0x223, roughness: .1, metalness: .3 }), 0, 1.45, 1.01, booth);
  const exSign = textTex(512, 96, 'ОБМЕН ВАЛЮТ', '#1f3a68', '#f2e6c9', '900 56px Arial');
  const exS = new THREE.Mesh(new THREE.PlaneGeometry(1.9, .36), std({ map: exSign, emissive: 0xffffff, emissiveMap: exSign, emissiveIntensity: 0 })); exS.position.set(0, 2.1, 1.02); booth.add(exS);
  const rateTex = regTex(ctex(256, 128, () => {}));
  const rateBoard = new THREE.Mesh(new THREE.PlaneGeometry(.8, .4), std({ map: rateTex, emissive: 0xffffff, emissiveMap: rateTex, emissiveIntensity: .35 })); rateBoard.position.set(0, .85, 1.02); booth.add(rateBoard);
  function drawRateBoard() { const S = ctx.getS(), g = rateTex.userData.canvas.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#ff4a2a'; g.font = '700 30px "Courier New", monospace'; g.textAlign = 'left'; g.fillText('USD ' + ctx.fmt(S.rate * 1.04), 14, 50); g.fillStyle = '#ffb43a'; g.fillText('    ' + ctx.fmt(S.rate * .96), 14, 100); rateTex.needsUpdate = true; }
  addCol(BOOTH.x - 1.05, BOOTH.x + 1.05, BOOTH.z - 1.05, BOOTH.z + 1.05);

  // ---------- рынок ----------
  const MARKET = { x: -23, z: -8 };
  const tarps = [stripes('#a8352a', '#d8d0bc'), stripes('#2d4f86', '#d8d0bc'), stripes('#3f6a4c', '#d8c070'), stripes('#c8902a', '#4a3a2a')];
  const vendorSpots = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const sx = MARKET.x - 9 + c * 6, sz = MARKET.z - 4 + r * 8;
    const st = new THREE.Group(); st.position.set(sx, 0, sz); st.rotation.y = r ? Math.PI : 0; scene.add(st);
    for (const [px, pz] of [[-1.6, -1], [1.6, -1], [-1.6, 1], [1.6, 1]]) cyl(.035, .035, 2.3, MAT.steel, px, 1.15, pz, 6, st);
    const tp = new THREE.Mesh(new THREE.BoxGeometry(3.6, .04, 2.6), std({ map: tarps[(r * 4 + c) % 4] })); tp.position.y = 2.3; tp.rotation.x = .08; tp.castShadow = true; st.add(tp);
    box(3.6, .05, 2.6, MAT.snow, 0, 2.34, 0, st, false).rotation.x = .08;
    box(3.0, .8, .9, MAT.wood, 0, .4, .5, st);
    for (let k = 0; k < 5; k++) box(R(.3, .5), R(.2, .35), R(.3, .45), std({ color: pick([0xb5452f, 0x8a6a45, 0x2d4f86, 0xd4a72c, 0x5a7a3a, 0xd8d0bc]) }), -1.1 + k * .55, .9, .5 + R(-.2, .2), st);
    const wz = r ? sz - .5 : sz + .5; addCol(sx - 1.5, sx + 1.5, wz - .45, wz + .45);
    if ((r * 4 + c) % 2 === 0) vendorSpots.push({ x: sx, z: r ? sz + 1.1 - 2.2 : sz - 1.1 + 2.2 - 2.2, rot: r ? Math.PI : 0 });
  }
  const mSign = textTex(512, 110, 'РЫНОК', '#b03a2e', '#f2e6c9', '900 76px Arial');
  const arch = new THREE.Group(); arch.position.set(MARKET.x + 12, 0, MARKET.z); arch.rotation.y = Math.PI / 2; scene.add(arch);
  cyl(.08, .08, 4, MAT.steel, -2.5, 2, 0, 8, arch); cyl(.08, .08, 4, MAT.steel, 2.5, 2, 0, 8, arch);
  const ms = new THREE.Mesh(new THREE.PlaneGeometry(4, .9), std({ map: mSign, side: THREE.DoubleSide })); ms.position.y = 3.6; arch.add(ms);
  addCol(MARKET.x + 11.9, MARKET.x + 12.1, MARKET.z - 2.6, MARKET.z - 2.4); addCol(MARKET.x + 11.9, MARKET.x + 12.1, MARKET.z + 2.4, MARKET.z + 2.6);

  // ---------- гаражи, деревянный забор, баки, вывески ----------
  for (let i = 0; i < 8; i++) {
    const gx = 26 + i * 4.2, gz = -16;
    occluders.push(box(4, 2.6, 6, MAT.rust, gx, 1.3, gz));
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

  // ---------- загрузка моделей ----------
  const loader = new GLTFLoader();
  const ASSETS = {};
  let loadedN = 0; const toLoad = ['apartment', 'busstop', 'beton', 'snowtrees', 'radio', 'steelworker'];
  const winMats = [];
  const crowns = { winter: [], summer: [] };
  const loading = Promise.all(toLoad.map(n => loader.loadAsync('assets/models/' + n + '.glb').then(g => { ASSETS[n] = g; loadedN++; ctx.onLoadProgress && ctx.onLoadProgress(loadedN / toLoad.length); }).catch(e => { console.warn('Не загрузилась модель', n, e); loadedN++; })));
  function meshesOf(g) { const out = []; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh) out.push(o); }); return out; }
  function prepMats(root) { root.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (m[k]) m[k].anisotropy = Q.aniso; }); } }); }
  function placeModel(g, x, z, rotY, scale = 1) { const o = g.scene.clone(true); o.position.set(x, 0, z); o.rotation.y = rotY; o.scale.setScalar(scale); scene.add(o); prepMats(o); o.updateMatrixWorld(true); return o; }
  function colFromBox(o, shrink = 0) { const b = new THREE.Box3().setFromObject(o); return addCol(b.min.x + shrink, b.max.x - shrink, b.min.z + shrink, b.max.z - shrink); }
  let staticWorker = null;
  loading.then(() => {
    // дома
    if (ASSETS.apartment) {
      const A = ASSETS.apartment;
      // светятся только стёкла горящих окон (оранжевые пиксели ночной текстуры)
      const maskCache = new Map();
      const maskOf = t => { if (maskCache.has(t)) return maskCache.get(t); const img = t.image, w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, w, h);
        for (let i = 0; i < d.data.length; i += 4) { const r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2]; const lit = r > 180 && gg > 120 && b < 140 && r - b > 70; if (!lit) { d.data[i] = d.data[i + 1] = d.data[i + 2] = 0; } }
        g.putImageData(d, 0, 0); const nt = new THREE.CanvasTexture(c); nt.colorSpace = THREE.SRGBColorSpace; nt.flipY = t.flipY; nt.magFilter = THREE.NearestFilter; maskCache.set(t, nt); return nt; };
      A.scene.traverse(o => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.emissiveMap) { try { m.emissiveMap = maskOf(m.emissiveMap); } catch (e) {} m.emissive.set(0xffc070); m.emissiveIntensity = 0; m.needsUpdate = true; winMats.push(m); } }); } });
      for (const [x, z, r] of [[-32, 27, Math.PI / 2], [30, 27, Math.PI / 2], [0, -36, -Math.PI / 2], [-66, -10, 0], [70, -6, Math.PI]]) {
        const o = placeModel(A, x, z, r); colFromBox(o, .5); o.traverse(m => { if (m.isMesh) occluders.push(m); });
      }
    } else fallbackBuildings();
    // остановка
    if (ASSETS.busstop) { const o = placeModel(ASSETS.busstop, 8, 4.5, Math.PI / 2); o.traverse(m => { if (m.isMesh) occluders.push(m); }); const b = new THREE.Box3().setFromObject(o); addCol(b.min.x, b.max.x, b.min.z, b.min.z + .25); }
    // бетонный забор из плит (инстансинг)
    if (ASSETS.beton) {
      const ms = meshesOf(ASSETS.beton); const m0 = ms[0]; const geo = m0.geometry.clone().applyMatrix4(m0.matrixWorld);
      geo.computeBoundingBox(); const len = geo.boundingBox.max.x - geo.boundingBox.min.x;
      const segs = [[-74, -46, 76, -46], [-74, -46, -74, 17], [77, -46, 77, 17], [20, -22, 20, -46]];
      const mats = []; for (const [x1, z1, x2, z2] of segs) { const L = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(L / len), ang = Math.atan2(z2 - z1, x2 - x1); for (let i = 0; i < n; i++) { const t = (i + .5) / n; mats.push(new THREE.Matrix4().compose(new THREE.Vector3(lerp(x1, x2, t), 0, lerp(z1, z2, t)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -ang, 0)), new THREE.Vector3(1, 1, 1))); } addCol(Math.min(x1, x2) - .25, Math.max(x1, x2) + .25, Math.min(z1, z2) - .25, Math.max(z1, z2) + .25); }
      const im = new THREE.InstancedMesh(geo, m0.material, mats.length); mats.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = true; scene.add(im); prepMats(im);
    }
    // снежные деревья (инстансинг по типам)
    if (ASSETS.snowtrees) {
      const byName = {}; meshesOf(ASSETS.snowtrees).forEach(m => byName[m.name] = m);
      const spots = [[-6, -9], [-10, -15], [3, -18], [9, -10], [-14, -21], [16, -21], [22, -6], [-40, 3.0], [-44, -25], [34, -25], [56, -12], [-2, -23], [-12, 17.5], [-46, 17.5], [44, 17.5], [6, -25], [-36, -16], [-52, -30], [60, -36], [-20, -32], [40, -40], [-60, 8], [64, 10]];
      const kinds = { winter: ['snowtree', 'deadtreehero', 'TreeBareTall', 'snowtree'], summer: ['deadtreewide', 'TreeBareTall', 'deadtreehero', 'deadtreewide'] };
      for (const season of ['winter', 'summer']) {
        const per = {}; spots.forEach(([x, z], i) => { const k = kinds[season][i % 4]; (per[k] = per[k] || []).push([x, z, R(.85, 1.2), R(0, 6)]); });
        for (const [k, arr] of Object.entries(per)) { const src = byName[k]; if (!src) continue; const geo = src.geometry.clone().applyMatrix4(src.matrixWorld); const im = new THREE.InstancedMesh(geo, src.material, arr.length); arr.forEach(([x, z, s, r], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r, 0)), new THREE.Vector3(s, s, s)))); im.castShadow = true; scene.add(im); crowns[season].push(im); }
      }
      spots.forEach(([x, z]) => addCol(x - .3, x + .3, z - .3, z + .3));
      // кусты и лесополоса на горизонте
      if (byName.snowbush1) { const geo = byName.snowbush1.geometry.clone().applyMatrix4(byName.snowbush1.matrixWorld); const pts = []; for (let i = 0; i < 26; i++) pts.push([R(-60, 60), R(-40, -24)]); for (let i = 0; i < 10; i++) pts.push([R(-60, 60), R(17, 18.5)]); const im = new THREE.InstancedMesh(geo, byName.snowbush1.material, pts.length); pts.forEach(([x, z], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(1, R(.7, 1.2), 1)))); scene.add(im); crowns.winter.push(im); }
      if (byName.treeline) { const geo = byName.treeline.geometry.clone().applyMatrix4(byName.treeline.matrixWorld); geo.computeBoundingBox(); const w = Math.max(geo.boundingBox.max.x - geo.boundingBox.min.x, geo.boundingBox.max.z - geo.boundingBox.min.z); const ring = []; for (let a = 0; a < Math.PI * 2; a += .35) ring.push(a); const im = new THREE.InstancedMesh(geo, byName.treeline.material, ring.length); ring.forEach((a, i) => im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 120, -1, Math.sin(a) * 120), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2 + (Math.abs(geo.boundingBox.max.x - geo.boundingBox.min.x) > 1 ? 0 : Math.PI / 2), 0)), new THREE.Vector3(1, 1.3, 1)))); scene.add(im); }
    }
    // радио на полке
    if (ASSETS.radio) { const o = placeModel(ASSETS.radio, -KW + .17, -.62, Math.PI / 2, 1.0); o.position.y = 1.315; radioObj = o; o.traverse(m => { if (m.isMesh) m.userData.radio = true; }); }
    // модель рабочего — один из вариантов NPC
    if (ASSETS.steelworker) { const m = meshesOf(ASSETS.steelworker)[0]; if (m) staticWorker = splitStaticModel(m.geometry.clone().applyMatrix4(m.matrixWorld)); }
    for (let i = 0; i < 3; i++) spawnVendor(i);
    season = -1;
    ctx.onLoaded && ctx.onLoaded();
  });
  let radioObj = null; const radioPos = new THREE.Vector3(-KW + .17, 1.42, -.62);
  function fallbackBuildings() {
    const m = std({ color: 0x8e8a80 });
    for (const [x, z, w, d] of [[-32, 27, 50, 15], [30, 27, 50, 15], [0, -36, 50, 15]]) { const b = box(w, 15, d, m, x, 7.5, z); occluders.push(b); addCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2); }
  }

  // ---------- машины ----------
  function carMesh(color) {
    const g = new THREE.Group(); const body = std({ color, roughness: .35, metalness: .5 }), dark = std({ color: 0x151515, roughness: .6 });
    box(4.0, .55, 1.62, body, 0, .58, 0, g); box(2.1, .5, 1.5, body, -.2, 1.1, 0, g);
    box(2.0, .42, 1.52, new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: .08, metalness: .7 }), -.2, 1.11, 0, g);
    box(.1, .16, 1.66, MAT.steel, 2.03, .45, 0, g); box(.1, .16, 1.66, MAT.steel, -2.03, .45, 0, g);
    for (const [wx, wz] of [[-1.3, -.78], [1.3, -.78], [-1.3, .78], [1.3, .78]]) { const w_ = cyl(.31, .31, .2, dark, wx, .31, wz, 14, g); w_.rotation.x = Math.PI / 2; }
    const hl = std({ color: 0xffffee, emissive: 0xfff2c0, emissiveIntensity: 0 }); box(.05, .14, .3, hl, 2.04, .65, -.55, g); box(.05, .14, .3, hl, 2.04, .65, .55, g);
    const tl = std({ color: 0x8a1a12, emissive: 0xff2a10, emissiveIntensity: .3 }); box(.05, .12, .3, tl, -2.04, .65, -.55, g); box(.05, .12, .3, tl, -2.04, .65, .55, g);
    box(2.1, .06, 1.5, MAT.snow, -.2, 1.38, 0, g, false).userData.winter = true;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .35, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = .02; g.add(blob);
    g.userData = { hl, tl }; scene.add(g); return g;
  }
  for (const [x, z, r, c] of [[18, -7, 0, 0xd8d4c8], [24.5, -7.3, .05, 0x7a2a22], [31, -9.5, Math.PI / 2, 0x3a5a3a], [-8, -2.6, 0, 0xc8b88a]]) { const m = carMesh(c); m.position.set(x, 0, z); m.rotation.y = r; const hx = Math.abs(Math.sin(r)) > .5 ? .9 : 2.1, hz = Math.abs(Math.sin(r)) > .5 ? 2.1 : .9; addCol(x - hx, x + hx, z - hz, z + hz); occluders.push(m.children[0]); }
  // кольцевые маршруты (с поворотами за домами)
  const ROUTES = [
    [[-82, 8.4], [86, 8.4], [92, 14], [92, 44], [86, 50], [-82, 50], [-88, 44], [-88, 14]],
    [[86, 12], [-82, 12], [-90, 18], [-90, 46], [-84, 52], [84, 52], [90, 46], [90, 18]],
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
  function canMove() { return ctx.getS() && !P.seated && !P.locked && !ctx.cardOpen() && !ctx.sheetOpen() && P.stun <= 0; }
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
  const frustum = new THREE.Frustum(), projM = new THREE.Matrix4(), ray = new THREE.Raycaster(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  function visibleFromPlayer(x, z) {
    projM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projM);
    tmpV.set(x, 1.2, z); const d = camera.position.distanceTo(tmpV);
    if (d > Q.draw) return false;
    if (!frustum.containsPoint(tmpV) && !frustum.containsPoint(tmpV.set(x, .1, z)) && !frustum.containsPoint(tmpV.set(x, 1.8, z))) return false;
    tmpV.set(x, 1.2, z); ray.set(camera.position, tmpV2.subVectors(tmpV, camera.position).normalize()); ray.far = d - .5;
    return ray.intersectObjects(occluders, false).length === 0;
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
    const useStatic = staticWorker && kind === 'worker' && Math.random() < .35;
    const h = new Human(look, useStatic ? staticWorker : null);
    const n = NODES[nodeId]; h.obj.position.set(n.x + R(-.3, .3), 0, n.z + R(-.3, .3)); scene.add(h.obj);
    const shadow = new THREE.Mesh(blobGeo, blobMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; h.obj.add(shadow);
    const p = Object.assign({ h, role, state: 'idle', path: [], speed: look.walkSpeed, timer: 0, kind, fear: 0, id: Math.random() }, extra || {});
    people.push(p); return p;
  }
  const blobGeo = new THREE.CircleGeometry(.32, 16), blobMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .32, depthWrite: false });
  function removePerson(p) { scene.remove(p.h.obj); const i = people.indexOf(p); if (i >= 0) people.splice(i, 1); }
  function goTo(p, x, z, then) {
    const o = p.h.obj.position, a = nearestNode(o.x, o.z), b = nearestNode(x, z); const pt = path(a, b); pt.push({ x, z });
    // не возвращаться к узлу, который уже позади
    while (pt.length > 1 && Math.hypot(pt[1].x - o.x, pt[1].z - o.z) <= Math.hypot(pt[1].x - pt[0].x, pt[1].z - pt[0].z) + .2) pt.shift();
    if (Math.hypot(x - o.x, z - o.z) < 6) pt.splice(0, pt.length - 1); // рядом — напрямую
    p.path = pt; p.then = then; p.state = 'walk';
  }
  function leaveWorld(p) { const target = NODES[pickSpawn(p.h.obj.position)]; goTo(p, target.x, target.z, () => removePerson(p)); p.leaving = true; }
  function spawnVendor(i) { const s = vendorSpots[i % vendorSpots.length]; if (!s) return; const p = newPerson('vendor', 'vendor', 'm2'); p.h.obj.position.set(s.x, 0, s.z); p.h.obj.rotation.y = s.rot; p.state = 'stand'; p.anim = 'idle'; }
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
    o.x += mx; o.z += mz;
    faceTo(p, Math.atan2(dx, dz), dt);
    return Math.hypot(mx, mz);
  }
  function peopleTick(dt) {
    const camPos = camera.position;
    for (const p of people.slice()) {
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

  // ---------- ружьё и реакции ----------
  const weapon = createWeapon({ audio: ctx.audio, onShot: () => onShot() });
  function aimedPerson(maxD = 30) {
    camera.getWorldDirection(tmpV2); let best = null, bd = .5;
    for (const p of people) { const o = p.h.obj.position; tmpV.set(o.x, 1.3 * p.h.L.height / 1.75, o.z).sub(camera.position); const along = tmpV.dot(tmpV2); if (along < .5 || along > maxD) continue; const perp = tmpV.addScaledVector(tmpV2, -along).length(); if (perp < bd) { bd = perp; best = p; } }
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
    if (p.role === 'vendor') { p.state = 'scared'; p.anim = 'handsUp'; p.timer = 4; p.h.setExpr('scared'); return; }
    // мирные — пугаются
    p.prevState = p.state; p.state = 'scared'; p.anim = L.nerve > .3 ? 'handsUp' : 'scared'; p.timer = 2.5; p.h.setExpr('scared');
    if (!p.scaredOnce) { p.scaredOnce = true; ctx.rep('folk', -1.5); }
    if (p.role === 'cust' && p.c) { ctx.customerScared(p.c); }
    else setTimeout(() => { if (people.includes(p)) { p.flee = true; leaveWorld(p); p.speed = 3.5; } }, 2200);
  }
  function onShot() {
    P.pitch = Math.min(1.25, P.pitch + .09); P.shake = .4;
    const S = ctx.getS(); if (S) { ctx.rep('law', -4); ctx.rep('folk', -2); }
    for (const p of people) { const d = Math.hypot(p.h.obj.position.x - P.x, p.h.obj.position.z - P.z); if (d > 45) continue;
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
    snowN = n; const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), sz = new Float32Array(n), sp = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = R(-22, 22); pos[i * 3 + 1] = R(0, 16); pos[i * 3 + 2] = R(-22, 22); sz[i] = R(.6, 1.6); sp[i] = R(.6, 1.4); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1)); g.setAttribute('spd', new THREE.BufferAttribute(sp, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, wind: { value: new THREE.Vector2() }, origin: { value: new THREE.Vector3() }, light: { value: 1 }, kmin: { value: new THREE.Vector3(-KW, 0, -KD) }, kmax: { value: new THREE.Vector3(KW, KH + .2, KD) }, scale: { value: 300 } },
      vertexShader: `attribute float size; attribute float spd; uniform float time, scale; uniform vec2 wind; uniform vec3 origin, kmin, kmax; varying float vA;
        void main(){
          vec3 p = position; float fall = time * spd * 1.1;
          p.y = mod(p.y - fall, 16.0);
          p.x = mod(p.x + wind.x * time * spd + sin(time * 1.3 + position.z) * .4 - origin.x + 22.0, 44.0) - 22.0 + origin.x;
          p.z = mod(p.z + wind.y * time * spd + cos(time * 1.1 + position.x) * .4 - origin.z + 22.0, 44.0) - 22.0 + origin.z;
          vA = 1.0; if (all(greaterThan(p, kmin)) && all(lessThan(p, kmax))) vA = 0.0; // не идёт внутри ларька
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = size * scale / -mv.z; vA *= smoothstep(0.3, 1.5, -mv.z) * (1.0 - smoothstep(18.0, 22.0, -mv.z));
        }`,
      fragmentShader: `uniform float light; varying float vA; void main(){ vec2 c = gl_PointCoord - .5; float a = smoothstep(.5, .15, length(c)) * vA; if (a < .02) discard; gl_FragColor = vec4(vec3(light), a * .9); }`,
      transparent: true, depthWrite: false,
    });
    snowPts = new THREE.Points(g, m); snowPts.frustumCulled = false; scene.add(snowPts);
  }

  // ---------- время суток, погода, сезон ----------
  let hour = 7.5, nightK = 0, season = -1, winter = true, weather = { snow: .6, wind: .3, target: .6, windT: .3 };
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
    scene.fog.color.copy(bot); scene.fog.near = 8 + (1 - weather.snow) * 25; scene.fog.far = Q.draw * (1 - weather.snow * .45);
    sun.color.set(dusk > .3 ? '#ffa565' : '#fff1dc'); sun.intensity = el > 0 ? (2.6 * clamp(el / 15, 0, 1)) * (1 - over * .8) : 0;
    hemi.intensity = .14 + dayAmt * (1.05 - over * .2); hemi.color.copy(topC).lerp(cA.set('#ffffff'), .5); hemi.groundColor.set(winter ? '#9aa0a6' : '#4a4636').multiplyScalar(.5 + dayAmt * .5);
    if (dayAmt < .2) { hemi.color.lerp(cA.set('#5a6a8a'), .6); }
    post.uniforms.exposure.value = 1.05 + nightK * .45;
    winMats.forEach(m => m.emissiveIntensity = nightK * 1.4);
    MAT.lampHead.emissiveIntensity = nightK > .35 ? 4 : 0;
    streetLights.forEach(l => l.intensity = nightK > .35 ? 70 * nightK : 0);
    sign.material.emissiveIntensity = nightK * .9; exS.material.emissiveIntensity = nightK * 1.2;
    neons.forEach(o => o.material.emissiveIntensity = nightK * .7);
    cars.forEach(c => { c.m.userData.hl.emissiveIntensity = nightK > .3 ? 3 : 0; });
    bulbLight.intensity = 6 + nightK * 3; MAT.bulb.emissiveIntensity = 3;
    if (snowPts) snowPts.material.uniforms.light.value = .35 + dayAmt * .65;
  }
  function setSeason() {
    const S = ctx.getS(); if (!S) return; const m = ctx.monthOf(S.day); if (m === season) return; season = m;
    winter = m >= 10 || m <= 2;
    winterGround.forEach(g => g.visible = winter); summerGround.forEach(g => g.visible = !winter);
    scene.traverse(o => { if (o.userData.winter) o.visible = winter; }); awnSnow.visible = roofSnow.visible = winter;
    crowns.winter.forEach(c => c.visible = winter); crowns.summer.forEach(c => c.visible = !winter);
    weather.target = winter ? pick([0, .3, .6, .6, 1]) : 0; weather.windT = R(.1, .9);
  }

  // ---------- настройки качества ----------
  function applyQuality(q) {
    Object.assign(Q, q);
    const sh = Q.shadows > 0;
    renderer.shadowMap.enabled = sh;
    sun.castShadow = sh; if (sh) { sun.shadow.mapSize.set(Q.shadows, Q.shadows); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    bulbLight.castShadow = sh && Q.light >= 1; fillLight.visible = Q.light >= 2;
    camera.far = Q.draw + 60; camera.updateProjectionMatrix(); sky.scale.setScalar(Math.min(1, (Q.draw + 40) / 380));
    allTex.forEach(t => { t.anisotropy = Q.aniso; t.needsUpdate = true; });
    buildSnow(Q.snow);
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
    resize();
  }
  applyQuality(Q);

  // ---------- взаимодействия ----------
  function lookingAt(objs, maxD) { ray.setFromCamera(new THREE.Vector2(0, 0), camera); ray.far = maxD; const h = ray.intersectObjects(objs, true)[0]; return h ? h : null; }
  const nearMarket = () => !inKiosk() && Math.hypot(P.x - MARKET.x, P.z - MARKET.z) < 15;
  const nearBooth = () => !inKiosk() && Math.hypot(P.x - BOOTH.x, P.z - BOOTH.z - 1.6) < 2.6;
  function action() {
    const S = ctx.getS(); if (!S || fadeBusy || ctx.cardOpen() || P.stun > 0) return null;
    if (lookingAt([doorMesh], 2.4)) return { label: doorTarget > .5 ? 'Закрыть дверь' : (inKiosk() ? 'Открыть дверь' : 'Открыть дверь'), icon: '🚪', fn: toggleDoor };
    if (inKiosk()) {
      if (radioObj && lookingAt([radioObj], 1.8)) return { label: ctx.audio.radioOn ? 'Выключить радио' : 'Включить радио', icon: '📻', fn: () => { ctx.audio.radioToggle(); ctx.onCtl(); } };
      if (P.locked) return null;
      if (!P.seated && Math.hypot(P.x - STOOL.x, P.z - STOOL.z) < .9) return { label: S.phase === 'night' ? 'Сесть и уснуть до утра' : 'Сесть за прилавок', icon: '🪑', fn: () => { if (S.phase === 'night') ctx.sleep(); else { sit(); P.x = STOOL.x; P.z = STOOL.z; P.yaw = Math.PI; } } };
      if (P.seated) return { label: 'Встать', icon: '⬆', fn: stand };
      return null;
    }
    const tp = aimedPerson(2.6);
    if (tp && tp.role === 'ped' && tp.state !== 'scared' && !weapon.drawn) return { label: 'Поговорить', icon: '💬', fn: () => talkTo(tp) };
    if (nearBooth()) return { label: 'Обменник', icon: '💱', fn: () => ctx.openSheet('exch') };
    if (nearMarket()) return { label: 'Рынок', icon: '🛒', fn: () => ctx.openSheet('market') };
    return null;
  }
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
    setSeason();
    // погода
    weather.snow += (weather.target - weather.snow) * dt * .05; weather.wind += (weather.windT - weather.wind) * dt * .1;
    if (Math.random() < dt * .01) { weather.target = winter ? pick([0, .3, .6, 1]) : 0; weather.windT = R(.1, 1); }
    // игрок
    P.stun = Math.max(0, P.stun - dt);
    const moveOK = canMove();
    let ix = 0, iz = 0;
    if (moveOK) { ix = input.mx; iz = input.my; const k = input.keys; if (k.KeyW || k.ArrowUp) iz -= 1; if (k.KeyS || k.ArrowDown) iz += 1; if (k.KeyA || k.ArrowLeft) ix -= 1; if (k.KeyD || k.ArrowRight) ix += 1; const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; } }
    const inside = inKiosk();
    if (!inside && S && !S.flags.wentOut) { S.flags.wentOut = true; ctx.onCtl(); }
    const run = P.sprint && !P.crouch && iz < -.3 && !weapon.aiming;
    const maxSp = (inside ? (run ? 1.7 : 1.15) : (run ? 4.3 : 1.65)) * (P.crouch ? .5 : 1) * (weapon.aiming ? .55 : 1);
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const tvx = (rx * ix - fx * iz) * maxSp, tvz = (rz * ix - fz * iz) * maxSp;
    const acc = (Math.hypot(tvx, tvz) > Math.hypot(P.vx, P.vz) ? 9 : 11) * dt;
    if (P.stun <= 0) { P.vx += clamp(tvx - P.vx, -acc, acc); P.vz += clamp(tvz - P.vz, -acc, acc); } else { P.vx *= Math.pow(.2, dt); P.vz *= Math.pow(.2, dt); }
    let moved = 0;
    if (!P.seated) {
      doorCol.x1 = doorOpen < .3 ? .4 : 1.17; doorCol.x2 = doorOpen < .3 ? 1.2 : 1.25; doorCol.z1 = doorOpen < .3 ? -KD - .05 : -KD - .8 * Math.min(1, doorOpen); doorCol.z2 = -KD + (doorOpen < .3 ? .05 : 0);
      if (doorOpen > .3 && doorOpen < .75) { doorCol.x1 = doorCol.x2 = 999; }
      const ox = P.x, oz = P.z;
      const nx = P.x + P.vx * dt; if (!hitAny(nx, P.z)) P.x = nx; else P.vx = 0;
      const nz = P.z + P.vz * dt; if (!hitAny(P.x, nz)) P.z = nz; else P.vz = 0;
      P.x = clamp(P.x, -72, 75); P.z = clamp(P.z, -44.5, 18.6);
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
    camera.rotation.set(P.pitch + weapon.kick * .05, P.yaw, P.roll + bobX * .5 * bobAmt);
    camera.fov += ((baseFov * (1 - weapon.aimK * .22) * (run ? 1.06 : 1)) - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix();
    post.uniforms.hurt.value = Math.max(0, post.uniforms.hurt.value - dt * .4);
    // дверь
    doorOpen += (doorTarget - doorOpen) * Math.min(1, dt * 5); doorPivot.rotation.y = -doorOpen * 1.6;
    // машины
    carsTick(dt);
    // люди
    if (S) { ambientTick(dt); gopTick(dt); }
    peopleTick(dt);
    // наведение ружья
    if (weapon.drawn) { const p = aimedPerson(weapon.aiming ? 35 : 12); if (p && (weapon.aiming || Math.hypot(p.h.obj.position.x - P.x, p.h.obj.position.z - P.z) < 6)) threaten(p); }
    weapon.update(dt, { moving: Math.min(1, spd / 2), sprint: run, aspect: camera.aspect });
    weapon.cam.fov = camera.fov; weapon.cam.updateProjectionMatrix();
    // снег
    if (snowPts) { const u = snowPts.material.uniforms; u.time.value = tAll; u.origin.value.copy(camera.position); u.wind.value.set(weather.wind * 2.2, weather.wind * .6); snowPts.visible = winter && weather.snow > .05; u.scale.value = window.innerHeight * DPR * .035; snowPts.material.opacity = weather.snow; }
    sky.position.copy(camera.position); skyMat.uniforms.t.value = tAll;
    bulbLight.intensity *= 1 + Math.sin(tAll * 31) * .01;
    // звук
    ctx.audio && ctx.audio.update({ camera, radioPos, inside, doorOpen, wind: winter ? weather.wind : weather.wind * .4, night: nightK > .6 });
    // контекстная кнопка
    actT -= dt; if (actT <= 0) { actT = .15; curAct = action(); const l = curAct ? curAct.label : ''; if (l !== lastActLabel) { lastActLabel = l; ctx.onCtl(); } }
    // рендер
    post.uniforms.time.value = tAll;
    renderer.setRenderTarget(rt); renderer.render(scene, camera);
    if (weapon.state !== 'holstered') { renderer.autoClear = false; renderer.clearDepth(); renderer.render(weapon.scene, weapon.cam); renderer.autoClear = true; }
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  }
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
      c.m.position.set(x, 0, z); c.m.rotation.y = c.heading;
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
    frame, updateShelves, goCounter, sit, stand, nearMarket, nearBooth, P, weapon, loading,
    action: () => curAct, canMove, inKiosk, toggleDoor, look, applyQuality, spawnCustomer, customerEvent,
    move(x, y) { input.mx = x; input.my = y; }, nearDoor() { return Math.hypot(P.x - .8, P.z + KD) < 2.2; }, setSprint(v) { P.sprint = v; }, toggleCrouch() { if (!P.seated) P.crouch = !P.crouch; }, get crouch() { return P.crouch; }, get sprint() { return P.sprint; },
    unlock() { P.locked = false; ctx.onCtl(); },
    toggleFlashlight() { flashlight.intensity = flashlight.intensity > 0 ? 0 : 30; return flashlight.intensity > 0; }, get flashlightOn() { return flashlight.intensity > 0; },
    radioNear() { return inKiosk(); },
    gopLeave, get gopnik() { return gopnikGroup; },
    get hour() { return hour; }, get doorOpen() { return doorOpen; },
    reset() { P.x = STOOL.x; P.z = STOOL.z; P.yaw = Math.PI; P.pitch = -.08; P.seated = true; P.locked = false; P.crouch = false; P.vx = P.vz = 0; shelfSig = ''; season = -1; hour = 8; doorTarget = 0; people.slice().forEach(p => { if (p.role !== 'vendor') removePerson(p); }); gopnikGroup = null; },
    debug: { people, cars, colliders, NODES, visibleFromPlayer, spawnGopniks, get gop() { return gopnikGroup; } },
  };
}
