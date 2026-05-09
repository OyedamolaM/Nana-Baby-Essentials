import { buildPageMetadata } from "../../../../lib/site";
import { RegistryDetailClient } from "./RegistryDetailClient";

type RegistryDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: RegistryDetailPageProps) {
  const { id } = await params;
  const readableName = id
    .replace(/-[A-Za-z0-9]{6,20}$/, "")
    .replaceAll("-", " ")
    .trim();
  const registryLabel = readableName
    ? readableName.replace(/\b\w/g, (character) => character.toUpperCase())
    : "Registry Details";

  return buildPageMetadata({
    title: `${registryLabel} Registry Details`,
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
