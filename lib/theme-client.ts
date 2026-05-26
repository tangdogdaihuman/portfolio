"use client";

import { useSyncExternalStore } from "react";

const THEME_KEY = "theme";
const THEME_CHANGE_EVENT = "portfolio-theme-change";

type ThemeName = "light" | "dark";

function getResolvedTheme(): ThemeName {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function emitThemeChange() {
  if (typeof window === "undefined") return;
  if (typeof Event === "function") {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    return;
  }
  const event = document.createEvent("Event");
  event.initEvent(THEME_CHANGE_EVENT, false, false);
  window.dispatchEvent(event);
}

function applyTheme(theme: ThemeName, persist = true) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("light");
  document.documentElement.classList.remove("dark");
  document.documentElement.classList.add(theme);
  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Embedded browsers can block storage; the class change should still win.
    }
  }
}

export function subscribeResolvedTheme(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleThemeChange = () => {
    onStoreChange();
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    const nextTheme = event.newValue === "light" ? "light" : "dark";
    applyTheme(nextTheme, false);
    onStoreChange();
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useResolvedTheme() {
  return useSyncExternalStore(subscribeResolvedTheme, getResolvedTheme, () => "dark");
}

export function setResolvedTheme(theme: ThemeName) {
  applyTheme(theme);
  emitThemeChange();
}

export function toggleResolvedTheme() {
  setResolvedTheme(getResolvedTheme() === "dark" ? "light" : "dark");
}
