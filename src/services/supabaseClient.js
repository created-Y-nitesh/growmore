/**
 * GrowMore Frontend Supabase Client
 * Initializes official Supabase client using client-safe environment variables.
 * PRIVILEGED SERVICE ROLE KEYS MUST NEVER BE IMPORTED OR ACCESSED HERE.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = () => {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  if (supabaseUrl.includes('placeholder') || supabaseAnonKey.includes('placeholder')) return false;
  try {
    new URL(supabaseUrl);
    return true;
  } catch {
    return false;
  }
};

let clientInstance = null;

if (isSupabaseConfigured()) {
  try {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'growmore_supabase_auth_session'
      }
    });
  } catch (err) {
    console.warn('[Supabase Client] Failed to initialize client:', err.message);
  }
}

export const supabase = clientInstance;

export const getSupabaseConfigStatus = () => ({
  configured: isSupabaseConfigured(),
  urlProvided: Boolean(supabaseUrl),
  anonKeyProvided: Boolean(supabaseAnonKey),
  missingVariables: [
    !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
    !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : null
  ].filter(Boolean)
});
