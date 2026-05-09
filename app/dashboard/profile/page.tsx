import { UserDashboard } from "../../pages/UserDashboard";
import { SiteHeaderShell } from "../../components/SiteHeaderShell";
import { buildPageMetadata } from "../../../lib/site";

export const metadata = buildPageMetadata({
  title: "My Profile",
  description:
    "Update your account details, phone number, and saved shipping address.",
  path: "/dashboard/profile",
  noIndex: true,
});

export default function DashboardProfilePage() {
  return (
    <>
      <SiteHeaderShell />
      <UserDashboard initialTab="profile" />
    </>
  );
}
