// 规则层：发放校验与收工判定。纯函数，不依赖界面与存储。

import type {
  ArchiveState,
  Instrument,
  ItemKind,
  SurveyTask,
  TaskItem,
} from "./types";

// 仪器校准是否过期（校准有效期早于今天）
export function isCalibrationExpired(
  instrument: Instrument,
  today: string,
): boolean {
  return instrument.calibrationDue < today;
}

// 找出当前持有某件装备、尚未收工的外业任务
export function holderOf(
  state: ArchiveState,
  kind: ItemKind,
  refId: string,
  exceptTaskId?: string,
): SurveyTask | undefined {
  return state.tasks.find(
    (task) =>
      task.status === "active" &&
      task.id !== exceptTaskId &&
      task.items.some((item) => item.kind === kind && item.refId === refId),
  );
}

export interface Blocker {
  item?: TaskItem; // 与某件装备相关的阻塞会带上它，便于页面定位"改挂"
  reason: string;
}

// 发放校验：凭证未归还 / 仪器校准过期 / 领取人与负责人不一致，均留在待领区。
// 返回全部阻塞原因，空数组表示可以发放。
export function evaluateTask(
  state: ArchiveState,
  task: SurveyTask,
  today: string,
): Blocker[] {
  const blockers: Blocker[] = [];

  if (task.collector.trim() !== task.leader.trim()) {
    blockers.push({
      reason: `领取人「${task.collector}」与负责人「${task.leader}」不一致`,
    });
  }

  for (const item of task.items) {
    if (item.kind === "plate") {
      const plate = state.plates.find((p) => p.id === item.refId);
      if (!plate) {
        blockers.push({ item, reason: "编号牌不存在，请重新选择" });
      } else if (plate.status === "disabled") {
        blockers.push({
          item,
          reason: `编号牌 ${plate.code} 已停用${plate.note ? `（${plate.note}）` : ""}`,
        });
      } else if (plate.status === "checked-out") {
        const holder = holderOf(state, "plate", plate.id, task.id);
        blockers.push({
          item,
          reason: `编号牌 ${plate.code} 尚未归还${holder ? `（${holder.building} · ${holder.leader}）` : ""}`,
        });
      }
    } else {
      const instrument = state.instruments.find((i) => i.id === item.refId);
      if (!instrument) {
        blockers.push({ item, reason: "仪器不存在，请重新选择" });
      } else if (instrument.status === "disabled") {
        blockers.push({
          item,
          reason: `仪器 ${instrument.name} ${instrument.code} 已停用${instrument.note ? `（${instrument.note}）` : ""}`,
        });
      } else if (instrument.status === "checked-out") {
        const holder = holderOf(state, "instrument", instrument.id, task.id);
        blockers.push({
          item,
          reason: `仪器 ${instrument.name} ${instrument.code} 尚未归还${holder ? `（${holder.building} · ${holder.leader}）` : ""}`,
        });
      } else if (isCalibrationExpired(instrument, today)) {
        blockers.push({
          item,
          reason: `仪器 ${instrument.name} ${instrument.code} 校准已于 ${instrument.calibrationDue} 过期`,
        });
      }
    }
  }

  return blockers;
}

export function canIssue(
  state: ArchiveState,
  task: SurveyTask,
  today: string,
): boolean {
  return evaluateTask(state, task, today).length === 0;
}

// 收工判定：逐件登记完好/损坏/遗失；缺件（未登记或遗失）任务不能结束。
export interface CompletionCheck {
  unrecorded: TaskItem[];
  lost: TaskItem[];
  canFinish: boolean;
}

export function checkCompletion(task: SurveyTask): CompletionCheck {
  const unrecorded = task.items.filter((item) => item.condition === null);
  const lost = task.items.filter((item) => item.condition === "lost");
  return {
    unrecorded,
    lost,
    canFinish: unrecorded.length === 0 && lost.length === 0,
  };
}
