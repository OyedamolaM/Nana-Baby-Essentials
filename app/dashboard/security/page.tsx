import { SiteHeaderShell } from "../../components/SiteHeaderShell";
import { UserDashboard } from "../../pages/UserDashboard";
import { buildPageMetadata } from "../../../lib/site";

export const metadata = buildPageMetadata({
  title: "My Security",
  description: "Manage campaign email preferences and update your account password.",
  path: "/dashboard/security",
  noIndex: true,
});

export default function DashboardSecurityPage() {
  return (
    <>
      <SiteHeaderShell />
      <UserDashboard initialTab="security" />
    </>
  );
}
