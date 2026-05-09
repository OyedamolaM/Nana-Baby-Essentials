import { buildPageMetadata } from "../../../../lib/site";
import { RegistryDetailClient } from "./RegistryDetailClient";

type RegistryDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: RegistryDetailPageProps) {
  const { id } = await params;
  const registryKey = id.slice(0, 8);

  return buildPageMetadata({
    title: `Registry Details ${registryKey}`,
    description:
      "Review registry items, completed gifts, payment history, and checklist progress for this registry.",
    path: `/dashboard/registries/${id}`,
    noIndex: true,
  });
}

export default async function RegistryDetailPage({
  params,
}: RegistryDetailPageProps) {
  const { id } = await params;

  return <RegistryDetailClient registryId={id} />;
}
