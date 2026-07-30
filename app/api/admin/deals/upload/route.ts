import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";
import { uploadSiteImage } from "@/lib/siteImageStorage";

export const runtime = "nodejs";

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

  try {
    const uploaded = await uploadSiteImage(image, "deals");
    return NextResponse.json({
      ...uploaded,
      dataUrl: uploaded.url,
      message: "Image uploaded successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Could not process this image.",
      },
      { status: 400 },
    );
  }
}
