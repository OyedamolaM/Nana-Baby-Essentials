import { NextResponse } from "next/server";
import { isSecretAuthorized } from "@/lib/serverSecrets";
import { processPaymentEmails } from "@/lib/paymentEmails";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isSecretAuthorized(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await processPaymentEmails();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Payment email retry failed.", error);
    return NextResponse.json({ message: "Payment email retry failed." }, { status: 503 });
  }
}
