import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";

const MAX_IMAGE_SIZE_BYTES = 500 * 1024;

export async function POST(request: Request) {
  const admin = await requireAdminRoute(request);
  if (admin.response) {
    return admin.response;
  }

  const formData = await request.formData().catch(() => null);
  const image = formData?.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json(
      { message: "Upload an image file." },
      { status: 400 },
    );
  }

  if (!image.type.startsWith("image/")) {
    return NextResponse.json(
      { message: "Only image uploads are supported." },
      { status: 400 },
    );
  }

  if (image.size > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json(
      { message: "Image uploads must be 500KB or smaller." },
      { status: 400 },
    );
  }

  const arrayBuffer = await image.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const dataUrl = `data:${image.type};base64,${base64}`;

  return NextResponse.json({
    dataUrl,
    message: "Image uploaded successfully.",
  });
}
