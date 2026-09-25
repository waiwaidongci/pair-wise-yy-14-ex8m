// 页面组件：领用任务列表。
// 每张任务卡承担：待领取（核对领取人）、收工逐件登记、损坏凭证换新、结束任务。

import { useState } from "react";
import {
  CONDITION_LABEL,
  DeskState,
  ItemCondition,
  Task,
  TaskItem,
  assetName,
} from "../archive";
import { canReplaceWithNewPlate, taskCloseBlockers } from "../rules";

interface Props {
  state: DeskState;
  onPickup: (taskId: string, pickupPerson: string) => void;
  onRemovePending: (taskId: string, itemId: string) => void;
  onRecordCondition: (taskId: string, itemId: string, condition: ItemCondition) => void;
  onReplacePlate: (taskId: string, itemId: string, newPlateId: string) => void;
  onCloseTask: (taskId: string) => void;
}

const CONDITION_ORDER: ItemCondition[] = ["intact", "damaged", "lost"];

function PickupRow({ task, onPickup }: { task: Task; onPickup: Props["onPickup"] }) {
  const [person, setPerson] = useState(task.borrower);
  return (
    <div className="pickup-row">
      <span>待领区领取</span>
      <input
        value={person}
        placeholder="领取人姓名"
        onChange={(e) => setPerson(e.target.value)}
      />
      <button className="primary" onClick={() => onPickup(task.id, person)}>
        办理领取
      </button>
      <small>领取人须与负责人（{task.borrower}）一致，否则物品留在待领区</small>
    </div>
  );
}

function ReplacePlate({
  state,
  task,
  item,
  onReplacePlate,
}: {
  state: DeskState;
  task: Task;
  item: TaskItem;
  onReplacePlate: Props["onReplacePlate"];
}) {
  const candidates = state.plates.filter((p) => p.status === "available");
  const [selected, setSelected] = useState(candidates[0]?.id ?? "");

  if (candidates.length === 0) {
    return <small className="warn-text">旧凭证已停用，但台账中暂无可用新凭证</small>;
  }
  const value = candidates.some((p) => p.id === selected) ? selected : candidates[0].id;
  return (
    <span className="replace-row">
      <small>凭证已停用，换新：</small>
      <select value={value} onChange={(e) => setSelected(e.target.value)}>
        {candidates.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code}
          </option>
        ))}
      </select>
      <button onClick={() => onReplacePlate(task.id, item.id, value)}>改挂新凭证</button>
    </span>
  );
}

function ItemRow({ state, task, item, ...handlers }: { state: DeskState; task: Task; item: TaskItem } & Omit<Props, "state">) {
  const open = task.status === "open";
  return (
    <li className={`item-row state-${item.state}`}>
      <span className={`kind-tag ${item.kind}`}>{item.kind === "plate" ? "牌" : "仪"}</span>
      <div className="item-main">
        <b>{assetName(state, item)}</b>
        {item.state === "pending" && item.holdReason && (
          <small className="warn-text">滞留待领区：{item.holdReason}</small>
        )}
        {item.state === "pending" && !item.holdReason && <small>待领取</small>}
        {item.state === "issued" && !item.condition && <small>已领出，待收工登记</small>}
        {item.condition && (
          <small>
            收工登记：{CONDITION_LABEL[item.condition]}
            {item.condition === "intact" ? "，已回库" : "，资产已停用/注销"}
          </small>
        )}
        {open && canReplaceWithNewPlate(item) && (
          <ReplacePlate state={state} task={task} item={item} onReplacePlate={handlers.onReplacePlate} />
        )}
      </div>
      {open && (
        <div className="item-actions">
          {item.state === "pending" && (
            <button onClick={() => handlers.onRemovePending(task.id, item.id)}>移出</button>
          )}
          {item.state === "issued" && !item.condition && (
            <>
              {CONDITION_ORDER.map((condition) => (
                <button
                  key={condition}
                  className={`cond-btn ${condition}`}
                  onClick={() => handlers.onRecordCondition(task.id, item.id, condition)}
                >
                  {CONDITION_LABEL[condition]}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function TaskCard({ state, task, ...handlers }: { state: DeskState; task: Task } & Omit<Props, "state">) {
  const blockers = taskCloseBlockers(task);
  const open = task.status === "open";
  const pendingCount = task.items.filter((i) => i.state === "pending").length;

  return (
    <article className={`panel task-card ${open ? "" : "closed"}`}>
      <div className="heading">
        <div>
          <p>{open ? "进行中" : "已结束"}</p>
          <h2>
            {task.building}
            <span className="task-meta">
              负责人 {task.borrower} · 归还 {task.returnBy.replace("T", " ")} · 共 {task.items.length} 件
            </span>
          </h2>
        </div>
        {open && (
          <div className="close-box">
            <button
              className="primary"
              disabled={blockers.length > 0}
              onClick={() => handlers.onCloseTask(task.id)}
            >
              结束任务
            </button>
            {blockers.map((b) => (
              <small key={b} className="warn-text">
                {b}
              </small>
            ))}
          </div>
        )}
      </div>

      {open && pendingCount > 0 && <PickupRow task={task} onPickup={handlers.onPickup} />}

      <ul className="item-list">
        {task.items.map((item) => (
          <ItemRow key={item.id} state={state} task={task} item={item} {...handlers} />
        ))}
        {task.items.length === 0 && <li className="item-row empty">任务物品已全部移出</li>}
      </ul>
    </article>
  );
}

export default function TaskList(props: Props) {
  const open = props.state.tasks.filter((t) => t.status === "open");
  const closed = props.state.tasks.filter((t) => t.status === "closed");
  return (
    <section className="task-list">
      {[...open, ...closed].map((task) => (
        <TaskCard key={task.id} {...props} task={task} />
      ))}
    </section>
  );
}
