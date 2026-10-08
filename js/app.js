// 应用入口
import { initRouter } from './router.js';
import * as storage from './storage.js';
import * as timer from './timer.js';

// 暴露 storage 给 timer 模块（蜂鸣/震动设置读取）
window.fitnessStorage = storage;

const APP_VERSION = '1.0.0';

// ============ 初始化 ============
async function init() {
  // 1. 预热 IndexedDB（提前暴露错误）
  try {
    await storage.getAllWorkouts();
  } catch (e) {
    console.error('IndexedDB 初始化失败', e);
  }

  // 2. 注册 Service Worker（PWA）
  registerServiceWorker();

  // 3. 启动路由
  initRouter();
}

// ============ Service Worker ============
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // 本地开发（file://）静默跳过
  if (location.protocol === 'file:') return;
  // 临时试用环境：非 localhost 的 http 地址无法注册 SW（浏览器安全限制），跳过
  if (location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(location.hostname)) return;

  // 记录注册前是否已有旧版本在控制页面（区分「首次安装」和「真更新」，
  // 避免 skipWaiting+claim 的竞态导致首次安装也误弹更新提示）
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.register('sw.js')
    .then(reg => {
      // 检测新版本
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && hadController) {
            showUpdateBanner();
          }
        });
      });
    })
    .catch(err => {
      console.warn('Service Worker 注册失败', err);
    });
}

function showUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.hidden = false;
  document.getElementById('update-now').onclick = () => {
    location.reload();
  };
  document.getElementById('update-close').onclick = () => {
    banner.hidden = true;
  };
}

// 页面初始化
init();
