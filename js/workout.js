// 训练会话状态机（内存态 + 持久化）
import { uid, estimate1RM } from './utils.js';

/**
 * 当前进行中的会话。结构：
 * {
 *   id, type: 'strength'|'cardio'|'mixed',
 *   startTime, planId, planName,
 *   exercises: [{
 *     exerciseId, name, kind, muscles,
 *     sets: [{weight, reps, warmup, failure, doneAt}],
 *     distanceKm, durationSec,
 *     targetSets, targetReps, restSec   // 按计划训练时的目标
 *   }],
 *   note
 * }
 */
let currentWorkout = null;

/** 开始新训练。opts: {type, planId, planName, planDay} */
export function startWorkout(opts = {}) {
  if (currentWorkout) throw new Error('已有进行中的训练');
  currentWorkout = {
    id: uid(),
    type: opts.type || 'strength',
    startTime: Date.now(),
    endTime: null,
    planId: opts.planId || null,
    planName: opts.planName || null,
    planDayName: opts.planDayName || null,
    exercises: [],
    note: '',
  };
  return currentWorkout;
}

/** 恢复进行中的训练（页面刷新后） */
export function restoreWorkout(saved) {
  if (!saved) return null;
  currentWorkout = saved;
  return currentWorkout;
}

export function getCurrentWorkout() {
  return currentWorkout;
}

export function isWorkoutActive() {
  return !!currentWorkout;
}

/** 给会话添加一个动作。ex: {exerciseId, name, kind, muscles, targetSets, targetReps, restSec} */
export function addExerciseToWorkout(ex, opts = {}) {
  if (!currentWorkout) throw new Error('没有进行中的训练');
  const entry = {
    exerciseId: ex.exerciseId || ex.id,
    name: ex.name,
    kind: ex.kind,
    muscles: ex.muscles || [],
    sets: [],
    distanceKm: null,
    durationSec: null,
    targetSets: opts.targetSets || null,
    targetReps: opts.targetReps || null,
    restSec: opts.restSec || null,
  };
  currentWorkout.exercises.push(entry);
  return entry;
}

export function removeExerciseFromWorkout(index) {
  if (!currentWorkout) return;
  currentWorkout.exercises.splice(index, 1);
}

/** 记录完成一组（力量）。exIndex 为动作在数组中的下标 */
export function completeSet(exIndex, { weight, reps, warmup = false, failure = false }) {
  if (!currentWorkout) throw new Error('没有进行中的训练');
  const ex = currentWorkout.exercises[exIndex];
  if (!ex) throw new Error('动作不存在');
  const set = {
    weight: Number(weight) || 0,
    reps: Number(reps) || 0,
    warmup: !!warmup,
    failure: !!failure,
    doneAt: Date.now(),
  };
  ex.sets.push(set);
  return set;
}

/** 修改最近一组（手滑录错时用） */
export function updateLastSet(exIndex, patch) {
  if (!currentWorkout) return;
  const ex = currentWorkout.exercises[exIndex];
  if (!ex || ex.sets.length === 0) return;
  Object.assign(ex.sets[ex.sets.length - 1], patch);
}

/** 删除某一组 */
export function deleteSet(exIndex, setIndex) {
  if (!currentWorkout) return;
  const ex = currentWorkout.exercises[exIndex];
  if (!ex) return;
  ex.sets.splice(setIndex, 1);
}

/** 记录有氧数据 */
export function setCardioData(exIndex, { distanceKm, durationSec }) {
  if (!currentWorkout) throw new Error('没有进行中的训练');
  const ex = currentWorkout.exercises[exIndex];
  if (!ex) throw new Error('动作不存在');
  ex.distanceKm = Number(distanceKm) || null;
  ex.durationSec = Number(durationSec) || null;
}

/** 结束训练：写入 IndexedDB，返回保存后的会话 */
export async function finishWorkout(note = '') {
  if (!currentWorkout) throw new Error('没有进行中的训练');
  if (currentWorkout.exercises.length === 0) {
    throw new Error('本次训练还没有记录任何动作');
  }
  const w = {
    ...currentWorkout,
    note: note.trim() || '',
    endTime: Date.now(),
  };
  const { saveWorkout } = await import('./storage.js');
  await saveWorkout(w);
  currentWorkout = null;
  return w;
}

/** 放弃训练（不保存） */
export function discardWorkout() {
  currentWorkout = null;
}

/** 会话内某个动作的已完成组数 */
export function completedSets(ex) {
  return (ex.sets || []).length;
}

/** 会话内某个动作的最佳 1RM（用于训练中展示） */
export function best1RMOf(ex) {
  let best = null;
  for (const s of ex.sets || []) {
    if (s.warmup) continue;
    const rm = estimate1RM(s.weight, s.reps);
    if (rm && (best === null || rm > best)) best = rm;
  }
  return best;
}
