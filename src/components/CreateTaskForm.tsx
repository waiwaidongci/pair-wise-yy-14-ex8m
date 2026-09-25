// 页面组件：新建领用任务表单。
// 登记建筑、领用人（负责人）、归还时间，再勾选编号牌与仪器。

import { FormEvent, useState } from "react";
import { ASSET_STATUS_LABEL, BUILDINGS, DeskState, today } from "../archive";
import { isCalibrationExpired } from "../rules";

export interface CreatePayload {
  building: string;
  borrower: string;
  returnBy: string;
  plateIds: string[];
  instrumentIds: string[];
}

interface Props {
  state: DeskState;
  onCreate: (payload: CreatePayload) => void;
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export default function CreateTaskForm({ state, onCreate }: Props) {
  const [building, setBuilding] = useState(BUILDINGS[0]);
  const [borrower, setBorrower] = useState("");
  const [returnBy, setReturnBy] = useState("");
  const [plateIds, setPlateIds] = useState<string[]>([]);
  const [instrumentIds, setInstrumentIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const day = today();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!borrower.trim()) {
      setError("请填写领用人（负责人）");
      return;
    }
    if (!returnBy) {
      setError("请登记归还时间");
      return;
    }
    if (plateIds.length + instrumentIds.length === 0) {
      setError("请至少选择一件编号牌或仪器");
      return;
    }
    onCreate({ building, borrower, returnBy, plateIds, instrumentIds });
    setBorrower("");
    setReturnBy("");
    setPlateIds([]);
    setInstrumentIds([]);
    setError("");
  }

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>外业领用</p>
          <h2>新建领用任务</h2>
        </div>
        <button className="primary" onClick={submit}>
          建任务并领取
        </button>
      </div>

      <form onSubmit={submit}>
        <div className="field-grid three">
          <label>
            <span>建筑</span>
            <select value={building} onChange={(e) => setBuilding(e.target.value)}>
              {BUILDINGS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>领用人（负责人）</span>
            <input
              value={borrower}
              placeholder="填写领用人姓名"
              onChange={(e) => setBorrower(e.target.value)}
            />
          </label>
          <label>
            <span>归还时间</span>
            <input
              type="datetime-local"
              value={returnBy}
              onChange={(e) => setReturnBy(e.target.value)}
            />
          </label>
        </div>

        <div className="pick-block">
          <h3>选择编号牌</h3>
          <div className="chips">
            {state.plates.map((plate) => (
              <label
                key={plate.id}
                className={`check-chip ${plateIds.includes(plate.id) ? "on" : ""} status-${plate.status}`}
              >
                <input
                  type="checkbox"
                  checked={plateIds.includes(plate.id)}
                  onChange={() => setPlateIds(toggle(plateIds, plate.id))}
                />
                <b>{plate.code}</b>
                <em>{ASSET_STATUS_LABEL[plate.status]}</em>
              </label>
            ))}
          </div>
        </div>

        <div className="pick-block">
          <h3>选择仪器</h3>
          <div className="chips">
            {state.instruments.map((instrument) => {
              const expired = isCalibrationExpired(instrument, day);
              return (
                <label
                  key={instrument.id}
                  className={`check-chip ${instrumentIds.includes(instrument.id) ? "on" : ""} status-${instrument.status}`}
                >
                  <input
                    type="checkbox"
                    checked={instrumentIds.includes(instrument.id)}
                    onChange={() => setInstrumentIds(toggle(instrumentIds, instrument.id))}
                  />
                  <b>{instrument.name}</b>
                  <em>
                    校准至 {instrument.calibrationDue}
                    {expired ? " · 已过期" : ""} · {ASSET_STATUS_LABEL[instrument.status]}
                  </em>
                </label>
              );
            })}
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}
        <p className="hint">
          提交后按负责人名义办理领取：凭证未归还、仪器校准过期的物品会自动留在待领区。
        </p>
      </form>
    </section>
  );
}
