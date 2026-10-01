import { AdminDashboard } from "@/app/pages/AdminDashboard";
import { SiteHeaderShell } from "@/app/components/SiteHeaderShell";

export const metadata = { title: "Registry details", robots: { index: false, follow: false } };

export default async function RegistryAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><SiteHeaderShell /><AdminDashboard registryAccountId={id} /></>;
}
