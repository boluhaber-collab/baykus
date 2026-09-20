"use client";

import Link from "next/link";

export default function EntityLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`text-baykus-primary hover:underline font-medium ${className}`}>
      {children}
    </Link>
  );
}
