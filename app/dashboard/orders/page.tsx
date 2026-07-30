import { UserDashboard } from "../../pages/UserDashboard";
import { SiteHeaderShell } from "../../components/SiteHeaderShell";
import { buildPageMetadata } from "../../../lib/site";

export const metadata = buildPageMetadata({
  title: "My Orders",
  description: "Review your confirmed store orders and download receipts.",
  path: "/dashboard/orders",
  noIndex: true,
});

export default function DashboardOrdersPage() {
  return (
    <>
      <SiteHeaderShell />
      <UserDashboard initialTab="orders" />
    </>
  );
}
