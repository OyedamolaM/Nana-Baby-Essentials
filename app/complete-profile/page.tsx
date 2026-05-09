import { CompleteProfileClient } from "./CompleteProfileClient";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Add Your Phone Number",
  description:
    "Add a phone number to your Nana's Baby Essentials account for faster checkout and support.",
  path: "/complete-profile",
  noIndex: true,
});

export default function CompleteProfilePage() {
  return <CompleteProfileClient />;
}
