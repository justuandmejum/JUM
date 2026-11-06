import type { ReactNode } from "react";
import { AdminTopbar } from "./AdminTopbar";
import "./admin.css";

// Shared shell for every /admin page: branded top bar + the .adm theme
// (see the "Admin area" block at the end of app/globals.css).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="adm">
      <AdminTopbar />
      <main className="adm-main">{children}</main>
    </div>
  );
}
