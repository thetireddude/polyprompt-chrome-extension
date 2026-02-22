"use client";

import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "polysync-theme";

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const resolvedTheme = savedTheme === "light" ? "light" : "dark";
    setTheme(resolvedTheme);
    applyTheme(resolvedTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      type="button"
      className={`theme-toggle${theme === "light" ? " is-light" : ""}`}
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">{theme === "dark" ? "🌙" : "☀️"}</span>
      </span>
      <span className="theme-toggle-label">{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
