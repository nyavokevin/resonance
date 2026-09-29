"use client";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-card bg-hover ${className}`}
    />
  );
}
