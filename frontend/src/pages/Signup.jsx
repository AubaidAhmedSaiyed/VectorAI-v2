import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../App.css";
import Navbar from "../components/Navbar";

// ✅ API IMPORT
import { registerUser } from "../Api/Api";

const Signup = ({ toggleTheme }) => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin"); // Default to admin for demo
  const [loading, setLoading] = useState(false);
  
  const [toastMsg, setToastMsg] = useState("");
  const [isError, setIsError] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();

      // ✅ API CALL
      await registerUser(cleanEmail, cleanPassword, role);

      // Successfully registered
      setIsError(false);
      setToastMsg("Account Created! Redirecting...");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setIsError(true);
      setToastMsg("Signup failed. Please try again.");
      setTimeout(() => setToastMsg(""), 3000);
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar variant="minimal" toggleTheme={toggleTheme} />

      <div className="login-container">
        <div className="login-card glass">
          <h2>Create Account</h2>

          <form onSubmit={handleSignup}>
            <input
              name="name"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <input
              name="email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              name="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="role-select">
              <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button type="submit" className={`login-btn ${loading ? "btn-processing" : ""}`} disabled={loading}>
              {loading ? "Creating..." : "Sign Up"}
            </button>
          </form>

          <p className="note" style={{ marginTop: "16px" }}>
            Already have an account? <Link to="/login">Login here</Link>
          </p>
        </div>
      </div>
      {toastMsg && <div className={`toast-notification ${isError ? 'error' : ''}`}>{toastMsg}</div>}
    </>
  );
};

export default Signup;
