// Пространственный звук: радио, город, ветер, шаги, машины, оружие.
// Всё идёт через один AudioContext; слушатель — камера игрока.
import * as THREE from 'three';

// Начала отдельных шагов в записях (секунды) — найдены анализом огибающей (см. tools/asset-pipeline)
const STEPS = {
  walk: [0.14, 0.84, 1.55, 2.23, 2.94, 3.61, 4.26, 4.93, 5.6, 6.28, 6.97, 7.65, 8.38, 9.06],
  snow: [0.2, 1.41, 2.57, 4.07, 4.37, 4.74, 5.51, 6.2, 6.84],
};

export function createAudio() {
  let ctx = null, master, sfxBus, ambBus;
  const st = { master: .9, radio: .7, ambience: .6, radioOn: true, ready: false, muted: false };
  const buffers = {};
  let rainSrc, rainFilter, rainGain, roofSrc, roofGain;
  let radioEl, radioSrc, radioGain, radioFilter, radioPanner, cityEl, citySrc, cityGain, cityFilter, windGain, windFilter, windSrc;
  const tmpV = new THREE.Vector3(), tmpF = new THREE.Vector3(), tmpU = new THREE.Vector3();
  const cars = new Map();

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = st.muted ? 0 : st.master; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = st.ambience; ambBus.connect(master);
    // шаги
    for (const [k, url] of [['walk', 'assets/audio/walk.mp3'], ['snow', 'assets/audio/walk_snow.mp3'], ...['shot', 'gun_open', 'gun_shell', 'gun_shell2', 'gun_close', 'shell_drop', 'gun_move', 'stuk', 'dostavka', 'horn'].map(n => [n, 'assets/audio/' + n + '.mp3'])])
      fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { buffers[k] = b; }).catch(e => console.warn('audio', url, e));
    // радио — потоковый <audio>, подключённый в граф (панорама + фильтр)
    radioEl = new Audio('assets/audio/radio.mp3'); radioEl.loop = true; radioEl.preload = 'auto'; radioEl.crossOrigin = 'anonymous';
    radioEl.currentTime = 0;
    radioSrc = ctx.createMediaElementSource(radioEl);
    radioFilter = ctx.createBiquadFilter(); radioFilter.type = 'lowpass'; radioFilter.frequency.value = 18000;
    radioGain = ctx.createGain(); radioGain.gain.value = 0;
    radioPanner = ctx.createPanner(); Object.assign(radioPanner, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: .8, rolloffFactor: 1.6, maxDistance: 60 });
    radioSrc.connect(radioFilter); radioFilter.connect(radioGain); radioGain.connect(radioPanner); radioPanner.connect(master);
    // город
    cityEl = new Audio('assets/audio/city.mp3'); cityEl.loop = true; cityEl.crossOrigin = 'anonymous';
    citySrc = ctx.createMediaElementSource(cityEl);
    cityFilter = ctx.createBiquadFilter(); cityFilter.type = 'lowpass'; cityFilter.frequency.value = 16000;
    cityGain = ctx.createGain(); cityGain.gain.value = .35;
    citySrc.connect(cityFilter); cityFilter.connect(cityGain); cityGain.connect(ambBus);
    // ветер — отфильтрованный шум
    const len = ctx.sampleRate * 4, nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = last * .985 + (Math.random() * 2 - 1) * .015; d[i] = last * 6; }
    windSrc = ctx.createBufferSource(); windSrc.buffer = nb; windSrc.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = .6;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(ambBus); windSrc.start();
    // дождь: шум по асфальту (высокие) + капли по крыше ларька (низкие, слышнее внутри)
    rainSrc = ctx.createBufferSource(); rainSrc.buffer = nb; rainSrc.loop = true; rainSrc.playbackRate.value = 1.3; rainFilter = ctx.createBiquadFilter(); rainFilter.type = 'highpass'; rainFilter.frequency.value = 1400; rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rainSrc.connect(rainFilter); rainFilter.connect(rainGain); rainGain.connect(ambBus); rainSrc.start();
    roofSrc = ctx.createBufferSource(); roofSrc.buffer = nb; roofSrc.loop = true; roofSrc.playbackRate.value = .7; const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 900; rf.Q.value = 1.2; roofGain = ctx.createGain(); roofGain.gain.value = 0;
    roofSrc.connect(rf); rf.connect(roofGain); roofGain.connect(ambBus); roofSrc.start();
    cityEl.play().catch(() => {});
    if (st.radioOn) radioEl.play().catch(() => {});
    st.ready = true;
    return ctx;
  }

  // ---- вызывается каждый кадр ----
  // env: { camera, radioPos, inside, doorOpen (0..1), outside wind 0..1, night }
  function update(env) {
    if (!ctx) return;
    const t = ctx.currentTime, cam = env.camera;
    cam.getWorldPosition(tmpV); cam.getWorldDirection(tmpF); tmpU.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const L = ctx.listener;
    if (L.positionX) { L.positionX.setTargetAtTime(tmpV.x, t, .03); L.positionY.setTargetAtTime(tmpV.y, t, .03); L.positionZ.setTargetAtTime(tmpV.z, t, .03);
      L.forwardX.setTargetAtTime(tmpF.x, t, .03); L.forwardY.setTargetAtTime(tmpF.y, t, .03); L.forwardZ.setTargetAtTime(tmpF.z, t, .03);
      L.upX.setTargetAtTime(tmpU.x, t, .03); L.upY.setTargetAtTime(tmpU.y, t, .03); L.upZ.setTargetAtTime(tmpU.z, t, .03); }
    else { L.setPosition(tmpV.x, tmpV.y, tmpV.z); L.setOrientation(tmpF.x, tmpF.y, tmpF.z, tmpU.x, tmpU.y, tmpU.z); }
    // радио: источник в ларьке; снаружи — сквозь стены (низкие частоты), сильнее глушится закрытой дверью
    if (radioPanner) {
      const p = env.radioPos; if (radioPanner.positionX) { radioPanner.positionX.value = p.x; radioPanner.positionY.value = p.y; radioPanner.positionZ.value = p.z; } else radioPanner.setPosition(p.x, p.y, p.z);
      const through = env.inside ? 1 : (.18 + .5 * env.doorOpen);
      const cut = env.inside ? 16000 : 600 + 4000 * env.doorOpen;
      radioFilter.frequency.setTargetAtTime(cut, t, .15);
      radioGain.gain.setTargetAtTime(st.radioOn ? st.radio * through : 0, t, .12);
    }
    if (cityGain) {
      const inside = env.inside ? (.25 + .45 * env.doorOpen) : 1;
      cityGain.gain.setTargetAtTime(.4 * inside * (env.night ? .6 : 1), t, .3);
      cityFilter.frequency.setTargetAtTime(env.inside ? 900 + 5000 * env.doorOpen : 16000, t, .2);
      const w = env.wind * (env.inside ? .15 + .4 * env.doorOpen : 1);
      windGain.gain.setTargetAtTime(.05 + w * .22, t, .5);
      const rn = env.rain || 0; if (rainGain) { rainGain.gain.setTargetAtTime(rn * (env.inside ? .05 + .25 * env.doorOpen : .32), t, .8); roofGain.gain.setTargetAtTime(rn * (env.inside ? .5 : .08), t, .8); }
      windFilter.frequency.setTargetAtTime(350 + w * 500 + Math.sin(t * .3) * 120, t, .5);
    }
    for (const [id, c] of cars) if (c.panner) {
      const p = c.pos; if (c.panner.positionX) { c.panner.positionX.value = p.x; c.panner.positionY.value = .6; c.panner.positionZ.value = p.z; } else c.panner.setPosition(p.x, .6, p.z);
      c.osc.frequency.setTargetAtTime(32 + c.speed * 4.5, t, .1); c.osc2.frequency.setTargetAtTime(64 + c.speed * 9, t, .1);
      c.gain.gain.setTargetAtTime((.05 + c.speed * .012) * (env.inside ? .35 + .5 * env.doorOpen : 1), t, .1);
    }
  }

  // ---- шаги: свой тембр и акустический отклик для каждой поверхности (снег, тропинка/тротуар, асфальт, дерево, пол автобуса, металл, коробка) ----
  let lastStepI = -1;
  function step(surface, speed, inside) {
    if (!ctx || st.muted) return;
    const t = ctx.currentTime;
    const volMul = (.78 + Math.random() * .3) * (speed > 3 ? 1.2 : 1);
    const key = surface === 'snow' ? 'snow' : 'walk';
    const b = buffers[key];
    if (b) {
      const list = STEPS[key];
      let i; do i = Math.floor(Math.random() * list.length); while (i === lastStepI && list.length > 1); lastStepI = i;
      const src = ctx.createBufferSource(); src.buffer = b;
      const rateBase = surface === 'wood' ? .78 : surface === 'bus' ? .84 : surface === 'box' ? .74 : surface === 'path' ? 1.04 : surface === 'metal' ? 1.12 : .94;
      src.playbackRate.value = rateBase + (Math.random() - .5) * .14 + (speed > 3 ? .06 : 0);
      const g = ctx.createGain();
      const baseGain = surface === 'snow' ? .78 : surface === 'wood' ? .48 : surface === 'bus' ? .50 : surface === 'box' ? .42 : surface === 'path' ? .62 : .56;
      g.gain.value = baseGain * volMul * (inside ? .85 : 1);
      const f = ctx.createBiquadFilter();
      f.type = surface === 'path' || surface === 'metal' ? 'bandpass' : 'lowpass';
      f.frequency.value = surface === 'wood' ? 1800 : surface === 'bus' ? 2200 : surface === 'box' ? 1400 : surface === 'path' ? 2400 : surface === 'metal' ? 3200 : 5200 + Math.random() * 3000;
      if (f.type === 'bandpass') f.Q.value = .75;
      src.connect(f); f.connect(g); g.connect(sfxBus);
      src.start(t, list[i], .38); g.gain.setTargetAtTime(0, t + .26, .04);
    }
    // Дополнительный характерный физический слой для конкретного материала под ногами
    if (surface === 'wood') {
      // Глухой деревянный стук половых досок
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(155 + Math.random() * 35, t);
      o.frequency.exponentialRampToValueAtTime(68, t + .09);
      og.gain.setValueAtTime(.22 * volMul, t); og.gain.exponentialRampToValueAtTime(.001, t + .10);
      o.connect(og); og.connect(sfxBus); o.start(t); o.stop(t + .11);
    } else if (surface === 'bus') {
      // Упругий шаг по резиновому коврику и металлическому полу салона ПАЗика
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(210 + Math.random() * 40, t);
      o.frequency.exponentialRampToValueAtTime(95, t + .08);
      og.gain.setValueAtTime(.20 * volMul, t); og.gain.exponentialRampToValueAtTime(.001, t + .09);
      o.connect(og); og.connect(sfxBus); o.start(t); o.stop(t + .10);
    } else if (surface === 'metal') {
      // Звонкий металлический лязг чугунной решётки ливнёвки
      for (const fq of [880, 1340]) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(fq + (Math.random() - .5) * 90, t);
        o.frequency.exponentialRampToValueAtTime(fq * .65, t + .11);
        og.gain.setValueAtTime(.14 * volMul, t); og.gain.exponentialRampToValueAtTime(.001, t + .12);
        o.connect(og); og.connect(sfxBus); o.start(t); o.stop(t + .13);
      }
    } else if (surface === 'box') {
      // Сухой картонный прогиб и шорох коробки
      const n = ctx.createBufferSource(); n.buffer = noiseBuf(.12, 3.2);
      const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 620 + Math.random() * 180; bf.Q.value = 1.8;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(.28 * volMul, t); ng.gain.exponentialRampToValueAtTime(.001, t + .12);
      n.connect(bf); bf.connect(ng); ng.connect(sfxBus); n.start(t);
    } else if (surface === 'path') {
      // Чёткий сухой щелчок подошвы и гравия по расчищенной тропинке / бетонному тротуару
      const n = ctx.createBufferSource(); n.buffer = noiseBuf(.065, 4.5);
      const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1950 + Math.random() * 450; bf.Q.value = 1.4;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(.22 * volMul, t); ng.gain.exponentialRampToValueAtTime(.001, t + .065);
      n.connect(bf); bf.connect(ng); ng.connect(sfxBus); n.start(t);
    } else if (surface === 'wet') {
      // Лёгкий плеск воды по мокрому асфальту/луже
      const n = ctx.createBufferSource(); n.buffer = noiseBuf(.14, 3.0);
      const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 3100 + Math.random() * 600; bf.Q.value = 1.1;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(.20 * volMul, t); ng.gain.exponentialRampToValueAtTime(.001, t + .14);
      n.connect(bf); bf.connect(ng); ng.connect(sfxBus); n.start(t);
    }
  }

  // ---- синтез: выстрел, перезарядка, удары ----
  function noiseBuf(dur, decay) {
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    return b;
  }
  // сэмпл из файла; pos — точка в мире (объёмный звук через HRTF), иначе — «в голове» игрока
  function sample(name, vol = 1, pos = null, rate = 1) {
    if (!ensure() || !buffers[name]) return null; const s = ctx.createBufferSource(); s.buffer = buffers[name]; s.playbackRate.value = rate; const g = ctx.createGain(); g.gain.value = vol; s.connect(g);
    if (pos) { const p = ctx.createPanner(); Object.assign(p, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1.2, rolloffFactor: 1.2, maxDistance: 80 }); if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z); g.connect(p); p.connect(sfxBus); } else g.connect(sfxBus);
    s.start(); return { start: ctx.currentTime, dur: s.buffer.duration / rate };
  }
  function shot() {
    if (!ensure()) return; if (buffers.shot) { sample('shot', 1.25, null, .97 + Math.random() * .06); return; } const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = noiseBuf(1.4, 3.5);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(9000, t); f.frequency.exponentialRampToValueAtTime(300, t + .9);
    const g = ctx.createGain(); g.gain.setValueAtTime(1.6, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.4);
    n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(35, t + .25);
    const og = ctx.createGain(); og.gain.setValueAtTime(1.4, t); og.gain.exponentialRampToValueAtTime(.001, t + .35);
    o.connect(og); og.connect(sfxBus); o.start(t); o.stop(t + .4);
    // эхо от домов
    const e = ctx.createBufferSource(); e.buffer = noiseBuf(1.2, 4); const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 900;
    const eg = ctx.createGain(); eg.gain.value = .35; e.connect(ef); ef.connect(eg); eg.connect(sfxBus); e.start(t + .28);
  }
  function click(freq = 2400, vol = .5, delay = 0, dur = .03) {
    if (!ensure()) return; const t = ctx.currentTime + delay;
    const n = ctx.createBufferSource(); n.buffer = noiseBuf(dur, 2); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 3;
    const g = ctx.createGain(); g.gain.value = vol; n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t);
  }
  let shellAlt = 0;
  const reloadOpen = () => { if (!sample('gun_open', 1)) { click(1800, .7); click(900, .5, .05, .06); } };
  const shellOut = () => { if (!sample('shell_drop', .8, null, .95 + Math.random() * .1)) { click(3200, .35); click(4200, .25, .12); } };
  const shellIn = () => { if (!sample((shellAlt++ % 2) ? 'gun_shell2' : 'gun_shell', 1)) click(1500, .5, 0, .04); };
  const reloadClose = () => { if (!sample('gun_close', 1)) { click(1200, .9, 0, .05); click(600, .6, .03, .08); } };
  const gunMove = () => sample('gun_move', .8, null, .9 + Math.random() * .2);
  function thud(vol = 1) {
    if (!ensure()) return; const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + .3);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .4); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + .45);
    const n = ctx.createBufferSource(); n.buffer = noiseBuf(.25, 3); const ng = ctx.createGain(); ng.gain.value = vol * .6; n.connect(ng); ng.connect(sfxBus); n.start(t);
  }
  function horn(pos = null, vol = 1) {
    // клаксон из файла пользователя (машины и автобус); пока файл не загрузился — прежний синтезированный сигнал
    if (sample('horn', .9 * vol, pos && pos.isVector3 ? pos : null, .97 + Math.random() * .06)) return;
    if (!ensure()) return; const t = ctx.currentTime;
    for (const fr of [392, 494]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; const g = ctx.createGain(); g.gain.setValueAtTime(.06, t); g.gain.setValueAtTime(.06, t + .45); g.gain.exponentialRampToValueAtTime(.001, t + .55); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + .6); }
  }
  function door(open) { if (!ensure()) return; click(open ? 700 : 400, .5, 0, .08); click(open ? 1400 : 250, .3, .08, .1); }

  // ---- телефон (советская сеть: 425 Гц) и бытовые звуки ----
  let toneNode = null;
  function tone425(on, pattern) { if (!ensure()) return; if (toneNode) { try { toneNode.o.stop(); } catch (e) {} toneNode = null; } if (!on) return;
    const o = ctx.createOscillator(); o.frequency.value = 425; const g = ctx.createGain(); g.gain.value = 0; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = .5;
    o.connect(g); g.connect(f); f.connect(sfxBus); o.start(); const t = ctx.currentTime;
    if (pattern === 'ring') { for (let i = 0; i < 6; i++) { g.gain.setValueAtTime(.07, t + i * 5); g.gain.setValueAtTime(0, t + i * 5 + 1); } }
    else if (pattern === 'busy') { for (let i = 0; i < 6; i++) { g.gain.setValueAtTime(.07, t + i * .7); g.gain.setValueAtTime(0, t + i * .7 + .35); } }
    else g.gain.setValueAtTime(.06, t);
    toneNode = { o, g }; }
  function dialClicks(n) { if (!ensure()) return; for (let i = 0; i < n; i++) click(500, .35, i * .1, .02); }
  function knock() { if (!ensure()) return; const t = ctx.currentTime; for (let i = 0; i < 1; i++) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(60, t + .12); const g = ctx.createGain(); g.gain.setValueAtTime(.9, t); g.gain.exponentialRampToValueAtTime(.001, t + .18); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + .2); } click(300, .6, 0, .05); }
  function gulp() { if (!ensure()) return; for (let i = 0; i < 3; i++) { const t = ctx.currentTime + i * .38; const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(140, t + .12); const g = ctx.createGain(); g.gain.setValueAtTime(.25, t); g.gain.exponentialRampToValueAtTime(.001, t + .15); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + .16); } }

  // ---- моторы машин ----
  function addCar(id) {
    if (!ctx || cars.has(id)) return;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; const osc2 = ctx.createOscillator(); osc2.type = 'triangle';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const panner = ctx.createPanner(); Object.assign(panner, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 4, rolloffFactor: 1.4, maxDistance: 120 });
    osc.connect(f); osc2.connect(f); f.connect(gain); gain.connect(panner); panner.connect(ambBus); osc.start(); osc2.start();
    cars.set(id, { osc, osc2, gain, panner, pos: { x: 0, z: 0 }, speed: 0 });
  }
  function carState(id, x, z, speed) { const c = cars.get(id); if (c) { c.pos.x = x; c.pos.z = z; c.speed = speed; } else if (ctx) addCar(id); }

  return {
    ensure, update, step, shot, click, sample, gunMove, now: () => ctx ? ctx.currentTime : 0, tone425, dialClicks, knock, gulp, reloadOpen, shellOut, shellIn, reloadClose, thud, horn, door, carState,
    get settings() { return st; },
    setVolume(k, v) { st[k] = v; if (k === 'master' && master) master.gain.value = st.muted ? 0 : v; if (k === 'ambience' && ambBus) ambBus.gain.value = v; },
    setMuted(m) { st.muted = m; if (master) master.gain.value = m ? 0 : st.master; },
    radioToggle(on) { st.radioOn = on === undefined ? !st.radioOn : on; if (radioEl) { if (st.radioOn) radioEl.play().catch(() => {}); else radioEl.pause(); } return st.radioOn; },
    get radioOn() { return st.radioOn; },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
  };
}
