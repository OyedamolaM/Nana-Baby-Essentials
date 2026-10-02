import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminRoute } from "@/lib/authServer";
import { createSupabaseServiceRoleClient } from "@/lib/supabaseServer";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRoute(request);
  if (admin.response) return admin.response;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ message: "Choose a valid registry." }, { status: 400 });
  }
  const client = createSupabaseServiceRoleClient();
  if (!client) return NextResponse.json({ message: "Registry deletion is unavailable." }, { status: 503 });
  const { error } = await client.rpc("delete_unfunded_registry", { p_registry_id: id });
  if (error) {
    console.error("Registry deletion failed.", error);
    return NextResponse.json({ message: error.code === "P0001" ? error.message : error.code === "PGRST202" || error.code === "42883" ? "Registry deletion is not set up yet. Apply the registry deletion migrations." : "Could not delete the registry." }, { status: 409 });
  }
  revalidateTag("registries", "max");
  return NextResponse.json({ message: "Registry deleted." });
}
