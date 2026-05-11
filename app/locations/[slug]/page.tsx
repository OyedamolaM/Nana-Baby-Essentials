import { redirect } from "next/navigation";

type LegacyLocationPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function LegacyLocationPage({
  params,
}: LegacyLocationPageProps) {
  const { slug } = await params;

  redirect(`/locations?location=${encodeURIComponent(slug)}`);
}
