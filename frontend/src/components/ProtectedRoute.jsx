
import { Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

function getRoleHomeRoute(role) {
  switch (role) {
    case "candidate":
      return "/candidate/dashboard";

    case "recruiter":
      return "/dashboard";

    case "assessment_manager":
      return "/manager/dashboard";

    case "assessment_reviewer":
      return "/reviewer/dashboard";

    case "organization_admin":
    case "admin":
      return "/admin";

    default:
      // Do not send an unknown role to a dashboard
      // that may redirect back here indefinitely.
      return "/";
  }
}

function ProtectedRoute({ children, allowedRoles }) {
  const { auth } = useAuth();

  if (!auth?.access_token) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  const roleIsAllowed =
    !Array.isArray(allowedRoles) ||
    allowedRoles.length === 0 ||
    allowedRoles.includes(auth.role) ||
    (
      auth.role === "admin" &&
      allowedRoles.includes("organization_admin")
    );

  if (!roleIsAllowed) {
    return (
      <Navigate
        to={getRoleHomeRoute(auth.role)}
        replace
      />
    );
  }

  return children;
}

export default ProtectedRoute;
