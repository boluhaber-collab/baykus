"use client";

import { ReactNode } from "react";
import Card from "./Card";

export default function DataTable({
  title,
  actions,
  children,
  empty,
  isEmpty,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
}) {
  return (
    <Card padding={false} title={title} actions={actions}>
      {isEmpty ? (
        <div className="px-4 py-8 text-sm text-baykus-muted text-center">{empty || "Kayıt yok"}</div>
      ) : (
        <div className="bk-table-wrap border-0 rounded-none">
          <table className="bk-table">{children}</table>
        </div>
      )}
    </Card>
  );
}
