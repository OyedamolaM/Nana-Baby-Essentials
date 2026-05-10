import { SiteHeaderShell } from "../../components/SiteHeaderShell";
import { UserDashboard } from "../../pages/UserDashboard";
import { buildPageMetadata } from "../../../lib/site";

export const metadata = buildPageMetadata({
  title: "My Address",
  description: "Review and update the shipping address saved to your account.",
  path: "/dashboard/address",
  noIndex: true,
});

export default function DashboardAddressPage() {
  return (
    <>
      <SiteHeaderShell />
      <UserDashboard initialTab="address" />
    </>
  );
}
