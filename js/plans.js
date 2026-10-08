// 训练计划模板 + 按计划开练
import { uid } from './utils.js';
import { getAllPlans, savePlan, getPlan, deletePlan } from './storage.js';

/**
 * Plan: {
 *   id, name, note,
 *   days: [{
 *     name,                       // 如 "推日（胸肩三头）"
 *     exercises: [{exerciseId, name, muscles, sets, targetReps, restSec}]
 *   }]
 * }
 */

/** 内置示例计划 */
export const BUILTIN_PLANS = [
  {
    id: 'builtin-ppl',
    name: '推拉腿分化（示例）',
    builtin: true,
    days: [
      {
        name: '推日（胸肩三头）',
        exercises: [
          { exerciseId: 'bench-press', name: '杠铃卧推', sets: 4, targetReps: '8-10', restSec: 120 },
          { exerciseId: 'ohp', name: '杠铃肩推', sets: 3, targetReps: '8-10', restSec: 90 },
          { exerciseId: 'incline-db-press', name: '上斜哑铃卧推', sets: 3, targetReps: '10-12', restSec: 90 },
          { exerciseId: 'lateral-raise', name: '哑铃侧平举', sets: 4, targetReps: '12-15', restSec: 60 },
          { exerciseId: 'triceps-pushdown', name: '绳索下压', sets: 3, targetReps: '10-12', restSec: 60 },
        ],
      },
      {
        name: '拉日（背二头）',
        exercises: [
          { exerciseId: 'deadlift', name: '硬拉', sets: 3, targetReps: '5', restSec: 180 },
          { exerciseId: 'pull-up', name: '引体向上', sets: 4, targetReps: '8-12', restSec: 120 },
          { exerciseId: 'barbell-row', name: '杠铃划船', sets: 4, targetReps: '8-10', restSec: 90 },
          { exerciseId: 'face-pull', name: '面拉', sets: 3, targetReps: '12-15', restSec: 60 },
          { exerciseId: 'barbell-curl', name: '杠铃弯举', sets: 3, targetReps: '10-12', restSec: 60 },
        ],
      },
      {
        name: '腿日（腿臀核心）',
        exercises: [
          { exerciseId: 'squat', name: '杠铃深蹲', sets: 4, targetReps: '6-8', restSec: 180 },
          { exerciseId: 'romanian-deadlift', name: '罗马尼亚硬拉', sets: 3, targetReps: '8-10', restSec: 120 },
          { exerciseId: 'leg-press', name: '腿举', sets: 4, targetReps: '10-12', restSec: 90 },
          { exerciseId: 'leg-curl', name: '腿弯举', sets: 3, targetReps: '10-12', restSec: 60 },
          { exerciseId: 'calf-raise', name: '站姿提踵', sets: 4, targetReps: '15-20', restSec: 60 },
        ],
      },
    ],
  },
];

/** 获取全部计划（内置 + 用户创建）。内置计划存在内存，不写入数据库 */
export async function getAvailablePlans() {
  const userPlans = await getAllPlans();
  return [...BUILTIN_PLANS, ...userPlans];
}

/** 创建计划（写入数据库） */
export async function createPlan({ name, note = '', days }) {
  const plan = { id: uid(), name: name.trim(), note, days };
  await savePlan(plan);
  return plan;
}

/** 更新计划 */
export async function updatePlan(id, patch) {
  const plan = await getPlan(id);
  if (!plan) throw new Error('计划不存在');
  await savePlan({ ...plan, ...patch });
}

/** 删除计划（仅限用户创建的） */
export async function removePlan(id) {
  const plan = await getPlan(id);
  if (plan) await deletePlan(id);
}

/** 按计划开练：返回要预填充的动作列表（含目标） */
export async function getPlanDayExercises(planId, dayIndex) {
  let plan = await getPlan(planId);
  if (!plan) {
    // 内置计划
    plan = BUILTIN_PLANS.find(p => p.id === planId);
  }
  if (!plan) throw new Error('计划不存在');
  const day = plan.days[dayIndex] || plan.days[0];
  return { plan, day, exercises: day.exercises };
}

/** 从计划复制一份（转为用户自己的计划，可编辑） */
export async function duplicateBuiltinPlan(builtinPlanId, newName) {
  const plan = BUILTIN_PLANS.find(p => p.id === builtinPlanId);
  if (!plan) throw new Error('示例计划不存在');
  const copy = {
    id: uid(),
    name: newName || plan.name + '（副本）',
    note: plan.note || '',
    days: JSON.parse(JSON.stringify(plan.days)),
  };
  await savePlan(copy);
  return copy;
}
