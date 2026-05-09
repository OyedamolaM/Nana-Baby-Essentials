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
