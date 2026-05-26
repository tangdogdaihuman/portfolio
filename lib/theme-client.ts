"use client";

import { useSyncExternalStore } from "react";

const THEME_KEY = "theme";
const THEME_CHANGE_EVENT = "portfolio-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

type ThemeName = "light" | "dark";

function prefersDarkTheme() {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

function getResolvedTheme(): ThemeName {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function emitThemeChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function applyTheme(theme: ThemeName, persist = true) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  if (persist && typeof window !== "undefined") {
    window.localStorage.setItem(THEME_KEY, theme);
  }
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const media = window.matchMedia(DARK_QUERY);

  const handleThemeChange = () => {
    onStoreChange();
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    const nextTheme =
      event.newValue === "dark" || event.newValue === "light"
        ? event.newValue
        : prefersDarkTheme()
          ? "dark"
          : "light";
    applyTheme(nextTheme, false);
    onStoreChange();
  };

  const handleMediaChange = (event: MediaQueryListEvent) => {
    if (window.localStorage.getItem(THEME_KEY)) return;
    applyTheme(event.matches ? "dark" : "light", false);
    onStoreChange();
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  window.addEventListener("storage", handleStorage);
  media.addEventListener("change", handleMediaChange);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.removeEventListener("storage", handleStorage);
    media.removeEventListener("change", handleMediaChange);
  };
}

export function useResolvedTheme() {
  return useSyncExternalStore(subscribe, getResolvedTheme, () => "light");
}

export function setResolvedTheme(theme: ThemeName) {
  applyTheme(theme);
  emitThemeChange();
}

export function toggleResolvedTheme() {
  setResolvedTheme(getResolvedTheme() === "dark" ? "light" : "dark");
}
