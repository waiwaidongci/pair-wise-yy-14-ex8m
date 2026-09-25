// 领用台领域模型：编号牌（凭证）、测量仪器、测绘领用任务

export type EquipmentStatus = "available" | "checked-out" | "disabled";

export interface Plate {
  id: string;
  code: string; // 牌号，如 测字·01
  status: EquipmentStatus;
  note?: string; // 停用原因等备注
}

export interface Instrument {
  id: string;
  name: string; // 仪器名称
  code: string; // 设备编号
  calibrationDue: string; // 校准有效期至 YYYY-MM-DD
  status: EquipmentStatus;
  note?: string;
}

export type ItemKind = "plate" | "instrument";

// 收工时逐件登记的归还状态
export type ItemCondition = "intact" | "damaged" | "lost";

export interface TaskItem {
  kind: ItemKind;
  refId: string; // 编号牌或仪器 id
  condition: ItemCondition | null; // null = 收工尚未登记
}

export type TaskStatus = "pending" | "active" | "done";

export interface SurveyTask {
  id: string;
  building: string; // 建筑
  leader: string; // 负责人
  collector: string; // 领用人（登记的领取人）
  dueBack: string; // 约定归还时间
  createdAt: string;
  issuedAt: string | null;
  finishedAt: string | null;
  status: TaskStatus;
  items: TaskItem[];
}

export interface ArchiveState {
  plates: Plate[];
  instruments: Instrument[];
  tasks: SurveyTask[];
}
