import { redirect } from "next/navigation";
import { buildPageMetadata } from "../../../lib/site";

export const metadata = buildPageMetadata({
  title: "Create New Registry",
  description:
    "Create a full registry page and attach the baby products already saved in your registry cart.",
  path: "/registry/new",
  noIndex: true,
});

export default function RegistryCreatePage() {
  redirect("/registry");
}
