"use client";

import Link from "next/link";

export type Crumb = { label: string; href?: string };

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-baykus-muted mb-1.5">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-baykus-line">/</span>}
          {item.href ? (
            <Link href={item.href} className="text-baykus-primary hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-baykus-text font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
