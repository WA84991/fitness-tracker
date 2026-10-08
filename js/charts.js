// 图表模块（Chart.js 封装）
import { estimate1RM, workoutVolume, dateKey, fmtPace } from './utils.js';
import { getAllWorkouts, getExerciseHistory } from './storage.js';

let chartInstances = [];
let ChartLib = null;

/** 懒加载 Chart.js（CDN），失败返回 null */
async function loadChart() {
  if (ChartLib) return ChartLib;
  if (window.Chart) { ChartLib = window.Chart; return ChartLib; }
  try {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Chart.js 加载失败（离线时首次加载需要联网）'));
      document.head.appendChild(s);
    });
    ChartLib = window.Chart;
    return ChartLib;
  } catch (e) {
    return null;
  }
}

/** 销毁所有图表（路由切换时调用） */
export function destroyCharts() {
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];
}

const DARK_COLORS = {
  grid: 'rgba(154,163,178,0.12)',
  ticks: '#9aa3b2',
  accent: '#4caf50',
  blue: '#4d9fff',
  purple: '#9d7bff',
  warn: '#f5a623',
};

function baseOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: DARK_COLORS.ticks, boxWidth: 12, font: { size: 11 } } } },
    scales: {
      x: {
        ticks: { color: DARK_COLORS.ticks, maxRotation: 45, autoSkip: true, maxTicksLimit: 8, font: { size: 10 } },
        grid: { color: DARK_COLORS.grid },
      },
      y: {
        ticks: { color: DARK_COLORS.ticks, font: { size: 10 } },
        grid: { color: DARK_COLORS.grid },
        beginAtZero: true,
      },
    },
    ...extra,
  };
}

function shortDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 训练容量柱状图（近 N 天） */
export async function renderVolumeChart(canvas, days = 60) {
  const Chart = await loadChart();
  if (!Chart) return false;
  const all = await getAllWorkouts();
  const since = Date.now() - days * 86400000;
  const recent = all.filter(w => w.startTime >= since).sort((a, b) => a.startTime - b.startTime);

  const labels = recent.map(w => shortDate(w.startTime));
  const strength = recent.map(w => workoutVolume(w));
  const cardio = recent.map(w =>
    Math.round((w.exercises || []).filter(e => e.kind === 'cardio').reduce((sum, e) => sum + (e.distanceKm || 0), 0) * 100) / 100);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '训练容量 (kg)', data: strength, backgroundColor: DARK_COLORS.accent, borderRadius: 4 },
        { label: '有氧距离 (km)', data: cardio, backgroundColor: DARK_COLORS.blue, borderRadius: 4 },
      ],
    },
    options: baseOptions(),
  });
  chartInstances.push(chart);
  return true;
}

/** 某动作的 1RM 增长曲线 */
export async function render1RMChart(canvas, exerciseId, exerciseName) {
  const Chart = await loadChart();
  if (!Chart) return false;
  const history = await getExerciseHistory(exerciseId);
  if (history.length === 0) return 'empty';

  // 按日期聚合：一天内取最大 1RM
  const byDay = new Map();
  for (const p of history) {
    const key = dateKey(p.date);
    const rm = estimate1RM(p.weight, p.reps);
    if (!rm) continue;
    if (!byDay.has(key) || rm > byDay.get(key).rm) byDay.set(key, { date: p.date, rm });
  }
  const points = [...byDay.values()].sort((a, b) => a.date - b.date);

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map(p => shortDate(p.date)),
      datasets: [{
        label: `${exerciseName} 估算1RM (kg)`,
        data: points.map(p => Math.round(p.rm * 10) / 10),
        borderColor: DARK_COLORS.purple,
        backgroundColor: 'rgba(157,123,255,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: DARK_COLORS.purple,
      }],
    },
    options: baseOptions(),
  });
  chartInstances.push(chart);
  return true;
}

/** 有氧趋势：距离柱状 + 配速折线 */
export async function renderCardioChart(canvas, days = 90) {
  const Chart = await loadChart();
  if (!Chart) return false;
  const all = await getAllWorkouts();
  const since = Date.now() - days * 86400000;
  const recent = all.filter(w => w.startTime >= since).sort((a, b) => a.startTime - b.startTime);

  // 按天聚合有氧
  const byDay = new Map();
  for (const w of recent) {
    const key = dateKey(w.startTime);
    const cardio = (w.exercises || []).filter(e => e.kind === 'cardio');
    if (cardio.length === 0) continue;
    const dist = cardio.reduce((s, e) => s + (e.distanceKm || 0), 0);
    const dur = cardio.reduce((s, e) => s + (e.durationSec || 0), 0);
    if (!byDay.has(key)) byDay.set(key, { dist: 0, dur: 0 });
    const d = byDay.get(key);
    d.dist += dist;
    d.dur += dur;
  }
  const days_list = [...byDay.entries()].map(([k, v]) => ({
    key: k, dist: Math.round(v.dist * 100) / 100,
    pace: v.dist > 0 ? v.dur / v.dist : null,
  }));

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: days_list.map(d => d.key.slice(5)),
      datasets: [{
        label: '距离 (km)',
        data: days_list.map(d => d.dist),
        backgroundColor: DARK_COLORS.blue,
        borderRadius: 4,
        yAxisID: 'y',
      }, {
        label: '配速 (min/km)',
        type: 'line',
        data: days_list.map(d => d.pace ? Math.round(d.pace / 6) / 10 : null),
        borderColor: DARK_COLORS.warn,
        backgroundColor: DARK_COLORS.warn,
        pointRadius: 3,
        tension: 0.3,
        yAxisID: 'y1',
      }],
    },
    options: baseOptions({
      scales: {
        x: { ticks: { color: DARK_COLORS.ticks, maxRotation: 45, autoSkip: true, maxTicksLimit: 8, font: { size: 10 } }, grid: { color: DARK_COLORS.grid } },
        y: { ticks: { color: DARK_COLORS.ticks, font: { size: 10 } }, grid: { color: DARK_COLORS.grid }, beginAtZero: true, title: { display: true, text: 'km', color: DARK_COLORS.ticks } },
        y1: { position: 'right', ticks: { color: DARK_COLORS.ticks, font: { size: 10 } }, grid: { display: false }, beginAtZero: true, title: { display: true, text: 'min/km', color: DARK_COLORS.ticks } },
      },
    }),
  });
  chartInstances.push(chart);
  return days_list.length > 0;
}
