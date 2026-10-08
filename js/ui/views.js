// 页面视图：今天、训练、历史、图表
import {
  esc, toast, confirmDialog, formDialog, sheetDialog,
  fmtClock, fmtDuration, fmtTime, fmtDate, fmtWeight, fmtPace,
  dateKey, estimate1RM, workoutVolume,
} from '../utils.js';
import { getAllExercises, MUSCLE_GROUPS } from '../exercises.js';
import * as storage from '../storage.js';
import * as workout from '../workout.js';
import * as timer from '../timer.js';
import * as charts from '../charts.js';
import { getAvailablePlans } from '../plans.js';

const app = document.getElementById('app');
const pageTitle = document.getElementById('page-title');
const headerActions = document.getElementById('header-actions');

export function setTitle(title, actionsHTML = '') {
  pageTitle.textContent = title;
  headerActions.innerHTML = actionsHTML;
}

/** 底部 tab 高亮 */
export function highlightTab(name) {
  document.querySelectorAll('#tabbar a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === name);
  });
}

/** 展示隐藏的「进行中训练」悬浮提示 */
export function updateTimerFab() {
  const fab = document.getElementById('timer-fab');
  const rem = timer.getTimerRemaining();
  if (rem !== null) {
    fab.hidden = false;
    fab.textContent = `⏱ ${fmtClock(rem)}`;
  } else {
    fab.hidden = true;
  }
}

// 订阅计时器 tick，全局刷新 fab
timer.onTimerTick((remaining) => {
  const fab = document.getElementById('timer-fab');
  if (fab) {
    if (remaining === 'done' || remaining === 0) {
      fab.hidden = true;
    } else {
      fab.hidden = false;
      fab.textContent = `⏱ ${fmtClock(remaining)}`;
    }
  }
});

// =====================================================================
// 今天页
// =====================================================================
export async function renderToday() {
  setTitle('今天');
  highlightTab('today');

  const active = workout.isWorkoutActive();
  const grouped = await storage.getWorkoutsGroupedByDate();
  const todayList = grouped.get(dateKey()) || [];
  const settings = storage.getSettings();

  let activeCard = '';
  if (active) {
    const w = workout.getCurrentWorkout();
    const totalSets = w.exercises.reduce((s, e) => s + e.sets.length, 0);
    activeCard = `
      <div class="card" style="border-color:var(--accent)">
        <div class="row">
          <div style="flex:1">
            <h2>⚡ 进行中的训练</h2>
            <p class="muted small">${esc(w.planName || '自由训练')} · ${w.exercises.length} 个动作 · ${totalSets} 组已完成</p>
          </div>
          <div class="shrink">
            <button class="btn primary" id="btn-resume">继续训练</button>
          </div>
        </div>
      </div>`;
  }

  const recentHTML = todayList.length === 0
    ? `<div class="empty-state"><span class="empty-icon">🏋️</span><p>今天还没有训练记录<br>点击下方按钮开始吧！</p></div>`
    : todayList.map(w => workoutCardHTML(w)).join('');

  app.innerHTML = `
    ${activeCard}
    ${!active ? `
      <div class="row mb12">
        <button class="btn primary full" id="btn-start-free">＋ 开始训练</button>
      </div>
      <div class="row mb12">
        <button class="btn full" id="btn-start-plan">📋 按计划训练</button>
      </div>` : ''}
    <div class="card">
      <h2>今日已完成</h2>
      ${recentHTML}
    </div>
  `;

  document.getElementById('btn-resume')?.addEventListener('click', () => location.hash = '#/workout');
  document.getElementById('btn-start-free')?.addEventListener('click', () => {
    try {
      workout.startWorkout({ type: 'strength' });
    } catch (e) { toast(e.message); return; }
    location.hash = '#/workout';
  });
  document.getElementById('btn-start-plan')?.addEventListener('click', showPlanPicker);
  app.querySelectorAll('[data-view-detail]').forEach(el => {
    el.addEventListener('click', () => showWorkoutDetail(el.dataset.viewDetail));
  });
}

/** 今天页/历史页共用的会话卡片 */
export function workoutCardHTML(w) {
  const vol = workoutVolume(w);
  const cardioDist = (w.exercises || []).filter(e => e.kind === 'cardio')
    .reduce((s, e) => s + (e.distanceKm || 0), 0);
  const totalSets = (w.exercises || []).reduce((s, e) => s + (e.sets || []).length, 0);
  const typeBadge = w.type === 'cardio' ? '<span class="badge blue">有氧</span>'
    : w.type === 'mixed' ? '<span class="badge purple">混合</span>'
    : '<span class="badge green">力量</span>';
  const sub = [];
  if (vol > 0) sub.push(`容量 ${vol} kg`);
  if (cardioDist > 0) sub.push(`有氧 ${cardioDist} km`);
  if (totalSets > 0) sub.push(`${totalSets} 组`);
  if (w.planName) sub.push(esc(w.planName));

  return `
    <div class="list-item" data-view-detail="${esc(w.id)}" style="cursor:pointer">
      <div class="item-main">
        <div class="item-title">${typeBadge} ${esc(w.planDayName || w.planName || '训练')}</div>
        <div class="item-sub">${sub.join(' · ')}</div>
      </div>
      <div class="item-side">
        ${fmtTime(w.startTime)}<br>
        <span class="muted">${fmtDuration((w.endTime - w.startTime) / 1000)}</span>
      </div>
    </div>`;
}

/** 会话详情弹层 */
export async function showWorkoutDetail(id) {
  const all = await storage.getAllWorkouts();
  const w = all.find(x => x.id === id);
  if (!w) return;

  const exHTML = (w.exercises || []).map((ex, i) => {
    if (ex.kind === 'cardio') {
      const pace = ex.distanceKm && ex.durationSec ? ex.durationSec / ex.distanceKm : null;
      return `
        <div class="card">
          <h3>${esc(ex.name)} <span class="badge blue">有氧</span></h3>
          <div class="detail-row"><span class="dr-label">距离</span><span class="dr-val">${ex.distanceKm ?? '—'} km</span></div>
          <div class="detail-row"><span class="dr-label">时长</span><span class="dr-val">${fmtDuration(ex.durationSec)}</span></div>
          <div class="detail-row"><span class="dr-label">配速</span><span class="dr-val">${fmtPace(pace)}</span></div>
        </div>`;
    }
    const best = workout.best1RMOf(ex);
    return `
      <div class="card">
        <h3>${esc(ex.name)}</h3>
        ${(ex.sets || []).map((s, si) => `
          <div class="detail-row">
            <span class="dr-label">第${si + 1}组${s.warmup ? ' <span class="badge warn">热身</span>' : ''}${s.failure ? ' <span class="badge gray">力竭</span>' : ''}</span>
            <span class="dr-val">${fmtWeight(s.weight)} kg × ${s.reps}</span>
          </div>`).join('')}
        ${best ? `<div class="detail-row"><span class="dr-label">最佳估算 1RM</span><span class="dr-val">${Math.round(best * 10) / 10} kg</span></div>` : ''}
      </div>`;
  }).join('');

  const dlg = sheetDialog({
    title: fmtDate(w.startTime),
    bodyHTML: `
      <p class="muted small mb12">${fmtTime(w.startTime)} - ${fmtTime(w.endTime)} · 时长 ${fmtDuration((w.endTime - w.startTime) / 1000)}${w.note ? `<br>备注：${esc(w.note)}` : ''}</p>
      ${exHTML}
      <button class="btn danger full mt12" id="btn-delete-workout">删除这条记录</button>
    `,
  });
  dlg.querySelector('#btn-delete-workout').onclick = async () => {
    const ok = await confirmDialog({
      title: '删除记录',
      message: '删除后无法恢复，确定删除这条训练记录吗？',
      danger: true, okText: '删除',
    });
    if (!ok) return;
    await storage.deleteWorkout(id);
    dlg.closest('.modal-mask').remove();
    toast('已删除');
    location.reload();
  };
}

// =====================================================================
// 训练页（核心）
// =====================================================================
let expandedExerciseIdx = new Set([0]);
let exercisePickerState = { filter: '', muscle: '全部' };
let restTickUnsub = null;

export async function renderWorkout() {
  setTitle('训练中', `<button class="btn small ghost" id="btn-finish">结束</button>`);
  highlightTab('today');

  const w = workout.getCurrentWorkout();
  if (!w) {
    app.innerHTML = `<div class="empty-state"><span class="empty-icon">🤔</span><p>没有进行中的训练</p><button class="btn primary mt12" id="btn-back-today">返回今天</button></div>`;
    document.getElementById('btn-back-today').onclick = () => location.hash = '#/today';
    return;
  }

  // 重置休息面板订阅，避免旧订阅残留
  if (restTickUnsub) { restTickUnsub(); restTickUnsub = null; }

  renderWorkoutBody();
  startElapsedClock(w);

  // 休息计时订阅：整个训练页生命周期只订阅一次，tick 时动态更新 DOM
  restTickUnsub = timer.onTimerTick((remaining) => {
    if (!location.hash.startsWith('#/workout')) return;
    if (remaining === 'done') {
      toast('休息结束，开始下一组！');
      renderWorkoutBody();
      return;
    }
    if (remaining === 0 || remaining === null) return; // cancelTimer 的场景由调用方自行刷新
    const overlay = document.getElementById('rest-overlay');
    if (overlay) {
      overlay.querySelector('#rest-time').textContent = fmtClock(remaining);
      overlay.classList.toggle('urgent', remaining <= 10);
    }
  });

  document.getElementById('btn-finish').onclick = finishWorkoutFlow;
  document.getElementById('btn-cancel')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '放弃训练',
      message: '本次训练的记录将不会保存，确定放弃吗？',
      danger: true, okText: '放弃',
    });
    if (ok) {
      workout.discardWorkout();
      timer.cancelTimer();
      location.hash = '#/today';
    }
  });
}

let elapsedInterval = null;
function startElapsedClock(w) {
  clearInterval(elapsedInterval);
  const el = document.getElementById('workout-elapsed');
  if (!el) return;
  const tick = () => {
    el.textContent = fmtClock((Date.now() - w.startTime) / 1000);
  };
  tick();
  elapsedInterval = setInterval(tick, 1000);
}

function renderWorkoutBody() {
  const w = workout.getCurrentWorkout();
  if (!w) return;

  const settings = storage.getSettings();
  const totalSets = w.exercises.reduce((s, e) => s + e.sets.length, 0);

  // 休息倒计时面板（进行中时显示在顶部）
  const restRemaining = timer.getTimerRemaining();
  const restOverlay = restRemaining !== null ? `
    <div class="rest-overlay${restRemaining <= 10 ? ' urgent' : ''}" id="rest-overlay">
      <div class="rest-time" id="rest-time">${fmtClock(restRemaining)}</div>
      <div class="rest-label">休息中…</div>
      <div class="rest-actions">
        <button class="btn small" id="rest-skip">跳过休息</button>
      </div>
    </div>` : '';

  const exerciseBlocks = w.exercises.map((ex, idx) => {
    const collapsed = !expandedExerciseIdx.has(idx);
    if (ex.kind === 'cardio') return cardioBlockHTML(ex, idx, collapsed);
    return strengthBlockHTML(ex, idx, collapsed);
  }).join('');

  app.innerHTML = `
    ${restOverlay}
    <div class="card" id="workout-meta-card">
      <div class="row">
        <div class="item-main">
          <div class="item-title">${esc(w.planDayName || w.planName || '自由训练')}</div>
          <div class="item-sub">已用时间 <span id="workout-elapsed">00:00</span> · ${totalSets} 组完成</div>
        </div>
        <div class="shrink muted small">组间休息 ${settings.restTimer}s</div>
      </div>
    </div>
    ${w.exercises.length === 0 ? `
      <div class="empty-state">
        <span class="empty-icon">💪</span>
        <p>还没有添加动作<br>点击下方按钮选择第一个动作</p>
      </div>` : exerciseBlocks}
    <div class="row mb12">
      <button class="btn primary full" id="btn-add-exercise">＋ 添加动作</button>
    </div>
    <div class="row">
      <button class="btn ghost full" id="btn-cancel">放弃训练</button>
    </div>
  `;

  // 动作块展开/折叠
  app.querySelectorAll('.ex-head').forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.idx);
      if (expandedExerciseIdx.has(idx)) expandedExerciseIdx.delete(idx);
      else expandedExerciseIdx.add(idx);
      renderWorkoutBody();
    });
  });

  // 跳过休息
  document.getElementById('rest-skip')?.addEventListener('click', () => {
    timer.cancelTimer();
    renderWorkoutBody();
  });

  // 力量组输入行
  app.querySelectorAll('.done-set-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const ex = w.exercises[idx];
      const weightEl = document.getElementById(`weight-${idx}`);
      const repsEl = document.getElementById(`reps-${idx}`);
      const warmupEl = document.getElementById(`warmup-${idx}`);
      const weight = parseFloat(weightEl.value);
      const reps = parseInt(repsEl.value);
      if (!reps) { toast('请先填写次数'); repsEl.focus(); return; }
      const isWarmup = warmupEl.checked;

      workout.completeSet(idx, {
        weight: isNaN(weight) ? 0 : weight,
        reps,
        warmup: isWarmup,
        failure: false,
      });

      // 自动休息（热身组不触发）
      if (settings.restTimerAuto && !isWarmup) {
        timer.startRestTimer(settings.restTimer);
      }
      renderWorkoutBody();
    });
  });

  // 有氧保存按钮
  app.querySelectorAll('[data-save-cardio]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.saveCardio);
      const dist = parseFloat(document.getElementById(`cardio-dist-${idx}`).value);
      const durMin = parseFloat(document.getElementById(`cardio-dur-${idx}`).value) || 0;
      if (!dist || dist <= 0) { toast('请填写距离'); return; }
      workout.setCardioData(idx, { distanceKm: dist, durationSec: Math.round(durMin * 60) });
      toast('已保存');
      renderWorkoutBody();
    });
  });

  // 删除组
  app.querySelectorAll('[data-del-set]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [ei, si] = btn.dataset.delSet.split(':').map(Number);
      workout.deleteSet(ei, si);
      renderWorkoutBody();
    });
  });

  // 移除动作
  app.querySelectorAll('[data-remove-ex]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.removeEx);
      const ok = await confirmDialog({
        title: '移除动作',
        message: `确定从本次训练中移除「${w.exercises[idx].name}」吗？`,
        danger: true, okText: '移除',
      });
      if (ok) {
        workout.removeExerciseFromWorkout(idx);
        expandedExerciseIdx.delete(idx);
        renderWorkoutBody();
      }
    });
  });

  // 手动静止休息
  app.querySelectorAll('[data-rest-now]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ex = w.exercises[Number(btn.dataset.restNow)];
      const sec = ex.restSec || settings.restTimer;
      timer.startRestTimer(sec);
      toast(`开始休息 ${sec} 秒`);
    });
  });

  document.getElementById('btn-add-exercise').onclick = () => openExercisePicker();
}

/** 力量动作块 */
function strengthBlockHTML(ex, idx, collapsed) {
  const settings = storage.getSettings();
  const done = ex.sets.length;
  const target = ex.targetSets;
  const progress = target ? `${done}/${target} 组` : `${done} 组`;
  const best = workout.best1RMOf(ex);

  const rows = (ex.sets || []).map((s, si) => `
    <tr>
      <td class="num">${si + 1}</td>
      <td class="val">${fmtWeight(s.weight)}</td>
      <td class="val">${s.reps}</td>
      <td class="tag">
        ${s.warmup ? '<span class="badge warn">热身</span>' : ''}
        ${s.failure ? '<span class="badge gray">力竭</span>' : ''}
      </td>
      <td><button class="btn small ghost" data-del-set="${idx}:${si}" style="min-height:28px;padding:0 8px">✕</button></td>
    </tr>`).join('');

  return `
    <div class="exercise-block">
      <div class="ex-head" data-idx="${idx}">
        <div>
          <div class="ex-name">${esc(ex.name)}</div>
          <div class="ex-target">${progress}${target ? ` · 目标 ${target}×${esc(String(ex.targetReps))}` : ''}${best ? ` · 最佳1RM ${Math.round(best * 10) / 10}kg` : ''}${ex.restSec ? ` · 建议休息 ${ex.restSec}s` : ''}</div>
        </div>
        <div class="row shrink">
          <button class="btn small ghost" data-rest-now="${idx}" title="开始休息">⏱</button>
          <button class="btn small ghost" data-remove-ex="${idx}" title="移除动作">🗑</button>
          <span class="muted" style="font-size:14px">${collapsed ? '▸' : '▾'}</span>
        </div>
      </div>
      <div class="ex-body${collapsed ? ' collapsed' : ''}">
        <table class="set-table">
          <thead><tr><th>组</th><th>重量kg</th><th>次数</th><th></th><th></th></tr></thead>
          <tbody>
            ${rows}
            <tr>
              <td class="num">${done + 1}</td>
              <td><input class="input set-input" id="weight-${idx}" type="number" inputmode="decimal" min="0" step="0.5" placeholder="重量"></td>
              <td><input class="input set-input" id="reps-${idx}" type="number" inputmode="numeric" min="1" placeholder="次数"></td>
              <td class="tag"><label class="small muted"><input type="checkbox" id="warmup-${idx}"> 热身</label></td>
              <td><button class="done-set-btn" data-idx="${idx}" title="完成一组">✓</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

/** 有氧动作块 */
function cardioBlockHTML(ex, idx, collapsed) {
  const pace = ex.distanceKm && ex.durationSec ? ex.durationSec / ex.distanceKm : null;
  return `
    <div class="exercise-block">
      <div class="ex-head" data-idx="${idx}">
        <div>
          <div class="ex-name">${esc(ex.name)}</div>
          <div class="ex-target">${ex.distanceKm ? `${ex.distanceKm} km · ${fmtDuration(ex.durationSec)}` : '未记录'}${pace ? ` · 配速 ${fmtPace(pace)}` : ''}</div>
        </div>
        <div class="row shrink">
          <button class="btn small ghost" data-remove-ex="${idx}" title="移除动作">🗑</button>
          <span class="muted" style="font-size:14px">${collapsed ? '▸' : '▾'}</span>
        </div>
      </div>
      <div class="ex-body${collapsed ? ' collapsed' : ''}">
        <div class="row">
          <div class="field"><label>距离 (km)</label><input class="input" id="cardio-dist-${idx}" type="number" inputmode="decimal" min="0" step="0.01" placeholder="如 5.0" value="${ex.distanceKm ?? ''}"></div>
          <div class="field"><label>时长 (分钟)</label><input class="input" id="cardio-dur-${idx}" type="number" inputmode="decimal" min="0" step="0.5" placeholder="如 30" value="${ex.durationSec ? ex.durationSec / 60 : ''}"></div>
        </div>
        <button class="btn primary full" data-save-cardio="${idx}">保存</button>
      </div>
    </div>`;
}

/** 结束训练流程 */
async function finishWorkoutFlow() {
  const w = workout.getCurrentWorkout();
  if (!w) return;
  const ok = await confirmDialog({
    title: '结束训练',
    message: '确定结束本次训练并保存吗？',
    okText: '结束并保存',
  });
  if (!ok) return;
  formDialog({
    title: '训练完成 🎉',
    okText: '保存',
    bodyHTML: `<div class="field"><label>备注（可选）</label><textarea class="input" id="workout-note" placeholder="今天状态怎么样？"></textarea></div>`,
    onOk: async (modal) => {
      try {
        await workout.finishWorkout(modal.querySelector('#workout-note').value);
        timer.cancelTimer();
        toast('训练已保存 ✅');
        location.hash = '#/today';
      } catch (e) {
        toast(e.message);
        return false;
      }
    },
  });
}

// =====================================================================
// 动作选择器
// =====================================================================
export async function openExercisePicker(onPick) {
  const all = await getAllExercises();
  const settings = storage.getSettings();

  const renderList = (modal) => {
    const q = exercisePickerState.filter.trim().toLowerCase();
    const list = modal.querySelector('.pick-list');
    const filtered = all.filter(ex => {
      const matchMuscle = exercisePickerState.muscle === '全部' || (ex.muscles || []).includes(exercisePickerState.muscle);
      const matchQ = !q || ex.name.toLowerCase().includes(q);
      return matchMuscle && matchQ;
    });
    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:24px"><p>没有匹配的动作<br>可以「添加自定义动作」</p></div>`;
      return;
    }
    list.innerHTML = filtered.map(ex => `
      <div class="list-item pick-item" data-id="${esc(ex.id)}" style="cursor:pointer">
        <div class="item-main">
          <div class="item-title">${esc(ex.name)}</div>
          <div class="item-sub">${(ex.muscles || []).map(m => esc(m)).join(' · ')} · ${esc(ex.equipment || '')}</div>
        </div>
        <div class="item-side">
          ${ex.kind === 'cardio' ? '<span class="badge blue">有氧</span>' : '<span class="badge green">力量</span>'}
        </div>
      </div>`).join('');
    list.querySelectorAll('.pick-item').forEach(el => {
      el.onclick = () => {
        const ex = filtered.find(x => x.id === el.dataset.id);
        modal.closest('.modal-mask').remove();
        onPick ? onPick(ex) : addPickedExercise(ex);
      };
    });
  };

  const modal = sheetDialog({
    title: '选择动作',
    bodyHTML: `
      <div class="search-box"><input class="input" id="picker-search" placeholder="搜索动作名称…"></div>
      <div class="filter-row">
        ${['全部', ...MUSCLE_GROUPS].map(m =>
          `<span class="chip${exercisePickerState.muscle === m ? ' active' : ''}" data-muscle="${esc(m)}">${esc(m)}</span>`).join('')}
      </div>
      <div class="pick-list"></div>
      <button class="btn ghost full mt12" id="btn-new-exercise">＋ 添加自定义动作</button>
    `,
  });

  renderList(modal);
  modal.querySelector('#picker-search').addEventListener('input', (e) => {
    exercisePickerState.filter = e.target.value;
    renderList(modal);
  });
  modal.querySelectorAll('[data-muscle]').forEach(chip => {
    chip.onclick = () => {
      exercisePickerState.muscle = chip.dataset.muscle;
      modal.querySelectorAll('[data-muscle]').forEach(c => c.classList.toggle('active', c === chip));
      renderList(modal);
    };
  });
  modal.querySelector('#btn-new-exercise').onclick = async () => {
    const ex = await showNewExerciseDialog();
    if (ex) {
      modal.closest('.modal-mask').remove();
      onPick ? onPick(ex) : addPickedExercise(ex);
    }
  };
}

/** 选中动作 → 加入当前训练 */
function addPickedExercise(ex) {
  const w = workout.getCurrentWorkout();
  if (!w) return;
  const settings = storage.getSettings();
  workout.addExerciseToWorkout(ex, { restSec: ex.kind === 'strength' ? settings.restTimer : null });
  expandedExerciseIdx = new Set([w.exercises.length - 1]);
  renderWorkoutBody();
}

/** 新建自定义动作弹窗 */
export async function showNewExerciseDialog() {
  return new Promise((resolve) => {
    formDialog({
      title: '添加自定义动作',
      okText: '添加',
      bodyHTML: `
        <div class="field"><label>动作名称</label><input class="input" id="ne-name" placeholder="如：蝴蝶机夹胸"></div>
        <div class="field"><label>类型</label>
          <div class="chip-row">
            <span class="chip active" data-kind="strength" id="ne-kind-strength">力量</span>
            <span class="chip" data-kind="cardio" id="ne-kind-cardio">有氧</span>
          </div>
        </div>
        <div class="field"><label>目标肌群（可多选）</label>
          <div class="chip-row" id="ne-muscles">
            ${MUSCLE_GROUPS.map(m => `<span class="chip" data-m="${esc(m)}">${esc(m)}</span>`).join('')}
          </div>
        </div>
        <div class="field"><label>器械（可选）</label><input class="input" id="ne-equipment" placeholder="如：绳索"></div>
      `,
      onOk: async (modal) => {
        const name = modal.querySelector('#ne-name').value.trim();
        if (!name) { toast('请填写动作名称'); return false; }
        const kind = modal.querySelector('[data-kind].active').dataset.kind;
        const muscles = [...modal.querySelectorAll('[data-m].active')].map(c => c.dataset.m);
        const equipment = modal.querySelector('#ne-equipment').value.trim() || '自重';
        const { addCustomExercise } = await import('../exercises.js');
        const ex = await addCustomExercise({ name, kind, muscles, equipment });
        toast(`已添加「${name}」`);
        resolve(ex);
      },
    });
    // kind 切换
    const kindChips = document.querySelectorAll('#ne-kind-strength, #ne-kind-cardio');
    kindChips.forEach(c => c.onclick = () => {
      kindChips.forEach(k => k.classList.toggle('active', k === c));
    });
    // 肌群多选
    document.querySelectorAll('#ne-muscles .chip').forEach(c => {
      c.onclick = () => c.classList.toggle('active');
    });
  });
}

/** 计划选择器（开始按计划训练） */
async function showPlanPicker() {
  const plans = await getAvailablePlans();
  if (plans.length === 0) {
    toast('还没有训练计划，先去「计划」页创建');
    return;
  }
  const modal = sheetDialog({
    title: '选择训练计划',
    bodyHTML: `
      <div class="pick-list">
        ${plans.map(p => `
          <div class="list-item plan-item" data-id="${esc(p.id)}" style="cursor:pointer">
            <div class="item-main">
              <div class="item-title">${esc(p.name)}</div>
              <div class="item-sub">${p.days.length} 个训练日${p.builtin ? ' · 内置示例' : ''}</div>
            </div>
            <div class="item-side">›</div>
          </div>`).join('')}
      </div>
    `,
  });
  modal.querySelectorAll('.plan-item').forEach(el => {
    el.onclick = () => {
      const plan = plans.find(p => p.id === el.dataset.id);
      modal.closest('.modal-mask').remove();
      showDayPicker(plan);
    };
  });
}

/** 选择计划的训练日 */
function showDayPicker(plan) {
  const modal = sheetDialog({
    title: esc(plan.name),
    bodyHTML: `
      <p class="muted small mb12">选择今天要练的训练日：</p>
      <div class="pick-list">
        ${plan.days.map((d, i) => `
          <div class="list-item day-item" data-idx="${i}" style="cursor:pointer">
            <div class="item-main">
              <div class="item-title">${esc(d.name)}</div>
              <div class="item-sub">${d.exercises.length} 个动作</div>
            </div>
            <div class="item-side">›</div>
          </div>`).join('')}
      </div>
    `,
  });
  modal.querySelectorAll('.day-item').forEach(el => {
    el.onclick = async () => {
      const day = plan.days[Number(el.dataset.idx)];
      modal.closest('.modal-mask').remove();
      const { startWorkout, addExerciseToWorkout } = await import('../workout.js');
      try {
        startWorkout({ type: 'strength', planId: plan.id, planName: plan.name, planDayName: day.name });
      } catch (e) { toast(e.message); return; }
      for (const pe of day.exercises) {
        addExerciseToWorkout(pe, { targetSets: pe.sets, targetReps: pe.targetReps, restSec: pe.restSec });
      }
      expandedExerciseIdx = new Set([0]);
      location.hash = '#/workout';
    };
  });
}

// =====================================================================
// 历史页
// =====================================================================
let historyState = { year: null, month: null, selected: dateKey() };

export async function renderHistory() {
  setTitle('训练记录');
  highlightTab('history');

  const now = new Date();
  if (historyState.year === null) {
    historyState.year = now.getFullYear();
    historyState.month = now.getMonth();
  }

  const grouped = await storage.getWorkoutsGroupedByDate();
  renderHistoryBody(grouped);
}

function renderHistoryBody(grouped) {
  const { year, month, selected } = historyState;
  const selectedList = grouped.get(selected) || [];

  const dayLevel = (key) => {
    const n = (grouped.get(key) || []).length;
    if (n === 0) return 0;
    if (n === 1) return 1;
    if (n <= 2) return 2;
    return 3;
  };

  // 构建日历
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 周日=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dateKey();

  let cells = '';
  for (let i = 0; i < startWeekday; i++) cells += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const lv = dayLevel(key);
    const cls = [
      'cal-day',
      lv ? `lv${lv}` : '',
      key === todayKey ? 'today' : '',
      key === selected ? 'selected' : '',
    ].filter(Boolean).join(' ');
    cells += `<div class="cal-day ${cls}" data-key="${key}">${d}</div>`;
  }

  app.innerHTML = `
    <div class="card">
      <div class="calendar">
        <div class="cal-nav" style="grid-column:1/-1">
          <button class="btn small ghost" id="cal-prev">‹</button>
          <span class="cal-title">${year}年${month + 1}月</span>
          <button class="btn small ghost" id="cal-next">›</button>
        </div>
        ${['日','一','二','三','四','五','六'].map(d => `<div class="cal-head">${d}</div>`).join('')}
        ${cells}
      </div>
    </div>
    <div class="card">
      <h2>${selected} 的记录</h2>
      ${selectedList.length === 0
        ? '<p class="muted small">这一天没有训练记录</p>'
        : selectedList.map(w => workoutCardHTML(w)).join('')}
    </div>
  `;

  document.getElementById('cal-prev').onclick = () => {
    historyState.month--;
    if (historyState.month < 0) { historyState.month = 11; historyState.year--; }
    renderHistoryBody(grouped);
  };
  document.getElementById('cal-next').onclick = () => {
    historyState.month++;
    if (historyState.month > 11) { historyState.month = 0; historyState.year++; }
    renderHistoryBody(grouped);
  };
  app.querySelectorAll('.cal-day[data-key]').forEach(el => {
    el.onclick = () => {
      historyState.selected = el.dataset.key;
      renderHistoryBody(grouped);
    };
  });
  app.querySelectorAll('[data-view-detail]').forEach(el => {
    el.addEventListener('click', () => showWorkoutDetail(el.dataset.viewDetail));
  });
}

// =====================================================================
// 图表页
// =====================================================================
let chartsState = { range: 60, selectedExercise: null };

export async function renderCharts() {
  setTitle('图表');
  highlightTab('charts');
  charts.destroyCharts();

  // 找出历史里出现过的力量动作，供 1RM 曲线选择
  const allWorkouts = await storage.getAllWorkouts();
  const seen = new Map();
  for (const w of allWorkouts) {
    for (const ex of w.exercises || []) {
      if (ex.kind === 'strength' && !seen.has(ex.exerciseId)) {
        seen.set(ex.exerciseId, ex.name);
      }
    }
  }
  const strengthExercises = [...seen.entries()];
  if (!chartsState.selectedExercise && strengthExercises.length > 0) {
    chartsState.selectedExercise = strengthExercises[0][0];
  }

  app.innerHTML = `
    <div class="card">
      <h2>训练容量趋势</h2>
      <div class="chip-row">
        ${[30, 60, 90, 365].map(r =>
          `<span class="chip${chartsState.range === r ? ' active' : ''}" data-range="${r}">${r === 365 ? '全部' : `近${r}天`}</span>`).join('')}
      </div>
      <div class="chart-box"><canvas id="chart-volume"></canvas></div>
    </div>
    <div class="card">
      <h2>1RM 力量曲线</h2>
      ${strengthExercises.length === 0
        ? '<p class="muted small">完成力量训练后，这里会显示各动作的估算 1RM 增长曲线</p>'
        : `<div class="chip-row" style="max-height:96px;overflow-y:auto">
             ${strengthExercises.map(([id, name]) =>
               `<span class="chip${chartsState.selectedExercise === id ? ' active' : ''}" data-ex="${esc(id)}">${esc(name)}</span>`).join('')}
           </div>
           <div class="chart-box"><canvas id="chart-1rm"></canvas></div>`}
    </div>
    <div class="card">
      <h2>有氧趋势</h2>
      <div class="chart-box"><canvas id="chart-cardio"></canvas></div>
    </div>
  `;

  // 容量图
  const volCanvas = document.getElementById('chart-volume');
  if (volCanvas) await charts.renderVolumeChart(volCanvas, chartsState.range);

  // 1RM 图
  const rmCanvas = document.getElementById('chart-1rm');
  if (rmCanvas) {
    const sel = strengthExercises.find(([id]) => id === chartsState.selectedExercise);
    const res = await charts.render1RMChart(rmCanvas, chartsState.selectedExercise, sel?.[1] || '');
    if (res === 'empty') {
      document.querySelector('#chart-1rm').closest('.chart-box').innerHTML =
        '<p class="muted small">这个动作还没有足够的数据</p>';
    }
  }

  // 有氧图
  const cardioCanvas = document.getElementById('chart-cardio');
  if (cardioCanvas) await charts.renderCardioChart(cardioCanvas, chartsState.range);

  // 交互
  app.querySelectorAll('[data-range]').forEach(chip => {
    chip.onclick = () => {
      chartsState.range = Number(chip.dataset.range);
      renderCharts();
    };
  });
  app.querySelectorAll('[data-ex]').forEach(chip => {
    chip.onclick = () => {
      chartsState.selectedExercise = chip.dataset.ex;
      renderCharts();
    };
  });
}
