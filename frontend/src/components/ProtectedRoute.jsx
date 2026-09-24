import { Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

function ProtectedRoute({ children, allowedRoles }) {
  const { auth } = useAuth();

  if (!auth?.access_token) {
    return <Navigate to="/login" replace />;
  }

  if (
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(auth.role)
  ) {
    if (auth.role === "candidate") {
      return <Navigate to="/candidate/dashboard" replace />;
    }

    if (auth.role === "organization_admin") {
      return <Navigate to="/admin" replace />;
    }

    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default ProtectedRoute;