import React, { useState } from "react";
import "../../App.css";

const StaffReports = () => {
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const handleGenerateReport = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setCompleted(true);
      setToastMsg("Shift report generated safely.");
      setTimeout(() => setToastMsg(""), 3000);
    }, 600);
  };

  return (
    <div className="container">
      <div className="card">
        <h3>End of Shift Receipt</h3>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>System</th>
              <th>Counted</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Milk 500ml</td>
              <td>15</td>
              <td>12</td>
              <td className="numeric">-3</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: "20px" }}>
          <button 
            className={`approve-btn ${loading ? "btn-processing" : ""}`}
            onClick={handleGenerateReport}
            disabled={loading || completed}
          >
            {completed ? "Receipt Generated ✓" : "Generate Report"}
          </button>
        </div>
      </div>
      {toastMsg && <div className="toast-notification">{toastMsg}</div>}
    </div>
  );
};

export default StaffReports;