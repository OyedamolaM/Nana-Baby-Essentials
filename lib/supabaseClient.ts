import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "public-anon-key-placeholder";

export const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
};

export function isSupabaseMissingRelationError(
  error: unknown,
  relationName?: string,
) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as SupabaseErrorLike;
  if (maybeError.code !== "PGRST205") {
    return false;
  }

  if (!relationName) {
    return true;
  }

  return maybeError.message?.includes(`'public.${relationName}'`) ?? false;
}
