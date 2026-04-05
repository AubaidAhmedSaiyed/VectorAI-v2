import React, { useState } from "react";
import { Link } from "react-router-dom";
import DashboardNavbar from "../../components/DashboardNavbar";

function Intelligence({ toggleTheme }) {
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const handleMarkClearance = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setCompleted(true);
      setToastMsg("Items successfully moved to clearance!");
      setTimeout(() => setToastMsg(""), 3000);
    }, 600);
  };

  return (
    <>
      <DashboardNavbar toggleTheme={toggleTheme} />

      <div className="container">
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3>Demand forecast &amp; shop advice (admin)</h3>
          <p style={{ marginBottom: "12px", color: "var(--text-muted)" }}>
            Plain-language stock and order tips, charts, and optional technical detail — logged in{" "}
            <code>predictionlogs</code>.
          </p>
          <Link className="approve-btn" to="/admin/predict" style={{ display: "inline-block", textDecoration: "none" }}>
            Open forecast &amp; advice
          </Link>
        </div>

        {/* Expiry Risk */}
        <div className="card">
          <h3>Expiry Financial Risk</h3>
          <p>
            ₹ 12,400 worth inventory is expiring within 7 days.
          </p>
        </div>

        {/* Dead Stock */}
        <div className="card">
          <h3>Dead Stock (60+ Days No Sales)</h3>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Stock</th>
                <th>Days Without Sale</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>Cold Drink 2L</td>
                <td>25</td>
                <td className="numeric">72</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: "20px" }}>
            <button
              className={`approve-btn ${loading ? "btn-processing" : ""}`}
              onClick={handleMarkClearance}
              disabled={loading || completed}
            >
              {completed ? "Marked for Sale ✓" : "Mark for Clearance Sale"}
            </button>
          </div>
        </div>

      </div>

      {toastMsg && <div className="toast-notification">{toastMsg}</div>}
    </>
  );
}

export default Intelligence;