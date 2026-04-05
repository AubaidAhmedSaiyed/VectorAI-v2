import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

/**
 * Restricts /admin/* to users with role=admin in localStorage (demo auth).
 * Staff is sent to their dashboard; unauthenticated users to login.
 */
function RequireAdmin() {
  const location = useLocation();
  const role = localStorage.getItem("role");

  if (role !== "admin") {
    if (role === "staff") {
      return <Navigate to="/staff/dashboard" replace state={{ from: location }} />;
    }
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default RequireAdmin;
