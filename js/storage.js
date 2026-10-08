// 数据层：IndexedDB（训练历史/自定义动作/计划）+ localStorage（设置）

const DB_NAME = 'fitnessDB';
const DB_VERSION = 1;
const STORES = {
  workouts: 'workouts',   // 训练会话，keyPath: id
  exercises: 'exercises', // 自定义动作，keyPath: id
  plans: 'plans',         // 训练计划，keyPath: id
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.workouts)) {
        db.createObjectStore(STORES.workouts, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.exercises)) {
        db.createObjectStore(STORES.exercises, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.plans)) {
        db.createObjectStore(STORES.plans, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============ 通用 CRUD ============
async function put(storeName, obj) {
  const db = await openDB();
  return reqToPromise(tx(db, storeName, 'readwrite').put(obj));
}

async function getAll(storeName) {
  const db = await openDB();
  return reqToPromise(tx(db, storeName, 'readonly').getAll());
}

async function getOne(storeName, id) {
  const db = await openDB();
  return reqToPromise(tx(db, storeName, 'readonly').get(id));
}

async function del(storeName, id) {
  const db = await openDB();
  return reqToPromise(tx(db, storeName, 'readwrite').delete(id));
}

// ============ 训练会话 ============
export const saveWorkout = (w) => put(STORES.workouts, w);
export const getAllWorkouts = () => getAll(STORES.workouts);
export const deleteWorkout = (id) => del(STORES.workouts, id);

/** 按日期 key (YYYY-MM-DD) 分组，value 为数组 */
export async function getWorkoutsGroupedByDate() {
  const all = await getAllWorkouts();
  const map = new Map();
  for (const w of all) {
    const key = localDateKey(w.startTime);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(w);
  }
  for (const list of map.values()) list.sort((a, b) => b.startTime - a.startTime);
  return map;
}

/** 某动作的全部历史组（按时间升序），用于 1RM 曲线 */
export async function getExerciseHistory(exerciseId) {
  const all = await getAllWorkouts();
  const points = [];
  for (const w of all) {
    for (const ex of w.exercises || []) {
      if (ex.exerciseId !== exerciseId || ex.kind !== 'strength') continue;
      for (const s of ex.sets || []) {
        if (s.weight && s.reps) {
          points.push({ date: w.startTime, weight: s.weight, reps: s.reps });
        }
      }
    }
  }
  points.sort((a, b) => a.date - b.date);
  return points;
}

function localDateKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ============ 自定义动作 ============
export const saveCustomExercise = (e) => put(STORES.exercises, e);
export const getAllCustom = () => getAll(STORES.exercises);
export const deleteCustomExercise = (id) => del(STORES.exercises, id);

// ============ 训练计划 ============
export const savePlan = (p) => put(STORES.plans, p);
export const getAllPlans = () => getAll(STORES.plans);
export const getPlan = (id) => getOne(STORES.plans, id);
export const deletePlan = (id) => del(STORES.plans, id);

// ============ 设置（localStorage） ============
const SETTINGS_KEY = 'fitness:settings';

export const DEFAULT_SETTINGS = {
  restTimer: 90,        // 默认组间休息秒数
  restTimerAuto: true,  // 完成一组后自动开始休息
  sound: true,          // 蜂鸣提醒
  vibration: true,      // 震动提醒
  unit: 'kg',           // 重量单位
  lastBackupAt: null,   // 上次备份时间戳
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch (e) {
    console.error('保存设置失败', e);
  }
  return next;
}

// ============ 整库导出/导入（备份） ============
export async function exportAllData() {
  const [workouts, exercises, plans] = await Promise.all([
    getAllWorkouts(), getAllCustom(), getAllPlans(),
  ]);
  return {
    app: 'fitness-tracker',
    version: 1,
    exportedAt: Date.now(),
    settings: getSettings(),
    workouts, exercises, plans,
  };
}

export async function importAllData(data) {
  if (!data || data.app !== 'fitness-tracker') throw new Error('不是有效的备份文件');
  const db = await openDB();
  const t = db.transaction([STORES.workouts, STORES.exercises, STORES.plans], 'readwrite');
  const wStore = t.objectStore(STORES.workouts);
  const eStore = t.objectStore(STORES.exercises);
  const pStore = t.objectStore(STORES.plans);

  // 清空后写入（导入=覆盖）
  wStore.clear();
  eStore.clear();
  pStore.clear();
  for (const w of data.workouts || []) wStore.put(w);
  for (const e of data.exercises || []) eStore.put(e);
  for (const p of data.plans || []) pStore.put(p);

  await new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });

  if (data.settings) setSettings(data.settings);
}
