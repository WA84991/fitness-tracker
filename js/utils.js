// 工具函数模块

/** 生成唯一 ID */
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** 当前日期 key: YYYY-MM-DD（本地时区） */
export function dateKey(ts = Date.now()) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 从 YYYY-MM-DD 得到本地时区的 Date（避免 new Date(str) 的 UTC 解析陷阱） */
export function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 秒数格式化为 mm:ss */
export function fmtClock(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** 时长格式化，如 "1小时23分" / "45分" / "12秒" */
export function fmtDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  if (m === 0) return `${sec}秒`;
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}分钟`;
  return `${h}小时${m % 60}分`;
}

/** 时间戳格式化为 HH:mm */
export function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 日期格式化为 "10月8日 周三" */
export function fmtDate(ts) {
  const d = new Date(ts);
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week}`;
}

/** 重量格式化：去尾零 */
export function fmtWeight(w) {
  if (w == null) return '—';
  return String(Math.round(w * 100) / 100);
}

/** 配速格式化：秒/公里 → "6'30\"" */
export function fmtPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

/** 1RM 估算（Epley 公式） */
export function estimate1RM(weight, reps) {
  if (!weight || !reps) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** 训练容量 = Σ 重量×次数 */
export function workoutVolume(workout) {
  let total = 0;
  for (const ex of workout.exercises || []) {
    for (const s of ex.sets || []) {
      if (s.weight && s.reps) total += s.weight * s.reps;
    }
  }
  return Math.round(total);
}

/** 转义 HTML，防 XSS */
export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 轻量 toast 提示 */
let toastTimer = null;
export function toast(msg, ms = 1800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/** 确认弹窗，返回 Promise<boolean> */
export function confirmDialog({ title = '确认', message = '', danger = false, okText = '确定' } = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal">
        <h2>${esc(title)}</h2>
        ${message ? `<p class="muted" style="line-height:1.6;margin-bottom:16px">${esc(message)}</p>` : ''}
        <div class="row">
          <button class="btn full" data-act="cancel">取消</button>
          <button class="btn full ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(okText)}</button>
        </div>
      </div>`;
    mask.addEventListener('click', (e) => {
      if (e.target === mask) { mask.remove(); resolve(false); }
    });
    mask.querySelector('[data-act="cancel"]').onclick = () => { mask.remove(); resolve(false); };
    mask.querySelector('[data-act="ok"]').onclick = () => { mask.remove(); resolve(true); };
    root.appendChild(mask);
  });
}

/** 表单弹窗（输入+确认），onOk 返回 false 可阻止关闭 */
export function formDialog({ title, bodyHTML, okText = '保存', onOk }) {
  const root = document.getElementById('modal-root');
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal">
      <button class="modal-close" data-act="cancel">✕</button>
      <h2>${esc(title)}</h2>
      ${bodyHTML}
      <div class="row mt16">
        <button class="btn full" data-act="cancel">取消</button>
        <button class="btn full primary" data-act="ok">${esc(okText)}</button>
      </div>
    </div>`;
  const close = () => mask.remove();
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  mask.querySelector('[data-act="cancel"]').onclick = close;
  mask.querySelector('[data-act="ok"]').onclick = async () => {
    const result = await onOk(mask.querySelector('.modal'));
    if (result !== false) close();
  };
  root.appendChild(mask);
  return mask.querySelector('.modal');
}

/** 底部弹层（动作选择器等） */
export function sheetDialog({ title, bodyHTML, onClose }) {
  const root = document.getElementById('modal-root');
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal">
      <button class="modal-close" data-act="cancel">✕</button>
      <h2>${esc(title)}</h2>
      ${bodyHTML}
    </div>`;
  const close = () => { mask.remove(); onClose?.(); };
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  mask.querySelector('[data-act="cancel"]').onclick = close;
  root.appendChild(mask);
  return mask.querySelector('.modal');
}
