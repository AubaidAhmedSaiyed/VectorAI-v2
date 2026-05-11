import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardNavbar from "../../components/DashboardNavbar";
import { getBatchesList } from "../../Api/Api";
import "../../App.css";

const StaffDashboard = ({ toggleTheme }) => {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [actionStates, setActionStates] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getBatchesList({ expiring: 3, status: "Active", limit: 50 });
      setBatches(res.batches || []);
    } catch (e) {
      setError(e.message || "Could not load expiring batches");
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = (id, msg) => {
    setActionStates((p) => ({ ...p, [id]: "loading" }));
    setTimeout(() => {
      setActionStates((p) => ({ ...p, [id]: "done" }));
      setToastMsg(msg);
      setTimeout(() => setToastMsg(""), 3000);
    }, 400);
  };

  return (
    <>
      <DashboardNavbar toggleTheme={toggleTheme} />
      <div className="container">
        <div className="card">
          <h3>Expiring soon (next 3 days)</h3>
          {loading && <p>Loading batches…</p>}
          {error && <p style={{ color: "var(--danger, #c94c4c)" }}>{error}</p>}
          {!loading && !batches.length && !error && <p>No batches in this window.</p>}
          {!!batches.length && (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Qty</th>
                  <th>Expiry</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const id = b._id;
                  const st = actionStates[id] || "idle";
                  const days = b.expiryDate
                    ? Math.ceil((new Date(b.expiryDate) - new Date()) / (86400000))
                    : "—";
                  return (
                    <tr key={id}>
                      <td>{b.product?.name || "—"}</td>
                      <td>{String(id).slice(-6)}</td>
                      <td className="numeric">{b.currentQty}</td>
                      <td>
                        {typeof days === "number" ? `${days} day(s)` : days}
                        {b.expiryDate ? ` (${new Date(b.expiryDate).toLocaleDateString()})` : ""}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`ghost-btn ${st === "loading" ? "btn-processing" : ""}`}
                          onClick={() =>
                            handleAction(id, "Note: record markdown or move in your POS — batch ID logged.")
                          }
                          disabled={st !== "idle"}
                        >
                          {st === "done" ? "Noted ✓" : "Log action"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <button type="button" className="ghost-btn" style={{ marginTop: 12 }} onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className="card">
          <h3>Physical audit</h3>
          <p className="note">Count shelf stock and submit updates to the system.</p>
          <button type="button" className="approve-btn" onClick={() => navigate("/staff/orders")}>
            Start physical audit
          </button>
        </div>

        <div className="card">
          <h3>End of shift</h3>
          <button type="button" className="approve-btn" onClick={() => navigate("/staff/reports")}>
            Stock CSV export
          </button>
        </div>
      </div>
      {toastMsg && <div className="toast-notification">{toastMsg}</div>}
    </>
  );
};

export default StaffDashboard;
