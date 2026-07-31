import { SiteHeaderShell } from "../../components/SiteHeaderShell";
import { UserDashboard } from "../../pages/UserDashboard";
import { buildPageMetadata } from "../../../lib/site";

export const metadata = buildPageMetadata({
  title: "My Account",
  description: "Manage your personal information and saved delivery address.",
  path: "/dashboard/account",
  noIndex: true,
});

export default function DashboardAccountPage() {
  return (
    <>
      <SiteHeaderShell />
      <UserDashboard initialTab="account" />
    </>
  );
}
