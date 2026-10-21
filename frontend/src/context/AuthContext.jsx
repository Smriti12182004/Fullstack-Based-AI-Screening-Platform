
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

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

  // Synchronize authentication changes between browser tabs.
  // Logging out in one tab must not leave another tab using
  // the previous account.
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === "auth" || event.key === null) {
        setAuth(getStoredAuth());
      }
    };

    window.addEventListener(
      "storage",
      handleStorageChange
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorageChange
      );
    };
  }, []);

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

    localStorage.setItem(
      "auth",
      JSON.stringify(normalizedAuth)
    );

    setAuth(normalizedAuth);
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

    localStorage.setItem(
      "auth",
      JSON.stringify(nextAuth)
    );

    setAuth(nextAuth);

    return nextAuth;
  };

  const logout = () => {
    // Clear persistent authentication and the current React state.
    localStorage.removeItem("auth");
    setAuth(null);
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
