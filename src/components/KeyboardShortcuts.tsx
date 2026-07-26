"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const shortcuts = [
  { keys: ["Ctrl", "K"], keysAlt: ["⌘", "K"], description: "Global search" },
  { keys: ["N"], keysAlt: null, description: "New task (on project pages)" },
  { keys: ["1", "–", "4"], keysAlt: null, description: "Set priority (when task is open)" },
  { keys: ["?"], keysAlt: null, description: "Show this guide" },
  { keys: ["Esc"], keysAlt: null, description: "Close modal / deselect" },
];

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    }
    if (e.key === "Escape" && open) {
      setOpen(false);
    }
  }, [open]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Keyboard shortcuts
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.description}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {shortcut.description}
                  </span>
                  <div className="flex items-center gap-1">
                    {shortcut.keysAlt && (
                      <div className="flex items-center gap-0.5 mr-1.5">
                        {shortcut.keysAlt.map((key, i) => (
                          <kbd
                            key={cn("alt", i)}
                            className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 text-[11px] font-mono font-medium bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    )}
                    {shortcut.keysAlt && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mr-1.5">/</span>
                    )}
                    <div className="flex items-center gap-0.5">
                      {shortcut.keys.map((key, i) => (
                        <kbd
                          key={cn("key", i)}
                          className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 text-[11px] font-mono font-medium bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
