"use client";

import { ReactNode } from "react";

export default function Card({
  children,
  className = "",
  padding = true,
  title,
  actions,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`bk-card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-baykus-line px-4 py-2.5">
          <div className="font-semibold text-sm text-baykus-text">{title}</div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={padding ? "p-4" : ""}>{children}</div>
    </div>
  );
}
