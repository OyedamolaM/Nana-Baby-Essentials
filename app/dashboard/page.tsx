import { redirect } from "next/navigation";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "My Dashboard",
  description: "Manage your Nana's Baby Essentials account, orders, and registries.",
  path: "/dashboard",
  noIndex: true,
});

export default function DashboardPage() {
  redirect("/dashboard/orders");
}
