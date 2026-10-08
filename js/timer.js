// 组间休息倒计时：Web Worker + 通知 + 震动 + 蜂鸣

let worker = null;
let timerState = null;
const listeners = new Set();

/** 注册 tick 监听器。cb(remainingSec) */
export function onTimerTick(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 是否正在倒计时 */
export function isTimerRunning() {
  return timerState && timerState.remaining > 0 && timerState.running;
}

/** 获取剩余秒数（用于跨页面恢复显示） */
export function getTimerRemaining() {
  if (!timerState) return null;
  return timerState.running ? timerState.remaining : null;
}

/** 上次结束信息（用于重开） */
export function getLastTimerInfo() {
  return timerState ? { total: timerState.total } : null;
}

function ensureWorker() {
  if (worker) return;
  const code = `
    let interval = null;
    self.onmessage = (e) => {
      const { action, total } = e.data;
      if (action === 'start') {
        let remaining = total;
        const endAt = Date.now() + total * 1000;
        clearInterval(interval);
        interval = setInterval(() => {
          remaining = Math.ceil((endAt - Date.now()) / 1000);
          self.postMessage({ action: 'tick', remaining });
          if (remaining <= 0) {
            clearInterval(interval);
            self.postMessage({ action: 'done' });
          }
        }, 500);
      }
      if (action === 'stop') {
        clearInterval(interval);
        interval = null;
      }
    };
  `;
  const blob = new Blob([code], { type: 'text/javascript' });
  worker = new Worker(URL.createObjectURL(blob));
  worker.onmessage = (e) => {
    const { action, remaining } = e.data;
    if (action === 'tick') {
      if (!timerState) return;
      timerState.remaining = remaining;
      listeners.forEach((cb) => cb(remaining));
    }
    if (action === 'done') {
      if (!timerState) return;
      timerState.running = false;
      timerState.remaining = 0;
      notifyTimerDone();
    }
  };
}

/** 开始倒计时。totalSec 为休息秒数 */
export function startRestTimer(totalSec) {
  ensureWorker();
  timerState = { total: totalSec, remaining: totalSec, running: true };
  worker.postMessage({ action: 'start', total: totalSec });
  listeners.forEach((cb) => cb(totalSec));
}

/** 手动停止（不触发结束提醒） */
export function cancelTimer() {
  if (worker) worker.postMessage({ action: 'stop' });
  if (timerState) timerState.running = false;
  listeners.forEach((cb) => cb(0));
}

/** 倒计时结束：蜂鸣 + 震动 + 通知 */
function notifyTimerDone() {
  const { getSettings } = window.fitnessStorage || {};
  const settings = getSettings ? getSettings() : { sound: true, vibration: true };

  if (settings.sound) beep();
  if (settings.vibration && navigator.vibrate) {
    try { navigator.vibrate([300, 150, 300, 150, 500]); } catch { /* ignore */ }
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification('休息结束 💪', {
        body: '该开始下一组了！',
        tag: 'fitness-rest',
        icon: 'icons/icon-192.png',
        silent: true,
      });
      setTimeout(() => n.close(), 8000);
    } catch { /* ignore */ }
  }
  listeners.forEach((cb) => cb('done'));
}

/** 简单蜂鸣（AudioContext 合成，无需音频文件） */
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const play = (start, freq, dur) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.4, audioCtx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + start + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + start);
      osc.stop(audioCtx.currentTime + start + dur + 0.05);
    };
    play(0, 880, 0.3);
    play(0.35, 880, 0.3);
    play(0.7, 1174, 0.5);
  } catch { /* 后台可能被浏览器阻止，忽略 */ }
}

/** 请求通知权限（必须由用户手势触发调用） */
export async function requestNotifyPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** 试听蜂鸣（设置页用） */
export function testBeep() {
  beep();
  if (navigator.vibrate) navigator.vibrate(200);
}
