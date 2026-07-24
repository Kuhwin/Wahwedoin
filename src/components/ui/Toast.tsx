"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { X, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  undo?: () => void;
}

interface ToastContextValue {
  addToast: (message: string, type?: Toast["type"], undo?: () => void) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: Toast["type"] = "success", undo?: () => void) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type, undo }]);
      const timer = setTimeout(() => removeToast(id), undo ? 10000 : 4000);
      timers.current.set(id, timer);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in fade-in slide-in-from-bottom-2",
              toast.type === "success" && "bg-white border-green-200 text-green-800",
              toast.type === "error" && "bg-white border-red-200 text-red-800",
              toast.type === "info" && "bg-white border-slate-200 text-slate-800"
            )}
          >
            <span className="flex-1">{toast.message}</span>
            {toast.undo && (
              <button
                onClick={() => {
                  toast.undo!();
                  removeToast(toast.id);
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <Undo2 size={12} />
                Undo
              </button>
            )}
            <button
              onClick={() => removeToast(toast.id)}
              className="p-0.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
