import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/authServer";

export async function GET(request: Request) {
  const admin = await requireAdminRoute(request);
  if (admin.response) {
    return admin.response;
  }

  return NextResponse.json({
    isAdmin: true,
    userId: admin.user.id,
  });
}
