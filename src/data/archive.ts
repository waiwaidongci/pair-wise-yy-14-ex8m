// 档案层：编号牌 / 仪器台账与领用任务的存储和状态变迁。
// 只依赖规则层，不承担任何界面渲染。

import { useState } from "react";
import {
  checkCompletion,
  evaluateTask,
  holderOf,
  isCalibrationExpired,
} from "../domain/rules";
import type {
  ArchiveState,
  EquipmentStatus,
  Instrument,
  ItemCondition,
  ItemKind,
  Plate,
  SurveyTask,
  TaskItem,
} from "../domain/types";

export const CONDITION_LABEL: Record<ItemCondition, string> = {
  intact: "完好",
  damaged: "损坏",
  lost: "遗失",
};

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  available: "在库",
  "checked-out": "借出",
  disabled: "停用",
};

export function localNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// —— 台账种子 ——

const seedState: ArchiveState = {
  plates: [
    { id: "plate-1", code: "测字·01", status: "available" },
    { id: "plate-2", code: "测字·02", status: "checked-out" },
    { id: "plate-3", code: "测字·03", status: "available" },
    { id: "plate-4", code: "测字·04", status: "disabled", note: "上期收工登记损坏" },
  ],
  instruments: [
    { id: "ins-1", name: "全站仪", code: "TS-01", calibrationDue: "2028-03-31", status: "available" },
    { id: "ins-2", name: "水准仪", code: "LE-02", calibrationDue: "2026-08-15", status: "available" },
    { id: "ins-3", name: "激光测距仪", code: "DM-03", calibrationDue: "2028-01-10", status: "checked-out" },
    { id: "ins-4", name: "三维激光扫描仪", code: "SC-04", calibrationDue: "2027-12-01", status: "available" },
  ],
  tasks: [
    {
      id: "T-01",
      building: "太和殿前檐",
      leader: "王守拙",
      collector: "王守拙",
      dueBack: "2026-09-28T18:00",
      createdAt: "2026-09-24T08:30",
      issuedAt: "2026-09-24T08:35",
      finishedAt: null,
      status: "active",
      items: [
        { kind: "plate", refId: "plate-2", condition: null },
        { kind: "instrument", refId: "ins-3", condition: null },
      ],
    },
    {
      id: "T-02",
      building: "慈宁宫东配殿",
      leader: "李觅",
      collector: "赵拓",
      dueBack: "2026-09-27T18:00",
      createdAt: "2026-09-25T08:10",
      issuedAt: null,
      finishedAt: null,
      status: "pending",
      items: [
        { kind: "plate", refId: "plate-2", condition: null },
        { kind: "instrument", refId: "ins-2", condition: null },
      ],
    },
    {
      id: "T-03",
      building: "碑亭",
      leader: "陈默",
      collector: "陈默",
      dueBack: "2026-09-23T18:00",
      createdAt: "2026-09-22T09:00",
      issuedAt: "2026-09-22T09:05",
      finishedAt: "2026-09-23T17:40",
      status: "done",
      items: [
        { kind: "plate", refId: "plate-3", condition: "intact" },
        { kind: "instrument", refId: "ins-4", condition: "intact" },
      ],
    },
  ],
};

let taskSeq = 4;

// —— 查询 ——

export function equipmentLabel(state: ArchiveState, item: TaskItem): string {
  if (item.kind === "plate") {
    return state.plates.find((p) => p.id === item.refId)?.code ?? "未知编号牌";
  }
  const instrument = state.instruments.find((i) => i.id === item.refId);
  return instrument ? `${instrument.name} ${instrument.code}` : "未知仪器";
}

export function holderLabel(
  state: ArchiveState,
  kind: ItemKind,
  refId: string,
): string | null {
  const holder = holderOf(state, kind, refId);
  return holder ? `${holder.building} · ${holder.leader}` : null;
}

export function availablePlates(state: ArchiveState): Plate[] {
  return state.plates.filter((p) => p.status === "available");
}

// 可改挂的仪器：在库且校准未过期
export function issuableInstruments(
  state: ArchiveState,
  today: string,
): Instrument[] {
  return state.instruments.filter(
    (i) => i.status === "available" && !isCalibrationExpired(i, today),
  );
}

// —— 变迁 ——

export interface TaskDraft {
  building: string;
  leader: string;
  collector: string; // 留空表示同负责人
  dueBack: string;
  plateIds: string[];
  instrumentIds: string[];
}

// 建任务：登记建筑、领用人、归还时间并选定装备；
// 规则通过直接发放，否则留在待领区。
export function createTask(
  state: ArchiveState,
  draft: TaskDraft,
  now: string,
  today: string,
): { state: ArchiveState; issued: boolean } {
  const task: SurveyTask = {
    id: `T-${String(taskSeq++).padStart(2, "0")}`,
    building: draft.building.trim(),
    leader: draft.leader.trim(),
    collector: draft.collector.trim() || draft.leader.trim(),
    dueBack: draft.dueBack,
    createdAt: now,
    issuedAt: null,
    finishedAt: null,
    status: "pending",
    items: [
      ...draft.plateIds.map<TaskItem>((refId) => ({
        kind: "plate",
        refId,
        condition: null,
      })),
      ...draft.instrumentIds.map<TaskItem>((refId) => ({
        kind: "instrument",
        refId,
        condition: null,
      })),
    ],
  };
  const next: ArchiveState = { ...state, tasks: [...state.tasks, task] };
  if (evaluateTask(next, task, today).length > 0) {
    return { state: next, issued: false };
  }
  return { state: issueTask(next, task.id, now, today), issued: true };
}

// 发放：规则拦截的任务原地不动；通过后装备转为借出。
export function issueTask(
  state: ArchiveState,
  taskId: string,
  now: string,
  today: string,
): ArchiveState {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || task.status !== "pending") return state;
  if (evaluateTask(state, task, today).length > 0) return state;

  const issued: SurveyTask = { ...task, status: "active", issuedAt: now };
  const checkout = <T extends Plate | Instrument>(list: T[]): T[] =>
    list.map((equipment) =>
      issued.items.some((item) => item.refId === equipment.id)
        ? ({ ...equipment, status: "checked-out" } as T)
        : equipment,
    );
  return {
    plates: checkout(state.plates),
    instruments: checkout(state.instruments),
    tasks: state.tasks.map((t) => (t.id === taskId ? issued : t)),
  };
}

// 收工登记：逐件记下完好 / 损坏 / 遗失。
export function recordCondition(
  state: ArchiveState,
  taskId: string,
  kind: ItemKind,
  refId: string,
  condition: ItemCondition,
): ArchiveState {
  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId && task.status === "active"
        ? {
            ...task,
            items: task.items.map((item) =>
              item.kind === kind && item.refId === refId
                ? { ...item, condition }
                : item,
            ),
          }
        : task,
    ),
  };
}

// 结束任务：缺件（未登记或遗失）被规则拦下；
// 结束后装备落账——完好回库，损坏 / 遗失停用。
export function finishTask(
  state: ArchiveState,
  taskId: string,
  now: string,
): ArchiveState {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || task.status !== "active") return state;
  if (!checkCompletion(task).canFinish) return state;

  const settle = <T extends Plate | Instrument>(list: T[], kind: ItemKind): T[] =>
    list.map((equipment) => {
      const item = task.items.find(
        (i) => i.kind === kind && i.refId === equipment.id,
      );
      if (!item) return equipment;
      if (item.condition === "intact") {
        return { ...equipment, status: "available", note: undefined } as T;
      }
      return {
        ...equipment,
        status: "disabled",
        note:
          item.condition === "damaged"
            ? "收工登记损坏，停用"
            : "收工登记遗失，停用",
      } as T;
    });

  return {
    plates: settle(state.plates, "plate"),
    instruments: settle(state.instruments, "instrument"),
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? ({ ...t, status: "done", finishedAt: now } as SurveyTask)
        : t,
    ),
  };
}

// 改挂：待领任务把停用 / 未归还的凭证或仪器换成在库的新装备。
export function replaceItem(
  state: ArchiveState,
  taskId: string,
  kind: ItemKind,
  oldRefId: string,
  newRefId: string,
): ArchiveState {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || task.status !== "pending") return state;
  const pool: Array<Plate | Instrument> =
    kind === "plate" ? state.plates : state.instruments;
  const target = pool.find((e) => e.id === newRefId);
  if (!target || target.status !== "available") return state;
  if (task.items.some((i) => i.kind === kind && i.refId === newRefId)) {
    return state;
  }
  return {
    ...state,
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            items: t.items.map((item) =>
              item.kind === kind && item.refId === oldRefId
                ? { kind, refId: newRefId, condition: null }
                : item,
            ),
          }
        : t,
    ),
  };
}

// 人证不符时改由负责人领取。
export function assignCollector(
  state: ArchiveState,
  taskId: string,
  collector: string,
): ArchiveState {
  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId && task.status === "pending"
        ? { ...task, collector }
        : task,
    ),
  };
}

// 撤销待领任务（尚未发放，不涉及装备落账）。
export function cancelTask(state: ArchiveState, taskId: string): ArchiveState {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || task.status !== "pending") return state;
  return { ...state, tasks: state.tasks.filter((t) => t.id !== taskId) };
}

// —— 页面使用的 store ——

export function useArchive() {
  const [state, setState] = useState<ArchiveState>(seedState);
  const now = localNow();
  const today = now.slice(0, 10);

  return {
    state,
    now,
    today,
    createTask: (draft: TaskDraft): boolean => {
      const result = createTask(state, draft, now, today);
      setState(result.state);
      return result.issued;
    },
    issueTask: (taskId: string) =>
      setState((s) => issueTask(s, taskId, localNow(), today)),
    recordCondition: (
      taskId: string,
      kind: ItemKind,
      refId: string,
      condition: ItemCondition,
    ) => setState((s) => recordCondition(s, taskId, kind, refId, condition)),
    finishTask: (taskId: string) =>
      setState((s) => finishTask(s, taskId, localNow())),
    replaceItem: (taskId: string, kind: ItemKind, oldRefId: string, newRefId: string) =>
      setState((s) => replaceItem(s, taskId, kind, oldRefId, newRefId)),
    assignCollector: (taskId: string, collector: string) =>
      setState((s) => assignCollector(s, taskId, collector)),
    cancelTask: (taskId: string) => setState((s) => cancelTask(s, taskId)),
  };
}
