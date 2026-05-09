import { AdminDashboard } from "../pages/AdminDashboard";
import { SiteHeaderShell } from "../components/SiteHeaderShell";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Admin Dashboard",
  description: "Manage customers, orders, products, registries, and content.",
  path: "/admin",
  noIndex: true,
});

export default function AdminPage() {
  return (
    <>
      <SiteHeaderShell />
      <AdminDashboard />
    </>
  );
}
