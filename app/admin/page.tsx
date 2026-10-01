import { AdminDashboard } from "../pages/AdminDashboard";
import { SiteHeaderShell } from "../components/SiteHeaderShell";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Admin Dashboard",
  description: "Manage customers, orders, products, registries, and content.",
  path: "/admin",
  noIndex: true,
});

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
  return (
    <>
      <SiteHeaderShell />
      <AdminDashboard initialSection={section === "registries" ? "registries" : "overview"} />
    </>
  );
}
