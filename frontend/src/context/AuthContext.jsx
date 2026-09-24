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
      role: data.role,
    };

    setAuth(normalizedAuth);

    localStorage.setItem(
      "auth",
      JSON.stringify(normalizedAuth)
    );
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