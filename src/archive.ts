// 档案层：编号牌、仪器、建筑与领用任务的台账数据。
// 只负责数据结构与查询，不含业务规则（见 rules.ts）和页面渲染（见 App.tsx 及 components/）。

export type AssetStatus = "available" | "checked-out" | "disabled" | "lost";
export type ItemCondition = "intact" | "damaged" | "lost";
export type ItemKind = "plate" | "instrument";

export interface Plate {
  id: string;
  code: string; // 编号牌号码
  status: AssetStatus;
}

export interface Instrument {
  id: string;
  name: string; // 仪器名称
  calibrationDue: string; // 校准有效期至 YYYY-MM-DD
  status: AssetStatus;
}

export interface TaskItem {
  id: string;
  kind: ItemKind;
  refId: string; // 挂接的编号牌或仪器 id
  state: "pending" | "issued"; // 待领区 / 已领出
  holdReason?: string; // 滞留待领区的原因
  condition?: ItemCondition; // 收工登记：完好 / 损坏 / 遗失
}

export interface Task {
  id: string;
  building: string; // 建筑
  borrower: string; // 领用人（负责人）
  returnBy: string; // 归还时间
  status: "open" | "closed";
  items: TaskItem[];
}

export interface LogEntry {
  id: string;
  time: string;
  text: string;
}

export interface DeskState {
  plates: Plate[];
  instruments: Instrument[];
  tasks: Task[];
  logs: LogEntry[];
}

export const BUILDINGS = ["显庆殿", "文昌阁", "听雨轩", "山门殿", "藏经楼"];

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  available: "在库",
  "checked-out": "外借未还",
  disabled: "已停用",
  lost: "已遗失",
};

export const CONDITION_LABEL: Record<ItemCondition, string> = {
  intact: "完好",
  damaged: "损坏",
  lost: "遗失",
};

let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function now(): string {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

export function findPlate(state: DeskState, id: string): Plate | undefined {
  return state.plates.find((p) => p.id === id);
}

export function findInstrument(state: DeskState, id: string): Instrument | undefined {
  return state.instruments.find((i) => i.id === id);
}

export function assetName(state: DeskState, item: Pick<TaskItem, "kind" | "refId">): string {
  if (item.kind === "plate") {
    const plate = findPlate(state, item.refId);
    return plate ? `编号牌 ${plate.code}` : "编号牌（档案缺失）";
  }
  const instrument = findInstrument(state, item.refId);
  return instrument ? instrument.name : "仪器（档案缺失）";
}

// 查出某件资产当前挂在哪个进行中任务的领出清单里
export function holderTask(
  state: DeskState,
  kind: ItemKind,
  refId: string
): Task | undefined {
  return state.tasks.find(
    (task) =>
      task.status === "open" &&
      task.items.some(
        (item) => item.kind === kind && item.refId === refId && item.state === "issued" && !item.condition
      )
  );
}

export function makeLog(text: string): LogEntry {
  return { id: nextId("log"), time: now(), text };
}

// 初始台账：两组任务正在外业，部分编号牌外借未还，一台仪器校准已过期
export function initialArchive(): DeskState {
  return {
    plates: [
      { id: "pl-01", code: "P-01", status: "available" },
      { id: "pl-02", code: "P-02", status: "checked-out" },
      { id: "pl-03", code: "P-03", status: "available" },
      { id: "pl-04", code: "P-04", status: "disabled" },
      { id: "pl-05", code: "P-05", status: "available" },
      { id: "pl-06", code: "P-06", status: "checked-out" },
      { id: "pl-07", code: "P-07", status: "available" },
      { id: "pl-08", code: "P-08", status: "lost" },
    ],
    instruments: [
      { id: "ins-01", name: "全站仪 TS-06", calibrationDue: "2027-03-31", status: "available" },
      { id: "ins-02", name: "水准仪 DS-32", calibrationDue: "2026-08-15", status: "available" },
      { id: "ins-03", name: "激光测距仪 LD-40", calibrationDue: "2027-01-20", status: "available" },
      { id: "ins-04", name: "经纬仪 J2-2", calibrationDue: "2026-12-01", status: "checked-out" },
      { id: "ins-05", name: "航测无人机 UA-9", calibrationDue: "2027-06-30", status: "available" },
    ],
    tasks: [
      {
        id: "task-xianqing",
        building: "显庆殿",
        borrower: "王振",
        returnBy: "2026-09-28T18:00",
        status: "open",
        items: [
          { id: "ti-xq-1", kind: "plate", refId: "pl-02", state: "issued" },
          { id: "ti-xq-2", kind: "instrument", refId: "ins-04", state: "issued" },
        ],
      },
      {
        id: "task-wenchang",
        building: "文昌阁",
        borrower: "李岚",
        returnBy: "2026-09-26T12:00",
        status: "open",
        items: [{ id: "ti-wc-1", kind: "plate", refId: "pl-06", state: "issued" }],
      },
    ],
    logs: [
      { id: "log-seed-1", time: "2026-09-25 08:10:00", text: "显庆殿（王振）领出 编号牌 P-02、经纬仪 J2-2" },
      { id: "log-seed-2", time: "2026-09-25 08:24:00", text: "文昌阁（李岚）领出 编号牌 P-06" },
      { id: "log-seed-3", time: "2026-09-25 08:30:00", text: "编号牌 P-04 损坏停用，待更换" },
    ],
  };
}
