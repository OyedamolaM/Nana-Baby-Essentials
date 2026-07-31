import type { Metadata } from "next";

import { getPublicRegistryByShareCode } from "../../../lib/publicData";
import { buildPageMetadata } from "../../../lib/site";
import { PublicRegistryPageClient } from "./PublicRegistryPageClient";

type PublicRegistryPageProps = {
  params: Promise<{ shareCode: string }>;
};

export async function generateMetadata({
  params,
}: PublicRegistryPageProps): Promise<Metadata> {
  const { shareCode } = await params;
  const { items, registry } = await getPublicRegistryByShareCode(shareCode);

  if (!registry) {
    return buildPageMetadata({
      title: "Registry Not Found",
      description: "This baby registry link is no longer available.",
      path: `/registry/${shareCode}`,
      noIndex: true,
    });
  }

  return buildPageMetadata({
    title: `${registry.name} Registry`,
    description:
      registry.additional_info?.trim() ||
      `Shop ${registry.name}'s baby registry and send a gift directly from Nana's Baby Essentials.`,
    path: `/registry/${registry.share_code}`,
    image: items[0]?.product?.image || null,
  });
}

export default async function PublicRegistryPage({
  params,
}: PublicRegistryPageProps) {
  const { shareCode } = await params;
  const { items, registry } = await getPublicRegistryByShareCode(shareCode);

  return (
    <PublicRegistryPageClient
      shareCode={shareCode}
      initialRegistry={registry}
      initialItems={items}
    />
  );
}
