import { NextResponse } from "next/server";
import QRCode from "qrcode";

import { buildAbsoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const STORE_SLUG_PATTERN = /^[a-z0-9-]{1,80}$/i;

export async function GET(request: Request) {
  const storeParam = (new URL(request.url).searchParams.get("store") ?? "").trim();
  const storeSlug = STORE_SLUG_PATTERN.test(storeParam) ? storeParam : "";

  const target = new URL(buildAbsoluteUrl("/review"));
  target.searchParams.set("src", "qr");
  if (storeSlug) {
    target.searchParams.set("store", storeSlug);
  }

  let svg: string;
  try {
    svg = await QRCode.toString(target.toString(), {
      type: "svg",
      margin: 1,
      width: 512,
      color: { dark: "#1f2937", light: "#ffffff" },
    });
  } catch (error) {
    console.error("Failed to generate review QR code.", error);
    return NextResponse.json(
      { message: "Could not generate the QR code." },
      { status: 500 },
    );
  }

  return new NextResponse(svg, {
    headers: {
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
