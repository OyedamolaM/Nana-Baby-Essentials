export interface ShippingAddress {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
}

export interface UserProfileRecord {
  id: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  is_admin?: boolean | null;
  shipping_address?: Partial<ShippingAddress> | null;
  account_status?: "active" | "disabled" | null;
  deleted_at?: string | null;
  created_at?: string | null;
}

type SupabaseColumnErrorLike = {
  code?: string | null;
  message?: string | null;
};

export const USER_PROFILE_SELECT =
  "id, email, full_name, phone, is_admin, shipping_address, account_status, deleted_at, created_at";

export const USER_PROFILE_FALLBACK_SELECT =
  "id, email, full_name, phone, is_admin, shipping_address, created_at";

export function isMissingUserProfileColumnError(
  error: unknown,
  columnName?: string,
) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as SupabaseColumnErrorLike;
  if (maybeError.code !== "42703") {
    return false;
  }

  if (!columnName) {
    return true;
  }

  return maybeError.message?.includes(`user_profiles.${columnName}`) ?? false;
}

export function normalizeUserProfileRecord(
  value: Partial<UserProfileRecord> | null | undefined,
): UserProfileRecord | null {
  if (!value?.id) {
    return null;
  }

  return {
    id: value.id,
    email: value.email ?? "",
    full_name: value.full_name ?? null,
    phone: value.phone ?? null,
    is_admin: value.is_admin ?? false,
    shipping_address: value.shipping_address ?? null,
    account_status: value.account_status ?? "active",
    deleted_at: value.deleted_at ?? null,
    created_at: value.created_at ?? null,
  };
}

export function emptyShippingAddress(): ShippingAddress {
  return {
    name: "",
    phone: "",
    address: "",
    city: "",
    state: "",
  };
}

export function normalizeShippingAddress(
  value: Partial<ShippingAddress> | null | undefined,
): ShippingAddress {
  return {
    name: value?.name?.trim() ?? "",
    phone: value?.phone?.trim() ?? "",
    address: value?.address?.trim() ?? "",
    city: value?.city?.trim() ?? "",
    state: value?.state?.trim() ?? "",
  };
}

export function hasSavedShippingAddress(
  value: Partial<ShippingAddress> | null | undefined,
) {
  const address = normalizeShippingAddress(value);
  return Boolean(
    address.name &&
      address.phone &&
      address.address &&
      address.city &&
      address.state,
  );
}
