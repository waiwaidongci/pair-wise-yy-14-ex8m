// 规则层：领用台的业务约束，全部为纯函数，不依赖页面与状态管理。
// 三条核心规则：
//   1. 凭证未归还、仪器校准过期、领取人与负责人不一致 → 物品留在待领区；
//   2. 收工逐件登记完好/损坏/遗失，缺件任务不能结束；
//   3. 损坏凭证停用，换新后任务改挂新凭证。

import {
  AssetStatus,
  DeskState,
  Instrument,
  ItemCondition,
  Task,
  TaskItem,
  findInstrument,
  findPlate,
} from "./archive";

// 领取人须与任务登记的领用人（负责人）一致
export function personMatches(task: Task, pickupPerson: string): boolean {
  return pickupPerson.trim() !== "" && pickupPerson.trim() === task.borrower.trim();
}

export function isCalibrationExpired(instrument: Instrument, day: string): boolean {
  return instrument.calibrationDue < day;
}

// 判定一件物品能否从待领区领走；返回 null 表示可领，否则返回滞留原因
export function holdReason(
  item: Pick<TaskItem, "kind" | "refId">,
  task: Task,
  pickupPerson: string,
  state: DeskState,
  day: string
): string | null {
  if (!personMatches(task, pickupPerson)) return "领取人与负责人不一致";

  if (item.kind === "plate") {
    const plate = findPlate(state, item.refId);
    if (!plate) return "凭证档案缺失";
    if (plate.status === "checked-out") return "凭证未归还";
    if (plate.status === "disabled") return "凭证已停用";
    if (plate.status === "lost") return "凭证已遗失";
    return null;
  }

  const instrument = findInstrument(state, item.refId);
  if (!instrument) return "仪器档案缺失";
  if (instrument.status === "checked-out") return "仪器外借未还";
  if (instrument.status === "disabled") return "仪器已停用";
  if (instrument.status === "lost") return "仪器已遗失";
  if (isCalibrationExpired(instrument, day)) return `校准过期（至 ${instrument.calibrationDue}）`;
  return null;
}

// 缺件任务不能结束：待领区未清空、已领出未登记收工，均给出阻断原因
export function taskCloseBlockers(task: Task): string[] {
  if (task.status === "closed") return ["任务已结束"];
  const blockers: string[] = [];
  const pending = task.items.filter((item) => item.state === "pending").length;
  if (pending > 0) blockers.push(`待领区还有 ${pending} 件，请先领取或移出`);
  const missing = task.items.filter((item) => item.state === "issued" && !item.condition).length;
  if (missing > 0) blockers.push(`缺件 ${missing} 件未登记收工（完好/损坏/遗失）`);
  return blockers;
}

// 收工登记对档案的影响：完好回库，损坏停用，遗失注销
export function statusAfterCondition(condition: ItemCondition): AssetStatus {
  if (condition === "intact") return "available";
  if (condition === "damaged") return "disabled";
  return "lost";
}

// 损坏的编号牌可以换新，任务改挂新凭证
export function canReplaceWithNewPlate(item: TaskItem): boolean {
  return item.kind === "plate" && item.condition === "damaged";
}
