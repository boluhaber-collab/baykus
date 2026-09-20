"use client";

import Link from "next/link";
import Card from "./Card";

export type RelatedLink = {
  href: string;
  label: string;
  meta?: string;
};

export default function RelatedLinks({
  title,
  links,
  empty = "İlgili kayıt yok",
}: {
  title: string;
  links: RelatedLink[];
  empty?: string;
}) {
  return (
    <Card title={title} padding={false}>
      {links.length === 0 ? (
        <p className="px-4 py-4 text-sm text-baykus-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-baykus-line">
          {links.map((l) => (
            <li key={l.href + l.label}>
              <Link
                href={l.href}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-baykus-bg"
              >
                <span className="text-baykus-primary font-medium">{l.label}</span>
                {l.meta && <span className="text-xs text-baykus-muted tabular-nums">{l.meta}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
