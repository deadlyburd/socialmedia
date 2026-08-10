/**
 * AuthService — user lifecycle, onboarding state, tenant linking.
 *
 * NOW WITH REAL AUTH:
 *   - Google OAuth delegates to lib/auth/google.ts (real token exchange)
 *   - Password hashing delegates to lib/auth/password.ts
 *   - JWT session tokens via lib/auth/jwt.ts
 *   - httpOnly cookies via lib/auth/session.ts
 *
 * The mock createSession method remains for backward compat during migration.
 * New code should use the lib/auth module directly.
 */

import { hashPassword as hash, verifyPassword as verify } from "../../auth/password";
import { getAdminClient } from "../../supabase/admin";

export interface VerifiedGoogleUser {
  googleId: string;
  email: string;
  name: string;
  picture: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  avatar: string;
  provider: "google" | "email";
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface OnboardingState {
  userId: string;
  step: "niche" | "website" | "done";
  selectedNiche: string | null;
  packSlug: string | null;
  businessDescription: string | null;
  websiteUrl: string | null;
  websiteAnalysis: WebsiteAnalysis | null;
}

export interface UxuIFlaw {
  category: "performance" | "seo" | "mobile" | "accessibility" | "design" | "ux";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  recommendation: string;
}

export interface ContentCalendarDay {
  date: string;
  dayOfWeek: string;
  platform: string;
  contentType: string;
  category: "inspirational" | "educational" | "promotional";
  topic: string;
  hook: string;
  hashtags: string[];
}

export interface WebsiteAnalysis {
  url: string;
  title: string;
  description: string;
  industry: string;
  keywords: string[];
  products: string[];
  socialLinks: Record<string, string>;
  suggestedPack: string;
  confidence: number;
  uxFlaws: UxuIFlaw[];
  uxScore: number;
  contentCalendar: ContentCalendarDay[];
}

export class AuthService {
  sessions: Map<string, AuthSession> = new Map();
  onboardingStates: Map<string, OnboardingState> = new Map();
  private userTenants: Map<string, string[]> = new Map();

  // ── Google OAuth (REAL — delegates to lib/auth/google.ts) ──────────

  /** Process a verified Google user into a session. */
  async handleGoogleUser(googleUser: VerifiedGoogleUser): Promise<{
    session: AuthSession;
    isNewUser: boolean;
  }> {
    // Check if user exists in Supabase
    const supabase = getAdminClient();
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("email", googleUser.email.toLowerCase().trim())
      .maybeSingle();

    const isNewUser = !existingUser;

    let userId: string;
    if (existingUser) {
      userId = existingUser.id as string;
    } else {
      userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Persist new Google user
      const { error } = await supabase.from("users").insert({
        id: userId,
        email: googleUser.email.toLowerCase().trim(),
        name: googleUser.name,
        password_hash: null, // Google users have no password
        onboarding_complete: false,
        created_at: new Date().toISOString(),
      });
      if (error) console.error("[AuthService] Google user insert error:", error.message);
    }

    const session: AuthSession = {
      userId,
      email: googleUser.email,
      name: googleUser.name,
      avatar: googleUser.picture,
      provider: "google",
      accessToken: `tok_${Date.now()}`,
      refreshToken: `ref_${Date.now()}`,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      createdAt: (existingUser?.created_at as string) ?? new Date().toISOString(),
    };

    this.sessions.set(session.userId, session);

    if (isNewUser) {
      this.onboardingStates.set(session.userId, {
        userId: session.userId,
        step: "niche",
        selectedNiche: null,
        packSlug: null,
        businessDescription: null,
        websiteUrl: null,
        websiteAnalysis: null,
      });
      // Persist onboarding
      supabase.from("onboarding").upsert({
        user_id: userId,
        step: "niche",
        updated_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.error("[AuthService] onboarding insert error:", error.message);
      });
    } else {
      // Load existing onboarding state from Supabase
      const { data: existingOnboarding } = await supabase
        .from("onboarding")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingOnboarding) {
        this.onboardingStates.set(userId, {
          userId,
          step: (existingOnboarding.step as OnboardingState["step"]) ?? "niche",
          selectedNiche: (existingOnboarding.selected_niche as string) ?? null,
          packSlug: (existingOnboarding.pack_slug as string) ?? null,
          businessDescription: (existingOnboarding.business_description as string) ?? null,
          websiteUrl: (existingOnboarding.website_url as string) ?? null,
          websiteAnalysis: (existingOnboarding.website_analysis as WebsiteAnalysis) ?? null,
        });
      }
    }

    return { session, isNewUser };
  }

  // ── Email/Password (REAL — delegates to lib/auth/password.ts) ──────

  /** Create a new user with email + password. */
  createEmailUser(params: {
    email: string;
    plaintextPassword: string;
    name: string;
  }): { userId: string; passwordHash: string } {
    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const passwordHash = hash(params.plaintextPassword);

    const session: AuthSession = {
      userId,
      email: params.email,
      name: params.name,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(params.name)}&background=random`,
      provider: "email",
      accessToken: `tok_${userId}`,
      refreshToken: `ref_${userId}`,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    this.sessions.set(userId, session);
    this.onboardingStates.set(userId, {
      userId,
      step: "niche",
      selectedNiche: null,
      packSlug: null,
      businessDescription: null,
      websiteUrl: null,
      websiteAnalysis: null,
    });

    // Persist to Supabase (fire-and-forget — user-store handles the main insert)
    const supabase = getAdminClient();
    supabase.from("onboarding").upsert({
      user_id: userId,
      step: "niche",
      updated_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.error("[AuthService] onboarding upsert error:", error.message);
    });

    return { userId, passwordHash };
  }

  /** Verify email + password. Returns session if valid, null if wrong password. */
  verifyEmailLogin(email: string, plaintext: string, storedHash: string): AuthSession | null {
    if (!verify(plaintext, storedHash)) return null;
    return this.findSessionByEmail(email) ?? null;
  }

  // ── Session management ─────────────────────────────────────────────

  /** Create or ensure a session exists for a user (used by signup flow). */
  ensureSession(userId: string, email: string, name: string): AuthSession {
    const existing = this.sessions.get(userId);
    if (existing) return existing;

    const session: AuthSession = {
      userId,
      email,
      name,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
      provider: "email",
      accessToken: `tok_${userId}`,
      refreshToken: `ref_${userId}`,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(userId, session);

    this.onboardingStates.set(userId, {
      userId,
      step: "niche",
      selectedNiche: null,
      packSlug: null,
      businessDescription: null,
      websiteUrl: null,
      websiteAnalysis: null,
    });

    return session;
  }

  getSession(userId: string): AuthSession | undefined {
    return this.sessions.get(userId);
  }

  getSessionByToken(token: string): AuthSession | undefined {
    for (const s of this.sessions.values()) {
      if (s.accessToken === token) return s;
    }
    return undefined;
  }

  getOnboardingState(userId: string): OnboardingState | undefined {
    return this.onboardingStates.get(userId);
  }

  isOnboardingComplete(userId: string): boolean {
    // Check in-memory first
    const state = this.onboardingStates.get(userId);
    if (state?.step === "done") return true;

    // Check Supabase (async fire-and-forget — will be ready next call)
    const supabase = getAdminClient();
    supabase.from("onboarding")
      .select("step")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data?.step === "done") {
          const existing = this.onboardingStates.get(userId);
          if (existing) existing.step = "done";
        }
      });

    return false;
  }

  // ── Tenant linking ─────────────────────────────────────────────────

  linkTenant(userId: string, tenantId: string): void {
    const tenants = this.userTenants.get(userId) ?? [];
    if (!tenants.includes(tenantId)) {
      tenants.push(tenantId);
      this.userTenants.set(userId, tenants);
    }

    // Persist to Supabase
    const supabase = getAdminClient();
    supabase.from("tenants").update({ owner_id: userId }).eq("id", tenantId)
      .then(({ error }) => {
        if (error) console.error("[AuthService] linkTenant persist error:", error.message);
      });
  }

  getUserTenants(userId: string): string[] {
    const mem = this.userTenants.get(userId) ?? [];
    if (mem.length > 0) return mem;

    // Fallback: resolve by email (Supabase Auth UUID differs from old custom IDs)
    const session = this.sessions.get(userId);
    if (session) {
      // Direct hit — shouldn't reach here but handle it
      return [];
    }

    // Search all sessions for matching email
    // (initUserStore stores sessions by custom ID, but auth gives us Supabase UUID)
    for (const [id, s] of this.sessions) {
      if (s.email === userId || id === userId) {
        return this.userTenants.get(id) ?? [];
      }
    }

    return [];
  }

  /** Resolve any user identifier (UUID, custom ID, or email) to the stored user ID. */
  resolveUserId(identifier: string): string | null {
    // Direct match
    if (this.sessions.has(identifier)) return identifier;

    // Search by email
    for (const [id, s] of this.sessions) {
      if (s.email === identifier) return id;
    }

    return null;
  }

  /** Check Supabase for tenant ownership — used as fallback when in-memory is empty. */
  async getUserTenantsFromDB(userId: string): Promise<string[]> {
    try {
      const supabase = getAdminClient();
      const { data, error } = await supabase
        .from("tenants")
        .select("id")
        .eq("owner_id", userId);

      if (error || !data) return [];
      return data.map((t: any) => t.id as string);
    } catch {
      return [];
    }
  }

  // ── Onboarding steps ───────────────────────────────────────────────

  private ensureOnboarding(userId: string): OnboardingState {
    const existing = this.onboardingStates.get(userId);
    if (existing) return existing;
    const state: OnboardingState = {
      userId,
      step: "niche",
      selectedNiche: null,
      packSlug: null,
      businessDescription: null,
      websiteUrl: null,
      websiteAnalysis: null,
    };
    this.onboardingStates.set(userId, state);
    return state;
  }

  setNiche(
    userId: string,
    niche: string,
    packSlug: string,
    businessDescription?: string,
  ): OnboardingState {
    const state = this.ensureOnboarding(userId);
    state.selectedNiche = niche;
    state.packSlug = packSlug;
    state.businessDescription = businessDescription ?? null;
    state.step = "website";

    // Persist to Supabase
    const supabase = getAdminClient();
    supabase.from("onboarding").upsert({
      user_id: userId,
      step: "website",
      selected_niche: niche,
      pack_slug: packSlug,
      business_description: businessDescription ?? null,
      updated_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.error("[AuthService] setNiche persist error:", error.message);
    });

    return { ...state };
  }

  async setWebsite(userId: string, url: string): Promise<OnboardingState> {
    const state = this.ensureOnboarding(userId);
    state.websiteUrl = url;
    state.websiteAnalysis = await this.analyzeWebsite(url);
    state.step = "done";

    // Persist to Supabase
    const supabase = getAdminClient();
    supabase.from("onboarding").upsert({
      user_id: userId,
      step: "done",
      website_url: url,
      website_analysis: state.websiteAnalysis,
      updated_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.error("[AuthService] setWebsite persist error:", error.message);
    });

    return { ...state };
  }

  /** Save website URL only — no analysis. Used by simplified onboarding. */
  setWebsiteUrlOnly(userId: string, url: string): OnboardingState {
    const state = this.ensureOnboarding(userId);
    state.websiteUrl = url;
    state.websiteAnalysis = null; // No analysis
    return { ...state };
  }

  markOnboardingComplete(userId: string): void {
    const state = this.ensureOnboarding(userId);
    state.step = "done";
  }

  // ── Private helpers ────────────────────────────────────────────────

  private findSessionByEmail(email: string): AuthSession | undefined {
    for (const s of this.sessions.values()) {
      if (s.email === email) return s;
    }
    return undefined;
  }

  private async analyzeWebsite(url: string): Promise<WebsiteAnalysis> {
    // Try Firecrawl first, fall back to mock data
    try {
      const { websiteScraper } = await import("./website-scraper");
      const result = await websiteScraper.analyze(url);
      if (result) return result;
    } catch (err: any) {
      console.log("[AuthService] Firecrawl unavailable, using mock:", err.message);
    }

    // Mock fallback
    const normalized = url.replace(/https?:\/\//, "").replace(/\/$/, "");
    const domain = normalized.split(".")[0] ?? "business";
    const displayDomain = domain.charAt(0).toUpperCase() + domain.slice(1);

    return {
      url: `https://${normalized}`,
      title: `${displayDomain} — Official Site`,
      description: `${displayDomain} offers premium services and experiences.`,
      industry: "general",
      keywords: [],
      products: [],
      socialLinks: {},
      suggestedPack: "custom",
      confidence: 0.5,
      uxFlaws: [],
      uxScore: 70,
      contentCalendar: [],
    };
  }
}
