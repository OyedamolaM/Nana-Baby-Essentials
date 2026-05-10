import type { ReactNode } from "react";
import Link from "next/link";

import { LegalPageLayout } from "../components/legal/LegalPageLayout";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    "Read how Nana's Baby Essentials collects, uses, stores, and protects personal information across shopping, baby registry, blog, newsletter, and Google sign-in experiences.",
  path: "/privacy-policy",
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

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      description="This policy explains how Nana's Baby Essentials handles personal information when you browse the site, create an account, build a registry, place an order, sign in with Google, join the newsletter, or contact our team."
      lastUpdated="May 10, 2026"
    >
      <Section title="1. Who We Are">
        <p>
          Nana&apos;s Baby Essentials is a baby store and baby registry platform serving families
          in Nigeria through our website, customer support channels, and physical store locations.
          On this website, &quot;we&quot;, &quot;our&quot;, and &quot;us&quot; refer to Nana&apos;s Baby Essentials.
        </p>
        <p>
          Contact details:
          <br />
          Email: <a className="text-pink-600 hover:text-pink-700" href="mailto:nanasbabyessentials@gmail.com">nanasbabyessentials@gmail.com</a>
          <br />
          Phone / WhatsApp: <a className="text-pink-600 hover:text-pink-700" href="tel:+2348024740159">+234 802 474 0159</a>
          <br />
          Mainland Store: 71 Ogunlana Drive, Surulere, Lagos
          <br />
          Island Store: Block A4 Shop 844/845, HFP Eastline Shopping Complex, Abraham Adesanya Bus Stop, Ajah, Lagos
        </p>
      </Section>

      <Section title="2. Scope Of This Policy">
        <p>
          This Privacy Policy applies to information collected through:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>our online store and product pages;</li>
          <li>baby registry creation, sharing, and guest gifting pages;</li>
          <li>customer account registration and dashboard features;</li>
          <li>checkout and delivery selection flows;</li>
          <li>newsletter subscriptions and campaign communications;</li>
          <li>our blog and customer support communications; and</li>
          <li>social sign-in, including Google authentication.</li>
        </ul>
      </Section>

      <Section title="3. Information We Collect">
        <p>Depending on how you use the site, we may collect the following categories of information:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account information:</strong> full name, email address, phone number,
            password credentials handled through our authentication provider, and account status.
          </li>
          <li>
            <strong>Profile and shipping information:</strong> delivery name, phone number,
            address, city, state, and saved shipping preferences.
          </li>
          <li>
            <strong>Order information:</strong> products selected, quantities, pricing, shipping
            tier selected at checkout, order history, cancellation status, and delivery-related information.
          </li>
          <li>
            <strong>Payment-related information:</strong> payment references, transaction status,
            amounts paid, and limited payment verification details from our payment processor. We do
            not store your full card number or card security code on our website.
          </li>
          <li>
            <strong>Registry information:</strong> registry name, due month, baby gender, shared
            registry code, product selections, contribution history, gift messages, and the registry
            owner&apos;s shipping address where required for fulfillment.
          </li>
          <li>
            <strong>Communications data:</strong> support messages, newsletter subscription status,
            campaign contact records, and any details you send to us by email, WhatsApp, or forms.
          </li>
          <li>
            <strong>Google sign-in data:</strong> when you use Google authentication, we may receive
            your Google-linked email address, name, and account identifier needed to create or sign
            you into your Nana&apos;s Baby Essentials account.
          </li>
          <li>
            <strong>Device and usage data:</strong> browser type, approximate device information,
            IP-related request data, page interactions, and analytics or performance data collected
            through hosting and monitoring tools.
          </li>
          <li>
            <strong>Cookies and local storage data:</strong> cookie consent preference, cart state,
            session data, and similar website functionality data.
          </li>
        </ul>
      </Section>

      <Section title="4. How We Use Your Information">
        <p>We use personal information to operate and improve Nana&apos;s Baby Essentials, including to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>create and manage customer accounts;</li>
          <li>authenticate users, including through Google sign-in;</li>
          <li>create, manage, and share baby registries;</li>
          <li>process orders, contributions, and checkout confirmations;</li>
          <li>apply shipping tiers and delivery-related fees selected by the customer;</li>
          <li>communicate about orders, registries, support requests, and account changes;</li>
          <li>send newsletters or campaigns where you have subscribed or where we have another valid basis to contact you;</li>
          <li>prevent fraud, abuse, duplicate payments, and misuse of the platform;</li>
          <li>maintain records for accounting, operations, customer support, and legal compliance; and</li>
          <li>analyze performance, diagnose errors, and improve site functionality.</li>
        </ul>
      </Section>

      <Section title="5. Google Sign-In Specific Disclosure">
        <p>
          If you choose to sign in with Google, we use the information supplied by Google only to
          authenticate you, create or maintain your account, and support your use of the Nana&apos;s Baby
          Essentials website and services. We do not sell Google user data.
        </p>
        <p>
          Google may also process your information according to its own privacy terms. We recommend
          that you review Google&apos;s privacy documentation if you use that sign-in method.
        </p>
      </Section>

      <Section title="6. Payments">
        <p>
          Payments and payment verification are handled through third-party payment infrastructure,
          including Paystack for supported transactions. We receive transaction references, payment
          status, amounts, and limited reconciliation data needed to confirm and manage orders,
          registry contributions, or partial registry funding. Sensitive card details are handled by
          the payment processor rather than stored directly in our site database.
        </p>
      </Section>

      <Section title="7. Cookies, Analytics, And Similar Technologies">
        <p>We use cookies and related storage technologies for essential site functionality and, where enabled, analytics.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Essential technologies</strong> help keep you signed in, remember cart activity,
            maintain security, and preserve preferences such as cookie consent.
          </li>
          <li>
            <strong>Analytics or performance technologies</strong> may help us understand site usage,
            diagnose issues, and improve performance.
          </li>
        </ul>
        <p>
          You can manage your cookie preference through our site&apos;s consent tools where available,
          but disabling certain cookies may affect core functionality.
        </p>
      </Section>

      <Section title="8. When We Share Information">
        <p>We do not sell your personal information. We may share personal information with service providers and partners only as needed to operate Nana&apos;s Baby Essentials, such as:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>authentication, database, and storage providers;</li>
          <li>payment processors and payment verification services;</li>
          <li>website hosting, deployment, analytics, or monitoring providers;</li>
          <li>email or communication service providers used to send transactional or marketing messages; and</li>
          <li>professional advisers or authorities where disclosure is required by law, legal process, or to protect our rights and users.</li>
        </ul>
        <p>
          Public registry pages are intentionally shareable. If a registry owner shares a registry
          link, visitors with the link may see the registry content made available on that public page.
        </p>
      </Section>

      <Section title="9. Data Retention">
        <p>
          We retain data for as long as reasonably necessary for account management, order history,
          registry administration, customer support, fraud prevention, legal obligations, and business
          recordkeeping. Some records may remain in backup, accounting, operational, or audit systems
          even after an account is closed or disabled.
        </p>
      </Section>

      <Section title="10. Security">
        <p>
          We use administrative, technical, and operational measures intended to protect personal
          information. However, no website, database, or transmission method is completely secure.
          You should keep your password confidential and contact us immediately if you believe your
          account has been compromised.
        </p>
      </Section>

      <Section title="11. Your Choices And Rights">
        <p>Subject to applicable law, you may request to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>access or correct your personal information;</li>
          <li>update your saved profile or shipping details through your dashboard where available;</li>
          <li>unsubscribe from newsletters or marketing campaigns;</li>
          <li>request account deletion or restriction of processing; or</li>
          <li>ask questions about how your data is used.</li>
        </ul>
        <p>
          To make a request, please contact us using the details in this policy. We may need to verify
          your identity before processing certain requests.
        </p>
      </Section>

      <Section title="12. Children">
        <p>
          Nana&apos;s Baby Essentials sells products for babies and families, but our website and account
          features are intended for parents, guardians, gift buyers, and adult users. We do not knowingly
          invite children to create accounts or submit personal information directly through the site.
        </p>
      </Section>

      <Section title="13. International Processing">
        <p>
          Some of our service providers may process or store data outside Nigeria. By using our site,
          you understand that information may be transferred to infrastructure operated by our service
          providers, subject to applicable safeguards and provider terms.
        </p>
      </Section>

      <Section title="14. Changes To This Policy">
        <p>
          We may update this Privacy Policy from time to time to reflect operational, legal, technical,
          or service changes. The latest version will always be posted on this page with its effective
          update date.
        </p>
      </Section>

      <Section title="15. Contact Us">
        <p>
          If you have questions about this Privacy Policy, our data practices, or your account, contact
          Nana&apos;s Baby Essentials at{" "}
          <a className="text-pink-600 hover:text-pink-700" href="mailto:nanasbabyessentials@gmail.com">
            nanasbabyessentials@gmail.com
          </a>{" "}
          or by phone/WhatsApp at{" "}
          <a className="text-pink-600 hover:text-pink-700" href="tel:+2348024740159">
            +234 802 474 0159
          </a>.
        </p>
        <p>
          You can also review our{" "}
          <Link className="text-pink-600 hover:text-pink-700" href="/terms-of-service">
            Terms of Service
          </Link>{" "}
          for the rules that apply to the use of this website.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
