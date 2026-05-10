import type { ReactNode } from "react";
import Link from "next/link";

import { LegalPageLayout } from "../components/legal/LegalPageLayout";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Terms of Service",
  description:
    "Read the Nana's Baby Essentials terms governing website use, customer accounts, orders, shipping tiers, registry services, payments, and acceptable use.",
  path: "/terms-of-service",
});

function Section({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-gray-950">{title}</h2>
      {children}
    </section>
  );
}

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      description="These Terms of Service govern your use of the Nana's Baby Essentials website, customer accounts, baby registry services, orders, payments, and related communications."
      lastUpdated="May 10, 2026"
    >
      <Section title="1. Acceptance Of These Terms">
        <p>
          By accessing or using Nana&apos;s Baby Essentials, creating an account, placing an order,
          using the baby registry, subscribing to our newsletter, or signing in through Google, you
          agree to these Terms of Service and our{" "}
          <Link className="text-pink-600 hover:text-pink-700" href="/privacy-policy">
            Privacy Policy
          </Link>.
        </p>
        <p>
          If you do not agree to these terms, please do not use the website or our online services.
        </p>
      </Section>

      <Section title="2. Who May Use The Site">
        <p>
          You must use the site lawfully and only for legitimate personal, household, gifting, or
          family-related purchasing and registry purposes. If you create an account or place an order,
          you represent that the information you provide is accurate and that you are authorized to use
          the payment method and contact details you submit.
        </p>
      </Section>

      <Section title="3. Account Registration And Security">
        <ul className="list-disc space-y-2 pl-5">
          <li>You are responsible for keeping your password and account credentials secure.</li>
          <li>You must provide a valid full name, email address, and phone number when creating an account.</li>
          <li>You may not impersonate another person or create an account using false information.</li>
          <li>We may suspend, restrict, or close accounts used in a fraudulent, abusive, or unlawful manner.</li>
        </ul>
      </Section>

      <Section title="4. Google Sign-In">
        <p>
          If you use Google Sign-In, you authorize Nana&apos;s Baby Essentials and its authentication
          providers to process the Google account details required to sign you in and operate your
          account on this site. You remain responsible for complying with Google&apos;s own account and
          security requirements.
        </p>
      </Section>

      <Section title="5. Products, Content, And Availability">
        <p>
          We aim to present accurate product information, pricing, images, descriptions, and stock
          status. However, mistakes can occur. We may correct errors, update content, change pricing,
          remove products, or limit quantities at any time without prior notice.
        </p>
        <p>
          Product images, deal banners, and descriptions are for informational and merchandising
          purposes. Actual color, packaging, or accessory details may vary slightly from what appears
          online.
        </p>
      </Section>

      <Section title="6. Orders And Checkout">
        <ul className="list-disc space-y-2 pl-5">
          <li>Submitting an order request does not guarantee acceptance until payment and internal processing are completed.</li>
          <li>We may cancel or refuse an order where pricing, stock, payment verification, delivery, or fraud checks raise a problem.</li>
          <li>You must provide complete and accurate delivery and contact details.</li>
          <li>Order confirmation, payment verification, and fulfillment may depend on third-party payment or hosting systems being available.</li>
        </ul>
      </Section>

      <Section title="7. Pricing, Currency, And Payments">
        <p>
          Unless we state otherwise, pricing on the site is displayed in Nigerian Naira (NGN).
          Payments may be processed through Paystack or other authorized payment infrastructure we
          integrate with from time to time.
        </p>
        <p>
          By attempting a payment, you authorize the processing of the order, registry contribution,
          or registry item payment you initiated. Failed, reversed, incomplete, or unverifiable
          payments will not be treated as completed orders or contributions.
        </p>
      </Section>

      <Section title="8. Shipping Tiers And Delivery">
        <p>
          Shipping options offered at checkout are created and controlled by Nana&apos;s Baby Essentials.
          Customers choose from the active shipping tiers shown during checkout. Delivery fees, labels,
          and estimated delivery windows may vary by tier.
        </p>
        <p>
          For fuller operational details about delivery handling, failed delivery attempts, return
          review, exchanges, and refund treatment, please review our{" "}
          <Link className="text-pink-600 hover:text-pink-700" href="/shipping-returns-policy">
            Shipping and Returns Policy
          </Link>.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Shipping fees are added according to the selected shipping tier.</li>
          <li>Estimated delivery times are estimates only and are not guaranteed deadlines.</li>
          <li>We may contact you if a selected shipping tier cannot be honored as entered.</li>
          <li>Incorrect address or unreachable contact details may delay or prevent delivery.</li>
        </ul>
      </Section>

      <Section title="9. Returns, Exchanges, And Order Issues">
        <p>
          If there is an issue with a delivered item, please contact Nana&apos;s Baby Essentials promptly
          using our published support channels. Resolution options may depend on product condition,
          product category, delivery status, hygiene or safety considerations, and applicable law.
        </p>
        <p>
          Unless we expressly agree otherwise, do not assume that an item is returnable without first
          contacting us for instructions. Additional guidance is available in our{" "}
          <Link className="text-pink-600 hover:text-pink-700" href="/shipping-returns-policy">
            Shipping and Returns Policy
          </Link>.
        </p>
      </Section>

      <Section title="10. Baby Registry Services">
        <p>
          Nana&apos;s Baby Essentials allows eligible users to create shareable baby registries. By using
          the registry service, you agree to the following:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Registry owners are responsible for the accuracy of registry details and saved shipping information.</li>
          <li>Public registry links may be viewed by anyone who receives the share code or shared link.</li>
          <li>Gift buyers may fund registry items fully or partially where that feature is available.</li>
          <li>Registry purchases or contributions may be limited by product availability, item balance, or payment verification.</li>
          <li>We do not guarantee that all registry items will remain available, in stock, or fundable at all times.</li>
        </ul>
      </Section>

      <Section title="11. Registry Contributions And Partial Funding">
        <p>
          Where enabled, a guest may contribute toward selected registry items or make a broader cash
          contribution subject to the rules displayed at checkout. Partial funding is applied against
          eligible selected items and may not exceed the remaining balance available for those items or
          the registry overall.
        </p>
      </Section>

      <Section title="12. Newsletter And Marketing Communications">
        <p>
          If you subscribe to our newsletter or otherwise opt in to marketing, you agree that we may
          send promotional or informational communications relating to Nana&apos;s Baby Essentials,
          parenting content, product offers, registries, or seasonal campaigns. You can unsubscribe
          from non-essential marketing communications using the link or instructions provided in those messages.
        </p>
      </Section>

      <Section title="13. Acceptable Use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>use the site for unlawful, deceptive, abusive, or fraudulent purposes;</li>
          <li>attempt to interfere with site performance, security, checkout, registry flows, or account access;</li>
          <li>scrape, reverse engineer, copy, or systematically extract data beyond normal consumer browsing;</li>
          <li>upload or share harmful, infringing, offensive, or misleading content; or</li>
          <li>use another person&apos;s account, payment method, registry, or personal information without authorization.</li>
        </ul>
      </Section>

      <Section title="14. Intellectual Property">
        <p>
          The Nana&apos;s Baby Essentials name, branding, website layout, written content, product selection
          presentation, graphics, and related site materials are protected by applicable intellectual
          property rights. You may use the site for personal, non-commercial shopping and registry use
          only, unless we give you written permission for something broader.
        </p>
      </Section>

      <Section title="15. Third-Party Services And Links">
        <p>
          Our site may rely on or link to third-party services, including payment processing, hosting,
          analytics, authentication, social platforms, or external links. We are not responsible for
          the independent terms, uptime, or privacy practices of third-party services you access through
          or alongside our site.
        </p>
      </Section>

      <Section title="16. Disclaimer Of Warranties">
        <p>
          Nana&apos;s Baby Essentials is provided on an &quot;as available&quot; and &quot;as is&quot; basis to the extent
          permitted by law. We do not guarantee uninterrupted access, error-free operation, continuous
          availability of every feature, or that every product, payment, or delivery scenario will be
          free from third-party interruptions or operational delays.
        </p>
      </Section>

      <Section title="17. Limitation Of Liability">
        <p>
          To the extent permitted by law, Nana&apos;s Baby Essentials will not be liable for indirect,
          incidental, special, consequential, or punitive damages arising from your use of the site,
          inability to use the site, delayed orders, unavailable products, interrupted registry services,
          or third-party platform issues. Nothing in these terms excludes liability that cannot lawfully
          be excluded.
        </p>
      </Section>

      <Section title="18. Indemnity">
        <p>
          You agree to indemnify and hold Nana&apos;s Baby Essentials harmless from claims, liabilities,
          losses, and expenses arising from your misuse of the site, breach of these terms, fraudulent
          activity, or violation of another person&apos;s rights.
        </p>
      </Section>

      <Section title="19. Changes To These Terms">
        <p>
          We may update these Terms of Service from time to time to reflect changes in our services,
          operations, payments, registry features, legal requirements, or business practices. Updated
          terms become effective when posted on this page unless we state otherwise.
        </p>
      </Section>

      <Section title="20. Governing Law">
        <p>
          These terms are intended to be interpreted in a commercially reasonable manner consistent
          with applicable laws governing our operations in Nigeria, unless a different law must apply
          under mandatory legal rules.
        </p>
      </Section>

      <Section title="21. Contact Us">
        <p>
          Questions about these terms should be sent to{" "}
          <a className="text-pink-600 hover:text-pink-700" href="mailto:nanasbabyessentials@gmail.com">
            nanasbabyessentials@gmail.com
          </a>{" "}
          or directed to us by phone or WhatsApp at{" "}
          <a className="text-pink-600 hover:text-pink-700" href="tel:+2348024740159">
            +234 802 474 0159
          </a>.
        </p>
        <p>
          You should also review our{" "}
          <Link className="text-pink-600 hover:text-pink-700" href="/privacy-policy">
            Privacy Policy
          </Link>{" "}
          for details about how your information is handled.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
