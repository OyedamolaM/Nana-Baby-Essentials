import { UserDashboard } from "../../pages/UserDashboard";
import { SiteHeaderShell } from "../../components/SiteHeaderShell";
import { buildPageMetadata } from "../../../lib/site";

export const metadata = buildPageMetadata({
  title: "My Registries",
  description: "Manage your registries, open active lists, and track gifting activity.",
  path: "/dashboard/registries",
  noIndex: true,
});

export default function DashboardRegistriesPage() {
  return (
    <>
      <SiteHeaderShell />
      <UserDashboard initialTab="registries" />
    </>
  );
}
