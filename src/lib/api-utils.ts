/**
 * API Utilities — unified error handling, validation, and logging.
 *
 * Usage:
 *   import { validate, apiError, logger, schemas } from "@/lib/api-utils";
 *   const body = await validate(c, schemas.createClient);
 */

import { z } from "zod";
import type { Context } from "hono";

// ── Structured Logger ──────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry);
}

export const logger = {
  debug(msg: string, ctx?: Record<string, unknown>) {
    if (process.env.NODE_ENV === "production") return;
    console.debug(formatLog({ timestamp: new Date().toISOString(), level: "debug", message: msg, context: ctx }));
  },
  info(msg: string, ctx?: Record<string, unknown>) {
    console.log(formatLog({ timestamp: new Date().toISOString(), level: "info", message: msg, context: ctx }));
  },
  warn(msg: string, ctx?: Record<string, unknown>) {
    console.warn(formatLog({ timestamp: new Date().toISOString(), level: "warn", message: msg, context: ctx }));
  },
  error(msg: string, ctx?: Record<string, unknown>) {
    console.error(formatLog({ timestamp: new Date().toISOString(), level: "error", message: msg, context: ctx }));
  },
};

// ── API Error Types ────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "INTERNAL_ERROR",
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toResponse() {
    return {
      success: false as const,
      error: this.message,
      code: this.code,
      ...(process.env.NODE_ENV !== "production" && this.details
        ? { details: this.details }
        : {}),
    };
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, message, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class AuthError extends ApiError {
  constructor(message: string = "Authentication required") {
    super(401, message, "AUTH_ERROR");
    this.name = "AuthError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = "Access denied") {
    super(403, message, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = "Resource not found") {
    super(404, message, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = "Too many requests. Try again later.") {
    super(429, message, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

// ── Zod Validation Helper ─────────────────────────────────────────────

/**
 * Validate request body against a Zod schema.
 * Returns parsed data or throws ValidationError.
 */
export async function validate<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ValidationError("Invalid JSON in request body");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    throw new ValidationError("Validation failed", details);
  }

  return result.data;
}

/**
 * Validate query parameters against a Zod schema.
 */
export function validateQuery<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): z.infer<T> {
  const query = Object.fromEntries(c.req.queries().entries());
  const result = schema.safeParse(query);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    throw new ValidationError("Invalid query parameters", details);
  }
  return result.data;
}

// ── Hono Error Handler ────────────────────────────────────────────────

/**
 * Global error handler for Hono apps.
 * Catches ApiError subclasses and formats them properly.
 */
export function honoErrorHandler(err: Error, c: Context) {
  if (err instanceof ApiError) {
    logger.warn(`[api] ${err.name}: ${err.message}`, {
      code: err.code,
      statusCode: err.statusCode,
      path: c.req.path,
      method: c.req.method,
    });
    return c.json(err.toResponse(), { status: err.statusCode as 400 | 401 | 402 | 403 | 404 | 429 });
  }

  // Unexpected errors
  logger.error(`[api] Unhandled error: ${err.message}`, {
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });

  return c.json(
    {
      success: false,
      error:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message,
      code: "INTERNAL_ERROR",
    },
    { status: 500 },
  );
}

// ── Common Zod Schemas ───────────────────────────────────────────────

export const schemas = {
  /** Email + password login */
  login: z.object({
    email: z.string().email("Valid email is required"),
    password: z.string().min(1, "Password is required"),
  }),

  /** Email + password signup */
  signup: z.object({
    email: z.string().email("Valid email is required"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must include an uppercase letter")
      .regex(/[0-9]/, "Password must include a number")
      .regex(/[^A-Za-z0-9]/, "Password must include a symbol"),
    name: z.string().min(1, "Name is required").max(100),
  }),

  /** Forgot password */
  forgotPassword: z.object({
    email: z.string().email("Valid email is required"),
  }),

  /** Reset password */
  resetPassword: z.object({
    email: z.string().email("Valid email is required"),
    code: z.string().length(6, "Reset code must be 6 digits"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must include an uppercase letter")
      .regex(/[0-9]/, "Password must include a number"),
  }),

  /** Create client */
  createClient: z.object({
    name: z.string().min(1, "Name is required").max(100),
    email: z.string().email("Valid email is required"),
    businessName: z.string().min(1, "Business name is required").max(200),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must include an uppercase letter")
      .regex(/[0-9]/, "Password must include a number"),
  }),

  /** Onboarding complete */
  onboardingComplete: z.object({
    niche: z.string().min(1, "Industry is required"),
    businessName: z.string().min(1, "Business name is required").max(200),
    websiteUrl: z
      .string()
      .url("Must be a valid URL starting with http:// or https://")
      .optional()
      .or(z.literal("")),
  }),

  /** Connect platform */
  connectPlatform: z.object({
    platform: z.enum(["instagram", "tiktok", "facebook", "linkedin", "youtube", "pinterest", "twitter"]),
  }),

  /** Post content to platform */
  postContent: z.object({
    platform: z.enum(["instagram", "tiktok", "facebook", "linkedin", "youtube", "pinterest", "twitter"]),
  }),

  /** Update content production status (admin review / approve / deliver / reject) */
  contentStatus: z.object({
    status: z.enum(["planned", "draft", "in_review", "revision_requested", "approved", "delivered", "rejected"]),
    note: z.string().max(1000).optional(),
  }),

  /** Blog automation config */
  blogAutomationConfig: z.object({
    blogEnabled: z.boolean().optional(),
    niche: z.string().min(1).max(200).optional(),
    websiteUrl: z.string().url().optional().or(z.literal("")),
    websiteType: z.enum(["wordpress", "webhook", "custom"]).optional(),
    wordpressUrl: z.string().url().optional().or(z.literal("")),
    websiteApiKey: z.string().optional(),
    blogTone: z.string().max(100).optional(),
    targetKeywords: z.array(z.string()).max(20).optional(),
    competitorUrls: z.array(z.string().url()).max(10).optional(),
    authorName: z.string().max(100).optional(),
    authorRole: z.string().max(100).optional(),
    companyName: z.string().max(200).optional(),
    webhookUrl: z.string().url().optional().or(z.literal("")),
    dailyAutoEnabled: z.boolean().optional(),
  }),

  /** Billing checkout */
  billingCheckout: z.object({
    priceId: z.string().min(1, "Price ID is required"),
    tenantId: z.string().min(1, "Tenant ID is required"),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  }),

  /** Pagination */
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),

  /** Client requirements / brief */
  brief: z.object({
    brandVoice: z.string().max(2000).nullable().optional(),
    targetAudience: z.string().max(2000).nullable().optional(),
    goals: z.string().max(2000).nullable().optional(),
    contentPillars: z.array(z.object({
      name: z.string().min(1),
      share: z.number().min(0).max(100).optional(),
    })).optional(),
    platforms: z.array(z.object({
      platform: z.string().min(1),
      handle: z.string().optional(),
      cadence: z.string().optional(),
    })).optional(),
    styleGuidelines: z.record(z.unknown()).optional(),
    notes: z.string().max(2000).nullable().optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
  }),

  /** Content strategy / plan */
  strategy: z.object({
    name: z.string().min(1).max(200),
    pillars: z.array(z.object({
      name: z.string().min(1),
      share: z.number().min(0).max(100).optional(),
    })).optional(),
    formatMix: z.record(z.number()).optional(),
    cadence: z.record(z.string()).optional(),
    timelineStart: z.string().nullable().optional(),
    timelineEnd: z.string().nullable().optional(),
    status: z.enum(["active", "archived"]).optional(),
  }),

  /** Invite a team member */
  teamInvite: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email("Valid email is required"),
    role: z.enum(["owner", "manager", "creator", "editor"]),
    password: z.string().min(8).optional(),
  }),

  /** Update a team member's role */
  teamUpdate: z.object({
    role: z.enum(["owner", "manager", "creator", "editor"]),
  }),

  /** Assign a team member to a content asset */
  assignContent: z.object({
    assigneeId: z.string().nullable(),
  }),

  /** Client requests changes to content */
  requestChanges: z.object({
    comment: z.string().min(1, "A comment is required").max(2000),
  }),

  /** Add a comment to a content asset */
  comment: z.object({
    body: z.string().min(1, "Comment is required").max(2000),
  }),
} as const;
