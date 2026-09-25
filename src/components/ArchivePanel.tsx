// 页面组件：台账档案。
// 编号牌台账、仪器台账（含校准有效期）与领用/收工流水。

import { ASSET_STATUS_LABEL, DeskState, holderTask, today } from "../archive";
import { isCalibrationExpired } from "../rules";

export default function ArchivePanel({ state }: { state: DeskState }) {
  const day = today();

  function holderText(kind: "plate" | "instrument", refId: string): string {
    const task = holderTask(state, kind, refId);
    return task ? `${task.building} · ${task.borrower}` : "—";
  }

  return (
    <section className="archive">
      <div className="archive-grid">
        <div className="panel">
          <div className="heading">
            <div>
              <p>档案</p>
              <h2>编号牌台账</h2>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>号码</th>
                <th>状态</th>
                <th>所在任务</th>
              </tr>
            </thead>
            <tbody>
              {state.plates.map((plate) => (
                <tr key={plate.id}>
                  <td>{plate.code}</td>
                  <td>
                    <span className={`badge asset-${plate.status}`}>
                      {ASSET_STATUS_LABEL[plate.status]}
                    </span>
                  </td>
                  <td>{holderText("plate", plate.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="heading">
            <div>
              <p>档案</p>
              <h2>仪器台账</h2>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>仪器</th>
                <th>校准有效期</th>
                <th>状态</th>
                <th>所在任务</th>
              </tr>
            </thead>
            <tbody>
              {state.instruments.map((instrument) => {
                const expired = isCalibrationExpired(instrument, day);
                return (
                  <tr key={instrument.id} className={expired ? "expired-row" : ""}>
                    <td>{instrument.name}</td>
                    <td>
                      {instrument.calibrationDue}
                      {expired && <span className="badge asset-disabled">已过期</span>}
                    </td>
                    <td>
                      <span className={`badge asset-${instrument.status}`}>
                        {ASSET_STATUS_LABEL[instrument.status]}
                      </span>
                    </td>
                    <td>{holderText("instrument", instrument.id)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="heading">
          <div>
            <p>档案</p>
            <h2>领用 / 收工流水</h2>
          </div>
        </div>
        <ul className="log-list">
          {state.logs.map((log) => (
            <li key={log.id}>
              <time>{log.time}</time>
              <span>{log.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
