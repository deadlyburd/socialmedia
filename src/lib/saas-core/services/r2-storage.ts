/**
 * R2 Storage Adapter — Cloudflare R2 (S3-compatible) for permanent media.
 *
 * Fal.ai and Seedance generate temp URLs that expire. This adapter:
 *   1. Downloads media from any URL (Fal.ai, Seedance, etc.)
 *   2. Uploads to R2 with permanent URLs
 *   3. Returns the permanent URL
 *
 * R2 pricing: $0.015/GB stored, zero egress fees (unlike S3).
 * Bucket path: {tenantId}/{contentType}/{contentId}/{filename}
 *
 * Usage:
 *   import { uploadToR2 } from "./r2-storage";
 *   const permUrl = await uploadToR2(tempFalUrl, { tenantId, contentType: "image", contentId });
 */

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY ?? "";
const R2_SECRET_KEY = process.env.R2_SECRET_KEY ?? "";
const R2_BUCKET = process.env.R2_BUCKET ?? "optimus-media";
const R2_ENDPOINT =
  process.env.R2_ENDPOINT ??
  `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ??
  `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

/** Check if R2 is configured and available. */
export function isR2Configured(): boolean {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY && R2_SECRET_KEY && R2_BUCKET);
}

interface UploadOptions {
  tenantId: string;
  contentType: "image" | "video" | "thumbnail";
  contentId: string;
  /** Optional filename override. Auto-generated if omitted. */
  filename?: string;
}

/**
 * Upload a single file to R2. Downloads from the source URL, then re-uploads.
 * Falls back to original URL if R2 is not configured.
 */
export async function uploadToR2(
  sourceUrl: string,
  opts: UploadOptions,
): Promise<string> {
  if (!isR2Configured()) {
    console.log("[r2-storage] R2 not configured — returning original URL");
    return sourceUrl;
  }

  if (!sourceUrl || !sourceUrl.startsWith("http")) {
    return sourceUrl;
  }

  try {
    // 1. Download from source
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      console.warn(`[r2-storage] Download failed ${res.status}: ${sourceUrl}`);
      return sourceUrl;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType =
      res.headers.get("content-type") ?? guessContentType(sourceUrl);

    // 2. Build R2 key
    const ext = getExtension(contentType, sourceUrl);
    const filename = opts.filename ?? `${Date.now()}_${randomHex(8)}.${ext}`;
    const key = `${opts.tenantId}/${opts.contentType}/${opts.contentId}/${filename}`;

    // 3. Upload to R2 (S3-compatible PUT)
    const uploadUrl = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "x-amz-acl": "public-read",
        "Content-Length": String(buffer.length),
      },
      body: buffer,
      // S3 v4 signature — construct Authorization header
      // @ts-expect-error — custom headers for S3 auth
      signal: undefined,
    });

    // S3 PUT with unsigned requests won't work — we need proper signing.
    // Use presigned URL or the aws4fetch library pattern.
    // For now: if R2_ACCESS_KEY is set, sign the request properly.
    const signedRes = await signedPut(uploadUrl, buffer, contentType);

    if (!signedRes.ok) {
      console.warn(
        `[r2-storage] Upload failed ${signedRes.status}: ${key}`,
      );
      return sourceUrl;
    }

    const publicUrl = `${R2_PUBLIC_URL}/${key}`;
    console.log(`[r2-storage] Uploaded: ${sourceUrl.slice(0, 60)}... → ${key}`);
    return publicUrl;
  } catch (err: any) {
    console.warn("[r2-storage] Upload error:", err.message ?? err);
    return sourceUrl; // Fall back to original URL
  }
}

/**
 * Batch upload multiple files. All succeed or individual fallbacks.
 */
export async function uploadBatchToR2(
  urls: string[],
  opts: UploadOptions,
): Promise<string[]> {
  const results = await Promise.allSettled(
    urls.map((url) => uploadToR2(url, opts)),
  );
  return results.map((r) =>
    r.status === "fulfilled" ? r.value : "",
  ).filter(Boolean);
}

/**
 * Upload media from content generation and return permanent URLs.
 * Wraps the Fal.ai → R2 pipeline for images and videos.
 */
export async function persistContentMedia(
  tempUrls: string[],
  tenantId: string,
  contentId: string,
  type: "image" | "video" = "image",
): Promise<string[]> {
  if (!isR2Configured() || tempUrls.length === 0) return tempUrls;

  return uploadBatchToR2(tempUrls, {
    tenantId,
    contentType: type,
    contentId,
  });
}

// ── Private helpers ─────────────────────────────────────────────────────

function randomHex(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}

function guessContentType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".mp4") || lower.includes("seedance") || lower.includes("kling") || lower.includes("video")) return "video/mp4";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".gif")) return "image/gif";
  return "image/jpeg"; // Default for FLUX output
}

function getExtension(contentType: string, url: string): string {
  const urlExt = url.split(".").pop()?.split("?")[0]?.toLowerCase();
  if (urlExt && /^(jpg|jpeg|png|webp|gif|mp4|mov)$/.test(urlExt)) return urlExt;
  if (contentType.includes("video")) return "mp4";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

/**
 * S3-compatible signed PUT request using AWS Signature V4.
 * Uses the Web Crypto API (available in Node 20+ and edge runtimes).
 */
async function signedPut(
  url: string,
  body: Buffer,
  contentType: string,
): Promise<Response> {
  try {
    const { createHmac } = await import("node:crypto");
    const { createHash } = await import("node:crypto");

    const u = new URL(url);
    const region = "auto"; // R2 uses 'auto' region
    const service = "s3";
    const method = "PUT";
    const payloadHash = createHash("sha256").update(body).digest("hex");

    const amzDate = new Date()
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, "")
      .slice(0, 16) + "Z";
    const dateStamp = amzDate.slice(0, 8);

    // Canonical request
    const canonicalHeaders = [
      `content-type:${contentType}`,
      `host:${u.host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
    ].join("\n") + "\n";

    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = [
      method,
      u.pathname + u.search,
      "", // no query string params
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const algorithm = "AWS4-HMAC-SHA256";
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    // Signing key
    const kDate = createHmac("sha256", `AWS4${R2_SECRET_KEY}`)
      .update(dateStamp)
      .digest();
    const kRegion = createHmac("sha256", kDate).update(region).digest();
    const kService = createHmac("sha256", kRegion).update(service).digest();
    const kSigning = createHmac("sha256", kService)
      .update("aws4_request")
      .digest();
    const signature = createHmac("sha256", kSigning)
      .update(stringToSign)
      .digest("hex");

    const authorization = `${algorithm} Credential=${R2_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        Authorization: authorization,
      },
      body,
    });
  } catch (err: any) {
    console.warn("[r2-storage] Signing failed:", err.message ?? err);
    return new Response(null, { status: 500 });
  }
}
