// Универсальная система экранного управления с редактором раскладки и профилями.
// Не зависит от игры: игра регистрирует действия, система рисует кнопки/джойстик и вызывает обработчики.
//
// actions: { id: { label, icon, kind: 'tap'|'hold'|'toggle'|'stick', down(), up(), active?():bool, enabled?():bool, text?():string } }
// layout element: { uid, action, x, y (доля экрана, центр), size (px), opacity (0..1), hit (множитель зоны), sens }

export function createControls({ root, actions, onLook, onMove, storageKey = 'controls-v1', defaults }) {
  const store = load();
  let editing = false, selected = null;
  const els = new Map();          // uid -> {el, cfg}
  const pressed = new Map();      // pointerId -> {uid, ...}
  let lookPtr = null;

  function load() {
    try { const s = JSON.parse(localStorage.getItem(storageKey)); if (s && s.profiles && s.active && s.profiles[s.active]) return s; } catch (e) {}
    return { active: 'Стандарт', profiles: { 'Стандарт': defaults() }, lookSens: 1, invertY: false };
  }
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify(store)); } catch (e) {} }
  const layout = () => store.profiles[store.active];
  const uid = () => 'b' + Math.random().toString(36).slice(2, 8);

  // ---------- DOM ----------
  const layer = document.createElement('div'); layer.className = 'ctl-layer'; root.appendChild(layer);
  const editor = document.createElement('div'); editor.className = 'ctl-editor'; root.appendChild(editor);

  function build() {
    layer.innerHTML = ''; els.clear();
    for (const cfg of layout().elements) {
      const a = actions[cfg.action]; if (!a) continue;
      const el = document.createElement('div');
      el.className = 'ctl ' + (a.kind === 'stick' ? 'ctl-stick' : 'ctl-btn');
      const ic = a.icon && /^[a-z_]+$/.test(a.icon) ? `<img class="ctl-img" src="assets/icons/${a.icon}.png" alt="">` : (a.icon || '');
      el.innerHTML = a.kind === 'stick' ? '<div class="ctl-knob"></div>' : `<span class="ctl-ic">${ic}</span><span class="ctl-lb">${a.label}</span>`;
      el.dataset.uid = cfg.uid;
      layer.appendChild(el); els.set(cfg.uid, { el, cfg });
      place(cfg);
    }
    refresh(true);
  }
  function place(cfg) {
    const e = els.get(cfg.uid); if (!e) return;
    const W = window.innerWidth, H = window.innerHeight, s = cfg.size, hit = cfg.hit || 1, pad = (s * hit - s) / 2;
    Object.assign(e.el.style, { left: (cfg.x * W - s / 2 - pad) + 'px', top: (cfg.y * H - s / 2 - pad) + 'px', width: s + 'px', height: s + 'px', padding: pad + 'px', boxSizing: 'content-box' }); e.el.style.setProperty('--op', cfg.opacity); e.el.style.setProperty('--pad', pad + 'px');
    e.el.style.fontSize = Math.max(9, s * .16) + 'px';
  }
  // обновление подписей/состояний (дёшево, раз в несколько кадров)
  let lastSig = '';
  function refresh(force) {
    if (editing && !force) return;
    let sig = '';
    for (const [id, { el, cfg }] of els) {
      const a = actions[cfg.action]; if (!a) continue;
      const en = editing || !a.enabled || a.enabled(), act = !!(a.active && a.active()), txt = a.text ? a.text() : '';
      const vis = editing || !a.visible || a.visible(); // контекстные кнопки появляются только когда нужны
      sig += id + en + act + txt + vis;
      el.classList.toggle('off', !en); el.classList.toggle('on', act); el.style.display = vis ? '' : 'none';
      if (a.kind !== 'stick') { const lb = el.querySelector('.ctl-lb'); const want = txt || a.label; if (lb.textContent !== want) lb.textContent = want; }
    }
    lastSig = sig;
  }

  // ---------- ввод ----------
  function findCtl(target) { const el = target.closest && target.closest('.ctl'); return el ? els.get(el.dataset.uid) : null; }
  layer.addEventListener('pointerdown', e => {
    const c = findCtl(e.target); if (!c) return;
    e.preventDefault(); e.stopPropagation();
    layer.setPointerCapture(e.pointerId);
    if (editing) { startDrag(e, c); return; }
    const a = actions[c.cfg.action]; if (!a || (a.enabled && !a.enabled())) return;
    const rec = { uid: c.cfg.uid, a, cfg: c.cfg, sx: e.clientX, sy: e.clientY };
    pressed.set(e.pointerId, rec); c.el.classList.add('down');
    if (a.kind === 'stick') { const r = c.el.getBoundingClientRect(); rec.cx = r.left + r.width / 2; rec.cy = r.top + r.height / 2; stickMove(rec, e); }
    else if (a.kind === 'toggle') a.down && a.down();
    else a.down && a.down();
  });
  layer.addEventListener('pointermove', e => {
    if (drag && drag.id === e.pointerId) { dragMove(e); return; }
    const rec = pressed.get(e.pointerId); if (!rec) return;
    if (rec.a.kind === 'stick') stickMove(rec, e);
  });
  const end = e => {
    if (drag && drag.id === e.pointerId) { drag = null; persist(); return; }
    const rec = pressed.get(e.pointerId); if (!rec) return; pressed.delete(e.pointerId);
    const c = els.get(rec.uid); c && c.el.classList.remove('down');
    if (rec.a.kind === 'stick') { onMove(0, 0); const k = c && c.el.querySelector('.ctl-knob'); if (k) k.style.transform = ''; }
    else if (rec.a.kind === 'hold' || rec.a.kind === 'tap') rec.a.up && rec.a.up();
  };
  layer.addEventListener('pointerup', end); layer.addEventListener('pointercancel', end);
  function stickMove(rec, e) {
    const R_ = rec.cfg.size / 2; let dx = e.clientX - rec.cx, dy = e.clientY - rec.cy; const d = Math.hypot(dx, dy);
    if (d > R_) { dx *= R_ / d; dy *= R_ / d; }
    const sens = rec.cfg.sens || 1, dead = .12;
    let x = dx / R_, y = dy / R_; const m = Math.hypot(x, y); if (m < dead) { x = y = 0; } else { const k = Math.min(1, (m - dead) / (1 - dead) * sens) / m; x *= k; y *= k; }
    onMove(x, y);
    const k = els.get(rec.uid).el.querySelector('.ctl-knob'); if (k) k.style.transform = `translate(${dx}px,${dy}px)`;
  }
  // свайп камеры: обрабатывает игра на холсте, мы лишь отдаём чувствительность
  const look = (dx, dy) => onLook(dx * store.lookSens, dy * store.lookSens * (store.invertY ? -1 : 1));

  // ---------- редактор ----------
  let drag = null;
  function startDrag(e, c) {
    select(c.cfg.uid);
    drag = { id: e.pointerId, uid: c.cfg.uid, ox: e.clientX, oy: e.clientY, x: c.cfg.x, y: c.cfg.y };
  }
  function dragMove(e) {
    const c = els.get(drag.uid); if (!c) return;
    const W = window.innerWidth, H = window.innerHeight, snap = v => Math.round(v * 200) / 200;
    c.cfg.x = Math.max(.02, Math.min(.98, snap(drag.x + (e.clientX - drag.ox) / W)));
    c.cfg.y = Math.max(.03, Math.min(.97, snap(drag.y + (e.clientY - drag.oy) / H)));
    place(c.cfg);
  }
  function select(id) { selected = id; for (const [u, { el }] of els) el.classList.toggle('sel', u === id); renderEditor(); }
  const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  function renderEditor() {
    if (!editing) { editor.innerHTML = ''; editor.classList.remove('on'); return; }
    editor.classList.add('on');
    const c = selected && els.get(selected), cfg = c && c.cfg;
    const names = Object.keys(store.profiles);
    editor.innerHTML = `
      <div class="ce-row ce-top">
        <b>Редактор управления</b>
        <select data-ce="profile">${names.map(n => opt(n, store.active, n)).join('')}</select>
        <button data-ce="saveas">Сохранить как…</button>
        <button data-ce="delprofile" ${names.length < 2 ? 'disabled' : ''}>Удалить профиль</button>
        <button data-ce="reset">Стандартная</button>
        <button data-ce="done" class="ce-ok">Готово</button>
      </div>
      <div class="ce-row">
        <label>Камера: чувствительность <input type="range" min="0.3" max="3" step="0.05" value="${store.lookSens}" data-ce="lookSens"><span>${store.lookSens.toFixed(2)}</span></label>
        <label><input type="checkbox" data-ce="invertY" ${store.invertY ? 'checked' : ''}> инверсия Y</label>
        <select data-ce="addaction"><option value="">＋ Добавить кнопку…</option>${Object.entries(actions).map(([k, a]) => opt(k, '', a.label)).join('')}</select>
      </div>
      ${cfg ? `<div class="ce-row ce-sel">
        <b>${actions[cfg.action].icon || ''} ${actions[cfg.action].label}</b>
        <label>Действие <select data-ce="action">${Object.entries(actions).filter(([k, a]) => (a.kind === 'stick') === (actions[cfg.action].kind === 'stick')).map(([k, a]) => opt(k, cfg.action, a.label)).join('')}</select></label>
        <label>Размер <input type="range" min="36" max="220" step="2" value="${cfg.size}" data-ce="size"><span>${cfg.size}</span></label>
        <label>Прозрачность <input type="range" min="0.1" max="1" step="0.05" value="${cfg.opacity}" data-ce="opacity"><span>${Math.round(cfg.opacity * 100)}%</span></label>
        <label>Зона нажатия <input type="range" min="1" max="2" step="0.05" value="${cfg.hit || 1}" data-ce="hit"><span>×${(cfg.hit || 1).toFixed(2)}</span></label>
        ${actions[cfg.action].kind === 'stick' ? `<label>Чувствительность <input type="range" min="0.5" max="2" step="0.05" value="${cfg.sens || 1}" data-ce="sens"><span>${(cfg.sens || 1).toFixed(2)}</span></label>` : ''}
        <button data-ce="delete" class="ce-del">Удалить кнопку</button>
      </div>` : '<div class="ce-row ce-hint">Перетаскивайте кнопки. Нажмите на кнопку, чтобы изменить размер, прозрачность, зону и действие.</div>'}`;
  }
  editor.addEventListener('input', e => {
    const k = e.target.dataset.ce; if (!k) return;
    const c = selected && els.get(selected);
    if (k === 'lookSens') { store.lookSens = +e.target.value; e.target.nextElementSibling.textContent = store.lookSens.toFixed(2); }
    else if (c && ['size', 'opacity', 'hit', 'sens'].includes(k)) { c.cfg[k] = +e.target.value; place(c.cfg); const sp = e.target.nextElementSibling; if (sp) sp.textContent = k === 'opacity' ? Math.round(c.cfg[k] * 100) + '%' : k === 'size' ? c.cfg[k] : (k === 'hit' ? '×' : '') + c.cfg[k].toFixed(2); }
    persist();
  });
  editor.addEventListener('change', e => {
    const k = e.target.dataset.ce; if (!k) return;
    if (k === 'invertY') store.invertY = e.target.checked;
    if (k === 'profile') { store.active = e.target.value; selected = null; build(); }
    if (k === 'action' && selected) { els.get(selected).cfg.action = e.target.value; const id = selected; build(); select(id); }
    if (k === 'addaction' && e.target.value) { const a = actions[e.target.value]; const cfg = { uid: uid(), action: e.target.value, x: .5, y: .5, size: a.kind === 'stick' ? 150 : 64, opacity: .75, hit: 1.2, sens: 1 }; layout().elements.push(cfg); build(); select(cfg.uid); }
    persist(); renderEditor();
  });
  editor.addEventListener('click', e => {
    const k = e.target.dataset.ce; if (!k || e.target.tagName !== 'BUTTON') return;
    if (k === 'done') setEditing(false);
    if (k === 'reset') { store.profiles[store.active] = defaults(); selected = null; build(); }
    if (k === 'saveas') { const n = (prompt('Название профиля:', store.active + ' 2') || '').trim(); if (n) { store.profiles[n] = JSON.parse(JSON.stringify(layout())); store.active = n; build(); } }
    if (k === 'delprofile' && Object.keys(store.profiles).length > 1) { delete store.profiles[store.active]; store.active = Object.keys(store.profiles)[0]; selected = null; build(); }
    if (k === 'delete' && selected) { const L = layout(); L.elements = L.elements.filter(c => c.uid !== selected); selected = null; build(); }
    persist(); renderEditor();
  });
  function setEditing(on) {
    editing = on; layer.classList.toggle('editing', on); selected = null;
    for (const [, { el }] of els) el.classList.remove('sel', 'down');
    pressed.clear(); onMove(0, 0); refresh(true); renderEditor();
  }

  window.addEventListener('resize', () => { for (const [, { cfg }] of els) place(cfg); });
  build();

  return {
    look, refresh, setEditing, get editing() { return editing; },
    setVisible(v) { layer.style.display = v ? '' : 'none'; if (!v) { for (const [, rec] of pressed) { if (rec.a.kind === 'stick') onMove(0, 0); else rec.a.up && rec.a.up(); } pressed.clear(); } },
    get lookSens() { return store.lookSens; }, set lookSens(v) { store.lookSens = v; persist(); },
    rebuild: build,
  };
}
