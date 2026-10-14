import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

const ThemeContext = createContext(null);
const VALID_THEMES = new Set(["light", "dark", "system"]);

function getInitialTheme() {
  try {
    const stored = localStorage.getItem("evalyn-theme");
    return VALID_THEMES.has(stored) ? stored : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolvedTheme =
        theme === "system"
          ? (media.matches ? "dark" : "light")
          : theme;

      root.dataset.theme = resolvedTheme;
      root.dataset.themePreference = theme;
      root.style.colorScheme = resolvedTheme;
    };

    applyTheme();
    media.addEventListener?.("change", applyTheme);

    try {
      localStorage.setItem("evalyn-theme", theme);
    } catch {
      // The theme still works for this session if storage is unavailable.
    }

    return () => {
      media.removeEventListener?.("change", applyTheme);
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }

  return context;
}
