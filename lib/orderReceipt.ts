import { formatNairaAmount } from "./commerce";
import {
  formatPaymentMethodLabel,
  formatPaymentReferenceDisplay,
} from "./orderPayments";

type ReceiptItem = {
  name?: string | null;
  price?: number | null;
  quantity?: number | null;
};

type ReceiptAddress = {
  address?: string | null;
  city?: string | null;
  name?: string | null;
  phone?: string | null;
  state?: string | null;
};

export type OrderReceiptPayload = {
  createdAt?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerPickupCode?: string | null;
  id: string;
  items?: ReceiptItem[] | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  riderPickupCode?: string | null;
  shippingAddress?: ReceiptAddress | null;
  shippingTier?: string | null;
  status?: string | null;
  total: number;
};

type PdfFontName = "F1" | "F2";

type PdfPage = {
  commands: string[];
};

type ReceiptTableRow = {
  amount: string;
  nameLines: string[];
  quantity: string;
  rowHeight: number;
  unitPrice: string;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BRAND_COLOR: [number, number, number] = [0.82, 0.31, 0.49];
const BRAND_DARK: [number, number, number] = [0.2, 0.15, 0.22];
const SLATE_TEXT: [number, number, number] = [0.38, 0.43, 0.51];
const BORDER_COLOR: [number, number, number] = [0.89, 0.9, 0.93];
const LIGHT_FILL: [number, number, number] = [0.99, 0.97, 0.98];

const RECEIPT_STORE_DETAILS = [
  "Nana's Baby Essentials",
  "Email: nanasbabyessentials@gmail.com",
  "Phone / WhatsApp: +234 802 474 0159",
  "Mainland store: 71 Ogunlana Drive, Surulere, Lagos",
  "Island store: Block A4 Shop 844/845, HFP Eastline Shopping Complex, Abraham Adesanya Bus Stop, Ajah, Lagos",
];

function formatDateTime(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-NG", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildAddressLines(address?: ReceiptAddress | null) {
  if (!address) {
    return [];
  }

  return [
    address.name?.trim() || "",
    address.phone?.trim() || "",
    [address.address?.trim(), address.city?.trim(), address.state?.trim()]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);
}

function sanitizePdfText(value: string) {
  return value
    .replaceAll("â‚¦", "NGN ")
    .replaceAll("â€™", "'")
    .replaceAll("â€œ", '"')
    .replaceAll("â€", '"')
    .replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfText(value: string) {
  return sanitizePdfText(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function wrapLine(value: string, maxLength = 90) {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return [""];
  }

  const words = normalizedValue.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxLength) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function getReceiptNumber(orderId: string) {
  return orderId.slice(0, 8).toUpperCase();
}

function getRgbCommand(color: [number, number, number], operator: "rg" | "RG") {
  return `${color.map((value) => value.toFixed(3)).join(" ")} ${operator}`;
}

function pushText(
  page: PdfPage,
  options: {
    color?: [number, number, number];
    font?: PdfFontName;
    size?: number;
    text: string;
    x: number;
    y: number;
  },
) {
  const {
    color = BRAND_DARK,
    font = "F1",
    size = 11,
    text,
    x,
    y,
  } = options;

  page.commands.push(
    getRgbCommand(color, "rg"),
    "BT",
    `/${font} ${size} Tf`,
    `1 0 0 1 ${x} ${y} Tm`,
    `(${escapePdfText(text)}) Tj`,
    "ET",
  );
}

function pushFilledRect(
  page: PdfPage,
  options: {
    color: [number, number, number];
    height: number;
    width: number;
    x: number;
    y: number;
  },
) {
  page.commands.push(
    getRgbCommand(options.color, "rg"),
    `${options.x} ${options.y} ${options.width} ${options.height} re f`,
  );
}

function pushStrokedRect(
  page: PdfPage,
  options: {
    color?: [number, number, number];
    height: number;
    lineWidth?: number;
    width: number;
    x: number;
    y: number;
  },
) {
  page.commands.push(
    getRgbCommand(options.color ?? BORDER_COLOR, "RG"),
    `${options.lineWidth ?? 1} w`,
    `${options.x} ${options.y} ${options.width} ${options.height} re S`,
  );
}

function pushLine(
  page: PdfPage,
  options: {
    color?: [number, number, number];
    lineWidth?: number;
    x1: number;
    x2: number;
    y1: number;
    y2: number;
  },
) {
  page.commands.push(
    getRgbCommand(options.color ?? BORDER_COLOR, "RG"),
    `${options.lineWidth ?? 1} w`,
    `${options.x1} ${options.y1} m ${options.x2} ${options.y2} l S`,
  );
}

function createPage() {
  return {
    commands: [] as string[],
  };
}

function drawPageHeader(page: PdfPage, continued: boolean) {
  pushFilledRect(page, {
    color: BRAND_COLOR,
    height: 52,
    width: CONTENT_WIDTH,
    x: PAGE_MARGIN,
    y: 726,
  });

  pushText(page, {
    color: [1, 1, 1],
    font: "F2",
    size: 20,
    text: "Nana's Baby Essentials",
    x: PAGE_MARGIN + 16,
    y: 754,
  });
  pushText(page, {
    color: [1, 0.96, 0.98],
    size: 9,
    text: "Baby Store and Registry",
    x: PAGE_MARGIN + 16,
    y: 738,
  });
  pushText(page, {
    color: [1, 1, 1],
    font: "F2",
    size: 13,
    text: continued ? "ORDER RECEIPT (CONTINUED)" : "ORDER RECEIPT",
    x: PAGE_WIDTH - PAGE_MARGIN - 180,
    y: 748,
  });

  let storeDetailsY = 708;
  RECEIPT_STORE_DETAILS.flatMap((line, index) =>
    wrapLine(line, index === 0 ? 60 : 84),
  ).forEach((line, index) => {
    pushText(page, {
      color: index === 0 ? BRAND_DARK : SLATE_TEXT,
      font: index === 0 ? "F2" : "F1",
      size: index === 0 ? 10 : 9,
      text: line,
      x: PAGE_MARGIN,
      y: storeDetailsY,
    });
    storeDetailsY -= index === 0 ? 15 : 12;
  });

  pushLine(page, {
    x1: PAGE_MARGIN,
    x2: PAGE_WIDTH - PAGE_MARGIN,
    y1: 642,
    y2: 642,
  });
}

function drawInfoBox(
  page: PdfPage,
  options: {
    lines: string[];
    title: string;
    width: number;
    wrapLength: number;
    x: number;
    yTop: number;
  },
) {
  const contentLines = options.lines.flatMap((line) =>
    wrapLine(line, options.wrapLength),
  );
  const lineHeight = 14;
  const height = 42 + contentLines.length * lineHeight + 14;
  const y = options.yTop - height;

  pushFilledRect(page, {
    color: LIGHT_FILL,
    height: 28,
    width: options.width,
    x: options.x,
    y: options.yTop - 28,
  });
  pushStrokedRect(page, {
    height,
    width: options.width,
    x: options.x,
    y,
  });
  pushText(page, {
    font: "F2",
    size: 10,
    text: options.title,
    x: options.x + 12,
    y: options.yTop - 18,
  });

  let textY = options.yTop - 44;
  contentLines.forEach((line) => {
    pushText(page, {
      color: SLATE_TEXT,
      size: 10,
      text: line,
      x: options.x + 12,
      y: textY,
    });
    textY -= lineHeight;
  });

  return {
    bottomY: y,
    height,
  };
}

function buildReceiptRows(order: OrderReceiptPayload): ReceiptTableRow[] {
  return (order.items ?? [])
    .filter((item) => Number(item.quantity ?? 0) > 0)
    .map((item) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
      const unitPrice = Math.max(0, Number(item.price ?? 0));
      const nameLines = wrapLine(item.name?.trim() || "Order item", 34);

      return {
        amount: formatNairaAmount(quantity * unitPrice),
        nameLines,
        quantity: String(quantity),
        rowHeight: Math.max(34, nameLines.length * 14 + 12),
        unitPrice: formatNairaAmount(unitPrice),
      };
    });
}

function createPdfBytes(order: OrderReceiptPayload) {
  const pages: PdfPage[] = [];
  const tableX = PAGE_MARGIN;
  const tableWidth = CONTENT_WIDTH;
  const itemBoundaryX = tableX + 270;
  const qtyBoundaryX = itemBoundaryX + 60;
  const unitBoundaryX = qtyBoundaryX + 98;
  const rows = buildReceiptRows(order);
  const paymentMethod = formatPaymentMethodLabel(
    order.paymentMethod,
    order.paymentReference,
  );
  const paymentReference = formatPaymentReferenceDisplay(order.paymentReference) ?? "N/A";
  const customerLines = [
    order.customerName?.trim() || "Customer",
    order.customerEmail?.trim() || "No email provided",
    order.customerPhone?.trim() || "No phone provided",
  ];
  const addressLines = buildAddressLines(order.shippingAddress);
  const fulfillmentLines = [
    order.shippingTier?.trim() ? `Shipping Tier: ${order.shippingTier.trim()}` : "Shipping Tier: N/A",
    ...(addressLines.length > 0 ? addressLines : ["No delivery address recorded."]),
    ...(order.customerPickupCode ? [`Customer pickup code: ${order.customerPickupCode}`] : []),
    ...(order.riderPickupCode ? [`Rider pickup code: ${order.riderPickupCode}`] : []),
  ];
  const receiptLines = [
    `Receipt No: ${getReceiptNumber(order.id)}`,
    `Order Date: ${formatDateTime(order.createdAt)}`,
    `Status: ${order.status?.trim() || "N/A"}`,
    `Payment Medium: ${paymentMethod}`,
    `Reference: ${paymentReference}`,
  ];
  const itemsSubtotal = rows.reduce((sum, row, index) => {
    const item = order.items?.filter((entry) => Number(entry.quantity ?? 0) > 0)[index];
    return (
      sum +
      Math.max(1, Math.floor(Number(item?.quantity ?? 1))) *
        Math.max(0, Number(item?.price ?? 0))
    );
  }, 0);
  const shippingAmount = Math.max(Number(order.total ?? 0) - itemsSubtotal, 0);

  let currentPage = createPage();
  let currentY = 620;

  const startPage = (continued = false) => {
    currentPage = createPage();
    drawPageHeader(currentPage, continued);
    pages.push(currentPage);
    currentY = 620;
  };

  const drawTableHeader = () => {
    const headerY = currentY;
    pushFilledRect(currentPage, {
      color: LIGHT_FILL,
      height: 26,
      width: tableWidth,
      x: tableX,
      y: headerY - 26,
    });
    pushStrokedRect(currentPage, {
      height: 26,
      width: tableWidth,
      x: tableX,
      y: headerY - 26,
    });
    [itemBoundaryX, qtyBoundaryX, unitBoundaryX].forEach((boundary) => {
      pushLine(currentPage, {
        x1: boundary,
        x2: boundary,
        y1: headerY - 26,
        y2: headerY,
      });
    });
    pushText(currentPage, {
      font: "F2",
      size: 10,
      text: "Item Description",
      x: tableX + 10,
      y: headerY - 17,
    });
    pushText(currentPage, {
      font: "F2",
      size: 10,
      text: "Qty",
      x: itemBoundaryX + 14,
      y: headerY - 17,
    });
    pushText(currentPage, {
      font: "F2",
      size: 10,
      text: "Unit Price",
      x: qtyBoundaryX + 10,
      y: headerY - 17,
    });
    pushText(currentPage, {
      font: "F2",
      size: 10,
      text: "Amount",
      x: unitBoundaryX + 10,
      y: headerY - 17,
    });
    currentY = headerY - 26;
  };

  startPage(false);

  const customerBox = drawInfoBox(currentPage, {
    lines: customerLines,
    title: "Customer",
    width: 248,
    wrapLength: 30,
    x: PAGE_MARGIN,
    yTop: currentY,
  });
  const receiptBox = drawInfoBox(currentPage, {
    lines: receiptLines,
    title: "Receipt Details",
    width: 248,
    wrapLength: 34,
    x: PAGE_MARGIN + 280,
    yTop: currentY,
  });

  currentY = Math.min(customerBox.bottomY, receiptBox.bottomY) - 18;

  const fulfillmentBox = drawInfoBox(currentPage, {
    lines: fulfillmentLines,
    title: "Fulfillment",
    width: CONTENT_WIDTH,
    wrapLength: 86,
    x: PAGE_MARGIN,
    yTop: currentY,
  });

  currentY = fulfillmentBox.bottomY - 24;
  drawTableHeader();

  if (rows.length === 0) {
    const emptyRowHeight = 38;
    pushStrokedRect(currentPage, {
      height: emptyRowHeight,
      width: tableWidth,
      x: tableX,
      y: currentY - emptyRowHeight,
    });
    pushText(currentPage, {
      color: SLATE_TEXT,
      size: 10,
      text: "No order items were recorded for this receipt.",
      x: tableX + 10,
      y: currentY - 23,
    });
    currentY -= emptyRowHeight;
  } else {
    rows.forEach((row) => {
      if (currentY - row.rowHeight < 150) {
        startPage(true);
        currentY = 620;
        drawTableHeader();
      }

      pushStrokedRect(currentPage, {
        height: row.rowHeight,
        width: tableWidth,
        x: tableX,
        y: currentY - row.rowHeight,
      });

      [itemBoundaryX, qtyBoundaryX, unitBoundaryX].forEach((boundary) => {
        pushLine(currentPage, {
          x1: boundary,
          x2: boundary,
          y1: currentY - row.rowHeight,
          y2: currentY,
        });
      });

      let lineY = currentY - 16;
      row.nameLines.forEach((line) => {
        pushText(currentPage, {
          color: SLATE_TEXT,
          size: 10,
          text: line,
          x: tableX + 10,
          y: lineY,
        });
        lineY -= 13;
      });

      const metricY = currentY - row.rowHeight / 2 - 1;
      pushText(currentPage, {
        color: SLATE_TEXT,
        size: 10,
        text: row.quantity,
        x: itemBoundaryX + 18,
        y: metricY,
      });
      pushText(currentPage, {
        color: SLATE_TEXT,
        size: 10,
        text: row.unitPrice,
        x: qtyBoundaryX + 10,
        y: metricY,
      });
      pushText(currentPage, {
        color: SLATE_TEXT,
        size: 10,
        text: row.amount,
        x: unitBoundaryX + 10,
        y: metricY,
      });

      currentY -= row.rowHeight;
    });
  }

  if (currentY < 150) {
    startPage(true);
    drawTableHeader();
    currentY -= 8;
  }

  const totalsBoxWidth = 208;
  const totalsBoxHeight =
    74 + (shippingAmount > 0 ? 18 : 0);
  const totalsX = PAGE_WIDTH - PAGE_MARGIN - totalsBoxWidth;
  const totalsY = currentY - totalsBoxHeight - 18;

  pushFilledRect(currentPage, {
    color: LIGHT_FILL,
    height: 28,
    width: totalsBoxWidth,
    x: totalsX,
    y: totalsY + totalsBoxHeight - 28,
  });
  pushStrokedRect(currentPage, {
    height: totalsBoxHeight,
    width: totalsBoxWidth,
    x: totalsX,
    y: totalsY,
  });
  pushText(currentPage, {
    font: "F2",
    size: 10,
    text: "Payment Summary",
    x: totalsX + 12,
    y: totalsY + totalsBoxHeight - 18,
  });
  pushText(currentPage, {
    color: SLATE_TEXT,
    size: 10,
    text: `Items Total: ${formatNairaAmount(itemsSubtotal)}`,
    x: totalsX + 12,
    y: totalsY + totalsBoxHeight - 46,
  });
  if (shippingAmount > 0) {
    pushText(currentPage, {
      color: SLATE_TEXT,
      size: 10,
      text: `Shipping / Handling: ${formatNairaAmount(shippingAmount)}`,
      x: totalsX + 12,
      y: totalsY + totalsBoxHeight - 64,
    });
  }
  pushText(currentPage, {
    color: BRAND_DARK,
    font: "F2",
    size: 12,
    text: `Grand Total: ${formatNairaAmount(Number(order.total ?? 0))}`,
    x: totalsX + 12,
    y: totalsY + 18,
  });

  const footerY = totalsY - 68;
  pushLine(currentPage, {
    x1: PAGE_MARGIN,
    x2: PAGE_WIDTH - PAGE_MARGIN,
    y1: footerY + 38,
    y2: footerY + 38,
  });
  pushText(currentPage, {
    color: SLATE_TEXT,
    size: 9,
    text: "Thank you for shopping with Nana's Baby Essentials.",
    x: PAGE_MARGIN,
    y: footerY + 18,
  });
  pushText(currentPage, {
    color: SLATE_TEXT,
    size: 9,
    text: "Please keep this receipt for payment verification, pickup support, and order follow-up.",
    x: PAGE_MARGIN,
    y: footerY + 4,
  });

  const pageStrings = pages.map((page) => page.commands.join("\n"));
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  const objectStrings: string[] = [];
  const pagesObjectId = 2;
  const fontRegularObjectId = 3;
  const fontBoldObjectId = 4;
  let nextObjectId = 5;

  pageStrings.forEach((stream) => {
    const pageObjectId = nextObjectId++;
    const contentObjectId = nextObjectId++;
    pageObjectIds.push(pageObjectId);
    contentObjectIds.push(contentObjectId);

    objectStrings.push(
      `${pageObjectId} 0 obj\n<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj\n`,
    );
    objectStrings.push(
      `${contentObjectId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
  });

  objectStrings.unshift(
    `${fontBoldObjectId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
  );
  objectStrings.unshift(
    `${fontRegularObjectId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  );
  objectStrings.unshift(
    `${pagesObjectId} 0 obj\n<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] >>\nendobj\n`,
  );
  objectStrings.unshift("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objectStrings.forEach((objectString) => {
    offsets.push(pdf.length);
    pdf += objectString;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objectStrings.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objectStrings.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function buildOrderReceiptPdfBytes(order: OrderReceiptPayload) {
  return createPdfBytes(order);
}

export function getOrderReceiptFileName(orderId: string) {
  return `nbe-receipt-${orderId.slice(0, 8).toLowerCase()}.pdf`;
}

export function createOrderReceiptAttachment(order: OrderReceiptPayload) {
  const bytes = buildOrderReceiptPdfBytes(order);
  return {
    content: Buffer.from(bytes).toString("base64"),
    name: getOrderReceiptFileName(order.id),
  };
}

export function downloadOrderReceipt(order: OrderReceiptPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const blob = new Blob([buildOrderReceiptPdfBytes(order)], {
    type: "application/pdf",
  });
  const downloadUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = getOrderReceiptFileName(order.id);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(downloadUrl);
  }, 1000);
}
