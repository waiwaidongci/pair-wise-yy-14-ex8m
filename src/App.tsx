// 页面层：领用台布局与状态接线。
// 业务约束见 rules.ts，台账数据见 archive.ts，状态流转见 desk.ts。

import { useMemo, useReducer } from "react";
import "./styles.css";
import { initialArchive } from "./archive";
import { deskReducer } from "./desk";
import ArchivePanel from "./components/ArchivePanel";
import CreateTaskForm from "./components/CreateTaskForm";
import PendingZone from "./components/PendingZone";
import TaskList from "./components/TaskList";

const project = {
  id: "hxyfront-62013",
  sourceNo: 8,
  port: 62013,
  title: "木结构榫卯构件测绘 · 外业领用台",
};

function App() {
  const [state, dispatch] = useReducer(deskReducer, undefined, initialArchive);

  const metrics = useMemo(() => {
    const openTasks = state.tasks.filter((t) => t.status === "open");
    const pendingItems = openTasks.reduce(
      (sum, t) => sum + t.items.filter((i) => i.state === "pending").length,
      0
    );
    const outAssets =
      state.plates.filter((p) => p.status === "checked-out").length +
      state.instruments.filter((i) => i.status === "checked-out").length;
    const retiredAssets =
      state.plates.filter((p) => p.status === "disabled" || p.status === "lost").length +
      state.instruments.filter((i) => i.status === "disabled" || i.status === "lost").length;
    return [
      { label: "进行中任务", value: openTasks.length },
      { label: "待领区物品", value: pendingItems },
      { label: "外借未还", value: outAssets },
      { label: "停用 / 遗失", value: retiredAssets },
    ];
  }, [state]);

  return (
    <main className="app">
      <section className="hero">
        <p>
          {project.id} · 源提示词{project.sourceNo} · Port {project.port}
        </p>
        <h1>{project.title}</h1>
        <span>
          建任务时登记建筑、领用人和归还时间，再选编号牌与仪器；凭证未归还、仪器校准过期或领取人与负责人不一致的物品留在待领区。收工逐件登记完好、损坏或遗失，缺件任务不能结束；损坏凭证停用后可换新，任务自动改挂新凭证。
        </span>
      </section>

      <section className="metrics">
        {metrics.map((metric) => (
          <article key={metric.label}>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <CreateTaskForm
          state={state}
          onCreate={(payload) => dispatch({ type: "create-task", ...payload })}
        />
        <PendingZone state={state} />
      </section>

      <TaskList
        state={state}
        onPickup={(taskId, pickupPerson) => dispatch({ type: "pickup", taskId, pickupPerson })}
        onRemovePending={(taskId, itemId) => dispatch({ type: "remove-pending", taskId, itemId })}
        onRecordCondition={(taskId, itemId, condition) =>
          dispatch({ type: "record-condition", taskId, itemId, condition })
        }
        onReplacePlate={(taskId, itemId, newPlateId) =>
          dispatch({ type: "replace-plate", taskId, itemId, newPlateId })
        }
        onCloseTask={(taskId) => dispatch({ type: "close-task", taskId })}
      />

      <ArchivePanel state={state} />
    </main>
  );
}

export default App;
