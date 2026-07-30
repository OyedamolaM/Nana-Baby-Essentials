import { formatNairaAmount } from "./commerce";
import { formatPaymentMethodLabel } from "./orderPayments";

type BroadcastTemplateOptions = {
  body: string;
  subject: string;
  unsubscribeUrl?: string;
};

type RegistryCreatedEmailOptions = {
  additionalInfo?: string | null;
  babyGender?: string | null;
  customerEmail: string;
  customerName?: string | null;
  dueMonth?: string | null;
  registryName: string;
  shareCode: string;
  shareUrl: string;
  whatsapp?: string | null;
};

type StoreOrderItem = {
  name?: string;
  price?: number;
  quantity?: number;
};

type StoreOrderAddress = {
  address?: string;
  city?: string;
  name?: string;
  phone?: string;
  state?: string;
};

type OrderConfirmationEmailOptions = {
  createdAt?: string | null;
  customerEmail: string;
  customerName?: string | null;
  items: StoreOrderItem[];
  orderId: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  pickupCode?: string | null;
  shippingAddress?: StoreOrderAddress | null;
  shippingTier?: string | null;
  totalAmount: number;
};

type OrderSupportEmailOptions = OrderConfirmationEmailOptions & {
  customerPhone?: string | null;
  status?: string | null;
};

type EmailContent = {
  html: string;
  subject: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderParagraphs(body: string) {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) =>
      `<p style="margin:0 0 16px;line-height:1.75;color:#334155;font-size:15px;">${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`,
    )
    .join("");
}

function renderEmailShell(options: {
  bodyHtml: string;
  eyebrow: string;
  footerText: string;
  subtitle: string;
  title: string;
}) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="margin:0 auto;max-width:680px;overflow:hidden;border-radius:28px;background:#ffffff;box-shadow:0 24px 60px rgba(15,23,42,0.08);">
      <div style="padding:32px 32px 28px;background: linear-gradient(135deg, #db2777 0%, #fb7185 100%);color:#ffffff;">
        <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.92;">${escapeHtml(options.eyebrow)}</div>
        <h1 style="margin:14px 0 10px;font-size:32px;line-height:1.15;">${escapeHtml(options.title)}</h1>
        <p style="margin:0;max-width:540px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.92);">${escapeHtml(options.subtitle)}</p>
      </div>
      <div style="padding:32px;">
        ${options.bodyHtml}
      </div>
      <div style="border-top:1px solid #e2e8f0;padding:18px 32px;background:#f8fafc;font-size:13px;line-height:1.7;color:#64748b;">
        ${escapeHtml(options.footerText)}
      </div>
    </div>
  </body>
</html>`;
}

function formatDueMonth(dueMonth?: string | null) {
  if (!dueMonth) {
    return "We will confirm your due month with you.";
  }

  const parsed = new Date(`${dueMonth}-01T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return dueMonth;
  }

  return new Intl.DateTimeFormat("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatBabyGender(value?: string | null) {
  if (value === "male") {
    return "Boy";
  }

  if (value === "female") {
    return "Girl";
  }

  return "Surprise";
}

function formatShippingTier(value?: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";

  const labelMap: Record<string, string> = {
    lagos: "Lagos (2-3 days)",
    northcentral: "North Central (4-6 days)",
    northeast: "North East (5-7 days)",
    northwest: "North West (5-7 days)",
    southeast: "South East (4-6 days)",
    southsouth: "South South (4-6 days)",
    southwest: "South West (3-5 days)",
  };

  return labelMap[normalized] ?? value?.trim() ?? "We will confirm delivery timing with you.";
}

function formatOrderDate(value?: string | null) {
  if (!value) {
    return "Today";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(parsed);
}

function renderFactGrid(facts: Array<{ label: string; value: string }>) {
  return `<div style="margin:0 0 28px;border:1px solid #fed7aa;border-radius:22px;background:#fff7ed;padding:18px 20px;">
    ${facts
      .map((fact, index) => {
        const isLast = index === facts.length - 1;

        return `<div style="padding:10px 0;${isLast ? "" : "border-bottom:1px solid #fdba74;"}">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c2410c;">${escapeHtml(fact.label)}</div>
            <div style="margin-top:6px;font-size:16px;line-height:1.6;color:#7c2d12;font-weight:600;">${escapeHtml(fact.value)}</div>
          </div>`;
      })
      .join("")}
  </div>`;
}

function renderCtaButton(label: string, href: string) {
  return `<div style="margin:28px 0 0;">
    <a href="${escapeHtml(href)}" style="display:inline-block;border-radius:999px;background:#0f172a;color:#ffffff;padding:14px 22px;font-size:14px;font-weight:700;letter-spacing:0.02em;text-decoration:none;">
      ${escapeHtml(label)}
    </a>
  </div>`;
}

function formatAddress(address?: StoreOrderAddress | null) {
  if (!address) {
    return "We will confirm your delivery address with you.";
  }

  const lines = [
    address.name?.trim(),
    address.phone?.trim(),
    address.address?.trim(),
    [address.city?.trim(), address.state?.trim()].filter(Boolean).join(", "),
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "We will confirm your delivery address with you.";
}

function renderAddressCard(title: string, body: string) {
  return `<div style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:20px;padding:18px 20px;background:#ffffff;">
    <div style="margin:0 0 10px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">${escapeHtml(title)}</div>
    <div style="font-size:15px;line-height:1.8;color:#1e293b;white-space:pre-line;">${escapeHtml(body)}</div>
  </div>`;
}

function renderOrderItems(items: StoreOrderItem[]) {
  const rows = items
    .map((item) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
      const unitAmount = Number(item.price ?? 0);
      const lineTotal = unitAmount * quantity;

      return `<tr>
        <td style="padding:14px 0;border-bottom:1px solid #e2e8f0;font-size:15px;line-height:1.6;color:#1e293b;">
          <div style="font-weight:600;">${escapeHtml(item.name?.trim() || "Store item")}</div>
          <div style="font-size:13px;color:#64748b;">Qty ${quantity}</div>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-size:15px;line-height:1.6;color:#0f172a;font-weight:600;">
          ${escapeHtml(formatNairaAmount(lineTotal))}
        </td>
      </tr>`;
    })
    .join("");

  return `<div style="margin:0 0 24px;border:1px solid #e2e8f0;border-radius:22px;padding:8px 20px 0;background:#ffffff;">
    <table style="width:100%;border-collapse:collapse;">
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>`;
}

export function renderNewsletterHtml({
  subject,
  body,
}: BroadcastTemplateOptions) {
  return renderEmailShell({
    bodyHtml: renderParagraphs(body),
    eyebrow: "Nana's Baby Essentials",
    footerText: "Sent by Nana's Baby Essentials.",
    subtitle:
      "Fresh updates, featured products, and thoughtful tips for growing families.",
    title: subject,
  });
}

export function renderNewsletterText({
  subject,
  body,
}: BroadcastTemplateOptions) {
  return `${subject}\n\n${body.trim()}\n\nSent by Nana's Baby Essentials.`;
}

export function renderCustomerCampaignHtml({
  subject,
  body,
  unsubscribeUrl,
}: BroadcastTemplateOptions) {
  const unsubscribeHtml = unsubscribeUrl
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#64748b;">
        If you no longer want these campaign emails, you can
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#db2777;text-decoration:none;">unsubscribe here</a>.
      </p>`
    : "";

  return renderEmailShell({
    bodyHtml: `${renderParagraphs(body)}${unsubscribeHtml}`,
    eyebrow: "Customer Campaign",
    footerText:
      "Sent to Nana's Baby Essentials customers. You can also manage campaign preferences from your dashboard when signed in.",
    subtitle:
      "Store-wide announcements, special launches, and important updates for every customer account.",
    title: subject,
  });
}

export function renderCustomerCampaignText({
  subject,
  body,
  unsubscribeUrl,
}: BroadcastTemplateOptions) {
  return `${subject}\n\n${body.trim()}${
    unsubscribeUrl
      ? `\n\nUnsubscribe from campaign emails: ${unsubscribeUrl}`
      : ""
  }\n\nSent to Nana's Baby Essentials customers.`;
}

export function renderRegistryCreatedEmail({
  additionalInfo,
  babyGender,
  customerEmail,
  customerName,
  dueMonth,
  registryName,
  shareCode,
  shareUrl,
  whatsapp,
}: RegistryCreatedEmailOptions): EmailContent {
  const firstName =
    customerName?.trim().split(/\s+/).filter(Boolean)[0] || "there";
  const subject = `Your registry is live: ${registryName}`;
  const facts = [
    { label: "Registry", value: registryName },
    { label: "Due Month", value: formatDueMonth(dueMonth) },
    { label: "Baby", value: formatBabyGender(babyGender) },
    { label: "Share Code", value: shareCode },
  ];

  const detailRows = [
    whatsapp?.trim() ? `<li style="margin:0 0 10px;">WhatsApp: <strong>${escapeHtml(whatsapp.trim())}</strong></li>` : "",
    additionalInfo?.trim()
      ? `<li style="margin:0 0 10px;">Notes: ${escapeHtml(additionalInfo.trim())}</li>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 18px;font-size:16px;line-height:1.8;color:#334155;">
      Hi ${escapeHtml(firstName)}, your registry has been created and is ready to share.
      We have also saved your registry details under <strong>${escapeHtml(customerEmail)}</strong>.
    </p>
    ${renderFactGrid(facts)}
    <div style="margin:0 0 24px;border-radius:22px;background:#fff1f2;padding:20px 22px;">
      <h2 style="margin:0 0 10px;font-size:18px;line-height:1.4;color:#9f1239;">What happens next</h2>
      <p style="margin:0;font-size:15px;line-height:1.8;color:#4c0519;">
        Our registry rep will reach out within 24 hours to confirm your list, help with updates,
        and make sure everything is ready for gifting.
      </p>
    </div>
    ${detailRows ? `<ul style="margin:0 0 8px 20px;padding:0;font-size:15px;line-height:1.8;color:#334155;">${detailRows}</ul>` : ""}
    ${renderCtaButton("Open your registry", shareUrl)}
    <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#64748b;">
      Share this link with family and friends: <a href="${escapeHtml(shareUrl)}" style="color:#ea580c;text-decoration:none;">${escapeHtml(shareUrl)}</a>
    </p>
  `;

  const text = [
    `Hi ${firstName},`,
    "",
    `Your registry "${registryName}" is now live and ready to share.`,
    `Due month: ${formatDueMonth(dueMonth)}`,
    `Baby: ${formatBabyGender(babyGender)}`,
    `Share code: ${shareCode}`,
    `Registry link: ${shareUrl}`,
    "",
    "Our registry rep will reach out within 24 hours to confirm your list and help with updates.",
    whatsapp?.trim() ? `WhatsApp: ${whatsapp.trim()}` : null,
    additionalInfo?.trim() ? `Notes: ${additionalInfo.trim()}` : null,
    "",
    "Sent by Nana's Baby Essentials.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    html: renderEmailShell({
      bodyHtml,
      eyebrow: "Registry Created",
      footerText: "Sent by Nana's Baby Essentials.",
      subtitle:
        "Your registry details are saved and ready for family and friends to support.",
      title: subject,
    }),
    subject,
    text,
  };
}

export function renderOrderConfirmationEmail({
  createdAt,
  customerEmail,
  customerName,
  items,
  orderId,
  paymentMethod,
  paymentReference,
  pickupCode,
  shippingAddress,
  shippingTier,
  totalAmount,
}: OrderConfirmationEmailOptions): EmailContent {
  const firstName =
    customerName?.trim().split(/\s+/).filter(Boolean)[0] || "there";
  const subject = "Your Nana's Baby Essentials order is confirmed";
  const paymentMethodLabel = formatPaymentMethodLabel(
    paymentMethod,
    paymentReference,
  );
  const facts = [
    { label: "Order ID", value: orderId },
    { label: "Placed", value: formatOrderDate(createdAt) },
    { label: "Delivery Zone", value: formatShippingTier(shippingTier) },
    { label: "Payment Method", value: paymentMethodLabel },
    ...(pickupCode?.trim()
      ? [{ label: "Pickup Code", value: pickupCode.trim() }]
      : []),
    { label: "Total", value: formatNairaAmount(totalAmount) },
  ];

  const bodyHtml = `
    <p style="margin:0 0 18px;font-size:16px;line-height:1.8;color:#334155;">
      Hi ${escapeHtml(firstName)}, thank you for shopping with Nana's Baby Essentials.
      We have received your order and sent this confirmation to <strong>${escapeHtml(customerEmail)}</strong>.
    </p>
    ${renderFactGrid(
      paymentReference?.trim()
        ? [...facts, { label: "Payment Reference", value: paymentReference.trim() }]
        : facts,
    )}
    <div style="margin:0 0 22px;border-radius:22px;background:#fff7ed;padding:18px 20px;">
      <p style="margin:0;font-size:15px;line-height:1.8;color:#9a3412;">
        A PDF receipt is attached to this email for your records, with your order summary and store support details.
      </p>
    </div>
    <h2 style="margin:0 0 14px;font-size:18px;line-height:1.4;color:#0f172a;">Order summary</h2>
    ${renderOrderItems(items)}
    ${renderAddressCard("Delivery address", formatAddress(shippingAddress))}
    ${
      pickupCode?.trim()
        ? `<div style="margin:0 0 24px;border:1px solid #bfdbfe;border-radius:20px;padding:18px 20px;background:#eff6ff;">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;">Pickup Code</div>
            <div style="margin-top:8px;font-size:24px;font-weight:800;letter-spacing:0.08em;color:#1e3a8a;">${escapeHtml(pickupCode.trim())}</div>
            <p style="margin:8px 0 0;font-size:13px;line-height:1.7;color:#1e40af;">Share this code with the rider or pickup attendant only when receiving your order.</p>
          </div>`
        : ""
    }
    <p style="margin:0;font-size:15px;line-height:1.8;color:#334155;">
      We will keep you updated as your order moves through processing and delivery.
    </p>
  `;

  const text = [
    `Hi ${firstName},`,
    "",
    "Thank you for shopping with Nana's Baby Essentials. Your order is confirmed.",
    `Order ID: ${orderId}`,
    `Placed: ${formatOrderDate(createdAt)}`,
    `Delivery zone: ${formatShippingTier(shippingTier)}`,
    `Payment method: ${paymentMethodLabel}`,
    paymentReference?.trim()
      ? `Payment reference: ${paymentReference.trim()}`
      : null,
    pickupCode?.trim() ? `Pickup code: ${pickupCode.trim()}` : null,
    `Total: ${formatNairaAmount(totalAmount)}`,
    "A PDF receipt is attached to this email for your records.",
    "",
    "Items:",
    ...items.map((item) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
      const unitAmount = Number(item.price ?? 0);
      return `- ${item.name?.trim() || "Store item"} x ${quantity}: ${formatNairaAmount(
        unitAmount * quantity,
      )}`;
    }),
    "",
    "Delivery address:",
    formatAddress(shippingAddress),
    "",
    "Sent by Nana's Baby Essentials.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    html: renderEmailShell({
      bodyHtml,
      eyebrow: "Order Confirmation",
      footerText: "Sent by Nana's Baby Essentials.",
      subtitle:
        "Your payment has been received and your order is now in our processing queue.",
      title: subject,
    }),
    subject,
    text,
  };
}

export function renderOrderSupportEmail({
  createdAt,
  customerEmail,
  customerName,
  customerPhone,
  items,
  orderId,
  paymentMethod,
  paymentReference,
  pickupCode,
  shippingAddress,
  shippingTier,
  status,
  totalAmount,
}: OrderSupportEmailOptions): EmailContent {
  const customerLabel = customerName?.trim() || "Customer";
  const paymentMethodLabel = formatPaymentMethodLabel(
    paymentMethod,
    paymentReference,
  );
  const fulfillmentLabel = pickupCode?.trim()
    ? `Store pickup (${formatShippingTier(shippingTier)})`
    : formatShippingTier(shippingTier);
  const subject = `New paid order ${orderId.slice(0, 8).toUpperCase()} - ${formatNairaAmount(totalAmount)}`;
  const facts = [
    { label: "Order ID", value: orderId },
    { label: "Placed", value: formatOrderDate(createdAt) },
    { label: "Status", value: status?.trim() || "paid" },
    { label: "Customer", value: customerLabel },
    { label: "Email", value: customerEmail.trim() || "Not provided" },
    { label: "Phone", value: customerPhone?.trim() || "Not provided" },
    { label: "Fulfillment", value: fulfillmentLabel },
    { label: "Payment Method", value: paymentMethodLabel },
    ...(paymentReference?.trim()
      ? [{ label: "Payment Reference", value: paymentReference.trim() }]
      : []),
    ...(pickupCode?.trim()
      ? [{ label: "Pickup Code", value: pickupCode.trim() }]
      : []),
    { label: "Total", value: formatNairaAmount(totalAmount) },
  ];

  const bodyHtml = `
    <p style="margin:0 0 18px;font-size:16px;line-height:1.8;color:#334155;">
      A customer has completed payment. Please review the order, confirm stock,
      and begin fulfillment.
    </p>
    ${renderFactGrid(facts)}
    ${
      pickupCode?.trim()
        ? `<div style="margin:0 0 24px;border-radius:22px;background:#eff6ff;padding:20px 22px;color:#1e3a8a;">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#2563eb;">Shared Pickup Code</div>
            <div style="margin-top:8px;font-size:28px;font-weight:800;letter-spacing:0.1em;">${escapeHtml(pickupCode.trim())}</div>
            <p style="margin:8px 0 0;font-size:13px;line-height:1.7;">The customer, rider, and support team should use this same code at handover.</p>
          </div>`
        : ""
    }
    <h2 style="margin:0 0 14px;font-size:18px;line-height:1.4;color:#0f172a;">Items to fulfill</h2>
    ${renderOrderItems(items)}
    ${renderAddressCard(
      pickupCode?.trim() ? "Pickup contact details" : "Delivery address",
      formatAddress(shippingAddress),
    )}
    <div style="margin:0;border-radius:22px;background:#f1f5f9;padding:18px 20px;">
      <p style="margin:0;font-size:14px;line-height:1.8;color:#334155;">
        The customer receipt is attached. Use the order ID and Paystack reference
        when reconciling payment or contacting the customer.
      </p>
    </div>
  `;

  const text = [
    "New paid order",
    "",
    `Order ID: ${orderId}`,
    `Placed: ${formatOrderDate(createdAt)}`,
    `Status: ${status?.trim() || "paid"}`,
    `Customer: ${customerLabel}`,
    `Email: ${customerEmail.trim() || "Not provided"}`,
    `Phone: ${customerPhone?.trim() || "Not provided"}`,
    `Fulfillment: ${fulfillmentLabel}`,
    `Payment method: ${paymentMethodLabel}`,
    paymentReference?.trim()
      ? `Payment reference: ${paymentReference.trim()}`
      : null,
    pickupCode?.trim() ? `Pickup code: ${pickupCode.trim()}` : null,
    `Total: ${formatNairaAmount(totalAmount)}`,
    "",
    "Items:",
    ...items.map((item) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
      const unitAmount = Number(item.price ?? 0);
      return `- ${item.name?.trim() || "Store item"} x ${quantity}: ${formatNairaAmount(
        unitAmount * quantity,
      )}`;
    }),
    "",
    pickupCode?.trim() ? "Pickup contact details:" : "Delivery address:",
    formatAddress(shippingAddress),
    "",
    "The customer receipt is attached to this email.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    html: renderEmailShell({
      bodyHtml,
      eyebrow: "Paid Order Alert",
      footerText:
        "Internal fulfillment notification from Nana's Baby Essentials.",
      subtitle:
        pickupCode?.trim()
          ? "Payment is confirmed and this pickup order is ready for fulfillment."
          : "Payment is confirmed and this delivery order is ready for fulfillment.",
      title: subject,
    }),
    subject,
    text,
  };
}
