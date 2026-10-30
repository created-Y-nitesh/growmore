/**
 * GrowMore Server-Side Supabase Service
 * Initializes the administrative Supabase client using privileged SUPABASE_SERVICE_ROLE_KEY.
 * STRICT SECURITY REQUIREMENT: THIS KEY MUST NEVER BE EXPOSED TO BROWSER CODE OR GIT.
 */

const { createClient } = require('@supabase/supabase-js');

class SupabaseService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL || null;
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
    this.jwtSecret = process.env.SUPABASE_JWT_SECRET || null;
    this.client = null;

    if (this.isConfigured()) {
      try {
        this.client = createClient(this.supabaseUrl, this.serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });
      } catch (err) {
        console.warn('[Supabase Service] Administrative client initialization warning:', err.message);
      }
    }
  }

  isConfigured() {
    if (!this.supabaseUrl || !this.serviceRoleKey) return false;
    if (this.supabaseUrl.includes('placeholder') || this.serviceRoleKey.includes('placeholder')) return false;
    try {
      new URL(this.supabaseUrl);
      return true;
    } catch {
      return false;
    }
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      urlConfigured: Boolean(this.supabaseUrl),
      serviceRoleKeyConfigured: Boolean(this.serviceRoleKey),
      jwtSecretConfigured: Boolean(this.jwtSecret),
      missingVariables: [
        !this.supabaseUrl ? 'SUPABASE_URL' : null,
        !this.serviceRoleKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null
      ].filter(Boolean)
    };
  }

  /**
   * Verify an incoming Supabase JWT token server-side
   */
  async verifyUserToken(accessToken) {
    if (!this.client || !accessToken) return null;
    try {
      const { data, error } = await this.client.auth.getUser(accessToken);
      if (error || !data?.user) return null;
      return data.user;
    } catch {
      return null;
    }
  }

  /**
   * Fetch customer profile via service-role
   */
  async getProfile(userId) {
    if (!this.client) return null;
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}

module.exports = new SupabaseService();
