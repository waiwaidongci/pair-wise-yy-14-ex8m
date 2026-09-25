// 页面层：领用台。只负责渲染与交互，规则判定走 domain/rules，数据变迁走 data/archive。

import { useState } from "react";
import {
  checkCompletion,
  evaluateTask,
  isCalibrationExpired,
} from "../domain/rules";
import type {
  ArchiveState,
  ItemCondition,
  ItemKind,
  SurveyTask,
  TaskItem,
} from "../domain/types";
import {
  CONDITION_LABEL,
  EQUIPMENT_STATUS_LABEL,
  availablePlates,
  equipmentLabel,
  holderLabel,
  issuableInstruments,
  useArchive,
} from "../data/archive";
import type { TaskDraft } from "../data/archive";

const BUILDING_SUGGESTIONS = [
  "太和殿前檐",
  "慈宁宫东配殿",
  "钟鼓楼",
  "碑亭",
  "文华殿耳房",
];

const CONDITIONS: ItemCondition[] = ["intact", "damaged", "lost"];

export default function CheckoutDesk() {
  const archive = useArchive();
  const { state, today, now } = archive;
  const [notice, setNotice] = useState("");

  const pending = state.tasks.filter((t) => t.status === "pending");
  const active = state.tasks.filter((t) => t.status === "active");
  const done = state.tasks.filter((t) => t.status === "done");
  const expiredCount = state.instruments.filter((i) =>
    isCalibrationExpired(i, today),
  ).length;

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62013 · 源提示词8 · Port 62013</p>
        <h1>木结构榫卯构件测绘 · 外业领用台</h1>
        <span>
          测绘队外业在此登记领用：建任务时登记建筑、领用人与归还时间，再挑选编号牌与仪器。
          凭证未归还、仪器校准过期或领取人与负责人不一致的任务留在待领区；收工逐件登记完好、
          损坏或遗失，缺件任务不能结束；损坏凭证停用后，可为任务改挂新凭证。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>待领任务</small>
          <strong>{pending.length}</strong>
        </article>
        <article>
          <small>外业中</small>
          <strong>{active.length}</strong>
        </article>
        <article>
          <small>在库编号牌</small>
          <strong>
            {availablePlates(state).length}/{state.plates.length}
          </strong>
        </article>
        <article>
          <small>校准过期仪器</small>
          <strong>{expiredCount}</strong>
        </article>
      </section>

      {notice && (
        <div className="notice">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>知道了</button>
        </div>
      )}

      <section className="workspace">
        <TaskForm
          state={state}
          today={today}
          onCreate={(draft) => {
            const issued = archive.createTask(draft);
            setNotice(
              issued
                ? `「${draft.building}」规则通过，装备已发放，任务进入外业中。`
                : `「${draft.building}」已登记，因规则拦截留在待领区，处理阻塞后再发放。`,
            );
          }}
        />

        <section className="panel">
          <div className="heading">
            <div>
              <p>规则拦截区</p>
              <h2>待领区（{pending.length}）</h2>
            </div>
          </div>
          {pending.length === 0 && (
            <p className="empty">暂无待领任务，规则通过的新任务会直接发放。</p>
          )}
          <div className="task-list">
            {pending.map((task) => (
              <PendingCard
                key={task.id}
                task={task}
                state={state}
                today={today}
                onIssue={() => {
                  archive.issueTask(task.id);
                  setNotice(`「${task.building}」校验通过，装备已发放。`);
                }}
                onReplace={(kind, oldRefId, newRefId) => {
                  archive.replaceItem(task.id, kind, oldRefId, newRefId);
                  setNotice(
                    `「${task.building}」已改挂新${kind === "plate" ? "凭证" : "仪器"}。`,
                  );
                }}
                onFixCollector={() => {
                  archive.assignCollector(task.id, task.leader);
                  setNotice(`「${task.building}」已改由负责人领取。`);
                }}
                onCancel={() => {
                  archive.cancelTask(task.id);
                  setNotice(`「${task.building}」已撤销。`);
                }}
              />
            ))}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>收工登记</p>
            <h2>外业中（{active.length}）</h2>
          </div>
        </div>
        {active.length === 0 && <p className="empty">暂无外业任务。</p>}
        <div className="task-list">
          {active.map((task) => (
            <ActiveCard
              key={task.id}
              task={task}
              state={state}
              now={now}
              onRecord={(item, condition) =>
                archive.recordCondition(task.id, item.kind, item.refId, condition)
              }
              onFinish={() => {
                archive.finishTask(task.id);
                setNotice(`「${task.building}」已收工，装备逐件落账。`);
              }}
            />
          ))}
        </div>
      </section>

      <ArchiveBoard state={state} today={today} />

      <section className="panel">
        <div className="heading">
          <div>
            <p>档案</p>
            <h2>已结束任务（{done.length}）</h2>
          </div>
        </div>
        {done.length === 0 && <p className="empty">还没有收工的任务。</p>}
        <div className="task-list">
          {done.map((task) => (
            <article className="task-card done" key={task.id}>
              <header>
                <div>
                  <h3>{task.building}</h3>
                  <p>
                    负责人 {task.leader} · 收工{" "}
                    {task.finishedAt?.replace("T", " ") ?? "—"}
                  </p>
                </div>
                <span className="badge done">已结束</span>
              </header>
              <ul className="item-list">
                {task.items.map((item) => (
                  <li className="item-row" key={item.refId}>
                    <span>
                      {item.kind === "plate" ? "编号牌" : "仪器"} ·{" "}
                      {equipmentLabel(state, item)}
                    </span>
                    <span className={`cond-label ${item.condition ?? ""}`}>
                      {item.condition ? CONDITION_LABEL[item.condition] : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

// —— 建任务表单 ——

function TaskForm({
  state,
  today,
  onCreate,
}: {
  state: ArchiveState;
  today: string;
  onCreate: (draft: TaskDraft) => void;
}) {
  const [building, setBuilding] = useState("");
  const [leader, setLeader] = useState("");
  const [collector, setCollector] = useState("");
  const [dueBack, setDueBack] = useState(`${today}T18:00`);
  const [plateIds, setPlateIds] = useState<string[]>([]);
  const [instrumentIds, setInstrumentIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const toggle = (
    list: string[],
    id: string,
    set: (next: string[]) => void,
  ) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = () => {
    if (!building.trim() || !leader.trim() || !dueBack) {
      setError("请填写建筑名称、负责人与归还时间。");
      return;
    }
    if (plateIds.length === 0 || instrumentIds.length === 0) {
      setError("请至少选择一块编号牌和一台仪器。");
      return;
    }
    onCreate({ building, leader, collector, dueBack, plateIds, instrumentIds });
    setBuilding("");
    setLeader("");
    setCollector("");
    setDueBack(`${today}T18:00`);
    setPlateIds([]);
    setInstrumentIds([]);
    setError("");
  };

  return (
    <aside className="panel form-panel">
      <div className="heading">
        <div>
          <p>建任务</p>
          <h2>登记领用</h2>
        </div>
        <button className="primary" onClick={submit}>
          提交任务
        </button>
      </div>

      <div className="field-grid">
        <label>
          <span>建筑名称</span>
          <input
            list="building-list"
            placeholder="如：太和殿前檐"
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
          />
          <datalist id="building-list">
            {BUILDING_SUGGESTIONS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label>
          <span>负责人</span>
          <input
            placeholder="任务负责人"
            value={leader}
            onChange={(e) => setLeader(e.target.value)}
          />
        </label>
        <label>
          <span>领用人（留空则同负责人）</span>
          <input
            placeholder="现场领取人"
            value={collector}
            onChange={(e) => setCollector(e.target.value)}
          />
        </label>
        <label>
          <span>归还时间</span>
          <input
            type="datetime-local"
            value={dueBack}
            onChange={(e) => setDueBack(e.target.value)}
          />
        </label>
      </div>

      <h3>选择编号牌</h3>
      <div className="chips">
        {state.plates.map((plate) => (
          <button
            key={plate.id}
            className={[
              plateIds.includes(plate.id) ? "selected" : "",
              plate.status === "checked-out" ? "warn" : "",
            ].join(" ")}
            disabled={plate.status === "disabled"}
            title={plate.note ?? EQUIPMENT_STATUS_LABEL[plate.status]}
            onClick={() => toggle(plateIds, plate.id, setPlateIds)}
          >
            {plate.code} · {EQUIPMENT_STATUS_LABEL[plate.status]}
          </button>
        ))}
      </div>

      <h3>选择仪器</h3>
      <div className="chips">
        {state.instruments.map((instrument) => {
          const expired = isCalibrationExpired(instrument, today);
          return (
            <button
              key={instrument.id}
              className={[
                instrumentIds.includes(instrument.id) ? "selected" : "",
                expired || instrument.status === "checked-out" ? "warn" : "",
              ].join(" ")}
              disabled={instrument.status === "disabled"}
              title={
                instrument.note ??
                (expired ? `校准已于 ${instrument.calibrationDue} 过期` : "")
              }
              onClick={() =>
                toggle(instrumentIds, instrument.id, setInstrumentIds)
              }
            >
              {instrument.name} {instrument.code} ·{" "}
              {expired
                ? "校准过期"
                : instrument.status === "checked-out"
                  ? "借出"
                  : `校准至${instrument.calibrationDue}`}
            </button>
          );
        })}
      </div>
      <p className="hint">
        借出中或校准过期的装备仍可点选，但任务会被规则留在待领区。
      </p>
      {error && <p className="error">{error}</p>}
    </aside>
  );
}

// —— 待领区任务卡 ——

function PendingCard({
  task,
  state,
  today,
  onIssue,
  onReplace,
  onFixCollector,
  onCancel,
}: {
  task: SurveyTask;
  state: ArchiveState;
  today: string;
  onIssue: () => void;
  onReplace: (kind: ItemKind, oldRefId: string, newRefId: string) => void;
  onFixCollector: () => void;
  onCancel: () => void;
}) {
  const blockers = evaluateTask(state, task, today);
  const personMismatch = task.collector.trim() !== task.leader.trim();
  const itemBlockers = (item: TaskItem) =>
    blockers.filter(
      (b) => b.item && b.item.kind === item.kind && b.item.refId === item.refId,
    );
  const generalBlockers = blockers.filter((b) => !b.item);

  return (
    <article className="task-card pending">
      <header>
        <div>
          <h3>{task.building}</h3>
          <p>
            负责人 {task.leader} · 领用人 {task.collector} · 约定归还{" "}
            {task.dueBack.replace("T", " ")}
          </p>
        </div>
        <span className="badge pending">待领</span>
      </header>

      <ul className="item-list">
        {task.items.map((item) => {
          const issues = itemBlockers(item);
          return (
            <li
              key={item.refId}
              className={issues.length > 0 ? "item-row blocked" : "item-row"}
            >
              <span>
                {item.kind === "plate" ? "编号牌" : "仪器"} ·{" "}
                {equipmentLabel(state, item)}
              </span>
              {issues.length > 0 ? (
                <span className="item-fix">
                  <em>{issues.map((i) => i.reason).join("；")}</em>
                  <ReplaceSelect
                    state={state}
                    today={today}
                    kind={item.kind}
                    onPick={(newRefId) =>
                      onReplace(item.kind, item.refId, newRefId)
                    }
                  />
                </span>
              ) : (
                <span className="ok">✓ 可领</span>
              )}
            </li>
          );
        })}
      </ul>

      {generalBlockers.map((b) => (
        <p className="blocker" key={b.reason}>
          <span>{b.reason}</span>
          {personMismatch && (
            <button onClick={onFixCollector}>改由负责人领取</button>
          )}
        </p>
      ))}

      <footer>
        <span className="hint">
          {blockers.length > 0
            ? `${blockers.length} 项规则未通过，处理后可发放`
            : "规则已通过，可发放"}
        </span>
        <div>
          <button onClick={onCancel}>撤销</button>
          <button
            className="primary"
            disabled={blockers.length > 0}
            onClick={onIssue}
          >
            校验并发放
          </button>
        </div>
      </footer>
    </article>
  );
}

function ReplaceSelect({
  state,
  today,
  kind,
  onPick,
}: {
  state: ArchiveState;
  today: string;
  kind: ItemKind;
  onPick: (refId: string) => void;
}) {
  const options =
    kind === "plate"
      ? availablePlates(state).map((p) => ({ id: p.id, label: p.code }))
      : issuableInstruments(state, today).map((i) => ({
          id: i.id,
          label: `${i.name} ${i.code}`,
        }));
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
    >
      <option value="">
        改挂{kind === "plate" ? "新凭证" : "新仪器"}…
      </option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// —— 外业中任务卡（收工登记） ——

function ActiveCard({
  task,
  state,
  now,
  onRecord,
  onFinish,
}: {
  task: SurveyTask;
  state: ArchiveState;
  now: string;
  onRecord: (item: TaskItem, condition: ItemCondition) => void;
  onFinish: () => void;
}) {
  const completion = checkCompletion(task);
  const overdue = task.dueBack < now;

  return (
    <article className="task-card active">
      <header>
        <div>
          <h3>{task.building}</h3>
          <p>
            负责人 {task.leader} · 领用人 {task.collector} · 应归还{" "}
            {task.dueBack.replace("T", " ")}
          </p>
        </div>
        <span className="badge active">
          外业中{overdue ? " · 已超期" : ""}
        </span>
      </header>

      <ul className="item-list">
        {task.items.map((item) => (
          <li className="item-row" key={item.refId}>
            <span>
              {item.kind === "plate" ? "编号牌" : "仪器"} ·{" "}
              {equipmentLabel(state, item)}
            </span>
            <span className="cond-group">
              {CONDITIONS.map((condition) => (
                <button
                  key={condition}
                  className={
                    item.condition === condition
                      ? `cond ${condition} on`
                      : `cond ${condition}`
                  }
                  onClick={() => onRecord(item, condition)}
                >
                  {CONDITION_LABEL[condition]}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>

      <footer>
        <span className="hint">
          {completion.canFinish
            ? "全部归还登记完成，可结束任务"
            : completion.unrecorded.length > 0
              ? `还有 ${completion.unrecorded.length} 件未登记归还状态`
              : `遗失 ${completion.lost.length} 件，缺件任务不能结束`}
        </span>
        <button
          className="primary"
          disabled={!completion.canFinish}
          onClick={onFinish}
        >
          结束任务
        </button>
      </footer>
    </article>
  );
}

// —— 装备档案台账 ——

function ArchiveBoard({
  state,
  today,
}: {
  state: ArchiveState;
  today: string;
}) {
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>装备档案</p>
          <h2>编号牌与仪器台账</h2>
        </div>
      </div>
      <div className="ledger-grid">
        <div>
          <h3>编号牌（凭证）</h3>
          <table className="ledger">
            <thead>
              <tr>
                <th>牌号</th>
                <th>状态</th>
                <th>去向 / 备注</th>
              </tr>
            </thead>
            <tbody>
              {state.plates.map((plate) => (
                <tr key={plate.id}>
                  <td>{plate.code}</td>
                  <td>
                    <span className={`badge ${plate.status}`}>
                      {EQUIPMENT_STATUS_LABEL[plate.status]}
                    </span>
                  </td>
                  <td>
                    {plate.status === "checked-out"
                      ? (holderLabel(state, "plate", plate.id) ?? "—")
                      : (plate.note ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>测量仪器</h3>
          <table className="ledger">
            <thead>
              <tr>
                <th>仪器</th>
                <th>校准有效期</th>
                <th>状态</th>
                <th>去向 / 备注</th>
              </tr>
            </thead>
            <tbody>
              {state.instruments.map((instrument) => {
                const expired = isCalibrationExpired(instrument, today);
                return (
                  <tr key={instrument.id}>
                    <td>
                      {instrument.name} {instrument.code}
                    </td>
                    <td className={expired ? "expired" : ""}>
                      {instrument.calibrationDue}
                      {expired ? "（已过期）" : ""}
                    </td>
                    <td>
                      <span className={`badge ${instrument.status}`}>
                        {EQUIPMENT_STATUS_LABEL[instrument.status]}
                      </span>
                    </td>
                    <td>
                      {instrument.status === "checked-out"
                        ? (holderLabel(state, "instrument", instrument.id) ??
                          "—")
                        : (instrument.note ?? "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
