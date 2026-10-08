// 页面视图：计划、设置
import { esc, toast, confirmDialog, formDialog, sheetDialog, fmtDate } from '../utils.js';
import { getAllExercises, MUSCLE_GROUPS } from '../exercises.js';
import * as storage from '../storage.js';
import {
  getAvailablePlans, createPlan, removePlan, duplicateBuiltinPlan,
} from '../plans.js';
import { requestNotifyPermission, testBeep } from '../timer.js';
import * as exportMod from '../export.js';

const app = document.getElementById('app');
const pageTitle = document.getElementById('page-title');
const headerActions = document.getElementById('header-actions');

function setTitle(title, actionsHTML = '') {
  pageTitle.textContent = title;
  headerActions.innerHTML = actionsHTML;
}

function highlightTab(name) {
  document.querySelectorAll('#tabbar a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === name);
  });
}

export const APP_VERSION = '1.0.0';

// =====================================================================
// 计划页
// =====================================================================
export async function renderPlans() {
  setTitle('训练计划');
  highlightTab('plans');

  const plans = await getAvailablePlans();
  app.innerHTML = `
    ${plans.length === 0 ? `
      <div class="empty-state"><span class="empty-icon">🗓️</span><p>还没有训练计划<br>创建一个推拉腿或自定计划吧</p></div>` : ''}
    ${plans.map(p => `
      <div class="card">
        <div class="row">
          <div style="flex:1">
            <h2>${esc(p.name)} ${p.builtin ? '<span class="badge gray">内置</span>' : ''}</h2>
            <p class="muted small">${p.days.length} 个训练日：${p.days.map(d => esc(d.name)).join('、')}</p>
          </div>
        </div>
        <div class="row mt12">
          <button class="btn primary full" data-start-plan="${esc(p.id)}">开始训练</button>
          ${p.builtin
            ? '<button class="btn full" data-copy-plan="' + esc(p.id) + '">复制并编辑</button>'
            : '<button class="btn danger full" data-del-plan="' + esc(p.id) + '">删除</button>'}
        </div>
      </div>`).join('')}
    <button class="btn primary full" id="btn-new-plan">＋ 新建计划</button>
  `;

  document.getElementById('btn-new-plan').onclick = () => showPlanEditor(null);
  app.querySelectorAll('[data-start-plan]').forEach(el => {
    el.onclick = () => startPlanFlow(el.dataset.startPlan);
  });
  app.querySelectorAll('[data-copy-plan]').forEach(el => {
    el.onclick = async () => {
      formDialog({
        title: '复制计划',
        okText: '复制',
        bodyHTML: `<div class="field"><label>新计划名称</label><input class="input" id="copy-name"></div>`,
        onOk: async (modal) => {
          const name = modal.querySelector('#copy-name').value.trim();
          const plan = await duplicateBuiltinPlan(el.dataset.copyPlan, name);
          toast('已复制');
          location.reload();
        },
      });
    };
  });
  app.querySelectorAll('[data-del-plan]').forEach(el => {
    el.onclick = async () => {
      const ok = await confirmDialog({ title: '删除计划', message: '确定删除这个计划吗？', danger: true, okText: '删除' });
      if (!ok) return;
      await removePlan(el.dataset.delPlan);
      toast('已删除');
      renderPlans();
    };
  });
}

/** 开始按计划训练（从计划页入口） */
async function startPlanFlow(planId) {
  const plans = await getAvailablePlans();
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;

  const modal = sheetDialog({
    title: esc(plan.name),
    bodyHTML: `
      <p class="muted small mb12">选择要练的训练日：</p>
      <div class="pick-list">
        ${plan.days.map((d, i) => `
          <div class="list-item day-item" data-idx="${i}" style="cursor:pointer">
            <div class="item-main">
              <div class="item-title">${esc(d.name)}</div>
              <div class="item-sub">${d.exercises.map(e => esc(e.name)).join(' · ')}</div>
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
      location.hash = '#/workout';
    };
  });
}

// =====================================================================
// 计划编辑器（新建）
// =====================================================================
async function showPlanEditor() {
  const allExercises = await getAllExercises();
  // 编辑态：临时数组 [{name, exerciseId, sets, targetReps, restSec}]
  const state = { name: '', days: [] };

  const pickExercise = () => new Promise((resolve) => {
    const modal = sheetDialog({
      title: '选择动作',
      bodyHTML: `
        <div class="search-box"><input class="input" id="pe-search" placeholder="搜索动作…"></div>
        <div class="pick-list" id="pe-list"></div>
      `,
    });
    const renderList = () => {
      const q = modal.querySelector('#pe-search').value.trim().toLowerCase();
      const filtered = allExercises.filter(ex => !q || ex.name.toLowerCase().includes(q));
      modal.querySelector('#pe-list').innerHTML = filtered.map(ex => `
        <div class="list-item pe-item" data-id="${esc(ex.id)}" style="cursor:pointer">
          <div class="item-main">
            <div class="item-title">${esc(ex.name)}</div>
            <div class="item-sub">${(ex.muscles || []).map(m => esc(m)).join(' · ')}</div>
          </div>
          <div class="item-side">${ex.kind === 'cardio' ? '<span class="badge blue">有氧</span>' : '<span class="badge green">力量</span>'}</div>
        </div>`).join('');
      modal.querySelectorAll('.pe-item').forEach(el => {
        el.onclick = () => {
          const ex = filtered.find(x => x.id === el.dataset.id);
          modal.closest('.modal-mask').remove();
          resolve(ex);
        };
      });
    };
    modal.querySelector('#pe-search').addEventListener('input', renderList);
    renderList();
  });

  const render = () => {
    app.innerHTML = `
      <div class="card">
        <div class="field"><label>计划名称</label><input class="input" id="plan-name" value="${esc(state.name)}" placeholder="如：我的推拉腿"></div>
      </div>
      ${state.days.map((day, di) => `
        <div class="card">
          <div class="row mb8">
            <div style="flex:1"><h2>训练日 ${di + 1}</h2></div>
            <div class="shrink row">
              <button class="btn small ghost" data-mv="${di}:-1">↑</button>
              <button class="btn small ghost" data-mv="${di}:1">↓</button>
              <button class="btn small danger" data-rm-day="${di}">删除</button>
            </div>
          </div>
          <div class="field"><label>训练日名称</label><input class="input day-name" data-di="${di}" value="${esc(day.name)}" placeholder="如：推日"></div>
          <h3 class="mt8">动作列表</h3>
          ${day.exercises.length === 0 ? '<p class="muted small mb8">还没有动作，点击下方添加</p>' : ''}
          ${day.exercises.map((ex, ei) => `
            <div class="list-item">
              <div class="item-main">
                <div class="item-title">${esc(ex.name)}</div>
                <div class="item-sub">${ex.sets} 组 × ${esc(String(ex.targetReps))} 次 · 休息 ${ex.restSec}s</div>
              </div>
              <div class="shrink row">
                <button class="btn small ghost" data-edit-ex="${di}:${ei}">编辑</button>
                <button class="btn small ghost" data-rm-ex="${di}:${ei}">✕</button>
              </div>
            </div>`).join('')}
          <button class="btn full mt8" data-add-ex="${di}">＋ 添加动作</button>
        </div>`).join('')}
      <div class="row mb12">
        <button class="btn full" id="btn-add-day">＋ 添加训练日</button>
        <button class="btn primary full" id="btn-save-plan">保存计划</button>
      </div>
      <button class="btn ghost full" id="btn-cancel-edit">取消</button>
    `;

    document.getElementById('plan-name').addEventListener('input', e => state.name = e.target.value);
    app.querySelectorAll('.day-name').forEach(el => {
      el.addEventListener('input', e => { state.days[Number(el.dataset.di)].name = e.target.value; });
    });
    app.querySelectorAll('[data-add-ex]').forEach(el => {
      el.onclick = async () => {
        const ex = await pickExercise();
        if (!ex) return;
        const day = state.days[Number(el.dataset.addEx)];
        day.exercises.push({
          exerciseId: ex.id, name: ex.name, muscles: ex.muscles || [],
          sets: 4, targetReps: '8-12', restSec: 90,
        });
        render();
      };
    });
    app.querySelectorAll('[data-edit-ex]').forEach(el => {
      el.onclick = () => {
        const [di, ei] = el.dataset.editEx.split(':').map(Number);
        const ex = state.days[di].exercises[ei];
        formDialog({
          title: `编辑 ${ex.name}`,
          okText: '保存',
          bodyHTML: `
            <div class="row">
              <div class="field"><label>目标组数</label><input class="input" id="ee-sets" type="number" min="1" value="${ex.sets}"></div>
              <div class="field"><label>目标次数</label><input class="input" id="ee-reps" value="${esc(String(ex.targetReps))}" placeholder="如 8-12"></div>
            </div>
            <div class="field"><label>组间休息（秒）</label><input class="input" id="ee-rest" type="number" min="0" value="${ex.restSec}"></div>
          `,
          onOk: (modal) => {
            ex.sets = parseInt(modal.querySelector('#ee-sets').value) || 4;
            ex.targetReps = modal.querySelector('#ee-reps').value.trim() || '8-12';
            ex.restSec = parseInt(modal.querySelector('#ee-rest').value) || 90;
            render();
          },
        });
      };
    });
    app.querySelectorAll('[data-rm-ex]').forEach(el => {
      el.onclick = () => {
        const [di, ei] = el.dataset.rmEx.split(':').map(Number);
        state.days[di].exercises.splice(ei, 1);
        render();
      };
    });
    app.querySelectorAll('[data-rm-day]').forEach(el => {
      el.onclick = () => {
        state.days.splice(Number(el.dataset.rmDay), 1);
        render();
      };
    });
    app.querySelectorAll('[data-mv]').forEach(el => {
      el.onclick = () => {
        const [di, dir] = el.dataset.mv.split(':').map(Number);
        const target = di + dir;
        if (target < 0 || target >= state.days.length) return;
        [state.days[di], state.days[target]] = [state.days[target], state.days[di]];
        render();
      };
    });
    document.getElementById('btn-add-day').onclick = () => {
      state.days.push({ name: `训练日 ${state.days.length + 1}`, exercises: [] });
      render();
    };
    document.getElementById('btn-save-plan').onclick = async () => {
      if (!state.name.trim()) { toast('请填写计划名称'); return; }
      if (state.days.length === 0) { toast('请至少添加一个训练日'); return; }
      const empty = state.days.find(d => d.exercises.length === 0);
      if (empty) { toast('每个训练日至少要有 1 个动作'); return; }
      await createPlan({
        name: state.name,
        days: state.days.map(d => ({
          name: d.name || '训练日',
          exercises: d.exercises.map(e => ({
            exerciseId: e.exerciseId, name: e.name, muscles: e.muscles,
            sets: e.sets, targetReps: e.targetReps, restSec: e.restSec,
          })),
        })),
      });
      toast('计划已保存');
      location.hash = '#/plans';
    };
    document.getElementById('btn-cancel-edit').onclick = () => location.hash = '#/plans';
  };

  // 初始化：一个空训练日
  state.days = [{ name: '训练日 1', exercises: [] }];
  render();
}

// =====================================================================
// 设置页
// =====================================================================
export async function renderSettings() {
  setTitle('设置');
  highlightTab('settings');

  const s = storage.getSettings();
  const notifState = 'Notification' in window ? Notification.permission : 'unsupported';
  const notifText = {
    granted: '✅ 已开启',
    denied: '❌ 已拒绝（请在浏览器设置中开启）',
    default: '未开启',
    unsupported: '此浏览器不支持',
  }[notifState];

  app.innerHTML = `
    <div class="card">
      <h2>训练设置</h2>
      <div class="setting-item">
        <div><div class="si-title">默认组间休息</div><div class="si-sub">完成一组后自动开始的倒计时时长</div></div>
        <input class="input" type="number" id="set-rest" min="0" max="600" step="5" value="${s.restTimer}">
      </div>
      <div class="setting-item">
        <div><div class="si-title">自动开始休息</div><div class="si-sub">完成一组力量训练后自动倒计时</div></div>
        <label class="switch"><input type="checkbox" id="set-auto" ${s.restTimerAuto ? 'checked' : ''}><span class="slider"></span></label>
      </div>
      <div class="setting-item">
        <div><div class="si-title">声音提醒</div><div class="si-sub">休息结束时播放提示音</div></div>
        <label class="switch"><input type="checkbox" id="set-sound" ${s.sound ? 'checked' : ''}><span class="slider"></span></label>
      </div>
      <div class="setting-item">
        <div><div class="si-title">震动提醒</div><div class="si-sub">休息结束时手机震动</div></div>
        <label class="switch"><input type="checkbox" id="set-vib" ${s.vibration ? 'checked' : ''}><span class="slider"></span></label>
      </div>
    </div>

    <div class="card">
      <h2>通知</h2>
      <div class="setting-item">
        <div><div class="si-title">休息结束通知</div><div class="si-sub">当前状态：${esc(notifText)}</div></div>
        <button class="btn small" id="btn-notif">${notifState === 'granted' ? '试听提示音' : '开启通知'}</button>
      </div>
      <p class="muted small" style="line-height:1.7">
        💡 说明：训练时请保持屏幕常亮（可插充电器）。安卓手机锁屏后浏览器可能被系统冻结，导致倒计时提醒延迟到解锁时才出现——这是网页应用的平台限制。
      </p>
    </div>

    <div class="card">
      <h2>数据备份</h2>
      <p class="muted small mb12">数据只保存在本机浏览器中。建议定期导出备份，换手机或清除浏览器数据前一定要先导出！</p>
      ${s.lastBackupAt ? `<p class="small mb12">上次备份：${fmtDate(s.lastBackupAt)}</p>` : ''}
      <div class="row">
        <button class="btn full" id="btn-export">导出备份</button>
        <button class="btn full" id="btn-import">导入备份</button>
      </div>
      <button class="btn danger full mt8" id="btn-wipe">清空所有数据</button>
    </div>

    <div class="card">
      <h2>关于</h2>
      <div class="detail-row"><span class="dr-label">版本</span><span class="dr-val">v${APP_VERSION}</span></div>
      <div class="detail-row"><span class="dr-label">数据存储</span><span class="dr-val">本机浏览器（离线可用）</span></div>
    </div>
  `;

  // 设置项变更即时保存
  document.getElementById('set-rest').addEventListener('change', (e) => {
    storage.setSettings({ restTimer: Math.max(0, parseInt(e.target.value) || 90) });
    toast('已保存');
  });
  document.getElementById('set-auto').addEventListener('change', (e) => {
    storage.setSettings({ restTimerAuto: e.target.checked });
  });
  document.getElementById('set-sound').addEventListener('change', (e) => {
    storage.setSettings({ sound: e.target.checked });
  });
  document.getElementById('set-vib').addEventListener('change', (e) => {
    storage.setSettings({ vibration: e.target.checked });
  });

  document.getElementById('btn-notif').onclick = async () => {
    if (notifState === 'granted') {
      testBeep();
      toast('如果听到提示音说明声音正常');
      return;
    }
    const result = await requestNotifyPermission();
    if (result === 'granted') toast('通知已开启 ✅');
    else if (result === 'denied') toast('通知被拒绝，请到浏览器设置里开启');
    renderSettings();
  };

  document.getElementById('btn-export').onclick = async () => {
    await exportMod.exportData();
  };
  document.getElementById('btn-import').onclick = () => {
    exportMod.importData().then(() => {
      toast('导入成功 ✅');
      renderSettings();
    });
  };
  document.getElementById('btn-wipe').onclick = async () => {
    const ok1 = await confirmDialog({
      title: '清空所有数据',
      message: '将删除所有训练记录、自定义动作和计划！建议先导出备份。',
      danger: true, okText: '继续',
    });
    if (!ok1) return;
    const ok2 = await confirmDialog({
      title: '再次确认',
      message: '真的要清空所有数据吗？此操作不可恢复！',
      danger: true, okText: '清空',
    });
    if (!ok2) return;
    await exportMod.wipeAllData();
    toast('已清空');
    renderSettings();
  };
}
