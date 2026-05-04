import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

const authOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

export const hasSupabaseServerEnv = Boolean(supabaseUrl && supabaseAnonKey);
export const hasSupabaseServiceRoleEnv = Boolean(
  supabaseUrl && supabaseServiceRoleKey,
);

export function createSupabaseServerClient(accessToken?: string) {
  if (!hasSupabaseServerEnv) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    ...authOptions,
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export function createSupabaseServiceRoleClient() {
  if (!hasSupabaseServiceRoleEnv) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, authOptions);
}
