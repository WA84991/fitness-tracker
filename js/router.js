// hash 路由
import { renderToday, renderWorkout, renderHistory, renderCharts } from './ui/views.js';
import { renderPlans, renderSettings } from './ui/views2.js';
import { destroyCharts } from './charts.js';
import { getCurrentWorkout } from './workout.js';

const routes = {
  today: renderToday,
  workout: renderWorkout,
  history: renderHistory,
  charts: renderCharts,
  plans: renderPlans,
  settings: renderSettings,
};

export function route() {
  const hash = location.hash.replace(/^#\//, '') || 'today';
  // 未知路由回退到今天页
  const render = routes[hash] || renderToday;

  // 进行中的训练时，切到其他页面不丢失状态（状态在内存中）
  destroyCharts();
  render();
}

export function initRouter() {
  window.addEventListener('hashchange', route);
  // 首次进入：如果没带 hash，补上 #/today
  if (!location.hash) {
    location.replace('#/today');
  }
  route();
}
