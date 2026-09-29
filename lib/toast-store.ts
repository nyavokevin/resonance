"use client";

import { create } from "zustand";

export interface ToastItem {
  id: number;
  message: string;
  type: "info" | "success" | "error";
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, type?: ToastItem["type"]) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, type = "info") => {
    const id = ++nextId;
    set({ toasts: [...get().toasts, { id, message, type }] });
    setTimeout(() => get().dismiss(id), 3500);
  },
  dismiss: (id) =>
    set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
