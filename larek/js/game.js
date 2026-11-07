import { createWorld, QUALITY } from './world.js';
import { createAudio } from './audio.js';
import { createControls } from './controls.js';

(() => {
'use strict';

// ============================================================
//  Утилиты
// ============================================================
const $ = s => document.querySelector(s);
const R = (a, b) => a + Math.random() * (b - a);
const RI = (a, b) => Math.floor(R(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => Math.round(n).toLocaleString('ru-RU');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function wpick(obj) {
  let tot = 0; for (const k in obj) tot += obj[k];
  let r = Math.random() * tot;
  for (const k in obj) { r -= obj[k]; if (r <= 0) return k; }
  return Object.keys(obj)[0];
}
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const yearOf = d => 1992 + Math.floor((d - 1) / 12);
const monthOf = d => (d - 1) % 12;
const dateStr = d => MONTHS[monthOf(d)] + ' ' + yearOf(d);
const LAST_STORY_DAY = 24;

// ============================================================
//  Данные
// ============================================================
// base — оптовая цена в рублях на январь 1992 (индекс цен = 1)
const GOODS = {
  gum:   { name:'Жвачка «Турбина»',       short:'Турбина',   icon:'🍬', base:15 },
  paper: { name:'Газета «Скорость-Инфо»', short:'Газета',    icon:'📰', base:12 },
  soda:  { name:'Лимонад «Буратинка»',    short:'Лимонад',   icon:'🥤', base:30, cold:true },
  choc:  { name:'Батончик «Сникерсон»',   short:'Сникерсон', icon:'🍫', base:45 },
  cig:   { name:'Сигареты «Космонавт»',   short:'Космонавт', icon:'🚬', base:40 },
  beer:  { name:'Пиво «Заводское»',       short:'Пиво',      icon:'🍺', base:55, cold:true },
  batt:  { name:'Батарейки «Энерджи»',    short:'Батарейки', icon:'🔋', base:70 },
  vodka: { name:'Спирт «Король»',         short:'«Король»',  icon:'🍾', base:260 },
  tape:  { name:'Кассета «Хиты-92»',      short:'Кассета',   icon:'📼', base:380 },
  toy:   { name:'Тамагочка',              short:'Тамагочка', icon:'🐣', base:900, from:13 },
  tushonka:{ name:'Тушёнка «Говядина»',    short:'Тушёнка',   icon:'🥫', base:85 },
  kilka: { name:'Килька в томате',        short:'Килька',    icon:'🐟', base:28 },
  bread: { name:'Хлеб «Дарницкий»',       short:'Хлеб',      icon:'🍞', base:10 },
  mag:   { name:'Журнал «Mode International»', short:'Журнал мод', icon:'📖', base:150, euro:true },
  mag2:  { name:'Журнал «Auto Welt»',     short:'Auto Welt', icon:'📘', base:170, euro:true },
};
// товары «из-под полы»: в обычном ассортименте и на витрине их нет, хранятся отдельно
const HIDDEN = {
  samogon: { name:'Самогон (бутылка)', short:'Самогон', base:90 },
  kontra:  { name:'Сигареты без акциза (блок)', short:'Контрабанда', base:150 },
};
const hiddenPrice = id => Math.round(HIDDEN[id].base * S.idx);
const GOOD_IDS = Object.keys(GOODS);
const goodAvail = id => !GOODS[id].from || S.day >= GOODS[id].from;

const TYPES = {
  babka:   { name:'Бабушка',        wants:{paper:4, soda:2, choc:2, batt:1, bread:5, kilka:3, tushonka:2}, tol:.18, qty:[1,1], pat:9,  w:3 },
  school:  { name:'Школьник',       wants:{gum:5, soda:3, choc:3, toy:3},    tol:.35, qty:[1,3], pat:7,  w:3, young:true },
  worker:  { name:'Рабочий',        wants:{beer:4, cig:4, paper:1, batt:1, tushonka:3, kilka:2, bread:2},  tol:.45, qty:[1,3], pat:8,  w:4 },
  student: { name:'Студент',        wants:{tape:3, beer:2, gum:1, batt:2, mag2:2, mag:1},   tol:.40, qty:[1,2], pat:8,  w:2, young:true },
  chelnok: { name:'Челнок',         wants:{cig:3, gum:2, batt:2, vodka:2},   tol:.15, qty:[4,8], pat:10, w:1.2 },
  newrus:  { name:'«Новый русский»',wants:{vodka:3, tape:2, cig:2, choc:1, toy:2, mag:2, mag2:2}, tol:1.4, qty:[2,5], pat:6, w:.6 },
};

const OUTFITS = {
  none:     { name:'Старая куртка', usd:0,   icon:'🧥', desc:'Ничего особенного.' },
  sport:    { name:'Спортивный костюм и кепка', usd:15, icon:'🎽', desc:'Свой в районе: закупка −5%, «крыша» просит меньше.' },
  varenki:  { name:'Варёнки и кожанка', usd:30,  icon:'👖', desc:'Молодёжь платит охотнее (+15% к терпимости цены).' },
  raspberry:{ name:'Малиновый пиджак и цепь', usd:120, icon:'🥻', desc:'«Новые русские» ходят вдвое чаще и платят щедрее. Милиция просит больше.' },
  business: { name:'Деловой костюм', usd:90,  icon:'👔', desc:'Милиция заходит реже, проверки мягче.', from:13 },
};

const UPGRADES = {
  fridge:   { name:'Холодильник «Бирюса»', usd:40,  icon:'🧊', desc:'Холодные лимонад и пиво: покупатели готовы платить больше.' },
  alarm:    { name:'Сигнализация',         usd:50,  icon:'🚨', desc:'Ночью ларёк не обворуют.' },
  sign:     { name:'Неоновая вывеска',     usd:60,  icon:'💡', desc:'+25% покупателей.' },
  pavilion: { name:'Павильон',             usd:500, icon:'🏬', desc:'9 мест на витрине, склад 160, +20% покупателей.', from:13 },
};

const CARD_NAMES = ['Ламборджа','Феррано','Порше-911','Мерсо','БэМэВэ','Ауди-кватро','Тойота-Супра','Ниссан-Скай','Феррано F40','Додж-Вайпер',
  'Корветто','Мустанго','Ягуарро','Бентлей','Лотос','Альфа-Ромашка','Матра','Делорейн','Кадиллак-89','Шевроле-Камаро','Хонда-НСХ','Мазда-RX','Ситроен-СМ','Сааб-900'];

// ============================================================
//  Звук
// ============================================================
let actx = null;
function au() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(f, d, type = 'square', v = .08, slide = 0, delay = 0) {
  if (S && S.mute) return;
  const a = au(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + .02);
}
const sfx = {
  ching() { tone(1320, .08, 'square', .06); tone(1760, .25, 'triangle', .07, 0, .07); },
  click() { tone(600, .04, 'square', .04); },
  bad()   { tone(220, .22, 'sawtooth', .06, -90); },
  door()  { tone(880, .1, 'sine', .05); tone(660, .15, 'sine', .05, 0, .1); },
  coin()  { tone(980, .06, 'square', .05); tone(1470, .1, 'square', .04, 0, .05); },
  tv() {
    if (S && S.mute) return; const a = au(); if (!a) return;
    const len = a.sampleRate * .35, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * .25;
    const s = a.createBufferSource(); s.buffer = buf; s.connect(a.destination); s.start();
  },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => tone(f, .25, 'square', .05, 0, i * .12)); },
};

// ============================================================
//  Состояние
// ============================================================
const SAVE_KEY = 'larek-save-v1';
let S = null;      // сохраняемое состояние
let T = null;      // торговый день (не сохраняется)
let tab = 'hero';

function newGame(name, sex) {
  S = {
    v:1, name, sex, day:1, phase:'morning', money:5000, usd:0, debt:120,
    idx:1, rate:110, rateHist:[110], prices:{}, prevPrices:{}, vprices:{}, stock:{}, slots:[null,null,null,null,null,null],
    markup:.4, rep:{street:0, law:0, folk:0}, sk:{trade:0, charm:0, sense:0}, sp:0, xp:0, lvl:0,
    outfit:'none', owned:['none'], up:{}, permit:false, seller:false, src:'market',
    wave:null, nextWaveDay:4, voucher:null, fundGone:false, pmp:0, pmpCrashDay:RI(18,21), pmpDead:false,
    cheap:0, fakeLoss:0, cards:[], gumBought:0, lastSeen:Date.now(), mute:false, free:false, ending:null,
    totalProfit:0, inflLast:0, flags:{}, gun:false, gunState:'wall', ammo:2, shells:0,
    order:{ lines:{}, hidden:{} }, deliveries:[], items:[], hidden:{}, butts:0, cigs:0, bottle:null,
  };
  genPrices();
  // наследство дяди: часть товара уже стоит поштучно на полках, а рядом лежат оптовые блоки/упаковки для распаковки
  addStock('gum', 6, S.prices.gum); addStock('soda', 5, S.prices.soda);
  addStock('paper', 5, S.prices.paper); addStock('cig', 5, S.prices.cig);
  S.slots = [null,null,null,null,null,null];
  S.slotCounts = [0,0,0,0,0,0];
  S.shelfPlacements = [];
  S.items = [
    { id: 'pk_start_cig',  kind: 'pack', x: -1.12, y: .035, z: -.48, ry: .15,  data: { goodId: 'cig',  count: 5, maxCount: 5, unitCost: S.prices.cig,  opened: false } },
    { id: 'pk_start_beer', kind: 'pack', x: -.74,  y: .035, z: -.52, ry: -.08, data: { goodId: 'beer', count: 5, maxCount: 5, unitCost: S.prices.beer, opened: false } },
    { id: 'pk_start_gum',  kind: 'pack', x: -.38,  y: .035, z: -.50, ry: .05,  data: { goodId: 'gum',  count: 5, maxCount: 5, unitCost: S.prices.gum,  opened: false } },
  ];
}
function save() {
  if (!S) return;
  S.lastSeen = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 1) return s; } catch (e) {}
  return null;
}

// ---- вычисляемые ----
const chapter = () => S.day <= 12 ? 1 : 2;
const slotCount = () => S.up.pavilion ? 9 : 6;
const storeCap = () => S.up.pavilion ? 160 : 80;
const stockTotal = () => GOOD_IDS.reduce((a, id) => a + (S.stock[id] ? S.stock[id].q : 0), 0);
const qOf = id => S.stock[id] ? S.stock[id].q : 0;
const displayed = id => S.slots.includes(id);
const usdToRub = usd => Math.round(usd * S.rate);
const sellPrice = id => Math.max(1, Math.round(S.prices[id] * (1 + S.markup)));
const buyPrice = (id, src = S.src) => {
  let p = (src === 'station' ? S.vprices[id] : S.prices[id]);
  p *= 1 - .04 * S.sk.trade - (S.outfit === 'sport' ? .05 : 0) - (S.cheap > 0 ? .15 : 0);
  if (W && !W.nearMarket()) p *= 1.15; // доставка, если вы не на рынке
  return Math.max(1, Math.round(p));
};
const stockValue = () => GOOD_IDS.reduce((a, id) => a + qOf(id) * S.prices[id], 0);
const capitalUsd = () => S.usd + (S.money + stockValue() + S.pmp) / S.rate - S.debt;
const waveItem = () => (S.wave && S.day <= S.wave.until) ? S.wave.item : null;

function addStock(id, q, cost) {
  const st = S.stock[id] || (S.stock[id] = { q:0, c:0 });
  st.c = (st.c * st.q + cost * q) / (st.q + q); st.q += q;
}
function takeStock(id, q) {
  const st = S.stock[id]; if (!st) return 0;
  const n = Math.min(q, st.q); st.q -= n; return n * st.c;
}
function rep(k, d) { S.rep[k] = clamp(S.rep[k] + d, -100, 100); }

function genPrices() {
  S.prevPrices = { ...S.prices };
  const w = waveItem();
  for (const id of GOOD_IDS) {
    let p = GOODS[id].base * S.idx * R(.85, 1.2);
    if (id === w) p *= 1.5;
    S.prices[id] = Math.max(1, Math.round(p));
    const cheapAtStation = ['cig','vodka','beer','tape'].includes(id);
    S.vprices[id] = Math.max(1, Math.round(S.prices[id] * (cheapAtStation ? R(.65, .8) : R(1, 1.1))));
  }
}

// ============================================================
//  Интерфейс: общее
// ============================================================
function toast(msg, cls = '') {
  const d = document.createElement('div'); d.className = 'tst ' + cls; d.textContent = msg;
  $('#toast').appendChild(d); setTimeout(() => d.remove(), 2200);
  while ($('#toast').children.length > 3) $('#toast').firstChild.remove();
}
function floatText(txt, color) {
  const d = document.createElement('div'); d.className = 'float'; d.textContent = txt;
  if (color) d.style.color = color;
  $('#ui').appendChild(d); setTimeout(() => d.remove(), 1000);
}
function repBar(k, label) {
  const v = S.rep[k], wv = Math.abs(v) / 2;
  const col = v >= 0 ? '#7fc97f' : '#e8735a';
  return `<div class="rep">${label} ${v > 0 ? '+' : ''}${Math.round(v)}<div class="bar"><i style="background:${col};${v >= 0 ? 'left:50%' : 'left:' + (50 - wv) + '%'};width:${wv}%"></i></div></div>`;
}
let sheetOpen = false, dialogOpen = false;
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
function clockStr() { const h = W ? W.hour : 9, hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
function renderHud() {
  if (!S) { $('#hud').innerHTML = ''; return; }
  const gun = W && S.gun && W.weapon.drawn ? `<span class="k">ПАТРОНЫ</span><span>${W.weapon.ammo} / ${W.weapon.reserve}</span>` : '';
  $('#hud').innerHTML = `<div class="hrow"><span>${fmt(S.money)} ₽</span><span>$${fmt(S.usd)}</span>${S.debt > 0 ? `<span class="k">ДОЛГ</span><span style="color:#e8735a">$${S.debt}</span>` : ''}${gun}</div>
    <div id="reps">${repBar('street', 'Улица')}${repBar('law', 'Закон')}${repBar('folk', 'Народ')}</div>`;
}
function renderTabs() {
  if (!S) { $('#tabs').innerHTML = ''; return; }
  const trade = S.phase === 'trade';
  const T_ = [['hero', '👤', 'Герой'], ['set', '⚙', 'Опции']]; // обменник убран из игры
  if (!['hero', 'set'].includes(tab)) tab = 'hero';
  $('#tabs').innerHTML = T_.map(([k, i, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}" ${trade && k === 'exch' ? 'disabled' : ''}><span>${i}</span>${n}</button>`).join('');
}
function openSheet(t) { if (t && ['hero', 'set'].includes(t)) tab = t; else if (!['hero', 'set'].includes(tab)) tab = 'hero'; sheetOpen = true; render(); $('#screen').scrollTop = 0; }
function closeSheet() { if (!W) return; sheetOpen = false; render(); }
function renderControls() {
  $('#topBtns').style.display = S ? 'flex' : 'none';
  $('#muteBtn').textContent = S && S.mute ? '🔇' : '🔊';
  const playing = !!(S && W && !sheetOpen && !cardOpen && !npOpen && !npBusy);
  $('#cross').style.display = playing && !dialogOpen ? 'block' : 'none';
  $('#cross').classList.toggle('aim', !!(W && W.weapon.aiming));
  if (controls) controls.setVisible(playing || (controls && controls.editing));
  let hint = '';
  if (W && S && S.phase === 'morning' && playing && !dialogOpen) {
    if (!S.slots.some(id => id && qOf(id) > 0) && W.inKiosk()) hint = 'Возьмите товар с полок («Действие») и поставьте его на стеклянную витрину у окна, затем сядьте за прилавок.';
    else if (W.P.seated && !S.flags.stood) hint = 'Свайп по экрану — осмотреться. «Действие» → «Встать», чтобы ходить.';
    else if (!W.P.seated && W.inKiosk() && !S.flags.wentOut) hint = 'Повернитесь к двери за спиной и откройте её. Выйти можно просто пройдя в проём.';
  }
  if (S && S.phase === 'night' && playing && !dialogOpen) hint = W && W.inKiosk() ? 'Ночь. Сядьте на табурет, чтобы уснуть до утра.' : '';
  $('#hint').textContent = hint;
  if (controls) controls.refresh(true);
}
function onCtl() { renderControls(); }
function render() {
  renderHud(); renderTabs();
  $('#title').classList.toggle('on', !S);
  if (!S) { $('#title').innerHTML = titleHtml(); $('#sheet').classList.remove('on'); $('#tradePanel').classList.remove('on'); renderControls(); return; }
  $('#title').innerHTML = '';
  if (!W) sheetOpen = true;
  $('#closeSheet').style.display = W ? '' : 'none';
  const trade = S.phase === 'trade';
  if (!['hero', 'set'].includes(tab)) tab = 'hero';
  $('#sheet').classList.toggle('on', sheetOpen);
  if (sheetOpen) {
    const scr = $('#screen');
    const keepScroll = scr.dataset.view === tab ? scr.scrollTop : 0;
    scr.dataset.view = tab;
    if (tab === 'exch') scr.innerHTML = exchHtml();
    else if (tab === 'hero') scr.innerHTML = financeHtml() + heroHtml();
    else if (tab === 'set') scr.innerHTML = setHtml();
    scr.scrollTop = keepScroll;
    if (tab === 'exch') drawChart();
  }
  $('#tradePanel').classList.toggle('on', trade && !!T);
  if (trade && T) $('#tradePanel').innerHTML = tradePanelHtml();
  if (W) W.updateShelves();
  renderControls();
  if (S.phase === 'morning' || S.phase === 'night') save();
}

// ============================================================
//  Модальные карточки (очередь)
// ============================================================
let cards = [], cardOpen = false;
function queueCard(c) { cards.push(c); if (!cardOpen) nextCard(); }
function nextCard() {
  const c = cards.shift();
  if (!c) { cardOpen = false; $('#modal').classList.remove('on'); if (T) T.paused = false; render(); return; }
  if (controls) controls.setVisible(false);
  cardOpen = true; if (T) T.paused = true;
  const box = $('#mbox');
  box.innerHTML = (c.title ? `<h2>${c.title}</h2>` : '') + c.html +
    `<div class="mbtns">${(c.buttons || [{ label:'Дальше' }]).map((b, i) => `<button class="btn ${b.cls || ''}" data-card="${i}" ${b.disabled ? 'disabled' : ''}>${b.label}</button>`).join('')}</div>`;
  box.querySelectorAll('[data-card]').forEach(el => el.onclick = () => {
    sfx.click();
    const b = (c.buttons || [{}])[+el.dataset.card];
    const keep = b.fn ? b.fn() : null;
    if (keep !== 'keep') nextCard();
  });
  $('#modal').classList.add('on');
  if (c.onShow) c.onShow(box);
}

// ============================================================
//  Титульный экран и новая игра
// ============================================================
function titleHtml() {
  const has = !!load();
  return `<div class="y">КРАСНОЗАВОДСК · 1992</div>
    <h1>ЛАРЁК</h1>
    <p class="muted" style="max-width:360px">Один ларёк у остановки, долг дяди и целая эпоха впереди.</p>
    <div class="mbtns">
      ${has ? '<button class="btn green big" data-a="continue">Продолжить</button>' : ''}
      <button class="btn yellow big" data-a="new">Новая игра</button>
    </div>
    <p class="muted" id="loadInfo" style="margin-top:14px">${W && !worldReady ? 'Загрузка города… ' + Math.round(loadP * 100) + '%' : ''}</p>
    <p class="muted" style="margin-top:8px">Главы 1–2 · все персонажи, фирмы и бренды вымышлены</p>
    ${W ? '' : '<p class="warn">WebGL недоступен — 3D выключено, игра идёт в режиме блокнота.</p>'}`;
}
function startNewFlow() {
  let sex = 'm';
  const show = () => queueCard({
    title: 'Кто вы?',
    html: `<p>Вам 20 лет. Завод, где работали родители, стоит, зарплату не платят.</p>
      <div class="seg" id="sexSeg"><button data-s="m" class="${sex === 'm' ? 'on' : ''}">Парень</button><button data-s="f" class="${sex === 'f' ? 'on' : ''}">Девушка</button></div>
      <p style="margin-top:12px">Как вас зовут?</p>
      <input type="text" id="heroName" maxlength="16" value="${sex === 'm' ? 'Серёга' : 'Ленка'}">`,
    onShow(box) {
      box.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
        sex = b.dataset.s; box.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b));
        const inp = $('#heroName'); if (inp.value === 'Серёга' || inp.value === 'Ленка') inp.value = sex === 'm' ? 'Серёга' : 'Ленка';
      });
    },
    buttons: [{ label:'Начать', cls:'green', fn() {
      const nm = ($('#heroName').value || '').trim() || (sex === 'm' ? 'Серёга' : 'Ленка');
      newGame(nm.slice(0, 16), sex); tab = 'kiosk'; if (W) W.reset(); syncAmmoToWeapon(); render(); introCards();
    } }],
  });
  show();
}
function introCards() {
  queueCard({ title:'Глава 1 · 1992 «Свободные цены»',
    html:`<p>Январь 1992-го. Цены отпустили — и они улетели. Дядя Миша уехал «по делам» и оставил вам свой ларёк у остановки.</p>
      <p>А ещё — долг. <b>$120</b> «заводским». До декабря.</p>
      <p class="goal">Цель главы: отдать долг $120 до конца 1992 года.</p>` });
  queueCard({ title:'Как играть',
    html:`<p>👀 <b>Свайп по экрану</b> — крутить головой. Кнопка <b>«Действие»</b> показывает, что можно сделать: встать, открыть дверь, сесть, включить радио, поговорить.</p>
      <p>🕹 Джойстик слева — ходить, <b>«Бег»</b> — бежать, <b>«Присесть»</b>. На ПК: WASD, Shift, C, E — действие, F — дверь, Q — ружьё, R — перезарядка, ПКМ — прицел, ЛКМ — выстрел.</p>
      <p>🚪 Дверь за спиной открывается и закрывается. Выходите в город пешком: остановка, детская площадка, дворы. Товар заказывается через блокнот и телефон на прилавке.</p>
      <p>🔫 Под прилавком — дядино охотничье ружьё и 6 патронов. Только чтобы пугать: наведите на хулиганов — кто-то отступит, кто-то нет. Выстрел в воздух распугает всех, но милиции это не понравится.</p>
      <p>⚙ Раскладку кнопок можно менять: <b>Блокнот → Опции → Редактор управления</b>.</p>` });
}

// ============================================================
//  Ларёк: утро
// ============================================================
function slotHtml(id, i, clickable = true) {
  const sc = slotCount();
  if (i >= sc) return '';
  if (!id) return `<button class="slot empty" data-slot="${i}">＋<small>пусто</small></button>`;
  const q = qOf(id), hot = waveItem() === id;
  return `<button class="slot ${q ? '' : 'out'} ${hot ? 'hot' : ''}" data-slot="${i}">${GOODS[id].icon}<small>${GOODS[id].short} · ${fmt(sellPrice(id))}₽</small><b>${q}</b></button>`;
}
function vitrineHtml() {
  let h = '<div class="vit">';
  for (let i = 0; i < slotCount(); i++) h += slotHtml(S.slots[i], i);
  return h + '</div>';
}
function kioskHtml() {
  const ch = chapter();
  const goal = S.free ? 'Свободная торговля. Капитал: $' + fmt(capitalUsd())
    : ch === 1 ? (S.debt > 0 ? `Отдать долг $${S.debt} до декабря 1992` : 'Долг отдан. Доживите до 1993-го и копите.')
    : (S.up.pavilion ? 'Павильон открыт. Доживите до конца 1993 и наберите капитал.' : 'Открыть павильон ($500) до конца 1993');
  const mk = Math.round(S.markup * 100);
  const mkLabel = mk <= 25 ? 'по-честному' : mk <= 60 ? 'как все' : mk <= 100 ? 'дерзко' : 'грабёж';
  const ups = Object.entries(UPGRADES).filter(([k, u]) => !S.up[k] && (!u.from || S.day >= u.from));
  return `
    <div class="card goal"><b>Цель:</b> ${goal}</div>
    <h3>Витрина <span class="muted">(тап — сменить товар)</span></h3>
    ${vitrineHtml()}
    <div class="row sp" style="margin-top:6px"><span class="muted">Склад: ${stockTotal()}/${storeCap()}</span><span class="muted">Мест на витрине: ${slotCount()}</span></div>
    <h3>Наценка: ${mk}% <span class="chip">${mkLabel}</span></h3>
    <input type="range" min="0" max="150" step="5" value="${mk}" data-range="markup">
    <p class="muted">Высокая наценка — больше денег, но покупатели чаще уходят, а «Народ» запоминает жадность.</p>
    <div class="mbtns">
      ${S.phase === 'morning' ? `<button class="btn green big" data-a="open">Сесть за прилавок (начать продажу) ▶</button>
      ${S.seller ? '<button class="btn" data-a="auto">Пусть торгует тётя Люба (весь день)</button>' : ''}` : '<p class="warn">Ларёк открыт — идёт продажа. Встаньте из-за прилавка, чтобы закрыть его.</p>'}
    </div>
    ${ups.length ? '<h3>Улучшения</h3>' + ups.map(([k, u]) => `<div class="card row sp"><div><b>${u.icon} ${u.name}</b><div class="muted">${u.desc}</div></div>
        <button class="btn small yellow" data-up="${k}" ${S.money < usdToRub(u.usd) ? 'disabled' : ''}>${fmt(usdToRub(u.usd))} ₽</button></div>`).join('') : ''}
    ${!S.seller && S.day >= 4 ? `<div class="card row sp"><div><b>👩 Нанять тётю Любу</b><div class="muted">Торгует за вас целый день и пока вы не в игре (до 8 часов). Зарплата $3/день. Бывает, подворовывает.</div></div>
        <button class="btn small" data-a="hire">Нанять</button></div>` : ''}`;
}
function openSlotPicker(i) {
  const items = GOOD_IDS.filter(id => qOf(id) > 0);
  queueCard({ title:'Что положить на витрину?',
    html: items.length ? items.map(id => `<div class="good"><div class="ic">${GOODS[id].icon}</div><div class="nm"><div>${GOODS[id].name}</div><div class="muted">на складе ${qOf(id)} · цена ${fmt(sellPrice(id))} ₽${displayed(id) ? ' · уже на витрине' : ''}</div></div>
      <button class="btn small" data-pick="${id}">Сюда</button></div>`).join('') : '<p>Склад пуст. Закажите товар через блокнот и телефон на прилавке.</p>',
    onShow(box) { box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { S.slots[i] = b.dataset.pick; sfx.click(); nextCard(); }); },
    buttons: [{ label:'Убрать с витрины', fn() { S.slots[i] = null; } }, { label:'Отмена' }],
  });
}

// ============================================================
//  Торговый день
// ============================================================
function traffic() {
  return (1 + (S.up.sign ? .25 : 0) + (S.up.pavilion ? .2 : 0)) * (1 + S.rep.folk / 250);
}
function makeCustomer() {
  const w = {};
  for (const k in TYPES) {
    let x = TYPES[k].w;
    if (k === 'newrus') x *= (chapter() === 2 ? 1.8 : 1) * (S.outfit === 'raspberry' ? 2.5 : 1);
    if (k === 'chelnok' && chapter() === 2) x *= 1.5;
    w[k] = x;
  }
  const k = wpick(w), ty = TYPES[k], wi = waveItem();
  const wants = {};
  for (const id in ty.wants) if (goodAvail(id)) wants[id] = ty.wants[id];
  if (wi) wants[wi] = (wants[wi] || 2) * 4;
  const item = wpick(wants);
  let qty = RI(ty.qty[0], ty.qty[1]); if (item === wi) qty += 1;
  let tol = ty.tol + S.sk.charm * .06 + S.rep.folk / 300;
  if (S.up.fridge && GOODS[item].cold) tol += .2;
  if (item === wi) tol += .8;
  if (ty.young && S.outfit === 'varenki') tol += .15;
  if (k === 'newrus' && S.outfit === 'raspberry') tol += .25;
  const wtp = S.prices[item] * (1 + tol) * R(.9, 1.15);
  const pat = ty.pat * (1 + .12 * S.sk.sense);
  return { k, name: ty.name, item, qty, wtp, pat, patMax: pat, price: sellPrice(item), disc: 0, refused: 0, said: pickGreeting(k), mood: 'neutral', anim: 0 };
}
function pickGreeting(k) {
  return pick({
    babka: ['Внучек, почём нынче?', 'Ой, цены-то какие...', 'Мне бы только спросить...'],
    school: ['Здрасьте! А есть?..', 'Мне на сдачу от хлеба!', 'Вкладыши новые пришли?'],
    worker: ['Здорово, хозяин.', 'После смены — святое.', 'Зарплату опять не дали...'],
    student: ['Привет! Есть чё новенькое?', 'Стипуха пришла!', 'Слышал, новый альбом вышел?'],
    chelnok: ['Оптом возьму, если скинешь.', 'Только с поезда. Беру много.', 'Я из Польши, торопиться некуда... шучу, тороплюсь.'],
    newrus: ['Слышь, братан, давай лучшее.', 'Сдачи не надо. Шучу. Надо.', 'Мне по-быстрому, у меня стрелка.'],
  }[k] || ['Здрасьте.']);
}
function initTradeSession() {
  T = { t:0, len:900, queue:[], walking:[], cur:null, nextSpawn:.5, rev:0, cogs:0, sold:0, lost:0, specials:[], paused:false, startMoney:S.money };
  if (S.day >= 3 && S.day % 4 === 3) T.specials.push({ at: R(60, 170), k:'racket' });
  const polChance = (S.permit ? .1 : .22) * (S.outfit === 'business' ? .5 : 1) * (S.rep.law > 30 ? .5 : 1);
  if (Math.random() < polChance) T.specials.push({ at: R(40, 250), k:'police' });
  if (Math.random() < .3) T.specials.push({ at: R(40, 250), k:'neighbor' });
  if (S.rep.folk < -40 && Math.random() < .5) T.specials.push({ at: R(20, 120), k:'boycott' });
}
function onSitCounter() {
  if (!S || S.phase === 'night' || S.phase === 'evening') return;
  if (!T) initTradeSession();
  else T.paused = false;
  S.phase = 'trade';
  sheetOpen = false;
  sfx.door();
  if (!S.slots.some(id => id && qOf(id) > 0)) toast('Прилавок открыт. Возьмите товар с полок и поставьте на стеклянную витрину у окна!');
  else toast('Прилавок открыт — началась продажа', 'good');
  render();
}
function onStandCounter() {
  if (!S || S.phase !== 'trade') return;
  S.phase = 'morning';
  if (T) {
    T.paused = true;
    T.cur = null;
    T.queue = [];
    T.walking = [];
  }
  sfx.door();
  toast('Прилавок закрыт');
  render();
}
function startTrade() {
  if (W) { sheetOpen = false; W.goCounter(false); }
  else onSitCounter();
}
function specialVisitor(k) {
  if (k === 'racket') {
    const disc = (S.outfit === 'sport' ? .7 : 1) * (S.rep.street >= 40 ? .5 : 1);
    const ask = Math.max(usdToRub(5), Math.round(S.money * .06 * disc));
    return { special:k, k:'racket', name:'«Заводской» Колян', mood:'angry', pat:999, patMax:999, anim:0,
      said: S.flags.underRoof ? `Ну что, свои люди. За крышу — ${fmt(ask)} ₽, как договаривались.` : `Слышь, ларёк у остановки — наша территория. С тебя ${fmt(ask)} ₽ за спокойствие.`,
      opts: [
        { label:`Заплатить ${fmt(ask)} ₽`, cls:'yellow', fn() { if (S.money < ask) { toast('Не хватает денег!', 'bad'); rep('street', -5); S.flags.angryRacket = true; return; } S.money -= ask; rep('street', 4); toast('Колян доволен. Улица +4'); } },
        { label:'Отказать', cls:'red', fn() { rep('street', -8); S.flags.angryRacket = true; toast('Колян: «Ну смотри...» Улица −8', 'bad'); } },
        { label:'Позвать милицию', fn() {
          if (S.rep.law >= 0) { rep('law', 5); rep('street', -12); toast('Наряд спугнул Коляна. Закон +5, Улица −12'); }
          else { rep('street', -10); S.flags.angryRacket = true; toast('Милиция не приехала. Колян всё понял. Улица −10', 'bad'); }
        } },
      ] };
  }
  if (k === 'police') {
    const bribe = Math.round(usdToRub(5) * (S.outfit === 'raspberry' ? 1.6 : 1) * (S.outfit === 'business' ? .6 : 1));
    return { special:k, k:'police', name:'Участковый Петрович', mood:'neutral', pat:999, patMax:999, anim:0,
      said:'Здравия желаю. Документики на торговлю имеются? Санитарные нормы соблюдаем?',
      opts: [
        S.permit ? { label:'Показать разрешение', cls:'green', fn() { rep('law', 3); toast('Всё в порядке. Закон +3', 'good'); } }
                 : { label:'Показать разрешение', disabled:true },
        { label:`Дать «на чай» ${fmt(bribe)} ₽`, cls:'yellow', fn() { if (S.money < bribe) { toast('Денег нет — Петрович недоволен', 'bad'); rep('law', -5); return; } S.money -= bribe; rep('law', 2); toast('Петрович козырнул и ушёл. Закон +2'); } },
        { label:'Спорить', cls:'red', fn() {
          rep('law', -6);
          let lost = 0; for (const id of GOOD_IDS) { const n = Math.floor(qOf(id) * .2); if (n) { takeStock(id, n); lost += n; } }
          toast(`Изъяли «до выяснения» ${lost} шт. товара. Закон −6`, 'bad');
        } },
      ] };
  }
  if (k === 'neighbor') {
    const id = pick(GOOD_IDS.filter(x => qOf(x) >= 2)) || null;
    if (!id) return null;
    return { special:k, k:'neighbor', name:'Соседка тётя Валя', mood:'neutral', pat:999, patMax:999, anim:0,
      said:`Милок, дай ${GOODS[id].short.toLowerCase()} пару штук в долг, а? Пенсию задерживают...`,
      opts: [
        { label:'Дать в долг (2 шт.)', cls:'green', fn() { takeStock(id, 2); rep('folk', 5); toast('Тётя Валя расскажет всему двору. Народ +5', 'good'); if (Math.random() < .5) S.flags.valyaPays = true; } },
        { label:'Отказать', fn() { rep('folk', -3); toast('Тётя Валя обиделась. Народ −3', 'bad'); } },
      ] };
  }
  if (k === 'boycott') {
    return { special:k, k:'babka', name:'Бабушки со двора', mood:'angry', pat:999, patMax:999, anim:0,
      said:'Спекулянт! Мы всем расскажем, какие у тебя цены! Не ходите сюда, люди!',
      opts: [
        { label:'Извиниться и скинуть цены (наценка 20%)', cls:'green', fn() { S.markup = Math.min(S.markup, .2); rep('folk', 6); toast('Бабушки смягчились. Народ +6', 'good'); } },
        { label:'Не обращать внимания', fn() { rep('folk', -4); T.boycott = true; toast('Покупателей сегодня будет меньше', 'bad'); } },
      ] };
  }
  return null;
}
function tradeTick(dt) {
  if (!T || T.paused || S.phase !== 'trade') return;
  T.t += dt;
  // особые
  for (const sp of T.specials) if (!sp.done && T.t >= sp.at && !T.cur) {
    sp.done = true; const v = specialVisitor(sp.k);
    if (v) { if (W) { T.walking.push(v); W.spawnCustomer(v); } else { T.cur = v; sfx.door(); renderTrade(); return; } }
  }
  // спавн
  T.nextSpawn -= dt;
  if (T.nextSpawn <= 0 && T.t < T.len - 4 && S.slots.some(id => id && qOf(id) > 0)) {
    if (T.queue.length + T.walking.length < 6) { const c = makeCustomer(); if (W) { T.walking.push(c); W.spawnCustomer(c); } else T.queue.push(c); }
    T.nextSpawn = (W ? R(14, 26) : R(7, 13)) / traffic() * (T.boycott ? 1.8 : 1);
  }
  if (!T.cur && T.queue.length) { T.cur = T.queue.shift(); T.cur.anim = 0; sfx.door(); renderTrade(); }
  // терпение
  const c = T.cur;
  if (c && !c.special) {
    c.pat -= dt;
    const pb = document.getElementById('patBar'); if (pb) pb.style.width = clamp(c.pat / c.patMax * 100, 0, 100) + '%';
    if (c.pat <= 0) { T.lost++; c.said = 'Ну и ладно!'; leave(); }
  }
  // очередь тоже теряет терпение
  for (const q of T.queue) q.pat -= dt * .35;
  const before = T.queue.length; T.queue = T.queue.filter(q => q.pat > 0); T.lost += before - T.queue.length;
  const tb = document.getElementById('tBar'); if (tb) tb.style.width = clamp(100 - T.t / T.len * 100, 0, 100) + '%';
  if (T.t >= T.len && (!T.cur || !T.cur.special)) endTrade();
}
// покупатель дошёл до очереди у окна (сообщает 3D-мир)
function arrive(c) {
  if (!T) return; T.walking = T.walking.filter(x => x !== c);
  if (c.special) T.queue.unshift(c); else T.queue.push(c);
  if (c.special) sfx.door();
}
// покупателя напугали ружьём
function customerScared(c) {
  if (!T || !c) return;
  if (c.special) {
    if (c.k === 'racket') { rep('street', -10); S.flags.angryRacket = true; toast('Колян: «Ты чё, ствол на нас наставил? Ну, жди гостей…» Улица −10', 'bad'); }
    else if (c.k === 'police') { rep('law', -20); S.gun = false; if (W) W.weapon.holster(); toast('Навести ружьё на участкового?! Ружьё изъяли. Закон −20', 'bad'); }
    else rep('folk', -3);
  } else { T.lost++; rep('folk', -2); c.lostAngry = true; }
  if (T.cur === c) T.cur = null; T.queue = T.queue.filter(q => q !== c); T.walking = T.walking.filter(q => q !== c);
  renderTrade();
}
function leave() { T.cur = null; renderTrade(); }
// субтитры в реальном времени: слова появляются синхронно с записью (тайминги по словам)
let subsRaf = 0;
function subtitles(name, words, start) {
  const el = document.getElementById('subs'); if (!el) return; cancelAnimationFrame(subsRaf);
  el.innerHTML = `<b>${name}:</b>` + words.map((w, i) => `<span class="w" data-i="${i}">${w[2]} </span>`).join(''); el.classList.add('on');
  const t0 = start != null ? start : null, p0 = performance.now(), spans = el.querySelectorAll('.w'), end = words[words.length - 1][1];
  const step = () => { const t = (performance.now() - p0) / 1000; // звук запущен в этот же момент
    words.forEach((w, i) => { spans[i].classList.toggle('on', t >= w[0] - .05); spans[i].classList.toggle('cur', t >= w[0] - .05 && t < w[1] + .1); });
    if (t > end + 1.8) { el.classList.remove('on'); return; } subsRaf = requestAnimationFrame(step); };
  step();
}
// человек убит из ружья: тяжёлые последствия, но игра продолжается
function onKill(role, c, kind) {
  if (!S) return;
  S.flags.kills = (S.flags.kills || 0) + 1;
  if (role === 'gop') { rep('street', -6); rep('law', -10); toast('Гопник убит. Свидетели разбежались. Закон −10, Улица −6', 'bad'); }
  else if (c && c.k === 'police') { rep('law', -60); S.gun = false; if (W) W.weapon.holster(); toast('Убит участковый. Ружьё конфисковано, по району ищут стрелка. Закон −60', 'bad'); }
  else if (role === 'marat') { rep('street', -25); rep('law', -15); toast('Марат убит. Улица этого не простит. Улица −25, Закон −15', 'bad'); }
  else { rep('law', -30); rep('folk', -15); toast('Убит человек. Закон −30, Народ −15', 'bad'); }
  sfx.bad && sfx.bad();
  if (T && c) { if (T.cur === c) T.cur = null; T.queue = T.queue.filter(q => q !== c); T.walking = (T.walking || []).filter(q => q !== c); T.lost++; renderTrade(); }
  save();
}
function custStatus(c) {
  const id = c.item, q = qOf(id), onVit = displayed(id);
  if (!onVit && q > 0) return { ok:false, msg:'Есть на полке, но нет на витрине! Возьмите с полки и поставьте на витрину.' };
  if (!onVit || q === 0) return { ok:false, msg:'Такого нет.' };
  return { ok:true, n: Math.min(q, c.qty), msg: q < c.qty ? `Есть только ${q} из ${c.qty}` : '' };
}
function moodOf(c) {
  const r = c.price / c.wtp;
  return r <= .85 ? 'happy' : r <= 1 ? 'neutral' : 'angry';
}
function tradePanelHtml() {
  return `<div class="tp"><div class="timer"><i id="tBar" style="width:${clamp(100 - T.t / T.len * 100, 0, 100)}%"></i></div>
    <div id="cust">${custHtml()}</div>
    <div class="tstat"><span>ВЫРУЧКА ${fmt(T.rev)} ₽ · ПРОДАНО ${T.sold} · УШЛИ ${T.lost}</span></div></div>`;
}
function custHtml() {
  const c = T.cur;
  if (!c) return `<div class="bubble"><div class="say">${T.t >= T.len - 4 ? 'Народ расходится. Скоро закрываться.' : 'Пока никого... Слышно, как едет автобус.'}</div></div>`;
  if (c.special) {
    return `<div class="bubble"><div class="who">${c.name}</div><div class="say">«${esc(c.said)}»</div></div>
      <div class="mbtns">${c.opts.map((o, i) => `<button class="btn ${o.cls || ''}" data-opt="${i}" ${o.disabled ? 'disabled' : ''}>${o.label}</button>`).join('')}</div>`;
  }
  const g = GOODS[c.item], st = custStatus(c);
  c.mood = moodOf(c);
  const moodIc = c.mood === 'happy' ? '😊' : c.mood === 'neutral' ? '🤔' : '😠';
  const sense = S.sk.sense >= 2 ? ` <span class="chip">готов дать ~${fmt(c.wtp)} ₽</span>` : '';
  return `<div class="bubble">
      <div class="who">${c.name} ${moodIc}</div>
      <div class="want">${g.icon} ${g.short} × ${c.qty}</div>
      <div class="say">«${esc(c.said)}»</div>
      <div class="row sp" style="margin-top:4px"><span>Ваша цена: <b>${fmt(c.price)} ₽</b>/шт${c.disc ? ` <span class="chip">−${c.disc * 10}%</span>` : ''}${sense}</span></div>
      ${st.msg ? `<div class="warn">${st.msg}</div>` : ''}
      <div class="pat"><i id="patBar" style="width:${clamp(c.pat / c.patMax * 100, 0, 100)}%"></i></div>
    </div>
    ${hiddenCount() > 0 ? '<button class="btn small" data-a="hiddenOffer" style="margin-top:6px">🤫 Предложить из-под полы…</button>' : ''}
    <div class="acts">
      <button class="btn green" data-a="sell" ${st.ok ? '' : 'disabled'}>Продать${st.ok ? ' ' + st.n + ' шт' : ''}</button>
      <button class="btn yellow" data-a="discount" ${st.ok ? '' : 'disabled'}>Скинуть 10%</button>
      <button class="btn" data-a="next">${st.ok ? 'Отказать' : 'Нету'}</button>
    </div>`;
}
function renderTrade() {
  if (!S || S.phase !== 'trade' || !T) return;
  $('#tradePanel').innerHTML = tradePanelHtml();
  renderHud();
  if (W) W.updateShelves();
  if (sheetOpen && tab === 'kiosk') { const vit = document.querySelector('#screen .vit'); if (vit) vit.outerHTML = vitrineHtml(); }
}
function act(a) {
  const c = T && T.cur; if (!c || c.special || T.paused) return;
  if (a === 'next') { T.lost++; c.said = 'Эх...'; sfx.click(); leave(); return; }
  const st = custStatus(c); if (!st.ok) return;
  if (a === 'discount') {
    const floor = Math.round(S.prices[c.item] * .7);
    c.price = Math.max(floor, Math.round(c.price * .9)); c.disc++;
    c.pat -= c.patMax * .12;
    c.said = c.price / c.wtp <= 1 ? 'О, другое дело!' : pick(['А чего так дорого-то?', 'Ещё скинь!', 'Да ну, у метро дешевле.']);
    if (W) W.customerEvent(c, 'talk');
    sfx.click(); renderTrade(); return;
  }
  if (a === 'sell') {
    const r = c.price / c.wtp;
    if (r <= 1 || (r <= 1.12 && Math.random() < .35)) {
      if (Math.random() < (c.k === 'chelnok' ? .14 : .06) && c.price * st.n > usdToRub(1)) { fakeBillGame(c, st.n); return; }
      completeSale(c, st.n);
    } else {
      c.refused++; c.pat -= c.patMax * .3;
      c.said = pick(['Сколько?! Совсем обалдели!', 'Дорого! Скинь чуток.', 'За такие деньги я в Польшу съезжу.']);
      if (r > 1.4 && c.refused === 1) rep('folk', -1);
      if (W) W.customerEvent(c, 'refused');
      sfx.bad(); renderTrade();
    }
  }
}
function completeSale(c, n, fake = false) {
  const sum = c.price * n;
  const cost = takeStock(c.item, n);
  S.money += sum; T.rev += sum; T.cogs += cost; T.sold += n;
  if (fake) S.fakeLoss += sum;
  S.xp += n;
  if (c.price / c.wtp < .7) rep('folk', .4);
  floatText('+' + fmt(sum) + ' ₽');
  sfx.ching();
  c.said = pick(['Спасибо!', 'Бывай!', 'Ещё зайду.', 'Нормально.']);
  if (W) W.customerEvent(c, 'sold');
  checkLevel();
  leave();
}
function fakeBillGame(c, n) {
  T.paused = true;
  const denoms = S.idx < 3 ? [50, 100, 200, 500] : S.idx < 10 ? [200, 500, 1000, 5000] : [1000, 5000, 10000, 50000];
  const colors = { 50:'#c9b8d8', 100:'#d9c8a3', 200:'#c7a7a7', 500:'#b9c9b0', 1000:'#a8c3c9', 5000:'#c9b8a0', 10000:'#d0b3b3', 50000:'#b3c0d0' };
  const bills = Array.from({ length: 4 }, () => pick(denoms));
  const fakeI = RI(0, 3), kind = pick(['joke', 'nowm', 'color']);
  const time = 3.5 + S.sk.sense * .8;
  let done = false, timer;
  const finish = ok => {
    if (done) return; done = true; clearTimeout(timer);
    if (ok) { S.xp += 3; rep('law', 1); toast('Фальшивка! Покупатель дал дёру. Чуйка не подвела.', 'good'); sfx.coin(); c.said = '...'; nextCard(); T.cur = null; renderTrade(); }
    else { toast('Взяли деньги... что-то с ними не так', 'bad'); nextCard(); completeSale(c, n, true); }
  };
  queueCard({ title:'Пересчёт денег',
    html:`<p>Покупатель суёт пачку купюр. <b>Найдите фальшивку!</b> (${time.toFixed(1)} с)</p>
      <div class="bills">${bills.map((d, i) => {
        const isF = i === fakeI;
        const col = isF && kind === 'color' ? '#e0d090' : colors[d];
        const label = isF && kind === 'joke' ? 'БИЛЕТ БАНКА ПРИКОЛОВ' : 'БИЛЕТ ГОСБАНКА';
        return `<button class="bill" data-bill="${i}" style="background:${col}"><small>${label}</small>${fmt(d)} РУБЛЕЙ${isF && kind === 'nowm' ? '' : '<div class="wm"></div>'}</button>`;
      }).join('')}</div><div class="pat"><i id="fakeBar" style="width:100%;transition:width ${time}s linear"></i></div>`,
    buttons: [{ label:'Всё нормально, беру', fn() { finish(false); return 'keep'; } }],
    onShow(box) {
      requestAnimationFrame(() => { const fb = $('#fakeBar'); if (fb) fb.style.width = '0%'; });
      box.querySelectorAll('[data-bill]').forEach(b => b.onclick = () => finish(+b.dataset.bill === fakeI));
      timer = setTimeout(() => finish(false), time * 1000);
    },
  });
}
function chooseOpt(i) {
  const c = T.cur; if (!c || !c.special) return;
  const o = c.opts[i]; if (!o || o.disabled) return;
  sfx.click(); o.fn(); T.cur = null; renderTrade();
}
function endTrade() {
  if (S.phase !== 'trade') return;
  const rep_ = { rev:T.rev, cogs:T.cogs, sold:T.sold, lost:T.lost, theft:0 };
  T = null;
  if (W) W.unlock();
  eveningFlow(rep_);
}
// тётя Люба торгует сама
function autoDay(hours) {
  let rev = 0, cogs = 0, sold = 0;
  const n = hours ? Math.round(hours * 4 * traffic()) : Math.round(26 * traffic());
  for (let i = 0; i < n; i++) {
    const c = makeCustomer(); const st = custStatus(c);
    if (!st.ok || Math.random() < .2) continue;
    if (c.price / c.wtp > 1) { c.price = Math.max(Math.round(S.prices[c.item] * .9), Math.round(c.wtp * .95)); }
    const cost = takeStock(c.item, st.n); rev += c.price * st.n; cogs += cost; sold += st.n;
  }
  const theft = Math.round(rev * R(0, .12));
  S.money += rev - theft;
  return { rev, cogs, sold, lost:0, theft };
}

// ============================================================
//  Вечер: итоги, ТВ, события, переход к следующему дню
// ============================================================
function eveningFlow(r) {
  S.phase = 'evening';
  tab = 'kiosk'; render();
  // итоги дня
  let notes = [];
  if (S.fakeLoss > 0) { S.money -= S.fakeLoss; notes.push(`В кассе нашлись фальшивки: −${fmt(S.fakeLoss)} ₽`); S.fakeLoss = 0; }
  if (S.seller) { const wage = usdToRub(3); S.money -= wage; notes.push(`Зарплата тёте Любе: −${fmt(wage)} ₽`); }
  if (r.theft > 0) notes.push(`Тётя Люба, кажется, взяла себе ${fmt(r.theft)} ₽...`);
  if (S.markup <= .3) { rep('folk', 2); notes.push('Честные цены: Народ +2'); }
  if (S.markup >= 1) { rep('folk', -3); notes.push('Цены «грабёж»: Народ −3'); }
  if (S.flags.valyaPays) { S.flags.valyaPays = false; const v = usdToRub(2); S.money += v; notes.push(`Тётя Валя вернула долг с пирожками: +${fmt(v)} ₽`); }
  if (S.voucher === 'zavod') { const dv = usdToRub(1.5); S.money += dv; notes.push(`Дивиденды завода: +${fmt(dv)} ₽`); }
  if (S.money < 0) { notes.push('Касса в минусе — пришлось занять у соседей. Народ −2'); rep('folk', -2); S.money = 0; }
  const profit = r.rev - r.cogs - (r.theft || 0);
  S.totalProfit += profit / S.rate;
  queueCard({ title:`Итоги: ${dateStr(S.day)}`,
    html:`<div class="card">
      <div class="row sp"><span>Выручка</span><b>${fmt(r.rev)} ₽</b></div>
      <div class="row sp"><span>Себестоимость проданного</span><b>−${fmt(r.cogs)} ₽</b></div>
      <div class="row sp"><span>Прибыль</span><b class="${profit >= 0 ? 'dn' : 'up'}">${fmt(profit)} ₽ (≈ $${(profit / S.rate).toFixed(1)})</b></div>
      <div class="row sp"><span>Продано / ушли ни с чем</span><b>${r.sold} / ${r.lost}</b></div></div>
      ${notes.map(n => `<p class="muted">• ${n}</p>`).join('')}`,
    onShow: () => sfx.fanfare() });

  // ночь
  nightEvents();

  // глава 1 заканчивается: долг
  if (S.day === 12 && !S.free) debtDeadline();
  // конец сюжета
  if (S.day === LAST_STORY_DAY && !S.free) { finale(); return; }

  queueCard({ title:'🌙 Вечер', html:`<p>Ларёк закрыт. Можно прогуляться по ночному городу — фонари уже горят.</p><p class="muted">Чтобы лечь спать до утра, сядьте на табурет в ларьке или нажмите «Спать» в блокноте.</p>`,
    buttons:[{ label:'Ночь', cls:'green', fn() { S.phase = 'night'; save(); } }, { label:'Сразу спать', fn() { setTimeout(sleep, 0); } }] });
}
function sleep() {
  if (!S || (S.phase !== 'night' && S.phase !== 'evening')) return;
  T = null;
  S.phase = 'evening';
  if (W) { W.P.x = 0; W.P.z = -.25; W.P.yaw = Math.PI; W.P.pitch = -.08; W.P.seated = false; W.P.locked = false; }
  advanceDay();
}
function nightEvents() {
  // ограбление
  const protectedByStreet = S.rep.street >= 30 || S.flags.underRoof;
  const robChance = S.up.alarm ? 0 : (S.flags.angryRacket ? .45 : .1) * (protectedByStreet ? .2 : 1);
  if (Math.random() < robChance) {
    let lost = 0; for (const id of GOOD_IDS) { const n = Math.floor(qOf(id) * (S.flags.angryRacket ? .5 : .3)); if (n) { takeStock(id, n); lost += n; } }
    if (lost) queueCard({ title:'🌙 Ночью ларёк вскрыли', html:`<p>Утром дверь висела на одной петле. Пропало ${lost} шт. товара.</p>
      <p class="muted">${S.flags.angryRacket ? 'Колян, проходя мимо, ухмыльнулся.' : 'Сигнализация бы не помешала.'}</p>` });
  }
  S.flags.angryRacket = false;

  const pool = [];
  pool.push('press', 'helpYard');
  if (S.day >= 3) pool.push('palenka', 'chelnokDeal');
  if (S.day >= 5) pool.push('errand');
  if (S.day >= 2 && !S.permit) pool.push('permitOffer');
  if (Math.random() < .55) {
    const e = pick(pool);
    if (e === 'press') queueCard({ title:'📰 Местная пресса', html:'<p>Корреспондент «Краснозаводской правды» пишет про «новых предпринимателей». Дадите интервью?</p>',
      buttons:[{ label:'Дать интервью', cls:'green', fn() { if (S.markup <= .5) { rep('folk', 4); toast('«Честный торговец с остановки». Народ +4', 'good'); } else { rep('folk', -3); toast('Статья вышла под заголовком «Спекулянты»... Народ −3', 'bad'); } } },
        { label:'Нет уж' }] });
    if (e === 'helpYard') queueCard({ title:'🏚 Двор просит помощи', html:'<p>В доме прорвало трубу. Соседи скидываются на сантехника.</p>',
      buttons:[{ label:`Скинуться ${fmt(usdToRub(3))} ₽`, cls:'green', disabled: S.money < usdToRub(3), fn() { S.money -= usdToRub(3); rep('folk', 5); toast('Народ +5', 'good'); } }, { label:'Пройти мимо', fn() { rep('folk', -1); } }] });
    if (e === 'palenka') { const q = 15, cost = Math.round(S.prices.vodka * .4);
      queueCard({ title:'🍾 Выгодное предложение', html:`<p>Мужик в кожанке: «Есть ящик «Короля», почти настоящий. ${q} бутылок по ${fmt(cost)} ₽. Берёшь?»</p>`,
        buttons:[{ label:`Взять за ${fmt(cost * q)} ₽`, disabled: S.money < cost * q || stockTotal() + q > storeCap(), fn() { S.money -= cost * q; addStock('vodka', q, cost); rep('street', 3); rep('law', -3); rep('folk', -2); toast('Улица +3, Закон −3, Народ −2'); } },
          { label:'Не надо мне палёнки', fn() { rep('folk', 1); } }] }); }
    if (e === 'chelnokDeal') queueCard({ title:'🧳 Челнок Ашот', html:'<p>«Давай дружить: дашь $10 — два дня будешь брать на рынке через меня, на 15% дешевле».</p>',
      buttons:[{ label:`Дать ${fmt(usdToRub(10))} ₽`, disabled: S.money < usdToRub(10), fn() { S.money -= usdToRub(10); S.cheap = 2; toast('Скидка 15% на рынке на 2 дня', 'good'); } }, { label:'Сам справлюсь' }] });
    if (e === 'errand') queueCard({ title:'📦 Поручение от «заводских»', html:'<p>Колян: «Отвези пакетик на вокзал. Что внутри — не твоё дело. Заплатим».</p>',
      buttons:[{ label:'Отвезти', cls:'red', fn() {
          if (Math.random() < .2) { rep('law', -10); const f = Math.min(S.money, usdToRub(15)); S.money -= f; toast(`Остановил патруль. Штраф ${fmt(f)} ₽, Закон −10`, 'bad'); }
          else { S.money += usdToRub(20); rep('street', 8); rep('law', -6); toast('+$20 рублями. Улица +8, Закон −6'); } } },
        { label:'Отказаться', fn() { rep('street', -3); } }] });
    if (e === 'permitOffer') queueCard({ title:'📄 Разрешение на торговлю', html:`<p>В администрации можно оформить разрешение. С ним проверки проходят спокойно.</p>`,
      buttons:[{ label:`Оформить честно (${fmt(usdToRub(25))} ₽)`, cls:'green', disabled: S.money < usdToRub(25), fn() { S.money -= usdToRub(25); S.permit = true; rep('law', 5); toast('Разрешение есть! Закон +5', 'good'); } },
        { label:`Через знакомого (${fmt(usdToRub(12))} ₽)`, disabled: S.money < usdToRub(12), fn() { S.money -= usdToRub(12); S.permit = true; rep('law', -2); rep('street', 2); toast('Бумага есть, но «через знакомых». Закон −2'); } },
        { label:'Потом' }] });
  }
}
function debtDeadline() {
  if (S.debt <= 0) {
    queueCard({ title:'Декабрь 1992', html:'<p>Колян приходит, пересчитывает старые записи дяди и кивает: «Чисто. Уважаю». Долг закрыт.</p>', buttons:[{ label:'С наступающим!', fn() { rep('street', 5); } }] });
    return;
  }
  const debtRub = usdToRub(S.debt);
  queueCard({ title:'⏰ Срок долга вышел', html:`<p>Последний вечер 1992-го. Колян с двумя друзьями стоит у ларька. За вами ещё <b>$${S.debt}</b> (${fmt(debtRub)} ₽).</p>`,
    buttons:[
      { label:`Отдать всё сейчас (${fmt(debtRub)} ₽)`, cls:'green', disabled: S.money < debtRub, fn() { S.money -= debtRub; S.debt = 0; rep('street', 3); toast('Долг закрыт в последний момент!', 'good'); } },
      { label:'«Отработать» — стать своим у «заводских»', cls:'red', fn() { S.debt = 0; S.flags.underRoof = true; rep('street', 20); rep('law', -15); toast('Теперь вы под «крышей». Улица +20, Закон −15'); } },
      { label:'Отдать товаром и половиной кассы', fn() { S.debt = 0; S.money = Math.round(S.money / 2); for (const id of GOOD_IDS) if (S.stock[id]) S.stock[id].q = Math.floor(S.stock[id].q / 3); rep('street', -5); toast('Начинаем 1993-й почти с нуля...', 'bad'); } },
    ] });
}
function advanceDay() {
  const prevDay = S.day;
  S.day++;
  // инфляция и курс
  const y = yearOf(S.day);
  let infl = y === 1992 ? R(.09, .16) : R(.06, .11);
  if (prevDay === 1) infl = R(.3, .4); // январский шок 92-го
  S.inflLast = infl;
  S.idx *= 1 + infl;
  let rateMove = infl + R(-.03, .04);
  // «Чёрный вторник» в свободном режиме (октябрь 1994)
  const blackTuesday = yearOf(S.day) === 1994 && monthOf(S.day) === 9;
  if (blackTuesday) rateMove += .35;
  S.rate = Math.round(S.rate * (1 + rateMove));
  S.rateHist.push(S.rate); if (S.rateHist.length > 30) S.rateHist.shift();
  // волны моды
  if (S.day === S.nextWaveDay) {
    S.wave = { item: S.flags.nextWaveItem, until: S.day + 2 };
    S.nextWaveDay = S.day + RI(4, 5); S.flags.nextWaveItem = null;
  }
  if (S.day + 1 === S.nextWaveDay) {
    const cand = ['tape','gum','soda','choc','batt','beer'].concat(S.day + 1 >= 13 ? ['toy','toy'] : []);
    S.flags.nextWaveItem = pick(cand.filter(c => !S.wave || c !== S.wave.item));
  }
  genPrices();
  if (S.cheap > 0) S.cheap--;
  // пирамида
  let pmpNews = null;
  if (S.pmp > 0 && !S.pmpDead) {
    if (S.day >= S.pmpCrashDay) { pmpNews = `Офис «ПМП» закрыт. Вкладчики стоят у дверей. Ваши ${fmt(S.pmp)} ₽ пропали.`; S.pmp = 0; S.pmpDead = true; }
    else S.pmp = Math.round(S.pmp * 1.3);
  } else if (!S.pmpDead && S.day >= S.pmpCrashDay) { S.pmpDead = true; pmpNews = 'Фонд «ПМП» лопнул. Хорошо, что вас там не было.'; }
  // ваучерный фонд
  let fundNews = null;
  if (S.voucher === 'fund' && S.day >= 18 && !S.fundGone) { S.fundGone = true; fundNews = 'Чековый фонд «Золотой телёнок» исчез вместе с офисом и ваучерами вкладчиков.'; }

  // новости
  const news = [];
  news.push(`Наступил ${MONTHS[monthOf(S.day)].toLowerCase()} ${yearOf(S.day)}-го. Цены за месяц выросли на ${Math.round(infl * 100)}%.`);
  news.push(`Курс доллара в обменниках: ${fmt(S.rate)} ₽.${blackTuesday ? ' ОБВАЛ РУБЛЯ! «Чёрный вторник»!' : ''}`);
  if (S.flags.nextWaveItem) news.push(`В Москве ажиотаж: все сметают «${GOODS[S.flags.nextWaveItem].short}». Скоро докатится и до нас!`);
  if (waveItem()) news.push(`Мода дня: «${GOODS[waveItem()].short}». Дефицит, цены на опте подскочили.`);
  if (pmpNews) news.push(pmpNews);
  if (fundNews) news.push(fundNews);
  if (!S.pmpDead && S.day >= 14 && S.day + 1 >= S.pmpCrashDay && Math.random() < .6 + .2 * S.sk.sense) news.push('Налоговая полиция заинтересовалась фондом «ПМП». Вкладчики волнуются.');
  if (yearOf(S.day) === 1994 && monthOf(S.day) === 8) news.push('Аналитики шепчутся: рубль перегрет, осенью возможны сюрпризы.');
  news.push(pick(['Краснозаводский завод снова задержал зарплату.', 'В ДК открылся видеосалон: «Терминатор-2» каждый вечер.', 'Синоптики обещают перемены погоды.',
    'Гороскоп от Глобы-младшего: Тельцам везёт в торговле.', 'На рынке поймали карманника. Будьте бдительны.', 'В городе открылся первый коммерческий банк «Красный капитал».',
    'Телемагазин: чудо-нож режет всё, даже консервную банку!', 'Депутаты горсовета спорят о новых налогах на ларьки.']));
  queueCard({ title:'📺 Новости', html:`<div class="tv"><div class="scr"><ul style="padding-left:18px;margin:0">${news.map(n => `<li>${n}</li>`).join('')}</ul></div><div class="brand">РУБИН</div></div>`,
    onShow: () => sfx.tv() });

  // начало главы 2
  if (S.day === 13 && !S.free) chapter2Intro();

  queueCard({ title:'☀️ Утро', html:`<p>${dateStr(S.day)}. Пора открывать ларёк.</p>${S.sp > 0 ? '<p class="warn">Есть очки навыков — загляните во вкладку «Герой».</p>' : ''}`,
    buttons:[{ label:'Вперёд', cls:'green', fn() { S.phase = 'morning'; tab = 'kiosk'; syncAmmoToWeapon(); save(); } }] });
}
function chapter2Intro() {
  queueCard({ title:'Глава 2 · 1993 «Ваучер»',
    html:`<p>Новый год вы встретили у телевизора. Страна делит заводы: каждому выдали по ваучеру — «две «Волги»», как обещали.</p>
      <p>В блокноте заказов появились новые товары и одежда 1993 года.</p>
      <p class="goal">Цель главы: открыть павильон ($500) и пережить 1993 год с хорошим капиталом.</p>` });
  const vsell = usdToRub(20);
  queueCard({ title:'🎫 Что делать с ваучером?',
    html:'<p>Ваучер можно вложить в чековый фонд, в акции родного завода или просто продать у метро.</p>',
    buttons:[
      { label:'Фонд «Золотой телёнок» (обещают ×10)', fn() { S.voucher = 'fund'; toast('Ваучер в фонде. Ждём ×10!'); } },
      { label:'Акции Краснозаводского завода', cls:'green', fn() { S.voucher = 'zavod'; rep('folk', 5); toast('Вы — совладелец завода! Народ +5', 'good'); } },
      { label:`Продать за ${fmt(vsell)} ₽`, fn() { S.voucher = 'sold'; S.money += vsell; } },
    ] });
}
function finale() {
  const cap = capitalUsd() + (S.voucher === 'zavod' ? 100 : 0);
  const r = S.rep;
  let end, text;
  if (r.street >= 40 && r.street >= r.law && r.street >= r.folk) {
    end = 'Хозяин района'; text = 'Вас знают все ларьки от остановки до вокзала. «Заводские» здороваются за руку, а милиция делает вид, что не замечает. Денег много, но спать приходится вполглаза.';
  } else if (r.law >= 20 && cap >= 600) {
    end = 'Легальный бизнесмен'; text = 'Разрешения, налоги, бухгалтер — всё по-взрослому. Банк «Красный капитал» предлагает кредит на сеть магазинов. Город уважает.';
  } else if (r.folk >= 20) {
    end = 'Свой человек'; text = 'Не олигарх, но весь двор покупает только у вас, бабушки приносят пирожки, а дети знают вас по имени. Скромный, но честный успех.';
  } else {
    end = 'Просто ларёчник'; text = 'Вы пережили два безумных года. Ни империи, ни славы — но ларёк стоит, и это уже немало.';
  }
  S.ending = end;
  queueCard({ title:'1993 · Итог', html:`<h2 style="color:var(--red)">${end}</h2><p>${text}</p>
    <div class="card"><div class="row sp"><span>Капитал</span><b>$${fmt(cap)}</b></div>
    <div class="row sp"><span>Улица / Закон / Народ</span><b>${Math.round(r.street)} / ${Math.round(r.law)} / ${Math.round(r.folk)}</b></div>
    <div class="row sp"><span>Вкладыши</span><b>${S.cards.length}/${CARD_NAMES.length}</b></div>
    <div class="row sp"><span>Павильон</span><b>${S.up.pavilion ? 'да' : 'нет'}</b></div></div>
    <p class="muted">Главы 3–8 (1994–1999: «Чёрный вторник», «Крыша», «Выборы», «Дефолт»...) — в следующих обновлениях. Можно продолжить в свободном режиме.</p>`,
    buttons:[{ label:'Продолжить торговать', cls:'green', fn() { S.free = true; S.phase = 'night'; save(); } }, { label:'Новая игра', fn() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} S = null; cards = []; render(); } }],
    onShow: () => sfx.fanfare() });
}

// ============================================================
//  Опыт и навыки
// ============================================================
const xpNeed = l => 30 + l * 35;
function checkLevel() {
  while (S.xp >= xpNeed(S.lvl)) { S.xp -= xpNeed(S.lvl); S.lvl++; S.sp++; toast(`Новый уровень ${S.lvl + 1}! +1 очко навыков`, 'good'); }
}



// ============================================================
//  Обменник
// ============================================================
function exchHtml() {
  const buyRate = Math.round(S.rate * 1.04), sellRate = Math.round(S.rate * .96);
  const trade = S.phase !== 'morning';
  const pmpOpen = (chapter() === 2 || S.free) && S.day >= 14 && !S.pmpDead;
  return `<h2>💱 Обменник «Валюта 24»</h2>
    <canvas class="chart" id="chart"></canvas>
    <div class="row sp" style="margin-top:6px"><span>Купить $: <b>${fmt(buyRate)} ₽</b></span><span>Продать $: <b>${fmt(sellRate)} ₽</b></span></div>
    <p class="muted">Рубли тают каждый месяц. Доллары под матрасом — классика эпохи.</p>
    <div class="card"><div class="row sp"><b>Купить доллары</b><span>
      <button class="btn small" data-usd="buy" data-n="1" ${trade ? 'disabled' : ''}>$1</button>
      <button class="btn small" data-usd="buy" data-n="10" ${trade ? 'disabled' : ''}>$10</button>
      <button class="btn small" data-usd="buy" data-n="all" ${trade ? 'disabled' : ''}>На все</button></span></div>
      <div class="row sp" style="margin-top:8px"><b>Продать доллары</b><span>
      <button class="btn small" data-usd="sell" data-n="1" ${trade ? 'disabled' : ''}>$1</button>
      <button class="btn small" data-usd="sell" data-n="10" ${trade ? 'disabled' : ''}>$10</button>
      <button class="btn small" data-usd="sell" data-n="all" ${trade ? 'disabled' : ''}>Все</button></span></div></div>
    ${S.debt > 0 ? `<div class="card goal"><b>Долг «заводским»: $${S.debt}</b><div class="muted">Отдавать нужно в долларах. Срок — декабрь 1992.</div>
      <div class="row" style="margin-top:8px"><button class="btn small red" data-a="paydebt" ${S.usd < 1 || trade ? 'disabled' : ''}>Отдать $${Math.min(S.usd, S.debt)}</button></div></div>` : ''}
    ${pmpOpen || S.pmp > 0 ? `<div class="card"><b>🏦 Фонд «ПМП» — 30% в месяц!</b>
      <div class="muted">«Мы не летаем — мы растём!» Вложено сейчас: <b>${fmt(S.pmp)} ₽</b>. Выйти можно в любой момент... пока офис открыт.</div>
      <div class="row" style="margin-top:8px;gap:6px">
        <button class="btn small yellow" data-a="pmpIn" ${S.money < 100 || trade || S.pmpDead ? 'disabled' : ''}>Вложить ¼ кассы</button>
        <button class="btn small" data-a="pmpOut" ${S.pmp <= 0 || trade ? 'disabled' : ''}>Забрать всё</button></div></div>` : ''}
    ${S.voucher ? `<div class="card"><b>🎫 Ваучер:</b> ${{ fund: S.fundGone ? 'фонд «Золотой телёнок» исчез 🙃' : 'в фонде «Золотой телёнок» (обещают ×10)', zavod:'акции завода, дивиденды каждый месяц', sold:'продан' }[S.voucher]}</div>` : ''}`;
}
function drawChart() {
  const c = $('#chart'); if (!c) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const d = S.rateHist, mx = Math.max(...d) * 1.05, mn = Math.min(...d) * .95;
  g.strokeStyle = '#2f4a4a'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, h * i / 4); g.lineTo(w, h * i / 4); g.stroke(); }
  g.strokeStyle = '#7fe0a0'; g.lineWidth = 2; g.beginPath();
  d.forEach((v, i) => { const x = d.length === 1 ? w / 2 : 8 + i * (w - 16) / (d.length - 1), y = h - 10 - (v - mn) / (mx - mn || 1) * (h - 24); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
  g.fillStyle = '#d6f0e0'; g.font = '700 12px "Courier New", monospace'; g.fillText('USD/RUB  ' + fmt(S.rate), 8, 16);
}
function usdOp(kind, n) {
  const buyRate = Math.round(S.rate * 1.04), sellRate = Math.round(S.rate * .96);
  if (kind === 'buy') {
    const k = n === 'all' ? Math.floor(S.money / buyRate) : Math.min(+n, Math.floor(S.money / buyRate));
    if (k <= 0) { toast('Не хватает рублей', 'bad'); return; }
    S.money -= k * buyRate; S.usd += k;
  } else {
    const k = n === 'all' ? S.usd : Math.min(+n, S.usd);
    if (k <= 0) { toast('Нет долларов', 'bad'); return; }
    S.usd -= k; S.money += k * sellRate;
  }
  sfx.coin(); render();
}

// ============================================================
//  Герой
// ============================================================
// долг, фонд «ПМП» и ваучер (раньше были в обменнике, который убран)
const debtPayable = () => Math.min(S.debt, S.usd + Math.floor(S.money / Math.round(S.rate * 1.04)));
function financeHtml() {
  const trade = S.phase !== 'morning';
  const pmpOpen = (chapter() === 2 || S.free) && S.day >= 14 && !S.pmpDead;
  return `${S.debt > 0 ? `<div class="card goal"><b>Долг «заводским»: $${S.debt}</b><div class="muted">Долг в долларах, отдаётся рублями по курсу ${fmt(Math.round(S.rate * 1.04))} ₽ за $1. Срок — декабрь 1992.</div>
      <div class="row" style="margin-top:8px"><button class="btn small red" data-a="paydebt" ${debtPayable() < 1 || trade ? 'disabled' : ''}>Отдать $${debtPayable()} (${fmt(Math.max(0, debtPayable() - S.usd) * Math.round(S.rate * 1.04))} ₽)</button></div></div>` : ''}
    ${pmpOpen || S.pmp > 0 ? `<div class="card"><b>🏦 Фонд «ПМП» — 30% в месяц!</b>
      <div class="muted">«Мы не летаем — мы растём!» Вложено сейчас: <b>${fmt(S.pmp)} ₽</b>. Выйти можно в любой момент... пока офис открыт.</div>
      <div class="row" style="margin-top:8px;gap:6px">
        <button class="btn small yellow" data-a="pmpIn" ${S.money < 100 || trade || S.pmpDead ? 'disabled' : ''}>Вложить ¼ кассы</button>
        <button class="btn small" data-a="pmpOut" ${S.pmp <= 0 || trade ? 'disabled' : ''}>Забрать всё</button></div></div>` : ''}
    ${S.voucher ? `<div class="card"><b>🎫 Ваучер:</b> ${{ fund: S.fundGone ? 'фонд «Золотой телёнок» исчез 🙃' : 'в фонде «Золотой телёнок» (обещают ×10)', zavod:'акции завода, дивиденды каждый месяц', sold:'продан' }[S.voucher]}</div>` : ''}`;
}
function heroHtml() {
  const SK = [['trade', 'Торговля', 'дешевле закупка (−4%/ур.)'], ['charm', 'Обаяние', 'покупатели терпимее к цене'], ['sense', 'Чуйка', 'больше терпения, легче ловить фальшивки; на 2 ур. видно, сколько готов дать покупатель']];
  const ch = chapter();
  const goal = S.free ? 'Свободная торговля. Капитал: $' + fmt(capitalUsd())
    : ch === 1 ? (S.debt > 0 ? `Отдать долг $${S.debt} до декабря 1992` : 'Долг отдан. Доживите до 1993-го и копите.')
    : (S.up.pavilion ? 'Павильон открыт. Доживите до конца 1993 и наберите капитал.' : 'Открыть павильон ($500) до конца 1993');
  const mk = Math.round(S.markup * 100);
  const mkLabel = mk <= 25 ? 'по-честному' : mk <= 60 ? 'как все' : mk <= 100 ? 'дерзко' : 'грабёж';
  const ups = Object.entries(UPGRADES).filter(([k, u]) => !S.up[k] && (!u.from || S.day >= u.from));
  return `<h2>👤 ${esc(S.name)}</h2>
    <div class="card goal"><b>Цель:</b> ${goal}</div>
    <div class="row"><div style="font-size:54px;width:80px;text-align:center">${OUTFITS[S.outfit].icon}</div>
      <div><div><b>Уровень ${S.lvl + 1}</b></div><div class="muted">Опыт ${S.xp}/${xpNeed(S.lvl)}</div>
      <div class="muted">${OUTFITS[S.outfit].icon} ${OUTFITS[S.outfit].name}</div>
      <div class="muted">${S.permit ? '📄 Разрешение на торговлю' : '📄 Без разрешения'}</div>
      <div class="muted">Капитал ≈ $${fmt(capitalUsd())} · На полках: ${stockTotal()}/${storeCap()}</div></div></div>
    <h3>Наценка на товар: ${mk}% <span class="chip">${mkLabel}</span></h3>
    <input type="range" min="0" max="150" step="5" value="${mk}" data-range="markup">
    <p class="muted">Чтобы выставить товар на продажу, возьмите его рукой с полки в ларьке и поставьте на стеклянную витрину у окна.</p>
    ${ups.length ? '<h3>Улучшения</h3>' + ups.map(([k, u]) => `<div class="card row sp"><div><b>${u.icon} ${u.name}</b><div class="muted">${u.desc}</div></div>
        <button class="btn small yellow" data-up="${k}" ${S.money < usdToRub(u.usd) ? 'disabled' : ''}>${fmt(usdToRub(u.usd))} ₽</button></div>`).join('') : ''}
    <h3>Навыки ${S.sp ? `<span class="chip">очков: ${S.sp}</span>` : ''}</h3>
    <div class="card">${SK.map(([k, n, d]) => `<div class="skill"><div class="lv">${'★'.repeat(S.sk[k])}${'☆'.repeat(Math.max(0, 3 - S.sk[k]))}</div>
      <div style="flex:1"><b>${n}</b><div class="muted">${d}</div></div><button class="btn small" data-skill="${k}" ${S.sp > 0 && S.sk[k] < 3 ? '' : 'disabled'}>+</button></div>`).join('')}</div>
    <h3>Репутация</h3>
    <div class="card">
      <p><b>Улица ${Math.round(S.rep.street)}</b> — «заводские». От +30 ночью не трогают, от +40 «крыша» берёт меньше.</p>
      <p><b>Закон ${Math.round(S.rep.law)}</b> — милиция и администрация. Высокий — реже проверки.</p>
      <p><b>Народ ${Math.round(S.rep.folk)}</b> — жители. Больше покупателей и терпимее к цене. Ниже −40 — бойкот.</p></div>
    <h3>Альбом вкладышей «Турбина» ${S.cards.length}/${CARD_NAMES.length}</h3>
    <p class="muted">Каждые 10 купленных жвачек — шанс на вкладыш. Полный альбом — сюрприз.</p>
    <div class="cards">${CARD_NAMES.map((n, i) => `<div class="${S.cards.includes(i) ? 'got' : ''}" title="${S.cards.includes(i) ? n : '?'}">${S.cards.includes(i) ? '🏎' : '?'}</div>`).join('')}</div>
`;
}
function setHtml() {
  const st = SET, q = st.quality, cq = Object.assign({}, QUALITY[q], st.custom || {});
  const sel = (k, opts, cur) => `<select data-set="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const rng = (k, min, max, step, val, fmtv) => `<input type="range" data-set="${k}" min="${min}" max="${max}" step="${step}" value="${val}"><span class="muted">${fmtv(val)}</span>`;
  return `<h2>⚙ Опции</h2>
    <h3>Графика</h3>
    <div class="seg">${Object.entries(QUALITY).map(([k, v]) => `<button data-quality="${k}" class="${q === k && !st.custom ? 'on' : ''}">${v.label}</button>`).join('')}</div>
    <div class="card setgrid">
      <label>Тени ${sel('shadows', [[0, 'выкл'], [1024, 'низкие'], [2048, 'высокие'], [4096, 'максимум']], cq.shadows)}</label>
      <label>Дальность прорисовки ${rng('draw', 60, 240, 10, cq.draw, v => v + ' м')}</label>
      <label>Качество освещения ${sel('light', [[0, 'простое'], [1, 'тени от лампы'], [2, 'полное']], cq.light)}</label>
      <label>Плотность снега ${rng('snow', 0, 5000, 100, cq.snow, v => v)}</label>
      <label>Количество людей ${rng('npc', 6, 30, 1, cq.npc, v => v)}</label>
      <label>Качество текстур ${sel('aniso', [[1, 'низкое'], [2, 'среднее'], [4, 'высокое'], [8, 'максимум']], cq.aniso)}</label>
      <label>Разрешение ${sel('dpr', [[.7, '70%'], [.9, '90%'], [1.1, '110%'], [1.4, '140%'], [2, '200%']], cq.dpr)}</label>
    </div>
    <h3>Эффекты</h3>
    <div class="card setgrid">
      <label>Кинематографичный ретро-фильтр ${sel('retro', [[0, 'выключен'], [1, 'включён']], st.retro ? 1 : 0)}</label>
    </div>
    <h3>Камера</h3>
    <div class="card setgrid">
      <label>Покачивание при ходьбе ${rng('bob', 0, 2, .1, st.bob, v => Math.round(v * 100) + '%')}</label>
      <label>Чувствительность обзора ${rng('sens', .3, 3, .05, controls ? controls.lookSens : 1, v => (+v).toFixed(2))}</label>
    </div>
    <h3>Звук</h3>
    <div class="card setgrid">
      <label>Общая громкость ${rng('master', 0, 1, .05, st.master, v => Math.round(v * 100) + '%')}</label>
      <label>Радио ${rng('radio', 0, 1, .05, st.radio, v => Math.round(v * 100) + '%')}</label>
      <label>Город и ветер ${rng('ambience', 0, 1, .05, st.ambience, v => Math.round(v * 100) + '%')}</label>
      <div class="row" style="gap:8px"><button class="btn small" data-a="radio">${audio.radioOn ? '📻 Радио: вкл' : '📻 Радио: выкл'}</button><button class="btn small" data-a="mute">${S.mute ? '🔇 Звук выкл' : '🔊 Звук вкл'}</button></div>
    </div>
    <h3>Управление</h3>
    <div class="card"><p class="muted">Двигайте, добавляйте и удаляйте кнопки, меняйте размер, прозрачность, зону нажатия и действие. Можно сохранить несколько профилей.</p>
      <button class="btn big yellow" data-a="editctl">Редактор управления</button></div>
    ${S.phase === 'night' || S.phase === 'evening' ? '<button class="btn big blue" data-a="sleep">😴 Спать до утра</button>' : ''}
    <div class="row" style="gap:8px;margin-top:12px"><button class="btn small red" data-a="reset">Начать заново</button></div>`;
}
// ============================================================
//  События ввода
// ============================================================
document.addEventListener('click', e => {
  au();
  const el = e.target.closest('button, [data-a]'); if (!el || el.disabled) return;
  if (el.closest('#mbox')) return; // модалки обрабатываются отдельно
  const d = el.dataset;
  if (d.tab) { if (S.phase === 'trade' && d.tab === 'exch') return; tab = d.tab; sfx.click(); render(); $('#screen').scrollTop = 0; return; }
  if (!S && !['new', 'continue'].includes(d.a)) return;
  if (d.slot !== undefined) {
    if (S.phase === 'evening') return;
    openSlotPicker(+d.slot); return;
  }
  if (d.opt !== undefined) { chooseOpt(+d.opt); return; }
  if (d.buy) { buy(d.buy, +d.n); return; }
  if (d.src) { S.src = d.src; sfx.click(); render(); return; }
  if (d.quality) { SET.quality = d.quality; SET.custom = null; saveSet(); W && W.applyQuality(Object.assign({}, QUALITY[d.quality])); render(); return; }
  if (d.outfit) { const o = OUTFITS[d.outfit], p = usdToRub(o.usd); if (S.money < p) return; S.money -= p; S.owned.push(d.outfit); S.outfit = d.outfit;
    if (d.outfit === 'sport') rep('street', 5); sfx.ching(); toast('Обновка! ' + o.name, 'good'); render(); return; }
  if (d.wear) { S.outfit = d.wear; sfx.click(); render(); return; }
  if (d.up) { const u = UPGRADES[d.up], p = usdToRub(u.usd); if (S.money < p) return; S.money -= p; S.up[d.up] = true;
    if (d.up === 'pavilion') { S.slots = S.slots.concat([null, null, null]).slice(0, 9); sfx.fanfare(); toast('Павильон открыт! Цель главы выполнена', 'good'); }
    else { sfx.ching(); toast(u.name + ' — готово!', 'good'); }
    render(); return; }
  if (d.usd) { usdOp(d.usd, d.n); return; }
  if (d.skill) { if (S.sp > 0 && S.sk[d.skill] < 3) { S.sp--; S.sk[d.skill]++; sfx.ching(); render(); } return; }
  switch (d.a) {
    case 'new': if (load()) queueCard({ title:'Начать заново?', html:'<p>Текущее сохранение пропадёт.</p>', buttons:[{ label:'Да, заново', cls:'red', fn() { setTimeout(startNewFlow, 0); } }, { label:'Отмена' }] }); else startNewFlow(); break;
    case 'continue': S = load(); if (S.phase !== 'night') S.phase = 'morning'; S.gunState = S.gunState || 'wall'; S.gun = S.gunState === 'carried'; S.shells = S.shells ?? 0; S.ammo = S.ammo ?? 2; S.order = S.order || { lines: {}, hidden: {} }; S.deliveries = S.deliveries || []; S.items = S.items || []; S.slotCounts = S.slotCounts || S.slots.map(id => id ? 1 : 0); S.shelfPlacements = S.shelfPlacements || []; S.hidden = S.hidden || {}; S.cigs = S.cigs || 0; S.butts = S.butts || 0; tab = 'kiosk'; if (W) W.reset(); syncAmmoToWeapon(); offlineIncome(); render(); break;
    case 'shells': { const p = usdToRub(3); if (S.money < p) return; S.money -= p; if (W) W.weapon.reserve += 5; else S.shells += 5; syncAmmoFromWeapon(); sfx.coin(); toast('Пачка патронов: +5', 'good'); render(); break; }
    case 'editctl': sheetOpen = false; render(); controls && controls.setEditing(true); renderControls(); break;
    case 'sleep': sheetOpen = false; sleep(); break;
    case 'hiddenOffer': offerHidden(); break;
    case 'radio': audio.radioToggle(); render(); break;
    case 'sheet': sheetOpen ? closeSheet() : openSheet(); break;
    case 'closeSheet': closeSheet(); break;
    case 'vitrine': openSheet('kiosk'); break;
    case 'gocounter': if (W) { sheetOpen = false; W.goCounter(false); render(); } break;
    case 'open': startTrade(); break;
    case 'auto': { const r = autoDay(); S.phase = 'trade'; eveningFlow(r); break; }
    case 'hire': S.seller = true; sfx.ching(); toast('Тётя Люба вышла на смену!', 'good'); render(); break;
    case 'sell': case 'discount': case 'next': act(d.a); break;
    case 'paydebt': { const k = debtPayable(); if (k < 1) break; const fromUsd = Math.min(S.usd, k), rub = (k - fromUsd) * Math.round(S.rate * 1.04); S.usd -= fromUsd; S.money -= rub; S.debt -= k; sfx.ching(); toast(S.debt ? `Отдали $${k}. Осталось $${S.debt}` : 'Долг закрыт! Колян уважает.', 'good'); if (!S.debt) rep('street', 5); render(); break; }
    case 'pmpIn': { const k = Math.round(S.money / 4); S.money -= k; S.pmp += k; sfx.coin(); toast(`Вложено ${fmt(k)} ₽ в «ПМП»`); render(); break; }
    case 'pmpOut': { S.money += S.pmp; toast(`Забрали ${fmt(S.pmp)} ₽ из «ПМП»`, 'good'); S.pmp = 0; sfx.ching(); render(); break; }
    case 'mute': S.mute = !S.mute; audio.setMuted(S.mute); render(); break;
    case 'reset': queueCard({ title:'Начать заново?', html:'<p>Весь прогресс пропадёт.</p>', buttons:[{ label:'Да', cls:'red', fn() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} S = null; T = null; render(); } }, { label:'Отмена' }] }); break;
  }
});
document.addEventListener('input', e => {
  if (e.target.dataset.range === 'markup') {
    S.markup = +e.target.value / 100;
    const vit = document.querySelector('.vit'); if (vit) vit.outerHTML = vitrineHtml();
    const h = e.target.previousElementSibling; const mk = Math.round(S.markup * 100);
    if (h) h.innerHTML = `Наценка на товар: ${mk}% <span class="chip">${mk <= 25 ? 'по-честному' : mk <= 60 ? 'как все' : mk <= 100 ? 'дерзко' : 'грабёж'}</span>`; if (W) W.updateShelves();
  }
});
document.addEventListener('change', e => { if (e.target.dataset.range) save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (S && (S.phase === 'morning' || S.phase === 'night')) save(); audio.suspend(); } else audio.resume(); });
document.addEventListener('input', e => {
  const k = e.target.dataset.set; if (!k) return;
  const v = +e.target.value; const sp = e.target.nextElementSibling;
  if (['bob', 'master', 'radio', 'ambience'].includes(k)) { SET[k] = v; if (k !== 'bob') audio.setVolume(k, v); if (sp) sp.textContent = Math.round(v * 100) + '%'; }
  else if (k === 'retro') { SET.retro = v; W && W.setRetro(v); }
  else if (k === 'sens') { if (controls) controls.lookSens = v; if (sp) sp.textContent = v.toFixed(2); }
  else { SET.custom = Object.assign({}, QUALITY[SET.quality], SET.custom || {}, { [k]: v }); if (sp) sp.textContent = k === 'draw' ? v + ' м' : v; W && W.applyQuality(SET.custom); }
  saveSet();
});

function offlineIncome() {
  if (!S.seller || !S.lastSeen) return;
  const hours = Math.min(8, (Date.now() - S.lastSeen) / 3.6e6);
  if (hours < .1) return;
  const r = autoDay(hours);
  if (r.rev <= 0) return;
  queueCard({ title:'👩 Пока вас не было', html:`<p>Тётя Люба торговала ${hours.toFixed(1)} ч и наторговала <b>${fmt(r.rev - r.theft)} ₽</b> (продано ${r.sold} шт.).</p>
    ${r.theft ? `<p class="muted">Касса почему-то не сходится на ${fmt(r.theft)} ₽...</p>` : ''}<p class="muted">Лимит — 8 часов.</p>` });
  save();
}

// ============================================================
//  Заказы: бумажный блокнот, телефон, доставка, распаковка, товар из-под полы
// ============================================================
const CATS = [
  ['Продукты', ['bread', 'choc', 'toy']], ['Консервы', ['tushonka', 'kilka']], ['Напитки', ['soda', 'beer']], ['Сигареты', ['cig']],
  ['Жвачка', ['gum']], ['Журналы', ['paper', 'mag', 'mag2']], ['Алкоголь', ['vodka']], ['Прочее', ['batt', 'tape', 'outfit:sport', 'outfit:varenki', 'outfit:raspberry', 'outfit:business']],
  ['Карандашом…', ['h:samogon', 'h:kontra']],
];
const DELIV = { min: 1.5, rate: .06 };
let npOpen = false, npCat = 0, npBusy = false;
const ordQty = id => (id.startsWith('h:') ? S.order.hidden[id.slice(2)] : S.order.lines[id]) || 0;
function lineInfo(id) {
  if (id.startsWith('h:')) { const k = id.slice(2); return { name: HIDDEN[k].name, unit: hiddenPrice(k), pack: 1, avail: true, hidden: true }; }
  if (id.startsWith('outfit:')) { const k = id.slice(7), o = OUTFITS[k]; return { name: o.name, unit: usdToRub(o.usd), pack: 1, avail: (!o.from || S.day >= o.from) && !S.owned.includes(k), outfit: true }; }
  return { name: GOODS[id].name, unit: S.prices[id], pack: 5, avail: goodAvail(id) };
}
function orderSum(hidden) {
  let sum = 0, n = 0; const src = hidden ? S.order.hidden : S.order.lines;
  for (const [k, q] of Object.entries(src)) { if (!q) continue; const li = lineInfo(hidden ? 'h:' + k : k); sum += li.unit * q; n += q; }
  const deliv = n ? Math.round(Math.max(usdToRub(DELIV.min), sum * DELIV.rate)) : 0;
  return { sum, deliv, total: sum + deliv, n };
}
function setOrd(id, q) { q = Math.max(0, Math.min(200, q)); if (id.startsWith('h:')) S.order.hidden[id.slice(2)] = q; else S.order.lines[id] = q; if (!q) { delete S.order.hidden[id.slice(2)]; delete S.order.lines[id]; } save(); }
function notepadHtml() {
  const [cname, ids] = CATS[npCat], hid = cname.startsWith('Карандаш');
  const o = orderSum(false), oh = orderSum(true);
  const lines = Object.entries(S.order.lines).filter(([, q]) => q).map(([k, q]) => `<div class="np-ln"><span>${lineInfo(k).name.replace(/«|»/g, '')}</span><span>${q} шт</span><span>${fmt(lineInfo(k).unit * q)}</span><button data-np="del" data-id="${k}">×</button></div>`).join('') || '<div class="np-ln np-dim">пока пусто…</div>';
  const pend = (S.deliveries || []).length;
  return `<div class="np-book">
    <div class="np-cover"></div><div class="np-stack"></div>
    <div class="np-sheet"><div class="np-page ${hid ? 'np-pencilpage' : ''}">
      <div class="np-label">ЗАКАЗЫ · 1992</div>
      <div class="np-cats">${CATS.map(([n], i) => `<button data-np="cat" data-i="${i}" class="${i === npCat ? 'on' : ''} ${n.startsWith('Карандаш') ? 'pencil' : ''}">${n}</button>`).join('')}</div>
      <div class="np-cols">
        <div class="np-colL">
          <div class="np-h">${cname}</div>
          ${hid ? '<div class="np-dim">для своих. Вова с вокзала, звонить вечером.</div>' : ''}
          ${ids.map(id => { const li = lineInfo(id); if (!li.avail) return ''; const q = ordQty(id);
            return `<div class="np-item"><div class="np-nm">${li.name}</div><div class="np-pr">${fmt(li.unit)} р.${li.pack > 1 ? '/шт' : ''}</div>
              <div class="np-q"><button data-np="q" data-id="${id}" data-d="-${li.pack}">−</button><span>${q}</span><button data-np="q" data-id="${id}" data-d="${li.pack}">+</button></div></div>`; }).join('')}
        </div>
        <div class="np-colR">
          <div class="np-h">Заказ на базу «Оптторг»</div>
          ${lines}
          <div class="np-sum"><div>товар: <b>${fmt(o.sum)} р.</b></div><div>доставка (прим.): <b>${fmt(o.deliv)} р.</b></div><div class="np-tot">итого: ${fmt(o.total)} р.</div></div>
          ${oh.n ? `<div class="np-pencil">Вове: ${oh.n} шт на ${fmt(oh.total)} р.</div>` : ''}
          <div class="np-note">${o.n || oh.n ? '→ позвонить с телефона на прилавке, подтвердить' : ''}${pend ? `<br>везут: ${pend} заказ(а)` : ''}</div>
          <div class="np-dim">в кассе: ${fmt(S.money)} р.</div>
        </div>
      </div>
    </div><div class="np-flip"></div></div>
    <div class="np-rings">${'<i></i>'.repeat(16)}</div>
  </div>
  <div class="np-bar"><button data-np="clear">Очистить заказ</button><button data-np="close" class="np-close">Убрать блокнот</button></div>`;
}
function renderNotepad() { const el = $('#notepad'); if (!el) return; el.innerHTML = notepadHtml(); }
function openOrders() {
  if (npOpen || npBusy || !W) return; npBusy = true; sfx.click();
  W.openNotepadAnim(() => { npBusy = false; npOpen = true; const el = $('#notepad'); renderNotepad(); el.classList.add('on', 'enter'); setTimeout(() => el.classList.remove('enter'), 450); renderControls(); });
  renderControls();
}
function closeOrders() {
  if (!npOpen) return; npOpen = false; const el = $('#notepad'); el.classList.remove('on'); npBusy = true;
  setTimeout(() => W.closeNotepadAnim(() => { npBusy = false; renderControls(); }), 250); renderControls();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-np]'); if (!b || !npOpen) return; e.stopPropagation();
  const a = b.dataset.np; sfx.click();
  if (a === 'close') { closeOrders(); return; }
  if (a === 'cat') { const i = +b.dataset.i; if (i === npCat) return; const fl = document.querySelector('.np-flip'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); audio.click(2400, .25, 0, .12); setTimeout(() => { npCat = i; renderNotepad(); }, 280); return; }
  if (a === 'q') { setOrd(b.dataset.id, ordQty(b.dataset.id) + +b.dataset.d); }
  if (a === 'del') setOrd(b.dataset.id, 0);
  if (a === 'clear') { S.order = { lines: {}, hidden: {} }; save(); }
  renderNotepad();
}, true);

// --- Кладовщик Геннадий на проходной «Краснозаводского завода» ---
function factoryTalk() {
  if (!W || !S) return;
  const gNpc = W.debug.people.find(p => p.role === 'zavod');
  if (gNpc) gNpc.talking = true;
  const done = () => { if (gNpc) gNpc.talking = false; closeDialog(); };
  const disc = .80; // на заводе отпускная цена на 20% ниже оптовой и без платы за доставку!
  const LOTS = [
    { id: 'beer',     qty: 10, title: 'Ящик пива «Заводское» (10 бут. / 2 уп.)' },
    { id: 'tushonka', qty: 10, title: 'Коробка тушёнки «Говядина» (10 бан. / 2 уп.)' },
    { id: 'cig',      qty: 10, title: 'Коробка сигарет «Космонавт» (10 пач. / 2 блока)' },
    { id: 'soda',     qty: 10, title: 'Ящик лимонада «Буратинка» (10 бут. / 2 уп.)' },
    { id: 'vodka',    qty: 10, title: 'Ящик спирта «Король» (10 бут. / 2 уп.)' },
  ];
  const buyLot = (lot, toKiosk = false) => {
    const unit = Math.max(1, Math.round((S.prices[lot.id] || GOODS[lot.id].base) * disc));
    const cost = unit * lot.qty;
    if (S.money < cost) {
      showDialog({
        name: 'Кладовщик Геннадий',
        text: `Наличных не хватает, коммерсант. Нужно ${fmt(cost)} ₽, а у тебя в кассе ${fmt(S.money)} ₽.`,
        options: [{ label: 'Понял', fn: () => factoryTalk() }]
      });
      return;
    }
    S.money -= cost;
    const contents = { [lot.id]: [lot.qty, unit] };
    if (toKiosk) {
      const etaH = R(.35, .65);
      S.deliveries = S.deliveries || [];
      S.deliveries.push({ contents, hidden: false, label: '«Заводской сбыт»', etaHours: etaH, eta: etaH * 90, state: 'way' });
      sfx.coin(); renderHud(); save();
      showDialog({
        name: 'Кладовщик Геннадий',
        text: 'Оформил пропуск! Наш заводской грузовик по пути закинет коробку прямо к двери твоего ларька.',
        options: [{ label: 'Спасибо, Геннадий!', fn: done }]
      });
    } else {
      if (W.spawnFactoryBox) W.spawnFactoryBox(contents);
      sfx.coin(); renderHud(); save();
      toast('Коробка с завода выдана! Возьмите её у проходной и везите на автобусе №7.', 'good');
      showDialog({
        name: 'Кладовщик Геннадий',
        text: 'Вынес коробку со штампом ОТК — вон у проходной стоит! Можешь прямо в руки взять, зайти с ней в ПАЗик к Дяде Коле и довезти до ларька, или распаковать на месте.',
        options: [{ label: 'Отлично, забираю!', fn: done }]
      });
    }
  };
  showDialog({
    name: 'Кладовщик Геннадий (Краснозаводский завод)',
    text: 'Здорово! Добрался-таки на седьмом автобусе до нашего завода? У нас в отделе сбыта для своих отпускные цены на 20% ниже городских — прямо с конвейера, в заводских коробках по 10 штук!',
    options: [
      ...LOTS.map(lot => {
        const unit = Math.max(1, Math.round((S.prices[lot.id] || GOODS[lot.id].base) * disc));
        const cost = unit * lot.qty;
        return {
          label: `📦 ${lot.title} — ${fmt(cost)} ₽ (−20%)`,
          fn: () => showDialog({
            name: 'Кладовщик Геннадий',
            text: `${lot.title} по заводской цене — ${fmt(cost)} ₽ (${fmt(unit)} ₽/шт.). Вынести коробку прямо сюда к проходной (увезёшь сам на автобусе без доплаты за доставку) или отправить попутной заводской машиной к ларьку?`,
            options: [
              { label: `Взять коробку здесь за ${fmt(cost)} ₽`, fn: () => buyLot(lot, false) },
              { label: `Отправить к ларьку за ${fmt(cost)} ₽`, fn: () => buyLot(lot, true) },
              { label: 'Назад к списку', fn: () => factoryTalk() },
            ]
          })
        };
      }),
      {
        label: 'Как завод живёт в 92-м?',
        fn: () => showDialog({
          name: 'Кладовщик Геннадий',
          text: 'Гудит помаленьку! Первый механосборочный цех и котельная в две смены пашут, а зарплату людям часто бартером выдают — тушёнкой да заводским пивом. Потому через отдел сбыта за живые рубли всегда рады отгрузить!',
          options: [{ label: 'Понятно', fn: () => factoryTalk() }]
        })
      },
      { label: 'Бывай, Геннадий', fn: done }
    ]
  });
}

// --- Марат: патроны на остановке ---
function maratTalk() {
  if (!W) return; const m = W.debug.people.find(p => p.role === 'marat'); if (m) m.talking = true;
  const done = () => { if (m) m.talking = false; closeDialog(); };
  if (S.flags.maratAngry === S.day) { showDialog({ name: 'Марат', text: 'Ты на меня ствол наставлял. Сегодня — разговора нет. Иди.', options: [{ label: 'Ладно…', fn: done }] }); return; }
  if (!S.marat || S.marat.day !== S.day) S.marat = { day: S.day, stock: RI(10, 25) };
  const price5 = usdToRub(4), have = S.marat.stock;
  const buy = n => { const cost = price5 * n / 5; if (have < n) { showDialog({ name: 'Марат', text: `Столько нет. Осталось ${have}.`, options: [{ label: 'Понял', fn: () => maratTalk() }] }); return; } if (S.money < cost) { showDialog({ name: 'Марат', text: 'Денег не хватает, брат. Без денег — никак.', options: [{ label: 'Понял', fn: done }] }); return; }
    S.money -= cost; S.marat.stock -= n; if (W) { W.weapon.reserve += n; syncAmmoFromWeapon(); } else S.shells += n; sfx.coin(); renderHud(); save();
    showDialog({ name: 'Марат', text: pick(['Держи. И не свети особо.', 'Двенадцатый калибр, дробь. Как договаривались.', 'Бери. Если что — ты меня не знаешь.']), options: [{ label: 'Спасибо', fn: done }] }); };
  showDialog({ name: 'Марат', text: S.gunState === 'wall' && !S.flags.maratMet ? 'Ты с ларька? Слыхал, у тебя дядина двустволка на стене висит. Патроны нужны — ко мне. Пять штук — ' + fmt(price5) + '.' : `Патроны есть, ${have} штук. Пять — ${fmt(price5)} р. Берёшь?`, options: [
    { label: `Пачку (5 шт) — ${fmt(price5)} р.`, fn() { buy(5); } },
    { label: `Две пачки (10 шт) — ${fmt(price5 * 2)} р.`, fn() { buy(10); } },
    { label: 'Что слышно в районе?', fn() { showDialog({ name: 'Марат', text: pick([`Заводские опять по ларькам ходят. ${S.rep.street >= 30 ? 'Но тебя не тронут — ты свой.' : 'Смотри в оба.'}`, 'Говорят, на вокзале самогон дешёвый. Вова там знает.', 'Курс скачет, держи в долларах.', 'Автобус до завода каждые десять минут, если не сломался.']), options: [{ label: 'Ясно', fn: () => maratTalk() }] }); } },
    { label: 'Бывай', fn: done },
  ] });
  S.flags.maratMet = true;
}
// --- телефон: атмосферный звонок с гудками ---
let callBusy = false;
function phoneCall() {
  if (callBusy || !W) return;
  const o = orderSum(false), oh = orderSum(true);
  showDialog({ name: 'Телефон', text: 'Кому звонить? Номера записаны на обоях карандашом.', options: [
    { label: `«Оптторг» — база${o.n ? ` (заказ: ${o.n} шт, ${fmt(o.total)} р.)` : ''}`, fn() { closeDialog(); dial('opt'); } },
    { label: `Вова с вокзала${oh.n ? ` (${oh.n} шт, ${fmt(oh.total)} р.)` : ''}`, fn() { closeDialog(); dial('vova'); } },
    { label: 'Справочная — курс доллара', fn() { closeDialog(); dial('info'); } },
    { label: 'Положить трубку', fn() { closeDialog(); } },
  ] });
}
const PHONE_NUM = { opt: '31740', vova: '22815', info: '09' };
const PHONE_NAME = { opt: '«Оптторг»', vova: 'Вова', info: 'Справочная' };
function dial(who) {
  callBusy = true; W.P.locked = true; W.life.startCall(); renderControls();
  // на экране видно, что идёт звонок, — и всегда можно положить трубку
  const num = PHONE_NUM[who] || '09', pretty = num.length > 3 ? num.replace(/(\d)(\d\d)(\d\d)$/, '$1-$2-$3') : num;
  showDialog({ name: 'Телефон', text: `Снимаете трубку… набираете ${pretty} (${PHONE_NAME[who] || ''})`, options: [{ label: 'Положить трубку', fn: hangUp }] });
  setTimeout(() => { if (!callBusy) return; audio.tone425(true); }, 700); // трубка у уха — длинный гудок
  setTimeout(() => { if (!callBusy) return; audio.tone425(false);
    W.life.dialNumber(PHONE_NUM[who] || '09', () => { if (!callBusy) return; // диск отщёлкал номер — пошли вызовы
      audio.tone425(true, 'ring');
      showDialog({ name: 'Телефон', text: `Длинные гудки… ${PHONE_NAME[who] || ''}`, options: [{ label: 'Положить трубку', fn: hangUp }] });
      const rings = who === 'vova' && (S.phase === 'trade') && Math.random() < .5 ? 99 : 1;
      setTimeout(() => { if (!callBusy) return; audio.tone425(false); if (rings > 3) { audio.tone425(true, 'busy'); showDialog({ name: 'Телефон', text: 'Никто не берёт. Вова днём на вокзале, звони вечером.', options: [{ label: 'Положить трубку', fn: hangUp }] }); return; } audio.click(800, .5, 0, .05); talk(who); }, rings > 3 ? 7000 : 2600);
    });
  }, 1200);
}
function hangUp() { closeDialog(); audio.tone425(false); audio.click(400, .7, 0, .06); audio.tone425(true, 'busy'); setTimeout(() => audio.tone425(false), 1800); W.life.hangUp(); W.P.locked = false; callBusy = false; renderControls(); }
function talk(who) {
  if (who === 'info') { showDialog({ name: 'Справочная', text: `Курс доллара на сегодня — ${fmt(S.rate)} рублей. Спасибо за звонок.`, options: [{ label: 'Спасибо', fn: hangUp }] }); return; }
  const hidden = who === 'vova', o = orderSum(hidden);
  const name = hidden ? 'Вова' : '«Оптторг»';
  if (!o.n) { showDialog({ name, text: hidden ? 'Ну? Чего молчишь? Надо чего — так записывай и звони.' : 'База «Оптторг», слушаю. Заказ готов? Нет? Тогда не занимайте линию.', options: [{ label: 'Извините, перезвоню', fn: hangUp }] }); return; }
  showDialog({ name, text: hidden ? `Записал: ${o.n} шт. С тебя ${fmt(o.total)}. Деньги — на месте, коробку под дверь поставлю.` : `Слушаю. Значит, ${o.n} единиц товара на ${fmt(o.sum)} и доставка ${fmt(o.deliv)}. Итого ${fmt(o.total)} рублей. Подтверждаете?`, options: [
    { label: `Подтвердить (${fmt(o.total)} р.)`, fn() {
      if (S.money < o.total) { showDialog({ name, text: 'Денег-то хватит? Касса не сходится. Перезвоните, когда будет.', options: [{ label: 'Положить трубку', fn: hangUp }] }); return; }
      S.money -= o.total;
      const src = hidden ? S.order.hidden : S.order.lines, contents = {};
      for (const [k, q] of Object.entries(src)) if (q) contents[k] = [q, lineInfo(hidden ? 'h:' + k : k).unit];
      const etaH = R(.48, .92); S.deliveries = S.deliveries || []; S.deliveries.push({ contents, hidden, label: name, etaHours: etaH, eta: etaH * 90, state: 'way' });
      if (hidden) S.order.hidden = {}; else S.order.lines = {};
      if (hidden) rep('street', 1);
      save(); renderHud(); sfx.coin();
      showDialog({ name, text: hidden ? 'Добро. Жди, постучу.' : 'Заказ принят. Машина будет в течение часа. Постучат в дверь.', options: [{ label: 'Положить трубку', fn: hangUp }] });
    } },
    { label: 'Нет, отбой', fn: hangUp },
  ] });
}
function onDelivered(d, boxCount = 1) {
  if (boxCount > 1) toast(`Тук-тук! Привезли заказ — у двери ${boxCount} кор.`, 'good');
  else toast('Тук-тук! Привезли заказ — коробка у двери.', 'good');
}
function onUnpack(data) {
  const c = (data && data.contents) || {};
  for (const [k, [q, unit]] of Object.entries(c)) {
    if (k.startsWith('outfit:')) {
      const id = k.slice(7);
      if (!S.owned.includes(id)) S.owned.push(id);
      toast('Обновка: ' + OUTFITS[id].name + ' (надеть — меню → Герой)', 'good');
    }
  }
  sfx.ching();
  if (data && data.spawnedPacks > 0) {
    const extraTxt = data.extraBoxes > 0 ? ` (остальное в ${data.extraBoxes} соседн. кор.)` : '';
    toast(`Коробка открыта! Внутри ${data.spawnedPacks} уп.${extraTxt} — доставайте блоки по одному.`, 'good');
  } else {
    toast('Коробка открыта!', 'good');
  }
  save(); render();
}
const hiddenCount = () => Object.values(S.hidden || {}).reduce((a, b) => a + b, 0);
// предложение из-под полы — часть разговора с покупателем
function offerHidden() {
  const c = T && T.cur; if (!c || c.special) return;
  const opts = Object.entries(S.hidden).filter(([, q]) => q > 0).map(([k]) => ({ label: `${HIDDEN[k].name} — ${fmt(hiddenPrice(k) * 1.9)} р.`, fn() { closeDialog(); hiddenReact(c, k); } }));
  showDialog({ name: c.name, text: 'Вы наклоняетесь к окошку и вполголоса: «Есть кое-что, не для всех…»', options: [...opts, { label: 'Да нет, ничего', fn: closeDialog }] });
}
function hiddenReact(c, k) {
  const chance = { worker: { samogon: .8, kontra: .6 }, chelnok: { samogon: .4, kontra: .85 }, newrus: { samogon: .2, kontra: .5 }, babka: { samogon: .35, kontra: .1 }, student: { samogon: .5, kontra: .55 }, school: { samogon: 0, kontra: 0 } }[c.k] || { samogon: .3, kontra: .3 };
  const price = Math.round(hiddenPrice(k) * 1.9);
  if (c.k === 'school') { rep('folk', -4); c.said = 'Дядь, вы чего?! Я мамке скажу!'; toast('Предлагать такое школьнику… Народ −4', 'bad'); renderTrade(); return; }
  if (Math.random() < .06) { rep('law', -8); S.hidden[k]--; const fine = Math.min(S.money, usdToRub(10)); S.money -= fine; c.said = 'Милиция! Контрольная закупка.'; toast(`Подставной покупатель! Штраф ${fmt(fine)} р., товар изъят. Закон −8`, 'bad'); T.cur = null; renderTrade(); renderHud(); return; }
  if (Math.random() < (chance[k] || .3) + S.rep.street / 300) {
    S.hidden[k]--; S.money += price; T.rev += price; rep('street', 1); c.said = pick(['Во, это дело. Давай.', 'Только тихо…', 'Беру, не вопрос.', 'Деду своему возьму, он оценит.']);
    sfx.ching(); floatText('+' + fmt(price) + ' ₽'); if (W) W.customerEvent(c, 'sold'); renderHud(); setTimeout(() => { if (T && T.cur === c) { T.cur = null; renderTrade(); } }, 600);
  } else { c.said = pick(['Не, такого не надо.', 'Ты чего, у меня совесть есть.', 'Обойдусь.']); if (c.k === 'babka') rep('folk', -1); renderTrade(); }
}

// ============================================================
//  Настройки, звук, 3D-мир, управление, диалоги
// ============================================================
const SET_KEY = 'larek-settings-v1';
const isMob = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const SET = Object.assign({ quality: isMob ? 'medium' : 'high', custom: null, bob: 1, retro: 0, master: .9, radio: .7, ambience: .6 }, (() => { try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch (e) { return {}; } })());
function saveSet() { try { localStorage.setItem(SET_KEY, JSON.stringify(SET)); } catch (e) {} }
const audio = createAudio();
['master', 'radio', 'ambience'].forEach(k => audio.setVolume(k, SET[k]));
let controls = null, worldReady = false, loadP = 0;
function say(p, text) { const n = { gopnik: 'Пацан', babka: 'Бабушка', worker: 'Мужик', youth: 'Парень' }[p && p.kind] || 'Прохожий'; toast(`${n}: «${text}»`); }
// диалоговое окно
let dlgTimer = null;
function showDialog({ name, text, options }) {
  dialogOpen = true; const el = $('#dialog'); el.classList.add('on');
  el.innerHTML = `<div class="dlg"><div class="dlg-name">${esc(name)}</div><div class="dlg-text"></div><div class="dlg-opts">${options.map((o, i) => `<button class="btn" data-dlg="${i}">${o.label}</button>`).join('')}</div></div>`;
  const tx = el.querySelector('.dlg-text'); let i = 0; clearInterval(dlgTimer);
  dlgTimer = setInterval(() => { i += 2; tx.textContent = '«' + text.slice(0, i) + (i < text.length ? '' : '»'); if (i >= text.length) clearInterval(dlgTimer); }, 28);
  tx.onclick = () => { clearInterval(dlgTimer); tx.textContent = '«' + text + '»'; };
  // защита от «сквозного» касания: кнопка, открывшая диалог, срабатывает по pointerdown, и отпускание пальца
  // иначе засчитывается варианту под ним. Вариант выбирается, только если нажатие на нём же и началось.
  const t0 = performance.now();
  el.querySelectorAll('[data-dlg]').forEach(b => {
    b.onpointerdown = () => { b._armed = performance.now() - t0 > 120; };
    b.onclick = e => { const ok = b._armed || (e.detail === 0 && performance.now() - t0 > 300); b._armed = false; if (!ok) return; sfx.click(); options[+b.dataset.dlg].fn(); };
  });
  renderControls();
}
function closeDialog() { dialogOpen = false; clearInterval(dlgTimer); const el = $('#dialog'); el.classList.remove('on'); setTimeout(() => { if (!dialogOpen) el.innerHTML = ''; }, 250); renderControls(); }
function gopnikDemand(g) {
  const ask = Math.max(usdToRub(3), Math.round(S.money * .12)), lead = g.leader.h.L;
  sfx.bad();
  showDialog({ name: 'Гопник', text: pick(['Слышь, мужик, есть чё? Делись, не жмись.', 'Ты чё, не понял? Бабки гони, сказал.', 'Здорово, коммерсант. С тебя за проход по району.', 'Сигареты есть? А если найду?']), options: [
    { label: `Отдать ${fmt(ask)} ₽`, fn() { closeDialog(); const k = Math.min(S.money, ask); S.money -= k; rep('street', 2); W.gopLeave(g, 'paid'); toast(`Отдали ${fmt(k)} ₽. Пацаны довольны.`); render(); } },
    { label: 'Нету у меня ничего', fn() { closeDialog(); if (lead.aggression > .72 && !W.weapon.drawn) { const take = Math.round(S.money * .2); S.money -= take; rep('street', -3); sfx.bad(); toast(`Вас прижали к стенке и забрали ${fmt(take)} ₽`, 'bad'); W.gopLeave(g, 'paid'); } else { say(g.leader, pick(['Ну смотри, ещё встретимся.', 'Ладно, живи пока.'])); W.gopLeave(g, 'back'); } render(); } },
    ...(S.gun ? [{ label: '🔫 Достать ружьё', fn() { closeDialog(); W.weapon.draw(); toast('Наведите ружьё на них. Стрелять не обязательно.'); } }] : []),
    { label: 'Позвать милицию', fn() { closeDialog(); if (S.rep.law >= 10) { rep('law', 2); rep('street', -5); W.gopLeave(g, 'flee'); toast('Свисток участкового — гопники разбежались', 'good'); } else { say(g.leader, 'Ха! Какая тебе милиция?'); } } },
  ] });
}
function syncAmmoToWeapon() { if (!W || !S) return; W.weapon.ammo = S.ammo ?? 2; W.weapon.reserve = S.shells ?? 4; }
function syncAmmoFromWeapon() { if (!W || !S) return; S.ammo = W.weapon.ammo; S.shells = W.weapon.reserve; }
function look(dx, dy, kind) { if (controls && kind !== 'mouse') controls.look(dx, dy); else W && W.look(dx, dy, kind); }
const W = (() => { try { return createWorld({
  getS: () => S, getT: () => T, cardOpen: () => cardOpen || dialogOpen, sheetOpen: () => sheetOpen, settings: () => SET,
  toast, openSheet, onCtl, rep, qOf, addStock, takeStock, slotCount,
  onGumUnpacked(n) {
    if (!S) return;
    S.gumBought = (S.gumBought || 0) + (n || 1);
    while (S.gumBought >= 10) {
      S.gumBought -= 10;
      const missing = CARD_NAMES.map((_, i) => i).filter(i => !S.cards.includes(i));
      if (missing.length && Math.random() < .7) {
        const c = pick(missing); S.cards.push(c);
        toast(`Вкладыш! «${CARD_NAMES[c]}» (${S.cards.length}/${CARD_NAMES.length})`, 'good');
        if (S.cards.length === CARD_NAMES.length) { rep('folk', 10); toast('Полный альбом! Школьники в восторге. Народ +10', 'good'); }
      }
    }
  },
  onStockChange: () => { renderHud(); save(); if (T) renderTrade(); }, sellPrice, stockTotal, GOODS, fmt, MONTHS, monthOf, yearOf, audio, look,
  arrive, customerScared, onKill, subtitles, gopnikDemand, say, sleep, maratTalk, factoryTalk, phoneCall, openOrders, notepadOpen: () => npOpen || npBusy, onDelivered, onUnpack, onSitCounter, onStandCounter,
  onDrink(k, strong, total) {
    if (k === 'soda') { toast('Сладкий холодный лимонад «Буратинка» отлично освежает!'); return; }
    const d = total ?? (W && W.life.fx.drunkTarget) ?? strong;
    if (d >= 1.35) toast('В глазах темнеет, ноги подкашиваются… Перебрал!', 'bad');
    else if (d >= .95) toast('Ноги ватные, в глазах двоится… Ещё немного — и вырубит!', 'bad');
    else if (d >= .55) toast(k === 'samogon' ? 'Ух, крепкий первач! Голова сразу поплыла…' : 'Хорошо пошло — голова уже заметно кружится.');
    else toast(k === 'beer' ? 'Холодное пиво освежает — пошёл лёгкий хмель.' : k === 'samogon' ? 'Ух, забористый самогон! Сразу дало в голову.' : 'Спирт обжёг горло — по телу пошло тепло.');
  },
  onBlackout(spotName, sleepHours) {
    if (!S) return;
    if (dialogOpen) closeDialog();
    if (sheetOpen) closeSheet();
    const hrs = sleepHours || R(4.0, 7.0);
    const hInt = Math.floor(hrs), mInt = Math.round((hrs - hInt) * 60);
    const timeTxt = mInt > 0 ? `${hInt} ч ${mInt} мин` : `${hInt} ч`;
    if (S.phase === 'trade' && T) {
      T.t += hrs * (T.len / 12);
      T.lost += T.queue.length + (T.cur && !T.cur.special ? 1 : 0);
      T.queue = [];
      if (T.cur && !T.cur.special) T.cur = null;
      renderTrade();
    }
    // С шансом 55% при отключке пропадают деньги (случайная сумма от 500 до 5000 ₽)
    const stealChance = .55;
    if (S.money > 0 && Math.random() < stealChance) {
      const rawSteal = RI(500, 5000);
      const lost = Math.min(S.money, rawSteal);
      S.money -= lost;
      sfx.bad && sfx.bad();
      floatText('−' + fmt(lost) + ' ₽');
      toast(`Вас вырубило на ${timeTxt}! Очнулись лёжа на земле (${spotName}) — из карманов пропало ${fmt(lost)} ₽!`, 'bad');
    } else {
      toast(`Вас вырубило на ${timeTxt}! Вы очнулись лёжа на земле (${spotName}). Повезло — деньги целы.`);
    }
    save(); renderHud(); renderControls();
  },
  dialog: showDialog, closeDialog,
  gopResolved(how) { if (how === 'scared') { rep('street', 3); toast('Гопники отступили. Улица +3'); } },
  onShot() { syncAmmoFromWeapon(); toast('Выстрел в воздух! Все разбегаются. Закон −4', 'bad'); renderHud(); },
  onHit(sp) { toast('Вас сбила машина! Осторожнее на дороге.', 'bad'); sfx.bad(); },
  onLoadProgress(p) { loadP = p; const li = document.getElementById('loadInfo'); if (li) li.textContent = 'Загрузка города… ' + Math.round(p * 100) + '%'; },
  onLoaded() { worldReady = true; const li = document.getElementById('loadInfo'); if (li) li.textContent = ''; },
}); } catch (e) { console.error('3D не запустился', e); return null; } })();
if (W) W.setRetro(SET.retro); // ретро-фильтр — из настроек (по умолчанию выключен)
if (W) {
  const heldGoodId = () => W && W.life.held && W.life.held.kind === 'good' ? (W.life.held.data && W.life.held.data.goodId) : null;
  const heldCigPack = () => ['cig', 'kontra'].includes(heldGoodId());
  const heldDrinkId = () => { const hg = heldGoodId(); return ['beer', 'vodka', 'samogon', 'soda'].includes(hg) ? hg : null; };
  const handsFree = () => S && !W.life.habit.busy && !W.life.held && !W.weapon.drawn && !W.P.locked && !npOpen;
  const carried = () => S && S.gunState === 'carried';
  // Когда руки заняты сигаретой, бутылкой или предметом — достать/использовать оружие нельзя (чтобы не появлялась «3-я рука»)
  const canUseWeapon = () => carried() && !W.life.habit.busy && !W.life.held && !W.P.locked && !npOpen;
  const ACTIONS = {
    move:      { label: 'Движение', icon: 'move', kind: 'stick' },
    interact:  { label: 'Действие', icon: 'interact', kind: 'tap', down() { const a = W.action(); if (a) { sfx.click(); a.fn(); } }, visible: () => !!W.action(), text: () => { const a = W.action(); return a ? a.label : 'Действие'; } },
    use:       { label: 'Ещё', icon: 'hand', kind: 'tap', down() { const a = W.action(); if (a && a.alt) { sfx.click(); a.alt.fn(); } }, visible: () => { const a = W.action(); return !!(a && a.alt); }, text: () => { const a = W.action(); return a && a.alt ? a.alt.label : ''; } },
    fire:      { label: 'Огонь', icon: 'fire', kind: 'tap', down() { if (!canUseWeapon()) return; if (!W.weapon.drawn) { W.weapon.draw(); renderHud(); renderControls(); return; } const r = W.weapon.fire(); if (r === 'empty') toast('Стволы пусты — перезарядите'); syncAmmoFromWeapon(); renderHud(); }, visible: canUseWeapon },
    aim:       { label: 'Прицел', icon: 'aim', kind: 'hold', down() { if (canUseWeapon()) W.weapon.aim(true); }, up() { W.weapon.aim(false); }, visible: () => canUseWeapon() && W.weapon.drawn, active: () => W.weapon.aiming },
    reload:    { label: 'Перезарядка', icon: 'reload', kind: 'tap', down() { if (!canUseWeapon()) return; if (!W.weapon.reload()) { if (W.weapon.reserve <= 0) toast('Патронов нет — спросите у Марата на остановке'); } setTimeout(() => { syncAmmoFromWeapon(); renderHud(); }, 2500); }, visible: () => canUseWeapon() && W.weapon.drawn && W.weapon.ammo < 2 },
    weapon:    { label: 'Ружьё', icon: 'weapon', kind: 'tap', down() { if (!canUseWeapon()) return; W.weapon.toggle(); setTimeout(() => { renderHud(); renderControls(); }, 500); }, visible: canUseWeapon, active: () => W.weapon.drawn },
    gunput:    { label: 'Положить ружьё', icon: 'drop', kind: 'tap', down() { if (!canUseWeapon()) return; W.putGunDown(); }, visible: () => canUseWeapon() && !W.weapon.aiming },
    sprint:    { label: 'Бег', icon: 'sprint', kind: 'hold', down() { W.setSprint(true); }, up() { W.setSprint(false); }, active: () => W.sprint, visible: () => !W.P.seated },
    crouch:    { label: 'Присесть', icon: 'crouch', kind: 'tap', down() { W.toggleCrouch(); }, active: () => W.crouch, visible: () => !W.P.seated },
    inventory: { label: 'Меню', icon: 'menu', kind: 'tap', down() { openSheet(); } },
    smoke:     { label: 'Закурить', icon: 'smoke', kind: 'tap', down() {
        if (!S || W.life.habit.busy || W.weapon.drawn || W.P.locked || npOpen) return;
        // Чтобы покурить, нужно сначала взять пачку сигарет в руку и положить её в карман
        if (heldCigPack()) {
          const hg = heldGoodId();
          const addN = hg === 'kontra' ? 100 : 20;
          W.life.removeItem(W.life.held);
          S.cigs = (S.cigs || 0) + addN;
          sfx.click();
          toast(`Пачка убрана в карман (+${addN} сигарет). Теперь можно закурить!`, 'good');
          W.updateShelves(); save(); renderHud(); renderControls();
          return;
        }
        if (W.life.held || (S.cigs || 0) <= 0) return;
        S.cigs--;
        W.life.habit.startSmoke();
        W.updateShelves(); save(); renderHud(); renderControls();
      },
      text: () => heldCigPack() ? 'Положить в карман' : `Закурить (${S ? (S.cigs || 0) : 0})`,
      visible: () => !!(S && !W.life.habit.busy && !W.weapon.drawn && !W.P.locked && !npOpen && (heldCigPack() || (!W.life.held && (S.cigs || 0) > 0))) },
    drink:     { label: 'Выпить', icon: 'drink', kind: 'tap', down() {
        const k = heldDrinkId();
        if (!k || W.life.habit.busy || W.weapon.drawn || W.P.locked || npOpen) return;
        W.life.removeItem(W.life.held);
        const bName = k === 'samogon' ? 'самогон' : k === 'vodka' ? 'спирт «Король»' : k === 'soda' ? 'лимонад «Буратинка»' : 'пиво «Заводское»';
        toast(`Открыли бутылку (${bName}).`);
        W.life.habit.startDrink(k, true); W.updateShelves();
        // Каждая выпитая бутылка оставляет после себя пустую бутылку
        W.life.habit.onDrinkEnd = (dKind, willBlackout) => {
          W.life.habit.giveEmptyBottle(dKind || k, !!willBlackout);
          if (!willBlackout) toast('Бутылка пуста — можно поставить или выбросить в урну.');
          save(); renderHud(); renderControls();
        };
        save(); renderHud(); renderControls(); },
      text: () => {
        const k = heldDrinkId();
        return k === 'beer' ? 'Выпить: Пиво' : k === 'vodka' ? 'Выпить: Спирт' : k === 'samogon' ? 'Выпить: Самогон' : k === 'soda' ? 'Выпить: Лимонад' : 'Выпить';
      },
      visible: () => !!(S && heldDrinkId() && !W.life.habit.busy && !W.weapon.drawn && !W.P.locked && !npOpen) },
    door:      { label: 'Дверь', icon: 'door', kind: 'tap', down() { W.toggleDoor(); }, visible: () => W.nearDoor() },
  };
  const defaults = () => ({ elements: [
    { uid: 'mv', action: 'move', x: .13, y: .76, size: 150, opacity: .6, hit: 1.5, sens: 1 },
    { uid: 'in', action: 'interact', x: .66, y: .84, size: 78, opacity: .85, hit: 1.2 },
    { uid: 'us', action: 'use', x: .53, y: .86, size: 60, opacity: .8, hit: 1.2 },
    { uid: 'fi', action: 'fire', x: .9, y: .8, size: 84, opacity: .75, hit: 1.2 },
    { uid: 'ai', action: 'aim', x: .78, y: .88, size: 62, opacity: .7, hit: 1.2 },
    { uid: 're', action: 'reload', x: .79, y: .7, size: 52, opacity: .7, hit: 1.2 },
    { uid: 'we', action: 'weapon', x: .91, y: .6, size: 56, opacity: .7, hit: 1.2 },
    { uid: 'gp', action: 'gunput', x: .91, y: .44, size: 50, opacity: .65, hit: 1.2 },
    { uid: 'sp', action: 'sprint', x: .3, y: .88, size: 56, opacity: .65, hit: 1.2 },
    { uid: 'cr', action: 'crouch', x: .3, y: .73, size: 50, opacity: .6, hit: 1.2 },
    { uid: 'sm', action: 'smoke', x: .55, y: .7, size: 50, opacity: .65, hit: 1.2 },
    { uid: 'dk', action: 'drink', x: .66, y: .66, size: 50, opacity: .65, hit: 1.2 },
    { uid: 'iv', action: 'inventory', x: .06, y: .42, size: 52, opacity: .6, hit: 1.2 },
  ] });
  controls = createControls({ root: $('#ui'), actions: ACTIONS, defaults, storageKey: 'larek-controls-v2',
    onLook: (dx, dy) => W.look(dx, dy, 'touch'), onMove: (x, y) => W.move(x, y) });
  window.addEventListener('keydown', e => {
    if (!S || cardOpen || dialogOpen || sheetOpen || e.repeat) return;
    const k = e.code;
    if (k === 'KeyE') ACTIONS.interact.down(); if (k === 'KeyF') ACTIONS.use.down(); if (k === 'KeyQ' && canUseWeapon()) ACTIONS.weapon.down(); if (k === 'KeyR' && canUseWeapon()) ACTIONS.reload.down(); if (k === 'KeyT' && ACTIONS.smoke.visible()) ACTIONS.smoke.down(); if (k === 'KeyY' && ACTIONS.drink.visible()) ACTIONS.drink.down(); if (k === 'KeyX' && canUseWeapon()) ACTIONS.gunput.down();
    if (k === 'KeyC') ACTIONS.crouch.down(); if (k === 'ShiftLeft') W.setSprint(true); if (k === 'Tab') { e.preventDefault(); openSheet(); }
  });
  window.addEventListener('keyup', e => { if (e.code === 'ShiftLeft') W.setSprint(false); });
}
// ============================================================
//  Главный цикл
// ============================================================
let last = performance.now(), hudT = 0;
function loop(now) {
  const dt = Math.min(.1, (now - last) / 1000) * (window.__larekTimeScale || 1); last = now; // ускорение времени — только для автотестов
  if (S) tradeTick(dt);
  hudT -= dt; if (hudT <= 0 && S) { hudT = .5; if (controls) controls.refresh(); $('#cross').classList.toggle('aim', !!(W && W.weapon.aiming)); }
  if (W) { try { W.frame(dt); } catch (e) { console.error(e); } }
  requestAnimationFrame(loop);
}
if (!W) document.body.insertAdjacentHTML('beforeend', '');
render();
requestAnimationFrame(loop);
// для отладки/тестов
window.__larek = { get S() { return S; }, get T() { return T; }, W, get controls() { return controls; } };
})();
