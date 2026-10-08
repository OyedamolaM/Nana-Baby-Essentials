import { parsePhoneNumberFromString } from "libphonenumber-js/max";

// Unprefixed numbers are Nigerian; international numbers must include their
// calling code. Keep the user's formatting while editing and normalize on submit.
export function normalizeCheckoutPhone(value: string): string | null {
  const phone = value.trim().replace(/^00/, "+");
  if (!phone || phone.length > 64 || !/^\+?[0-9\s().-]+$/.test(phone)) return null;

  const parsed = parsePhoneNumberFromString(phone, { defaultCountry: "NG", extract: false });
  return parsed?.isValid() && !parsed.ext ? parsed.number : null;
}

export function getCheckoutPhoneError(value: string) {
  if (!value.trim()) return "Phone number is required.";
  return normalizeCheckoutPhone(value) ? "" : "Enter a valid phone number.";
}

export function getCheckoutEmailError(value: string) {
  const email = value.trim();
  if (!email) return "Email is required.";
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? "" : "Enter a valid email address.";
}
