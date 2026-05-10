import type { ReactNode } from "react";
import Link from "next/link";

import { LegalPageLayout } from "../components/legal/LegalPageLayout";
import { buildPageMetadata } from "../../lib/site";

export const metadata = buildPageMetadata({
  title: "Shipping and Returns Policy",
  description:
    "Read Nana's Baby Essentials shipping, delivery, return, exchange, refund, registry gift, and order-issue policy for customers shopping in Nigeria.",
  path: "/shipping-returns-policy",
});

function Section({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id?: string;
  title: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-xl font-semibold text-gray-950">{title}</h2>
      {children}
    </section>
  );
}

export default function ShippingReturnsPolicyPage() {
  return (
    <LegalPageLayout
      title="Shipping and Returns Policy"
      description="This policy explains how Nana's Baby Essentials handles delivery options, shipping fees, delivery timing, failed deliveries, returns, exchanges, refunds, and registry-related order issues."
      lastUpdated="May 10, 2026"
    >
      <section className="space-y-4 rounded-2xl border border-rose-100 bg-rose-50/60 p-5">
        <h2 className="text-lg font-semibold text-gray-950">Quick Links</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="text-pink-600 hover:text-pink-700" href="#shipping-policy">
            Shipping Policy
          </Link>
          <Link className="text-pink-600 hover:text-pink-700" href="#return-policy">
            Return Policy
          </Link>
          <Link className="text-pink-600 hover:text-pink-700" href="#contact-support">
            Contact Support
          </Link>
        </div>
      </section>

      <Section title="1. Overview">
        <p>
          Nana&apos;s Baby Essentials serves customers shopping for baby products, gifting from the
          registry, and placing orders for delivery in Nigeria. This policy applies to standard
          product orders, registry-related orders, and customer support issues connected to
          shipping, delivery, returns, exchanges, and refunds.
        </p>
        <p>
          If this policy conflicts with a mandatory consumer right under applicable law, the legal
          rule will apply. You should also review our{" "}
          <Link className="text-pink-600 hover:text-pink-700" href="/terms-of-service">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link className="text-pink-600 hover:text-pink-700" href="/privacy-policy">
            Privacy Policy
          </Link>.
        </p>
      </Section>

      <Section id="shipping-policy" title="2. Shipping Policy">
        <p>
          Shipping on Nana&apos;s Baby Essentials is controlled by the delivery options shown at
          checkout. Customers do not type in their own shipping tier. Instead, you select from the
          active shipping options we have made available for that order.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Each shipping tier may have its own fee, label, and estimated delivery time.</li>
          <li>The options visible at checkout are the only options currently available for that order.</li>
          <li>Shipping fees are added to the order total before payment is completed.</li>
          <li>Delivery estimates are guides, not guaranteed appointment windows.</li>
        </ul>
      </Section>

      <Section title="3. Order Processing">
        <p>
          Orders are processed after successful payment confirmation and internal review. Processing
          may include stock confirmation, packaging, address review, and payment verification.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Orders are not treated as confirmed for dispatch until payment is successfully verified.</li>
          <li>Processing times may be longer during sales, public holidays, system downtime, or unusually high order volume.</li>
          <li>If we identify a product, payment, or delivery issue, we may contact you before dispatch.</li>
        </ul>
      </Section>

      <Section title="4. Delivery Coverage And Timing">
        <p>
          Nana&apos;s Baby Essentials primarily serves customers in Nigeria. Delivery times depend on
          the shipping tier selected, your delivery destination, stock readiness, courier movement,
          traffic conditions, weather, and public holiday schedules.
        </p>
        <p>
          Some delivery tiers may be designed for Lagos while others may cover wider locations. The
          exact options available for a particular checkout are based on the active delivery setup
          we have configured at that time.
        </p>
      </Section>

      <Section title="5. Customer Responsibilities For Delivery">
        <p>To help us deliver successfully, you are responsible for providing accurate details at checkout.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Use the correct full name, phone number, delivery address, city, and state.</li>
          <li>Make sure the phone number provided is reachable around the expected delivery period.</li>
          <li>Be available to receive the order directly or arrange for an authorized recipient.</li>
          <li>Promptly respond if our team reaches out about delivery clarification.</li>
        </ul>
        <p>
          We are not responsible for delays, failed delivery attempts, or extra handling caused by
          incomplete addresses, wrong phone numbers, missing landmarks, or an unavailable recipient.
        </p>
      </Section>

      <Section title="6. Delays, Failed Deliveries, And Re-Delivery">
        <p>
          Delivery may be delayed by courier issues, traffic, security restrictions, weather,
          holidays, operational backlog, payment verification, or address problems.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>If delivery fails because the customer cannot be reached or the address is incorrect, we may require a re-delivery arrangement.</li>
          <li>Additional delivery charges may apply if a second delivery attempt is required because of customer-provided errors or missed receipt.</li>
          <li>If an order cannot be safely or reasonably delivered, we may hold it for support resolution before proceeding further.</li>
        </ul>
      </Section>

      <Section title="7. Shipping Fees">
        <p>
          Shipping fees are based on the tier selected at checkout and are displayed before payment.
          We may update tier labels, delivery fees, or estimates from time to time, but the amount
          charged for a completed order is the amount shown and accepted during that checkout.
        </p>
        <p>
          Shipping charges are generally non-refundable once dispatch work has begun, except where
          the return or refund is caused by our confirmed error, an item defect established after
          review, or another reason we expressly approve.
        </p>
      </Section>

      <Section title="8. Registry Orders And Gift Deliveries">
        <p>
          Registry orders and funded registry items are subject to the same delivery principles as
          standard product orders. Delivery may depend on the registry owner&apos;s saved shipping
          address and the item or contribution status at the time payment is confirmed.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Registry item availability can change before payment is fully completed.</li>
          <li>Partial funding may be applied only to eligible selected items as supported by the checkout flow.</li>
          <li>Delivery of registry goods may be coordinated using the registry owner&apos;s shipping details where required.</li>
        </ul>
      </Section>

      <Section id="return-policy" title="9. Return Policy">
        <p>
          Because Nana&apos;s Baby Essentials sells baby-related products, returns are handled
          carefully with attention to hygiene, safety, product condition, and resale suitability.
          A return is not automatic simply because a package was delivered. Every request is subject
          to review.
        </p>
        <p>
          If you believe an item is wrong, damaged, defective, incomplete, or unsuitable based on a
          confirmed order issue, contact us as quickly as possible after delivery with your order
          details and clear evidence where relevant.
        </p>
      </Section>

      <Section title="10. Items That May Be Eligible For Return Or Exchange">
        <p>Subject to review, we may consider a return, exchange, or refund where:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>the wrong product was delivered;</li>
          <li>the delivered item arrived visibly damaged;</li>
          <li>the product has a manufacturing defect confirmed after inspection;</li>
          <li>the order is incomplete and the missing portion cannot be resolved quickly; or</li>
          <li>we expressly approve the return based on the condition and circumstances reported.</li>
        </ul>
      </Section>

      <Section title="11. Items That Are Usually Not Returnable">
        <p>Unless required by law or expressly approved by us, we generally do not accept returns for:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>items that have been used, washed, altered, or damaged after delivery;</li>
          <li>items returned without original packaging where packaging is important for resale or safety review;</li>
          <li>hygiene-sensitive or personal-use baby items once opened, unsealed, or used;</li>
          <li>items damaged through misuse, poor handling, or storage after delivery; or</li>
          <li>issues reported too late for us to verify responsibly.</li>
        </ul>
      </Section>

      <Section title="12. Return Request Process">
        <p>To request a return, exchange, or refund review, contact Nana&apos;s Baby Essentials with:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>your order number or the email/phone used for the order;</li>
          <li>the product name and quantity involved;</li>
          <li>a clear description of the issue;</li>
          <li>photos or video where damage, wrong item, or defect is involved; and</li>
          <li>your preferred resolution, such as exchange, replacement, or refund review.</li>
        </ul>
        <p>
          Please do not send an item back without instructions from our team. An unauthorized return
          may delay or prevent proper resolution.
        </p>
      </Section>

      <Section title="13. Inspection And Approval">
        <p>
          Returned or disputed items may need to be inspected before we approve a replacement,
          exchange, refund, or store credit. Our review may consider the item condition, packaging,
          the reported issue, supporting evidence, courier history, and the time between delivery
          and report.
        </p>
      </Section>

      <Section title="14. Refunds, Store Credit, And Exchanges">
        <p>
          If we approve a return-related resolution, the remedy may be a replacement, exchange,
          store credit, partial refund, or full refund depending on the specific case.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Refunds, where approved, are generally returned through the original payment path or another method we specify.</li>
          <li>Shipping charges may be deducted or retained where the issue was not caused by Nana&apos;s Baby Essentials.</li>
          <li>Exchanges are subject to stock availability at the time the request is approved.</li>
          <li>If a direct replacement is not available, we may offer another reasonable resolution.</li>
        </ul>
      </Section>

      <Section title="15. Order Cancellations">
        <p>
          If you need to cancel an order, contact us immediately. We cannot promise cancellation
          once processing or dispatch has started.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>If an order is cancelled before dispatch and before irreversible processing steps, we may approve cancellation.</li>
          <li>If dispatch has already started, the order may instead fall under our return review process.</li>
          <li>Registry-related payments may be subject to additional checks before any reversal is considered.</li>
        </ul>
      </Section>

      <Section title="16. Support Expectations">
        <p>
          We aim to resolve genuine order issues fairly and as quickly as possible. However, some
          cases require verification with warehouse, store, courier, registry, or payment records
          before a final decision can be made.
        </p>
      </Section>

      <Section id="contact-support" title="17. Contact Support">
        <p>
          For shipping, delivery, return, exchange, or refund questions, contact Nana&apos;s Baby
          Essentials using any of the channels below:
        </p>
        <p>
          Email:{" "}
          <a className="text-pink-600 hover:text-pink-700" href="mailto:nanasbabyessentials@gmail.com">
            nanasbabyessentials@gmail.com
          </a>
          <br />
          Phone / WhatsApp:{" "}
          <a className="text-pink-600 hover:text-pink-700" href="tel:+2348024740159">
            +234 802 474 0159
          </a>
          <br />
          Mainland Store: 71 Ogunlana Drive, Surulere, Lagos
          <br />
          Island Store: Block A4 Shop 844/845, HFP Eastline Shopping Complex, Abraham Adesanya Bus Stop, Ajah, Lagos
        </p>
      </Section>
    </LegalPageLayout>
  );
}
