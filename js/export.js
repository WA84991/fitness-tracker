// 数据备份：导出/导入 JSON 文件
import { exportAllData, importAllData, setSettings } from './storage.js';
import { dateKey } from './utils.js';

/** 导出备份：下载 JSON 文件 */
export async function exportData() {
  const data = await exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `健身记录备份-${dateKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  setSettings({ lastBackupAt: Date.now() });
}

/** 导入备份：弹出文件选择 */
export function importData() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) { resolve(false); return; }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await importAllData(data);
        resolve(true);
      } catch (e) {
        alert('导入失败：' + (e.message || '文件格式不正确'));
        reject(e);
      }
    };
    input.click();
  });
}

/** 清空所有数据 */
export async function wipeAllData() {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('fitnessDB');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const t = db.transaction(['workouts', 'exercises', 'plans'], 'readwrite');
    t.objectStore('workouts').clear();
    t.objectStore('exercises').clear();
    t.objectStore('plans').clear();
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}
