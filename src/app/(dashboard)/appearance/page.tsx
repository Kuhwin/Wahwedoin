"use client";

import { useTheme } from "@/components/ui/ThemeProvider";
import { useAccentColour } from "@/components/AccentColourProvider";
import { Sun, Moon, Palette } from "lucide-react";

export default function AppearancePage() {
  const { theme, toggleTheme } = useTheme();
  const { accent, setAccent, presets } = useAccentColour();

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Appearance</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Customise how Wah We Doin looks for you
        </p>
      </div>

      {/* Theme */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          {theme === "dark" ? <Moon size={20} className="text-indigo-500" /> : <Sun size={20} className="text-amber-500" />}
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Theme</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Switch between light and dark mode</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { if (theme === "dark") toggleTheme(); }}
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${
              theme === "light"
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
          >
            <Sun size={24} className="mx-auto mb-2 text-amber-500" />
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Light</p>
          </button>
          <button
            onClick={() => { if (theme === "light") toggleTheme(); }}
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${
              theme === "dark"
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
          >
            <Moon size={24} className="mx-auto mb-2 text-indigo-400" />
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Dark</p>
          </button>
        </div>
      </div>

      {/* Accent Colour */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Palette size={20} style={{ color: accent }} />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Accent Colour</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your personal colour — shows on buttons, nav, and avatars</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {presets.map((c) => (
            <button
              key={c}
              onClick={() => setAccent(c)}
              className={`w-10 h-10 rounded-full border-3 transition-all ${
                accent === c ? "border-slate-900 dark:border-white scale-110 ring-2 ring-offset-2 ring-slate-300 dark:ring-offset-slate-800" : "border-transparent hover:scale-110"
              }`}
              style={{ backgroundColor: c, borderWidth: "3px" }}
            />
          ))}
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
          This colour is personal to you — teammates won&apos;t see it
        </p>
      </div>
    </div>
  );
}
