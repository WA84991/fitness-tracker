// 内置动作库 + 自定义动作管理
import { uid } from './utils.js';

export const MUSCLE_GROUPS = ['胸', '背', '肩', '腿', '臀', '手臂', '核心', '全身', '有氧'];

export const BUILTIN_EXERCISES = [
  // —— 力量训练 ——
  { id: 'bench-press', name: '杠铃卧推', kind: 'strength', muscles: ['胸', '手臂'], equipment: '杠铃' },
  { id: 'incline-db-press', name: '上斜哑铃卧推', kind: 'strength', muscles: ['胸', '肩'], equipment: '哑铃' },
  { id: 'squat', name: '杠铃深蹲', kind: 'strength', muscles: ['腿', '臀', '核心'], equipment: '杠铃' },
  { id: 'leg-press', name: '腿举', kind: 'strength', muscles: ['腿', '臀'], equipment: '器械' },
  { id: 'deadlift', name: '硬拉', kind: 'strength', muscles: ['背', '腿', '核心'], equipment: '杠铃' },
  { id: 'barbell-row', name: '杠铃划船', kind: 'strength', muscles: ['背', '手臂'], equipment: '杠铃' },
  { id: 'pull-up', name: '引体向上', kind: 'strength', muscles: ['背', '手臂'], equipment: '自重' },
  { id: 'lat-pulldown', name: '高位下拉', kind: 'strength', muscles: ['背', '手臂'], equipment: '器械' },
  { id: 'ohp', name: '杠铃肩推', kind: 'strength', muscles: ['肩', '手臂'], equipment: '杠铃' },
  { id: 'db-shoulder-press', name: '哑铃肩推', kind: 'strength', muscles: ['肩'], equipment: '哑铃' },
  { id: 'lateral-raise', name: '哑铃侧平举', kind: 'strength', muscles: ['肩'], equipment: '哑铃' },
  { id: 'barbell-curl', name: '杠铃弯举', kind: 'strength', muscles: ['手臂'], equipment: '杠铃' },
  { id: 'db-curl', name: '哑铃弯举', kind: 'strength', muscles: ['手臂'], equipment: '哑铃' },
  { id: 'triceps-pushdown', name: '绳索下压', kind: 'strength', muscles: ['手臂'], equipment: '绳索' },
  { id: 'lunge', name: '哑铃箭步蹲', kind: 'strength', muscles: ['腿', '臀'], equipment: '哑铃' },
  { id: 'leg-curl', name: '腿弯举', kind: 'strength', muscles: ['腿'], equipment: '器械' },
  { id: 'leg-extension', name: '腿屈伸', kind: 'strength', muscles: ['腿'], equipment: '器械' },
  { id: 'calf-raise', name: '站姿提踵', kind: 'strength', muscles: ['腿'], equipment: '器械' },
  { id: 'plank', name: '平板支撑', kind: 'strength', muscles: ['核心'], equipment: '自重' },
  { id: 'crunch', name: '卷腹', kind: 'strength', muscles: ['核心'], equipment: '自重' },
  { id: 'push-up', name: '俯卧撑', kind: 'strength', muscles: ['胸', '手臂', '核心'], equipment: '自重' },
  { id: 'dip', name: '双杠臂屈伸', kind: 'strength', muscles: ['胸', '手臂'], equipment: '自重' },
  { id: 'face-pull', name: '面拉', kind: 'strength', muscles: ['肩', '背'], equipment: '绳索' },
  { id: 'cable-fly', name: '绳索夹胸', kind: 'strength', muscles: ['胸'], equipment: '绳索' },
  { id: 'hip-thrust', name: '杠铃臀推', kind: 'strength', muscles: ['臀', '腿'], equipment: '杠铃' },
  { id: 'romanian-deadlift', name: '罗马尼亚硬拉', kind: 'strength', muscles: ['腿', '臀', '背'], equipment: '杠铃' },
  // —— 有氧 ——
  { id: 'running', name: '跑步', kind: 'cardio', muscles: ['有氧'], equipment: '户外' },
  { id: 'treadmill', name: '跑步机', kind: 'cardio', muscles: ['有氧'], equipment: '跑步机' },
  { id: 'cycling', name: '骑行', kind: 'cardio', muscles: ['有氧'], equipment: '户外' },
  { id: 'elliptical', name: '椭圆机', kind: 'cardio', muscles: ['有氧'], equipment: '椭圆机' },
  { id: 'rowing', name: '划船机', kind: 'cardio', muscles: ['有氧', '背'], equipment: '划船机' },
  { id: 'jump-rope', name: '跳绳', kind: 'cardio', muscles: ['有氧'], equipment: '跳绳' },
  { id: 'stair-climber', name: '爬楼机', kind: 'cardio', muscles: ['有氧', '腿'], equipment: '爬楼机' },
  { id: 'swimming', name: '游泳', kind: 'cardio', muscles: ['有氧'], equipment: '泳池' },
  { id: 'walking', name: '快走', kind: 'cardio', muscles: ['有氧'], equipment: '户外' },
  { id: 'hiit', name: 'HIIT', kind: 'cardio', muscles: ['有氧', '全身'], equipment: '自重' },
];

/** 获取全部动作（内置 + 自定义） */
export async function getAllExercises() {
  const { getAllCustom } = await import('./storage.js');
  const custom = await getAllCustom();
  return [...BUILTIN_EXERCISES, ...custom];
}

/** 按 ID 查动作（先内置后自定义） */
export async function getExerciseById(id) {
  const all = await getAllExercises();
  return all.find(e => e.id === id) || null;
}

/** 添加自定义动作 */
export async function addCustomExercise({ name, kind, muscles = [], equipment = '自重' }) {
  const { saveCustomExercise } = await import('./storage.js');
  const ex = {
    id: uid(),
    name: name.trim(),
    kind,
    muscles,
    equipment,
    isCustom: true,
  };
  await saveCustomExercise(ex);
  return ex;
}

/** 删除自定义动作 */
export async function deleteCustomExercise(id) {
  const { deleteCustomExercise: del } = await import('./storage.js');
  await del(id);
}
