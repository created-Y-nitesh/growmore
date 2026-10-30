/**
 * GrowMore Supabase Authentication Service
 * Manages customer signup, email verification, session lifecycle, password reset,
 * and profile reading/updating with strict RLS field protection.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { authStorage } from './api';

// Fields that customers are strictly forbidden from modifying
const FORBIDDEN_PROFILE_FIELDS = [
  'role',
  'account_status',
  'is_verified',
  'balance',
  'admin',
  'id',
  'created_at',
  'updated_at'
];

export const supabaseAuth = {
  isConfigured: isSupabaseConfigured,

  /**
   * Register a new customer with Email & Password
   */
  signUp: async ({ email, password, fullName, phone, dob }) => {
    if (!isSupabaseConfigured()) {
      throw new Error(
        'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your frontend environment.'
      );
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName?.trim() || '',
          phone: phone?.trim() || '',
          dob: dob || null
        },
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}` : undefined
      }
    });

    if (error) {
      throw new Error(error.message);
    }

    const user = data?.user;
    const session = data?.session;
    const isEmailConfirmationRequired = user && !session && (!user.confirmed_at && !user.email_confirmed_at);

    // If session is immediately active (e.g. email confirmations disabled in dev)
    if (session && user) {
      authStorage.setToken(session.access_token);
      authStorage.setUser({
        id: user.id,
        email: user.email,
        fullName: user.user_metadata?.full_name || fullName,
        phone: user.user_metadata?.phone || phone,
        role: 'user',
        accountStatus: 'active',
        isVerified: Boolean(user.email_confirmed_at)
      });
    }

    return {
      user,
      session,
      isEmailConfirmationRequired,
      message: isEmailConfirmationRequired
        ? 'Verification email sent. Please check your inbox and verify your email before logging in.'
        : 'Account created successfully!'
    };
  },

  /**
   * Log in an existing customer with Email & Password
   */
  signIn: async ({ email, password }) => {
    if (!isSupabaseConfigured()) {
      throw new Error(
        'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your frontend environment.'
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });

    if (error) {
      throw new Error(error.message);
    }

    const user = data.user;
    const session = data.session;

    if (!user || !session) {
      throw new Error('Authentication succeeded but session could not be established.');
    }

    // Persist JWT token
    authStorage.setToken(session.access_token);

    // Fetch customer's authoritative profile row
    let profile = null;
    try {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      profile = profileRow;
    } catch (profErr) {
      console.warn('[Supabase Auth] Could not fetch profile row:', profErr.message);
    }

    const customerUser = {
      id: user.id,
      email: user.email,
      fullName: profile?.full_name || user.user_metadata?.full_name || user.email.split('@')[0],
      phone: profile?.phone || user.user_metadata?.phone || '',
      dob: profile?.dob || user.user_metadata?.dob || null,
      role: profile?.role || 'user',
      accountStatus: profile?.account_status || 'active',
      isVerified: profile?.is_verified || Boolean(user.email_confirmed_at)
    };

    authStorage.setUser(customerUser);

    return {
      user: customerUser,
      session
    };
  },

  /**
   * Log out customer and invalidate session
   */
  signOut: async () => {
    if (isSupabaseConfigured() && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('[Supabase Auth] Sign out error:', err.message);
      }
    }
    authStorage.clear();
  },

  /**
   * Request password reset email
   */
  requestPasswordReset: async (email) => {
    if (!isSupabaseConfigured()) {
      throw new Error(
        'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your frontend environment.'
      );
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}` : undefined
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      success: true,
      message: 'Password recovery email dispatched. Please check your inbox for the reset link.'
    };
  },

  /**
   * Update password for authenticated user (e.g. from recovery link)
   */
  updatePassword: async (newPassword) => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured.');
    }

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      success: true,
      user: data.user,
      message: 'Password updated successfully. You can now use your new password.'
    };
  },

  /**
   * Fetch current authenticated customer profile from profiles table
   */
  getProfile: async () => {
    if (!isSupabaseConfigured() || !supabase) {
      return null;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return null;
    }

    const user = authData.user;
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profError) {
      console.warn('[Supabase Auth] Profile fetch warning:', profError.message);
    }

    const customerUser = {
      id: user.id,
      email: user.email,
      fullName: profile?.full_name || user.user_metadata?.full_name || user.email.split('@')[0],
      phone: profile?.phone || user.user_metadata?.phone || '',
      dob: profile?.dob || user.user_metadata?.dob || null,
      role: profile?.role || 'user',
      accountStatus: profile?.account_status || 'active',
      isVerified: profile?.is_verified || Boolean(user.email_confirmed_at),
      createdAt: profile?.created_at || user.created_at
    };

    authStorage.setUser(customerUser);
    return customerUser;
  },

  /**
   * Update customer profile with strict field whitelist
   * Rejects any attempt to modify role, status, or verification
   */
  updateProfile: async (updates = {}) => {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Supabase is not configured.');
    }

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      throw new Error('You must be logged in to update your profile.');
    }

    const userId = authData.user.id;

    // Filter permitted fields only
    const sanitizedUpdates = {};
    const permittedKeys = ['full_name', 'phone', 'dob', 'avatar_url'];

    for (const key of Object.keys(updates)) {
      if (FORBIDDEN_PROFILE_FIELDS.includes(key.toLowerCase())) {
        throw new Error(`Security violation: updating '${key}' is strictly forbidden.`);
      }
      if (permittedKeys.includes(key)) {
        sanitizedUpdates[key] = updates[key];
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return { success: true, message: 'No permitted fields to update.' };
    }

    sanitizedUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('profiles')
      .update(sanitizedUpdates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update profile: ${error.message}`);
    }

    // Refresh stored user profile
    const currentUser = authStorage.getUser() || {};
    authStorage.setUser({
      ...currentUser,
      fullName: data.full_name || currentUser.fullName,
      phone: data.phone || currentUser.phone,
      dob: data.dob || currentUser.dob
    });

    return {
      success: true,
      profile: data,
      message: 'Profile updated successfully.'
    };
  },

  /**
   * Listen to Supabase Auth state changes
   */
  onAuthStateChange: (callback) => {
    if (!isSupabaseConfigured() || !supabase) {
      return { unsubscribe: () => {} };
    }

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          authStorage.setToken(session.access_token);
          const profile = await supabaseAuth.getProfile().catch(() => null);
          callback(event, session, profile);
        }
      } else if (event === 'SIGNED_OUT') {
        authStorage.clear();
        callback(event, null, null);
      } else {
        callback(event, session, null);
      }
    });

    return listener.subscription;
  }
};
