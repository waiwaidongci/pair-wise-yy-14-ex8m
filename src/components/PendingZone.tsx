// 页面组件：待领区汇总。
// 汇总所有进行中任务里被规则拦下的物品及滞留原因。

import { DeskState, assetName } from "../archive";

export default function PendingZone({ state }: { state: DeskState }) {
  const held = state.tasks
    .filter((task) => task.status === "open")
    .flatMap((task) =>
      task.items
        .filter((item) => item.state === "pending")
        .map((item) => ({ task, item }))
    );

  return (
    <aside className="panel pending-zone">
      <div className="heading">
        <div>
          <p>规则拦截</p>
          <h2>待领区</h2>
        </div>
        <strong className="zone-count">{held.length}</strong>
      </div>
      {held.length === 0 ? (
        <p className="ok-text">待领区已清空，无滞留物品。</p>
      ) : (
        <ul className="zone-list">
          {held.map(({ task, item }) => (
            <li key={item.id}>
              <b>{assetName(state, item)}</b>
              <span>
                {task.building} · {task.borrower}
              </span>
              <small className="warn-text">{item.holdReason ?? "待领取"}</small>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">凭证未归还、仪器校准过期、领取人与负责人不一致的物品会留在这里。</p>
    </aside>
  );
}
