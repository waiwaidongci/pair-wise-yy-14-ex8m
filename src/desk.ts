// 领用台状态流转：接收页面动作，调用规则层校验，写回档案层。
// 规则判定全部委托 rules.ts，这里只做状态搬运与流水登记。

import {
  DeskState,
  ItemCondition,
  Task,
  TaskItem,
  assetName,
  makeLog,
  nextId,
  today,
} from "./archive";
import {
  canReplaceWithNewPlate,
  holdReason,
  statusAfterCondition,
  taskCloseBlockers,
} from "./rules";

export type DeskAction =
  | {
      type: "create-task";
      building: string;
      borrower: string;
      returnBy: string;
      plateIds: string[];
      instrumentIds: string[];
    }
  | { type: "pickup"; taskId: string; pickupPerson: string }
  | { type: "remove-pending"; taskId: string; itemId: string }
  | { type: "record-condition"; taskId: string; itemId: string; condition: ItemCondition }
  | { type: "replace-plate"; taskId: string; itemId: string; newPlateId: string }
  | { type: "close-task"; taskId: string };

function pushLog(state: DeskState, text: string): DeskState {
  return { ...state, logs: [makeLog(text), ...state.logs].slice(0, 40) };
}

// 对任务内所有待领物品逐件执行领取校验：
// 通过的物品领出（资产转为外借），未通过的留在待领区并记录原因。
function issueAttempt(state: DeskState, taskId: string, pickupPerson: string): DeskState {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || task.status === "closed") return state;

  const day = today();
  let plates = state.plates;
  let instruments = state.instruments;
  let issued = 0;
  let held = 0;

  const items = task.items.map((item) => {
    if (item.state !== "pending") return item;
    const reason = holdReason(item, task, pickupPerson, { ...state, plates, instruments }, day);
    if (reason) {
      held += 1;
      return { ...item, holdReason: reason };
    }
    issued += 1;
    if (item.kind === "plate") {
      plates = plates.map((p) => (p.id === item.refId ? { ...p, status: "checked-out" as const } : p));
    } else {
      instruments = instruments.map((i) =>
        i.id === item.refId ? { ...i, status: "checked-out" as const } : i
      );
    }
    return { ...item, state: "issued" as const, holdReason: undefined };
  });

  if (issued === 0 && held === 0) return state;

  let next: DeskState = {
    ...state,
    plates,
    instruments,
    tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, items } : t)),
  };
  const parts: string[] = [];
  if (issued > 0) parts.push(`领出 ${issued} 件`);
  if (held > 0) parts.push(`${held} 件滞留待领区`);
  return pushLog(next, `${task.building}（领取人：${pickupPerson.trim() || "未填"}）办理领取：${parts.join("，")}`);
}

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case "create-task": {
      const items: TaskItem[] = [
        ...action.plateIds.map((refId) => ({
          id: nextId("item"),
          kind: "plate" as const,
          refId,
          state: "pending" as const,
        })),
        ...action.instrumentIds.map((refId) => ({
          id: nextId("item"),
          kind: "instrument" as const,
          refId,
          state: "pending" as const,
        })),
      ];
      const task: Task = {
        id: nextId("task"),
        building: action.building,
        borrower: action.borrower.trim(),
        returnBy: action.returnBy,
        status: "open",
        items,
      };
      let next: DeskState = { ...state, tasks: [task, ...state.tasks] };
      next = pushLog(
        next,
        `建任务 ${task.building}（负责人 ${task.borrower}，归还 ${task.returnBy.replace("T", " ")}），挂接 ${items.length} 件`
      );
      // 建任务后负责人当场办理领取，受规则约束的物品留在待领区
      return issueAttempt(next, task.id, task.borrower);
    }

    case "pickup":
      return issueAttempt(state, action.taskId, action.pickupPerson);

    case "remove-pending": {
      // 仅待领区物品可移出任务，已领出的必须走收工登记
      const task = state.tasks.find((t) => t.id === action.taskId);
      const item = task?.items.find((i) => i.id === action.itemId);
      if (!task || !item || task.status === "closed" || item.state !== "pending") return state;
      const next: DeskState = {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.taskId
            ? { ...t, items: t.items.filter((i) => i.id !== action.itemId) }
            : t
        ),
      };
      return pushLog(next, `${task.building}：${assetName(state, item)} 移出待领区`);
    }

    case "record-condition": {
      const task = state.tasks.find((t) => t.id === action.taskId);
      const item = task?.items.find((i) => i.id === action.itemId);
      if (!task || !item || task.status === "closed") return state;
      if (item.state !== "issued" || item.condition) return state;

      const assetStatus = statusAfterCondition(action.condition);
      const name = assetName(state, item);
      const next: DeskState = {
        ...state,
        plates: state.plates.map((p) =>
          item.kind === "plate" && p.id === item.refId ? { ...p, status: assetStatus } : p
        ),
        instruments: state.instruments.map((i) =>
          item.kind === "instrument" && i.id === item.refId ? { ...i, status: assetStatus } : i
        ),
        tasks: state.tasks.map((t) =>
          t.id === action.taskId
            ? {
                ...t,
                items: t.items.map((i) =>
                  i.id === action.itemId ? { ...i, condition: action.condition } : i
                ),
              }
            : t
        ),
      };
      const label = action.condition === "intact" ? "完好，已回库" : action.condition === "damaged" ? "损坏，资产停用" : "遗失，资产注销";
      return pushLog(next, `${task.building} 收工登记：${name} ${label}`);
    }

    case "replace-plate": {
      const task = state.tasks.find((t) => t.id === action.taskId);
      const item = task?.items.find((i) => i.id === action.itemId);
      const plate = state.plates.find((p) => p.id === action.newPlateId);
      if (!task || !item || !plate || task.status === "closed") return state;
      if (!canReplaceWithNewPlate(item) || plate.status !== "available") return state;

      const oldCode = assetName(state, item);
      // 旧凭证保持停用，任务改挂新凭证并回到待领区，重新走领取校验
      const next: DeskState = {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.taskId
            ? {
                ...t,
                items: t.items.map((i) =>
                  i.id === action.itemId
                    ? {
                        ...i,
                        refId: action.newPlateId,
                        state: "pending" as const,
                        condition: undefined,
                        holdReason: undefined,
                      }
                    : i
                ),
              }
            : t
        ),
      };
      return pushLog(next, `${task.building}：${oldCode} 损坏停用，任务改挂新凭证 编号牌 ${plate.code}`);
    }

    case "close-task": {
      const task = state.tasks.find((t) => t.id === action.taskId);
      if (!task || taskCloseBlockers(task).length > 0) return state;
      const next: DeskState = {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.taskId ? { ...t, status: "closed" as const } : t
        ),
      };
      return pushLog(next, `任务 ${task.building}（${task.borrower}）已结束，物品全部核销`);
    }

    default:
      return state;
  }
}
