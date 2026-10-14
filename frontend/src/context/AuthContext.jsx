import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

function getStoredAuth() {
  try {
    const savedAuth = localStorage.getItem("auth");

    if (!savedAuth) {
      return null;
    }

    const parsedAuth = JSON.parse(savedAuth);

    if (!parsedAuth || typeof parsedAuth !== "object") {
      localStorage.removeItem("auth");
      return null;
    }

    return parsedAuth;
  } catch (error) {
    console.error(
      "Failed to restore authentication:",
      error
    );

    localStorage.removeItem("auth");
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(getStoredAuth);

  const login = (data) => {
    if (!data) {
      return;
    }

    const normalizedAuth = {
      access_token: data.access_token,
      token_type: data.token_type || "bearer",
      user_id: data.user_id,
      username: data.username || "",
      full_name: data.full_name || "",
      email: data.email || "",
      role: data.role,
    };

    setAuth(normalizedAuth);

    localStorage.setItem(
      "auth",
      JSON.stringify(normalizedAuth)
    );
  };

  const updateProfile = (profileData) => {
    if (!auth) {
      return;
    }

    const nextAuth = {
      ...auth,
      username: profileData.username ?? auth.username,
      full_name: profileData.full_name ?? auth.full_name,
      email: profileData.email ?? auth.email,
    };

    setAuth(nextAuth);
    localStorage.setItem("auth", JSON.stringify(nextAuth));
    return nextAuth;
  };

  const logout = () => {
    setAuth(null);
    localStorage.removeItem("auth");
  };

  return (
    <AuthContext.Provider
      value={{
        auth,
        login,
        logout,
        updateProfile,
        isAuthenticated: Boolean(auth?.access_token),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside an AuthProvider"
    );
  }

  return context;
}