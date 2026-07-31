import { SiteHeaderShell } from "../../components/SiteHeaderShell";
import { UserDashboard } from "../../pages/UserDashboard";
import { buildPageMetadata } from "../../../lib/site";

export const metadata = buildPageMetadata({
  title: "My Settings",
  description: "Manage communication preferences, security, and your account.",
  path: "/dashboard/settings",
  noIndex: true,
});

export default function DashboardSettingsPage() {
  return (
    <>
      <SiteHeaderShell />
      <UserDashboard initialTab="settings" />
    </>
  );
}
