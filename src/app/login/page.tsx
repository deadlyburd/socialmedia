/**
 * Premium login page — light theme with spotlight card.
 * Google OAuth + email/password with password strength checker.
 */

"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Zap } from "lucide-react";

export default function LoginPage() {
  const { login, signup, loginWithGoogle, isLoading, error, clearError } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });

  // Forgot password flow
  const [forgotStep, setForgotStep] = useState<"email" | "code" | "success">("email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const passwordChecks = useMemo(() => ({
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
    allValid: password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password),
  }), [password]);

  // Don't auto-redirect — let the user see the login page first

  const displayError = localError ?? error;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    clearError();
    try {
      if (mode === "signup") {
        if (!name.trim()) { setLocalError("Please enter your name."); setSubmitting(false); return; }
        if (!passwordChecks.minLength) { setLocalError("Password must be at least 8 characters."); setSubmitting(false); return; }
        if (!passwordChecks.hasUpper) { setLocalError("Password must include at least one uppercase letter."); setSubmitting(false); return; }
        if (!passwordChecks.hasNumber) { setLocalError("Password must include at least one number."); setSubmitting(false); return; }
        if (!passwordChecks.hasSymbol) { setLocalError("Password must include at least one symbol (e.g. !@#$%)."); setSubmitting(false); return; }
        await signup(email, password, name.trim());
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setLocalError(err.message ?? "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = () => {
    setLocalError(null);
    loginWithGoogle().catch((err: any) => {
      setLocalError(err.message ?? "Google sign-in failed.");
    });
  };

  // ── Forgot Password Handlers ──────────────────────────────────────

  const handleForgotPassword = async () => {
    if (!resetEmail.trim()) { setForgotError("Please enter your email."); return; }
    setForgotSubmitting(true); setForgotError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Failed to send reset code.");
      setGeneratedCode(data.data.resetCode);
      setForgotStep("code");
    } catch (err: any) {
      setForgotError(err.message ?? "Something went wrong.");
    } finally { setForgotSubmitting(false); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) { setForgotError("Password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(newPassword)) { setForgotError("Password must include at least one uppercase letter."); return; }
    if (!/[0-9]/.test(newPassword)) { setForgotError("Password must include at least one number."); return; }
    if (newPassword !== confirmPassword) { setForgotError("Passwords do not match."); return; }
    setForgotSubmitting(true); setForgotError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim(), code: resetCode, newPassword }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Failed to reset password.");
      setForgotStep("success");
    } catch (err: any) {
      setForgotError(err.message ?? "Something went wrong.");
    } finally { setForgotSubmitting(false); }
  };

  const resetForgotFlow = () => {
    setForgotStep("email");
    setResetEmail("");
    setResetCode("");
    setNewPassword("");
    setConfirmPassword("");
    setForgotError(null);
    setGeneratedCode(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 noise-overlay">
      {/* Subtle grid lines — reused from hero-section */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.06]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute h-px bg-foreground/15"
            style={{ top: `${16.67 * (i + 1)}%`, left: 0, right: 0 }}
          />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute w-px bg-foreground/15"
            style={{ left: `${12.5 * (i + 1)}%`, top: 0, bottom: 0 }}
          />
        ))}
      </div>

      <div className="w-full max-w-[440px]">
        {/* Logo — matches navigation logo pattern */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-card border border-foreground/10 mb-5">
            <Zap className="w-6 h-6 text-foreground" />
          </div>
          <h1 className="text-2xl font-display tracking-tight text-foreground">Social Automations</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {mode === "forgot" ? "Reset your password" : "Agency content management platform"}
          </p>
        </div>

        {/* Premium card with spotlight — follows CTA section border-box pattern */}
        <div
          className="relative border border-foreground/10 rounded-2xl bg-card p-8 shadow-lg"
          onMouseMove={handleMouseMove}
        >
          {/* Mouse-follow spotlight effect — reused from CTA section */}
          <div
            className="absolute inset-0 rounded-2xl opacity-[0.04] pointer-events-none transition-opacity duration-300"
            style={{
              background: `radial-gradient(600px circle at ${mousePosition.x}% ${mousePosition.y}%, rgba(0,0,0,0.12), transparent 40%)`,
            }}
          />

          <div className="relative z-10">
            {mode === "forgot" ? (
              /* ── Forgot Password View ──────────────────────────── */
              <div className="space-y-4">
                {forgotStep === "email" && (
                  <>
                    <p className="text-sm text-muted-foreground text-center">
                      Enter your email and we&apos;ll send you a reset code.
                    </p>
                    <div>
                      <label className="block text-xs font-mono text-muted-foreground mb-1.5 ml-1">Email</label>
                      <input
                        type="email" placeholder="you@company.com" value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        disabled={forgotSubmitting} autoFocus
                        className="w-full px-4 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all duration-200 disabled:opacity-40"
                      />
                    </div>
                    {forgotError && (
                      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/5 border border-destructive/10 text-destructive text-xs">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        {forgotError}
                      </div>
                    )}
                    <button
                      onClick={handleForgotPassword}
                      disabled={forgotSubmitting}
                      className="w-full py-3 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-all duration-200 disabled:opacity-40"
                    >
                      {forgotSubmitting ? "Sending..." : "Send Reset Code"}
                    </button>
                  </>
                )}

                {forgotStep === "code" && (
                  <>
                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
                      <p className="text-sm font-medium text-emerald-700">Reset code sent!</p>
                      <p className="text-xs text-emerald-600/70 mt-1">
                        For demo purposes, your code is: <span className="font-mono font-bold text-emerald-800">{generatedCode}</span>
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-muted-foreground mb-1.5 ml-1">Reset Code</label>
                      <input
                        type="text" placeholder="000000" value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        disabled={forgotSubmitting} autoFocus maxLength={6}
                        className="w-full px-4 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all duration-200 tracking-[0.3em] text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-muted-foreground mb-1.5 ml-1">New Password</label>
                      <input
                        type="password" placeholder="••••••••" value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={forgotSubmitting}
                        className="w-full px-4 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all duration-200 disabled:opacity-40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-muted-foreground mb-1.5 ml-1">Confirm Password</label>
                      <input
                        type="password" placeholder="••••••••" value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={forgotSubmitting}
                        className="w-full px-4 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all duration-200 disabled:opacity-40"
                      />
                    </div>
                    {forgotError && (
                      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/5 border border-destructive/10 text-destructive text-xs">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        {forgotError}
                      </div>
                    )}
                    <button
                      onClick={handleResetPassword}
                      disabled={forgotSubmitting}
                      className="w-full py-3 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-all duration-200 disabled:opacity-40"
                    >
                      {forgotSubmitting ? "Resetting..." : "Reset Password"}
                    </button>
                  </>
                )}

                {forgotStep === "success" && (
                  <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Password updated!</p>
                      <p className="text-sm text-muted-foreground mt-1">You can now log in with your new password.</p>
                    </div>
                    <button
                      onClick={() => { resetForgotFlow(); setMode("login"); }}
                      className="w-full py-3 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-all duration-200"
                    >
                      Back to Login
                    </button>
                  </div>
                )}

                {/* Back link */}
                {forgotStep !== "success" && (
                  <p className="text-center text-sm text-muted-foreground">
                    <button
                      onClick={() => { resetForgotFlow(); setMode("login"); }}
                      type="button"
                      className="text-foreground/60 hover:text-foreground font-medium transition-colors"
                    >
                      ← Back to login
                    </button>
                  </p>
                )}
              </div>
            ) : (
              <>
            {/* Google OAuth button */}
            <button
              onClick={handleGoogle}
              disabled={submitting}
              className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-full border border-border/50 bg-background hover:bg-accent text-foreground text-sm font-medium transition-all duration-200 disabled:opacity-40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {mode === "signup" ? "Sign up with Google" : "Continue with Google"}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-xs text-muted-foreground/50 font-medium">or</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === "signup" && (
                <div>
                  <label className="block text-xs font-mono text-muted-foreground mb-1.5 ml-1">Full Name</label>
                  <input
                    type="text" placeholder="Alex Johnson" value={name}
                    onChange={(e) => setName(e.target.value)} disabled={submitting}
                    onFocus={() => setFocused("name")} onBlur={() => setFocused(null)}
                    autoComplete="name"
                    className="w-full px-4 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all duration-200 disabled:opacity-40"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-mono text-muted-foreground mb-1.5 ml-1">Email</label>
                <input
                  type="email" placeholder="you@company.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required disabled={submitting}
                  onFocus={() => setFocused("email")} onBlur={() => setFocused(null)}
                  autoComplete="email"
                  className="w-full px-4 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all duration-200 disabled:opacity-40"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-muted-foreground mb-1.5 ml-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"} placeholder="••••••••" value={password}
                    onChange={(e) => setPassword(e.target.value)} required disabled={submitting}
                    onFocus={() => setFocused("password")} onBlur={() => setFocused(null)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="w-full px-4 py-2.5 pr-11 bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all duration-200 disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Forgot password link (login mode only) */}
              {mode === "login" && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setMode("forgot"); setForgotStep("email"); setResetEmail(email); setLocalError(null); clearError(); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Password strength checker (signup mode only) */}
              {mode === "signup" && password.length > 0 && (
                <div className="space-y-1 px-1">
                  {[
                    { key: "minLength", label: "At least 8 characters", met: passwordChecks.minLength },
                    { key: "hasUpper", label: "One uppercase letter", met: passwordChecks.hasUpper },
                    { key: "hasNumber", label: "One number", met: passwordChecks.hasNumber },
                    { key: "hasSymbol", label: "One symbol", met: passwordChecks.hasSymbol },
                  ].map((check) => (
                    <div key={check.key} className="flex items-center gap-2 text-xs">
                      <span className={check.met ? "text-emerald-600" : "text-muted-foreground/30"}>
                        {check.met ? "✓" : "○"}
                      </span>
                      <span className={check.met ? "text-emerald-600/80" : "text-muted-foreground/40"}>
                        {check.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {displayError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/5 border border-destructive/10 text-destructive text-xs">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {displayError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="relative w-full py-3 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    Please wait...
                  </span>
                ) : mode === "login" ? "Login" : "Create Account"}
              </button>
            </form>

            {/* Toggle login/signup */}
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>New to Social Automations? <button onClick={() => { setMode("signup"); clearError(); setLocalError(null); }} type="button" className="text-foreground/60 hover:text-foreground font-medium transition-colors">Create an account</button></>
              ) : (
                <>Already have an account? <button onClick={() => { setMode("login"); clearError(); setLocalError(null); }} type="button" className="text-foreground/60 hover:text-foreground font-medium transition-colors">Login</button></>
              )}
            </p>
              </>
            )}
          </div>

          {/* Decorative border corners — reused from CTA section */}
          <div className="absolute top-0 right-0 w-24 h-24 border-b border-l border-border/10 rounded-tr-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-24 h-24 border-t border-r border-border/10 rounded-bl-2xl pointer-events-none" />
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground/40">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
