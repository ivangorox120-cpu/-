// 3D-мир «Ларька»: город 90-х, ларёк с интерьером, игрок от первого лица, люди, машины, погода, сутки.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Human, makeLook, splitStaticModel, preparePeople, preparePolice, prepareSdsPerson } from './npc.js';
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
  low:    { label: 'Низкое',       dpr: .75, shadows: 0,    draw: 70,  light: 0, snow: 450,  npc: 8,   aniso: 1 },
  medium: { label: 'Среднее',      dpr: .95, shadows: 1024, draw: 105, light: 1, snow: 1200, npc: 14,  aniso: 2 },
  high:   { label: 'Высокое',      dpr: 1.2, shadows: 1536, draw: 145, light: 2, snow: 2200, npc: 20, aniso: 4 },
  max:    { label: 'Максимальное', dpr: 1.5, shadows: 2048, draw: 185, light: 2, snow: 3200, npc: 26, aniso: 4 },
};

export function createWorld(ctx) {
  const cvs = document.getElementById('world');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: false, powerPreference: 'high-performance' }); } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const Q = Object.assign({}, QUALITY[ctx.settings().quality || (isMobile ? 'medium' : 'high')], ctx.settings().custom || {});
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  // слабые/малосовместимые GPU (Mali в Tensor/Exynos/MediaTek, PowerVR, Xclipse): облегчённый режим — меньше источников света,
  // жёсткие тени вместо мягких, без кубических отражений в лужах, ниже разрешение рендера. Adreno (Snapdragon) — как было.
  const GPU = (() => { try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { return ''; } })();
  const liteSet = ctx.settings().lite ?? 2; // 2 — авто, 1 — всегда, 0 — никогда
  const LITE = liteSet === 1 || (liteSet === 2 && /Mali|Immortalis|PowerVR|Xclipse|Vivante|Tensor/i.test(GPU));
  renderer.shadowMap.type = LITE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; // мягкие края теней (на слабых GPU — обычный PCF)

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, .05, 400); camera.rotation.order = 'YXZ'; scene.add(camera);
  scene.fog = new THREE.Fog(0x9aa0a0, 20, 160);
  // естественная дымка вместо линейного тумана: экспоненциальное нарастание с расстоянием, у земли гуще, с высотой реже (дома не «обрезаются» плоской стеной)
  THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying vec3 vFogW;\n#endif';
  THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogW = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);\n#endif';
  THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogW;\n #ifdef FOG_EXP2\n uniform float fogDensity;\n #else\n uniform float fogNear; uniform float fogFar;\n #endif\n#endif';
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fd = length(vFogW - cameraPosition), dens = 1.15 / max(fogFar, 1.0);
    float hgt = exp(-max(vFogW.y, 0.0) * .05);                              // высотное ослабление
    float near = smoothstep(fogNear * .25, fogNear * .25 + 4.0, fd);       // вблизи воздух чистый
    float fogFactor = (1.0 - exp(-pow(fd * dens, 1.6))) * mix(.6, 1.0, hgt) * near;
    float aer = smoothstep(0.0, 1.0, fogFactor);                          // воздушная перспектива: даль голубеет и светлеет
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(.93, .97, 1.04) + fogColor * .06, aer * .5);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(fogFactor, 0.0, 1.0));
#endif`;

  // ---------- пост-обработка ----------
  const gl2 = renderer.capabilities.isWebGL2;
  const halfOk = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: 0 });
  const post = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, time: { value: 0 }, exposure: { value: 1 }, res: { value: new THREE.Vector2(1, 1) }, vig: { value: 1 }, sat: { value: .72 }, hurt: { value: 0 }, blur: { value: 0 }, dbl: { value: 0 }, smoke: { value: 0 }, dbt: { value: 0 }, retro: { value: 0 }, blink: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time, exposure, vig, sat, hurt, blur, dbl, smoke, dbt, retro, blink; uniform vec2 res; varying vec2 vUv;
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
        if (blink > 0.001) {
          float bCurve = (vUv.x - 0.5) * (vUv.x - 0.5) * 0.24;
          float topLid = 1.0 - blink * 0.58 - bCurve * (1.0 - blink * 0.45);
          float botLid = blink * 0.44 + bCurve * (1.0 - blink * 0.45);
          float bFeather = 0.045 + (1.0 - blink) * 0.04;
          float lidOpen = smoothstep(botLid - bFeather, botLid + bFeather, vUv.y)
                        * (1.0 - smoothstep(topLid - bFeather, topLid + bFeather, vUv.y));
          if (blink > 0.96) lidOpen *= clamp((1.0 - blink) * 25.0, 0.0, 1.0);
          col *= lidOpen;
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
    DPR = Math.min(window.devicePixelRatio || 1, LITE ? Math.min(Q.dpr, .8) : Q.dpr); // на слабых GPU рендер в пониженном разрешении
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
      // Тёплая чистая советская бумага обоев с гармоничным ромбовидным узором без искусственных тёмных швов и пятен
      if (img) g.drawImage(img, 0, 0, w, h); else { g.fillStyle = '#dcceb4'; g.fillRect(0, 0, w, h); }
      g.fillStyle = 'rgba(185,150,105,.22)'; g.fillRect(0, 0, w, h);
      // Бесшовные вертикальные декоративные бордюры
      for (let x = 0; x < w; x += 64) {
        g.fillStyle = 'rgba(130,85,50,.18)'; g.fillRect(x, 0, 2, h);
        g.fillStyle = 'rgba(130,85,50,.10)'; g.fillRect(x + 5, 0, 1, h);
      }
      // Ромбический узор с традиционным стилизованным цветком
      for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
        const cx = x + 32, cy = y + 32;
        g.strokeStyle = 'rgba(125,75,40,.24)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(cx, cy - 18); g.lineTo(cx + 15, cy); g.lineTo(cx, cy + 18); g.lineTo(cx - 15, cy); g.closePath(); g.stroke();
        g.fillStyle = 'rgba(155,70,50,.28)';
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * Math.PI * 2;
          g.beginPath(); g.ellipse(cx + Math.cos(a) * 4.5, cy + Math.sin(a) * 4.5, 3.5, 2.2, a, 0, 7); g.fill();
        }
        g.fillStyle = 'rgba(95,115,65,.28)';
        g.beginPath(); g.ellipse(cx, cy + 9, 2, 5, 0, 0, 7); g.fill();
      }
      speckle(g, w, h, 2000, ['rgba(100,70,40,.12)', 'rgba(255,250,235,.25)'], 1.5);
    }, [2.0, 1.0]));
  }

  // ---------- материалы ----------
  const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: .85, metalness: 0 }, o));
  const repTex = (t, rx, ry) => { const c = t.clone(); c.needsUpdate = true; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); allTex.push(c); return c; };
  // ---------- HD-материалы (ambientCG, CC0): мировая проекция по доминирующей оси — масштаб в метрах, без растяжения на длинных деталях; цвет + нормали + шероховатость ----------
  const hdT = (name, suf, srgb) => { const t = TL.load('assets/tex/hd/' + name + '_' + suf + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  let hdN_ = 0;
  function hdMat(name, { scale = 1, color = 0xffffff, rough = 1, metal = 0, nrm = 1, rotY = 0 } = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const U = { tCol: { value: hdT(name, 'col', true) }, tNrm: { value: hdT(name, 'nrm') }, tRgh: { value: hdT(name, 'rgh') }, hdScale: { value: 1 / scale }, hdN: { value: nrm } };
    m.userData.hdTex = [U.tCol.value, U.tNrm.value, U.tRgh.value];
    m.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW; varying vec3 vHN;').replace('#include <project_vertex>', '#include <project_vertex>\nvHW = (modelMatrix * vec4(transformed, 1.0)).xyz; vHN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vHW; varying vec3 vHN; uniform sampler2D tCol, tNrm, tRgh; uniform float hdScale, hdN;
vec2 hdUV(out vec3 T, out vec3 B, out vec3 N){ vec3 a = abs(vHN);
  if (a.y >= a.x && a.y >= a.z) { T = vec3(1,0,0); B = vec3(0,0,${rotY ? '-1' : '1'}); N = vec3(0, sign(vHN.y), 0); return ${rotY ? 'vHW.zx' : 'vHW.xz'} * hdScale; }
  if (a.x >= a.z) { T = vec3(0,0,-sign(vHN.x)); B = vec3(0,1,0); N = vec3(sign(vHN.x),0,0); return vec2(-sign(vHN.x) * vHW.z, vHW.y) * hdScale; }
  T = vec3(sign(vHN.z),0,0); B = vec3(0,1,0); N = vec3(0,0,sign(vHN.z)); return vec2(sign(vHN.z) * vHW.x, vHW.y) * hdScale; }`)
        .replace('#include <map_fragment>', `vec3 hT, hB, hN; vec2 hUv = hdUV(hT, hB, hN); diffuseColor *= texture2D(tCol, hUv);`)
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = max(roughness * 0.82, roughness * texture2D(tRgh, hUv).g);`)
        .replace('#include <normal_fragment_maps>', `{ vec3 tn = texture2D(tNrm, hUv).xyz * 2.0 - 1.0; tn.xy *= hdN; vec3 nw = normalize(hT * tn.x + hB * tn.y + hN * tn.z); normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }`);
    };
    const key = 'hd' + (++hdN_); m.customProgramCacheKey = () => key; return m; // у каждого свои uniform-текстуры — свой ключ программы
  }
  const MAT = {
    kiosk: hdMat('kiosk', { scale: 1.6, rough: 1, metal: .45 }),
    wallpaper: std({ map: makeWallpaper(null), roughness: .92 }),
    floor: hdMat('floor', { scale: 1.4, rough: .96, nrm: .35, rotY: 1, color: 0xc8a888 }),
    ceiling: hdMat('plaster', { scale: 2.2, color: 0xddd6ca, rough: .94, nrm: 1.15 }),
    roofTin: hdMat('metal', { scale: 1.2, metal: .6, color: 0xb0b0ac }),
    wood: hdMat('panel', { scale: .9, color: 0x9c826a, rough: .96, nrm: .35 }),
    shelf: hdMat('dsp', { scale: .6, rough: .95 }),
    counter: hdMat('counter', { scale: .8, color: 0x8e7258, rough: .92, nrm: .35 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xaac4cc, transparent: true, opacity: .1, roughness: .05, metalness: .1, depthWrite: false }),
    steel: hdMat('metal', { scale: .5, metal: .85, rough: .8, color: 0xc8c8c4 }),
    dark: hdMat('darkmetal', { scale: .5, metal: .4, rough: 1 }),
    rust: std({ map: TX.rust, roughness: .8, metalness: .25 }),
    concrete: std({ color: 0x8b8880 }), bin: hdMat('bin', { scale: .9, metal: .5 }),
    lampHead: std({ color: 0x333, emissive: 0xffc070, emissiveIntensity: 0 }),
    bulb: std({ color: 0xffe4b5, emissive: 0xffb858, emissiveIntensity: 1.5 }),
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
  const hemi = new THREE.HemisphereLight(0x94adc2, 0x5a5448, .85); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2e2, 2.4);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = .04;
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 150 });
  scene.add(sun); scene.add(sun.target);
  // Реалистичный тёплый направленный свет в ларьке с быстрыми 2D-тенями (SpotLight вместо 6-проходного кубического PointLight)
  const kioskSpot = new THREE.SpotLight(0xffa63c, 1.75, 4.5, Math.PI * 0.43, 0.72, 1.9);
  kioskSpot.position.set(0, 2.24, -.1);
  kioskSpot.target.position.set(0, 0, -.1);
  scene.add(kioskSpot); scene.add(kioskSpot.target);
  kioskSpot.castShadow = true;
  kioskSpot.shadow.mapSize.set(512, 512);
  kioskSpot.shadow.bias = -0.0015;
  kioskSpot.shadow.normalBias = 0.02;
  kioskSpot.shadow.camera.near = 0.15;
  kioskSpot.shadow.camera.far = 4.2;

  const bulbLight = new THREE.PointLight(0xff9e32, 0.58, 3.6, 2.1);
  bulbLight.position.set(0, 2.22, -.1); scene.add(bulbLight);
  bulbLight.castShadow = false;

  // Приглушённая мягкая подсветка потолка от тусклой лампы накаливания
  const ceilingBounce = new THREE.PointLight(0xffb878, 0.62, 3.1, 2.0);
  ceilingBounce.position.set(0, 2.12, -.1); if (!LITE) scene.add(ceilingBounce); // на слабых GPU — без «отражённого» света
  ceilingBounce.castShadow = false;

  const fillLight = new THREE.PointLight(0xffb880, 0.32, 2.8, 2.1);
  fillLight.position.set(0, 1.0, .2); if (!LITE) scene.add(fillLight);
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
  const groundSnow = plane(540, 380, std({ map: repTex(TX.snow, 110, 80), roughness: .95 }), -177, 0, 0); winterGround.push(groundSnow);
  const groundDirt = plane(540, 380, std({ map: repTex(TX.asphalt, 100, 70), color: 0x8a8678 }), -177, -.001, 0); summerGround.push(groundDirt);
  const road = plane(560, 8, std({ map: repTex(TX.road, 112, 1.6), roughness: .9 }), -175, .012, 10.2);
  for (const z of [6.55, 13.85]) { const ds = plane(560, .9, std({ map: repTex(TX.dirtySnow, 120, 1), transparent: true, opacity: .95, roughness: .95 }), -175, .02, z); if (z > 10) ds.rotation.z = Math.PI; winterGround.push(ds); }
  const walk = plane(560, 4.9, std({ map: repTex(TX.snow, 120, 1.2), color: 0xb9bcbe }), -175, .008, 3.75); winterGround.push(walk);
  const walkS = plane(560, 4.9, std({ map: repTex(TX.asphalt, 120, 1.2), color: 0xa09c94 }), -175, .007, 3.75); summerGround.push(walkS);
  winterGround.push(road);
  // ---------- бесснежные сезоны: PBR-текстуры ambientCG (CC0) — изношенный асфальт, тротуары, двор (земля с травой), бетон ----------
  const pbrT = (name, rx, ry) => { const ld = (suf, srgb) => { const t = TL.load('assets/tex/pbr/' + name + '_' + suf + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = Q.aniso || 4; return regTex(t); };
    return { map: ld('col', true), normalMap: ld('nrm'), roughnessMap: ld('rgh') }; };
  Object.assign(groundDirt.material, pbrT('ground', 140, 120), { color: new THREE.Color(0xffffff), roughness: 1 }); groundDirt.material.needsUpdate = true;
  const roadS = plane(560, 8, std({ ...pbrT('road', 112, 2), roughness: 1 }), -175, .012, 10.2); summerGround.push(roadS);
  Object.assign(walkS.material, pbrT('walk', 120, 1.5), { color: new THREE.Color(0xb8b4ac), roughness: 1 }); walkS.material.needsUpdate = true;
  // северный тротуар (вдоль домов за дорогой)
  const walkN = plane(560, 4.1, walk.material, -175, .008, 16.3); winterGround.push(walkN);
  const walkNS = plane(560, 4.1, walkS.material, -175, .007, 16.3); summerGround.push(walkNS);
  const curbMat = std({ ...pbrT('concrete', 140, 1), color: 0xc8c4bc, roughness: 1 });
  box(560, .15, .25, curbMat, -175, .075, 6.25, scene, false); box(560, .15, .25, curbMat, -175, .075, 14.15, scene, false); box(560, .1, .15, curbMat, -175, .05, 18.4, scene, false);
  // ливнёвки: чугунные решётки в лотке у бордюра + водоприёмник в бордюре (советский образец), шаг ~16 м
  { const grTex = regTex(ctex(128, 64, (g, w, h) => { g.fillStyle = '#1a1816'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a4540'; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5); g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
      for (let x = 12; x < w - 6; x += 11) g.fillRect(x, 5, 4, h - 10); g.fillStyle = '#5a5249'; g.font = '700 9px Arial'; for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${120 + Math.random() * 60},${60 + Math.random() * 30},30,.35)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }));
    const grMat = std({ map: grTex, roughness: .6, metalness: .6 }), grGeo = new THREE.PlaneGeometry(.8, .4); grGeo.rotateX(-Math.PI / 2);
    const inletGeo = new THREE.PlaneGeometry(.8, .1), inletMat = std({ color: 0x0a0a0a, roughness: 1 });
    const pos = []; for (let x = -430; x < 84; x += 16) { if (Math.abs(x + 2) < 4 || Math.abs(x - (-334)) < 6) continue; pos.push([x, 6.55, 0]); pos.push([x + 8, 13.85, Math.PI]); }
    const gi = new THREE.InstancedMesh(grGeo, grMat, pos.length), ii = new THREE.InstancedMesh(inletGeo, inletMat, pos.length), M4 = new THREE.Matrix4(), Qn = new THREE.Quaternion();
    pos.forEach(([x, z, r], i) => { gi.setMatrixAt(i, M4.compose(new THREE.Vector3(x, .018, z), Qn.setFromEuler(new THREE.Euler(0, r, 0)), new THREE.Vector3(1, 1, 1))); ii.setMatrixAt(i, M4.compose(new THREE.Vector3(x, .07, z + (r ? .23 : -.23)), Qn.setFromEuler(new THREE.Euler(0, r, 0)), new THREE.Vector3(1, 1, 1))); });
    gi.receiveShadow = true; scene.add(gi, ii); drainSpots.push(...pos); }
  const lineMat = std({ color: 0xc9c4b0, roughness: .9 });
  for (let x = -436; x < 84; x += 6) plane(3, .14, lineMat, x, .016, 10.2);
  { const zm = std({ color: 0xc9c4b0, roughness: .9, transparent: true, opacity: .75 }); for (let i = 0; i < 8; i++) plane(4, .5, zm, -2, .017, 6.75 + i * 1); } // «зебра»: полосы вдоль движения машин, чередуются поперёк дороги

  // ---------- сугробы: валы вдоль дороги после грейдера, наносы у стен ----------
  const driftMat = std({ color: 0xf4f6f9, roughness: .95 }); const driftGeos = [];
  function drift(x1, z1, x2, z2, w, h, seed = 0) { // вытянутый холм с неровным гребнем
    const L = Math.hypot(x2 - x1, z2 - z1); if (L < .6) return; const nx = Math.max(4, Math.round(L / .8)), g = new THREE.PlaneGeometry(L, w, nx, 6); g.rotateX(-Math.PI / 2);
    const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const u = P.getX(i) / L + .5, v = P.getZ(i) / w * 2; const ends = clamp(Math.min(u, 1 - u) * L / (w * .9), 0, 1); const n = .75 + .25 * Math.sin(u * L * 1.3 + seed) * Math.sin(u * L * .37 + seed * 2.1);
      P.setY(i, Math.max(0, h * Math.pow(Math.max(0, 1 - v * v), .8) * Math.pow(ends, .6) * n)); P.setZ(i, P.getZ(i) * (1 + .15 * Math.sin(u * L * .9 + seed))); }
    g.computeVertexNormals(); g.rotateY(-Math.atan2(z2 - z1, x2 - x1)); g.translate((x1 + x2) / 2, .01, (z1 + z2) / 2); driftGeos.push(g); }
  // Притоптанный снег: серые утоптанные тропинки со следами от подъездов к тротуарам и у мест, где стоят люди,
  // плюс неровные бугры во дворах — снег не лежит ровной скатертью. Только зимой (winterGround).
  function trampleSnow() {
    const tex = regTex(ctex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { const x = w / 2 + (Math.random() - .5) * w * .9, y = h / 2 + (Math.random() - .5) * h * .9, r = 3 + Math.random() * 10, d = Math.hypot(x - w / 2, y - h / 2) / (w / 2);
        g.fillStyle = `rgba(${150 + Math.random() * 40},${155 + Math.random() * 40},${165 + Math.random() * 35},${.12 * Math.max(0, 1 - d * d)})`; g.beginPath(); g.ellipse(x, y, r, r * .6, Math.random() * 3, 0, 7); g.fill(); }
      for (let i = 0; i < 26; i++) { const x = w * .3 + Math.random() * w * .4, y = 20 + Math.random() * (h - 40), a = (Math.random() - .5) * .5; // отпечатки подошв вдоль тропы
        g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = 'rgba(95,104,118,.32)'; g.beginPath(); g.ellipse(0, 0, 5, 11, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(95,104,118,.22)'; g.fillRect(-4, 12, 8, 6); g.restore(); } }));
    const mat = std({ map: tex, transparent: true, depthWrite: false, roughness: .8, polygonOffset: true, polygonOffsetFactor: -1 });
    const geo = new THREE.PlaneGeometry(1.5, 2.6); geo.rotateX(-Math.PI / 2);
    const spots = [];
    const track = (x1, z1, x2, z2) => { const d = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(d / 2.1); for (let i = 0; i <= n; i++) { const t = i / n; spots.push([x1 + (x2 - x1) * t + R(-.3, .3), z1 + (z2 - z1) * t + R(-.3, .3), Math.atan2(x2 - x1, z2 - z1) + R(-.25, .25), R(.8, 1.15)]); } };
    track(-6, 1.1, -10, -28); track(4, 1.1, 2, -30); track(14, 1.1, 18, -26); track(-30, 18.6, -30, 24); track(28, 18.6, 30, 24); track(-14, 18.6, -18, 24); track(-40, 1.1, -52, -10); track(40, 1.1, 58, -6);
    for (const [x, z, n] of [[0, 3.2, 4], [8, 2.4, 4], [-3.6, 3.0, 3], [3.4, 2.9, 3]]) for (let i = 0; i < n; i++) spots.push([x + R(-1.0, 1.0), z + R(-.4, .4), R(0, 6.28), R(.85, 1.15)]); // у ларька и остановки (снаружи)
    const safeSpots = spots.filter(([x, z]) => !(Math.abs(x) < 3.2 && z > -2.8 && z < 2.8));
    const im = new THREE.InstancedMesh(geo, mat, safeSpots.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
    safeSpots.forEach(([x, z, a, k], i) => { q.setFromAxisAngle(up, a); sc.set(k, 1, k); m4.compose(new THREE.Vector3(x, .005, z), q, sc); im.setMatrixAt(i, m4); });
    im.receiveShadow = true; im.renderOrder = 0; im.userData.winter = im.userData.dyn = true; scene.add(im); winterGround.push(im);
    // неровности: невысокие бугры снега во дворах (обходим здания, ларёк, площадки и тропы)
    const bump = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), pts = [];
    const freeAt = (x, z) => !colliders.some(b => x > b.x1 - 1.4 && x < b.x2 + 1.4 && z > b.z1 - 1.4 && z < b.z2 + 1.4) && !safeSpots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 1.6);
    for (let tries = 0; pts.length < 140 && tries < 2000; tries++) { const x = R(-62, 66), z = Math.random() < .5 ? R(-34, .2) : R(19.5, 30); if (Math.abs(x) < 3.6 && z > -3.4 && z < 3.4) continue; if (freeAt(x, z)) pts.push([x, z]); }
    const bm = new THREE.InstancedMesh(bump, driftMat, pts.length);
    pts.forEach(([x, z], i) => { q.setFromAxisAngle(up, R(0, 6.28)); sc.set(R(.6, 1.7), R(.07, .22), R(.5, 1.3)); m4.compose(new THREE.Vector3(x, -.02, z), q, sc); bm.setMatrixAt(i, m4); });
    bm.receiveShadow = true; bm.castShadow = true; bm.userData.winter = bm.userData.dyn = true; scene.add(bm); winterGround.push(bm);
  }
  function flushDrifts() { if (!driftGeos.length) return; const m = new THREE.Mesh(mergeGeometries(driftGeos.map(g => { g.deleteAttribute('uv'); return g; })), driftMat); m.receiveShadow = true; m.castShadow = true; m.userData.winter = true; m.userData.dyn = true; scene.add(m); winterGround.push(m); driftGeos.length = 0; return m; }
  { const gaps = [[-342, -322], [-6, 2], [3, 13.5]]; // остановка «Завод» и проходная, «зебра», остановка «Ларёк»
    let x = -434; while (x < 86) { const L = R(9, 18); let a = x, b = Math.min(86, x + L); const gp = gaps.find(([g1, g2]) => b > g1 && a < g2); if (gp) { if (a < gp[0]) drift(a, 5.85, gp[0] - .4, 5.85, 1.1, .38, x); x = gp[1] + .4; continue; } drift(a, 5.85 + R(-.1, .1), b, 5.85 + R(-.1, .1), R(.9, 1.2), R(.3, .45), x); x = b + R(.8, 2.5); }
    x = -434; while (x < 86) { const L = R(10, 22); const a = x, b = Math.min(86, x + L); if (!(b > -6 && a < 2)) drift(a, 14.6 + R(-.1, .1), b, 14.6 + R(-.1, .1), R(1, 1.4), R(.35, .55), x + 3); x = b + R(1, 3); }
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
  drift(KW + .98, -KD + .3, KW + .98, KD - .3, .55, .36, 1); drift(-KW - .98, -KD + .3, -KW - .98, KD - .3, .55, .34, 2); flushDrifts(); // наносы снаружи у боковых стен ларька (не заходят внутрь)
  // Наружные материалы киоска «Союзпечать» (по референсу 5731.jpg):
  // Рифлёные сине-белые металлические панели по всему наружному периметру
  const soyuzStripesTex = regTex(ctex(256, 256, (g, w, h) => {
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 === 0 ? '#1b4c7c' : '#f0ece2';
      g.fillRect(i * 16, 0, 16, h);
    }
    g.strokeStyle = 'rgba(20,40,70,.28)'; g.lineWidth = 1;
    for (let i = 0; i < 16; i++) g.strokeRect(i * 16, 0, 16, h);
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 6, w, 6);
  }));
  const MAT_SOYUZ_EXT = std({ map: soyuzStripesTex, roughness: .50, metalness: .35 });
  const MAT_SOYUZ_BLUE = std({ color: 0x164270, roughness: .40, metalness: .55 });

  const wm = inner => [0, 1, 2, 3, 4, 5].map(i => i === inner ? MAT.wallpaper : MAT_SOYUZ_EXT);
  const kioskWalls = [];
  const kw = (...a) => { const m = box(...a); kioskWalls.push(m); occ(m); return m; };
  kw(1.9, KH, T_, wm(4), -.55, KH / 2, -KD, K); kw(.3, KH, T_, wm(4), 1.35, KH / 2, -KD, K); kw(.8, KH - 2.04, T_, wm(4), .8, 2.04 + (KH - 2.04) / 2, -KD, K);
  kw(KW * 2, 1.0, T_, wm(5), 0, .5, KD, K); kw(KW * 2, KH - 2.15, T_, wm(5), 0, 2.15 + (KH - 2.15) / 2, KD, K);
  kw(.15, 1.15, T_, wm(5), -1.425, 1.575, KD, K); kw(.15, 1.15, T_, wm(5), 1.425, 1.575, KD, K);
  kw(T_, KH, KD * 2, wm(0), -KW, KH / 2, 0, K); kw(T_, KH, KD * 2, wm(1), KW, KH / 2, 0, K);

  // Тёмный защитный цоколь-плинтус по всему периметру киоска
  const plinthM = std({ color: 0x181a1c, roughness: .85, metalness: .3 });
  box(KW * 2 + .08, .08, .06, plinthM, 0, .04, KD + .02, K);
  box(KW * 2 + .08, .08, .06, plinthM, 0, .04, -KD - .02, K);
  box(.06, .08, KD * 2 + .08, plinthM, -KW - .02, .04, 0, K);
  box(.06, .08, KD * 2 + .08, plinthM, KW + .02, .04, 0, K);
  box(KW * 2 + .3, .1, KD * 2 + .3, MAT.roofTin, 0, KH + .05, 0, K);
  // потолок: старая побелка с трещинами и отслоившейся штукатуркой (фото пользователя)
  const ceilMat = std({ color: 0xd8d2c6, roughness: .95 });
  TL.load('assets/tex/ceiling_crack.jpg', t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Q.aniso; ceilMat.map = t; ceilMat.color.set(0xffffff); ceilMat.needsUpdate = true; }, undefined, () => {});
  box(KW * 2 - .02, .02, KD * 2 - .02, ceilMat, 0, KH - .01, 0, K, false);
  // потолочный карниз убран: стена переходит в потолок ровным углом с мягким затенением
  // Мягкая градиентная тень (Ambient Occlusion) вдоль верхнего края обоев под потолком и в углах стен
  {
    const aoWallTex = regTex(ctex(64, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(18, 12, 6, 0.42)');
      gr.addColorStop(0.28, 'rgba(24, 16, 8, 0.20)');
      gr.addColorStop(0.65, 'rgba(30, 20, 10, 0.08)');
      gr.addColorStop(1, 'rgba(30, 20, 10, 0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }));
    const aoWallMat = new THREE.MeshBasicMaterial({ map: aoWallTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const addWallAO = (w, h, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), aoWallMat);
      m.position.set(x, y, z); m.rotation.y = ry; m.userData.keep = true; K.add(m);
    };
    addWallAO(KW * 2 - .06, .26, 0, KH - .16, -KD + .032, 0);
    addWallAO(KW * 2 - .06, .26, 0, KH - .16, KD - .032, Math.PI);
    addWallAO(KD * 2 - .06, .26, -KW + .032, KH - .16, 0, Math.PI / 2);
    addWallAO(KD * 2 - .06, .26, KW - .032, KH - .16, 0, -Math.PI / 2);
    // то же затенение со стороны потолка: угол стена/потолок мягкий, без ступеньки
    const addCeilAO = (w, d, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), aoWallMat); m.rotation.order = "YXZ"; m.rotation.set(Math.PI / 2, ry, 0); m.position.set(x, KH - .022, z); m.userData.keep = true; K.add(m); };
    addCeilAO(KW * 2 - .04, .3, 0, -KD + .17, Math.PI); addCeilAO(KW * 2 - .04, .3, 0, KD - .17, 0);
    addCeilAO(KD * 2 - .04, .3, -KW + .17, 0, -Math.PI / 2); addCeilAO(KD * 2 - .04, .3, KW - .17, 0, Math.PI / 2);
  }
  box(KW * 2 - .04, .03, KD * 2 - .04, MAT.floor, 0, .02, 0, K, false);
  // коллизии стен с дверным проёмом x 0.4..1.2
  addCol(-KW - .04, .4, -KD - .04, -KD + .04); addCol(1.2, KW + .04, -KD - .04, -KD + .04);
  addCol(-KW - .04, KW + .04, KD - .04, KD + .04); addCol(-KW - .04, -KW + .04, -KD, KD); addCol(KW - .04, KW + .04, -KD, KD);
  const doorCol = addCol(.4, 1.2, -KD - .05, -KD + .05, 'door');
  const counterCol = addCol(-KW, KW, KD - .48, KD, 'counter');
  addCol(-KW, .3, -KD, -KD + .34, 'shelf'); addCol(-KW, -KW + .3, -KD, .45, 'shelf');
  // КИОСК «СОЮЗПЕЧАТЬ» (по референсу 5731.jpg)
  // 1) Крыша: плоский советский козырёк с белой металлической фаской
  const canopyMat = std({ color: 0xedeae2, roughness: .45, metalness: .3 });
  box(KW * 2 + .42, .08, KD * 2 + .45, canopyMat, 0, KH + .05, .08, K);
  const roofSnow = box(KW * 2 + .44, .08, KD * 2 + .46, MAT.snow, 0, KH + .13, .08, K, false); roofSnow.userData.winter = true;

  // 2) Вывеска «Союзпечать»: тёмно-синяя эмалированная табличка с белым курсивом
  const signTex = regTex(ctex(512, 128, (g, w, h) => {
    g.fillStyle = '#144275'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f4efe4'; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#f8f5ee';
    g.font = 'italic 700 64px "Times New Roman", Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Союзпечать', w / 2, h / 2 + 2);
    speckle(g, w, h, 600, ['#0003', '#fff2'], 2);
  }));
  const signBox = box(1.78, .30, .08, std({ color: 0x144275, roughness: .4, metalness: .3 }), 0, KH + .23, KD + .22, K);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.75, .28), std({ map: signTex, emissive: 0x144275, emissiveMap: signTex, emissiveIntensity: .35 }));
  sign.position.set(0, KH + .23, KD + .265); K.add(sign);

  // 3) Птичка-снегирь на крыше на вывеске «Союзпечать» (по референсу 5731.jpg)
  const bird = new THREE.Group(); bird.position.set(0.14, KH + .41, KD + .22); K.add(bird);
  const birdBreast = new THREE.Mesh(new THREE.SphereGeometry(.026, 8, 8), std({ color: 0xd62e1c, roughness: .75 }));
  birdBreast.scale.set(1.0, 1.2, 1.15); bird.add(birdBreast);
  const birdBack = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 8), std({ color: 0x181615, roughness: .7 }));
  birdBack.scale.set(.95, 1.15, .7); birdBack.position.set(0, .005, -.012); bird.add(birdBack);
  const birdHead = new THREE.Mesh(new THREE.SphereGeometry(.016, 8, 8), std({ color: 0x12100e, roughness: .6 }));
  birdHead.position.set(0, .026, .012); bird.add(birdHead);
  const birdBeak = new THREE.Mesh(new THREE.ConeGeometry(.0045, .012, 5), std({ color: 0x22201e, roughness: .5 }));
  birdBeak.rotation.x = Math.PI / 2; birdBeak.position.set(0, .026, .027); bird.add(birdBeak);
  const birdTail = new THREE.Mesh(new THREE.BoxGeometry(.015, .004, .042), std({ color: 0x141210, roughness: .7 }));
  birdTail.position.set(0, -.016, -.034); birdTail.rotation.x = .4; bird.add(birdTail);
  const birdWingL = new THREE.Mesh(new THREE.BoxGeometry(.006, .028, .036), std({ color: 0x161412, roughness: .7 }));
  birdWingL.position.set(-.022, .004, -.008); birdWingL.rotation.y = .15; bird.add(birdWingL);
  const birdWingR = new THREE.Mesh(new THREE.BoxGeometry(.006, .028, .036), std({ color: 0x161412, roughness: .7 }));
  birdWingR.position.set(.022, .004, -.008); birdWingR.rotation.y = -.15; bird.add(birdWingR);
  // Ножки-проволочки, держащиеся за верх вывески
  cyl(.0018, .0018, .022, MAT.dark, -.008, -.026, 0, 4, bird);
  cyl(.0018, .0018, .022, MAT.dark, .008, -.026, 0, 4, bird);

  // 4) Нижний фасад киоска: вертикальные сине-белые рифлёные полосы (как на референсе 5731.jpg)
  // накладка-«юбка» убрана: стена уже в полоску, плоскость поверх неё мерцала (z-fighting)
  // Горизонтальный защитный поручень/рейка вдоль низа витрины (как на референсе)
  cyl(.012, .012, KW * 2 + .06, std({ color: 0x225588, metalness: .7, roughness: .35 }), 0, .72, KD + .042, 8, K).rotation.z = Math.PI / 2;

  // плакаты-стеллажи внутри витрины убраны: они пересекались со стеклянными полками и товаром

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
  // Боковые глухие стёкла витрины и центральное глухое стекло над окошком выдачи
  for (const [gx, gy, gw, gh] of [
    [-.977, 1.575, .91, 1.15],
    [ .977, 1.575, .91, 1.15],
    [ 0,    1.765, .95, .77]
  ]) {
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), winGlassMat);
    gm.position.set(gx, gy, KD + .012); gm.renderOrder = 2; gm.userData.keep = true; K.add(gm);
  }
  const alu = std({ color: 0x1b4c7c, roughness: .40, metalness: .55 }); // Тёмно-синяя эмаль Союзпечати
  box(2.96, .05, .07, alu, 0, 2.15, KD + .01, K); box(2.96, .05, .08, alu, 0, 1.005, KD + .01, K); // рама сверху и снизу
  for (const x of [-1.455, -.5, .5, 1.455]) box(.045, 1.15, .07, alu, x, 1.575, KD + .01, K); // стойки (по центру — окошко выдачи)
  box(.95, .03, .05, alu, 0, 1.38, KD + .015, K); // перемычка над окошком
  // Подвижное окошко выдачи товара (поднимается вверх по полозьям и опускается вниз)
  let hatchOpen = 0, hatchTarget = 0, hatchAutoTimer = 0;
  const hatchGroup = new THREE.Group();
  hatchGroup.position.set(0, 1.19, KD + .018);
  hatchGroup.userData = { keep: true, dyn: true };
  K.add(hatchGroup);
  // Стекло окошка выдачи в тонкой металлической рамке с ручкой-планкой снизу
  const hatchPane = new THREE.Mesh(new THREE.PlaneGeometry(.92, .33), winGlassMat);
  hatchPane.renderOrder = 3; hatchPane.userData.keep = true; hatchGroup.add(hatchPane);
  const hatchFrameMat = std({ color: 0x245688, roughness: .35, metalness: .65 });
  const hatchHandleMat = std({ color: 0x3b2818, roughness: .55, metalness: .15 });
  box(.95, .022, .026, hatchFrameMat, 0,  .17, 0, hatchGroup, false);
  box(.95, .024, .028, hatchFrameMat, 0, -.17, 0, hatchGroup, false);
  box(.022, .36, .026, hatchFrameMat, -.465, 0, 0, hatchGroup, false);
  box(.022, .36, .026, hatchFrameMat,  .465, 0, 0, hatchGroup, false);
  // Ручка для поднятия и опускания окошка (изнутри и снаружи)
  box(.18, .018, .038, hatchHandleMat, 0, -.145, -.016, hatchGroup, false);
  box(.18, .018, .038, hatchHandleMat, 0, -.145,  .016, hatchGroup, false);
  const hatchBox = new THREE.Box3(new THREE.Vector3(-.48, 1.01, KD - .12), new THREE.Vector3(.48, 1.56, KD + .12));
  function toggleHatch(forceState = null) {
    hatchTarget = forceState != null ? (forceState ? 1 : 0) : (hatchTarget > .5 ? 0 : 1);
    ctx.audio && ctx.audio.click(hatchTarget > .5 ? 640 : 480, .38, 0, .06);
    ctx.onCtl && ctx.onCtl();
  }
  seasonHooks.push(w => { winGlassMat.map = w ? winTexes.frost : winTexes.dirt; winGlassMat.needsUpdate = true; });
  // прилавок, витрина (с плотным перекрытием всех стыков и глухой тёмной подложкой внутри тумбы, чтобы на стыках не было светлых линий)
  { const nM = std({ color: 0x241911, roughness: .96 }), nB = std({ color: 0x4e3928, roughness: .92 });
    // Глухая тёмная основа под всей столешницей и за передними тумбами прилавка (исключает любые просветы улицы)
    box(2.96, .96, .42, nM, 0, .48, KD - .22, K, false);
    // Столешница прилавка во всю ширину от стены до стены и внешний подоконник у окна выдачи
    box(2.98, .055, .48, MAT.counter, 0, .98, KD - .22, K);
    box(1.0, .04, .25, MAT.counter, 0, .995, KD + .14, K);
    // Передняя панель прилавка с нишей посередине (панели входят друг в друга с нахлёстом без щелей)
    box(.94, .95, .065, MAT.wood, -1.01, .48, KD - .44, K);
    box(.94, .95, .065, MAT.wood,  1.01, .48, KD - .44, K);
    box(1.14, .165, .065, MAT.wood, 0, .88, KD - .44, K);
    box(1.14, .09, .065, MAT.wood, 0, .045, KD - .44, K);
    // Ниша под прилавком: задняя стенка, боковины, полка и дно
    box(1.12, .86, .03, nM, 0, .48, KD - .06, K, false);
    box(.03, .86, .40, nM, -.55, .48, KD - .25, K, false);
    box(.03, .86, .40, nM,  .55, .48, KD - .25, K, false);
    box(1.10, .024, .39, nB, 0, .41, KD - .25, K);
    box(1.10, .024, .39, nB, 0, .09, KD - .25, K);
  }
  { const shelfGlass = new THREE.MeshPhysicalMaterial({ color: 0xcfe6df, roughness: .08, metalness: 0, transparent: true, opacity: .42, depthWrite: false, clearcoat: 1, clearcoatRoughness: .05 }), edge = std({ color: 0x5f9a86, roughness: .15, transparent: true, opacity: .85 }), chrome = std({ color: 0xd0d2d0, roughness: .2, metalness: 1 });
    for (const y of [1.36, 1.76]) for (const sx of [-1, 1]) { const x = sx * .9; // стекло 8 мм с зелёной кромкой и хромированными держателями
      const gsh = box(.86, .008, .24, shelfGlass, x, y, KD - .155, K, false); gsh.renderOrder = 3; // стекло за рамой витрины, без пересечения со стойками
      box(.86, .012, .006, edge, x, y, KD - .272, K, false); box(.86, .012, .006, edge, x, y, KD - .038, K, false); box(.006, .012, .24, edge, x - .43, y, KD - .155, K, false); box(.006, .012, .24, edge, x + .43, y, KD - .155, K, false);
      for (const dx of [-.4, .4]) for (const dz of [-.25, -.06]) { box(.02, .022, .02, chrome, x + dx, y - .012, KD + dz, K, false); } }
    for (const sx of [-1, 1]) for (const ox of [.47, 1.33]) for (const dz of [-.25, -.06]) cyl(.006, .006, 1.13, chrome, sx * ox, 1.575, KD + dz, 8, K); } // стойки витрины
  const stool = new THREE.Group(); K.add(stool); stool.position.set(0, 0, .25); stool.userData.dyn = true; // временная табуретка до загрузки модели стула — не сливать с батчами
  cyl(.19, .19, .05, MAT.wood, 0, .62, 0, 16, stool);
  for (let a = 0; a < 3; a++) { const l = cyl(.018, .018, .62, MAT.steel, Math.cos(a * 2.1) * .14, .31, Math.sin(a * 2.1) * .14, 6, stool); l.rotation.z = Math.cos(a * 2.1) * .12; l.rotation.x = -Math.sin(a * 2.1) * .12; }
  // Советская «лампочка Ильича» на чёрном витом шнуре: патрон из карболита, каплевидная стеклянная колба и светящаяся вольфрамовая спираль
  cyl(.003, .003, .22, MAT.dark, 0, 2.39, -.1, 6, K); // шнур
  cyl(.022, .018, .048, MAT.dark, 0, 2.30, -.1, 10, K); // патрон
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.036, 12, 10), MAT.bulb);
  bulb.scale.set(1, 1.35, 1); bulb.position.set(0, 2.22, -.1); K.add(bulb);
  const filament = new THREE.Mesh(new THREE.TorusGeometry(.010, .002, 6, 12), std({ color: 0xffe888, emissive: 0xffd244, emissiveIntensity: 4 }));
  filament.position.set(0, 2.22, -.1); filament.rotation.x = Math.PI / 2; K.add(filament);

  // Рой анимированных мух вокруг лампочки и под потолком ларька
  const kioskFlies = [];
  const flyBodyGeo = new THREE.SphereGeometry(0.0035, 6, 4);
  const flyWingGeo = new THREE.PlaneGeometry(0.0055, 0.003);
  const flyMat = new THREE.MeshBasicMaterial({ color: 0x181410 });
  const flyWingMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const fg = new THREE.Group();
    fg.userData = {
      keep: true, dyn: true,
      radius: 0.12 + (i % 4) * 0.075 + (i * 0.03),
      baseY: 2.16 + (i % 3) * 0.06,
      speed: (3.2 + (i * 0.6)) * (i % 2 === 0 ? 1 : -1),
      angle: (i / 7) * Math.PI * 2,
      flutter: i * 2.3,
      cx: (i % 2 === 0 ? 0.04 : -0.04),
      cz: -0.1 + (i % 3 === 0 ? 0.05 : -0.04)
    };
    const body = new THREE.Mesh(flyBodyGeo, flyMat); fg.add(body);
    const wL = new THREE.Mesh(flyWingGeo, flyWingMat); wL.position.set(-0.003, 0.002, 0); wL.rotation.y = 0.25; fg.add(wL);
    const wR = new THREE.Mesh(flyWingGeo, flyWingMat); wR.position.set(0.003, 0.002, 0); wR.rotation.y = -0.25; fg.add(wR);
    fg.position.set(
      fg.userData.cx + Math.cos(fg.userData.angle) * fg.userData.radius,
      fg.userData.baseY,
      fg.userData.cz + Math.sin(fg.userData.angle) * fg.userData.radius
    );
    K.add(fg);
    kioskFlies.push(fg);
  }
  function kioskFliesTick(dt) {
    for (let i = 0; i < kioskFlies.length; i++) {
      const fg = kioskFlies[i];
      const u = fg.userData;
      u.angle += u.speed * dt;
      u.flutter += dt * 40.0;
      const r = u.radius + Math.sin(u.flutter * 0.4) * 0.035;
      const x = u.cx + Math.cos(u.angle) * r;
      const z = u.cz + Math.sin(u.angle) * r;
      const y = u.baseY + Math.sin(u.flutter * 0.6 + i) * 0.03;
      fg.position.set(x, y, z);
      fg.rotation.y = -u.angle + (u.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }

  // Липкая лента от мух в углу ларька
  {
    const tapeStrip = new THREE.Group();
    tapeStrip.position.set(KW - 0.15, 2.39, -0.6);
    tapeStrip.userData.dyn = true;
    const tapeMat = std({ color: 0x96723b, roughness: 0.2, metalness: 0.1 });
    for (let s = 0; s < 12; s++) {
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.032), tapeMat);
      seg.position.y = -s * 0.028;
      seg.rotation.y = s * 0.55;
      tapeStrip.add(seg);
      if (s % 2 === 0) {
        const stuckFly = new THREE.Mesh(new THREE.SphereGeometry(0.003, 4, 4), MAT.dark);
        stuckFly.position.set(0.012 * (s % 4 === 0 ? 1 : -1), -s * 0.028, 0.002);
        tapeStrip.add(stuckFly);
      }
    }
    K.add(tapeStrip);
  }

  // Стакан и чеки убраны со стола по запросу игрока

  // Паутина по углам ларька
  {
    const webTex = regTex(ctex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(235, 235, 235, 0.55)';
      g.lineWidth = 1.2;
      for (let a = 0; a <= Math.PI / 2; a += 0.14) {
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * w * 1.1, Math.sin(a) * h * 1.1); g.stroke();
      }
      for (let r = 25; r < w; r += 28) {
        g.beginPath();
        for (let a = 0; a <= Math.PI / 2; a += 0.05) {
          const sag = Math.sin(a * 4.0) * 3.5;
          const px = Math.cos(a) * (r + sag);
          const py = Math.sin(a) * (r + sag);
          if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.stroke();
      }
    }));
    const webMat = new THREE.MeshBasicMaterial({ map: webTex, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
    const web1 = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), webMat);
    web1.position.set(-KW + 0.16, 2.22, -KD + 0.16);
    web1.rotation.x = Math.PI / 2;
    K.add(web1);
    const web2 = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), webMat);
    web2.position.set(KW - 0.14, 2.24, -KD + 0.14);
    web2.rotation.x = Math.PI / 2;
    web2.rotation.z = Math.PI / 2;
    K.add(web2);
  }
  // календарь, плакат и настенные часы на правой стене (рядом с ружьём)
  const calTex = regTex(ctex(512, 680, () => {}));
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(.40, .53), std({ map: calTex, roughness: .82 })); cal.position.set(KW - .034, 1.24, .56); cal.rotation.y = -Math.PI / 2; cal.userData.dyn = true; K.add(cal);
  const calBox = new THREE.Box3(new THREE.Vector3(KW - .12, .96, .34), new THREE.Vector3(KW + .04, 1.52, .78));
  const posterTex = regTex(ctex(256, 360, (g, w, h) => {
    g.fillStyle = '#1b1b24'; g.fillRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h * .4, 10, w / 2, h * .4, 160); gr.addColorStop(0, '#c0392b'); gr.addColorStop(1, '#1b1b24'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2e6c9'; g.font = '900 34px Arial'; g.textAlign = 'center'; g.fillText('ГРУППА', w / 2, 60); g.font = '900 38px Arial'; g.fillText('«КИНОПЛЁНКА»', w / 2, 110); g.font = '700 22px Arial'; g.fillText('ТУР 1992', w / 2, h - 40);
    g.fillStyle = '#0008'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(50 + i * 52, 210, 26, 0, 7); g.fill(); } speckle(g, w, h, 3000, ['#0003', '#fff2'], 2);
  }));
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(.45, .63), std({ map: posterTex })); poster.position.set(KW - .035, 1.55, -.55); poster.rotation.y = -Math.PI / 2; K.add(poster); poster.visible = false; // заменён советскими плакатами пользователя
  // Настенные кварцевые часы на правой стене (рядом с ружьём и над календарём)
  const clockDialTex = regTex(ctex(512, 512, (g, w, h) => {
    const cx = w / 2, cy = h / 2, r = w * .45;
    g.fillStyle = '#f3efe2'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    const gr = g.createRadialGradient(cx, cy, r * .1, cx, cy, r);
    gr.addColorStop(0, 'rgba(255,252,242,0)'); gr.addColorStop(.85, 'rgba(210,198,172,.18)'); gr.addColorStop(1, 'rgba(90,75,55,.45)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2 - Math.PI / 2;
      const maj = i % 5 === 0;
      const r1 = r * (maj ? .81 : .86), r2 = r * .92;
      g.strokeStyle = maj ? '#1d1b18' : '#5a554c';
      g.lineWidth = maj ? 6 : 2.2;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke();
    }
    g.fillStyle = '#1a1815'; g.font = '900 42px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let n = 1; n <= 12; n++) {
      const a = n / 12 * Math.PI * 2 - Math.PI / 2;
      g.fillText(String(n), cx + Math.cos(a) * r * .67, cy + Math.sin(a) * r * .67 + 2);
    }
    g.fillStyle = '#4a453d'; g.font = '700 20px Arial, sans-serif'; g.fillText('КВАРЦ', cx, cy - r * .30);
    g.font = '700 14px Arial, sans-serif'; g.fillText('СДЕЛАНО В СССР', cx, cy + r * .34);
  }));
  const wallClock = new THREE.Group(); wallClock.userData.dyn = true;
  wallClock.position.set(KW - .038, 1.78, .56); wallClock.rotation.y = -Math.PI / 2; K.add(wallClock);
  const wcRim = new THREE.Mesh(new THREE.CylinderGeometry(.175, .182, .038, 32), std({ color: 0x4a2c18, roughness: .42, metalness: .15 }));
  wcRim.rotation.x = Math.PI / 2; wcRim.castShadow = true; wallClock.add(wcRim);
  const wcInnerRim = new THREE.Mesh(new THREE.TorusGeometry(.162, .009, 10, 32), std({ color: 0xc8a858, roughness: .28, metalness: .78 }));
  wcInnerRim.position.z = .018; wallClock.add(wcInnerRim);
  const wcFace = new THREE.Mesh(new THREE.CircleGeometry(.158, 32), std({ map: clockDialTex, roughness: .65 }));
  wcFace.position.z = .0195; wallClock.add(wcFace);
  const wcHandMat = std({ color: 0x161616, roughness: .35, metalness: .5 });
  const wcSecMat = std({ color: 0xb82018, roughness: .35, metalness: .3 });
  const clockHourHand = new THREE.Group(); clockHourHand.position.z = .022; wallClock.add(clockHourHand);
  const hhMesh = new THREE.Mesh(new THREE.BoxGeometry(.011, .092, .003), wcHandMat); hhMesh.position.y = .034; clockHourHand.add(hhMesh);
  const clockMinHand = new THREE.Group(); clockMinHand.position.z = .024; wallClock.add(clockMinHand);
  const mhMesh = new THREE.Mesh(new THREE.BoxGeometry(.0075, .132, .003), wcHandMat); mhMesh.position.y = .050; clockMinHand.add(mhMesh);
  const clockSecHand = new THREE.Group(); clockSecHand.position.z = .026; wallClock.add(clockSecHand);
  const shMesh = new THREE.Mesh(new THREE.BoxGeometry(.0032, .145, .002), wcSecMat); shMesh.position.y = .052; clockSecHand.add(shMesh);
  const wcCap = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, .008, 12), std({ color: 0xd4b254, roughness: .25, metalness: .85 }));
  wcCap.rotation.x = Math.PI / 2; wcCap.position.z = .027; wallClock.add(wcCap);
  const wcGlass = new THREE.Mesh(new THREE.CircleGeometry(.16, 28), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .08, metalness: .1, transparent: true, opacity: .18, depthWrite: false }));
  wcGlass.position.z = .029; wallClock.add(wcGlass);
  const clockBox = new THREE.Box3().setFromObject(wallClock).expandByScalar(.06);

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
  const foodGroup = new THREE.Group(); foodGroup.userData.dyn = true; K.add(foodGroup);
  const shelfMat = MAT.shelf;
  // задняя стена (за продавцом): x -1.45..0.3, четыре полки; боковая левая стена: z -0.85..0.4, три полки
  const SH_BACK = [], SH_SIDE = [];
  for (const y of [.75, 1.2, 1.65, 2.05]) { box(1.72, .025, .3, shelfMat, -.57, y, -KD + .17, K); SH_BACK.push(y); }
  box(.025, 1.5, .3, shelfMat, .29, 1.35, -KD + .17, K); box(.025, 1.5, .3, shelfMat, -1.43, 1.35, -KD + .17, K);
  for (const y of [.85, 1.3, 1.75]) { box(.3, .025, 1.2, shelfMat, -KW + .17, y, -.2, K); SH_SIDE.push(y); }

  // ---------- дверь ----------
  const doorPivot = new THREE.Group(); doorPivot.position.set(1.2, 0, -KD); K.add(doorPivot); doorPivot.userData.dyn = true;
  // дверь: ровное крашеное полотно с потёртостями — затёрто у ручки, сбит низ ногами, царапины и сколы до дерева
  const doorTex = regTex(ctex(256, 640, (g, w, h) => {
    g.fillStyle = '#8d8a80'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${R(120, 160) | 0},${R(118, 155) | 0},${R(108, 140) | 0},${R(.05, .14)})`; g.fillRect(R(0, w), R(0, h), R(20, 90), R(10, 60)); } // неровный слой краски
    const wear = (x, y, rx, ry, a) => { const gr = g.createRadialGradient(x, y, 2, x, y, Math.max(rx, ry)); gr.addColorStop(0, `rgba(196,190,176,${a})`); gr.addColorStop(1, 'rgba(196,190,176,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
    wear(w * .88, h * .5, 40, 70, .45); wear(w * .88, h * .5, 18, 30, .35); // затёрто руками у ручки (ручка у свободного края)
    const kick = g.createLinearGradient(0, h * .82, 0, h); kick.addColorStop(0, 'rgba(60,52,44,0)'); kick.addColorStop(1, 'rgba(60,52,44,.55)'); g.fillStyle = kick; g.fillRect(0, 0, w, h); // грязь и удары ногами внизу
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(85,70,52,${R(.35, .7)})`; g.beginPath(); g.ellipse(R(10, w - 10), R(h * .84, h - 6), R(4, 14), R(2, 6), R(0, 3), 0, 7); g.fill(); }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(92,74,54,${R(.4, .8)})`; const x = R(0, w), y = R(0, h); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) g.lineTo(x + R(-6, 6), y + R(-5, 5)); g.fill(); } // сколы до дерева
    g.lineCap = 'round'; for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${R(0, 1) < .5 ? '210,205,192' : '70,64,56'},${R(.15, .45)})`; g.lineWidth = R(.5, 1.6); const x = R(0, w), y = R(0, h), l = R(6, 40), a = R(-.6, .6) + (R(0, 1) < .5 ? 0 : Math.PI / 2); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } // царапины
    stains(g, w, h, 10, 'rgba(70,58,44,'); speckle(g, w, h, 4000, ['rgba(60,50,40,.5)', 'rgba(230,225,212,.4)'], 1.6);
    g.strokeStyle = 'rgba(50,44,38,.5)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3); // торцы краски темнее
  }));
  const doorEdgeM = std({ color: 0x77736a, roughness: .9 });
  const doorOutM = std({ map: doorTex, roughness: .82, metalness: .05 });
  const dTi = doorTex.clone(); dTi.wrapS = THREE.RepeatWrapping; dTi.repeat.x = -1; dTi.offset.x = 1; dTi.needsUpdate = true; regTex(dTi);
  const doorInM = std({ map: dTi, roughness: .82, metalness: .05 });
  const doorMesh = box(.808, 2.05, .054, [doorEdgeM, doorEdgeM, doorEdgeM, doorEdgeM, doorInM, doorOutM], -.4, 1.025, 0, doorPivot);
  // цельная деревянная дверная коробка с притвором, порогом и наличниками с обеих сторон (полностью перекрывает любые щели в косяке двери)
  { const frM = std({ color: 0x6e665c, roughness: .92 });
    const jambM = std({ color: 0x544d44, roughness: .92 });
    // Боковые и верхняя стойки дверной коробки во всю толщину стены + притворный брус (четверть) и порог снизу
    box(.028, 2.06, T_ + .05, jambM, .402, 1.03, -KD, K);
    box(.028, 2.06, T_ + .05, jambM, 1.198, 1.03, -KD, K);
    box(.84, .032, T_ + .05, jambM, .8, 2.048, -KD, K);
    box(.84, .036, T_ + .06, jambM, .8, .018, -KD, K); // порог в дверном проёме (закрывает землю и снег под дверью)
    // Притворные планки внутри проёма (перекрывают зазор по контуру закрытой двери)
    box(.024, 2.05, .022, jambM, .412, 1.025, -KD + .022, K);
    box(.024, 2.05, .022, jambM, 1.188, 1.025, -KD + .022, K);
    box(.82, .024, .022, jambM, .8, 2.038, -KD + .022, K);
    // Наружный и внутренний деревянный наличник вокруг проёма
    for (const fz of [-KD - T_ / 2 - .014, -KD + T_ / 2 + .014]) {
      box(.085, 2.13, .032, frM, .365, 1.065, fz, K);
      box(.085, 2.13, .032, frM, 1.235, 1.065, fz, K);
      box(.96, .085, .032, frM, .8, 2.085, fz, K);
    }
  }
  // советские плакаты пользователя: «Мир и дружба!» на правой стене под ружьём, «Закуска градус крадёт!» на внутренней стороне двери
  { const posterMat = file => { const m = std({ color: 0xffffff, roughness: .78, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); TL.load('assets/tex/' + file, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Q.aniso; m.map = t; m.needsUpdate = true; }, undefined, () => {}); return m; };
    const pMir = new THREE.Mesh(new THREE.PlaneGeometry(.66, .46), posterMat('poster_mir.jpg')); pMir.position.set(KW - .035, 1.12, -.52); pMir.rotation.y = -Math.PI / 2; pMir.receiveShadow = true; K.add(pMir);
    const pZak = new THREE.Mesh(new THREE.PlaneGeometry(.36, .512), posterMat('poster_zakuska.jpg')); pZak.position.set(0, .48, .0295); pZak.receiveShadow = true; doorMesh.add(pZak); }
  // чёрная нажимная ручка на длинной планке с замочной скважиной — с обеих сторон
  const handleM = std({ color: 0x1c1c1e, metalness: .55, roughness: .45 });
  for (const sd of [1, -1]) { box(.045, .2, .012, handleM, -.735, .97, sd * .031, doorPivot); box(.12, .022, .022, handleM, -.69, 1.03, sd * .05, doorPivot); box(.022, .022, .03, handleM, -.735, 1.03, sd * .04, doorPivot); }
  occ(doorMesh);
  let doorOpen = 0, doorTarget = 0;
  addCol(-KW - .05, KW + .05, KD - .02, KD + .06); // перед окном снаружи — стена

  // ---------- товар на витрине (стеклянные полки у окна) и на складских полках (только реально купленный товар!) ----------
  const SLOT_POS = [
    [-1.12, 1.37], [-.68, 1.37], [.68, 1.37], [1.12, 1.37],
    [-1.12, 1.77], [-.68, 1.77], [.68, 1.77], [1.12, 1.77],
    [.88, .995]
  ];
  const shelfGroup = new THREE.Group(); K.add(shelfGroup); shelfGroup.userData.dyn = true;
  const itemProto = {};
  function getItemMesh(id) { return (itemProto[id] || (itemProto[id] = buildItemProto(id))).clone(); }
  function itemMesh(id) { return getItemMesh(id); }

  // Вспомогательные генераторы чётких русских этикеток для упаковок и бутылок
  function packFaceMat(wPx, hPx, bg, border, topBand, title, sub, note, accent = '#b0281c') {
    const tx = regTex(ctex(wPx, hPx, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      if (topBand) { g.fillStyle = topBand; g.fillRect(0, 0, w, Math.round(h * .30)); }
      g.strokeStyle = border; g.lineWidth = Math.max(4, Math.round(w * .03));
      g.strokeRect(4, 4, w - 8, h - 8);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (note) {
        g.fillStyle = topBand ? '#ffffff' : accent;
        g.font = `900 ${Math.round(w * .13)}px Arial, sans-serif`;
        g.fillText(note, w / 2, Math.round(h * .16));
      }
      g.fillStyle = accent;
      g.font = `900 ${Math.round(w * .19)}px Arial, sans-serif`;
      g.fillText(title, w / 2, Math.round(h * .52));
      if (sub) {
        g.fillStyle = '#1e1b18';
        g.font = `900 ${Math.round(w * .12)}px Arial, sans-serif`;
        g.fillText(sub, w / 2, Math.round(h * .80));
      }
    }));
    return std({ map: tx, roughness: .52 });
  }
  function cylWrapMat(bg, border, title, sub, badge, accent = '#b0281c') {
    const tx = regTex(ctex(512, 192, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(5, 5, w - 10, h - 10);
      g.strokeStyle = accent; g.lineWidth = 3; g.strokeRect(15, 15, w - 30, h - 30);
      for (const cx of [128, 384]) {
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (badge) {
          g.fillStyle = border; g.font = '900 22px Arial, sans-serif';
          g.fillText(badge, cx, 36);
        }
        g.fillStyle = accent; g.font = '900 42px Arial, sans-serif';
        g.fillText(title, cx, 92);
        if (sub) {
          g.fillStyle = '#1c1814'; g.font = '900 24px Arial, sans-serif';
          g.fillText(sub, cx, 146);
        }
      }
    }));
    return std({ map: tx, roughness: .48 });
  }

  function buildItemProto(id) {
    const g = new THREE.Group();
    const lbl = c => std({ color: c, roughness: .5 });
    // бутылки: точёный профиль стекла (дно, плечи, горлышко, венчик), жидкость внутри с уровнем налива, этикетка и колпачок
    const BOTTLE_PROF = {
      // [радиус в долях r, высота в долях h]
      beer:    [[0, 0], [.86, 0], [.97, .015], [1, .045], [1, .58], [.96, .64], [.8, .7], [.52, .77], [.4, .82], [.38, .89], [.44, .905], [.44, .925], [.36, .93], [0, .93]],
      vodka:   [[0, 0], [.88, 0], [.98, .012], [1, .04], [1, .55], [.97, .6], [.82, .65], [.5, .7], [.37, .74], [.34, .9], [.4, .91], [.4, .93], [.33, .935], [0, .935]],
      samogon: [[0, 0], [.9, 0], [1, .02], [1, .62], [.94, .68], [.66, .74], [.42, .78], [.38, .9], [.46, .915], [.46, .93], [0, .93]],
      soda:    [[0, 0], [.86, 0], [.97, .015], [1, .045], [1, .56], [.95, .63], [.76, .69], [.48, .76], [.38, .82], [.37, .89], [.43, .905], [.43, .925], [.35, .93], [0, .93]],
    };
    const latheOf = (prof, r, h, shrink = 0, cutY = 9) => {
      const pts = []; for (const [pr, py] of prof) { const y = py * h; if (y > cutY) { pts.push(new THREE.Vector2(0, cutY)); break; } pts.push(new THREE.Vector2(Math.max(0, pr * r - shrink), Math.max(0, y - (py === 0 ? 0 : 0)))); }
      if (cutY < 9 && pts[pts.length - 1].x !== 0) pts.push(new THREE.Vector2(0, cutY));
      return new THREE.LatheGeometry(pts, 22);
    };
    const bottleWithLabel = (h, r, bodyCol, capCol, wrapMat, neckCol = null, cork = false, kind = 'beer', liqCol = null, fill = .8) => {
      const prof = BOTTLE_PROF[kind] || BOTTLE_PROF.beer;
      const glassM = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: .06, metalness: .1, transparent: true, opacity: kind === 'samogon' ? .38 : .62, depthWrite: false });
      const body = new THREE.Mesh(latheOf(prof, r, h), glassM); body.castShadow = true; body.renderOrder = 2; g.add(body);
      if (liqCol !== null) { // жидкость: чуть меньше стекла, до уровня налива; сверху — мениск
        const liq = new THREE.Mesh(latheOf(prof, r, h, r * .07, h * fill), new THREE.MeshStandardMaterial({ color: liqCol, roughness: .2, metalness: 0, transparent: true, opacity: .82 }));
        liq.position.y = .003; liq.renderOrder = 1; liq.userData.isLiquid = true; g.add(liq);
      }
      const dno = cyl(r * .86, r * .86, .004, new THREE.MeshStandardMaterial({ color: bodyCol, roughness: .3, transparent: true, opacity: .8 }), 0, .002, 0, 18, g); // толстое дно
      if (cork) {
        // деревянная пробка, сургуч и бечёвка на горлышке
        const ck = cyl(r * .37, r * .31, h * .085, lbl(capCol), 0, h * .955, 0, 12, g); ck.userData.isCap = true;
        const wax = cyl(r * .5, r * .47, h * .03, std({ color: 0x7a1a14, roughness: .45 }), 0, h * .915, 0, 12, g); wax.userData.isCap = true;
        cyl(r * .43, r * .43, h * .02, lbl(0x8c734b), 0, h * .84, 0, 10, g);
      } else if (kind === 'vodka') {
        // алюминиевая «бескозырка» с язычком
        const cp = cyl(r * .42, r * .42, h * .06, std({ color: 0xc8c6c0, metalness: .85, roughness: .32 }), 0, h * .94, 0, 16, g); cp.userData.isCap = true;
        const tab = box(r * .3, h * .045, r * .05, std({ color: 0xc8c6c0, metalness: .85, roughness: .32 }), r * .42, h * .925, 0, g); tab.userData.isCap = true;
      } else {
        // кроненпробка с зубчиками
        const cp = cyl(r * .47, r * .5, h * .045, std({ color: capCol, metalness: .65, roughness: .3 }), 0, h * .945, 0, 21, g); cp.userData.isCap = true;
        const top = cyl(r * .44, r * .44, .002, std({ color: capCol, metalness: .7, roughness: .25 }), 0, h * .968, 0, 18, g); top.userData.isCap = true;
      }
      if (neckCol !== null) { const nr = (kind === 'vodka' ? .36 : .4) * r * 1.06; cyl(nr, nr * 1.08, h * .055, lbl(neckCol), 0, h * .8, 0, 14, g); } // кольеретка на горлышке
      const lbH = kind === 'vodka' ? h * .3 : h * .3, lbY = kind === 'vodka' ? h * .3 : h * .32;
      const lb = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.012, r * 1.012, lbH, 22, 1, true, -Math.PI * .62, Math.PI * 1.24), wrapMat); // этикетка не по кругу — сзади видно стекло
      lb.position.y = lbY; lb.castShadow = true; g.add(lb);
      // блик на стекле — тонкая светлая полоска вдоль корпуса
      const hl = new THREE.Mesh(new THREE.PlaneGeometry(r * .18, h * .5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .22, depthWrite: false }));
      hl.position.set(-r * .55, h * .36, r * .86); hl.rotation.y = -.55; g.add(hl);
    };
    switch (id) {
      case 'vodka': {
        const wm = cylWrapMat('#f5efe0', '#c49a38', 'ВОДКА', 'СПИРТ «КОРОЛЬ»', '0.5 Л · 40°', '#b82418');
        bottleWithLabel(.28, .036, 0xb9cfc4, 0xd4b254, wm, 0xd4b254, false, 'vodka', 0xe8f0ee, .86);
        break;
      }
      case 'beer': {
        const wm = cylWrapMat('#f2d06b', '#7a2814', 'ПИВО', 'ЗАВОДСКОЕ', 'СВЕТЛОЕ · 0.5 Л', '#8a1e12');
        bottleWithLabel(.24, .034, 0x4a2a10, 0xd4a72c, wm, 0xd4a72c, false, 'beer', 0x9a5a14, .82);
        break;
      }
      case 'samogon': {
        const wm = cylWrapMat('#dfd1b4', '#4a3520', 'САМОГОН', 'ПЕРВАЧ · 60°', 'ДОМАШНИЙ', '#7a1e14');
        bottleWithLabel(.26, .038, 0xd2dccf, 0x7a5a38, wm, null, true, 'samogon', 0xe6e2cc, .8);
        break;
      }
      case 'soda': {
        const wm = cylWrapMat('#f7df64', '#c42b1c', 'ЛИМОНАД', 'БУРАТИНО', 'ГОСТ · 0.5 Л', '#b81e14');
        bottleWithLabel(.23, .032, 0x6a8a5a, 0xc0392b, wm, 0xf7df64, false, 'soda', 0xd98a1c, .84);
        break;
      }
      case 'cig': {
        const fm = packFaceMat(256, 360, '#f4f0e6', '#b02820', '#b82820', 'СИГАРЕТЫ', 'КОСМОНАВТ', '20 ШТ · ФИЛЬТР', '#b82820');
        const sideM = lbl(0xefeae0), topM = lbl(0xb82820), foilM = std({ color: 0xd8d8d4, metalness: .75, roughness: .28 });
        const m = new THREE.Mesh(new THREE.BoxGeometry(.058, .088, .024), [sideM, sideM, topM, sideM, fm, fm]);
        m.position.y = .044; m.castShadow = true; g.add(m);
        box(.059, .005, .025, foilM, 0, .064, 0, g);
        break;
      }
      case 'kontra': {
        const fm = packFaceMat(320, 240, '#192d4e', '#d4a72c', '#d4a72c', 'СИГАРЕТЫ', 'ИМПОРТ · БЛОК', 'FILTER KINGS', '#f5d062');
        const sideM = lbl(0x192d4e), goldM = std({ color: 0xd4a72c, metalness: .6, roughness: .32 });
        const m = new THREE.Mesh(new THREE.BoxGeometry(.115, .086, .046), [sideM, sideM, goldM, sideM, fm, fm]);
        m.position.y = .043; m.castShadow = true; g.add(m);
        break;
      }
      case 'gum': {
        const fm = packFaceMat(256, 180, '#fce24c', '#d42c78', '#d42c78', 'ЖВАЧКА', 'ТУРБИНА', 'ВКЛАДЫШ ВНУТРИ', '#b81858');
        const sideM = lbl(0xd42c78), foilM = std({ color: 0xe2e4e6, metalness: .7, roughness: .3 });
        const m = new THREE.Mesh(new THREE.BoxGeometry(.082, .052, .026), [foilM, foilM, fm, sideM, fm, fm]);
        m.position.y = .026; m.castShadow = true; g.add(m);
        break;
      }
      case 'choc': {
        const fm = packFaceMat(320, 140, '#442214', '#d4a72c', '#b8281c', 'ШОКОЛАД', 'МАРСЪ · ПЛИТКА', 'МОЛОЧНЫЙ', '#f4cc5c');
        const sideM = lbl(0x442214), foilM = std({ color: 0xdcded8, metalness: .78, roughness: .25 });
        const m = new THREE.Mesh(new THREE.BoxGeometry(.125, .038, .026), [foilM, sideM, fm, sideM, fm, fm]);
        m.position.y = .019; m.castShadow = true; g.add(m);
        box(.018, .034, .023, foilM, .066, .019, 0, g);
        break;
      }
      case 'bread': {
        const crust = std({ color: 0xb87634, roughness: .82 });
        const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(.044, .115, 6, 12), crust);
        loaf.rotation.z = Math.PI / 2; loaf.scale.set(1, 1, 1.12); loaf.position.y = .044; loaf.castShadow = true; g.add(loaf);
        // Поджаристые надрезы на корке батона и бумажная лента «ХЛЕБ»
        for (const xOff of [-.045, -.015, .015, .045]) {
          const slash = box(.010, .012, .072, lbl(0xe4b878), xOff, .084, 0, g);
          slash.rotation.y = .32;
        }
        const bandMat = packFaceMat(256, 128, '#f4ecda', '#8a2818', null, 'ХЛЕБ', 'ГОСТ · СВЕЖИЙ', 'ХЛЕБОЗАВОД № 2', '#9e2014');
        const band = new THREE.Mesh(new THREE.BoxGeometry(.056, .089, .104), [crust, crust, bandMat, bandMat, bandMat, bandMat]);
        band.position.y = .044; g.add(band);
        break;
      }
      case 'tushonka': {
        const tinM = std({ color: 0xcfc4a8, metalness: .68, roughness: .32 });
        const wm = cylWrapMat('#efe6ce', '#8a2216', 'ТУШЁНКА', 'ГОВЯДИНА ГОСТ', 'ВЫСШИЙ СОРТ', '#9e1e14');
        cyl(.046, .046, .094, tinM, 0, .047, 0, 16, g);
        cyl(.0475, .0475, .005, tinM, 0, .092, 0, 16, g);
        cyl(.0475, .0475, .005, tinM, 0, .004, 0, 16, g);
        const lb = new THREE.Mesh(new THREE.CylinderGeometry(.0468, .0468, .068, 16, 1, true), wm);
        lb.position.y = .047; lb.castShadow = true; g.add(lb);
        break;
      }
      case 'kilka': {
        const tinM = std({ color: 0xd4aa3c, metalness: .65, roughness: .34 });
        const wm = cylWrapMat('#e66428', '#5a180c', 'КИЛЬКА', 'В ТОМАТЕ', 'БАЛТИЙСКАЯ', '#ffffff');
        const topTx = regTex(ctex(256, 256, (c, w, h) => {
          c.fillStyle = '#d95322'; c.beginPath(); c.arc(128, 128, 124, 0, Math.PI * 2); c.fill();
          c.strokeStyle = '#f4d068'; c.lineWidth = 8; c.beginPath(); c.arc(128, 128, 114, 0, Math.PI * 2); c.stroke();
          c.fillStyle = '#fff5dc'; c.font = '900 38px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('КИЛЬКА', 128, 108);
          c.font = '900 24px Arial, sans-serif'; c.fillStyle = '#ffe082';
          c.fillText('В ТОМАТЕ', 128, 150);
        }));
        const topM = std({ map: topTx, roughness: .42, metalness: .2 });
        const can = new THREE.Mesh(new THREE.CylinderGeometry(.050, .050, .034, 16), [wm, topM, tinM]);
        can.position.y = .017; can.castShadow = true; g.add(can);
        break;
      }
      case 'batt': {
        const cardM = packFaceMat(256, 320, '#f2c638', '#1c1c1c', '#1c1c1c', 'БАТАРЕЙКИ', 'КВАНТ · 1.5V', '2 ШТ · АЛКАЛИН', '#b01e14');
        const backM = lbl(0xd8d2c4), cellM = std({ color: 0x202226, metalness: .45, roughness: .35 }), brassM = std({ color: 0xd8b43c, metalness: .85, roughness: .22 });
        const card = new THREE.Mesh(new THREE.BoxGeometry(.082, .104, .005), [backM, backM, backM, backM, cardM, backM]);
        card.position.set(0, .052, -.006); card.castShadow = true; g.add(card);
        for (const sx of [-.018, .018]) {
          cyl(.012, .012, .054, cellM, sx, .038, .006, 12, g);
          cyl(.0122, .0122, .016, lbl(0xd4a72c), sx, .052, .006, 12, g);
          cyl(.0045, .0045, .005, brassM, sx, .067, .006, 8, g);
        }
        break;
      }
      case 'tape': {
        const fm = packFaceMat(320, 220, '#222428', '#e6c238', '#c42b1c', 'КАССЕТА', 'МК-60 · СТЕРЕО', 'АУДИО 1992', '#f5d248');
        const sideM = lbl(0x1b1d20), reelM = lbl(0xf2efe8);
        const m = new THREE.Mesh(new THREE.BoxGeometry(.102, .066, .016), [sideM, sideM, sideM, sideM, fm, fm]);
        m.position.y = .033; m.castShadow = true; g.add(m);
        for (const rx of [-.022, .022]) {
          const r = cyl(.009, .009, .018, reelM, rx, .034, 0, 10, g);
          r.rotation.x = Math.PI / 2;
        }
        break;
      }
      case 'paper': {
        const topTx = regTex(ctex(512, 360, (c, w, h) => {
          c.fillStyle = '#e5dec9'; c.fillRect(0, 0, w, h);
          c.fillStyle = '#b02418'; c.fillRect(16, 14, w - 32, 68);
          c.fillStyle = '#ffffff'; c.font = '900 44px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('ГАЗЕТА «ГУДОК»', w / 2, 48);
          c.fillStyle = '#1c1a17'; c.font = '900 28px Arial, sans-serif';
          c.fillText('СВЕЖИЙ ВЫПУСК · 1992', w / 2, 108);
          c.fillStyle = '#787266'; c.fillRect(24, 134, 210, 180);
          c.fillStyle = '#2b2824';
          for (let y = 140; y < 320; y += 18) c.fillRect(250, y, 236, 8);
        }));
        const topM = std({ map: topTx, roughness: .88 }), sideM = lbl(0xdad2bc);
        const m = new THREE.Mesh(new THREE.BoxGeometry(.22, .018, .16), [sideM, sideM, topM, sideM, sideM, sideM]);
        m.position.y = .009; m.castShadow = true; g.add(m);
        break;
      }
      case 'mag': case 'mag2': {
        const isM1 = id === 'mag';
        const c = document.createElement('canvas'); c.width = 256; c.height = 320;
        const x = c.getContext('2d');
        const gr = x.createLinearGradient(0, 0, 256, 320);
        gr.addColorStop(0, isM1 ? '#c82458' : '#184b9e');
        gr.addColorStop(1, isM1 ? '#f2c138' : '#32a8d8');
        x.fillStyle = gr; x.fillRect(0, 0, 256, 320);
        x.fillStyle = 'rgba(0,0,0,0.65)'; x.fillRect(10, 12, 236, 92);
        x.fillStyle = '#ffeb68'; x.font = '900 28px Arial, sans-serif'; x.textAlign = 'center';
        x.fillText('ЖУРНАЛ', 128, 46);
        x.fillStyle = '#ffffff'; x.font = '900 34px Arial, sans-serif';
        x.fillText(isM1 ? 'РОВЕСНИК' : 'ВИДЕО-АСС', 128, 88);
        x.fillStyle = 'rgba(255,255,255,0.22)'; x.beginPath(); x.ellipse(128, 205, 70, 82, 0, 0, 7); x.fill();
        x.fillStyle = '#181818'; x.font = '900 22px Arial, sans-serif';
        x.fillText(isM1 ? 'РОК · МОДА · 1992' : 'ИГРЫ · КИНО · 1992', 128, 298);
        const t = regTex(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace;
        const covM = new THREE.MeshStandardMaterial({ map: t, roughness: .24, metalness: .05 });
        const m = new THREE.Mesh(new THREE.BoxGeometry(.15, .19, .010), [lbl(0xeeeeee), lbl(0xeeeeee), lbl(0xeeeeee), lbl(0xeeeeee), covM, covM]);
        m.position.y = .095; m.rotation.x = -.16; m.castShadow = true; g.add(m);
        break;
      }
      case 'toy': {
        const fm = packFaceMat(256, 384, '#d83a28', '#8a1c10', '#242830', 'ТЕТРИС', 'ИГРУШКА 99 В 1', 'BRICK GAME', '#ffdf48');
        const bodyM = lbl(0xd83a28), scrM = lbl(0x8fa87a), btnM = lbl(0xf2c938);
        const m = new THREE.Mesh(new THREE.BoxGeometry(.076, .136, .022), [bodyM, bodyM, bodyM, bodyM, fm, bodyM]);
        m.position.y = .068; m.castShadow = true; g.add(m);
        box(.052, .048, .004, scrM, 0, .092, .011, g);
        for (const [bx, by] of [[-.016, .042], [0, .042], [.016, .038], [.016, .052]]) {
          box(.010, .010, .005, btnM, bx, by, .011, g);
        }
        break;
      }
    }
    return g;
  }

  function goodTitleOf(id) {
    if (ctx.GOODS && ctx.GOODS[id]) return ctx.GOODS[id].name;
    if (id === 'samogon') return 'Самогон';
    if (id === 'kontra') return 'Сигареты «Импорт» (блок)';
    return id || 'Товар';
  }
  function goodShortOf(id) {
    if (ctx.GOODS && ctx.GOODS[id]) return ctx.GOODS[id].short;
    if (id === 'samogon') return 'Самогон';
    if (id === 'kontra') return 'Импорт';
    return id || 'Товар';
  }
  function packKindOf(id) {
    if (id === 'cig' || id === 'kontra') return 'carton';
    if (id === 'paper' || id === 'mag' || id === 'mag2') return 'bundle';
    if (['gum', 'choc', 'batt', 'tape', 'toy'].includes(id)) return 'showbox';
    return 'tray';
  }
  function packTitleOf(data) {
    const id = (data && data.goodId) || 'cig';
    const cnt = (data && data.count) || 5;
    const pk = packKindOf(id);
    const prefix = pk === 'carton' ? 'Блок' : pk === 'bundle' ? 'Пачка' : pk === 'showbox' ? 'Бокс' : 'Упаковка';
    return `${prefix}: ${goodTitleOf(id)} (${cnt} шт.)`;
  }
  function getPackMesh(id, count = 5, maxCount = 5, opened = false) {
    const g = new THREE.Group();
    const pk = packKindOf(id);
    const lbl = c => std({ color: c, roughness: .55 });
    const cnt = clamp(count, 1, maxCount || 5);

    if (pk === 'bundle') {
      // Стопка сложенных газет / журналов, перевязанная крест-накрест джутовой бечёвкой (верёвкой) с узлом сверху
      const isPaper = id === 'paper';
      const W = isPaper ? .22 : .15;
      const D = isPaper ? .16 : .19;
      const layerH = isPaper ? .018 : .014;
      const stackH = cnt * layerH;
      for (let k = 0; k < cnt; k++) {
        const layer = new THREE.Group();
        const im = getItemMesh(id);
        if (!isPaper) {
          // Укладываем журнал горизонтально обложкой вверх в стопку
          im.position.set(0, .007, 0);
          im.traverse(o => {
            if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry') {
              o.rotation.set(Math.PI / 2, 0, 0);
              o.position.set(0, 0, 0);
            }
          });
        }
        layer.add(im);
        layer.position.set((k % 2 ? .002 : -.002), k * layerH, ((k >> 1) % 2 ? .002 : -.002));
        layer.rotation.y = (k % 2 ? .022 : -.018) * (opened ? 1.4 : 0.6);
        g.add(layer);
      }
      const ropeM = std({ color: 0x9c7a4c, roughness: .92 });
      const knotM = std({ color: 0x86653a, roughness: .95 });
      if (!opened) {
        // Продольная и две поперечные верёвки вокруг пачки газет + узел с кончиками бечёвки сверху
        const rThick = .0055;
        // Продольный обхват (вдоль Z)
        box(rThick, stackH + .005, D + .006, ropeM, 0, stackH / 2, 0, g);
        // Поперечные обхваты (вдоль X)
        for (const rz of [-.034, .034]) {
          box(W + .006, stackH + .005, rThick, ropeM, 0, stackH / 2, rz, g);
        }
        // Узел сверху на перекрестии верёвок
        const knot = new THREE.Mesh(new THREE.SphereGeometry(.0095, 8, 6), knotM);
        knot.position.set(0, stackH + .004, .034);
        knot.scale.set(1.2, .75, 1.2);
        g.add(knot);
        for (const [dx, dz, ang] of [[-.016, .042, .45], [.018, .026, -.55]]) {
          const tail = box(.026, .004, .004, ropeM, dx, stackH + .004, dz, g);
          tail.rotation.y = ang;
        }
      } else {
        // Развязанная бечёвка лежит рядом у основания стопки, чтобы было видно, что пачка распечатана
        box(W + .012, .0035, .005, ropeM, 0, .002, D / 2 + .006, g);
        box(.005, .0035, D + .012, ropeM, W / 2 + .006, .002, 0, g);
      }
      return g;
    }

    if (pk === 'carton') {
      // Блок сигарет (как на референсе Magna 5618.jpg): длинный прямоугольный блок, при открытии пачки лежат строго внутри корытца без вылезания
      const W = .24, H = .054, D = .098;
      const isK = id === 'kontra';
      const bg = isK ? '#192d4e' : '#c8241b';
      const accent = isK ? '#d4a72c' : '#ffffff';
      const title = isK ? 'ИМПОРТ · USA' : 'КОСМОНАВТ';
      const sub = 'БЛОК СИГАРЕТ · 5 ПАЧЕК';
      const topTx = regTex(ctex(512, 200, (c, w, h) => {
        c.fillStyle = bg; c.fillRect(0, 0, w, h);
        c.strokeStyle = accent; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16);
        c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(w / 2, h / 2, 140, 64, 0, 0, Math.PI * 2); c.stroke();
        c.fillStyle = accent; c.font = '900 46px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(title, w / 2, h / 2 - 14);
        c.fillStyle = '#f5ecd8'; c.font = '900 22px Arial, sans-serif';
        c.fillText(sub, w / 2, h / 2 + 34);
        c.fillStyle = '#ffffff'; c.fillRect(w - 92, h - 62, 74, 44);
        c.fillStyle = '#111111';
        for (let x = w - 86; x < w - 24; x += 5) c.fillRect(x, h - 58, (x % 2 ? 2 : 3), 36);
      }));
      const topM = std({ map: topTx, roughness: .42 });
      const sideM = std({ color: isK ? 0x192d4e : 0xc8241b, roughness: .48 });
      const inM = std({ color: 0xebe6dc, roughness: .85 });
      if (!opened) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [sideM, sideM, topM, sideM, topM, topM]);
        m.position.y = H / 2; m.castShadow = true; g.add(m);
      } else {
        const t = .005;
        box(W, t, D, inM, 0, t / 2, 0, g);
        box(W, H * .78, t, sideM, 0, H * .39, D / 2 - t / 2, g);
        box(W, H * .88, t, sideM, 0, H * .44, -D / 2 + t / 2, g);
        box(t, H * .84, D - t * 2, sideM, -W / 2 + t / 2, H * .42, 0, g);
        box(t, H * .84, D - t * 2, sideM, W / 2 - t / 2, H * .42, 0, g);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(W, t, D * .86), [sideM, sideM, inM, topM, sideM, sideM]);
        lid.position.set(0, H * .84 + .026, -D / 2 - .012);
        lid.rotation.x = -1.18;
        lid.castShadow = true; g.add(lid);
        for (let k = 0; k < cnt; k++) {
          const pkMesh = getItemMesh(id);
          // Пачка лежит внутри блока в натуральную величину (1:1), без уменьшения масштаба
          if (isK) {
            pkMesh.scale.set(.38, 1, .50);
            pkMesh.rotation.set(-Math.PI / 2, 0, 0);
            pkMesh.position.set(-.088 + k * .044, .024, .042);
          } else {
            pkMesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
            pkMesh.position.set(-.088 + k * .044, .016, 0);
          }
          g.add(pkMesh);
        }
      }
      return g;
    }

    if (pk === 'showbox') {
      // Шоу-бокс с вертикальным фигурным задником (как на референсе жвачки 5621.jpg)
      const W = .19, H = .084, D = .146;
      const cfg = id === 'gum'
        ? { c: 0x1e88e5, bg: '#1e88e5', hdr: '#e53935', title: 'ТУРБИНА', sub: 'ЖВАЧКА · БЛОК' }
        : id === 'choc'
        ? { c: 0x4e2614, bg: '#4e2614', hdr: '#d4a72c', title: 'МАРСЪ', sub: 'ШОКОЛАД · БОКС' }
        : id === 'batt'
        ? { c: 0xe6b828, bg: '#e6b828', hdr: '#1c1c1c', title: 'КВАНТ', sub: 'БАТАРЕЙКИ · БОКС' }
        : id === 'tape'
        ? { c: 0x26282e, bg: '#26282e', hdr: '#c8281c', title: 'МК-60', sub: 'КАССЕТЫ · БОКС' }
        : { c: 0xc83220, bg: '#c83220', hdr: '#ffca28', title: 'ТЕТРИС', sub: 'ИГРУШКИ · БОКС' };
      const boxTx = regTex(ctex(256, 180, (c, w, h) => {
        c.fillStyle = cfg.bg; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
        c.fillStyle = cfg.hdr;
        c.beginPath(); c.arc(w / 2, h * .45, 48, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffffff'; c.font = '900 34px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(cfg.title, w / 2, h * .42);
        c.fillStyle = '#fff59d'; c.font = '900 20px Arial, sans-serif';
        c.fillText(cfg.sub, w / 2, h * .80);
      }));
      const sideM = std({ map: boxTx, roughness: .48 });
      const plainM = lbl(cfg.c);
      const inM = std({ color: 0xe8e4dc, roughness: .85 });
      if (!opened) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [plainM, plainM, sideM, plainM, sideM, sideM]);
        m.position.y = H / 2; m.castShadow = true; g.add(m);
      } else {
        const t = .005;
        box(W, t, D, inM, 0, t / 2, 0, g);
        box(W, H * .68, t, sideM, 0, H * .34, D / 2 - t / 2, g);
        box(W, H, t, sideM, 0, H / 2, -D / 2 + t / 2, g);
        box(t, H * .84, D - t * 2, plainM, -W / 2 + t / 2, H * .42, 0, g);
        box(t, H * .84, D - t * 2, plainM, W / 2 - t / 2, H * .42, 0, g);
        const backCard = new THREE.Mesh(new THREE.BoxGeometry(W, H * 1.02, .005), [plainM, plainM, plainM, plainM, sideM, plainM]);
        backCard.position.set(0, H + H * .48, -D / 2 + .003);
        backCard.castShadow = true; g.add(backCard);
        for (let k = 0; k < cnt; k++) {
          const im = getItemMesh(id);
          if (id === 'choc' || id === 'tape' || id === 'gum') {
            // В натуральную величину (1:1) длинной стороной вдоль Z
            im.rotation.set(0, Math.PI / 2, 0);
            im.position.set(-.068 + k * .034, .006, 0);
          } else {
            im.rotation.set(-.65, 0, 0);
            im.position.set(-.064 + k * .032, .010, .024);
          }
          g.add(im);
        }
      }
      return g;
    }

    // Картонный лоток-поддон с бутылками / банками / хлебом внутри в натуральную величину 1:1 (размер предмета в упаковке и вне упаковки абсолютно одинаковый!)
    const W = .30, H = .072, D = .21, t = .006;
    const trayTx = regTex(ctex(512, 140, (c, w, h) => {
      c.fillStyle = '#c8aa78'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#6e522c'; c.lineWidth = 5; c.strokeRect(4, 4, w - 8, h - 8);
      c.fillStyle = '#1b1815'; c.font = '900 40px Arial, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(goodShortOf(id).toUpperCase(), 22, h * .46);
      c.font = '800 22px Arial, sans-serif'; c.fillStyle = '#3a2c1a';
      c.textAlign = 'right';
      c.fillText(`${maxCount || 5} ШТ. · УПАКОВКА`, w - 22, h * .68);
    }));
    const wallM = std({ map: trayTx, roughness: .85 });
    const kraftM = std({ color: 0xb89866, roughness: .88 });
    box(W, t, D, kraftM, 0, t / 2, 0, g);
    box(W, H, t, wallM, 0, H / 2, D / 2 - t / 2, g);
    box(W, H, t, wallM, 0, H / 2, -D / 2 + t / 2, g);
    box(t, H, D - t * 2, kraftM, -W / 2 + t / 2, H / 2, 0, g);
    box(t, H, D - t * 2, kraftM, W / 2 - t / 2, H / 2, 0, g);

    let maxItemH = .098;
    if (id === 'bread') {
      maxItemH = .090;
      for (let k = 0; k < cnt; k++) {
        const im = getItemMesh(id);
        im.rotation.y = Math.PI / 2;
        im.position.set(-.096 + k * .048, t, 0);
        g.add(im);
      }
    } else {
      const positions = [
        [-.092, -.046], [0, -.046], [.092, -.046],
        [-.048,  .046], [.048,  .046]
      ];
      if (id === 'vodka') maxItemH = .282;
      else if (id === 'samogon') maxItemH = .262;
      else if (id === 'beer') maxItemH = .242;
      else if (id === 'soda') maxItemH = .232;
      else if (id === 'tushonka') maxItemH = .100;
      else if (id === 'kilka') maxItemH = .042;
      for (let k = 0; k < Math.min(cnt, positions.length); k++) {
        const im = getItemMesh(id);
        const [px, pz] = positions[k];
        im.position.set(px, t, pz);
        im.scale.setScalar(1.0); // 1:1 с предметом вне упаковки!
        g.add(im);
      }
    }
    if (!opened) {
      // Полиэтиленовая термоусадочная плёнка и упаковочная лента поверх нераспакованного лотка (строго в габаритах W × D)
      const wrapM = new THREE.MeshStandardMaterial({ color: 0xe6eff2, roughness: .16, metalness: .05, transparent: true, opacity: .34, depthWrite: false });
      const wrap = new THREE.Mesh(new THREE.BoxGeometry(W - .002, maxItemH, D - .002), wrapM);
      wrap.position.y = maxItemH / 2 + .004;
      g.add(wrap);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(W, .014, .036), wallM);
      strap.position.y = maxItemH + .004;
      g.add(strap);
    }
    return g;
  }

  const SHELF_ROWS = [
    { y: SH_BACK[0], x0: -1.12, x1: .22,  z: -KD + .17, axis: 'x' },
    { y: SH_BACK[1], x0: -1.12, x1: .22,  z: -KD + .17, axis: 'x' },
    { y: SH_BACK[2], x0: -1.12, x1: .22,  z: -KD + .17, axis: 'x' },
    { y: SH_BACK[3], x0: -1.12, x1: .22,  z: -KD + .17, axis: 'x' },
    { y: SH_SIDE[0], z0: -.76,  z1: .35,  x: -KW + .17, axis: 'z' },
    { y: SH_SIDE[1], z0: -.40,  z1: .35,  x: -KW + .17, axis: 'z' },
    { y: SH_SIDE[2], z0: -.76,  z1: .35,  x: -KW + .17, axis: 'z' },
    { y: .407, x0: -.48, x1: .48, z: KD - .25, axis: 'x', under: true }, // 7: ниша под прилавком — только для товара из-под полы
  ];

  // Невидимые зоны полок (задних SH_BACK и боковых SH_SIDE справа от окна ларька) для установки предмета в любую точку полки
  // Важно: keep = true и dyn = true, чтобы batchStatic(scene) не удалял и не сливал хитбоксы полок!
  const shelfHitTargets = [];
  {
    const invisM = new THREE.MeshBasicMaterial({ visible: false });
    SHELF_ROWS.forEach((r, idx) => {
      const m = r.axis === 'x'
        ? new THREE.Mesh(new THREE.BoxGeometry(1.52, .38, .34), invisM)
        : new THREE.Mesh(new THREE.BoxGeometry(.34, .38, 1.22), invisM);
      if (r.axis === 'x') m.position.set(-.45, r.y + .16, r.z);
      else m.position.set(r.x, r.y + .16, -.2);
      m.userData.isStorageShelf = true;
      m.userData.shelfRowIdx = idx;
      m.userData.keep = true;
      m.userData.dyn = true;
      K.add(m); shelfHitTargets.push(m);
    });
  }

  const SHELF_SPECS = {
    paper:    { w: .22,  d: .16,  h: .018, stackable: true,  maxStack: 8, autoStack: true },
    mag:      { w: .15,  d: .19,  h: .014, stackable: true,  maxStack: 8, autoStack: true },
    mag2:     { w: .15,  d: .19,  h: .014, stackable: true,  maxStack: 8, autoStack: true },
    cig:      { w: .066, d: .030, h: .088, stackable: true,  maxStack: 3, autoStack: false },
    kontra:   { w: .120, d: .050, h: .086, stackable: true,  maxStack: 3, autoStack: false },
    gum:      { w: .088, d: .032, h: .052, stackable: true,  maxStack: 4, autoStack: false },
    choc:     { w: .132, d: .032, h: .038, stackable: true,  maxStack: 5, autoStack: false },
    bread:    { w: .206, d: .108, h: .088, stackable: true,  maxStack: 3, autoStack: false },
    tushonka: { w: .100, d: .100, h: .094, stackable: true,  maxStack: 3, autoStack: false },
    kilka:    { w: .106, d: .106, h: .034, stackable: true,  maxStack: 5, autoStack: true },
    batt:     { w: .088, d: .030, h: .104, stackable: true,  maxStack: 3, autoStack: false },
    tape:     { w: .108, d: .022, h: .066, stackable: true,  maxStack: 4, autoStack: false },
    toy:      { w: .084, d: .028, h: .136, stackable: true,  maxStack: 2, autoStack: false },
    vodka:    { w: .084, d: .084, h: .280, stackable: false, maxStack: 1, autoStack: false },
    beer:     { w: .080, d: .080, h: .240, stackable: false, maxStack: 1, autoStack: false },
    samogon:  { w: .086, d: .086, h: .260, stackable: false, maxStack: 1, autoStack: false },
    soda:     { w: .076, d: .076, h: .230, stackable: false, maxStack: 1, autoStack: false },
  };
  const shelfSpecOf = id => SHELF_SPECS[id] || { w: .095, d: .08, h: .08, stackable: true, maxStack: 3, autoStack: false };
  const shelfItemW = id => shelfSpecOf(id).w;

  function getShelfRowObstacles(placements, r, baseY) {
    const out = [];
    for (const p of placements) {
      const sameWall = r.axis === 'x' ? Math.abs(p.z - r.z) < .11 : Math.abs(p.x - r.x) < .11;
      if (sameWall && p.y >= baseY - .02 && p.y < baseY + .35) {
        const sp = shelfSpecOf(p.id);
        out.push({ isShelfPlacement: true, id: p.id, x: p.x, y: p.y, z: p.z, ry: p.ry, w: sp.w, h: sp.h, stackable: sp.stackable });
      }
    }
    if (typeof life !== 'undefined' && life && Array.isArray(life.items)) {
      for (const it of life.items) {
        if (it.state !== 'rest' || it.inBoxId || it === life.held) continue;
        const pos = it.obj.position;
        const sameWall = r.axis === 'x' ? Math.abs(pos.z - r.z) < .14 : Math.abs(pos.x - r.x) < .14;
        if (sameWall && pos.y >= baseY - .02 && pos.y < baseY + .35) {
          const c = Math.abs(Math.cos(it.obj.rotation.y || 0)), s = Math.abs(Math.sin(it.obj.rotation.y || 0));
          const hx = ((it.half && it.half.x) || .06) * c + ((it.half && it.half.z) || .06) * s;
          const hz = ((it.half && it.half.x) || .06) * s + ((it.half && it.half.z) || .06) * c;
          const spanAlong = r.axis === 'x' ? hx * 2 : hz * 2;
          const h = ((it.half && it.half.y) || .04) * 2;
          out.push({ isShelfPlacement: false, id: it.kind, x: pos.x, y: pos.y, z: pos.z, ry: it.obj.rotation.y, w: spanAlong, h, stackable: false });
        }
      }
    }
    return out;
  }

  function findFreeShelfSpot(placements, id, preferPos = null, preferRowIdx = null) {
    const spec = shelfSpecOf(id);
    const isHid = id === 'samogon' || id === 'kontra', ROWS = isHid ? [SHELF_ROWS[7]] : SHELF_ROWS.filter(r => !r.under); // «из-под полы» — только в нишу под прилавком
    const w = spec.w;
    if (preferPos) {
      let bestR = (preferRowIdx != null && ROWS.includes(SHELF_ROWS[preferRowIdx])) ? SHELF_ROWS[preferRowIdx] : null;
      if (!bestR) {
        let bestD = 999;
        for (const r of ROWS) {
          const cx = r.axis === 'x' ? clamp(preferPos.x, r.x0 + w / 2, r.x1 - w / 2) : r.x;
          const cz = r.axis === 'x' ? r.z : clamp(preferPos.z, r.z0 + w / 2, r.z1 - w / 2);
          const cy = r.y + .013;
          const d = Math.hypot(preferPos.x - cx, (preferPos.y - cy) * 1.35, preferPos.z - cz);
          if (d < bestD) { bestD = d; bestR = r; }
        }
      }
      const baseY = bestR.y + .013;
      const ry = bestR.axis === 'x' ? 0 : Math.PI / 2;
      const minC = (bestR.axis === 'x' ? bestR.x0 : bestR.z0) + w / 2;
      const maxC = (bestR.axis === 'x' ? bestR.x1 : bestR.z1) - w / 2;
      const rawC = clamp(bestR.axis === 'x' ? preferPos.x : preferPos.z, minC, maxC);

      // Находим ВСЕ препятствия на этой полке (и товары S.shelfPlacements, и физические упаковки/бутылки life.items!)
      const rowItems = getShelfRowObstacles(placements, bestR, baseY);

      const overlapping = rowItems.filter(p => {
        const pC = bestR.axis === 'x' ? p.x : p.z;
        const minDist = (w + p.w) * .50 + .008;
        return Math.abs(pC - rawC) < minDist;
      });

      if (overlapping.length > 0) {
        overlapping.sort((a, b) => (b.y + b.h) - (a.y + a.h));
        const topP = overlapping[0];
        const stackCount = overlapping.filter(p => Math.hypot(p.x - topP.x, p.z - topP.z) < .04).length;
        const nextY = topP.y + topP.h;
        // Складывать стопкой вверх по одной на полке можно одинаковые штучные товары (или совместимые плоские товары)
        if (spec.stackable && topP.stackable && topP.id === id && stackCount < (spec.maxStack || 4) && (nextY + spec.h <= baseY + .35)) {
          return { x: +topP.x.toFixed(3), y: +nextY.toFixed(3), z: +topP.z.toFixed(3), ry: +(topP.ry ?? ry).toFixed(3) };
        }
        // Иначе ищем ближайшее свободное место вдоль этой же полки без наложения моделек
        for (let step = .02; step <= 1.65; step += .02) {
          for (const dir of [1, -1]) {
            const candC = rawC + dir * step;
            if (candC < minC || candC > maxC) continue;
            const hit = rowItems.some(p => {
              const pC = bestR.axis === 'x' ? p.x : p.z;
              return Math.abs(pC - candC) < (w + p.w) * .50 + .008;
            });
            if (!hit) {
              const x = bestR.axis === 'x' ? candC : bestR.x;
              const z = bestR.axis === 'x' ? bestR.z : candC;
              return { x: +x.toFixed(3), y: +baseY.toFixed(3), z: +z.toFixed(3), ry: +ry.toFixed(3) };
            }
          }
        }
      } else {
        const x = bestR.axis === 'x' ? rawC : bestR.x;
        const z = bestR.axis === 'x' ? bestR.z : rawC;
        return { x: +x.toFixed(3), y: +baseY.toFixed(3), z: +z.toFixed(3), ry: +ry.toFixed(3) };
      }
    }

    // Автоматическая раскладка (при старте игры): газеты, журналы и килька складываются аккуратной стопкой вверх по одной!
    if (spec.autoStack) {
      const existingSame = placements.filter(p => p.id === id);
      if (existingSame.length > 0) {
        for (const baseP of existingSame) {
          const col = existingSame.filter(p => Math.hypot(p.x - baseP.x, p.z - baseP.z) < .03);
          if (col.length < (spec.maxStack || 6)) {
            const topY = Math.max(...col.map(p => p.y)) + spec.h;
            return { x: +baseP.x.toFixed(3), y: +topY.toFixed(3), z: +baseP.z.toFixed(3), ry: +(baseP.ry || 0).toFixed(3) };
          }
        }
      }
    }

    for (const r of ROWS) {
      const start = r.axis === 'x' ? r.x0 + w / 2 : r.z0 + w / 2;
      const end = r.axis === 'x' ? r.x1 - w / 2 : r.z1 - w / 2;
      const baseY = r.y + .013;
      const rowObs = getShelfRowObstacles(placements, r, baseY);
      for (let c = start; c <= end; c += .025) {
        const x = r.axis === 'x' ? c : r.x;
        const z = r.axis === 'x' ? r.z : c;
        const busy = rowObs.some(p => {
          const pC = r.axis === 'x' ? p.x : p.z;
          return Math.abs(pC - c) < (w + p.w) * .50 + .008;
        });
        if (!busy) {
          const ry = r.axis === 'x' ? 0 : Math.PI / 2;
          return { x: +x.toFixed(3), y: +baseY.toFixed(3), z: +z.toFixed(3), ry: +ry.toFixed(3) };
        }
      }
    }
    const r0 = SHELF_ROWS[0];
    return { x: +(r0.x0 + .15).toFixed(3), y: +(r0.y + .013).toFixed(3), z: +r0.z.toFixed(3), ry: 0 };
  }

  function sanitizeShelfPlacements(placements) {
    if (!placements || !placements.length) return;
    const clean = [];
    const worldObs = [];
    if (typeof life !== 'undefined' && life && Array.isArray(life.items)) {
      for (const it of life.items) {
        if (it.state !== 'rest' || it.inBoxId || it === life.held) continue;
        const pos = it.obj.position;
        const c = Math.abs(Math.cos(it.obj.rotation.y || 0)), s = Math.abs(Math.sin(it.obj.rotation.y || 0));
        const hx = ((it.half && it.half.x) || .06) * c + ((it.half && it.half.z) || .06) * s;
        const hz = ((it.half && it.half.x) || .06) * s + ((it.half && it.half.z) || .06) * c;
        const h = ((it.half && it.half.y) || .04) * 2;
        worldObs.push({ x: pos.x, y: pos.y, z: pos.z, w: Math.max(hx, hz) * 2, h });
      }
    }
    for (const p of placements) {
      const sp = shelfSpecOf(p.id);
      const inCorner = (p.z < -KD + .34 && p.x < -1.14);
      const conflictClean = clean.find(q => {
        const sq = shelfSpecOf(q.id);
        const horizOverlap = Math.hypot(p.x - q.x, p.z - q.z) < (sp.w + sq.w) * .48;
        const vertOverlap = (p.y < q.y + sq.h - .004) && (p.y + sp.h > q.y + .004);
        return horizOverlap && vertOverlap;
      });
      const conflictWorld = worldObs.find(w => {
        const horizOverlap = Math.hypot(p.x - w.x, p.z - w.z) < (sp.w + w.w) * .48;
        const vertOverlap = (p.y < w.y + w.h - .004) && (p.y + sp.h > w.y + .004);
        return horizOverlap && vertOverlap;
      });
      if (!inCorner && !conflictClean && !conflictWorld) {
        clean.push(p);
      } else {
        const fixed = findFreeShelfSpot(clean, p.id, { x: p.x, y: p.y, z: p.z });
        p.x = fixed.x; p.y = fixed.y; p.z = fixed.z; p.ry = fixed.ry;
        clean.push(p);
      }
    }
  }

  function syncShelfPlacements(S) {
    if (!S || !ctx.GOODS) return;
    S.shelfPlacements = S.shelfPlacements || [];
    S.slotCounts = S.slotCounts || S.slots.map(id => id ? 1 : 0);
    for (let i = 0; i < S.slots.length; i++) {
      if (!S.slots[i]) S.slotCounts[i] = 0;
      else if (!S.slotCounts[i] || S.slotCounts[i] < 0) S.slotCounts[i] = 1;
    }
    const allIds = [...Object.keys(ctx.GOODS), 'samogon', 'kontra'];
    for (const id of allIds) {
      let onVit = 0;
      for (let i = 0; i < S.slots.length; i++) {
        if (S.slots[i] === id) {
          S.slotCounts[i] = Math.max(1, S.slotCounts[i] || 1);
          onVit += S.slotCounts[i];
        }
      }
      let totalQ = (id === 'samogon' || id === 'kontra') ? ((S.hidden && S.hidden[id]) || 0) : (ctx.qOf(id) || 0);
      // Гарантируем, что товар, уже выставленный игроком на витрину, никогда самопроизвольно не обнулится при синхронизации полок
      if (totalQ < onVit) {
        if (id === 'samogon' || id === 'kontra') {
          S.hidden = S.hidden || {};
          S.hidden[id] = onVit;
        } else if (ctx.addStock) {
          ctx.addStock(id, onVit - totalQ, (S.prices && S.prices[id]) || 20);
        }
        totalQ = onVit;
      }
      const targetOnShelf = Math.max(0, totalQ - onVit);
      const curList = S.shelfPlacements.filter(p => p.id === id);
      if (curList.length > targetOnShelf) {
        let toRemove = curList.length - targetOnShelf;
        // Снимаем в первую очередь верхние предметы из стопок
        curList.sort((a, b) => b.y - a.y);
        for (let k = 0; k < curList.length && toRemove > 0; k++) {
          const idx = S.shelfPlacements.indexOf(curList[k]);
          if (idx >= 0) {
            S.shelfPlacements.splice(idx, 1);
            toRemove--;
          }
        }
      } else if (curList.length < targetOnShelf) {
        let toAdd = targetOnShelf - curList.length;
        while (toAdd > 0) {
          const sp = findFreeShelfSpot(S.shelfPlacements, id, null);
          S.shelfPlacements.push({
            uid: 'sh_' + Math.random().toString(36).slice(2, 9),
            id, x: sp.x, y: sp.y, z: sp.z, ry: sp.ry
          });
          toAdd--;
        }
      }
    }
    sanitizeShelfPlacements(S.shelfPlacements);
  }

  const invisHitMat = new THREE.MeshBasicMaterial({ visible: false });
  function buildFood() {
    foodGroup.children.slice().forEach(c => foodGroup.remove(c));
    const S = ctx.getS(); if (!S || !ctx.GOODS) return;
    syncShelfPlacements(S);
    // Каждая единица товара на полках рисуется строго на своём индивидуальном месте (включая вертикальные стопки)
    for (const entry of S.shelfPlacements) {
      const id = entry.id;
      const spec = shelfSpecOf(id);
      const m = itemMesh(id);
      m.position.set(entry.x, entry.y, entry.z);
      m.rotation.y = entry.ry || 0;
      const w = Math.max(.07, spec.w);
      const h = Math.max(.035, spec.h);
      const d = Math.max(.07, spec.d);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), invisHitMat);
      hit.position.set(0, h / 2, 0);
      m.add(hit);
      m.userData.shelfGoodId = id;
      m.userData.shelfUid = entry.uid;
      m.traverse(o => {
        if (o.isMesh) {
          o.userData.shelfGoodId = id;
          o.userData.shelfUid = entry.uid;
          o.userData.shelfRoot = m;
        }
      });
      foodGroup.add(m);
    }
  }
  function priceTag(id, price, q) {
    const t = ctex(160, 80, (g, w, h) => { g.fillStyle = '#f3efe2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b03a2e'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); g.fillStyle = '#1a1a1a'; g.font = '700 22px Arial'; g.textAlign = 'center'; g.fillText(goodShortOf(id), w / 2, 28); g.fillStyle = '#b03a2e'; g.font = '900 30px Arial'; g.fillText(ctx.fmt(price) + ' р', w / 2, 62); if (!q) { g.fillStyle = '#0009'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 26px Arial'; g.fillText('НЕТ', w / 2, 50); } });
    const paperBack = std({ color: 0xebe4d2, roughness: .92 });
    const frontMat = std({ map: t, roughness: .9 });
    return new THREE.Mesh(new THREE.BoxGeometry(.13, .065, .003), [paperBack, paperBack, paperBack, paperBack, frontMat, paperBack]);
  }
  const emptySlotMat = new THREE.MeshStandardMaterial({ color: 0xd8efe6, roughness: .25, metalness: .1, transparent: true, opacity: .28, depthWrite: false });
  const slotHitMat = new THREE.MeshBasicMaterial({ visible: false });
  let shelfSig = '';
  function updateShelves() {
    const S = ctx.getS(); if (!S) return;
    syncShelfPlacements(S);
    const maxSlots = ctx.slotCount ? ctx.slotCount() : 6;
    const stockKey = Object.keys(ctx.GOODS || {}).map(k => k + ':' + ctx.qOf(k)).join(',') + '|h:' + ((S.hidden && S.hidden.samogon) || 0) + ',' + ((S.hidden && S.hidden.kontra) || 0);
    const plcKey = (S.shelfPlacements || []).map(p => p.uid).join(',');
    const scKey = (S.slotCounts || []).slice(0, maxSlots).join(',');
    const sig = S.slots.slice(0, maxSlots).join(',') + '|' + scKey + '|' + S.slots.slice(0, maxSlots).map(id => id ? ctx.qOf(id) + ':' + ctx.sellPrice(id) : '').join(',') + '|' + stockKey + '|' + plcKey + '|' + S.day + '|' + maxSlots;
    if (sig === shelfSig) return; shelfSig = sig;
    shelfGroup.children.slice().forEach(c => { shelfGroup.remove(c); if (c.userData.isTag) { if (Array.isArray(c.material)) c.material.forEach(m => m.map && m.map.dispose()); else if (c.material && c.material.map) c.material.map.dispose(); if (c.geometry) c.geometry.dispose(); } });
    for (let i = 0; i < Math.min(maxSlots, SLOT_POS.length); i++) {
      const [x, y] = SLOT_POS[i];
      const id = S.slots[i];
      // Объём слота стеклянной витрины
      const hitBox = new THREE.Mesh(new THREE.BoxGeometry(.34, .22, .22), slotHitMat);
      hitBox.position.set(x, y + .11, KD - .14);
      hitBox.userData.showcaseSlot = i;
      shelfGroup.add(hitBox);
      if (!id) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(.22, .005, .14), emptySlotMat);
        pad.position.set(x, y + .006, KD - .14);
        pad.userData.showcaseSlot = i;
        shelfGroup.add(pad);
        continue;
      }
      // На витрине рисуется ровно столько штук (n), сколько игрок сам туда поставил рукой:
      // плоские/широкие предметы (газеты, шоколад, жвачка, килька, хлеб, кассеты) складываются стопкой вверх по одной без наложения!
      const n = Math.min(5, Math.max(1, (S.slotCounts && S.slotCounts[i]) || 1));
      const q = ctx.qOf(id);
      const spec = shelfSpecOf(id);
      const stackOnVit = ['paper', 'choc', 'gum', 'kilka', 'tape', 'bread', 'kontra'].includes(id);
      for (let k = 0; k < n; k++) {
        const m = itemMesh(id);
        if (stackOnVit) {
          m.position.set(x + (k % 2 ? .003 : -.003), y + .01 + k * spec.h, KD - .14);
          m.rotation.y = Math.PI + (k % 2 ? .04 : -.04);
        } else {
          const stepX = Math.min(.075, .26 / Math.max(1, n - 1));
          m.position.set(x + (k - (n - 1) / 2) * stepX, y + .01, KD - .14 + (k % 2 ? .022 : -.018));
          m.rotation.y = Math.PI + (k % 2 ? .06 : -.06);
        }
        m.traverse(o => { if (o.isMesh) { o.userData.showcaseSlot = i; o.userData.showcaseGoodId = id; } });
        shelfGroup.add(m);
      }
      // Ценники развёрнуты лицевой стороной наружу (+Z, к окну витрины и покупателям на улице)
      const tag = priceTag(id, ctx.sellPrice(id), q); tag.userData.isTag = true;
      const tagY = y < 1.1 ? (y + .038) : (y - .028);
      tag.position.set(x, tagY, KD - .052);
      tag.rotation.set(-.12, 0, 0);
      tag.userData.showcaseSlot = i;
      tag.userData.showcaseGoodId = id;
      shelfGroup.add(tag);
    }
    buildFood();
    drawCalendar(); drawRateBoard();
  }
  let lastCalDay = -1;
  function calInfoOf(S) {
    const d0 = S ? S.day : 0;
    const mIdx = ctx.monthOf(d0), yr = ctx.yearOf(d0);
    const mName = ctx.MONTHS[mIdx].toUpperCase();
    const GEN = ['ЯНВАРЯ','ФЕВРАЛЯ','МАРТА','АПРЕЛЯ','МАЯ','ИЮНЯ','ИЮЛЯ','АВГУСТА','СЕНТЯБРЯ','ОКТЯБРЯ','НОЯБРЯ','ДЕКАБРЯ'];
    // Каждый игровой день отчётливо продвигает дату на календаре (начиная со 2-го числа месяца, 15 дней = 1 месяц)
    const dayInMonth = d0 % 15;
    const curDate = Math.min(30, 2 + dayInMonth * 2);
    const gameDayNum = d0 + 1;
    return { d0, mIdx, yr, mName, mGen: GEN[mIdx] || mName, curDate, gameDayNum };
  }
  function drawCalendar() {
    const S = ctx.getS(), c = calTex.userData.canvas, g = c.getContext('2d'), w = c.width, h = c.height;
    const info = calInfoOf(S);
    g.fillStyle = '#f3ecda'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8b7e66'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    // Верхняя иллюстрация с зимними горами и крупным отрывным блоком текущего дня
    const gr = g.createLinearGradient(0, 18, 0, 165); gr.addColorStop(0, '#547899'); gr.addColorStop(1, '#d9b382');
    g.fillStyle = gr; g.fillRect(20, 20, w - 40, 145);
    g.fillStyle = '#283848'; g.beginPath(); g.moveTo(20, 165); g.lineTo(145, 78); g.lineTo(255, 132); g.lineTo(375, 62); g.lineTo(w - 20, 165); g.fill();
    // Плашка текущего игрового дня и точной даты
    g.fillStyle = 'rgba(245, 238, 222, 0.94)'; g.fillRect(34, 30, w - 68, 76);
    g.strokeStyle = '#b02a1e'; g.lineWidth = 4; g.strokeRect(34, 30, w - 68, 76);
    g.fillStyle = '#b02a1e'; g.font = '900 34px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${info.curDate} ${info.mGen} ${info.yr}`, w / 2, 54);
    g.fillStyle = '#1e1c18'; g.font = '900 24px Arial, sans-serif';
    g.fillText(`ДЕНЬ ${info.gameDayNum}`, w / 2, 88);
    // Заголовок месяца и года
    g.fillStyle = '#b02a1e'; g.font = '900 46px Arial, sans-serif';
    g.fillText(`${info.mName} ${info.yr}`, w / 2, 205);
    // Дни недели
    const DOW = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
    const gx0 = 54, dx = 67, gy0 = 252, dy = 68;
    g.font = '900 22px Arial, sans-serif';
    for (let k = 0; k < 7; k++) {
      g.fillStyle = k >= 5 ? '#b02a1e' : '#4a453d';
      g.fillText(DOW[k], gx0 + k * dx, gy0);
    }
    g.strokeStyle = '#b5a88e'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(24, gy0 + 22); g.lineTo(w - 24, gy0 + 22); g.stroke();
    // Сетка 30 дней с отчётливо зачёркнутыми прошедшими днями и обведённым сегодняшним числом
    const startDow = (info.mIdx * 2) % 7;
    for (let dayNum = 1; dayNum <= 30; dayNum++) {
      const cell = (dayNum - 1) + startDow;
      const col = cell % 7, row = Math.floor(cell / 7);
      const cx = gx0 + col * dx, cy = gy0 + 62 + row * dy;
      if (dayNum === info.curDate) {
        g.fillStyle = 'rgba(192, 42, 28, 0.16)';
        g.beginPath(); g.arc(cx, cy, 29, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = dayNum === info.curDate ? '#b01e14' : (col >= 5 ? '#9c2c20' : '#1c1a17');
      g.font = dayNum === info.curDate ? '900 34px Arial, sans-serif' : '800 30px Arial, sans-serif';
      g.fillText(String(dayNum), cx, cy);
      if (dayNum < info.curDate) {
        // Прошедший день зачёркнут красным крестом фломастером
        g.strokeStyle = 'rgba(188, 28, 20, 0.88)';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(cx - 20, cy - 18); g.lineTo(cx + 20, cy + 18);
        g.moveTo(cx + 20, cy - 18); g.lineTo(cx - 20, cy + 18);
        g.stroke();
      } else if (dayNum === info.curDate) {
        // Текущий день жирно обведён красным кружком
        g.strokeStyle = '#c41e14';
        g.lineWidth = 5.5;
        g.beginPath(); g.arc(cx, cy, 29, 0, Math.PI * 2); g.stroke();
      }
    }
    calTex.needsUpdate = true;
  }

  // ---------- здание обмена валют убрано по запросу (обмен доступен в меню) ----------
  const BOOTH = { x: 9999, z: 9999 };
  function drawRateBoard() {}

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
  // ---------- мусорные контейнеры (советские 0,75 м³), урны, мусор вокруг ----------
  const binGeo = (() => { const g = new THREE.CylinderGeometry(.86, .74, 1.05, 4, 1); g.rotateY(Math.PI / 4); g.scale(1, 1, .72); g.translate(0, .62, 0); return g; })();
  const lidGeo = new THREE.BoxGeometry(.6, .03, .95);
  const bagMat = std({ color: 0x141618, roughness: .35, metalness: .1 });
  const cardTex = regTex(ctex(256, 256, (g, w, h) => { g.fillStyle = '#9a7a52'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${60 + Math.random() * 60},${45 + Math.random() * 40},25,${Math.random() * .25})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1); }
    g.strokeStyle = 'rgba(60,40,20,.5)'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = 'rgba(40,30,20,.7)'; g.font = '700 26px Arial'; g.fillText('ГОСТ 9142-84', 40, 120); g.font = '22px Arial'; g.fillText('НЕ КАНТОВАТЬ', 50, 160); g.fillStyle = 'rgba(70,50,30,.35)'; g.beginPath(); g.ellipse(170, 200, 50, 26, .3, 0, 7); g.fill(); }));
  const cardMat = std({ map: cardTex, roughness: .95 });
  const concreteMat = std({ ...pbrT('concrete', 1, 1), color: 0xb8b4ac, roughness: 1 });
  // Мусорные контейнеры: все рабочие — крышки откинуты назад на петлях, внутри тёмный короб с пакетами.
  // TRASH_BIG — точки, куда можно выбросить что угодно (коробку, ружьё, бутылку).
  const TRASH_BIG = [], TRASH_SMALL = [];
  const binOpenGeo = (() => { const g = new THREE.CylinderGeometry(.86, .74, 1.05, 4, 1, true); g.rotateY(Math.PI / 4); g.scale(1, 1, .72); g.translate(0, .62, 0); return g; })();
  const binInMat = std({ color: 0x15140f, roughness: 1, side: THREE.BackSide });
  const trashHolders = [];
  function binGroup(x, z, n, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.userData.dyn = true; scene.add(g);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(n * 1.45 + .6, .12, 1.7), concreteMat); pad.position.y = .06; pad.receiveShadow = true; g.add(pad);
    for (let i = 0; i < n; i++) {
      const bx = (i - (n - 1) / 2) * 1.45;
      const slot = new THREE.Group(); slot.position.set(bx, .12, 0); slot.userData.dyn = true; g.add(slot);
      const b = new THREE.Mesh(binOpenGeo, MAT.bin); b.castShadow = b.receiveShadow = true; slot.add(b);
      const bi = new THREE.Mesh(binOpenGeo, binInMat); bi.scale.set(.97, 1, .97); slot.add(bi);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .7), std({ color: 0x15140f, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, .43, 0); slot.add(floor);
      for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(.22, 7, 5), bagMat); m.scale.set(1, .7, 1); m.position.set(R(-.32, .32), .55 + R(0, .12), R(-.16, .16)); slot.add(m); }
      trashHolders.push(slot);
      g.updateMatrixWorld(true); const wp = g.localToWorld(new THREE.Vector3(bx, 0, 0)); TRASH_BIG.push({ x: wp.x, z: wp.z, y: 1.15 });
    }
    g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(pad); addCol(bb.min.x, bb.max.x, bb.min.z, bb.max.z); occ(pad);
  }
  // Оставлена только одна мусорка — бак через дорогу напротив ларька (заменяется на модель trashcan.glb)
  binGroup(4.8, 17.55, 1, Math.PI);
  // урны: бетонные «вазоны» с полостью — в них выбрасывается мелкий мусор (окурки, бутылки)
  { const prof = [[.2, 0], [.235, .04], [.26, .56], [.275, .6], [.275, .63], [.215, .63], [.2, .58], [.18, .3]].map(([r, y]) => new THREE.Vector2(r, y));
    const urnGeo = new THREE.LatheGeometry(prof, 14), urnMat = concreteMat.clone(); urnMat.side = THREE.DoubleSide; const urnIn = std({ color: 0x1a1814, roughness: 1 });
    const bottom = new THREE.CircleGeometry(.18, 14); bottom.rotateX(-Math.PI / 2); bottom.translate(0, .3, 0);
    const litter = new THREE.SphereGeometry(.06, 6, 4), litterM = [std({ color: 0xd8d0bc, roughness: .9 }), std({ color: 0x6a4a2c, roughness: .9 }), bagMat];
    for (const [x, z] of [[KW + .7, KD + .9], [5.8, 4.9], [11.2, 4.9], [-3.6, 5.4], [26, 4.9], [-30, 4.9], [2, 17.6], [-18, 17.6]]) {
      const u = new THREE.Mesh(urnGeo, urnMat); u.position.set(x, 0, z); u.castShadow = u.receiveShadow = true; scene.add(u);
      const bt = new THREE.Mesh(bottom, urnIn); bt.position.set(x, 0, z); scene.add(bt);
      for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(litter, litterM[k % 3]); m.position.set(x + R(-.08, .08), .33 + k * .02, z + R(-.08, .08)); m.scale.set(1, .6, 1); scene.add(m); } // смятая бумага
      addCol(x - .26, x + .26, z - .26, z + .26); TRASH_SMALL.push({ x, z, y: .7 }); } }
  const neons = [];
  const signs = [['ВИДЕОПРОКАТ', '#1a2a4a', '#e8d070', -32, 18.95], ['КОМИССИОННЫЙ', '#4a1a1a', '#f0e0c0', 14, 18.95], ['ГАСТРОНОМ', '#2a3a2a', '#e0d8b0', -14, 18.95], ['РЕМОНТ ОБУВИ', '#3a3a3a', '#f0e8d0', 30, 18.95]];
  for (const [t, bg, fg, x, z] of signs) { const tx = textTex(512, 96, t, bg, fg, '900 52px Arial'); const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .6), std({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0 })); m.position.set(x, 3.4, z); scene.add(m); m.userData.neon = true; neons.push(m); }

  // ---------- советские мелочи на улице: таксофон, автомат газводы, бочка кваса, афишные тумбы, почтовый ящик, табличка улицы, стенд ----------
  {
    const at = (o, x, z, ry = 0) => { o.position.set(x, 0, z); o.rotation.y = ry; o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); scene.add(o); return o; };
    const plate = (tex, w, h, x, y, z, parent, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tex, roughness: .7 })); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; };
    const steel = std({ color: 0x6d7275, roughness: .5, metalness: .6 }), glassS = std({ color: 0x9fb0b8, roughness: .1, metalness: .2, transparent: true, opacity: .35 });
    // таксофон: будка из серого металла с красной полосой и стеклом, внутри аппарат
    { const g = new THREE.Group(), red = std({ color: 0xa8302a, roughness: .55, metalness: .3 }), grey = std({ color: 0xb9bcb8, roughness: .6, metalness: .35 });
      box(.95, .08, .95, grey, 0, 2.28, 0, g); box(.9, .25, .9, red, 0, 2.12, 0, g); box(.9, .06, .9, grey, 0, .03, 0, g);
      for (const [x, z] of [[-.44, -.44], [.44, -.44], [-.44, .44], [.44, .44]]) box(.05, 2.0, .05, grey, x, 1.0, z, g);
      box(.88, 2.0, .03, grey, 0, 1.0, -.44, g); box(.03, 1.1, .88, grey, -.44, .55, 0, g); box(.03, 1.1, .88, grey, .44, .55, 0, g);
      box(.03, .85, .86, glassS, -.44, 1.55, 0, g); box(.03, .85, .86, glassS, .44, 1.55, 0, g);
      const tt = textTex(256, 48, 'ТАКСОФОН', '#a8302a', '#f2ede2', '700 34px Arial'); plate(tt, .8, .16, 0, 2.12, .452, g);
      box(.26, .4, .14, std({ color: 0x3a3c3e, roughness: .4, metalness: .6 }), 0, 1.35, -.36, g); box(.06, .2, .06, std({ color: 0x1a1a1a, roughness: .5 }), -.09, 1.42, -.27, g); // аппарат и трубка
      at(g, -11.2, 1.25, 0); addCol(-11.7, -10.7, .78, 1.72); }
    // автомат «Газированная вода»: красный шкаф, стакан в мойке
    { const g = new THREE.Group(), red = std({ color: 0xb33a2e, roughness: .5, metalness: .35 });
      box(.7, 1.6, .5, red, 0, .8, 0, g); box(.72, .06, .52, std({ color: 0xd8d4c8, roughness: .5, metalness: .3 }), 0, 1.63, 0, g);
      const gt = regTex(ctex(256, 128, (c, w, h) => { c.fillStyle = '#efe7d2'; c.fillRect(0, 0, w, h); c.fillStyle = '#a3261d'; c.font = '700 30px Arial'; c.textAlign = 'center'; c.fillText('ГАЗИРОВАННАЯ', w / 2, 44); c.fillText('ВОДА', w / 2, 82); c.font = '20px Arial'; c.fillStyle = '#333'; c.fillText('без сиропа 1 к.  с сиропом 3 к.', w / 2, 114); speckle(c, w, h, 400, ['#0003', '#fff2'], 2); }));
      plate(gt, .6, .3, 0, 1.38, .252, g); box(.34, .36, .1, std({ color: 0x2a2c2e, roughness: .4, metalness: .5 }), 0, .9, .22, g); // ниша с мойкой
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(.035, .03, .1, 10), glassS); cup.position.set(.05, .78, .24); g.add(cup);
      at(g, -9.8, 1.05, 0); addCol(-10.15, -9.45, .8, 1.3); }
    // афишные тумбы с облезлыми плакатами
    const afTex = regTex(ctex(512, 256, (c, w, h) => { c.fillStyle = '#d8d0bc'; c.fillRect(0, 0, w, h);
      const ps = [['#b23a2a', '#f0e6cc', 'ЦИРК'], ['#2a4a7a', '#f0e6cc', 'КИНО'], ['#e0c050', '#3a2a1a', 'ВЫБОРЫ'], ['#3a6a3a', '#f0e6cc', 'ТАНЦЫ'], ['#8a2a5a', '#f0e6cc', 'ЛОТО']];
      ps.forEach(([bg, fg, t], i) => { const x = i * 102 + 4, y = 14 + (i % 2) * 30; c.fillStyle = bg; c.fillRect(x, y, 94, 190); c.fillStyle = fg; c.font = '700 22px Arial'; c.textAlign = 'center'; c.fillText(t, x + 47, y + 40); c.fillRect(x + 12, y + 60, 70, 3); c.fillRect(x + 12, y + 75, 50, 3); });
      for (let i = 0; i < 26; i++) { c.fillStyle = '#d8d0bc'; c.globalAlpha = .9; c.fillRect(R(0, w), R(0, h), R(8, 40), R(6, 30)); } c.globalAlpha = 1; speckle(c, w, h, 1500, ['#0003', '#fff2'], 2); stains(c, w, h, 10); }));
    for (const [x, z] of [[21, 1.4], [-42, 17.9]]) { const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, 2.2, 20, 1, true), std({ map: afTex, roughness: .8, side: THREE.DoubleSide })); body.position.y = 1.25; g.add(body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.35, .65, .3, 20), std({ color: 0x5a6a5e, roughness: .6, metalness: .3 })); cap.position.y = 2.5; g.add(cap);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(.6, .62, .15, 20), std({ color: 0x5a6a5e, roughness: .6, metalness: .3 })); base.position.y = .075; g.add(base);
      at(g, x, z, R(0, 6.28)); addCol(x - .6, x + .6, z - .6, z + .6); }
    // синий почтовый ящик на столбике
    { const g = new THREE.Group(), blue = std({ color: 0x2c5aa0, roughness: .45, metalness: .4 });
      box(.06, 1.0, .06, steel, 0, .5, 0, g); box(.42, .5, .26, blue, 0, 1.25, 0, g); box(.3, .03, .02, std({ color: 0x111111 }), 0, 1.4, .135, g);
      plate(textTex(128, 40, 'ПОЧТА', '#2c5aa0', '#f2f2f2', '700 26px Arial'), .3, .09, 0, 1.18, .132, g);
      at(g, -12.6, 1.4, 0); addCol(-12.85, -12.35, 1.2, 1.6); }
    // табличка с названием улицы на столбике у перехода
    { const g = new THREE.Group(); box(.06, 2.6, .06, steel, 0, 1.3, 0, g);
      const st = textTex(384, 96, 'ул. Индустриальная', '#1f3f7a', '#f2f2f2', '700 40px Arial'); plate(st, 1.0, .25, 0, 2.45, .035, g); plate(st, 1.0, .25, 0, 2.45, -.035, g, Math.PI);
      at(g, -7.0, 5.4, 0); addCol(-7.08, -6.92, 5.32, 5.48); }
    // стенд-лозунг «Слава труду!» у дороги (облупленный, остался с советских времён)
    { const g = new THREE.Group();
      const sl = regTex(ctex(512, 160, (c, w, h) => { c.fillStyle = '#9c2a22'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d9b44a'; c.lineWidth = 6; c.strokeRect(8, 8, w - 16, h - 16); c.fillStyle = '#e8d9a8'; c.font = '900 64px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('СЛАВА ТРУДУ!', w / 2, h / 2 + 4);
        for (let i = 0; i < 40; i++) { c.fillStyle = '#7a6a5a'; c.globalAlpha = R(.3, .8); c.fillRect(R(0, w), R(0, h), R(2, 18), R(2, 10)); } c.globalAlpha = 1; speckle(c, w, h, 1200, ['#0004', '#fff2'], 2); stains(c, w, h, 8); }));
      for (const x of [-1.7, 1.7]) box(.1, 3.2, .1, steel, x, 1.6, 0, g);
      plate(sl, 3.8, 1.2, 0, 2.6, .06, g); box(3.9, 1.26, .06, std({ color: 0x55595b, roughness: .7, metalness: .4 }), 0, 2.6, 0, g);
      at(g, -48, 0.6, 0); addCol(-49.8, -46.2, .5, .7); }
  }

  // ---------- газеты на дороге и тротуарах (вымышленные городские газеты 1992 г.), часть носит ветром ----------
  const paperTex = ['ВЕЧЕРНИЙ КУРЬЕР', 'ГОЛОС ТРУДА', 'ГОРОДСКИЕ ВЕСТИ'].map((title, vi) => regTex(ctex(512, 360, (g, w, h) => {
    g.fillStyle = ['#e4dcc6', '#ddd5bd', '#e8e2d0'][vi]; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c1a18'; g.font = '900 40px "Times New Roman", serif'; g.textAlign = 'center'; g.fillText(title, w / 2, 46); g.font = '12px serif'; g.fillText('№ ' + (40 + vi * 17) + ' · ' + ['14 января', '3 марта', '22 октября'][vi] + ' 1992 г. · Цена 50 коп.', w / 2, 66);
    g.fillRect(14, 72, w - 28, 2); g.fillRect(14, 76, w - 28, 1);
    g.font = '900 24px Arial'; g.textAlign = 'left'; g.fillText(['ЦЕНЫ ОТПУЩЕНЫ', 'ВАУЧЕР — КАЖДОМУ', 'ЗИМА БЕЗ ОТОПЛЕНИЯ?'][vi], 18, 104);
    g.fillStyle = '#6a6660'; g.fillRect(18 + (vi % 2) * 250, 118, 220, 120); for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? 30 : 160},${Math.random() < .5 ? 30 : 160},${Math.random() < .5 ? 30 : 160},.25)`; g.fillRect(18 + (vi % 2) * 250 + Math.random() * 220, 118 + Math.random() * 120, 2, 2); } // фото
    g.fillStyle = 'rgba(30,28,26,.75)'; const L = 'абвгдежзиклмнопрстуфхцчшэюя'; g.font = '9px serif';
    for (let c = 0; c < 4; c++) for (let y = 120; y < h - 12; y += 10) { const x0 = 18 + c * 122; if (y < 242 && (vi % 2 ? x0 > 250 : x0 < 240)) continue; let t = ''; for (let k = 0; k < 26; k++) t += Math.random() < .17 ? ' ' : L[Math.floor(Math.random() * L.length)]; g.fillText(t, x0, y); }
    for (let i = 0; i < 5; i++) { const gr = g.createRadialGradient(Math.random() * w, Math.random() * h, 5, Math.random() * w, Math.random() * h, 90); gr.addColorStop(0, 'rgba(120,100,60,.25)'); gr.addColorStop(1, 'rgba(120,100,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } // подтёки, грязь
    g.strokeStyle = 'rgba(80,70,50,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); // сгиб
  })));
  const paperGeos = [0, 1, 2].map(v => { const g = new THREE.PlaneGeometry(.58, .41, 8, 6); g.rotateX(-Math.PI / 2); const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setY(i, .004 + Math.abs(Math.sin(x * 9 + v) * .012) + Math.max(0, Math.abs(x) - .22) * (.08 + v * .03) + Math.sin(z * 14 + x * 5 + v * 2) * .006); } g.computeVertexNormals(); return g; });
  const paperMats = paperTex.map(t => std({ map: t, roughness: .95, side: THREE.DoubleSide }));
  const groundPapers = [];
  { const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), S4 = new THREE.Vector3();
    for (let v = 0; v < 3; v++) { const pts = []; for (let i = 0; i < 24; i++) { const z = pick([R(6.6, 13.8), R(6.6, 13.8), R(1.6, 6), R(14.6, 18.2), R(-30, -4)]), x = R(-62, 66); if (Math.abs(x) < KW + .5 && Math.abs(z) < KD + .5) continue; pts.push([x, z]); }
      const im = new THREE.InstancedMesh(paperGeos[v], paperMats[v], pts.length); groundPapers.push(im); pts.forEach(([x, z], i) => { const sc = Math.random() < .35 ? .55 : 1; im.setMatrixAt(i, M4.compose(new THREE.Vector3(x, .012, z), Q4.setFromEuler(new THREE.Euler(0, R(0, 6.28), 0)), S4.set(sc, 1, sc))); }); im.receiveShadow = true; scene.add(im); } }
  const flyPapers = []; for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(paperGeos[i % 3], paperMats[i % 3]); m.position.set(R(-20, 20), .02, R(2, 17)); m.userData = { vy: 0, spin: 0, air: 0, dyn: true }; m.castShadow = true; scene.add(m); flyPapers.push(m); }
  function paperTick(dt) { // лист подхватывает порывом, крутит и опускает
    const on = !ctx.settings || ctx.settings().litter !== 0; // настройка «Летающий мусор и газеты»
    for (const g of groundPapers) g.visible = on;
    for (const m of flyPapers) { m.visible = on; if (!on) continue; const u = m.userData, w = windVec.length(); const ox = m.position.x, oz = m.position.z;
      if (u.air <= 0 && w > 1.2 && Math.random() < dt * w * .25) { u.air = R(1, 3); u.vy = R(.6, 1.6); u.spin = R(-4, 4); }
      if (u.air > 0) { u.air -= dt; m.position.x += windVec.x * dt * .9; m.position.z += windVec.y * dt * .9; m.position.y = Math.max(.02, m.position.y + u.vy * dt); u.vy -= dt * 1.6; m.rotation.x += u.spin * dt * .6; m.rotation.z += u.spin * dt; }
      else { m.position.y = Math.max(.02, m.position.y - dt * .5); m.rotation.x *= .9; m.rotation.z *= .9; if (Math.random() < dt * w * .3) { m.position.x += windVec.x * dt * .4; m.position.z += windVec.y * dt * .4; m.rotation.y += dt * .5; } }
      if (Math.abs(m.position.x) < KW + .25 && Math.abs(m.position.z) < KD + .25) { m.position.x = ox; m.position.z = oz; u.air = Math.min(u.air, .2); } // в ларёк газеты не залетают — упираются в стену
      if (Math.hypot(m.position.x - P.x, m.position.z - P.z) > 30) { m.position.set(P.x + R(-15, 15), .02, clamp(P.z + R(-10, 10), 1.5, 18)); if (Math.abs(m.position.x) < KW + .5 && Math.abs(m.position.z) < KD + .5) m.position.x += 4; } }
  }

  // ---------- фонари и провода ----------
  const lampHeads = [], poles = [], lampPools = [];
  const poleMat = std({ color: 0x6a6c68, metalness: .4, roughness: .8 }); const lampBody = hdMat('darkmetal', { scale: .3, metal: .5, color: 0x8a8a84 });
  const lampHeadGeo = (() => { const g = new THREE.SphereGeometry(.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1.25, .45, .7); return g; })();
  for (let x = -426; x <= 74; x += 20) {
    const p = cyl(.075, .11, 5.4, poleMat, x, 2.7, 5.95, 8); poles.push(new THREE.Vector3(x, 5.15, 5.95));
    cyl(.14, .16, .5, poleMat, x, .25, 5.95, 8);
    const arm = cyl(.03, .03, 1.3, MAT.steel, x, 5.12, 6.5, 6); arm.rotation.x = Math.PI / 2 - .28;
    const head = new THREE.Mesh(lampHeadGeo, lampBody); head.position.set(x, 5.2, 7.2); head.castShadow = true; scene.add(head);
    const hd = box(.42, .025, .2, MAT.lampHead, x, 5.1, 7.22); lampHeads.push(hd);
    lampPools.push([x, 7.2]);
    addCol(x - .14, x + .14, 5.82, 6.08);
  }
  const wireMat = new THREE.LineBasicMaterial({ color: 0x151515 });
  for (let i = 0; i < poles.length - 1; i++) for (const dy of [0, -.35]) {
    const a = poles[i], b = poles[i + 1], pts = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new THREE.Vector3(lerp(a.x, b.x, t), a.y + dy - Math.sin(t * Math.PI) * .9, a.z)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }
  for (const x of [-26, -6, 14, 34]) { const pl = new THREE.PointLight(0xffb060, 0, 22, 1.45); pl.position.set(x, 4.9, 7.2); pl.castShadow = false; if (!LITE) scene.add(pl); streetLights.push(pl); } // 4 динамических источника света перемещаются за игроком к ближайшим столбам

  // ---------- ПРИДОРОЖНЫЕ УКАЗАТЕЛИ И СТЕЛА КРАСНОЗАВОДСКОГО ЗАВОДА ----------
  const roadSignGroup = new THREE.Group(); roadSignGroup.userData.dyn = true; scene.add(roadSignGroup);
  const mkKmSign = (kmText, sx) => {
    const kmTex = textTex(256, 128, kmText, '#1c4474', '#ffffff', '900 24px Arial', (g, w, h) => {
      g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
    });
    const sg = box(.72, .38, .04, [std({ color: 0x333 }), std({ color: 0x333 }), std({ color: 0x333 }), std({ color: 0x333 }), std({ map: kmTex, roughness: .5 }), std({ map: kmTex, roughness: .5 })], sx, 2.1, 5.85, roadSignGroup);
    cyl(.04, .04, 2.1, MAT.steel, sx, 1.05, 5.85, 8, roadSignGroup);
  };
  mkKmSign('ЗАВОД · 2 КМ', -170);
  mkKmSign('ЗАВОД · 1 КМ', -270);

  // Большая светящаяся въездная стела завода у поворота (x = -305, z = 4.2)
  const steleGroup = new THREE.Group(); steleGroup.position.set(-305, 0, 4.2); roadSignGroup.add(steleGroup);
  box(2.8, .6, 1.2, std({ color: 0x6e706c, roughness: .9 }), 0, .3, 0, steleGroup);
  box(1.8, 6.2, .45, std({ color: 0x8a241c, roughness: .6 }), 0, 3.4, 0, steleGroup);
  cyl(.75, .75, .12, std({ color: 0xd4a72c, metalness: .8, roughness: .3 }), 0, 5.8, 0, 16, steleGroup).rotation.x = Math.PI / 2;
  box(.38, .38, .16, std({ color: 0xb82018, roughness: .3 }), 0, 5.8, 0, steleGroup); // звезда
  const steleTex = textTex(256, 512, 'КРАСНОЗАВОДСКИЙ ЗАВОД', '#8a241c', '#f5e8c4', '900 20px Arial');
  const steleFace = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.8), std({ map: steleTex, emissive: 0xffeedd, emissiveMap: steleTex, emissiveIntensity: .35, roughness: .5 }));
  steleFace.position.set(0, 3.2, .24); steleGroup.add(steleFace);
  addCol(-306.6, -303.4, 3.4, 5.0);

  // ---------- ДЕРЕВЬЯ И СУГРОБЫ ВДОЛЬ ШОССЕ (x = -65 .. -305) ----------
  const hwySpots = [];
  for (let hx = -72; hx >= -300; hx -= 14) {
    hwySpots.push([hx + R(-2, 2), R(-4.5, -9.5), R(.65, .95), R(0, 6.28)]);
    hwySpots.push([hx + R(-2, 2), R(20.5, 23.5), R(.65, .95), R(0, 6.28)]);
  }

  // ---------- ЛОКАЦИЯ «КРАСНОЗАВОДСКИЙ ЗАВОД» (x = -305 .. -375, z = -39 .. +1.2) ----------
  const factoryGroup = new THREE.Group();
  factoryGroup.userData.dyn = true;
  scene.add(factoryGroup);
  const fBox = (w, h, d, m, x, y, z, cast = true) => box(w, h, d, m, x, y, z, factoryGroup, cast);
  const fCyl = (rt_, rb, h, m, x, y, z, seg = 14) => cyl(rt_, rb, h, m, x, y, z, seg, factoryGroup);

  const fBrickTex = regTex(ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#6e3428'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = '#4a3e38'; g.fillRect(0, y, w, 2);
      const off = (y / 16) % 2 ? 16 : 0;
      for (let x = -off; x < w; x += 32) {
        g.fillStyle = pick(['#78382a', '#642c20', '#824030', '#5c2a20', '#6d3528']);
        g.fillRect(x + 2, y + 2, 29, 13);
      }
    }
    speckle(g, w, h, 3500, ['#3a2018', '#8e4c3a', '#281812'], 2);
    stains(g, w, h, 14, 'rgba(20,15,12,');
  }, [6, 3]));
  const fBrickMat = std({ map: fBrickTex, roughness: .9 });
  const fBrickWallMat = std({ map: repTex(fBrickTex, 10, 4), roughness: .9 });
  const fConcreteMat = std({ color: 0x7e7c76, roughness: .92 });
  const fDarkSteelMat = std({ color: 0x2d3236, roughness: .55, metalness: .65 });
  const fGateMat = std({ color: 0x24362c, roughness: .6, metalness: .5 });
  const fFloorMat = std({ color: 0x766c5a, roughness: .95 });
  const fWallInMat = std({ color: 0x829486, roughness: .92 }); // советская светлая фисташково-зелёная штукатурка стен проходной
  const fWinGlowTex = regTex(ctex(256, 128, (g, w, h) => {
    g.fillStyle = '#1c2428'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
      const lit = (r + c) % 2 === 0 || c === 2;
      g.fillStyle = lit ? '#d89a48' : '#2a363c';
      g.fillRect(8 + c * 41, 8 + r * 58, 35, 48);
      g.strokeStyle = '#14181a'; g.lineWidth = 3;
      g.strokeRect(8 + c * 41, 8 + r * 58, 35, 48);
    }
  }));
  const fWinMat = std({ map: fWinGlowTex, emissive: 0xffa844, emissiveMap: fWinGlowTex, emissiveIntensity: .55, roughness: .35, metalness: .2 });
  neons.push({ material: fWinMat });

  // 1) Предзаводская площадь и заводской двор (центр x = -334)
  const fPlaza = new THREE.Mesh(new THREE.PlaneGeometry(48, 8.2), std({ map: repTex(TX.asphalt, 12, 3), color: 0x5c5d5e, roughness: .9 }));
  fPlaza.rotation.x = -Math.PI / 2; fPlaza.position.set(-334, .009, -2.5); fPlaza.receiveShadow = true; factoryGroup.add(fPlaza);
  const fYard = new THREE.Mesh(new THREE.PlaneGeometry(74, 34), std({ map: repTex(TX.asphalt, 18, 10), color: 0x525354, roughness: .92 }));
  fYard.rotation.x = -Math.PI / 2; fYard.position.set(-338, .006, -19.5); fYard.receiveShadow = true; factoryGroup.add(fYard);

  // 2) Заводской железобетонный периметр и въездные ворота со звёздами
  const buildFenceSeg = (x1, z1, x2, z2) => {
    const L = Math.hypot(x2 - x1, z2 - z1), ang = -Math.atan2(z2 - z1, x2 - x1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(L, 2.5, .24), fConcreteMat);
    wall.position.set(cx, 1.25, cz); wall.rotation.y = ang; wall.castShadow = wall.receiveShadow = true; factoryGroup.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(L + .08, .12, .34), std({ color: 0x62605a, roughness: .9 }));
    cap.position.set(cx, 2.56, cz); cap.rotation.y = ang; factoryGroup.add(cap);
    const nPosts = Math.max(2, Math.round(L / 4));
    for (let i = 0; i <= nPosts; i++) {
      const t = i / nPosts, px = lerp(x1, x2, t), pz = lerp(z1, z2, t);
      fBox(.36, 2.75, .36, std({ color: 0x6a6862, roughness: .9 }), px, 1.375, pz);
    }
    addCol(Math.min(x1, x2) - .2, Math.max(x1, x2) + .2, Math.min(z1, z2) - .2, Math.max(z1, z2) + .2);
  };
  buildFenceSeg(-375, -0.8, -340.2, -0.8);
  buildFenceSeg(-320.8, -0.8, -305, -0.8);
  buildFenceSeg(-375, -37.5, -375, -0.8);
  buildFenceSeg(-305, -37.5, -305, -0.8);
  buildFenceSeg(-375, -37.5, -305, -37.5);

  // Ворота завода (x = -328.2 и x = -320.8, проезд открыт!)
  for (const gx of [-328.2, -320.8]) {
    fBox(.75, 3.4, .75, fBrickMat, gx, 1.7, -0.8);
    fBox(.88, .16, .88, fConcreteMat, gx, 3.48, -0.8);
    fBox(.34, .34, .08, std({ color: 0xb82018, emissive: 0x661008, emissiveIntensity: .35, roughness: .4 }), gx, 2.75, -.38);
    addCol(gx - .42, gx + .42, -1.22, -.38);
  }
  for (const [gx, dir, ang] of [[-327.8, 1, .95], [-321.2, -1, -.95]]) {
    const leaf = new THREE.Group(); leaf.position.set(gx, 0, -0.8); leaf.rotation.y = ang; factoryGroup.add(leaf);
    box(3.1, 2.6, .08, fGateMat, dir * 1.55, 1.4, 0, leaf);
    box(2.7, .08, .12, fDarkSteelMat, dir * 1.55, 2.55, 0, leaf);
    box(2.7, .08, .12, fDarkSteelMat, dir * 1.55, .35, 0, leaf);
    box(.55, .55, .10, std({ color: 0xb82018, roughness: .45 }), dir * 1.55, 1.65, 0, leaf);
  }

  // 3) ЗДАНИЕ ПРОХОДНОЙ С ПОЛНЫМ ВХОДОМ ВНУТРЬ И БЮРО ПРОПУСКОВ (x = -334, z = -3.8)
  // Внутреннее пространство (x = -340 .. -328, z = -6.8 .. -0.8, h = 4.2). Входной проём (x = -335.6 .. -332.4) ПОЛНОСТЬЮ ОТКРЫТ!
  fBox(12.0, .04, 6.0, fFloorMat, -334, .02, -3.8, false); // пол проходной
  fBox(12.0, .04, 6.0, fConcreteMat, -334, 4.2, -3.8, false); // потолок
  fBox(12.4, .24, 6.4, fConcreteMat, -334, 4.34, -3.8); // крыша
  fBox(12.3, .10, 6.3, MAT.snow, -334, 4.51, -3.8, false).userData.winter = true; // снег на крыше

  // Северная стена со стороны улицы (z = -0.8):
  // Левое крыло (x = -340 .. -335.6)
  fBox(4.4, 4.2, .32, fBrickMat, -337.8, 2.1, -0.8); addCol(-340.2, -335.6, -1.0, -0.6);
  // Правое крыло (x = -332.4 .. -328.0)
  fBox(4.4, 4.2, .32, fBrickMat, -330.2, 2.1, -0.8); addCol(-332.4, -327.8, -1.0, -0.6);
  // Перемычка над входным проёмом (y = 2.45 .. 4.2, вход под ней абсолютно свободен!)
  fBox(3.2, 1.75, .32, fBrickMat, -334.0, 3.325, -0.8);
  // Окно в правом крыле проходной со стороны улицы
  fBox(2.2, 1.4, .12, fWinMat, -330.2, 2.0, -.62);

  // Южная стена со стороны двора завода (z = -6.8):
  fBox(4.4, 4.2, .32, fBrickMat, -337.8, 2.1, -6.8); addCol(-340.2, -335.6, -7.0, -6.6);
  fBox(4.4, 4.2, .32, fBrickMat, -330.2, 2.1, -6.8); addCol(-332.4, -327.8, -7.0, -6.6);
  fBox(3.2, 1.75, .32, fBrickMat, -334.0, 3.325, -6.8);

  // Боковые глухие кирпичные стены (западная и восточная)
  fBox(.32, 4.2, 6.0, fBrickMat, -340.0, 2.1, -3.8); addCol(-340.2, -339.6, -7.0, -0.6);
  fBox(.32, 4.2, 6.0, fBrickMat, -328.0, 2.1, -3.8); addCol(-328.4, -327.8, -7.0, -0.6);

  // Внутренняя перегородка БЮРО ПРОПУСКОВ (разделяет проходной коридор и кабинет дежурного)
  fBox(.16, 1.05, 5.2, std({ color: 0x5a4232, roughness: .85 }), -332.2, .525, -3.8); // нижняя панель
  fBox(.06, 1.25, 5.2, std({ color: 0xa8c4d0, roughness: .1, transparent: true, opacity: .35, depthWrite: false }), -332.2, 1.675, -3.8); // стекло
  fBox(.16, 1.25, .08, std({ color: 0x3a2c20, roughness: .9 }), -332.2, 1.675, -3.8);
  fBox(.16, 1.90, 5.2, fWallInMat, -332.2, 3.25, -3.8); // верхняя глухая часть
  addCol(-332.4, -331.8, -6.4, -1.2);
  // Прилавок бюро пропусков с окошком выдачи
  fBox(.48, .06, 2.8, std({ color: 0x6e4a2c, roughness: .75 }), -332.3, 1.05, -3.4);
  const passWindowSignTex = textTex(256, 64, 'ОКНО ВЫДАЧИ ПРОПУСКОВ', '#1c2834', '#f5ebd0', '900 18px Arial');
  const passWinSign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .32), std({ map: passWindowSignTex, roughness: .5 }));
  passWinSign.position.set(-332.18, 2.35, -3.4); passWinSign.rotation.y = -Math.PI / 2; factoryGroup.add(passWinSign);

  // Турникеты («вертушки» советской проходной) в центральном проходе
  for (const tz of [-3.0, -4.6]) {
    fBox(.36, 1.02, .36, std({ color: 0x8a9296, metalness: .85, roughness: .25 }), -335.2, .51, tz);
    fCyl(.022, .022, .72, fDarkSteelMat, -334.8, .88, tz, 8).rotation.z = Math.PI / 2;
    fBox(.36, 1.02, .36, std({ color: 0x8a9296, metalness: .85, roughness: .25 }), -332.6, .51, tz);
  }

  // Внутреннее освещение проходной (тёплый яркий свет лампы)
  const fLobbyLight = new THREE.PointLight(0xffdfa0, 4.5, 14, 1.6);
  fLobbyLight.position.set(-334.0, 3.6, -3.8); if (!LITE) scene.add(fLobbyLight);
  fBox(.8, .08, .3, MAT.lampHead, -334.0, 4.15, -3.8, false);

  // Козырёк над главным входом в проходную
  fBox(5.6, .18, 2.2, fConcreteMat, -334.0, 3.15, .25);
  fBox(5.6, .08, 2.2, MAT.snow, -334.0, 3.28, .25, false).userData.winter = true;
  for (const px of [-336.5, -331.5]) fCyl(.10, .10, 3.15, fDarkSteelMat, px, 1.575, 1.15, 10);
  const passTex = textTex(512, 96, 'ПРОХОДНАЯ · БЮРО ПРОПУСКОВ', '#1e2b38', '#f2e8c8', '900 32px Arial');
  const passSign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .64), std({ map: passTex, roughness: .5 }));
  passSign.position.set(-334.0, 2.95, -.62); factoryGroup.add(passSign);

  // Большая светящаяся вывеска на крыше проходной: «КРАСНОЗАВОДСКИЙ ЗАВОД»
  const fMainSignTex = textTex(1024, 160, 'КРАСНОЗАВОДСКИЙ ЗАВОД', '#7a1812', '#f7e6b2', '900 64px Arial', (g, w, h) => {
    g.strokeStyle = '#e8c252'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
  });
  const fMainSignMat = std({ map: fMainSignTex, emissive: 0xffd27a, emissiveMap: fMainSignTex, emissiveIntensity: .65, roughness: .4 });
  neons.push({ material: fMainSignMat });
  const fMainSign = new THREE.Mesh(new THREE.BoxGeometry(10.4, 1.35, .18), [fDarkSteelMat, fDarkSteelMat, fDarkSteelMat, fDarkSteelMat, fMainSignMat, fMainSignMat]);
  fMainSign.position.set(-334.0, 5.25, -.70); factoryGroup.add(fMainSign);

  // Доска почёта слева от проходной
  const honorTex = regTex(ctex(512, 256, (g, w, h) => {
    g.fillStyle = '#7e1a14'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8b24c'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#f8e8b0'; g.font = '900 28px Arial'; g.textAlign = 'center';
    g.fillText('ДОСКА ПОЧЁТА ЗАВОДА', w / 2, 34);
    for (let i = 0; i < 6; i++) {
      const px = 32 + i * 76, py = 62;
      g.fillStyle = '#e8dfc8'; g.fillRect(px, py, 58, 76);
      g.fillStyle = '#383430'; g.beginPath(); g.arc(px + 29, py + 28, 14, 0, Math.PI * 2); g.fill();
      g.fillRect(px + 11, py + 44, 36, 26);
      g.fillStyle = '#f5d878'; g.fillRect(px + 4, py + 84, 50, 10);
    }
    g.fillStyle = '#fff0c4'; g.font = '700 18px Arial';
    g.fillText('ПЯТИЛЕТКУ — ДОСРОЧНО! · 1991–1992', w / 2, 218);
  }));
  fBox(3.8, 1.85, .14, [fDarkSteelMat, fDarkSteelMat, fDarkSteelMat, fDarkSteelMat, std({ map: honorTex, roughness: .55 }), fDarkSteelMat], -344.0, 1.65, -.45);
  for (const hx of [-345.6, -342.4]) fCyl(.05, .05, 1.6, fDarkSteelMat, hx, .8, -.45, 8);

  // 4) Производственный корпус цеха («ЦЕХ № 1 · МЕХАНОСБОРОЧНЫЙ», x = -342, z = -24)
  occ(fBox(28, 9.6, 14, fBrickWallMat, -342, 4.8, -24));
  fBox(28.6, .35, 14.6, fConcreteMat, -342, 9.75, -24);
  fBox(28.4, .12, 14.4, MAT.snow, -342, 9.98, -24, false).userData.winter = true;
  fBox(22, 2.2, 5.2, fConcreteMat, -342, 10.9, -24);
  fBox(21.6, 1.4, 5.32, fWinMat, -342, 10.9, -24);
  fBox(22.4, .12, 5.5, MAT.snow, -342, 12.06, -24, false).userData.winter = true;
  for (let wx = -352.5; wx <= -331.5; wx += 4.2) {
    fBox(3.1, 2.2, .12, fWinMat, wx, 6.8, -16.95);
    if (wx < -340 || wx > -334) fBox(3.1, 2.0, .12, fWinMat, wx, 3.2, -16.95);
    fBox(.48, 9.6, .36, fConcreteMat, wx - 2.1, 4.8, -16.9);
  }
  fBox(4.8, 4.4, .18, fGateMat, -336.5, 2.2, -16.92);
  const cehTex = textTex(512, 96, 'ЦЕХ № 1 · МЕХАНОСБОРОЧНЫЙ', '#243038', '#f2df9e', '900 32px Arial');
  const cehSign = new THREE.Mesh(new THREE.PlaneGeometry(6.2, .85), std({ map: cehTex, roughness: .5 }));
  cehSign.position.set(-336.5, 5.05, -16.88); factoryGroup.add(cehSign);
  fBox(8.4, .85, 3.2, fConcreteMat, -336.5, .425, -15.3);
  fBox(8.5, .06, 3.3, fDarkSteelMat, -336.5, .86, -15.3);
  addCol(-356.2, -327.8, -31.2, -16.8);
  addCol(-340.8, -332.2, -16.9, -13.6);

  // 5) Котельная и дымовые трубы с густым дымом (x = -361, z = -25)
  occ(fBox(8.5, 7.2, 10.5, fBrickMat, -361.2, 3.6, -24.5));
  fBox(8.8, .28, 10.8, fConcreteMat, -361.2, 7.34, -24.5);
  addCol(-365.6, -356.8, -29.8, -19.2);
  const chimneyTops = [[-362.8, 28.5, -26.5], [-359.2, 23.5, -27.2]];
  for (const [cx, chH, cz] of chimneyTops) {
    fCyl(1.05, 1.65, chH, fBrickMat, cx, chH / 2, cz, 18);
    for (let ringY = chH - 6.5; ringY < chH - .8; ringY += 2.2) {
      fCyl(1.12, 1.16, .95, std({ color: 0xe8e4dc, roughness: .8 }), cx, ringY, cz, 18);
    }
    fCyl(1.18, 1.12, .55, fDarkSteelMat, cx, chH - .25, cz, 18);
    addCol(cx - 1.7, cx + 1.7, cz - 1.7, cz + 1.7);
  }

  // 6) Склад готовой продукции («ОТДЕЛ СБЫТА», x = -316.5, z = -17.5)
  occ(fBox(11.5, 5.4, 13.5, fBrickMat, -316.5, 2.7, -17.5));
  fBox(11.9, .26, 13.9, fConcreteMat, -316.5, 5.53, -17.5);
  fBox(11.8, .10, 13.8, MAT.snow, -316.5, 5.68, -17.5, false).userData.winter = true;
  fBox(3.6, 3.2, .16, fGateMat, -322.3, 1.6, -15.2).rotation.y = Math.PI / 2;
  const sbytTex = textTex(512, 96, 'ОТДЕЛ СБЫТА · СКЛАД ПРОДУКЦИИ', '#1d3b2a', '#f2e8c4', '900 28px Arial');
  const sbytSign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, .82), std({ map: sbytTex, roughness: .5 }));
  sbytSign.position.set(-316.5, 4.35, -10.68); factoryGroup.add(sbytSign);
  addCol(-322.4, -310.6, -24.4, -10.6);

  // Ящики и бочки во дворе
  const crateMat = std({ map: cardTex, roughness: .9 });
  const barrelMat = std({ color: 0x2b4c66, roughness: .5, metalness: .45 });
  for (const [bx, bz, s] of [[-330.5, -5.6, .85], [-329.6, -5.8, .75], [-323.4, -12.2, 1.1], [-323.2, -13.6, .95], [-332.5, -14.2, 1.0]]) {
    fBox(.9 * s, .8 * s, .9 * s, crateMat, bx, .4 * s, bz);
    addCol(bx - .45 * s, bx + .45 * s, bz - .45 * s, bz + .45 * s);
  }
  for (const [bx, bz] of [[-323.2, -16.8], [-322.5, -17.5], [-330.8, -14.0]]) {
    fCyl(.32, .32, .92, barrelMat, bx, .46, bz, 12);
    addCol(bx - .34, bx + .34, bz - .34, bz + .34);
  }

  // Клубы дыма из труб
  const fSmokePuffs = [];
  const fSmokeGeo = new THREE.SphereGeometry(1, 8, 6);
  const fSmokeMat = new THREE.MeshBasicMaterial({ color: 0xd2d6da, transparent: true, opacity: .34, depthWrite: false });
  for (let i = 0; i < 20; i++) {
    const ch = chimneyTops[i % 2];
    const m = new THREE.Mesh(fSmokeGeo, fSmokeMat.clone());
    m.userData = { keep: true, dyn: true, cx: ch[0], cy: ch[1] + .3, cz: ch[2], age: (i / 20) * 10.0 };
    scene.add(m);
    fSmokePuffs.push(m);
  }
  function factorySmokeTick(dt) {
    for (const p of fSmokePuffs) {
      const u = p.userData;
      u.age += dt;
      if (u.age > 10.0) u.age -= 10.0;
      const k = u.age / 10.0;
      const sc = 1.2 + k * 4.8;
      p.scale.set(sc, sc * .78, sc);
      p.position.set(
        u.cx + (windVec.x * .45 + 1.2) * u.age + Math.sin(tAll * .8 + u.age) * .4,
        u.cy + u.age * 1.65,
        u.cz + (windVec.y * .45 - .3) * u.age
      );
      p.material.opacity = Math.sin(k * Math.PI) * .32 * (1 - nightK * .45);
    }
  }
  // световые пятна под всеми фонарями (дёшево вместо десятков источников света)
  const poolTex = regTex(ctex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,190,110,.55)'); gr.addColorStop(.45, 'rgba(255,170,90,.22)'); gr.addColorStop(1, 'rgba(255,160,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  { const g = new THREE.PlaneGeometry(9, 9); g.rotateX(-Math.PI / 2); const im = new THREE.InstancedMesh(g, poolMat, lampPools.length); lampPools.forEach(([x, z], i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, .03, z - .6))); im.renderOrder = 2; scene.add(im); }

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
  let loadedN = 0; const SDS_NPC = ["cmeszl", "cmeszl2", "cmeszz", "cmeszz2", "cmeszz3", "cpros1l", "cpros1z", "cpros2l", "cpros2z", "cirand", "cvezedv"]; // прохожие: *z — зимняя одежда, *l — летняя, без суффикса — на любой сезон
  const toLoad = [...SDS_NPC.map(n => 'npc_' + n), 'npc_police', 'npc_driver', 'paz652', 'forest_trees', 'bmw733i', 'apartment', 'busstop', 'beton', 'tree', 'bush', 'radio', 'steelworker', 'notepad', 'chair', 'poster', 'nodrink', 'vodka', 'cigarette', 'stew', 'gun', 'trashcan', 'vaz2101', 'vaz2107', 'vaz2101_lod', 'vaz2107_lod'];
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
  const loading = Promise.all(toLoad.map(n => loader.loadAsync('assets/models/' + n + '.glb').then(g => { g.__name = n; { const ls = []; g.scene.traverse(o => { if (o.isLight) ls.push(o); }); ls.forEach(l => l.parent.remove(l)); } /* лампы из экспорта моделей давали пересвет у телефона */ ASSETS[n] = g; loadedN++; ctx.onLoadProgress && ctx.onLoadProgress(loadedN / toLoad.length); }).catch(e => { console.warn('Не загрузилась модель', n, e); loadedN++; })));
  function meshesOf(g) { const out = []; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh) out.push(o); }); return out; }
  function prepMats(root) { root.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (m[k]) m[k].anisotropy = Q.aniso; }); } }); }
  function placeModel(g, x, z, rotY, scale = 1) { const o = g.scene.clone(true); o.userData.tag = g.__name || "model"; o.position.set(x, 0, z); o.rotation.y = rotY; o.scale.setScalar(scale); scene.add(o); prepMats(o); o.updateMatrixWorld(true); return o; }
  function colFromBox(o, shrink = 0) { const b = new THREE.Box3().setFromObject(o); return addCol(b.min.x + shrink, b.max.x - shrink, b.min.z + shrink, b.max.z - shrink); }
  let staticWorker = null, peopleModels = [], policeModel = null; const peopleByOutfit = {};
  const outfitNow = () => { const m = season < 0 ? 0 : season; return (m >= 10 || m <= 2) ? 'winter' : (m >= 5 && m <= 7) ? 'summer' : 'mid'; };
  // ---------- лес вдоль дороги на завод (сосны из присланной сцены; без камней, травы и брёвен) ----------
  // деревья рисуются инстансами: на каждую часть дерева один вызов отрисовки. Зимой ветки и хвоя сверху заснежены.
  const forestSnowU = { value: 0 }, forestCells = [];
  function snowyTree(m) {
    m.onBeforeCompile = sh => { sh.uniforms.uSnowK = forestSnowU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vUpN;').replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvUpN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSnowK; varying float vUpN;').replace('#include <map_fragment>', '#include <map_fragment>\n{ float sn = uSnowK * smoothstep(-.15, .55, vUpN); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.92, .94, .97), sn * .85); }'); };
    m.customProgramCacheKey = () => 'snowyTree';
  }
  function placeForest(A) {
    const kinds = {}; A.scene.updateMatrixWorld(true);
    A.scene.traverse(o => { if (!o.isMesh) return; const [k, part] = o.name.split('_'); (kinds[k] = kinds[k] || {})[part] = o; });
    const types = Object.keys(kinds); if (!types.length) return;
    const spots = []; const rng = (a, b) => a + Math.random() * (b - a);
    const N = LITE ? 70 : 140, blocked = (x, z, r) => colliders.some(b => x > b.x1 - r && x < b.x2 + r && z > b.z1 - r && z < b.z2 + r);
    for (let i = 0, guard = 0; spots.length < N && guard < N * 30; guard++) {
      const x = rng(-296, -112), north = Math.random() < .5, z = north ? rng(22, 62) : rng(-62, -12);
      if (blocked(x, z, 3) || spots.some(s => Math.hypot(s.x - x, s.z - z) < 4.2)) continue;
      const t = types[Math.floor(Math.random() * types.length)];
      spots.push({ x, z, t, s: t[0] === 's' ? rng(3.6, 5) : rng(6.5, 9), r: rng(0, 6.28) });
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    for (const t of types) for (const part of ['bark', 'leaves']) { const src = kinds[t][part]; if (!src) continue; const mat = src.material;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace; if (part === 'leaves') { mat.alphaTest = .45; mat.transparent = false; mat.side = THREE.DoubleSide; } snowyTree(mat); }
    // участки по 40 м: каждый — свои инстансы; дальние участки не рисуются вовсе (раньше весь лес рисовался даже от ларька)
    const cells = {}; for (const s of spots) (cells[Math.floor(s.x / 40)] = cells[Math.floor(s.x / 40)] || []).push(s);
    for (const [ci, cs] of Object.entries(cells)) {
      const grp = new THREE.Group(); grp.userData.cx = (+ci + .5) * 40; scene.add(grp); forestCells.push(grp);
      for (const t of types) { const list = cs.filter(s => s.t === t); if (!list.length) continue;
        for (const part of ['bark', 'leaves']) { const src = kinds[t][part]; if (!src) continue;
          const im = new THREE.InstancedMesh(src.geometry, src.material, list.length); im.castShadow = false; im.receiveShadow = !LITE;
          list.forEach((s, i) => im.setMatrixAt(i, M.compose(new THREE.Vector3(s.x, 0, s.z), Q.setFromAxisAngle(Y, s.r), S.setScalar(s.s))));
          im.computeBoundingSphere(); grp.add(im); } }
    }
    for (const s of spots) addCol(s.x - .35, s.x + .35, s.z - .35, s.z + .35); // стволы
    seasonHooks.push(w => { forestSnowU.value = w ? 1 : 0; });
    forestSnowU.value = winter ? 1 : 0;
  }
  // прогрев шейдеров: всё, что изнутри ларька не попадало в кадр, компилировалось разом при выходе (фриз 2–3 с на Mali/Tensor).
  // После загрузки один раз рисуем весь город с отключённым отсечением, в том числе проход теней, в крошечную цель.
  function warmUpShaders() {
    const prev = []; scene.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) { prev.push([o, o.frustumCulled]); o.frustumCulled = false; } });
    const rtW = new THREE.WebGLRenderTarget(64, 32); const cam = camera.clone(); cam.position.set(0, 30, 60); cam.lookAt(0, 0, 0); cam.far = 2000; cam.updateProjectionMatrix();
    const saved = { cs: kioskSpot.castShadow };
    try { renderer.compile(scene, cam); renderer.setRenderTarget(rtW); renderer.shadowMap.needsUpdate = true; renderer.render(scene, cam); renderer.render(scene, camera); if (weapon && weapon.scene) renderer.compile(weapon.scene, weapon.cam); }
    catch (e) { console.warn('warmup', e); }
    renderer.setRenderTarget(null); rtW.dispose(); for (const [o, f] of prev) o.frustumCulled = f; kioskSpot.castShadow = saved.cs;
  }
  loading.then(() => setTimeout(warmUpShaders, 50));
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
      for (const [x, z, r] of [
        [-95, 28, Math.PI / 2],
        [-34, 28, Math.PI / 2],
        [28, 28, Math.PI / 2],
        [90, 28, Math.PI / 2],
        [-156, -25, Math.PI / 2],
        [-60, -25, Math.PI / 2],
        [30, -25, Math.PI / 2]
      ]) {
        const o = placeModel(A, x, z, r); colFromBox(o, .5); occ(o); reflectLayer(o);
        { const b = new THREE.Box3().setFromObject(o), e = .5; drift(b.min.x, b.min.z - e, b.max.x, b.min.z - e, 1.6, .55, x); drift(b.min.x, b.max.z + e, b.max.x, b.max.z + e, 1.6, .55, z); drift(b.min.x - e, b.min.z, b.min.x - e, b.max.z, 1.5, .5, x + z); drift(b.max.x + e, b.min.z, b.max.x + e, b.max.z, 1.5, .5, x - z); }
      }
      trampleSnow();
      flushDrifts(); season = -1; // пересчитать видимость сезонных объектов
    } else fallbackBuildings();
    // Остановки автобуса №7 с обеих сторон дороги (южная сторона z = 4.15 к Заводу, северная сторона z = 16.3 к Ларьку)
    for (const st of Object.values(STOPS)) {
      const isNorth = !!st.north;
      const shelterZ = isNorth ? 16.3 : 4.15;
      const shelterRot = isNorth ? Math.PI / 2 : -Math.PI / 2;
      if (ASSETS.busstop) {
        const o = placeModel(ASSETS.busstop, st.x, shelterZ, shelterRot);
        if (st.x === 8 && !isNorth) busStopObj = o;
        o.traverse(m => { if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => { if (/glass/i.test(mt.name)) { mt.transparent = true; mt.opacity = .35; mt.depthWrite = false; } }); });
        occ(o);
        const b = new THREE.Box3().setFromObject(o);
        if (isNorth) {
          addCol(b.min.x, b.max.x, b.max.z - .2, b.max.z);
          addCol(b.min.x, b.min.x + .15, b.min.z + .3, b.max.z);
          addCol(b.max.x - .15, b.max.x, b.min.z + .3, b.max.z);
        } else {
          addCol(b.min.x, b.max.x, b.min.z, b.min.z + .2);
          addCol(b.min.x, b.min.x + .15, b.min.z, b.max.z - .3);
          addCol(b.max.x - .15, b.max.x, b.min.z, b.max.z - .3);
        }
        // Реальное советское расписание движения автобуса №7 внутри павильона остановки (на задней и боковой стенках)
        const schedTex = regTex(ctex(640, 480, (g, w, h) => {
          g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, w, h);
          g.strokeStyle = '#1d3b66'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
          g.fillStyle = '#1d3b66'; g.fillRect(16, 16, w - 32, 68);
          g.fillStyle = '#f5f1e6'; g.font = '900 24px Arial'; g.textAlign = 'center';
          g.fillText('ПАТП №1 · РАСПИСАНИЕ ДВИЖЕНИЯ АВТОБУСОВ', w / 2, 46);
          g.fillStyle = '#f2c94c'; g.font = '800 18px Arial';
          g.fillText('МАРШРУТ № 7: УЛ. ЗАВОДСКАЯ (ЛАРЁК) — ПРОХОДНАЯ ЗАВОДА', w / 2, 74);

          g.fillStyle = '#a82016'; g.fillRect(22, 94, 118, 82);
          g.fillStyle = '#fff8ee'; g.font = '900 54px Arial'; g.fillText('№ 7', 81, 152);

          g.fillStyle = '#181818'; g.textAlign = 'left'; g.font = '900 20px Arial';
          g.fillText('ОСТАНОВКА: «' + st.name.toUpperCase() + '»', 152, 118);
          g.font = '700 16px Arial'; g.fillStyle = '#263240';
          g.fillText(isNorth ? 'Направление: Проходная завода → Ул. Заводская (Ларёк)' : 'Направление: Ул. Заводская (Ларёк) → Проходная завода', 152, 144);
          g.fillText('Режим работы: ежедневно с 06:00 до 23:00 · Интервал: 12–15 мин.', 152, 168);

          // Таблица отправления по часам и минутам
          g.strokeStyle = '#32363a'; g.lineWidth = 2;
          g.strokeRect(22, 186, w - 44, 198);
          g.fillStyle = '#d4ccb6'; g.fillRect(24, 188, w - 48, 30);
          g.fillStyle = '#151515'; g.font = '800 15px Arial'; g.textAlign = 'center';
          g.fillText('ЧАСЫ ОТПРАВЛЕНИЯ И МИНУТЫ ПРИБЫТИЯ НА ОСТАНОВКУ', w / 2, 209);

          const cols = 6, cw = (w - 44) / cols;
          for (let r = 0; r < 3; r++) {
            const ry = 218 + r * 55;
            g.strokeRect(22, ry, w - 44, 55);
            for (let c = 0; c < cols; c++) {
              const hr = 6 + r * 6 + c;
              if (hr > 23) continue;
              const cx0 = 22 + c * cw;
              g.strokeRect(cx0, ry, cw, 55);
              g.fillStyle = '#1d3b66'; g.font = '900 18px Arial';
              g.fillText((hr < 10 ? '0' + hr : '' + hr) + ' ч', cx0 + cw / 2, ry + 21);
              g.fillStyle = '#1b1b1b'; g.font = '700 13px "Courier New", monospace';
              const mOff = isNorth ? 6 : 0;
              const m1 = String((0 + mOff) % 60).padStart(2, '0');
              const m2 = String((15 + mOff) % 60).padStart(2, '0');
              const m3 = String((30 + mOff) % 60).padStart(2, '0');
              const m4 = String((45 + mOff) % 60).padStart(2, '0');
              g.fillText(hr === 23 ? (m1 + '  --') : (m1 + '  ' + m2), cx0 + cw / 2, ry + 37);
              if (hr < 23) g.fillText(m3 + '  ' + m4, cx0 + cw / 2, ry + 50);
            }
          }

          // Схема остановок и время в пути
          g.fillStyle = '#dbd3be'; g.fillRect(22, 392, w - 44, 68);
          g.strokeStyle = '#32363a'; g.strokeRect(22, 392, w - 44, 68);
          g.fillStyle = '#181818'; g.textAlign = 'left'; g.font = '800 15px Arial';
          g.fillText('ПУТЬ СЛЕДОВАНИЯ:  00 мин. Ул. Заводская (Ларёк)  →  03 мин. Лесополоса  →  06 мин. Завод (Проходная)', 34, 415);
          g.font = '700 14px Arial'; g.fillStyle = '#5a1e18';
          g.fillText('Стоимость проезда: 1 руб. 00 коп. (проездной рабочего — бесплатно). На линии автобус ПАЗ-652 (вод. Ковалёв Н. П.)', 34, 437);
          g.fillStyle = '#383838'; g.font = '700 12px Arial';
          g.fillText('Гортранс · Автоколонна № 1418 · Диспетчерская: 2-14-07', 34, 454);
          speckle(g, w, h, 450, ['#0002', '#fff2', '#5432'], 2);
        }));
        const schedFaceM = std({ map: schedTex, emissive: 0xffffff, emissiveMap: schedTex, emissiveIntensity: .18, roughness: .52, metalness: .12 });
        const schedEdgeM = std({ color: 0x2c343c, roughness: .6, metalness: .55 });
        // 1) Большой щит с расписанием внутри павильона на задней стенке на уровне глаз (y = 1.62)
        const backZ = isNorth ? (b.max.z - .11) : (b.min.z + .11);
        const backX = (b.min.x + b.max.x) / 2 + (isNorth ? -.52 : .52);
        const sbBack = new THREE.Mesh(new THREE.BoxGeometry(.96, .72, .024), [schedEdgeM, schedEdgeM, schedEdgeM, schedEdgeM, schedFaceM, schedFaceM]);
        sbBack.position.set(backX, 1.62, backZ);
        sbBack.rotation.y = isNorth ? Math.PI : 0;
        sbBack.castShadow = true;
        scene.add(sbBack);
        // 2) Дублирующий щит с расписанием на правой внутренней боковой стенке павильона (куда смотрит игрок на скриншоте 5863.png)
        const sideX = isNorth ? (b.min.x + .09) : (b.max.x - .09);
        const sideZ = (b.min.z + b.max.z) / 2;
        const sbSide = new THREE.Mesh(new THREE.BoxGeometry(.84, .63, .022), [schedEdgeM, schedEdgeM, schedEdgeM, schedEdgeM, schedFaceM, schedFaceM]);
        sbSide.position.set(sideX, 1.60, sideZ);
        sbSide.rotation.y = isNorth ? Math.PI / 2 : -Math.PI / 2;
        sbSide.castShadow = true;
        scene.add(sbSide);
      }
      // Двусторонний дорожный знак остановки
      const sx = isNorth ? (st.x - 2.2) : (st.x + 2.2);
      const sz = isNorth ? 14.75 : 5.65;
      cyl(.065, .075, .28, MAT.dark, sx, .14, sz, 8);
      cyl(.036, .036, 2.85, MAT.steel, sx, 1.425, sz, 10);
      cyl(.046, .046, .04, MAT.dark, sx, 2.85, sz, 10);
      const signTex = regTex(ctex(256, 320, (g, w, h) => {
        g.fillStyle = '#1c4b82'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#f2efe6'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
        g.fillStyle = '#f4f1e8'; g.fillRect(14, 14, w - 28, 136);
        g.fillStyle = '#181818';
        g.beginPath(); g.roundRect ? g.roundRect(42, 34, 172, 72, 10) : g.rect(42, 34, 172, 72); g.fill();
        g.fillStyle = '#f4f1e8';
        for (let wx = 52; wx <= 162; wx += 36) g.fillRect(wx, 44, 28, 28);
        g.fillRect(190, 44, 16, 34);
        g.fillStyle = '#181818';
        g.beginPath(); g.arc(78, 110, 14, 0, Math.PI * 2); g.arc(176, 110, 14, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f4f1e8';
        g.beginPath(); g.arc(78, 110, 6, 0, Math.PI * 2); g.arc(176, 110, 6, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1c4b82'; g.font = '900 22px Arial'; g.textAlign = 'center';
        g.fillText('ОСТАНОВКА АВТОБУСА', w / 2, 142);
        g.fillStyle = '#e2b43b'; g.fillRect(14, 158, w - 28, 148);
        g.strokeStyle = '#1c1a17'; g.lineWidth = 3; g.strokeRect(18, 162, w - 36, 140);
        g.fillStyle = '#a82418'; g.font = '900 44px Arial'; g.fillText('А  № 7', w / 2, 206);
        g.fillStyle = '#181818'; g.font = '900 19px Arial';
        g.fillText(st.name.toUpperCase(), w / 2, 240);
        g.font = '700 16px Arial';
        g.fillText(isNorth ? 'НАПРАВЛЕНИЕ: В ГОРОД' : 'НАПРАВЛЕНИЕ: НА ЗАВОД', w / 2, 266);
        g.font = '700 14px Arial';
        g.fillText('06:00–23:00 · ИНТ. 15 МИН', w / 2, 290);
        speckle(g, w, h, 350, ['#0002', '#fff2'], 2);
      }));
      const signFaceM = std({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: .22, roughness: .55, metalness: .15 });
      const signEdgeM = std({ color: 0x3a4046, roughness: .6, metalness: .6 });
      const sg = new THREE.Mesh(new THREE.BoxGeometry(.52, .65, .028), [signEdgeM, signEdgeM, signEdgeM, signEdgeM, signFaceM, signFaceM]);
      sg.position.set(sx, 2.46, sz);
      sg.castShadow = true;
      scene.add(sg);
      for (const by of [2.24, 2.66]) box(.09, .035, .045, signEdgeM, sx, by, sz);
      addCol(sx - .12, sx + .12, sz - .12, sz + .12);
    }
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
    { // новые прохожие из присланных моделей; заменяют прежний набор «Зимние люди»
      const sdsList = [];
      for (const n of SDS_NPC) { const A = ASSETS['npc_' + n]; if (!A) continue; try { const m = meshesOf(A)[0]; if (m.material.map) m.material.map.colorSpace = THREE.SRGBColorSpace; sdsList.push(prepareSdsPerson(m, n)); } catch (e) { console.warn('Модель прохожего ' + n, e); } }
      if (sdsList.length) {
        const season = s => sdsList.filter(p => s === 'winter' ? !/l\d?$/.test(p.name) : s === 'summer' ? !/z\d?$/.test(p.name) : true);
        for (const o of ['winter', 'mid', 'summer']) peopleByOutfit[o] = season(o);
        peopleModels = peopleByOutfit.winter;
      }
    }
    if (ASSETS.people && !peopleModels.length) { try { for (const o of ['winter', 'mid', 'summer']) peopleByOutfit[o] = preparePeople(ASSETS.people.scene, o); peopleModels = peopleByOutfit.winter; } catch (e) { console.warn('Модели людей', e); } }
    if (ASSETS.forest_trees) { try { placeForest(ASSETS.forest_trees); } catch (e) { console.warn('Лес', e); } }
    if (ASSETS.paz652) { try { let dp = null; if (ASSETS.npc_driver) { const m = meshesOf(ASSETS.npc_driver)[0]; if (m.material.map) m.material.map.colorSpace = THREE.SRGBColorSpace; dp = prepareSdsPerson(m, 'driver').parts; } transport.setModel(ASSETS.paz652, dp); } catch (e) { console.warn('Модель автобуса', e); } }
    if (ASSETS.npc_police) { try { const m = meshesOf(ASSETS.npc_police)[0]; if (m.material.map) m.material.map.colorSpace = THREE.SRGBColorSpace; policeModel = prepareSdsPerson(m, 'police').parts; } catch (e) { console.warn('Модель милиционера', e); } }
    if (!policeModel && ASSETS.police) { // запасной вариант (файл police.glb удалён — форма теперь на модели прохожего)
      try { const m = meshesOf(ASSETS.police)[0]; if (m) { m.updateMatrixWorld(true); const mp = m.material.map; if (mp) mp.colorSpace = THREE.SRGBColorSpace; policeModel = preparePolice(m.geometry.clone().applyMatrix4(m.matrixWorld), mp); } } catch (e) { console.warn('Модель милиционера', e); } }
    if (ASSETS.steelworker) { const m = meshesOf(ASSETS.steelworker)[0]; if (m) staticWorker = splitStaticModel(m.geometry.clone().applyMatrix4(m.matrixWorld)); }
    fixNodes();
    // --- предметы интерьера из присланных моделей ---
    if (ASSETS.notepad) life.setNotepadModel(ASSETS.notepad.scene.clone(true));

    if (ASSETS.cigarette) life.setCigaretteModel(ASSETS.cigarette.scene.clone(true));
    if (ASSETS.vodka) life.setBottleModel(ASSETS.vodka.scene.clone(true));
    if (ASSETS.chair) { placeModel(ASSETS.chair, STOOL.x, STOOL.z - .02, Math.PI); stool.visible = false; } // стул продавца вместо табуретки: спинкой к двери, лицом к прилавку
    // место модели плаката на правой стене занял советский плакат «Мир и дружба!» (см. ниже у двери)
    if (ASSETS.nodrink) { const ms = meshesOf(ASSETS.nodrink); let big = ms[0]; ms.forEach(m => { m.geometry.computeBoundingBox(); big.geometry.computeBoundingBox(); if (m.geometry.boundingBox.getSize(tmpV).y > big.geometry.boundingBox.getSize(tmpV2).y) big = m; });
      const g = big.geometry.clone().applyMatrix4(big.matrixWorld); g.computeBoundingBox(); const bb = g.boundingBox, c = bb.getCenter(new THREE.Vector3()); g.translate(-c.x, -bb.min.y, -c.z); const sc = .55 / (bb.max.y - bb.min.y); g.scale(sc, sc, sc);
      const m = new THREE.Mesh(g, big.material); m.position.set(-.35, 1.25, -KD + .04); m.rotation.y = Math.abs(bb.max.x - bb.min.x) < Math.abs(bb.max.z - bb.min.z) ? Math.PI / 2 : 0; scene.add(m); }
    if (ASSETS.stew) { const sm = meshesOf(ASSETS.stew)[0]; if (sm) { const f = FOOD.find(q => q.id === 'tushonka'); const g = sm.geometry.clone().applyMatrix4(sm.matrixWorld); g.computeBoundingBox(); const bb = g.boundingBox; g.translate(0, -(bb.min.y + bb.max.y) / 2, 0); f.geo = g; f.model = sm.material; buildFood(); } }
    if (ASSETS.trashcan) {
      for (const slot of trashHolders) {
        while (slot.children.length) slot.remove(slot.children[0]);
        const tc = ASSETS.trashcan.scene.clone(true);
        prepMats(tc);
        slot.add(tc);
        for (let k = 0; k < 4; k++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(.20, 7, 5), bagMat);
          m.scale.set(1, .68, 1);
          m.position.set(R(-.28, .28), .62 + R(0, .12), R(-.16, .16));
          slot.add(m);
        }
      }
    }
    if (ASSETS.gun) {
      const gm = meshesOf(ASSETS.gun)[0];
      gunGeo = fixWinding(normGun(gm.geometry.clone().applyMatrix4(gm.matrixWorld)));
      gunMat = gm.material;
      weapon.setModel(gunHoldMesh(), life.makeHand);
      buildWallGun();
      for (const it of life.items) {
        if (it.kind === 'gun') {
          const pos = it.obj.position.clone(), ry = it.obj.rotation.y;
          scene.remove(it.obj);
          it.obj = gunWorldMesh();
          it.obj.position.copy(pos);
          it.obj.rotation.y = ry;
          it.obj.traverse(o => { if (o.isMesh) o.userData.item = it; });
          scene.add(it.obj);
        }
      }
    }
    spawnMarat();
    spawnZavodNpc();
    // уличные продавцы стояли неподвижно с позированными руками и выглядели как баг — убраны
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
      hwySpots.forEach(([x, z, s, r]) => spots.push([x, z, s, r]));
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
    // у модели ВАЗ-2101 нет салона — сквозь стёкла было пусто: ставим сиденья, задний диван, торпедо с рулём, пол и обшивку дверей
    if (kind === 'vaz2101') {
      if (!realCar.int01) { const seat = std({ color: 0x5b3b2a, roughness: .75 }), dark = std({ color: 0x1d1c1b, roughness: .8 }), floor = std({ color: 0x252320, roughness: .95 }), card = std({ color: 0x6a4a36, roughness: .8 }), chrome = std({ color: 0xb8b8b4, metalness: .8, roughness: .3 });
        const ig = new THREE.Group(); // перед модели — +x; лобовое стекло от (x 1.0, y .79) до (x .59, y 1.21), салон x −1.2…0.6
        box(1.75, .03, 1.3, floor, -.3, .3, 0, ig, false); // пол
        for (const z of [.33, -.33]) { box(.46, .1, .46, seat, -.08, .45, z, ig); const bk = box(.09, .52, .44, seat, -.33, .74, z, ig); bk.rotation.z = .16; box(.08, .13, .24, seat, -.37, 1.05, z, ig); } // передние кресла с подголовниками
        box(.46, .12, 1.26, seat, -.82, .44, 0, ig); const rb = box(.09, .46, 1.26, seat, -1.06, .72, 0, ig); rb.rotation.z = .18; // задний диван
        box(.2, .2, 1.3, dark, .48, .72, 0, ig); box(.06, .05, 1.24, dark, .4, .83, 0, ig); // торпедо ниже линии стекла и козырёк приборов
        for (const [z, r] of [[.33, .055], [.16, .045]]) { const d = new THREE.Mesh(new THREE.CircleGeometry(r, 16), std({ color: 0xe8e2cc, roughness: .5 })); d.position.set(.375, .76, z); d.rotation.y = -Math.PI / 2; ig.add(d); } // приборы
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(.17, .013, 8, 24), dark); wheel.position.set(.24, .78, .33); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = .45; ig.add(wheel);
        cyl(.017, .017, .28, dark, .33, .74, .33, 8, ig).rotation.z = -1.1; // рулевая колонка
        box(.04, .26, .04, dark, .18, .45, 0, ig).rotation.z = -.25; cyl(.022, .022, .03, chrome, .15, .59, 0, 8, ig); // рычаг КПП
        for (const z of [.65, -.65]) box(1.55, .34, .02, card, -.3, .58, z, ig); // обшивка дверей ниже окон
        realCar.int01 = ig; }
      g.add(realCar.int01.clone());
    }
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
    [
      [-360, 12.0], [84, 12.0],
      [92, 11.8], [98, 11.1], [102, 10.2], [98, 9.3], [92, 8.6],
      [84, 8.4], [-360, 8.4],
      [-368, 8.6], [-374, 9.3], [-378, 10.2], [-374, 11.1], [-368, 11.8]
    ],
    [
      [84, 8.4], [-360, 8.4],
      [-368, 8.6], [-374, 9.3], [-378, 10.2], [-374, 11.1], [-368, 11.8],
      [-360, 12.0], [84, 12.0],
      [92, 11.8], [98, 11.1], [102, 10.2], [98, 9.3], [92, 8.6]
    ]
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
  const P = { x: 0, z: .25, yaw: Math.PI, pitch: -.08, h: 1.18, vx: 0, vz: 0, seated: true, locked: false, crouch: false, sprint: false, stun: 0, bobPh: 0, roll: 0, shake: 0, lying: false, lieSide: 1 };
  const STOOL = { x: 0, z: .25 };
  const input = { mx: 0, my: 0, keys: {} };
  const inKiosk = (x = P.x, z = P.z) => Math.abs(x) < KW && Math.abs(z) < KD;
  const PR = .26;
  // препятствия для игрока: статичные коллайдеры + машины на дороге (повёрнутый прямоугольник) + автобус — сквозь них не пройти
  const inOBB = (x, z, cx, cz, hd, hx, hz, r) => { const dx = x - cx, dz = z - cz, c = Math.cos(hd), s_ = Math.sin(hd); const lx = dx * c - dz * s_, lz = dx * s_ + dz * c; return Math.abs(lx) < hx + r && Math.abs(lz) < hz + r; };
  const hitAny = (x, z, r = PR) => colliders.some(b => x > b.x1 - r && x < b.x2 + r && z > b.z1 - r && z < b.z2 + r) || hitVeh(x, z, r);
  const hitVeh = (x, z, r = PR) => cars.some(c => inOBB(x, z, c.m.position.x, c.m.position.z, c.m.rotation.y, 2.1, .85, r))
    || (transport.playerBlocked ? transport.playerBlocked(x, z, r) : false);
  function canMove() { return ctx.getS() && !P.seated && !P.lying && !P.locked && !transport.seated && !ctx.cardOpen() && !ctx.sheetOpen() && P.stun <= 0; }
  function sit() {
    P.x = STOOL.x; P.z = STOOL.z; P.yaw = Math.PI;
    P.seated = true; P.locked = false; P.crouch = false; P.vx = P.vz = 0;
    hatchTarget = 1;
    ctx.onSitCounter && ctx.onSitCounter();
    ctx.onCtl();
  }
  function stand() {
    P.locked = false; P.seated = false;
    hatchTarget = 0;
    const S = ctx.getS(); S && (S.flags.stood = true);
    ctx.onStandCounter && ctx.onStandCounter();
    ctx.onCtl();
  }
  let fadeBusy = false;
  function fade(fn) { if (fadeBusy) return; fadeBusy = true; const f = document.getElementById('fade'); f.style.opacity = 1; setTimeout(() => { fn(); setTimeout(() => { f.style.opacity = 0; fadeBusy = false; ctx.onCtl(); }, 120); }, 260); }
  function goCounter() {
    const doIt = () => {
      P.x = STOOL.x; P.z = STOOL.z; P.yaw = Math.PI; P.pitch = -.1;
      P.seated = true; P.locked = false; P.vx = P.vz = 0; doorTarget = 0; hatchTarget = 1;
      ctx.onSitCounter && ctx.onSitCounter();
      ctx.onCtl();
    };
    if (inKiosk() && P.seated) { P.locked = false; P.yaw = Math.PI; hatchTarget = 1; ctx.onSitCounter && ctx.onSitCounter(); ctx.onCtl(); } else fade(doIt);
  }
  function toggleDoor() { doorTarget = doorTarget > .5 ? 0 : 1; ctx.audio && ctx.audio.door(doorTarget > .5); }

  // ---------- люди ----------
  // граф тротуаров и дворов
  const NODES = {};
  const N = (id, x, z) => NODES[id] = { id, x, z, e: [] };
  const E = (a, b) => { NODES[a].e.push(b); NODES[b].e.push(a); };
  const SWX = [-66, -50, -34, -18, -8, -3, 3, 8, 18, 34, 50, 66];
  SWX.forEach((x, i) => {
    // Безопасная траектория в обход павильона остановки (x = 8) и ларька (x = 0)
    const sz = (x === 8 || x === -334) ? 2.35 : 3.4;
    const fz = (x === 8 || x === -334) ? 14.95 : 16.2;
    N('s' + i, x, sz); N('f' + i, x, fz);
    if (i) { E('s' + i, 's' + (i - 1)); E('f' + i, 'f' + (i - 1)); }
  });
  // Продолжение тротуаров на запад по шоссе к локации «Краснозаводский завод» (x = -334)
  const WSWX = [-82, -130, -180, -230, -280, -320, -334, -360, -400];
  WSWX.forEach((x, i) => {
    N('sw' + i, x, 3.4); N('fw' + i, x, 16.2);
    E('sw' + i, i === 0 ? 's0' : 'sw' + (i - 1));
    E('fw' + i, i === 0 ? 'f0' : 'fw' + (i - 1));
  });
  // Пешеходные пути: от автобусной остановки завода (x = -334, z = 3.4) через площадь, вход в проходную, бюро пропусков и во двор
  N('zv_stop', -334, 3.4); N('zv_sq', -334, 0.2); N('zv_door', -334, -1.0); N('zv_foyer', -334, -3.4); N('zv_exit', -334, -6.6); N('zv_yard', -334, -12.0);
  E('zv_stop', 'sw6'); E('zv_stop', 'zv_sq'); E('zv_sq', 'zv_door'); E('zv_door', 'zv_foyer'); E('zv_foyer', 'zv_exit'); E('zv_exit', 'zv_yard');
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
  // форма поверх модели прохожего: фуражка с красным околышем и кокардой, красные погоны, ремень с кобурой
  const polMat = { crown: std({ color: 0x1e2440, roughness: .8 }), band: std({ color: 0xa8261c, roughness: .6 }), visor: std({ color: 0x0d0d0f, roughness: .25, metalness: .3 }),
    gold: std({ color: 0xd4af37, roughness: .3, metalness: .8 }), belt: std({ color: 0x151313, roughness: .45 }), holster: std({ color: 0x2b1d14, roughness: .55 }) };
  function dressPolice(h, P) {
    const R = h.R, s = h.L.height / P.cfg.height, hz = (P.headZ || 0) * s, top = (P.headTop || .26) * s;
    const cap = new THREE.Group(); cap.position.set(0, top - .045 * s, hz); R.head.add(cap);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(.128, .1, .07, 18), polMat.crown); crown.position.y = .06; crown.scale.z = 1.08; cap.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .035, 18), polMat.band); band.position.y = .012; band.scale.z = 1.08; cap.add(band);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .006, 18, 1, false, -Math.PI * .45, Math.PI * .9), polMat.visor); visor.position.set(0, -.006, .035); visor.rotation.x = .25; visor.scale.set(1, 1, 1.15); cap.add(visor);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(.014, 10), polMat.gold); badge.position.set(0, .03, .109); cap.add(badge);
    cap.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const shZ = (P.cfg.shZ != null ? P.cfg.shZ : -.099) * s;
    for (const sg of [1, -1]) {
      const ep = new THREE.Mesh(new THREE.BoxGeometry(.095, .010, .046), polMat.band);
      // Точно на плечевом шве кителя милиционера (z = shZ, с естественным наклоном плеча)
      ep.position.set(sg * .142 * s, (P.cfg.shY - P.cfg.hipY) * s + .046 * s, shZ);
      ep.rotation.z = -sg * .18;
      R.spine.add(ep);
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .012, 8), polMat.gold);
      btn.position.set(-sg * .034, .002, 0);
      ep.add(btn);
    }
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(.175, .175, .045, 20, 1, true), polMat.belt); belt.position.set(0, .1 * s, -.023 * s); belt.scale.z = .76; R.spine.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(.05, .035, .012), polMat.gold); buckle.position.set(0, .1 * s, .112 * s); R.spine.add(buckle);
    const hol = new THREE.Mesh(new THREE.BoxGeometry(.05, .12, .1), polMat.holster); hol.position.set(-.178 * s, .05 * s, -.045 * s); R.spine.add(hol);
  }
  function newPerson(kind, role, nodeId, extra) {
    if (kind === "school") kind = "youth";
    const look = makeLook(kind);
    // модели «Зимние люди» для всех, кроме милиции (у неё своя форма); сталевар — среди рабочих
    let model = null;
    if (kind === 'police' && policeModel) model = policeModel; // милиционер — своя модель в форме
    else if (kind !== 'police') {
      if (staticWorker && kind === 'worker' && outfitNow() === 'summer' && Math.random() < .2) model = staticWorker; // рабочий в майке — только летом
      else if (peopleModels.length) {
        const peopleModels = peopleByOutfit[outfitNow()] || peopleByOutfit.winter; // одежда по сезону
        const pool = peopleModels.filter(m => m.female === !look.male);
        const used = new Set(people.map(q => q.modelName));
        const fresh = (pool.length ? pool : peopleModels).filter(m => !used.has(m.name));
        const pm = pick(fresh.length ? fresh : (pool.length ? pool : peopleModels)); model = pm.parts; extra = Object.assign({ modelName: pm.name }, extra || {});
      }
    }
    if (kind === 'school') { kind = 'youth'; look.height = 1.76; look.bag = null; } // модель мальчика-школьника убрана по просьбе игрока
    if (model && model.sds) look.height = (model === policeModel || !/^c(mesz|pros)/.test(extra && extra.modelName || '')) ? 1.79 : 1.75; // все одного роста, женщины чуть ниже
    const h = new Human(look, model);
    if (model && model === policeModel && model.sds) dressPolice(h, model);
    const n = NODES[nodeId]; h.obj.position.set(n.x + R(-.3, .3), 0, n.z + R(-.3, .3)); scene.add(h.obj);
    const shadow = new THREE.Mesh(blobGeo, blobMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; h.obj.add(shadow);
    const p = Object.assign({ h, role, state: 'idle', path: [], speed: look.walkSpeed, timer: 0, kind, fear: 0, id: Math.random() }, extra || {});
    people.push(p); return p;
  }
  const blobGeo = new THREE.CircleGeometry(.32, 16), blobMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .32, depthWrite: false });
  function removePerson(p) { if (p && (p.role === 'marat' || p.role === 'zavod')) return; scene.remove(p.h.obj); const i = people.indexOf(p); if (i >= 0) people.splice(i, 1); }
  function goTo(p, x, z, then, viaGraph = false) {
    if (p.dead) return;
    // цель внутри препятствия (бак, машина, ограждение) — сдвигаем к ближайшему свободному месту
    if (p.role === 'ped' && npcBlocked(x, z)) { let f = null; for (let r = .3; r < 3 && !f; r += .3) for (let a = 0; a < 6.28; a += .5) { const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r; if (!npcBlocked(tx, tz)) { f = [tx, tz]; break; } } if (f) [x, z] = f; }
    const o = p.h.obj.position, a = nearestNode(o.x, o.z), b = nearestNode(x, z); const pt = path(a, b); pt.push({ x, z });
    // не возвращаться к узлу, который уже позади
    while (pt.length > 1 && Math.hypot(pt[1].x - o.x, pt[1].z - o.z) <= Math.hypot(pt[1].x - pt[0].x, pt[1].z - pt[0].z) + .2) pt.shift();
    if (!viaGraph && Math.hypot(x - o.x, z - o.z) < 6 && !segBlocked(o.x, o.z, x, z)) pt.splice(0, pt.length - 1); // рядом и путь свободен — напрямую
    p.path = pt; p.then = then; p.state = 'walk';
  }
  function segBlocked(x1, z1, x2, z2) { const d = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(d / .3); for (let i = 1; i <= n; i++) { const t = i / n; if (npcBlocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)) return true; } return false; }
  function leaveWorld(p) { if (p.dead || p.role === 'marat' || p.role === 'zavod') return; const target = NODES[pickSpawn(p.h.obj.position)]; goTo(p, target.x, target.z, () => removePerson(p)); p.leaving = true; }
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
    const want = Math.min(Q.npc - 4, night ? 4 : 12, LITE ? 6 : 99); // на слабых GPU прохожих меньше
    if (peds < want && peopleModels.length && Math.random() < dt * .7) {
      const kind = night ? pick(['worker', 'youth', 'gopnik', 'police']) : pick(['babka', 'dedushka', 'worker', 'youth', 'neighbor', 'police']);
      const sp = pickSpawn({ x: R(-40, 40), z: R(-15, 10) });
      const p = newPerson(kind, 'ped', sp); wander(p);
      // часть прохожих задерживается: ждёт автобус, курит у ларька, стоит у подъезда, болтает
      if (Math.random() < .55) {
        scheduleSmartPedActivity(p);
      }
    }
    // гопники
    if (S && !gopnikGroup && S.day >= 2 && Math.random() < dt * (night ? .012 : .004) * (S.rep.street >= 30 ? .4 : 1)) spawnGopniks();
  }
  // Места на скамейках автобусных остановок (чтобы люди садились ровно на лавку лицом к дороге, а не проходили сквозь неё)
  const BENCH_SPOTS = [
    { id: 'kiosk_0', stopKey: 'kiosk', x: 7.25, z: 3.16, rot: 0, occupant: null },
    { id: 'kiosk_1', stopKey: 'kiosk', x: 8.00, z: 3.16, rot: 0, occupant: null },
    { id: 'kiosk_2', stopKey: 'kiosk', x: 8.75, z: 3.16, rot: 0, occupant: null },
    { id: 'kiosk_opp_0', stopKey: 'kiosk_opp', x: 7.30, z: 16.84, rot: Math.PI, occupant: null },
    { id: 'kiosk_opp_1', stopKey: 'kiosk_opp', x: 8.20, z: 16.84, rot: Math.PI, occupant: null },
    { id: 'zavod_0', stopKey: 'zavod', x: -92.6, z: 3.16, rot: 0, occupant: null },
    { id: 'zavod_1', stopKey: 'zavod', x: -91.6, z: 3.16, rot: 0, occupant: null },
  ];
  function releaseBench(p) {
    if (p && p.benchSpot) {
      if (p.benchSpot.occupant === p) p.benchSpot.occupant = null;
      p.benchSpot = null;
    }
  }
  function scheduleSmartPedActivity(p) {
    if (!p || p.dead || p.role !== 'ped') return;
    releaseBench(p);
    const roll = Math.random();
    // 1) Сесть на скамейку остановки и ждать автобус №7
    if (roll < .26) {
      const freeBench = BENCH_SPOTS.filter(b => !b.occupant && Math.hypot(b.x - p.h.obj.position.x, b.z - p.h.obj.position.z) < 48);
      if (freeBench.length) {
        const b = pick(freeBench);
        b.occupant = p;
        p.benchSpot = b;
        const approachZ = b.rot === 0 ? b.z + .65 : b.z - .65;
        goTo(p, b.x, approachZ, () => {
          if (!people.includes(p) || p.dead) { releaseBench(p); return; }
          p.h.obj.position.set(b.x, 0, b.z);
          p.h.obj.rotation.y = b.rot;
          p.state = 'sit_bench';
          p.anim = 'sit';
          p.waitingBus = b.stopKey;
          p.timer = R(35, 95);
        });
        return;
      }
    }
    // 2) Подойти к расписанию автобуса №7 на остановке и внимательно прочитать его
    if (roll < .42) {
      const sched = Math.random() < .75
        ? { x: 9.05 + R(-.25, .25), z: 3.72, rot: Math.PI, stopKey: 'kiosk' }
        : { x: 6.95 + R(-.25, .25), z: 16.28, rot: 0, stopKey: 'kiosk_opp' };
      goTo(p, sched.x, sched.z, () => {
        p.state = 'pause';
        p.faceRot = sched.rot;
        p.waitingBus = sched.stopKey;
        p.timer = R(12, 28);
        p.anim = 'inspect';
      });
      return;
    }
    // 3) Подойти к витрине ларька и рассмотреть выложенный товар
    if (roll < .58 && Math.abs(p.h.obj.position.x) < 40) {
      const vx = R(-.85, .85), vz = 2.42;
      goTo(p, vx, vz, () => {
        p.state = 'pause';
        p.faceRot = Math.PI;
        p.timer = R(8, 18);
        p.anim = 'inspect';
      });
      return;
    }
    // 4) Подойти к уличной урне, выбросить фантик/окурок и погреть руки или покурить
    if (roll < .74 && typeof TRASH_SMALL !== 'undefined' && TRASH_SMALL.length) {
      const urn = pick(TRASH_SMALL);
      const tx = urn.x + R(-.35, .35), tz = urn.z + .52;
      goTo(p, tx, tz, () => {
        p.state = 'pause';
        p.faceRot = Math.atan2(urn.x - tx, urn.z - tz);
        p.timer = R(6, 14);
        p.anim = 'pay';
        setTimeout(() => {
          if (people.includes(p) && p.state === 'pause') {
            p.anim = winter && Math.random() < .5 ? 'warm' : (p.kind === 'worker' || p.kind === 'youth' || p.kind === 'gopnik' ? 'smoke' : 'wait');
          }
        }, 1400);
      });
      return;
    }
    // 5) Спокойное ожидание на площадке остановки (вне скамейки!) или прогулка во дворах
    const spot = pick([
      [6.4, 4.35, 'wait', 'kiosk'],
      [9.4, 4.45, 'warm', 'kiosk'],
      [3.3, 3.05, 'smoke', null],
      [-3.4, 3.20, 'warm', null],
      [-24, 20.4, 'idle', null],
      [20, 20.6, 'idle', null],
      [-10, 16.6, 'talk', null],
      [12, 16.8, 'wait', 'kiosk_opp'],
    ]);
    goTo(p, spot[0] + R(-.35, .35), spot[1] + R(-.22, .22), () => {
      p.state = 'pause';
      p.waitingBus = spot[3];
      p.timer = R(20, 65);
      p.anim = winter && spot[2] === 'idle' && Math.random() < .45 ? 'warm' : spot[2];
    });
  }
  function wander(p) {
    if (!p || p.dead) return;
    releaseBench(p);
    p.waitingBus = null;
    p.faceRot = null;
    if (p.role === 'ped' && Math.random() < .42) {
      scheduleSmartPedActivity(p);
      return;
    }
    const keys = Object.keys(NODES).filter(k => !k.startsWith('sp') && k !== 'w'); const k = pick(keys);
    goTo(p, NODES[k].x + R(-1, 1), NODES[k].z + R(-.6, .6), () => {
      if (Math.random() < .35) { p.state = 'pause'; p.timer = R(4, 11); p.anim = pick(['idle', 'wait', winter ? 'warm' : 'idle', p.kind === 'gopnik' || p.kind === 'youth' ? 'smoke' : 'idle']); }
      else if (Math.random() < .22) leaveWorld(p); else wander(p);
    });
  }

  // ---------- покупатели ----------
  const WIN = { x: 0, z: 1.95 };
  const QSLOTS = [[1.05, 2.75], [1.9, 3.1], [2.75, 3.35], [3.6, 3.5], [4.45, 3.55], [5.3, 3.6]];
  const CUST_KIND = { babka: 'babka', school: 'youth', worker: 'worker', student: 'youth', chelnok: 'chelnok', newrus: 'newrus', racket: 'racket', police: 'police', neighbor: 'neighbor' };
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
    if (ev === 'sold' || ev === 'talk') { hatchTarget = 1; hatchAutoTimer = 2.5; }
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
    if (npcBlocked(o.x, o.z)) { // уже внутри препятствия (затолкали, заехала машина) — выбираемся в ближайшую свободную сторону
      const a0 = Math.atan2(dx, dz); let best = null;
      for (let r = .35; r <= 1.6 && !best; r += .35) for (const da of [0, .6, -.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5, 3.14]) { const a = a0 + da; if (!npcBlocked(o.x + Math.sin(a) * r, o.z + Math.cos(a) * r)) { best = a; break; } }
      if (best !== null) { const v = Math.max(st, spd * dt); mx = Math.sin(best) * v; mz = Math.cos(best) * v; }
    } else if (npcBlocked(o.x + mx, o.z + mz)) {
      const len = Math.hypot(mx, mz) || st, a0 = Math.atan2(mx, mz); let ok = false;
      for (const da of [.5, -.5, 1, -1, 1.5, -1.5, 2.1, -2.1]) { const a = a0 + da * (p.side || 1), nx = Math.sin(a) * len, nz = Math.cos(a) * len; if (!npcBlocked(o.x + nx, o.z + nz)) { mx = nx; mz = nz; ok = true; break; } }
      if (!ok) { mx = mz = 0; }
      p.stuck = (p.stuck || 0) + dt;
      if (p.stuck > 1.6) { p.stuck = 0; p.side = -(p.side || 1); p.stuckN = (p.stuckN || 0) + 1;
        if (p.stuckN >= 4) unstick(p); // обход не помог несколько раз подряд
        else if (p.path && p.path.length) { const fin = p.path[p.path.length - 1], then = p.then; goTo(p, fin.x, fin.z, then, true); } }
    } else { p.stuck = Math.max(0, (p.stuck || 0) - dt); if (!p.stuck) p.stuckN = 0; }
    // сглаживаем шаг: толчки соседей и обход не должны дёргать человека из кадра в кадр
    p.vx = (p.vx ?? mx) + (mx - (p.vx ?? mx)) * Math.min(1, dt * 10); p.vz = (p.vz ?? mz) + (mz - (p.vz ?? mz)) * Math.min(1, dt * 10);
    if (!npcBlocked(o.x + p.vx, o.z + p.vz) || npcBlocked(o.x, o.z)) { mx = p.vx; mz = p.vz; }
    o.x += mx; o.z += mz;
    const ml = Math.hypot(mx, mz);
    if (ml > spd * dt * .3) faceTo(p, Math.atan2(mx, mz), dt * .7); // разворот только при заметном движении
    return ml;
  }
  // крайний случай: человек так и не смог обойти препятствие. Если игрок не видит — переставляем на свободное место
  // рядом со следующей точкой пути; если видит — бросает цель и уходит другой дорогой.
  function unstick(p) {
    p.stuckN = 0; const o = p.h.obj.position, nx = p.path && p.path[0];
    if (nx && !visibleFromPlayer(o.x, o.z)) {
      for (let r = 0; r < 3; r += .4) for (let a = 0; a < 6.28; a += .7) { const x = nx.x + Math.cos(a) * r, z = nx.z + Math.sin(a) * r; if (!npcBlocked(x, z) && !visibleFromPlayer(x, z)) { o.x = x; o.z = z; return; } }
    }
    if (p.role === 'ped' && !p.leaving) { const tSafe = NODES[pickSpawn(p.h.obj.position)]; goTo(p, tSafe.x, tSafe.z, null); }
    else if (p.path && p.path.length) { const fin = p.path[p.path.length - 1]; goTo(p, fin.x, fin.z, p.then, true); }
  }
  function npcBlocked(x, z, ignoreStopBench = false) {
    { const o = transport.obstacle(), ca = Math.abs(Math.cos(o.heading)), sa = Math.abs(Math.sin(o.heading)), hx = o.hx * ca + o.hz * sa, hz = o.hx * sa + o.hz * ca; if (Math.abs(x - o.x) < hx + .2 && Math.abs(z - o.z) < hz + .2) return true; }
    if (Math.abs(x) < KW + .32 && z > -KD - .32 && z < KD + .32) return true; // ларёк
    for (const b of colliders) if (b.tag !== 'door' && x > b.x1 - .24 && x < b.x2 + .24 && z > b.z1 - .24 && z < b.z2 + .24) return true;
    // Павильоны и скамейки всех автобусных остановок — чтобы NPC не ходили сквозь лавки и стенки павильона (5922.png)
    if (!ignoreStopBench) {
      for (const st of Object.values(STOPS)) {
        const dir = st.dir || 1;
        const bz = st.z + dir * -.35;
        if (Math.abs(x - st.x) < 1.65 && Math.abs(z - bz) < .46) return true;
      }
    }
    // Уличные урны и мусорные баки
    if (typeof TRASH_SMALL !== 'undefined') {
      for (const u of TRASH_SMALL) if (Math.hypot(x - u.x, z - u.z) < .38) return true;
    }
    if (typeof TRASH_BIG !== 'undefined') {
      for (const b of TRASH_BIG) if (Math.hypot(x - b.x, z - b.z) < .82) return true;
    }
    // Динамические предметы на земле (коробки, упаковки, бутылки, ружьё) — люди видят их и аккуратно обходят!
    if (typeof life !== 'undefined' && life && life.items) {
      for (const it of life.items) {
        if (it === life.held || it.inBoxId || it._inBus || it.obj.position.y > .65) continue;
        const r = it.kind === 'box' ? .46 : it.kind === 'pack' || it.kind === 'gun' ? .34 : .26;
        if (Math.hypot(x - it.obj.position.x, z - it.obj.position.z) < r) return true;
      }
    }
    // Лежащие без сознания / убитые тела на земле — прохожие обходят их стороной
    for (const q of people) {
      if (q.dead && q.h && q.h.obj && Math.hypot(x - q.h.obj.position.x, z - q.h.obj.position.z) < .65) return true;
    }
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
    if (!marat && placeMaratCar.done) spawnMarat();
    if (marat) {
      if (!people.includes(marat)) people.push(marat);
      if (!marat.h.obj.parent) scene.add(marat.h.obj);
      marat.leaving = false; marat.flee = false; marat.path.length = 0;
      marat.h.obj.position.set(MARAT_CAR.x - .3, 0, MARAT_CAR.z + 1.12);
      const S3 = ctx.getS(), away = !!(S3 && S3.phase === 'night' && hour > 23); marat.hidden = away; marat.h.obj.visible = !away;
      const d = Math.hypot(P.x - marat.h.obj.position.x, P.z - marat.h.obj.position.z);
      if (marat.state !== 'scared') { marat.state = 'stand'; marat.anim = d < 5 ? (marat.talking ? 'talk' : 'idle') : 'smoke'; if (d < 7) faceTo(marat, Math.atan2(P.x - marat.h.obj.position.x, P.z - marat.h.obj.position.z), dt); else faceTo(marat, Math.PI * .6, dt); }
    }
    if (zavodNpc && !zavodNpc.dead) {
      const dz = Math.hypot(P.x - zavodNpc.h.obj.position.x, P.z - zavodNpc.h.obj.position.z);
      if (zavodNpc.state !== 'scared') {
        zavodNpc.anim = dz < 5 ? (zavodNpc.talking ? 'talk' : 'idle') : 'idle';
        if (dz < 8) faceTo(zavodNpc, Math.atan2(P.x - zavodNpc.h.obj.position.x, P.z - zavodNpc.h.obj.position.z), dt);
        else faceTo(zavodNpc, 0, dt);
      }
    }
    for (const p of people.slice()) {
      if (p.dead) { deadTick(p, dt); continue; }
      // Динамическая подсветка людей от ближайшего уличного фонаря, окна ларька и дневного света
      if (p.h && p.h.R && p.h.R.skinMat) {
        const sm = p.h.R.skinMat, ox = p.h.obj.position.x, oz = p.h.obj.position.z;
        const nearPoleX = clamp(Math.round((ox - 14) / 20) * 20 + 14, -426, 74);
        const dLamp = Math.hypot(ox - nearPoleX, oz - 6.6);
        const dKiosk = Math.hypot(ox, oz - 1.2);
        const lampK = nightK > .2 ? Math.max(0, 1 - dLamp / 8.5) * nightK : 0;
        const kioskK = Math.max(0, 1 - dKiosk / 6.0) * (.35 + nightK * .65);
        const warmK = Math.max(lampK, kioskK * .75);
        if (warmK > .05) {
          sm.emissive.setRGB(.22 + warmK * .72, .20 + warmK * .46, .18 + warmK * .20);
          sm.emissiveIntensity = .26 + warmK * .52;
        } else {
          const amb = .24 + (1 - nightK) * .16;
          sm.emissive.setRGB(.22, .22, .24);
          sm.emissiveIntensity = amb;
        }
      }
      umbrellaTick(p);
      if (p.role === 'cust') custTick(p, dt);
      let dist = 0;
      if (p.hitStun > 0) {
        p.hitStun = Math.max(0, p.hitStun - dt);
      }
      if (p.brawling && !p.dead) {
        // Если игрок достал ружьё во время кулачной драки — противники пугаются и разбегаются
        if (weapon.drawn && p.kind !== 'police') {
          p.brawling = false; p.flee = true; p.h.setExpr('scared');
          if (p.group) gopLeave(p.group, 'flee'); else leaveWorld(p);
        } else {
          const ox = p.h.obj.position.x, oz = p.h.obj.position.z;
          const dP = Math.hypot(P.x - ox, P.z - oz);
          faceTo(p, Math.atan2(P.x - ox, P.z - oz), dt * 2.2);
          if (dP > 1.25 && p.hitStun <= 0 && !inKiosk()) {
            dist = moveToward(p, P.x, P.z, dt, 2.25);
            p.h.setAnim('walk');
          } else {
            p.h.setAnim('threaten');
          }
          p.punchCd = (p.punchCd || .6) - dt;
          if (dP < 1.55 && p.punchCd <= 0 && p.hitStun <= 0) {
            p.punchCd = R(1.1, 1.65);
            p.swingT = .28;
            ctx.audio && ctx.audio.thud(.55);
            post.uniforms.hurt.value = Math.max(post.uniforms.hurt.value, .45);
            P.shake = Math.max(P.shake, .28);
            P.pitch = clamp(P.pitch + .07, -1.35, 1.25);
          }
        }
      } else if (p.state === 'walk' && p.path.length) {
        const tg = p.path[0], spd = p.flee ? 3.8 : p.speed * (p.role === 'cust' && p.path.length > 2 ? 1.1 : 1);
        dist = moveToward(p, tg.x, tg.z, dt, spd);
        const dTg = Math.hypot(tg.x - p.h.obj.position.x, tg.z - p.h.obj.position.z);
        // точку заняли другие люди и толкаются — засчитываем приход, если уже рядом и почти не продвигаемся
        p.crowd = p.role === 'ped' && dTg < 1.3 && dist < spd * dt * .25 ? (p.crowd || 0) + dt : 0;
        if (dTg < .25 || p.crowd > 1.2) { p.crowd = 0; p.path.shift(); if (!p.path.length) { p.state = 'arrived'; const f = p.then; p.then = null; f && f(); } }
        p.h.setAnim(p.flee ? 'flee' : spd > 2.5 ? 'run' : 'walk');
      } else if (p.state === 'sit_bench') {
        p.timer -= dt;
        p.h.setAnim('sit');
        if (p.benchSpot) {
          p.h.obj.position.set(p.benchSpot.x, 0, p.benchSpot.z);
          faceTo(p, p.benchSpot.rot, dt);
        }
        if (p.timer <= 0) { releaseBench(p); wander(p); }
      } else if (p.state === 'pause') {
        p.timer -= dt;
        p.h.setAnim(p.anim || 'idle');
        if (p.faceRot != null) faceTo(p, p.faceRot, dt);
        if (p.timer <= 0) wander(p);
      }
      else if (p.state === 'step') { p.h.setAnim('walk'); dist = .9 * dt; }
      else if (p.state === 'scared') { p.timer -= dt; p.h.setAnim(p.anim); if (p.timer <= 0) { p.h.setExpr('neutral'); if (p.role === 'ped') leaveWorld(p); else p.state = p.prevState || 'idle'; } }
      else if (p.state === 'talking') { p.timer -= dt; p.h.setAnim('talk'); faceTo(p, Math.atan2(P.x - p.h.obj.position.x, P.z - p.h.obj.position.z), dt); if (p.timer <= 0) { p.h.setExpr('neutral'); wander(p); } }
      else p.h.setAnim(p.anim || 'idle');

      // Зрение и восприятие мира NPC: замечают тела, брошенное оружие, коробки на дороге и комментируют их
      if (p.role === 'ped' && !p.dead && !p.inBus && p.state !== 'talking') {
        p.perceptCd = (p.perceptCd || R(.5, 1.8)) - dt;
        if (p.perceptCd <= 0) {
          p.perceptCd = R(1.4, 2.8);
          const ox = p.h.obj.position.x, oz = p.h.obj.position.z;
          const mem = p.memory = p.memory || {};
          // 1) Замечают убитого или вырубленного человека поблизости
          for (const q of people) {
            if (!q.dead || !q.h || !q.h.obj) continue;
            const dBody = Math.hypot(q.h.obj.position.x - ox, q.h.obj.position.z - oz);
            if (dBody < 9.5 && !mem.reactedBody) {
              mem.reactedBody = true;
              mem.sawBody = true;
              if (p.kind === 'police') {
                if (Math.hypot(P.x - ox, P.z - oz) < 12) {
                  ctx.say && ctx.say(p, 'Гражданин! Тут человек на земле лежит — ваших рук дело?!');
                }
              } else {
                releaseBench(p);
                p.flee = true; p.h.setExpr('scared'); leaveWorld(p); p.speed = 3.5;
                if (Math.hypot(P.x - ox, P.z - oz) < 14 && Math.random() < .65) {
                  ctx.say && ctx.say(p, pick(['Господи, человек на снегу лежит!', 'Караул! Тут человека уложили!', 'Бежим отсюда скорее!']));
                }
              }
              break;
            }
          }
          // 2) Замечают брошенное ружьё или коробки/бутылки на земле и реагируют
          if (!p.flee && life && life.items && Math.hypot(P.x - ox, P.z - oz) < 14) {
            for (const it of life.items) {
              if (it === life.held || it.inBoxId || it._inBus || it.obj.position.y > .55) continue;
              const dIt = Math.hypot(it.obj.position.x - ox, it.obj.position.z - oz);
              if (dIt < 2.8 && (!mem.lastItemNote || performance.now() - mem.lastItemNote > 22000)) {
                mem.lastItemNote = performance.now();
                if (it.kind === 'gun') {
                  ctx.say && ctx.say(p, pick(['Ничего себе, двустволка прямо на снегу валяется!', 'Оружие на дороге брошено… Не к добру это!']));
                } else if (it.kind === 'box' && Math.random() < .45) {
                  ctx.say && ctx.say(p, pick(['Кто это коробку посреди дороги поставил? Обойду стороной.', 'Опять ящики с товаром на тротуаре бросили…']));
                } else if (it.kind === 'bottle' && Math.random() < .35) {
                  ctx.say && ctx.say(p, 'Опять пустых бутылок под ноги набросали…');
                }
                break;
              }
            }
          }
        }
      }
      // видимость и дальность прорисовки
      const far = Math.hypot(p.h.obj.position.x - camPos.x, p.h.obj.position.z - camPos.z);
      p.h.obj.visible = !p.hidden && far < Q.draw * .6;
      if (p.h.obj.visible) {
        p.h.update(dt, dist);
        if (p.hitStun > 0 && p.h.R && p.h.R.spine) {
          p.h.R.spine.rotation.x -= p.hitStun * .75;
          if (p.h.R.head) p.h.R.head.rotation.x -= p.hitStun * .55;
        }
        if (p.swingT > 0) {
          p.swingT = Math.max(0, p.swingT - dt);
          if (p.h.R && p.h.R.shR) p.h.R.shR.rotation.x = -1.45 * Math.sin((p.swingT / .28) * Math.PI);
        }
      }
    }
  }

  function busExchange(key, doorFront, doorRear) {
    const d0 = doorFront || transport.doorWorld(0);
    const d1 = doorRear || transport.doorWorld(1);
    let boardedCnt = 0;
    for (const p of people) {
      if (p.role !== 'ped' || p.dead || p.inBus || p.brawling) continue;
      const dist0 = Math.hypot(p.h.obj.position.x - d0.x, p.h.obj.position.z - d0.z);
      const dist1 = Math.hypot(p.h.obj.position.x - d1.x, p.h.obj.position.z - d1.z);
      const minD = Math.min(dist0, dist1);
      const wantsBus = p.waitingBus === key || minD < 9.5;
      if (wantsBus && minD < 13 && boardedCnt < 3) {
        boardedCnt++;
        releaseBench(p);
        p.leaving = false;
        const useRear = dist1 < dist0;
        const targetDoor = useRear ? d1 : d0;
        const doorIdx = useRear ? 1 : 0;
        p.state = 'walk';
        p.path = [{ x: targetDoor.x, z: targetDoor.z }];
        p.then = () => {
          if (!people.includes(p) || p.dead) return;
          if (transport.state === 'stop' && transport.boardNpcPassenger && transport.boardNpcPassenger(p, doorIdx)) {
            // Пассажир поднимается по ступенькам в салон ПАЗа и садится на свободное место
            const idx = people.indexOf(p);
            if (idx >= 0) people.splice(idx, 1);
          } else {
            wander(p);
          }
        };
      }
    }
    // Если в автобусе мало сидящих пассажиров — на остановке также может выйти 1 новый приезжий пассажир по ступенькам из салона
    if (transport.busPassengers && transport.busPassengers.length === 0 && people.length < Q.npc && Math.random() < .65) {
      const kind = pick(['babka', 'worker', 'youth', 'neighbor']);
      const id = 'tmpBus' + Math.random();
      N(id, d0.x, d0.z);
      const pp = newPerson(kind, 'ped', id);
      delete NODES[id];
      const idx = people.indexOf(pp);
      if (idx >= 0) people.splice(idx, 1);
      if (transport.boardNpcPassenger && transport.boardNpcPassenger(pp, 0)) {
        const bp = transport.busPassengers.find(x => x.p === pp);
        if (bp) {
          bp.lx = 0; bp.ly = .775; bp.lz = 0;
          if (bp.seat) { bp.seat.occupant = null; bp.seat = null; }
          bp.state = 'walk_to_door';
        }
      }
    }
  }
  // ---------- Марат: посредник на остановке у ларька ----------
  let marat = null, zavodNpc = null;
  const MARAT_CAR = { x: STOPS.kiosk.x + .6, z: -1.15 }; // чёрная BMW Марата — за павильоном остановки, вдоль улицы
  function placeMaratCar() {
    if (!ASSETS.bmw733i || placeMaratCar.done) return; placeMaratCar.done = true;
    const o = placeModel(ASSETS.bmw733i, MARAT_CAR.x, MARAT_CAR.z, 0);
    o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    addCol(MARAT_CAR.x - 2.43, MARAT_CAR.x + 2.43, MARAT_CAR.z - .97, MARAT_CAR.z + .97); occ(o);
    const blob = new THREE.Mesh(carBlobGeo, carBlobMat); blob.rotation.x = -Math.PI / 2; blob.position.set(MARAT_CAR.x, .02, MARAT_CAR.z); blob.scale.set(1.15, 1.1, 1); scene.add(blob);
  }
  function spawnMarat() {
    placeMaratCar();
    if (marat && marat.h && marat.h.R && marat.h.R.sds) return;
    if (marat) { scene.remove(marat.h.obj); const idx = people.indexOf(marat); if (idx >= 0) people.splice(idx, 1); marat = null; }
    const look = makeLook('worker'); Object.assign(look, { male: true, height: 1.79, build: 1.15, top: '#141414', leather: true, puffy: false, pants: '#1d1d22', boots: '#111', hat: 'kepka', hatC: '#262626', hairStyle: 'short', hair: '#1c1410', facial: 'mustache', chain: true, scarf: null, bag: null, coat: false, stripes: null, apron: null, age: 38, nerve: .7, aggression: .2, swagger: .6, kind: 'worker' });
    const mPool = (peopleByOutfit.winter || peopleModels).filter(m => !m.female);
    const mPm = mPool.find(m => m.name === 'cirand') || mPool[0] || null;
    const h = new Human(look, mPm ? mPm.parts : null); h.obj.position.set(MARAT_CAR.x - .3, 0, MARAT_CAR.z + 1.12); h.obj.rotation.y = 0; scene.add(h.obj); // за остановкой, у своей BMW
    if (!mPm) h.R.body.rotation.x = -.11;
    const sh = new THREE.Mesh(blobGeo, blobMat); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; h.obj.add(sh);
    marat = { h, role: 'marat', state: 'stand', anim: 'smoke', path: [], kind: 'worker', title: 'Марат', talk: () => ctx.maratTalk && ctx.maratTalk(), id: 'marat' };
    people.push(marat);
  }
  // ---------- Кладовщик Геннадий в бюро пропусков проходной «Краснозаводского завода» ----------
  function spawnZavodNpc() {
    if (zavodNpc) return;
    const look = makeLook('worker');
    Object.assign(look, {
      male: true, height: 1.76, build: 1.18,
      top: '#283848', leather: false, puffy: true,
      pants: '#22262c', boots: '#181614',
      hat: 'ushanka', hatC: '#3a322a',
      hairStyle: 'short', hair: '#5a524a', facial: 'mustache',
      chain: false, scarf: '#58241e', bag: null, coat: false, stripes: null, apron: null,
      age: 48, nerve: .8, aggression: .2, swagger: .4, kind: 'worker'
    });
    const h = new Human(look, null);
    // Стоит прямо внутри проходной у прилавка бюро пропусков, встречая входящего игрока!
    h.obj.position.set(-333.6, 0, -3.2);
    h.obj.rotation.y = -Math.PI / 2;
    scene.add(h.obj);
    const sh = new THREE.Mesh(blobGeo, blobMat); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; h.obj.add(sh);
    zavodNpc = { h, role: 'zavod', state: 'stand', anim: 'idle', path: [], kind: 'worker', title: 'Кладовщик Геннадий', talk: () => ctx.factoryTalk && ctx.factoryTalk(), id: 'zavod_gena' };
    people.push(zavodNpc);
  }
  // ---------- ружьё и реакции ----------
  const weapon = createWeapon({ audio: ctx.audio, onShot: () => onShot() });
  // ---------- автобус №7 и остановки ----------
  let riderCam = null;
  const transport = createTransport({ scene, std, routePoint, route: ROUTES[1], P, camera, ctx, audio: ctx.audio, onCtl: () => ctx.onCtl(), night: () => nightK > .45,
    setRiderCam: (p, k) => { riderCam = p.clone(); }, onAlight: (x, z, key) => { riderCam = null; P.x = x; P.z = z; P.vx = P.vz = 0; P.h = 1.66; ctx.toast && ctx.toast('Остановка «' + STOPS[key].name + '»'); },
    onArrive: (key, dFront, dRear) => busExchange(key, dFront, dRear),
    onNpcAlighted: (p, wx, wz) => {
      if (!people.includes(p)) people.push(p);
      p.inBus = false;
      p.leaving = false;
      p.waitingBus = null;
      p.h.obj.position.set(wx, 0, wz);
      wander(p);
    } });
  const busCol = addCol(999, 999, 999, 999, 'bus');
  // ---------- ружьё как физический предмет: на стене / в руках / лежит в мире ----------
  let gunGeo = null, gunMat = null;
  // Модель ружья приводим к одной системе координат, как бы ни был повёрнут исходный файл:
  // длинная ось — Z, приклад (торец) в z = 0, стволы уходят в −Z, высота — Y, ширина — X, центр по X/Y в нуле.
  let gunLen = 1.1, gunW = .06;
  // разворот обхода треугольников, если грани смотрят внутрь (после нормализации осей скан мог отразиться) — иначе модель «просвечивает»
  function fixWinding(g) {
    // знак объёма замкнутой модели: > 0 — грани смотрят наружу; < 0 — вывернуты (пересчёт нормалей по такому обходу тоже даёт «внутрь»)
    const pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, I = k => idx ? idx.getX(k) : k;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let vol = 0;
    g.computeBoundingBox(); const ctr = g.boundingBox.getCenter(new THREE.Vector3());
    for (let k = 0; k < n; k += 3) { a.fromBufferAttribute(pos, I(k)).sub(ctr); b.fromBufferAttribute(pos, I(k + 1)).sub(ctr); c.fromBufferAttribute(pos, I(k + 2)).sub(ctr); vol += a.dot(b.cross(c)); }
    if (vol >= 0) return g;
    if (idx) { for (let k = 0; k < n; k += 3) { const t = idx.getX(k + 1); idx.setX(k + 1, idx.getX(k + 2)); idx.setX(k + 2, t); } idx.needsUpdate = true; g.computeVertexNormals(); return g; }
    const ng = g.toNonIndexed(); for (const name of Object.keys(ng.attributes)) { const at = ng.attributes[name], s = at.itemSize, arr = at.array;
      for (let k = 0; k < ng.attributes.position.count; k += 3) for (let j = 0; j < s; j++) { const t = arr[(k + 1) * s + j]; arr[(k + 1) * s + j] = arr[(k + 2) * s + j]; arr[(k + 2) * s + j] = t; } at.needsUpdate = true; }
    ng.computeVertexNormals(); return ng;
  }
  function normGun(g) {
    g.computeBoundingBox();
    const bb0 = g.boundingBox;
    if (bb0 && Math.abs(bb0.max.z) < .02 && (bb0.max.z - bb0.min.z) > .85 && (bb0.max.x - bb0.min.x) < .15) {
      g.computeVertexNormals();
      gunLen = bb0.max.z - bb0.min.z;
      gunW = bb0.max.x - bb0.min.x;
      return g;
    }
    const pos = g.attributes.position, n = pos.count, c = new THREE.Vector3();
    for (let i = 0; i < n; i++) c.add(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))); c.multiplyScalar(1 / n); g.translate(-c.x, -c.y, -c.z);
    // главные оси облака вершин (ковариация + степенной метод): скан лежит в файле по диагонали
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < n; i++) { const v = [pos.getX(i), pos.getY(i), pos.getZ(i)]; for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) C[r][q] += v[r] * v[q]; }
    const mul = v => new THREE.Vector3(C[0][0] * v.x + C[0][1] * v.y + C[0][2] * v.z, C[1][0] * v.x + C[1][1] * v.y + C[1][2] * v.z, C[2][0] * v.x + C[2][1] * v.y + C[2][2] * v.z);
    const eig = (v, ortho) => { for (let k = 0; k < 80; k++) { v = mul(v); for (const o of ortho) v.addScaledVector(o, -v.dot(o)); v.normalize(); } return v; };
    const e1 = eig(new THREE.Vector3(.3, .5, .8), []), e2 = eig(new THREE.Vector3(.7, -.2, .4), [e1]), e3 = new THREE.Vector3().crossVectors(e1, e2);
    // e1 — длина (Z), e2 — высота (Y), e3 — ширина (X)
    g.applyMatrix4(new THREE.Matrix4().makeBasis(e3, e2, e1).invert());
    g.computeBoundingBox(); const z0 = g.boundingBox.min.z, z1 = g.boundingBox.max.z, L = z1 - z0;
    // приклад — самый «высокий» по сечению конец
    const ext = (lo, hi) => { let a = 1e9, b = -1e9; for (let i = 0; i < n; i++) { const z = pos.getZ(i); if (z >= lo && z <= hi) { const y = pos.getY(i); a = Math.min(a, y); b = Math.max(b, y); } } return b - a; };
    const hNeg = ext(z0, z0 + L * .2), hPos = ext(z1 - L * .2, z1);
    if (hNeg > hPos) g.rotateY(Math.PI); // приклад → +Z
    // носок приклада и спусковая скоба — снизу: у приклада больше массы ниже оси стволов (стволы — верх)
    g.computeBoundingBox(); const zs = g.boundingBox.max.z - L * .5; let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) if (pos.getZ(i) < zs) { const y = pos.getY(i); if (y < 0) lo++; else hi++; } // на стволах точек больше со стороны, где стволы
    // у ствольной половины ось стволов выше центра, т. е. там больше точек сверху
    if (hi > lo) g.rotateZ(Math.PI);
    g.computeBoundingBox(); g.translate(0, 0, -g.boundingBox.max.z); g.computeBoundingBox(); g.computeVertexNormals();
    gunLen = L; gunW = g.boundingBox.max.x - g.boundingBox.min.x; window.__gunDbg = { hNeg, hPos, lo, hi, L, W: gunW, H: g.boundingBox.max.y - g.boundingBox.min.y }; return g;
  }
  // в руках и на стене: приклад в начале координат, ствол в −Z
  const strapLeatherM = std({ color: 0x3a2a1c, roughness: .85 });
  const swivelMetalM = std({ color: 0x484a4c, metalness: .82, roughness: .32 });
  function gunHoldMesh(withWallLoops = false) {
    const g = new THREE.Group();
    if (gunGeo) { const m = new THREE.Mesh(gunGeo, gunMat); m.castShadow = true; g.add(m); }
    else { const m = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, 1.1), MAT.dark); m.position.z = -.55; g.add(m); }
    if (withWallLoops) {
      // Передняя антабка под цевьём/стволами (z = -0.68) и плотный кожаный ремень, огибающий цевьё снаружи вверх к гвоздю
      const swF = new THREE.Mesh(new THREE.TorusGeometry(.010, .0025, 6, 12), swivelMetalM);
      swF.rotation.y = Math.PI / 2; swF.position.set(0, -.002, -.68); g.add(swF);
      const loopFBot = new THREE.Mesh(new THREE.BoxGeometry(.032, .008, .026), strapLeatherM);
      loopFBot.position.set(-.015, .001, -.68); g.add(loopFBot);
      const loopFSide = new THREE.Mesh(new THREE.BoxGeometry(.009, .064, .026), strapLeatherM);
      loopFSide.position.set(-.029, .031, -.68); g.add(loopFSide);
      // Задняя антабка снизу приклада (z = -0.14, y = -0.092) и кожаный ремень вдоль внешней стороны приклада вверх
      const swR = new THREE.Mesh(new THREE.TorusGeometry(.010, .0025, 6, 12), swivelMetalM);
      swR.rotation.y = Math.PI / 2; swR.position.set(0, -.092, -.14); g.add(swR);
      const loopRBot = new THREE.Mesh(new THREE.BoxGeometry(.024, .008, .026), strapLeatherM);
      loopRBot.position.set(-.010, -.088, -.14); g.add(loopRBot);
      const loopRSide = new THREE.Mesh(new THREE.BoxGeometry(.009, .108, .026), strapLeatherM);
      loopRSide.position.set(-.020, -.036, -.14); g.add(loopRSide);
    }
    g.userData.len = gunLen;
    return g;
  }
  // предмет на полу: лежит на боку, длиной по X, с центром в начале координат
  function gunWorldMesh() { const g = new THREE.Group(), r = new THREE.Group(); r.rotation.y = Math.PI / 2; g.add(r); const m = gunHoldMesh(false); m.rotation.z = Math.PI / 2; m.position.set(0, gunW / 2 + .005, gunLen / 2); r.add(m); m.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g; }
  const RACK = { x: KW - .09, y: 1.73, z: -.18 };
  const NAIL = new THREE.Vector3(KW - .085, 1.98, -.18);
  let wallGun = null, wallRope = null;
  const hookM = std({ color: 0x484a4c, metalness: .82, roughness: .35 });
  // Гвоздь в стене, на котором ружьё висит на собственном ремне
  { const nailShaft = cyl(.0055, .0055, .09, hookM, KW - .065, NAIL.y, NAIL.z, 10, K); nailShaft.rotation.z = Math.PI / 2; nailShaft.userData.keep = true;
    const nailHead = cyl(.014, .014, .006, hookM, KW - .108, NAIL.y, NAIL.z, 12, K); nailHead.rotation.z = Math.PI / 2; nailHead.userData.keep = true; }
  function buildWallGun() { if (wallGun) scene.remove(wallGun); wallGun = gunHoldMesh(true); scene.add(wallGun); if (!wallRope) wallRope = new Rope(scene, { n: 13, length: .79, width: .026, thick: .009, color: 0x4a321e }); }
  const rackBox = new THREE.Box3(new THREE.Vector3(RACK.x - .22, RACK.y - .22, RACK.z - .68), new THREE.Vector3(RACK.x + .08, NAIL.y + .10, RACK.z + .68));
  const gunState = () => { const S = ctx.getS(); return S ? (S.gunState || 'wall') : 'wall'; };
  function setGunState(st) {
    const S = ctx.getS(); if (!S) return;
    S.gunState = st;
    S.gun = st === 'carried';
    if (st !== 'carried') {
      if (weapon.forceHolster) weapon.forceHolster();
      else if (weapon.holster) weapon.holster();
    }
    if (st === 'wall') {
      if (wallGun) wallGun.visible = true;
      if (wallRope) wallRope.visible = true;
    } else {
      if (wallGun) wallGun.visible = false;
      if (wallRope) wallRope.visible = false;
    }
    ctx.save && ctx.save();
    ctx.onCtl && ctx.onCtl();
  }
  function wallGunTick(dt) {
    const on = gunState() === 'wall';
    if (wallGun) wallGun.visible = on;
    if (wallRope) wallRope.visible = on && !!wallGun;
    if (gunState() !== 'carried' && (weapon.drawn || weapon.state !== 'holstered')) weapon.forceHolster();
    if (!on) return;
    if (on && wallGun) {
      wallGun.position.set(RACK.x, RACK.y, NAIL.z + .46);
      wallGun.rotation.set(-.03, 0, 0);
      wallGun.updateMatrixWorld(true);
      // Точки выхода ремня с верхней кромки передней (z = -0.68) и задней (z = -0.14) петель — ремень натянут прямо к гвоздю без разрывов
      const a = wallGun.localToWorld(tmpV.set(-.027, .060, -.68)).clone();
      const b = wallGun.localToWorld(tmpV2.set(-.019, .015, -.14)).clone();
      wallRope.update(a, b, dt, .02, NAIL);
    }
  }
  const windVec = new THREE.Vector2();
  let blackout = null;
  const BLACKOUT_SPOTS = [
    { x: -2.4, z: -3.3, name: 'в сугробе за ларьком' },
    { x: 4.8, z: 16.5, name: 'у мусорного бака через дорогу' },
    { x: 7.8,  z: 4.7,  name: 'у автобусной остановки' },
    { x: -17.5, z: -18.2, name: 'у чужого подъезда во дворе' },
    { x: 23.5, z: -11.2, name: 'за гаражами' },
    { x: 8.5,  z: -14.8, name: 'на детской площадке во дворе' },
    { x: -12.2, z: -7.8, name: 'в сугробе во дворе' },
    { x: 16.0, z: 16.4, name: 'на тротуаре через дорогу' },
    { x: -36.0, z: 3.4,  name: 'на дальнем конце улицы' },
    { x: 34.0, z: 3.4,  name: 'на обочине у дороги' },
  ];
  function pickBlackoutSpot() {
    const spots = BLACKOUT_SPOTS.slice();
    while (spots.length) {
      const idx = Math.floor(Math.random() * spots.length);
      const sp = spots.splice(idx, 1)[0];
      for (let i = 0; i < 12; i++) {
        const tx = clamp(sp.x + R(-1.1, 1.1), BOUND.x1 + 1, BOUND.x2 - 1);
        const tz = clamp(sp.z + R(-1.1, 1.1), BOUND.z1 + 1, BOUND.z2 - 1);
        if (!hitAny(tx, tz, .42) && !inKiosk(tx, tz)) return { x: tx, z: tz, name: sp.name };
      }
    }
    return { x: 0, z: 3.2, name: 'на снегу перед ларьком' };
  }
  function standFromGround() {
    if (!P.lying) return;
    P.lying = false; P.locked = false; blackout = null; P.shake = .35;
    post.uniforms.blink.value = 0;
    ctx.onCtl && ctx.onCtl();
  }
  function triggerBlackout() {
    if (blackout) return;
    if (life.held) life.stashHeldBottle ? life.stashHeldBottle() : life.dropHeld();
    if (weapon.drawn) weapon.holster();
    P.locked = true; P.seated = false; P.crouch = false; P.sprint = false; P.vx = P.vz = 0;
    P.lying = true; P.lieSide = Math.random() < .5 ? 1 : -1;
    P.pitch = -.28; P.shake = .8;
    blackout = { phase: 'fall', t: 0, thudded: false, sleepHours: R(4.0, 7.0) };
    ctx.onCtl && ctx.onCtl();
  }
  const life = createLife({ scene, camera, P, ctx, KW, KD, std, colliders, addCol, audio: ctx.audio, onCtl: () => ctx.onCtl(), overlayScene: weapon.scene,
    transport: () => transport,
    visibleFromPlayer: (x, z) => visibleFromPlayer(x, z), doorOpen: () => doorOpen, wind: () => windVec, gunWorldMesh, getItemMesh, getPackMesh,
    onDelivered: (d, cnt) => ctx.onDelivered && ctx.onDelivered(d, cnt), onUnpack: data => ctx.onUnpack && ctx.onUnpack(data),
    onDrink: (k, s, tot) => ctx.onDrink && ctx.onDrink(k, s, tot),
    onBlackout: triggerBlackout });
  function aimedPerson(maxD = 30) {
    camera.getWorldDirection(tmpV2); let best = null, bd = .5;
    for (const p of people) { if (p.hidden || p.dead) continue; const o = p.h.obj.position; tmpV.set(o.x, 1.3 * p.h.L.height / 1.75, o.z).sub(camera.position); const along = tmpV.dot(tmpV2); if (along < .5 || along > maxD) continue; const perp = tmpV.addScaledVector(tmpV2, -along).length(); if (perp < bd) { bd = perp; best = p; } }
    return best;
  }
  function recordWitnessEvent(type, targetP) {
    const S = ctx.getS();
    const gMem = S ? (S.npcMemory = S.npcMemory || { talks: {}, crimes: { gunAimed: 0, brawls: 0, kills: 0, lastDay: -1 } }) : null;
    if (gMem) {
      if (type === 'gun') gMem.crimes.gunAimed = (gMem.crimes.gunAimed || 0) + 1;
      if (type === 'brawl') gMem.crimes.brawls = (gMem.crimes.brawls || 0) + 1;
      if (type === 'kill') gMem.crimes.kills = (gMem.crimes.kills || 0) + 1;
      gMem.crimes.lastDay = S.day;
    }
    if (targetP) {
      targetP.memory = targetP.memory || {};
      if (type === 'gun') targetP.memory.sawGunAim = true;
      if (type === 'brawl') targetP.memory.wasPunched = true;
      if (type === 'kill') targetP.memory.sawKill = true;
    }
    for (const q of people) {
      if (q.dead || q.hidden) continue;
      const d = Math.hypot(q.h.obj.position.x - P.x, q.h.obj.position.z - P.z);
      if (d < (type === 'kill' ? 28 : 18)) {
        q.memory = q.memory || {};
        if (type === 'gun') q.memory.sawGunAim = true;
        if (type === 'brawl') q.memory.sawBrawl = true;
        if (type === 'kill') q.memory.sawKill = true;
      }
    }
  }
  function threaten(p) { // ружьё наведено на человека
    if (p.reacted && p.reacted > performance.now()) return;
    p.reacted = performance.now() + 1500;
    releaseBench(p);
    recordWitnessEvent('gun', p);
    const L = p.h.L, S = ctx.getS();
    if (p.role === 'gop') {
      const g = p.group, lead = g.leader.h.L, brave = lead.nerve + lead.aggression * .3;
      if (brave > .95) { g.members.forEach(m => { m.h.setExpr('angry'); m.anim = 'threaten'; }); ctx.say(g.leader, pick(['Да ты не выстрелишь!', 'Ружьишко-то, поди, незаряженное?', 'Ну давай, стреляй, если смелый!'])); }
      else if (brave > .65) { g.members.forEach(m => { m.h.setExpr('scared'); m.anim = 'idle'; }); ctx.say(g.leader, pick(['Всё, всё, мужик, мы уходим.', 'Ладно, остынь…'])); gopLeave(g, 'back'); ctx.gopResolved && ctx.gopResolved('scared'); }
      else if (brave > .4) { g.members.forEach(m => { m.state = 'scared'; m.anim = 'handsUp'; m.timer = 2; m.h.setExpr('scared'); }); ctx.say(g.leader, pick(['Э-э, ты чё! Мы просто спросить!', 'Не стреляй, не стреляй!'])); setTimeout(() => gopLeave(g, 'flee'), 1800); ctx.gopResolved && ctx.gopResolved('scared'); }
      else { gopLeave(g, 'flee'); ctx.say(g.leader, 'Атас!'); ctx.gopResolved && ctx.gopResolved('scared'); }
      return;
    }
    if (p.role === 'vendor' || p.role === 'marat' || p.role === 'zavod') { p.prevState = 'stand'; p.state = 'scared'; p.anim = 'handsUp'; p.timer = 4; p.h.setExpr('scared'); if (p.role === 'marat') { const S2 = ctx.getS(); S2 && (S2.flags.maratAngry = S2.day); p.timer = 3; } return; }
    // мирные — пугаются
    p.prevState = p.state; p.state = 'scared'; p.anim = L.nerve > .3 ? 'handsUp' : 'scared'; p.timer = 2.5; p.h.setExpr('scared');
    if (!p.scaredOnce) { p.scaredOnce = true; ctx.rep('folk', -1.5); }
    if (p.role === 'cust' && p.c) { ctx.customerScared(p.c); }
    else setTimeout(() => { if (people.includes(p)) { p.flee = true; leaveWorld(p); p.speed = 3.5; } }, 2200);
  }
  // ---------- смерть NPC: ragdoll, через 60 с тело плавно исчезает ----------
  const rdBlocked = (x, z) => (Math.abs(x) < KW && z > -KD && z < KD) || colliders.some(b => b.tag !== 'door' && x > b.x1 && x < b.x2 && z > b.z1 && z < b.z2);
  function killPerson(p, dir, dist) {
    releaseBench(p);
    recordWitnessEvent('kill', p);
    p.dead = true; p.state = 'dead'; p.path = []; p.then = null; p.flee = false; p.brawling = false; p.talking = false;
    const force = clamp(11 - dist * .35, 3, 10), imp = dir.clone().setY(0).normalize().multiplyScalar(force); imp.y = 1.2;
    p.rag = new Ragdoll(p.h, imp, camera.position.y - .15, rdBlocked); p.deadT = 0; p.h.setExpr('scared');
    ctx.audio.click && ctx.audio.click(90, .6, 0, .25);
    if (p === marat) marat = null;
    if (p.group) { p.group.members = p.group.members.filter(m => m !== p); if (p.group.state !== 'gone') { gopLeave(p.group, 'flee'); ctx.gopResolved && ctx.gopResolved('shot'); } }
    ctx.onKill && ctx.onKill(p.role, p.c, p.kind);
  }
  function knockoutPerson(p, dir) {
    releaseBench(p);
    recordWitnessEvent('kill', p);
    p.dead = true; p.knockedOut = true; p.state = 'dead'; p.path = []; p.then = null; p.flee = false; p.brawling = false; p.talking = false;
    const imp = dir.clone().setY(0).normalize().multiplyScalar(4.8); imp.y = .85;
    p.rag = new Ragdoll(p.h, imp, camera.position.y - .2, rdBlocked); p.deadT = 0; p.h.setExpr('scared');
    ctx.audio && ctx.audio.thud(1.1);
    if (p.group) {
      p.group.members = p.group.members.filter(m => m !== p);
      if (!p.group.members.length || p === p.group.leader) {
        if (p.group.members.length) {
          ctx.say && ctx.say(p.group.members[0], 'Пацаны, валим, он боксёр!');
          gopLeave(p.group, 'flee');
        } else {
          gopnikGroup = null;
        }
      }
    }
    ctx.onKnockout && ctx.onKnockout(p.role, p.c, p.kind);
  }
  function startGopBrawl(g) {
    if (!g || !g.members) return;
    g.state = 'brawl';
    g.demanded = true;
    g.members.forEach(m => {
      m.brawling = true;
      m.state = 'brawl';
      m.path = [];
      m.h.setExpr('angry');
    });
  }
  function findPunchTarget(maxD = 2.15) {
    const aimed = aimedPerson(maxD);
    if (aimed) return aimed;
    camera.getWorldDirection(tmpV2);
    const fx = tmpV2.x, fz = tmpV2.z, fl = Math.hypot(fx, fz) || 1;
    let best = null, bd = maxD;
    for (const p of people) {
      if (p.dead || p.hidden || !p.h.obj.visible) continue;
      const dx = p.h.obj.position.x - P.x, dz = p.h.obj.position.z - P.z;
      const d = Math.hypot(dx, dz);
      if (d > bd || d < .05) continue;
      const dot = (dx * fx + dz * fz) / (d * fl);
      if (dot > .50) { bd = d; best = p; }
    }
    return best;
  }
  function onPunchImpact(side) {
    // 1. Удар кулаком по стеклянной бутылке разбивает её
    const hitItem = life.lookItem && life.lookItem(1.65);
    if (hitItem && (hitItem.kind === 'bottle' || (hitItem.kind === 'good' && ['vodka', 'beer', 'samogon', 'soda'].includes(hitItem.data && hitItem.data.goodId)))) {
      life.shatterBottle(hitItem);
      return;
    }
    // 2. Удар кулаком по персонажу в радиусе ближнего боя
    const hit = findPunchTarget(2.15);
    if (!hit) return;
    releaseBench(hit);
    recordWitnessEvent('brawl', hit);
    ctx.audio && ctx.audio.thud(.92);
    P.shake = Math.max(P.shake, .34);
    const ox = hit.h.obj.position.x, oz = hit.h.obj.position.z;
    const dx = ox - P.x, dz = oz - P.z, dl = Math.hypot(dx, dz) || 1;
    const nx = ox + (dx / dl) * .34, nz = oz + (dz / dl) * .34;
    if (!npcBlocked(nx, nz)) { hit.h.obj.position.x = nx; hit.h.obj.position.z = nz; }
    hit.hitStun = .52;
    hit.h.setExpr('angry');

    if (hit.role === 'marat' || hit.role === 'zavod') {
      ctx.toast && ctx.toast(`${hit.title || 'Сосед'}: «Эй, коммерсант, ты чего кулаками машешь?! Остынь!»`, 'bad');
      return;
    }

    const isTough = hit.role === 'gop' || hit.kind === 'police' || (hit.c && hit.c.k === 'racket');
    hit.maxHp = hit.maxHp || (isTough ? 3 : 2);
    hit.hp = (hit.hp ?? hit.maxHp) - 1;
    const dir = new THREE.Vector3(dx / dl, 0, dz / dl);

    if (hit.role === 'gop') {
      if (hit.group) startGopBrawl(hit.group);
      if (hit.hp <= 0) {
        knockoutPerson(hit, dir);
      } else {
        ctx.say && ctx.say(hit, pick(['Ах ты ж!.. Пацаны, гаси его!', 'Ты на кого руку поднял?!', 'Ух, удар держит! Наших бьют!']));
      }
      return;
    }
    if (hit.kind === 'police') {
      hit.brawling = true; hit.state = 'brawl'; hit.path = [];
      ctx.rep && ctx.rep('law', -6);
      if (hit.hp <= 0) {
        knockoutPerson(hit, dir);
      } else {
        ctx.toast && ctx.toast('Ударили сотрудника милиции! Закон −6', 'bad');
      }
      return;
    }
    if (hit.hp <= 0) {
      knockoutPerson(hit, dir);
    } else {
      ctx.rep && ctx.rep('folk', -2);
      if (hit.role === 'cust' && hit.c) {
        if (hit.c.k === 'racket') {
          hit.brawling = true; hit.state = 'brawl';
          ctx.toast && ctx.toast('Колян: «Ты чё, с кулаками полез?!»', 'bad');
        } else {
          ctx.customerScared && ctx.customerScared(hit.c);
        }
      } else if (hit.h.L.aggression > .25 || hit.kind === 'worker' || hit.kind === 'youth' || hit.kind === 'gopnik') {
        hit.brawling = true; hit.state = 'brawl'; hit.path = [];
        ctx.say && ctx.say(hit, pick(['Ты чё дерёшься, мужик?! Получай!', 'Совсем страх потерял?!', 'А ну иди сюда!']));
      } else {
        hit.flee = true; hit.h.setExpr('scared'); leaveWorld(hit); hit.speed = 3.6;
        ctx.say && ctx.say(hit, pick(['Караул! Хулиганы зрения лишают!', 'Милиция! Дерётся!']));
      }
    }
  }
  function punch() {
    // Когда в руках оружие или предмет — ударить кулаком нельзя!
    if (weapon.drawn || life.held || life.habit.busy || P.locked) return false;
    const ok = life.habit.startPunch(side => onPunchImpact(side));
    if (ok) {
      ctx.audio && ctx.audio.click(175, .16, 0, .05);
      P.pitch = clamp(P.pitch + .02, -1.35, 1.25);
      P.shake = Math.max(P.shake || 0, .14);
    }
    return ok;
  }
  function deadTick(p, dt) {
    p.deadT += dt; p.rag.step(dt);
    if (p.deadT > 60) { p.rag.startFade(); const a = 1 - (p.deadT - 60) / 3; p.rag.setFade(Math.max(0, a)); if (a <= 0) { p.rag.dispose(); removePerson(p); } }
  }
  function onShot() {
    P.pitch = Math.min(1.25, P.pitch + .09); P.shake = .4;
    { const hitItem = life.lookItem && life.lookItem(20); if (hitItem && (hitItem.kind === 'bottle' || (hitItem.kind === 'good' && ['vodka','beer','samogon','soda'].includes(hitItem.data && hitItem.data.goodId)))) life.shatterBottle(hitItem); }
    { const hit = aimedPerson(26); if (hit && hit.role !== 'marat' && hit.role !== 'zavod') { camera.getWorldDirection(tmpV2); killPerson(hit, tmpV2.clone(), Math.hypot(hit.h.obj.position.x - P.x, hit.h.obj.position.z - P.z)); } }
    const S = ctx.getS(); if (S) { ctx.rep('law', -4); ctx.rep('folk', -2); }
    for (const p of people) { if (p.dead) continue; const d = Math.hypot(p.h.obj.position.x - P.x, p.h.obj.position.z - P.z); if (d > 45) continue;
      if (p.role === 'gop') { if (p.group && p.group.state !== 'gone') { gopLeave(p.group, 'flee'); ctx.gopResolved && ctx.gopResolved('shot'); } }
      else if (p.role === 'vendor' || p.role === 'marat' || p.role === 'zavod') { p.prevState = 'stand'; p.state = 'scared'; p.anim = 'handsUp'; p.timer = 4; p.h.setExpr('scared'); }
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
  const BOUND = { x1: -440, x2: 69, z1: -45, z2: 25 };
  const stormMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, col: { value: new THREE.Color(0xc8ced2) } },
    vertexShader: 'varying vec2 vU; varying vec3 vW; void main(){ vU = uv; vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }',
    fragmentShader: `uniform float time; uniform vec3 col; varying vec2 vU; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 9871.3); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){ vec2 q = vec2(vW.x + vW.z, vW.y) * .08; float f = n(q + vec2(time * .9, -time * .3)) * .5 + n(q * 2.3 + vec2(time * 1.7, time * .2)) * .3 + n(q * 5.0 + vec2(time * 3.1, 0.)) * .2;
        float a = (.55 + f * .45) * smoothstep(0., .1, vU.y) * (1. - smoothstep(4., 26., vW.y)); /* верх растворяется: сверху нет квадрата карты */ gl_FragColor = vec4(col * (.85 + f * .25), a); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  for (const [x, z, w, ry] of [[BOUND.x1 - 4, (BOUND.z1 + 30) / 2, 100, Math.PI / 2], [BOUND.x2 + 4, (BOUND.z1 + 30) / 2, 100, Math.PI / 2], [(BOUND.x1 + BOUND.x2) / 2, BOUND.z1 - 4, 530, 0], [(BOUND.x1 + BOUND.x2) / 2, 38, 530, 0]]) {
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
    hour = ((h % 24) + 24) % 24;
    if (typeof clockHourHand !== 'undefined') {
      const hh = hour % 12, mm = (hour % 1) * 60, ss = Math.floor(tAll) % 60;
      clockHourHand.rotation.z = -(hh / 12) * Math.PI * 2;
      clockMinHand.rotation.z = -(mm / 60) * Math.PI * 2;
      clockSecHand.rotation.z = -(ss / 60) * Math.PI * 2;
    }
    const S = ctx.getS(), m = S ? ctx.monthOf(S.day) : 0;
    const k = Math.cos((m - 5.5) / 12 * Math.PI * 2);
    const rise = 7.0 - k * 1.8, set = 18.0 + k * 1.8, maxEl = 33 + k * 22;
    const dayF = (h - rise) / (set - rise);
    const el = dayF > 0 && dayF < 1 ? Math.sin(dayF * Math.PI) * maxEl : -8 - Math.min(Math.abs(h - rise), Math.abs(h - set)) * 3;
    const elR = el * Math.PI / 180, az = (dayF - .5) * Math.PI * .9;
    const shadowMapSz = (Q.shadows && Q.shadows > 0) ? Math.min(Q.shadows, 1024) : 1024;
    const texelSz = 64.0 / shadowMapSz;
    const sPx = Math.floor(P.x / texelSz) * texelSz;
    const sPz = Math.floor(P.z / texelSz) * texelSz;
    sun.position.set(Math.sin(az) * 60 * Math.cos(Math.max(elR, .05)) + sPx, Math.sin(Math.max(elR, .08)) * 60, -Math.cos(az) * 50 * .3 + 40 + sPz);
    sun.target.position.set(sPx, 0, sPz);

    const dayAmt = clamp((el + 3) / 12, 0, 1);
    nightK = 1 - dayAmt;
    // Раздельный расчёт рассвета (dawn: нежный лососево-розовый и утреннее золото) и заката (sunset: пламенно-алый, багровый и фиолетовый)
    const isMorning = h < (rise + set) / 2;
    const dawn = isMorning ? clamp(1.0 - Math.abs(h - rise) / 1.6, 0, 1) : 0;
    const sunset = !isMorning ? clamp(1.0 - Math.abs(h - set) / 1.8, 0, 1) : 0;

    const topC = cA.set(PAL.nightTop).lerp(cB.set(PAL.dayTop), dayAmt);
    if (dawn > 0) topC.lerp(cB.set('#46627c'), dawn * .75);
    if (sunset > 0) topC.lerp(cB.set('#3a2444'), sunset * .85);

    const botC = cA.set(PAL.nightBot).lerp(cB.set(PAL.dayBot), dayAmt);
    if (dawn > 0) botC.lerp(cB.set('#e89278'), dawn * .85);
    if (sunset > 0) botC.lerp(cB.set('#d84824'), sunset * .95);

    const over = weather.snow * .35;
    topC.lerp(cB.set('#8a9096'), over * dayAmt); botC.lerp(cB.set('#a8acae'), over * dayAmt);
    skyMat.uniforms.top.value.copy(topC); skyMat.uniforms.bot.value.copy(botC); skyMat.uniforms.cloud.value = .5 + weather.snow * .5;
    skyMat.uniforms.sunDir.value.copy(sun.position).sub(sun.target.position).normalize();

    const sunCol = dawn > 0 ? '#ffb470' : sunset > 0 ? '#ff4818' : '#fff1dc';
    skyMat.uniforms.sunCol.value.set(el > -2 ? sunCol : '#000000').multiplyScalar(1 - over);
    scene.fog.color.copy(botC);
    scene.fog.near = lerp(8 + (1 - weather.snow) * 25, 1, Math.max(stormK, weather.fog * .7));
    scene.fog.far = lerp(Q.draw * (1 - weather.snow * .45) * (1 - weather.fog * .65), 9, stormK);

    sun.color.set(sunCol);
    sun.intensity = el > 0 ? (2.4 * clamp(el / 15, 0, 1)) * (1 - over * .75) : 0;
    hemi.intensity = .42 + dayAmt * (0.85 - over * .18);
    hemi.color.copy(topC).lerp(cA.set('#d8e2ea'), .45);
    hemi.groundColor.set(winter ? '#b8c0c8' : '#625b4c').multiplyScalar(.65 + dayAmt * .35);
    if (dayAmt < .2) { hemi.color.lerp(cA.set('#38465e'), .55); }
    post.uniforms.exposure.value = 1.04 + nightK * .20;
    winU.night.value = nightK; winU.time.value = tAll; snowU.sparkle.value = 1 - nightK * .7;
    MAT.lampHead.emissiveIntensity = nightK > .35 ? 4 : 0;
    // Перемещаем 4 точечных источника света к 4 ближайшим уличным фонарям вокруг игрока
    {
      const basePoleX = clamp(Math.round((P.x - 14) / 20) * 20 + 14, -406, 54);
      const offsets = [-20, 0, 20, 40];
      streetLights.forEach((l, idx) => {
        const px = clamp(basePoleX + (offsets[idx] || 0), -426, 74);
        l.position.set(px, 4.9, 7.2);
        l.intensity = nightK > .25 ? 68 * nightK : 0;
      });
    }
    poolMat.opacity = nightK > .35 ? nightK : 0;
    sign.material.emissiveIntensity = nightK * .9;
    neons.forEach(o => o.material.emissiveIntensity = nightK * .7);
    cars.forEach(c => { c.m.userData.hl.emissiveIntensity = nightK > .3 ? 3 : 0; });
    bulbLight.intensity = 0.58 + nightK * 0.25; kioskSpot.intensity = 1.75 + nightK * 0.65; MAT.bulb.emissiveIntensity = 1.5;
    if (snowPts) snowPts.material.uniforms.light.value = .35 + dayAmt * .65;
  }
  function setSeason() {
    const S = ctx.getS(); if (!S) return; if (S.day !== lastCalDay) { lastCalDay = S.day; drawCalendar(); } const m = window.__larekMonth != null ? window.__larekMonth : ctx.monthOf(S.day); if (m === season) return; season = m; // __larekMonth — только для автотестов
    winter = m >= 10 || m <= 2;
    winterGround.forEach(g => g.visible = winter); summerGround.forEach(g => g.visible = !winter);
    scene.traverse(o => { if (o.userData.winter) o.visible = winter; }); roofSnow.visible = winter;
    weather.target = winter ? pick([0, .3, .6, .6, 1]) : 0; weather.windT = R(.1, .9);
    seasonHooks.forEach(f => f(winter, m)); applyVegSeason();
  }

  // ---------- настройки качества ----------
  function applyQuality(q) {
    Object.assign(Q, q);
    const sh = Q.shadows > 0;
    renderer.shadowMap.enabled = sh;
    sun.castShadow = sh && !LITE; if (sh) { const ss = Math.min(Q.shadows, 1024); sun.shadow.mapSize.set(ss, ss); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } // на слабых GPU солнечных теней нет (проход теней рисовал ~1000 объектов второй раз)
    kioskSpot.castShadow = sh;
    if (sh) {
      const spSz = LITE ? 512 : Math.min(1024, Math.max(512, Q.shadows)); // свет лампы в ларьке — главные тени в игре, им нужно разрешение
      kioskSpot.shadow.mapSize.set(spSz, spSz);
      if (kioskSpot.shadow.map) { kioskSpot.shadow.map.dispose(); kioskSpot.shadow.map = null; }
    }
    bulbLight.castShadow = false; fillLight.visible = Q.light >= 1;
    camera.far = Q.draw + 60; camera.updateProjectionMatrix(); sky.scale.setScalar(Math.min(1, (Q.draw + 40) / 380));
    allTex.forEach(t => { t.anisotropy = Q.aniso; if (t.image) t.needsUpdate = true; });
    buildSnow(Q.snow); buildRain(Math.round(Q.snow * .8)); buildPuddles(Q.light >= 1 && !LITE); // кубические отражения в лужах — не на слабых GPU
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
    resize();
  }
  applyQuality(Q);

  // ---------- взаимодействия ----------
  function lookingAtBox(b, maxD) { if (!b) return false; ray.setFromCamera(new THREE.Vector2(0, 0), camera); const hp = ray.ray.intersectBox(b, hitP); return !!hp && hp.distanceTo(camera.position) < maxD; }
  function lookingAt(objs, maxD) { ray.setFromCamera(new THREE.Vector2(0, 0), camera); ray.far = maxD; const h = ray.intersectObjects(objs, true)[0]; return h ? h : null; }
  const nearMarket = () => false; // рынка больше нет: товар — заказом по телефону
  const nearBooth = () => !inKiosk() && Math.hypot(P.x - BOOTH.x, P.z - BOOTH.z - 1.6) < 2.6;
  const nearestOf = (list, maxD) => { let b = null, bd = maxD; for (const t of list) { const d = Math.hypot(P.x - t.x, P.z - t.z); if (d < bd) { bd = d; b = t; } } return b; };
  function trashIt(bin) {
    if (life.held && life.held.kind === 'gun') setGunState('gone'); // сразу, чтобы сохранение посреди анимации не «воскресило» ружьё
    life.trashHeld({ x: bin.x, y: bin.y, z: bin.z }, it => {
      if (it.kind === 'gun') { ctx.toast && ctx.toast('Ружьё выброшено в мусорный бак.', 'bad'); }
      else if (it.kind === 'box') ctx.toast && ctx.toast(it.data.contents ? 'Коробка с товаром ушла в мусор.' : 'Пустая коробка выброшена.', it.data.contents ? 'bad' : 'good');
    });
  }
  function action() {
    const S = ctx.getS(); if (!S || fadeBusy || ctx.cardOpen() || P.stun > 0 || life.notepadState !== 'rest' || life.calling) return null;
    if (P.lying) return (!blackout || blackout.phase === 'lying') ? { label: 'Подняться с земли', icon: '⬆', fn: standFromGround } : null;
    const hb = life.habit;
    if (hb.busy === 'smoke' && hb.canFinish && !inKiosk() && (nearestOf(TRASH_SMALL, 1.7) || nearestOf(TRASH_BIG, 2.4))) return { label: 'Выбросить окурок в мусорку', icon: 'smoke', fn: () => hb.finishHabit('urn') };
    if (hb.busy === 'smoke') return hb.canFinish ? (life.lookingAtAshtray() ? { label: 'Потушить в пепельнице', icon: 'smoke', fn: () => hb.finishHabit('ashtray') } : { label: 'Выбросить окурок', icon: 'smoke', fn: () => hb.finishHabit('throw') }) : null;
    if (hb.busy) return null;
    // мелкий мусор (бутылка) — в урну или бак; крупное (коробка, ружьё) — только в большой бак
    // Помощники точного 1-к-1 взаимодействия с полками, витриной и оптовыми упаковками
    const lookShelfGood = () => {
      if (!inKiosk()) return null;
      const h = lookingAt(foodGroup.children, 2.3);
      if (!h || !h.object) return null;
      let o = h.object;
      while (o && !o.userData.shelfGoodId && o.parent && o.parent !== foodGroup) o = o.parent;
      const gid = o && o.userData && o.userData.shelfGoodId;
      let uid = o && o.userData && o.userData.shelfUid;
      if (!gid) return null;
      const root = (o.userData && o.userData.shelfRoot) || o;
      const wp = new THREE.Vector3(); root.getWorldPosition(wp);
      // Если предмет лежит в вертикальной стопке на полке — берём самый верхний предмет из этой стопки
      const S = ctx.getS();
      if (S && S.shelfPlacements && uid) {
        const hitEntry = S.shelfPlacements.find(p => p.uid === uid);
        if (hitEntry) {
          const sameStack = S.shelfPlacements.filter(p => p.id === gid && Math.hypot(p.x - hitEntry.x, p.z - hitEntry.z) < .04 && Math.abs(p.y - hitEntry.y) < .28);
          if (sameStack.length > 1) {
            sameStack.sort((a, b) => b.y - a.y);
            uid = sameStack[0].uid;
            wp.set(sameStack[0].x, sameStack[0].y, sameStack[0].z);
          }
        }
      }
      return { id: gid, uid, pos: wp };
    };
    const lookStorageShelfHit = () => {
      if (!inKiosk()) return null;
      if (life.rayPlaceShelf) {
        const rp = life.rayPlaceShelf(1.15);
        // Исключаем стеклянные полки витрины (rowIdx >= 17), чтобы предметы с витрины не улетали на задние полки
        if (rp && rp.rowIdx < 17 && Math.hypot(rp.point.x - P.x, rp.point.z - P.z) <= .98) return rp;
      }
      const h = lookingAt([...shelfHitTargets, foodGroup], 1.15);
      if (!h || Math.hypot(h.point.x - P.x, h.point.z - P.z) > .98) return null;
      let o = h.object, rowIdx = null;
      while (o) {
        if (o.userData && o.userData.shelfRowIdx != null) { rowIdx = o.userData.shelfRowIdx; break; }
        o = o.parent;
      }
      if (rowIdx != null && rowIdx >= 17) return null;
      return { point: h.point, rowIdx };
    };
    const lookShowcaseSlot = () => {
      if (!inKiosk()) return null;
      const maxSlots = ctx.slotCount ? ctx.slotCount() : S.slots.length;
      const h = lookingAt(shelfGroup.children, 1.55);
      if (h && h.object && Math.hypot(h.point.x - P.x, h.point.z - P.z) <= 1.35) {
        let o = h.object;
        while (o && o.userData.showcaseSlot == null && o.parent && o.parent !== shelfGroup) o = o.parent;
        if (o && o.userData.showcaseSlot != null) return o.userData.showcaseSlot;
      }
      // запасной путь: луч попал в стеклянную полку витрины — всегда берём ближайший слот на этой полке
      const rp = life.rayPlaceShelf && life.rayPlaceShelf(1.55);
      if (rp && rp.rowIdx >= 17 && Math.hypot(rp.point.x - P.x, rp.point.z - P.z) <= 1.35) {
        let best = null, bd = 1.5;
        SLOT_POS.forEach(([sx, sy], i) => { if (i >= maxSlots) return; const d = Math.hypot(rp.point.x - sx, (rp.point.y - sy) * 2); if (d < bd) { bd = d; best = i; } });
        if (best != null) return best;
      }
      return null;
    };
    const returnGoodToShelfStock = (gid, preferPos = null, addToShelfList = true, unitCost = null, preferRowIdx = null) => {
      const S = ctx.getS(); if (!S || !gid) return;
      if (addToShelfList) {
        S.shelfPlacements = S.shelfPlacements || [];
        const sp = findFreeShelfSpot(S.shelfPlacements, gid, preferPos, preferRowIdx);
        S.shelfPlacements.push({
          uid: 'sh_' + Math.random().toString(36).slice(2, 9),
          id: gid, x: sp.x, y: sp.y, z: sp.z, ry: sp.ry
        });
      }
      if (gid === 'samogon' || gid === 'kontra') {
        S.hidden = S.hidden || {};
        S.hidden[gid] = (S.hidden[gid] || 0) + 1;
      } else if (ctx.addStock) {
        ctx.addStock(gid, 1, unitCost || (S.prices && S.prices[gid]) || 20);
      }
      shelfSig = ''; updateShelves(); ctx.onStockChange && ctx.onStockChange();
    };
    const takeGoodFromShelfStock = (gid, shelfUid = null) => {
      const S = ctx.getS(); if (!S || !gid) return false;
      if (shelfUid && S.shelfPlacements) {
        const idx = S.shelfPlacements.findIndex(p => p.uid === shelfUid);
        if (idx >= 0) S.shelfPlacements.splice(idx, 1);
      }
      if (gid === 'samogon' || gid === 'kontra') {
        if (!S.hidden || (S.hidden[gid] || 0) <= 0) return false;
        S.hidden[gid]--;
      } else {
        if (!ctx.qOf || ctx.qOf(gid) <= 0) return false;
        ctx.takeStock && ctx.takeStock(gid, 1);
      }
      shelfSig = ''; updateShelves(); ctx.onStockChange && ctx.onStockChange();
      return true;
    };
    const openPack = (packItem) => {
      if (!packItem || packItem.kind !== 'pack' || !packItem.data || packItem.data.opened) return;
      packItem.data.opened = true;
      life.rebuildPackItem && life.rebuildPackItem(packItem);
      ctx.audio && ctx.audio.thud(.22);
      ctx.toast && ctx.toast(`Упаковка открыта: ${packTitleOf(packItem.data)}. Доставайте по 1 шт.!`, 'good');
      ctx.onStockChange && ctx.onStockChange();
    };
    const pullOneFromPack = (packItem) => {
      if (!packItem || packItem.kind !== 'pack') return;
      const d = packItem.data;
      const gid = d.goodId || 'cig';
      const gName = goodTitleOf(gid);
      if (!d.opened) {
        d.opened = true;
      }
      if ((d.count || 0) <= 0) {
        life.removeItem(packItem);
        return;
      }
      d.count--;
      const S = ctx.getS();
      if (S && gid === 'gum' && ctx.onGumUnpacked) ctx.onGumUnpacked(1);
      const pos = packItem.obj.position.clone();
      const it = life.addItem({
        kind: 'good',
        x: pos.x, y: pos.y + .06, z: pos.z, ry: P.yaw,
        data: { goodId: gid, unitCost: d.unitCost }
      });
      if (d.count <= 0) {
        life.removeItem(packItem);
        ctx.toast && ctx.toast(`Достали последнюю штуку (${gName}) — упаковка пуста`);
      } else {
        life.rebuildPackItem && life.rebuildPackItem(packItem);
        ctx.toast && ctx.toast(`Достали: ${gName} (в упаковке осталось ${d.count} шт.)`);
      }
      life.pick(it);
      ctx.onStockChange && ctx.onStockChange();
    };

    const binBig = !inKiosk() && nearestOf(TRASH_BIG, 2.4), binSmall = !inKiosk() && nearestOf(TRASH_SMALL, 1.7);
    if (life.held) {
      const h = life.held, small = h.kind === 'bottle' || h.kind === 'good' || h.kind === 'pack', bin = small ? (binSmall || binBig) : binBig;
      if (h.kind === 'gun' && inKiosk() && lookingAtBox(rackBox, 1.35)) return { label: 'Повесить ружьё на стену', icon: 'weapon', fn: () => { life.removeItem(h); setGunState('wall'); ctx.audio && ctx.audio.click(900, .5, 0, .06); } };
      const openBx = h.kind !== 'box' && life.lookingAtOpenBox && life.lookingAtOpenBox(1.15);
      if (openBx) return { label: 'Бросить в коробку', icon: 'box', fn: () => life.throwIntoBox(openBx), alt: { label: 'Бросить', icon: 'drop', fn: () => life.dropHeld() } };
      const putHeldCigInPocket = () => {
        if (!h || h.kind !== 'good') return;
        const gid = h.data && h.data.goodId;
        if (gid !== 'cig' && gid !== 'kontra') return;
        const addN = gid === 'kontra' ? 100 : 20;
        S.cigs = (S.cigs || 0) + addN;
        life.removeItem(h);
        ctx.audio && ctx.audio.click(780, .4, 0, .05);
        ctx.toast && ctx.toast(`Пачка убрана в карман (+${addN} сигарет). Теперь можно закурить!`, 'good');
        ctx.onStockChange && ctx.onStockChange();
        ctx.onCtl && ctx.onCtl();
      };
      const isHeldCig = h.kind === 'good' && ['cig', 'kontra'].includes(h.data && h.data.goodId);
      const cigPocketAlt = isHeldCig ? { label: 'В карман (курить)', icon: 'smoke', fn: putHeldCigInPocket } : { label: 'Бросить', icon: 'drop', fn: () => life.dropHeld() };

      if (h.kind === 'good' && inKiosk()) {
        const gid = h.data && h.data.goodId;
        const gName = goodTitleOf(gid);
        const scSlot = lookShowcaseSlot();
        if (scSlot != null && ctx.GOODS && (ctx.GOODS[gid] || gid === 'samogon' || gid === 'kontra')) { // товар из-под полы тоже можно выставить — но тогда жди участкового
          S.slotCounts = S.slotCounts || S.slots.map(id => id ? 1 : 0);
          const oldId = S.slots[scSlot];
          const curCnt = oldId === gid ? (S.slotCounts[scSlot] || 1) : 0;
          const lbl = oldId && oldId !== gid
            ? `Заменить на витрине: ${goodShortOf(oldId)} → ${goodShortOf(gid)}`
            : curCnt > 0
            ? `Добавить на витрину: ${gName} (${curCnt + 1} шт.)`
            : `Поставить на витрину: ${gName}`;
          return {
            label: lbl, icon: 'place',
            fn: () => {
              S.slotCounts = S.slotCounts || S.slots.map(id => id ? 1 : 0);
              if (oldId === gid) {
                S.slotCounts[scSlot] = Math.min(5, (S.slotCounts[scSlot] || 1) + 1);
              } else {
                // Если в этом слоте стоял другой товар — аккуратно переносим его на полку, не затрагивая соседние слоты витрины!
                if (oldId) {
                  const oldCnt = Math.max(1, S.slotCounts[scSlot] || 1);
                  S.shelfPlacements = S.shelfPlacements || [];
                  for (let k = 0; k < oldCnt; k++) {
                    const sp = findFreeShelfSpot(S.shelfPlacements, oldId, null);
                    S.shelfPlacements.push({ uid: 'sh_' + Math.random().toString(36).slice(2, 9), id: oldId, x: sp.x, y: sp.y, z: sp.z, ry: sp.ry });
                  }
                }
                S.slots[scSlot] = gid;
                S.slotCounts[scSlot] = 1;
              }
              returnGoodToShelfStock(gid, null, false, h.data && h.data.unitCost);
              life.removeItem(h);
              ctx.audio && ctx.audio.click(820, .45, 0, .05);
              ctx.toast && ctx.toast(`${gName} поставлен на витрину (${ctx.fmt(ctx.sellPrice(gid))} ₽)`, 'good');
              shelfSig = ''; updateShelves(); ctx.onStockChange && ctx.onStockChange();
            },
            alt: null
          };
        }
        const shHit = lookStorageShelfHit();
        if (shHit && ((gid === 'samogon' || gid === 'kontra') !== (shHit.rowIdx === 7))) {
          const hid = gid === 'samogon' || gid === 'kontra';
          return { label: hid ? 'Такое — только под прилавок' : 'Под прилавок — только «из-под полы»', icon: 'place',
            fn: () => ctx.toast && ctx.toast(hid ? 'Самогон и контрабанду на виду не держат — убери в нишу под прилавком.' : 'Ниша под прилавком — для товара «из-под полы».') };
        }
        if (shHit) {
          return {
            label: `Поставить на полку: ${gName}`, icon: 'place',
            fn: () => {
              returnGoodToShelfStock(gid, shHit.point, true, h.data && h.data.unitCost, shHit.rowIdx);
              life.removeItem(h);
              ctx.audio && ctx.audio.click(720, .4, 0, .05);
              ctx.toast && ctx.toast(`${gName} поставлен на полку`);
            },
            alt: null
          };
        }
      }
      if (bin) return { label: h.kind === 'gun' ? 'Выбросить ружьё в бак' : small ? (bin === binSmall ? 'Выбросить в урну' : 'Выбросить в бак') : h.data.contents ? 'Выбросить коробку с товаром' : 'Выбросить в мусорку', icon: 'drop', fn: () => trashIt(bin) };
      if (life.canPlace()) {
        return { label: 'Поставить', icon: 'place', fn: () => life.placeHeld(), alt: { label: 'Выбросить', icon: 'drop', fn: () => life.dropHeld() } };
      }
      return { label: 'Выбросить', icon: 'drop', fn: () => life.dropHeld() };
    }
    if (!life.held && gunState() === 'carried' && binBig && !weapon.aiming) return { label: 'Выбросить ружьё в бак', icon: 'drop', fn: () => { const it = life.addItem({ kind: 'gun', x: P.x, y: camera.position.y - .5, z: P.z, ry: P.yaw }); setGunState('world'); life.pick(it); trashIt(binBig); } };
    if (!life.held && gunState() === 'carried' && weapon.drawn && !weapon.aiming) {
      const openBx = life.lookingAtOpenBox && life.lookingAtOpenBox(2.2);
      if (openBx) return { label: 'Бросить ружьё в коробку', icon: 'box', fn: () => { const it = life.addItem({ kind: 'gun', x: P.x, y: camera.position.y - .5, z: P.z, ry: P.yaw }); setGunState('world'); life.pick(it); life.throwIntoBox(openBx); } };
    }
    if (gunState() === 'wall' && inKiosk() && lookingAtBox(rackBox, 2)) return { label: 'Снять ружьё со стены', icon: 'weapon', fn: () => { setGunState('carried'); ctx.audio.reloadClose(); weapon.draw(); } };
    if (gunState() === 'carried' && inKiosk() && lookingAtBox(rackBox, 2) && !weapon.aiming) return { label: 'Повесить ружьё на стену', icon: 'weapon', fn: () => { setGunState('wall'); ctx.audio.click(900, .5, 0, .06); } };
    if (transport.lookingAtDriver && transport.lookingAtDriver(2.8) && !weapon.drawn) return { label: 'Поговорить: Дядя Коля', icon: 'talk', fn: () => transport.talkToDriver() };
    if (transport.seated) return { label: 'Встать с места', icon: '⬆', fn: () => transport.standFromSeat() };
    { const busSeat = transport.lookedSeat && transport.lookedSeat(0, 0, 2.6);
      if (busSeat) return { label: 'Сесть на место', icon: '🪑', fn: () => transport.sitOnSeat(busSeat) }; }
    const li = life.lookItem(2.2);
    if (li && li.kind === 'gun') return { label: 'Поднять ружьё', icon: 'weapon', fn: () => { life.removeItem(li); setGunState('carried'); weapon.draw(); ctx.save && ctx.save(); ctx.onCtl && ctx.onCtl(); } };
    if (li && li.kind === 'bottle') return { label: 'Поднять пустую бутылку', icon: 'drink', fn: () => life.pick(li) };
    if (li && li.kind === 'pack') {
      const pTitle = packTitleOf(li.data);
      const gid = li.data && li.data.goodId;
      const gName = goodTitleOf(gid);
      if (li.inBoxId) {
        const parentBox = life.items.find(b => b.id === li.inBoxId && b.kind === 'box');
        return {
          label: `Достать из коробки: ${pTitle}`, icon: 'box',
          fn: () => life.pick(li),
          alt: parentBox ? { label: 'Взять коробку', icon: 'hand', fn: () => life.pick(parentBox) } : { label: 'Распаковать', icon: 'hand', fn: () => openPack(li) }
        };
      }
      if (!li.data.opened) {
        return {
          label: `Распаковать: ${pTitle}`, icon: 'box',
          fn: () => openPack(li),
          alt: { label: 'Взять упаковку', icon: 'hand', fn: () => life.pick(li) }
        };
      }
      return {
        label: `Достать (1 шт.): ${gName} (ост. ${li.data.count})`, icon: 'hand',
        fn: () => pullOneFromPack(li),
        alt: { label: 'Взять упаковку', icon: 'box', fn: () => life.pick(li) }
      };
    }
    if (li && li.kind === 'good') {
      const gid = li.data && li.data.goodId;
      const gName = goodTitleOf(gid);
      return {
        label: `Взять: ${gName}`, icon: 'hand',
        fn: () => life.pick(li),
        alt: inKiosk() ? { label: 'На полку', icon: 'place', fn: () => { returnGoodToShelfStock(gid, null, true, li.data && li.data.unitCost); life.removeItem(li); ctx.toast && ctx.toast(`${gName} убран на полку`); } } : null
      };
    }
    if (li && li.kind === 'box') {
      if (li.data.opened) {
        const innerPack = life.items.find(ch => ch.inBoxId === li.id && ch.kind === 'pack');
        if (innerPack) {
          return {
            label: `Достать: ${packTitleOf(innerPack.data)}`, icon: 'box',
            fn: () => life.pick(innerPack),
            alt: { label: 'Взять коробку', icon: 'hand', fn: () => life.pick(li) }
          };
        }
      }
      if (!li.data.opened && li.data.contents) {
        return {
          label: 'Распаковать коробку', icon: 'box', fn: () => life.unpack(li),
          alt: { label: 'Поднять коробку', icon: 'hand', fn: () => life.pick(li) }
        };
      }
      return {
        label: li.data.opened ? 'Поднять пустую коробку' : 'Поднять коробку', icon: 'box', fn: () => life.pick(li),
        alt: null
      };
    }
    if (inKiosk() && !weapon.drawn) {
      const scSlot = lookShowcaseSlot();
      if (scSlot != null && S.slots[scSlot]) {
        const gid = S.slots[scSlot];
        const gName = goodTitleOf(gid);
        const [sx, sy] = SLOT_POS[scSlot];
        return {
          label: `Взять с витрины: ${gName}`, icon: 'hand',
          fn: () => {
            S.slotCounts = S.slotCounts || S.slots.map(id => id ? 1 : 0);
            S.slotCounts[scSlot] = Math.max(0, (S.slotCounts[scSlot] || 1) - 1);
            if (S.slotCounts[scSlot] <= 0) S.slots[scSlot] = null;
            if (takeGoodFromShelfStock(gid, null)) {
              const it = life.addItem({ kind: 'good', x: sx, y: sy + .02, z: KD - .14, ry: P.yaw, data: { goodId: gid } });
              life.pick(it);
            } else {
              shelfSig = ''; updateShelves(); ctx.onStockChange && ctx.onStockChange();
            }
          },
          alt: {
            label: 'Убрать на полку', icon: 'place',
            fn: () => {
              S.slotCounts = S.slotCounts || S.slots.map(id => id ? 1 : 0);
              const moved = Math.max(1, S.slotCounts[scSlot] || 1);
              S.slots[scSlot] = null; S.slotCounts[scSlot] = 0;
              S.shelfPlacements = S.shelfPlacements || [];
              for (let k = 0; k < moved; k++) {
                const sp = findFreeShelfSpot(S.shelfPlacements, gid, null);
                S.shelfPlacements.push({ uid: 'sh_' + Math.random().toString(36).slice(2, 9), id: gid, x: sp.x, y: sp.y, z: sp.z, ry: sp.ry });
              }
              shelfSig = ''; updateShelves(); ctx.onStockChange && ctx.onStockChange();
              ctx.toast && ctx.toast(`${gName} убран с витрины на полку`);
            }
          }
        };
      }
      const shGood = lookShelfGood();
      if (shGood) {
        const gid = shGood.id;
        const gName = goodTitleOf(gid);
        return {
          label: `Взять с полки: ${gName}`, icon: 'hand',
          fn: () => {
            if (takeGoodFromShelfStock(gid, shGood.uid)) {
              const it = life.addItem({ kind: 'good', x: shGood.pos.x, y: shGood.pos.y, z: shGood.pos.z, ry: P.yaw, data: { goodId: gid } });
              life.pick(it);
            }
          }
        };
      }
    }
    if (inKiosk() && life.lookingAtPhone()) return { label: 'Позвонить', icon: 'phone', fn: () => ctx.phoneCall() };
    if (inKiosk() && life.lookingAtNotepad()) return { label: 'Открыть блокнот заказов', icon: 'notepad', fn: () => ctx.openOrders() };
    if (lookingAt([doorMesh], 2.4)) return { label: doorTarget > .5 ? 'Закрыть дверь' : (inKiosk() ? 'Открыть дверь' : 'Открыть дверь'), icon: '🚪', fn: toggleDoor };
    if (inKiosk() && !life.held && lookingAtBox(hatchBox, 1.55)) {
      return {
        label: hatchTarget > .5 ? 'Опустить окошко выдачи' : 'Поднять окошко выдачи',
        icon: 'interact',
        fn: () => toggleHatch(),
        alt: (!P.seated && Math.hypot(P.x - STOOL.x, P.z - STOOL.z) < .95)
          ? { label: S.phase === 'night' ? 'Уснуть до утра' : 'Сесть за прилавок', icon: 'sit', fn: () => { if (S.phase === 'night') ctx.sleep(); else sit(); } }
          : (P.seated ? { label: S.phase === 'night' ? 'Уснуть до утра' : 'Встать из-за прилавка', icon: 'sit', fn: () => { if (S.phase === 'night') ctx.sleep(); else stand(); } } : null)
      };
    }
    if (inKiosk()) {
      if (lookingAtBox(clockBox, 2.2)) {
        const hh = String(Math.floor(hour) % 24).padStart(2, '0'), mm = String(Math.floor((hour % 1) * 60)).padStart(2, '0');
        return { label: `Часы: ${hh}:${mm}`, icon: 'interact', fn: () => {
          const s = ctx.getS(), d = s && s.deliveries && s.deliveries.find(x => x.state === 'way');
          const dLeft = d ? ` Доставка приедет через ~${Math.max(1, Math.round((d.etaHours ?? (d.eta / 90)) * 60))} мин.` : '';
          ctx.toast && ctx.toast(`Настенные часы показывают ${hh}:${mm}.${dLeft}`);
        } };
      }
      if (lookingAtBox(calBox, 2.2)) {
        const info = calInfoOf(ctx.getS());
        return { label: `Календарь: ${info.curDate} ${info.mGen.toLowerCase()} ${info.yr}`, icon: 'interact', fn: () => {
          ctx.toast && ctx.toast(`На календаре: ${info.curDate} ${info.mGen.toLowerCase()} ${info.yr} г. (День ${info.gameDayNum})`);
        } };
      }
      if (radioObj && lookingAtBox(radioBox, 1.8)) return { label: ctx.audio.radioOn ? 'Выключить радио' : 'Включить радио', icon: 'radio', fn: () => { ctx.audio.radioToggle(); ctx.onCtl(); } };
      if (!P.seated && Math.hypot(P.x - STOOL.x, P.z - STOOL.z) < .9) return { label: S.phase === 'night' ? 'Сесть и уснуть до утра' : 'Сесть за прилавок', icon: '🪑', fn: () => { if (S.phase === 'night') ctx.sleep(); else sit(); } };
      if (P.seated) return { label: S.phase === 'night' ? 'Уснуть до утра' : 'Встать из-за прилавка', icon: '⬆', fn: () => { if (S.phase === 'night') ctx.sleep(); else stand(); } };
      return null;
    }
    if (zavodNpc && !zavodNpc.dead && !weapon.drawn) {
      const dG = Math.hypot(P.x - zavodNpc.h.obj.position.x, P.z - zavodNpc.h.obj.position.z);
      if (dG < 3.2) return { label: 'Поговорить: Кладовщик Геннадий', icon: 'talk', fn: () => zavodNpc.talk() };
    }
    const tp = aimedPerson(2.6);
    if (tp && tp.role === 'ped' && tp.state !== 'scared' && !weapon.drawn) return { label: 'Поговорить', icon: 'talk', fn: () => talkTo(tp) };
    if (tp && tp.talk && !weapon.drawn) return { label: 'Поговорить: ' + tp.title, icon: 'talk', fn: () => tp.talk() };
    const ext = env2.extraAction && env2.extraAction(); if (ext) return ext;
    return null;
  }
  const env2 = { extraAction: () => env2Extra && env2Extra() };
  function talkTo(p) {
    releaseBench(p);
    p.state = 'talking'; p.timer = 16; p.h.setExpr('talk'); p.path = [];
    const L = p.h.L, k = p.kind;
    const S = ctx.getS();
    const gMem = S ? (S.npcMemory = S.npcMemory || { talks: {}, crimes: { gunAimed: 0, brawls: 0, kills: 0, lastDay: -1 } }) : { talks: {}, crimes: {} };
    const mem = p.memory = p.memory || {};
    mem.talkCount = (mem.talkCount || 0) + 1;
    const tc = mem.talkCount;

    // Контекст времени суток, даты, погоды, курса доллара и состояния ларька
    const hh = String(Math.floor(hour) % 24).padStart(2, '0'), mm = String(Math.floor((hour % 1) * 60)).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;
    const timePeriod = hour < 6 ? 'глубокая ночь' : hour < 11 ? 'утро' : hour < 17 ? 'день' : hour < 21.5 ? 'вечер' : 'поздний вечер';
    const weatherDesc = winter
      ? (weather.state === 'blizzard' ? 'буран метёт, в двух шагах ничего не видать' : weather.snow > .45 ? 'снег валит хлопьями, мороз крепчает' : 'морозно на улице, пар изо рта')
      : (weather.rain > .4 ? 'дождь льёт как из ведра, сырость кругом' : weather.rain > .05 ? 'морось осенняя, лужи кругом' : 'погода тихая, сухо');
    const cal = S ? calInfoOf(S) : { curDate: 15, mGen: 'Ноября', yr: 1992, gameDayNum: 1 };
    const rate = S && S.rate ? Math.round(S.rate) : 410;
    const mkPct = S ? Math.round((S.markup || .25) * 100) : 25;
    const vitrineGoods = S && S.slots ? S.slots.filter(Boolean).map(id => goodShortOf(id)) : [];
    const vitrineNote = vitrineGoods.length
      ? (mkPct > 55
          ? `На витрине у тебя ${vitrineGoods.slice(0, 3).join(', ')}, да только наценка ${mkPct}% — кусаются цены-то!`
          : mkPct <= 20
          ? `Смотрю, на витрине ${vitrineGoods.slice(0, 3).join(', ')}, и наценка всего ${mkPct}% — честная цена, народ хвалит!`
          : `Видел у тебя на витрине ${vitrineGoods.slice(0, 3).join(', ')}, цены вроде терпимые (${mkPct}% наценки).`)
      : 'Кстати, витрина у тебя в ларьке пустовата — выложил бы товар на стекло, народ охотнее пойдёт!';

    // 1. РЕАКЦИЯ СВИДЕТЕЛЯ НА УБИЙСТВО ИЛИ НОКАУТ НА ЕГО ГЛАЗАХ
    if (mem.sawKill || mem.sawBody) {
      if (k === 'police') {
        p.h.setExpr('angry');
        const fine = S ? Math.min(S.money, Math.max(500, Math.round(rate * 3))) : 1000;
        ctx.dialog({
          name: 'Сержант Кузьмин (милиция)',
          text: `Стоять на месте! На моих глазах совершено тяжкое нападение на человека (в ${timeStr})! Вы задержаны, гражданин коммерсант! Либо оформляем протокол и изымаем оружие, либо платите штраф на месте — ${ctx.fmt(fine)} ₽!`,
          options: [
            ...(S && S.money >= fine ? [{ label: `Замять дело на месте (${ctx.fmt(fine)} ₽)`, fn: () => {
              S.money -= fine; mem.sawKill = false; mem.sawBody = false;
              ctx.rep && ctx.rep('law', 2); ctx.onStockChange && ctx.onStockChange();
              ctx.dialog({ name: 'Сержант Кузьмин', text: 'Ладно… Считайте, что вам повезло. Но ещё одна выходка на моём участке — поедете в отделение всерьёз!', options: [{ label: 'Понял, товарищ сержант.', fn: () => ctx.closeDialog() }] });
            } }] : []),
            { label: 'Попробуй возьми! (кулачный бой)', fn: () => {
              ctx.closeDialog();
              p.brawling = true; p.state = 'brawl'; p.path = [];
            } },
            { label: 'Я защищался от бандитов!', fn: () => {
              mem.sawKill = false; mem.sawBody = false;
              ctx.dialog({ name: 'Сержант Кузьмин', text: 'Разберёмся в участке! Пока беру вас на карандаш. Чтоб тихо было у ларька!', options: [{ label: 'Есть.', fn: () => ctx.closeDialog() }] });
            } }
          ]
        });
        return;
      }
      p.h.setExpr('scared');
      const hush = 300;
      ctx.dialog({
        name: 'Напуганный свидетель',
        text: `Не подходи ко мне! Я своими глазами видел, как ты человека тут уложил на снег! В такое время (${timeStr}) на улице страшно находиться рядом с твоим ларьком!`,
        options: [
          ...(S && S.money >= hush ? [{ label: `Держи ${hush} ₽ — ты ничего не видел`, fn: () => {
            S.money -= hush; mem.sawKill = false; mem.sawBody = false;
            ctx.onStockChange && ctx.onStockChange();
            ctx.dialog({ name: 'Свидетель', text: 'Ладно-ладно, могила! Никому ни слова не скажу, только не трогай меня…', options: [{ label: 'Иди своей дорогой.', fn: () => { leaveWorld(p); ctx.closeDialog(); } }] });
          } }] : []),
          { label: 'Это была самооборона, успокойся!', fn: () => {
            mem.sawKill = false; mem.sawBody = false;
            ctx.rep && ctx.rep('folk', .5);
            ctx.dialog({ name: 'Свидетель', text: 'Ох, время какое лихое пошло в 92-м… Ладно, пойду я домой от греха подальше.', options: [{ label: 'Бывай.', fn: () => { leaveWorld(p); ctx.closeDialog(); } }] });
          } },
          { label: 'Проваливай, пока цел!', fn: () => {
            ctx.rep && ctx.rep('street', 1); ctx.rep && ctx.rep('folk', -2);
            p.flee = true; leaveWorld(p); p.speed = 3.6;
            ctx.closeDialog();
          } }
        ]
      });
      return;
    }

    // 2. РЕАКЦИЯ НА НАВЕДЁННОЕ ОРУЖИЕ ИЛИ ДРАКУ В ПАМЯТИ NPC
    if (mem.sawGunAim || mem.wasPunched || mem.sawBrawl) {
      if (k === 'police') {
        p.h.setExpr('angry');
        const fine = S ? Math.min(S.money, Math.max(250, Math.round(rate * 1.5))) : 500;
        ctx.dialog({
          name: 'Сержант Кузьмин (милиция)',
          text: mem.sawGunAim
            ? `Гражданин! Вы только что размахивали огнестрельным оружием в общественном месте! Нарушаем общественный порядок? Штраф ${ctx.fmt(fine)} ₽!`
            : `Гражданин коммерсант! Я видел, как вы тут кулаками махали на улице! Прекратить хулиганство!`,
          options: [
            ...(S && S.money >= fine ? [{ label: `Оплатить штраф ${ctx.fmt(fine)} ₽`, fn: () => {
              S.money -= fine; mem.sawGunAim = false; mem.wasPunched = false; mem.sawBrawl = false;
              ctx.rep && ctx.rep('law', 1); ctx.onStockChange && ctx.onStockChange();
              ctx.dialog({ name: 'Сержант Кузьмин', text: 'Квитанцию выписал. Впредь держите себя в руках!', options: [{ label: 'Понял.', fn: () => ctx.closeDialog() }] });
            } }] : []),
            { label: 'Извините, товарищ сержант, погорячился', fn: () => {
              mem.sawGunAim = false; mem.wasPunched = false; mem.sawBrawl = false;
              ctx.dialog({ name: 'Сержант Кузьмин', text: 'На первый раз — устное предупреждение. Идите работайте.', options: [{ label: 'Слушаюсь!', fn: () => ctx.closeDialog() }] });
            } }
          ]
        });
        return;
      }
      p.h.setExpr('angry');
      ctx.dialog({
        name: k === 'babka' ? 'Бабушка Клавдия' : k === 'dedushka' ? 'Дедушка Егор' : k === 'worker' ? 'Рабочий завода' : 'Прохожий',
        text: mem.sawGunAim
          ? `Ты чего подходишь, мил человек?! Только что ружьё на меня наставлял, у меня чуть ноги не отнялись! Убери свою двустволку, тогда и поговорим по-людски!`
          : `Слышь, коммерсант, я видел, как ты тут кулаками махал! Ты со мной-то руки не распускай!`,
        options: [
          { label: 'Извини, нервы ни к чёрту — шпана одолела', fn: () => {
            mem.sawGunAim = false; mem.wasPunched = false; mem.sawBrawl = false;
            p.h.setExpr('neutral');
            ctx.rep && ctx.rep('folk', 1);
            ctx.dialog({
              name: 'Прохожий',
              text: `Ладно, понимаю, район у нас беспокойный, да ещё и ${weatherDesc}… Забудем обиду. Торгуй спокойно.`,
              options: [{ label: 'Спасибо за понимание!', fn: () => ctx.closeDialog() }]
            });
          } },
          { label: 'Ладно, иди своей дорогой.', fn: () => ctx.closeDialog() }
        ]
      });
      return;
    }

    // 3. ДИАЛОГИ С ПАМЯТЬЮ О ПОВТОРНЫХ РАЗГОВОРАХ И ПРИВЯЗКОЙ К ИГРЕ И ВРЕМЕНИ
    if (k === 'dedushka') {
      const intro = tc === 1
        ? `Здравствуй, внучок. Сейчас уже ${timeStr} (${timePeriod}), а на дворе ${cal.curDate} ${cal.mGen.toLowerCase()} ${cal.yr} года — ${weatherDesc}. Суставы к непогоде разломило… Как дядя Миша-то, пишет?`
        : tc === 2
        ? `Опять ты, внучок? Мы ж с тобой недавно толковали! Ну да старику приятно поболтать. ${vitrineNote}`
        : `Ты уж в ${tc}-й раз ко мне подходишь, касатик! Я пока до остановки дойду — автобус седьмой пропустим.`;
      ctx.dialog({
        name: 'Дедушка Егор (ветеран труда)',
        text: intro,
        options: [
          { label: 'Как раньше на заводе работали, дедушка?', fn: () => ctx.dialog({
            name: 'Дедушка Егор',
            text: `Эх, милок, гремел наш Краснозаводский завод на всю страну! В три смены станки гудели, орден Трудового Красного Знамени вручали! А сейчас доллар уж по ${rate} рублей, цены каждый день скачут…`,
            options: [
              { label: 'А автобус №7 давно ждёте?', fn: () => ctx.dialog({
                name: 'Дедушка Егор',
                text: `Да вот, расписание на остановке посмотрел — Дядя Коля по минутам ездит. Заходишь в ПАЗик, садишься на мягкое сиденье у печки — и прямиком до заводской проходной!`,
                options: [{ label: 'Спасибо, дедушка!', fn: () => { p.h.setExpr('smile'); ctx.closeDialog(); } }]
              }) },
              { label: 'Здоровья вам, дедушка!', fn: () => { p.h.setExpr('smile'); ctx.closeDialog(); } }
            ]
          }) },
          { label: 'Что про мой ларёк люди говорят?', fn: () => {
            ctx.rep('folk', 1);
            ctx.dialog({ name: 'Дедушка Егор', text: `${vitrineNote} Главное — держи хлеб, тушёнку и чай, старики тебе спасибо скажут!`, options: [{ label: 'Обязательно учту!', fn: () => ctx.closeDialog() }] });
          } },
          { label: 'Доброго здоровья!', fn: () => ctx.closeDialog() }
        ]
      });
      return;
    }
    if (k === 'babka') {
      const intro = tc === 1
        ? `Ой, касатик, здравствуй! На часах ${timeStr}, ${weatherDesc}. За хлебушком вышла, да вот смотрю — доллар уже по ${rate} рублей! Куда ж это годится в ${cal.yr}-м году?`
        : tc === 2
        ? `Снова ты, милок! Мы ж с тобой уже здоровались сегодня. ${vitrineNote}`
        : `Ох, батюшки, уже ${tc}-й раз с тобой лясы точим! Мне ж на автобус седьмой садиться пора, пока места в салоне есть!`;
      ctx.dialog({
        name: 'Бабушка Клавдия',
        text: intro,
        options: [
          { label: 'Как здоровье и что во дворе слышно?', fn: () => ctx.dialog({
            name: 'Бабушка Клавдия',
            text: gMem.crimes && gMem.crimes.kills > 0
              ? `Ох, милок, крестятся все во дворе! Говорят, у ларька твоего стрельба да драки были! Ты уж с бандитами поосторожнее.`
              : `Да потихоньку, милок. Милиция по вечерам патрулирует, а автобус №7 к остановке подходит — люди чинно по ступенькам заходят и на места рассаживаются.`,
            options: [{ label: 'Спасибо за новости, бабушка!', fn: () => { p.h.setExpr('smile'); ctx.closeDialog(); } }]
          }) },
          { label: 'В ларьке свежий товар, заходите!', fn: () => {
            ctx.rep('folk', 1);
            ctx.dialog({ name: 'Бабушка Клавдия', text: `Дай Бог тебе здоровья! ${vitrineNote}`, options: [{ label: 'Всегда рады!', fn: () => ctx.closeDialog() }] });
          } },
          { label: 'Всего доброго!', fn: () => ctx.closeDialog() }
        ]
      });
      return;
    }
    if (k === 'worker') {
      const intro = tc === 1
        ? `Здорово, хозяин! На часах ${timeStr} (${timePeriod}), ${weatherDesc}. Иду с Краснозаводского завода — семь часов у фрезера отпахал.`
        : tc === 2
        ? `Здорово ещё раз! Мы ж с тобой уже виделись сегодня. ${vitrineNote}`
        : `Ну ты, брат, общительный — уже в ${tc}-й раз заговариваешь! Сейчас седьмой автобус подойдёт, поеду погреюсь.`;
      ctx.dialog({
        name: 'Рабочий завода',
        text: intro,
        options: [
          { label: 'Как на заводе дела и почём товар со склада?', fn: () => ctx.dialog({
            name: 'Рабочий',
            text: `В отделе сбыта у проходной кладовщик Геннадий сидит — отпускает заводское пиво, тушёнку, лимонад и сигареты на 20% дешевле базы! Можешь коробку прямо в ПАЗик поставить и привезти, только учти: когда Дядя Коля газует или тормозит, коробки и бутылки по полу автобуса катаются!`,
            options: [{ label: 'Дельный совет, спасибо!', fn: () => ctx.closeDialog() }]
          }) },
          { label: 'Что скажешь про цены в ларьке?', fn: () => ctx.dialog({
            name: 'Рабочий',
            text: `${vitrineNote} А курс доллара сегодня уже ${rate} ₽ за бакс — в блокноте наценку с умом крути!`,
            options: [{ label: 'Понял, бывай!', fn: () => ctx.closeDialog() }]
          }) },
          { label: 'Счастливо, земляк.', fn: () => ctx.closeDialog() }
        ]
      });
      return;
    }
    if (k === 'police') {
      const hasCrimes = gMem.crimes && (gMem.crimes.kills > 0 || gMem.crimes.brawls > 0);
      const intro = tc === 1
        ? `Здравия желаю! Время ${timeStr}, ${cal.curDate} ${cal.mGen.toLowerCase()} ${cal.yr} г. Патрулируем ул. Заводскую.${hasCrimes ? ' Кстати, по сводке у вашего ларька зафиксированы беспорядки — мы за вами внимательно следим!' : ' Как обстановка у ларька?'}`
        : `Товарищ коммерсант, мы с вами сегодня уже беседовали (${tc}-й раз). Порядок соблюдаете? Контрабанду и самогон на открытую витрину не выставляйте!`;
      ctx.dialog({
        name: 'Сержант Кузьмин (милиция)',
        text: intro,
        options: [
          { label: 'Всё по закону, товарищ сержант!', fn: () => ctx.dialog({
            name: 'Сержант Кузьмин',
            text: `Вот и отлично. Сейчас ${timePeriod}, ${weatherDesc}. Если шпана или рэкетиры будут ломиться — не устраивайте самосуд на глазах у прохожих, люди всё запоминают!`,
            options: [{ label: 'Так точно!', fn: () => ctx.closeDialog() }]
          }) },
          { label: 'Как обстановка на маршруте №7?', fn: () => ctx.dialog({
            name: 'Сержант Кузьмин',
            text: 'Автобус ходит исправно, пассажиры садятся на остановках. Следите, чтобы в салоне пустые бутылки не били.',
            options: [{ label: 'Понял, спокойного дежурства!', fn: () => ctx.closeDialog() }]
          }) },
          { label: 'Честь имею.', fn: () => ctx.closeDialog() }
        ]
      });
      return;
    }
    // Молодёжь, соседи и прочие прохожие
    const intro = tc === 1
      ? `Привет, коммерсант! На часах ${timeStr} (${timePeriod}), на улице ${weatherDesc}. Бакс сегодня уже по ${rate} ₽!`
      : tc === 2
      ? `О, снова ты! Мы ж с тобой уже болтали сегодня. ${vitrineNote}`
      : `Слушай, мы уже ${tc}-й раз за день разговариваем! Тебе торговать надо, а мне автобус №7 ловить.`;
    ctx.dialog({
      name: k === 'youth' ? 'Местный парень' : k === 'neighbor' ? 'Сосед по дому' : 'Прохожий',
      text: intro,
      options: [
        { label: 'Что нового на районе слышно?', fn: () => ctx.dialog({
          name: k === 'youth' ? 'Местный парень' : 'Сосед',
          text: gMem.crimes && gMem.crimes.kills > 0
            ? 'Все только и шепчутся, что у ларька кого-то уложили… Народ теперь с опаской ходит!'
            : `Да всё как обычно в ${cal.yr}-м: у остановки Марат на чёрной БМВ стоит, Дядя Коля на ПАЗике народ до завода возит, а ${vitrineNote.charAt(0).toLowerCase() + vitrineNote.slice(1)}`,
          options: [{ label: 'Ясно, спасибо!', fn: () => ctx.closeDialog() }]
        }) },
        { label: 'Заходи в ларёк за покупками!', fn: () => {
          ctx.rep('folk', .5);
          ctx.dialog({ name: 'Прохожий', text: `Обязательно загляну! ${vitrineNote}`, options: [{ label: 'Ждём!', fn: () => ctx.closeDialog() }] });
        } },
        { label: 'Бывай.', fn: () => ctx.closeDialog() }
      ]
    });
  }

  // ---------- кадр ----------
  let tAll = 0, stepPh = 0, actT = 0, lastActLabel = '', curAct = null;
  const PATH_TRACKS = [[-6, 1.1, -10, -28], [4, 1.1, 2, -30], [14, 1.1, 18, -26], [-30, 18.6, -30, 24], [28, 18.6, 30, 24], [-14, 18.6, -18, 24], [-40, 1.1, -52, -10], [40, 1.1, 58, -6]];
  const distToSeg = (px, pz, x1, z1, x2, z2) => {
    const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((px - x1) * dx + (pz - z1) * dz) / l2, 0, 1);
    return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
  };
  const surfaceAt = () => {
    if (transport.onBoard || (transport.floorHeightAt && transport.floorHeightAt(P.x, P.z) > .05)) return 'bus';
    if (inKiosk()) return 'wood';
    // Если игрок идёт по коробке
    if (life.items && life.items.some(it => it.kind === 'box' && it.state === 'rest' && Math.abs(P.x - it.obj.position.x) < it.half.x + .20 && Math.abs(P.z - it.obj.position.z) < it.half.z + .20)) return 'box';
    // Деревянная горка на детской площадке
    if (Math.hypot(P.x - (PG.x + 4), P.z - (PG.z - .8)) < 1.3) return 'wood';
    // Стальной погрузочный пандус у цеха на заводе и чугунные решётки ливнёвки
    if (P.x >= -113.0 && P.x <= -104.0 && P.z >= -17.0 && P.z <= -13.5) return 'metal';
    if (drainSpots.some(([dx, dz]) => Math.abs(P.x - dx) < .55 && Math.abs(P.z - dz) < .35)) return 'metal';
    // Асфальтированная предзаводская площадь и двор «Краснозаводского завода»
    if (P.x >= -139.0 && P.x <= -81.0 && P.z >= -37.5 && P.z <= 1.5) return weather.wet > .15 ? 'wet' : 'asphalt';
    if (Math.abs(P.x - 4.8) < 1.1 && Math.abs(P.z - 17.55) < 1.0) return 'path';
    // Проезжая часть (асфальт)
    if (P.z >= 6.25 && P.z <= 14.15) return weather.wet > .15 ? 'wet' : 'asphalt';
    // Южный и северный тротуары (расчищенная тропинка вдоль улицы), площадка у ларька и остановки
    const inGap = (P.x > -6.2 && P.x < 2.2) || (P.x > 2.8 && P.x < 13.8);
    if ((P.z >= 1.30 && P.z <= 5.45) || (P.z >= 15.05 && P.z <= 18.40) || (inGap && P.z >= 1.30 && P.z <= 15.05)) {
      return weather.wet > .15 ? 'wet' : 'path';
    }
    if (Math.abs(P.x) < 2.4 && P.z >= -2.5 && P.z <= 1.5) return weather.wet > .15 ? 'wet' : 'path';
    // Протоптанные тропинки во дворах
    if (PATH_TRACKS.some(([x1, z1, x2, z2]) => distToSeg(P.x, P.z, x1, z1, x2, z2) < .95)) {
      return weather.wet > .15 ? 'wet' : 'path';
    }
    return winter ? 'snow' : (weather.wet > .15 ? 'wet' : 'path');
  };
  function frame(dt) {
    tAll += dt;
    const S = ctx.getS(), T = ctx.getT();
    // часы (спокойный темп времени: 1 игровой час = 90 с реального времени)
    const dHour = dt / 90;
    if (S) updateShelves();
    if (!S) setClock(18.2);
    else {
      const ph = S.phase;
      if (ph === 'trade' && T) {
        setClock(9 + 12 * clamp(T.t / T.len, 0, 1) + (S.tradeHourOff || 0));
      } else {
        if (S._clockPhase !== ph) {
          S._clockPhase = ph;
          if (ph === 'morning' && (hour < 7.5 || hour > 11)) hour = 8.0;
          else if (ph === 'evening' && (hour < 20.5 || hour > 23.5)) hour = 21.0;
        }
        setClock(hour + dHour);
      }
    }
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
    // Сначала обновляем движение машин и автобуса в текущем кадре, чтобы камера игрока в автобусе двигалась абсолютно плавно без дрожания
    const _t0 = performance.now();
    carsTick(dt); exhaustTick(dt);
    transport.tick(dt, [...(transport.onBoard ? [] : [{ x: P.x, z: P.z }]), ...cars.map(c => ({ x: c.m.position.x, z: c.m.position.z })), ...people.filter(p => !p.inBus).map(p => ({ x: p.h.obj.position.x, z: p.h.obj.position.z }))]);
    { const o = transport.obstacle(), ca = Math.abs(Math.cos(o.heading)), sa = Math.abs(Math.sin(o.heading)), hx = o.hx * ca + o.hz * sa, hz = o.hx * sa + o.hz * ca;
      busCol.x1 = busCol.x2 = 999; // столкновения игрока со стенками и дверями автобуса обрабатываются точно в transport.playerBlocked
      if (!transport.onBoard && o.v > 1.5 && P.stun <= 0 && Math.abs(P.x - o.x) < hx + .3 && Math.abs(P.z - o.z) < hz + .3) hitByCar({ v: o.v }, Math.cos(-o.heading), Math.sin(-o.heading)); }
    const _t1 = performance.now();

    // игрок
    P.stun = Math.max(0, P.stun - dt);
    const moveOK = canMove();
    let ix = 0, iz = 0;
    if (moveOK) { ix = input.mx; iz = input.my; const k = input.keys; if (k.KeyW || k.ArrowUp) iz -= 1; if (k.KeyS || k.ArrowDown) iz += 1; if (k.KeyA || k.ArrowLeft) ix -= 1; if (k.KeyD || k.ArrowRight) ix += 1; const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; } }
    const inside = inKiosk();
    if (!inside && S && !S.flags.wentOut) { S.flags.wentOut = true; ctx.onCtl(); }
    const dr = Math.min(1.65, life.fx.drunk);
    if (dr > .04 && !P.seated) { ix += Math.sin(tAll * .73) * dr * .38 + Math.sin(tAll * 1.9) * dr * .14; iz += Math.cos(tAll * .51) * dr * .16; P.yaw += Math.sin(tAll * .37) * dr * .14 * dt; }
    const run = P.sprint && !P.crouch && !transport.onBoard && iz < -.3 && !weapon.aiming && life.heavy() < 8;
    const maxSp = ((inside || transport.onBoard) ? (run ? 1.7 : 1.15) : (run ? 4.3 : 1.65)) * (P.crouch ? .5 : 1) * (weapon.aiming ? .55 : 1) * (1 - Math.min(.35, life.heavy() * .025)) * (1 - dr * .15);
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const tvx = (rx * ix - fx * iz) * maxSp, tvz = (rz * ix - fz * iz) * maxSp;
    const acc = (Math.hypot(tvx, tvz) > Math.hypot(P.vx, P.vz) ? 9 : 11) * dt * (1 - dr * .45);
    if (P.stun <= 0) { P.vx += clamp(tvx - P.vx, -acc, acc); P.vz += clamp(tvz - P.vz, -acc, acc); } else { P.vx *= Math.pow(.2, dt); P.vz *= Math.pow(.2, dt); }
    let moved = 0;
    if (!P.seated) {
      doorCol.x1 = doorOpen < .3 ? .4 : 1.17; doorCol.x2 = doorOpen < .3 ? 1.2 : 1.25; doorCol.z1 = doorOpen < .3 ? -KD - .05 : -KD - .8 * Math.min(1, doorOpen); doorCol.z2 = -KD + (doorOpen < .3 ? .05 : 0);
      if (doorOpen > .3 && doorOpen < .75) { doorCol.x1 = doorCol.x2 = 999; }
      const ox = P.x, oz = P.z;
      const stuckIn = hitVeh(P.x, P.z);
      const nx = P.x + P.vx * dt; if (stuckIn || !hitAny(nx, P.z)) P.x = nx; else P.vx = 0;
      const nz = P.z + P.vz * dt; if (stuckIn || !hitAny(P.x, nz)) P.z = nz; else P.vz = 0;
      P.x = clamp(P.x, BOUND.x1, BOUND.x2); P.z = clamp(P.z, BOUND.z1, BOUND.z2);
      moved = Math.hypot(P.x - ox, P.z - oz);
      if (transport.syncPlayerBoarding) transport.syncPlayerBoarding();
    } else if (!transport.onBoard) {
      P.vx = P.vz = 0; P.x += (STOOL.x - P.x) * Math.min(1, dt * 6); P.z += (STOOL.z - P.z) * Math.min(1, dt * 6);
    } else {
      P.vx = P.vz = 0;
    }
    // шаги — по фазе шага
    const spd = moved / Math.max(dt, 1e-4);
    if (spd > .25) { const stride = run ? 1.25 : P.crouch ? .55 : .75; const prev = stepPh; stepPh += moved / stride; if (Math.floor(prev) !== Math.floor(stepPh)) ctx.audio && ctx.audio.step(surfaceAt(), spd, inside); }
    else stepPh = Math.floor(stepPh) + .5 * (stepPh % 1 > .5 ? 1 : 0); // остановка без «лишнего» шага
    const bobAmt = ctx.settings().bob ?? 1;
    const bobY = !P.seated ? Math.sin(stepPh * Math.PI) ** 2 * .04 * Math.min(1, spd / 1.6) * bobAmt * (run ? 1.6 : 1) : 0;
    const bobX = !P.seated ? Math.sin(stepPh * Math.PI) * .02 * Math.min(1, spd / 1.6) * bobAmt : 0;
    let blinkVal = 0, blinkBlur = 0;
    if (blackout) {
      blackout.t += dt;
      const bt = blackout.t;
      if (blackout.phase === 'fall') {
        // Плавное засыпание с тяжёлым морганием глазами перед отключкой (0..2.1 с)
        if (bt < .55) blinkVal = Math.sin((bt / .55) * Math.PI) * .78;
        else if (bt < .85) blinkVal = .22 + (1 - Math.cos(((bt - .55) / .30) * Math.PI)) * .34;
        else if (bt < 1.25) blinkVal = .90 - Math.sin(((bt - .85) / .40) * Math.PI) * .38;
        else if (bt < 1.75) { const u = (bt - 1.25) / .50; blinkVal = .52 + u * u * (3 - 2 * u) * .48; }
        else blinkVal = 1.0;
        blinkBlur = clamp(bt * .45, 0, .75);

        if (bt > .65 && !blackout.thudded) { blackout.thudded = true; ctx.audio && ctx.audio.thud(1.0); }
        if (bt >= 2.10) {
          const sp = pickBlackoutSpot();
          const sleepH = blackout.sleepHours || R(4.0, 7.0);
          if (transport.riding) transport.alight();
          if (inKiosk()) { doorTarget = 1; doorOpen = 1; }
          P.x = sp.x; P.z = sp.z; P.vx = P.vz = 0;
          P.seated = false; P.crouch = false; P.lying = true;
          P.h = .20; P.roll = P.lieSide * 1.18; P.pitch = R(.12, .26); P.yaw = R(0, Math.PI * 2);
          life.fx.drunkTarget = .35; life.fx.drunk = .45;
          // Продвигаем игровое время на 4–7 часов вперёд (вместе с доставками)
          setClock(hour + sleepH);
          if (S && S.deliveries) {
            for (const d of S.deliveries) if (d.state === 'way') {
              if (d.etaHours != null) d.etaHours -= sleepH;
              else d.eta -= sleepH * 90;
            }
          }
          blackout.phase = 'lying'; blackout.t = 0;
          blinkVal = 1.0; blinkBlur = .75;
          ctx.onBlackout && ctx.onBlackout(sp.name, sleepH);
          ctx.onCtl && ctx.onCtl();
        }
      } else if (blackout.phase === 'lying') {
        // Плавное пробуждение лёжа на земле: глаза несколько раз медленно моргают и фокусируются (0..3.1 с)
        if (bt < .35) blinkVal = 1.0;
        else if (bt < .85) blinkVal = 1.0 - Math.sin(((bt - .35) / .50) * Math.PI) * .42;
        else if (bt < 1.10) blinkVal = .96;
        else if (bt < 1.85) blinkVal = .96 - Math.sin(((bt - 1.10) / .75) * Math.PI) * .72;
        else if (bt < 2.05) blinkVal = .84;
        else if (bt < 2.65) { const u = (bt - 2.05) / .60; blinkVal = .84 * (1 - u * u * (3 - 2 * u)); }
        else if (bt < 3.05) blinkVal = Math.sin(((bt - 2.65) / .40) * Math.PI) * .52;
        else blinkVal = 0;
        blinkBlur = clamp((1 - bt / 3.1) * .68, 0, .68);

        const wantUp = bt > 1.8 && (Math.hypot(input.mx, input.my) > .25 || input.keys.KeyW || input.keys.KeyS || input.keys.KeyA || input.keys.KeyD || input.keys.Space);
        if (wantUp || bt > 4.6) standFromGround();
      }
    }
    post.uniforms.blink.value += (blinkVal - post.uniforms.blink.value) * Math.min(1, dt * 18);
    const busFloor = transport.floorHeightAt ? transport.floorHeightAt(P.x, P.z) : 0;
    const targetH = P.lying ? .20 : transport.seated ? P.h : P.seated ? 1.18 : (P.crouch ? 1.05 : 1.66) + busFloor;
    if (!transport.seated) P.h += (targetH - P.h) * Math.min(1, dt * (P.lying ? 4.2 : 6.5));
    P.shake = Math.max(0, P.shake - dt * 1.5);
    const targetRoll = P.lying ? P.lieSide * 1.18 + Math.sin(tAll * 1.6) * .04 : (P.stun > 0 ? Math.sin(tAll * 3) * .25 * (P.stun / 2.5) : 0);
    P.roll += (targetRoll - P.roll) * Math.min(1, dt * (P.lying ? 4.5 : 4.5));
    const sh = P.shake * .03;
    camera.position.set(P.x + rx * bobX + R(-sh, sh), P.h - bobY + R(-sh, sh), P.z + rz * bobX);
    const sway = dr * (Math.sin(tAll * .85) * .065 + Math.sin(tAll * 1.75) * .028);
    const drPitch = dr * (Math.sin(tAll * 1.1) * .028 + Math.cos(tAll * .53) * .016);
    const drYaw = dr * (Math.sin(tAll * .62) * .042 + Math.sin(tAll * 1.35) * .018);
    camera.rotation.set(P.pitch + (life.fx.smokePitch || 0) + weapon.kick * .05 + drPitch, P.yaw + drYaw, P.roll + bobX * .5 * bobAmt + sway);
    post.uniforms.dbl.value = dr > .06 ? (dr - .06) * .016 : 0; post.uniforms.dbt.value = tAll * .85; post.uniforms.smoke.value = life.fx.smoke;
    const drBlur = dr > .32 ? (Math.sin(tAll * .95) * .5 + .5) * Math.min(.55, (dr - .32) * .36) : 0;
    const targetBlur = (ctx.notepadOpen && ctx.notepadOpen() ? 1 : Math.max(drBlur, blinkBlur));
    post.uniforms.blur.value += (targetBlur - post.uniforms.blur.value) * Math.min(1, dt * 6);
    camera.fov += ((baseFov * (1 - weapon.aimK * .22) * (run ? 1.06 : 1)) - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix();
    post.uniforms.hurt.value = Math.max(0, post.uniforms.hurt.value - dt * .4);
    // дверь и подъёмное окошко выдачи товара
    doorOpen += (doorTarget - doorOpen) * Math.min(1, dt * 5); doorPivot.rotation.y = -doorOpen * 1.6;
    if (hatchAutoTimer > 0) hatchAutoTimer = Math.max(0, hatchAutoTimer - dt);
    if (T && T.cur && !T.paused && P.seated) hatchTarget = 1;
    hatchOpen += (hatchTarget - hatchOpen) * Math.min(1, dt * 6.5);
    hatchGroup.position.y = 1.19 + hatchOpen * 0.31;
    // люди
    if (S) { ambientTick(dt); gopTick(dt); }
    peopleTick(dt);
    const _t2 = performance.now();
    // наведение ружья
    if (weapon.drawn) { const p = aimedPerson(weapon.aiming ? 35 : 12); if (p && (weapon.aiming || Math.hypot(p.h.obj.position.x - P.x, p.h.obj.position.z - P.z) < 6)) threaten(p); }
    weapon.update(dt, { moving: Math.min(1, spd / 2), sprint: run, aspect: camera.aspect });
    life.tick(dt, dHour); wallGunTick(dt); playgroundTick(dt); paperTick(dt); factorySmokeTick(dt); kioskFliesTick(dt);
    { const wsp = weather.wind * 1.6 + weather.gust * 2.2 + stormK * 3; windVec.set(Math.cos(weather.ang) * wsp, Math.sin(weather.ang) * wsp); weather.windOff.addScaledVector(windVec, dt); weather.fallOff += dt * (1.1 + weather.gust * .4 + stormK); }
    stormMat.uniforms.time.value = tAll; stormMat.uniforms.col.value.copy(scene.fog.color);
    weapon.cam.fov = camera.fov; weapon.cam.updateProjectionMatrix();
    // снег
    if (rainLines) { const u = rainLines.material.uniforms; u.fall.value = tAll * 9; u.wind.value.set(windVec.x, windVec.y); u.origin.value.copy(camera.position); u.amount.value = weather.rain; u.light.value = .35 + (1 - nightK) * .65; rainLines.visible = weather.rain > .02; }
    if (puddles) { puddles.visible = weather.wet > .03; if (puddles.visible) { if (Math.abs((puddles.userData.wet || 0) - weather.wet) > .02) setPuddles(weather.wet); cubeT -= dt; if (cubeT <= 0) { cubeT = 4; puddles.visible = false; cubeCam.position.set(camera.position.x, .1, camera.position.z); cubeCam.update(renderer, scene); puddles.visible = true; } } }
    { const wt = weather.wet; roadS.material.roughness = 1 - wt * .55; walkS.material.roughness = 1 - wt * .5; roadS.material.color.setScalar(1 - wt * .35); walkS.material.color.set(0xb8b4ac).multiplyScalar(1 - wt * .3); }
    if (snowPts) { const u = snowPts.material.uniforms; u.time.value = tAll; u.origin.value.copy(camera.position); u.windOff.value.copy(weather.windOff); u.fallOff.value = weather.fallOff; u.swirl.value = weather.wind * .6 + weather.gust; u.density.value = Math.max(weather.snow, stormK); snowPts.visible = winter && (weather.snow > .03 || stormK > .05); u.scale.value = window.innerHeight * DPR * .035; }
    sky.position.copy(camera.position); skyMat.uniforms.t.value = tAll;
    const bulbFlicker = 1 + Math.sin(tAll * 31) * .008 + Math.sin(tAll * 73) * .004;
    kioskSpot.intensity = (1.75 + nightK * 0.65) * bulbFlicker;
    bulbLight.intensity = (0.58 + nightK * 0.25) * bulbFlicker;
    ceilingBounce.intensity = (0.62 + nightK * 0.18) * bulbFlicker;
    kioskSpot.castShadow = renderer.shadowMap.enabled; // постоянно: переключение меняло набор шейдеров и вызывало перекомпиляцию всех материалов
    bulbLight.castShadow = false;
    // звук
    ctx.audio && ctx.audio.update({ camera, radioPos, inside, doorOpen, wind: Math.min(1.5, (winter ? weather.wind : weather.wind * .4) + weather.gust * .5 + stormK), night: nightK > .6, rain: weather.rain });
    // контекстная кнопка
    actT -= dt; if (actT <= 0) { actT = .15; curAct = action(); const l = curAct ? curAct.label : ''; if (l !== lastActLabel) { lastActLabel = l; ctx.onCtl(); } }
    // рендер
    post.uniforms.time.value = tAll;
    renderer.info.reset(); renderer.info.autoReset = false;
    renderer.setRenderTarget(rt); renderer.render(scene, camera);
    if (weapon.state !== 'holstered' || life.habit.busy || life.fx.handOut) {
      if (weapon.lights) {
        const L = weapon.lights, invQ = camera.quaternion.clone().invert();
        const bPos = bulbLight.position.clone().sub(camera.position), bDist = bPos.length();
        let locInt = 0;
        if (inside) {
          // Внутри ларька: приглушённый тёплый свет лампочки сверху
          L.hemi.color.set(0x8a6d52);
          L.hemi.groundColor.set(0x3e2a18);
          L.hemi.intensity = 0.82;
          L.key.color.set(0xffa23e);
          L.key.intensity = 1.05;
          L.key.position.set(0, 1.8, 0.3).applyQuaternion(invQ);
          L.localLight.color.set(0xffa23e);
          L.localLight.intensity = 0.78;
          L.localLight.position.set(0, 0.8, -0.2);
          L.localLight.distance = 4.0;
        } else {
          L.hemi.color.copy(hemi.color); L.hemi.groundColor.copy(hemi.groundColor);
          L.hemi.intensity = Math.max(.34, hemi.intensity * .90);
          const sDir = sun.position.clone().sub(sun.target.position).normalize().applyQuaternion(invQ);
          if (sun.intensity > .05) {
            L.key.color.copy(sun.color); L.key.intensity = sun.intensity * .85; L.key.position.copy(sDir);
          } else {
            L.key.color.copy(hemi.color); L.key.intensity = Math.max(.28, hemi.intensity * .65); L.key.position.set(-.3, 1, .4).applyQuaternion(invQ);
          }
          if (bDist < 6.5) {
            const wK = clamp(1 - (bDist - 1.2) / 5.0, 0, .75);
            locInt = bulbLight.intensity * .42 * wK;
            L.localLight.color.copy(bulbLight.color);
            L.localLight.position.copy(bPos.applyQuaternion(invQ));
            L.localLight.distance = 6.5;
          }
        }
        if (nightK > .35 && !inside && streetLights.length) {
          let bestD = 999, bestL = null;
          for (const sl of streetLights) { const d = sl.position.distanceTo(camera.position); if (d < bestD) { bestD = d; bestL = sl; } }
          if (bestL && bestD < 14) {
            const slI = (1 - bestD / 14) * 2.2 * nightK;
            if (slI > locInt) {
              locInt = slI;
              L.localLight.color.copy(bestL.color);
              L.localLight.position.copy(bestL.position).sub(camera.position).applyQuaternion(invQ);
              L.localLight.distance = 14;
            }
          }
        }
        if (flashlight.intensity > 0) {
          locInt = Math.max(locInt, 1.1);
          L.localLight.color.set(0xfff4e0);
          L.localLight.position.set(.1, -.05, -.6);
        }
        L.localLight.intensity = locInt;
        // Передаём текущую яркость и оттенок освещения для дыма, чтобы он не светился белым в темноте
        if (life.setEnvLight) {
          const ambLum = clamp(hemi.intensity * .7 + sun.intensity * .35 + locInt * .25, .18, 1.0);
          life.setEnvLight(hemi.color, bulbLight.color, inside ? .6 : clamp(locInt * .25, 0, .5), ambLum);
        }
      }
      renderer.autoClear = false; renderer.clearDepth(); renderer.render(weapon.scene, weapon.cam); renderer.autoClear = true;
    }
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
    const _t3 = performance.now(); TIM.cars = _t1 - _t0; TIM.people = _t2 - _t1; TIM.rest = _t3 - _t2;
  }
  const TIM = {};
  // ---------- выхлоп: лёгкий дымок из труб машин и автобуса (одна система частиц — один вызов отрисовки) ----------
  const SMOKE_N = LITE ? 48 : 96;
  const smokeGeo = new THREE.BufferGeometry(); const smP = new Float32Array(SMOKE_N * 3), smA = new Float32Array(SMOKE_N * 2);
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smP, 3)); smokeGeo.setAttribute('ls', new THREE.BufferAttribute(smA, 2));
  const smokeMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { col: { value: new THREE.Color(0xb8b8b4) }, light: { value: 1 }, scale: { value: 300 } },
    vertexShader: 'attribute vec2 ls; varying float vA; uniform float scale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vA = ls.y; gl_PointSize = ls.x * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 col; uniform float light; varying float vA; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d, d) * 4.; if (r > 1.) discard; gl_FragColor = vec4(col * light, vA * (1. - r) * (1. - r)); }' });
  const smoke = new THREE.Points(smokeGeo, smokeMat); smoke.frustumCulled = false; smoke.renderOrder = 3; scene.add(smoke);
  const smk = Array.from({ length: SMOKE_N }, () => ({ life: 0, max: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, s: .2 })); let smkI = 0;
  function puff(x, y, z, vx, vz, strength = 1) { const p = smk[smkI]; smkI = (smkI + 1) % SMOKE_N; Object.assign(p, { life: 0, max: R(1.4, 2.2), x, y, z, vx: vx * .3 + R(-.15, .15), vy: R(.25, .45), vz: vz * .3 + R(-.15, .15), s: R(.18, .28), k: strength }); }
  const exT = new Map();
  function exhaustTick(dt) {
    { const far = LITE ? 75 : 115; for (const g of forestCells) g.visible = Math.abs(g.userData.cx - P.x) < far; } // лес — только ближние участки
    const emit = (id, x, y, z, v, hd, rate) => { // пыхтит сильнее на холостом/при разгоне, но всё равно едва заметно
      let t = (exT.get(id) || 0) - dt; if (Math.hypot(x - P.x, z - P.z) > 45) { exT.set(id, t); return; }
      if (t <= 0) { puff(x, y, z, -Math.cos(hd) * Math.min(v, 6) * .3, Math.sin(hd) * Math.min(v, 6) * .3, winter ? 1.3 : .8); t = 1 / rate * (LITE ? 1.6 : 1); } exT.set(id, t); };
    for (const c of cars) { const hd = c.m.rotation.y, ex = c.m.position.x - Math.cos(hd) * 2.05 - Math.sin(hd) * -.45, ez = c.m.position.z + Math.sin(hd) * 2.05 + Math.cos(hd) * -.45; emit(c.id, ex, .28, ez, c.v, hd, c.v < 1 ? 2.2 : 3.2); }
    if (transport.exhaust) { const e = transport.exhaust(); emit('bus', e.pos.x, e.pos.y, e.pos.z, e.v, e.heading, e.v < 1 ? 3 : 4.5); }
    for (let i = 0; i < SMOKE_N; i++) { const p = smk[i]; if (p.y < -50) { smP[i * 3 + 1] = -99; smA[i * 2 + 1] = 0; continue; }
      p.life += dt; const k = p.life / p.max; if (k >= 1) { p.y = -99; smA[i * 2 + 1] = 0; smP[i * 3 + 1] = -99; continue; }
      p.x += (p.vx + windVec.x * .25) * dt; p.y += p.vy * dt; p.z += (p.vz + windVec.y * .25) * dt; p.vx *= .97; p.vz *= .97;
      smP[i * 3] = p.x; smP[i * 3 + 1] = p.y; smP[i * 3 + 2] = p.z; smA[i * 2] = p.s * (1 + k * 3.2); smA[i * 2 + 1] = .16 * p.k * Math.min(1, k * 6) * (1 - k); }
    smokeGeo.attributes.position.needsUpdate = true; smokeGeo.attributes.ls.needsUpdate = true;
    smokeMat.uniforms.light.value = .35 + (1 - nightK) * .65; smokeMat.uniforms.scale.value = renderer.domElement.height * .9;
  }
  function carsTick(dt) {
    const need = { low: 2, medium: 3, high: 4, max: 5 }[ctx.settings().quality] || 3;
    while (cars.length < need) { // новая машина — не ближе 15 м к другим
      const ri = cars.length % 2; let s0 = R(0, 400);
      for (let k = 0; k < 20; k++) { const [x0, z0] = routePoint(ROUTES[ri], s0); if (cars.every(o => Math.hypot(o.m.position.x - x0, o.m.position.z - z0) > 15)) break; s0 = R(0, 400); }
      addCar(ri, s0, CAR_COLORS[cars.length % CAR_COLORS.length]); const nc = cars[cars.length - 1]; const [x1, z1] = routePoint(ROUTES[ri], s0); nc.m.position.set(x1, 0, z1); }
    for (const c of cars) {
      const route = ROUTES[c.ri];
      const [x, z, total] = routePoint(route, c.s), [ax, az] = routePoint(route, c.s + 2.5);
      const dirx = ax - x, dirz = az - z, dl = Math.hypot(dirx, dirz) || 1;
      // препятствия впереди: другие машины, игрок, пешеходы на дороге
      let block = 99;
      const ahead = (px, pz) => { const vx = px - x, vz = pz - z, al = (vx * dirx + vz * dirz) / dl, lat = Math.abs(vx * dirz - vz * dirx) / dl; return al > 0 && lat < 1.6 ? al : 99; };
      // машины впереди — любые (маршруты делят одни полосы), а не только со своего маршрута; вплотную — стоп
      for (const o of cars) if (o !== c) { const a = ahead(o.m.position.x, o.m.position.z); if (a < 14) block = Math.min(block, a - 5.2); }
      { const bo = transport.obstacle(), ba = ahead(bo.x, bo.z); if (ba < 18) block = Math.min(block, ba - 8); }
      const pAhead = ahead(P.x, P.z); if (pAhead < 9) { block = Math.min(block, pAhead - 2.6); if (c.honk <= 0 && c.v > 3) { ctx.audio && ctx.audio.horn(c.m.position); c.honk = 4; } }
      for (const p of people) { const a = ahead(p.h.obj.position.x, p.h.obj.position.z); if (a < 10) block = Math.min(block, a - 3); }
      c.honk -= dt;
      const want = block < 99 ? clamp(block * 1.1, 0, c.vmax) : c.vmax;
      // поворот — сбросить скорость
      const [bx, bz] = routePoint(route, c.s + 9), turn = Math.abs(Math.atan2(bz - az, bx - ax) - Math.atan2(dirz, dirx)); const curve = Math.min(Math.PI, turn > Math.PI ? 2 * Math.PI - turn : turn);
      const target = Math.min(want, curve > .3 ? 5 : c.vmax);
      c.v += clamp(target - c.v, -9 * dt, 2.2 * dt); // торможение резче разгона
      if (block < .5) c.v = Math.min(c.v, Math.max(0, block) * 2); // упёрся — не въезжать в машину впереди
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
    post.uniforms.hurt.value = 1; c.v *= .3; ctx.audio && ctx.audio.thud(1.2); ctx.audio && ctx.audio.horn(c.m.position);
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
  const pend = e => {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (!p) return;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 10 && performance.now() - p.t < 400) {
      if ((transport.onBoard || transport.doorK > .45) && !transport.seated && transport.lookedSeat) {
        const ndcX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
        const ndcY = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
        const s = transport.lookedSeat(ndcX, ndcY, 2.8) || transport.lookedSeat(0, 0, 2.6);
        if (s) { transport.sitOnSeat(s); return; }
      }
      if (e.pointerType === 'mouse' && e.button === 0 && weapon.drawn) weapon.fire();
    }
  };
  cvs.addEventListener('pointerup', pend); cvs.addEventListener('pointercancel', pend);
  cvs.addEventListener('contextmenu', e => { e.preventDefault(); });
  cvs.addEventListener('mousedown', e => { if (e.button === 2) weapon.aim(true); });
  cvs.addEventListener('mouseup', e => { if (e.button === 2) weapon.aim(false); });
  function look(dx, dy, kind) { if (P.stun > 0) return; const s = (kind === 'mouse' ? .0032 : .0052) * (1 - weapon.aimK * .45); P.yaw -= dx * s; P.pitch = clamp(P.pitch - dy * s, -1.35, 1.25); }

  setClock(18.2); resize();
  return {
    scene, frame, updateShelves, goCounter, sit, stand, nearMarket, nearBooth, P, weapon, loading, punch, startGopBrawl,
    action: () => curAct, isNight: () => nightK > .45, canMove, inKiosk, toggleDoor, look, applyQuality, spawnCustomer, customerEvent,
    move(x, y) { input.mx = x; input.my = y; }, nearDoor() { return Math.hypot(P.x - .8, P.z + KD) < 2.2; }, setSprint(v) { P.sprint = v; }, toggleCrouch() { if (transport.seated) { transport.standFromSeat(); return; } if (!P.seated) P.crouch = !P.crouch; }, get crouch() { return P.crouch; }, get sprint() { return P.sprint; },
    unlock() { P.locked = false; ctx.onCtl(); },
    toggleFlashlight() { flashlight.intensity = 0; return false; }, get flashlightOn() { return false; },
    radioNear() { return inKiosk(); },
    gopLeave, get gopnik() { return gopnikGroup; },
    get hour() { return hour; }, get doorOpen() { return doorOpen; },
    reset() {
      life.loadItems();
      const S0 = ctx.getS();
      if (S0) {
        S0.gunState = S0.gunState || 'wall';
        if (S0.gunState === 'world' && !life.items.some(i => i.kind === 'gun')) {
          S0.gunState = 'wall';
        }
        S0.gun = S0.gunState === 'carried';
        if (!S0.gun && weapon.forceHolster) weapon.forceHolster();
        life.setButts(S0.butts || 0);
      }
      P.x = STOOL.x; P.z = -.25; P.yaw = Math.PI; P.pitch = -.08; P.seated = false; P.locked = false; P.crouch = false; P.vx = P.vz = 0; shelfSig = ''; season = -1; hour = 8; doorTarget = 0; people.slice().forEach(p => { if (p.role !== 'vendor' && p.role !== 'marat' && p.role !== 'zavod') removePerson(p); }); gopnikGroup = null; },
    transport, life, env2, gunState, setGunState, openNotepadAnim: f => life.openNotepad(f), closeNotepadAnim: f => life.closeNotepad(f),
    spawnFactoryBox(contents, label = '«КРАСНОЗАВОДСК · СБЫТ»') {
      const existing = life.items.filter(i => i.kind === 'box' && Math.hypot(i.obj.position.x - (-105.6), i.obj.position.z - (-2.6)) < 2.5).length;
      const col = existing % 3, row = Math.floor(existing / 3);
      const bx = -334.8 + col * .58, bz = -2.2 + row * .52;
      const it = life.addItem({ kind: 'box', x: bx, y: 0, z: bz, ry: R(-.2, .2), data: { contents, hidden: false, label, opened: false } });
      return it;
    },
    putGunDown() {
      if (gunState() !== 'carried' || life.habit.busy || life.held) return;
      setGunState('world');
      const gx = P.x - Math.sin(P.yaw) * .35;
      const gz = P.z - Math.cos(P.yaw) * .35;
      const gy = Math.max(.1, camera.position.y - .25);
      const it = life.addItem({ kind: 'gun', x: gx, y: gy, z: gz, ry: P.yaw });
      life.pick(it);
      life.persist && life.persist();
      ctx.save && ctx.save();
      ctx.onCtl && ctx.onCtl();
    },
    batchInfo, renderInfo() { const i = renderer.info; let tris = 0; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, progs: (i.programs || []).length, lights: scene.children.filter(o => o.isLight).length }; },
    triStats() { const out = {}; scene.traverse(o => { if (!o.isMesh || !o.visible) return; const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); let k = o.name || o.material && (Array.isArray(o.material) ? o.material[0].name : o.material.name) || o.geometry.type; let p = o; while (p.parent && p.parent !== scene) p = p.parent; k = (p.userData.tag || p.name || p.type) + '/' + k; out[k] = (out[k] || 0) + t; }); return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => k + ':' + Math.round(v)); },
    setRetro(v) { post.uniforms.retro.value = v ? 1 : 0; },
    gpu: () => ({ name: GPU, lite: LITE }),
    debug: { renderer, spawnPed: () => { const p = newPerson(pick(["worker", "youth", "neighbor", "babka"]), "ped", "s5"); return p; }, spawnKind: (k, node = "s5") => newPerson(k, "ped", node), TIM, people, cars, carGroups, weather, colliders, NODES, visibleFromPlayer, spawnGopniks, get gop() { return gopnikGroup; } },
  };
}
