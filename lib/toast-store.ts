"use client";

import { create } from "zustand";

export interface ToastAction {
  label: string;
  href: string;
}

export interface ToastItem {
  id: number;
  message: string;
  type: "info" | "success" | "error";
  action?: ToastAction;
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, type?: ToastItem["type"], action?: ToastAction) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, type = "info", action) => {
    const id = ++nextId;
    set({ toasts: [...get().toasts, { id, message, type, action }] });
    setTimeout(() => get().dismiss(id), 3500);
  },
  dismiss: (id) =>
    set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
