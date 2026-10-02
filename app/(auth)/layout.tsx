import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-base">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/Background.png')" }}
      />
      <div aria-hidden className="absolute inset-0 bg-base/70" />
      <div className="relative z-10 flex w-full items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
}
