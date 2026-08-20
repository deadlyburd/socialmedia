/**
 * Storage Service — Cloudflare R2 (S3-compatible) with a hard guard against base64 bloat.
 *
 * Priority:
 *   1. Vercel Blob (BLOB_READ_WRITE_TOKEN set + @vercel/blob installed)
 *   2. Cloudflare R2 (AWS Signature V4 — NOT Basic auth)
 *   3. Base64 data URL — ONLY for small files (< 1 MB). Larger files throw.
 *
 * Rationale: storing a 500 MB video as base64 would write ~670 MB of text into a
 * Postgres TEXT column and corrupt the DB. Never fall back to base64 for real media.
 */

export interface StorageResult {
  url: string;
  key: string;
  size: number;
  contentType: string;
}

/** Hard ceiling for the base64 fallback — anything larger is refused. */
const BASE64_MAX_BYTES = 1 * 1024 * 1024;

async function uploadToR2(params: {
  data: Buffer | ArrayBuffer | Uint8Array;
  filename: string;
  contentType: string;
  tenantId: string;
}): Promise<StorageResult> {
  const r2Endpoint = process.env.R2_ENDPOINT;
  const r2Bucket = process.env.R2_BUCKET;
  const r2Key = process.env.R2_ACCESS_KEY_ID;
  const r2Secret = process.env.R2_SECRET_ACCESS_KEY;
  const r2Public = process.env.R2_PUBLIC_URL;

  if (!r2Endpoint || !r2Bucket || !r2Key || !r2Secret) {
    throw new Error("R2 not configured");
  }

  const key = `${params.tenantId}/${Date.now()}_${params.filename}`;
  const data = params.data instanceof Buffer
    ? params.data
    : Buffer.from(params.data);

  const url = `${r2Endpoint}/${r2Bucket}/${key}`;
  const uploadRes = await signedPut(url, data, params.contentType, r2Key, r2Secret);

  if (!uploadRes.ok) {
    throw new Error(`R2 upload failed: ${uploadRes.status}`);
  }

  const publicUrl = r2Public
    ? `${r2Public}/${key}`
    : `${r2Endpoint}/${r2Bucket}/${key}`;

  return { url: publicUrl, key, size: data.length, contentType: params.contentType };
}

function uploadToBase64(params: {
  data: Buffer | ArrayBuffer | Uint8Array;
  filename: string;
  contentType: string;
  tenantId: string;
}): StorageResult {
  const buffer = params.data instanceof Buffer
    ? params.data
    : Buffer.from(params.data);
  const base64 = buffer.toString("base64");
  const url = `data:${params.contentType};base64,${base64}`;

  return {
    url,
    key: `${params.tenantId}/${params.filename}`,
    size: buffer.length,
    contentType: params.contentType,
  };
}

/**
 * Smart upload: Vercel Blob (optional) → R2 (SigV4) → base64 (small files only).
 * Throws for files that are too large to store as base64 and have no real backend.
 */
export async function uploadFile(params: {
  data: Buffer | ArrayBuffer | Uint8Array;
  filename: string;
  contentType: string;
  tenantId: string;
}): Promise<StorageResult> {
  // Try Vercel Blob at runtime (if installed and configured)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      // Use require at runtime to avoid build-time resolution
      const blobModule = await (new Function("return import('@vercel/blob')")()) as any;
      const key = `${params.tenantId}/${Date.now()}_${params.filename}`;
      const blob = await blobModule.put(key, params.data, {
        access: "public",
        contentType: params.contentType,
        addRandomSuffix: true,
      });
      return {
        url: blob.url,
        key: blob.pathname,
        size: blob.size,
        contentType: blob.contentType,
      };
    } catch (err: any) {
      if (err.code === "ERR_MODULE_NOT_FOUND" || err.message?.includes("Cannot find")) {
        console.warn("[storage] @vercel/blob not installed — run: npm install @vercel/blob");
      } else {
        console.warn(`[storage] Vercel Blob upload failed: ${err.message}`);
      }
    }
  }

  // Try R2 (S3-compatible, AWS SigV4)
  if (
    process.env.R2_ENDPOINT &&
    process.env.R2_BUCKET &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  ) {
    try {
      return await uploadToR2(params);
    } catch (err: any) {
      console.warn(`[storage] R2 upload failed: ${err.message}`);
    }
  }

  // Fallback to base64 — small files only
  const size = params.data instanceof Buffer
    ? params.data.length
    : params.data.byteLength;
  if (size > BASE64_MAX_BYTES) {
    throw new Error(
      `File is ${Math.round(size / 1024 / 1024)} MB — too large to store as base64. Configure R2 or Vercel Blob.`,
    );
  }

  return uploadToBase64(params);
}

export async function deleteFile(key: string): Promise<boolean> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blobModule = await (new Function("return import('@vercel/blob')")()) as any;
      await blobModule.del(key);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

export const storage = {
  upload: uploadFile,
  delete: deleteFile,
};

// ── AWS Signature V4 (S3-compatible) ─────────────────────────────────

/**
 * Sign and PUT an object to Cloudflare R2 using AWS Signature V4.
 * R2's S3 API requires SigV4 — Basic auth is NOT supported.
 */
async function signedPut(
  url: string,
  body: Buffer,
  contentType: string,
  accessKeyId: string,
  secretAccessKey: string,
): Promise<Response> {
  try {
    const { createHmac, createHash } = await import("node:crypto");

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
    const kDate = createHmac("sha256", `AWS4${secretAccessKey}`)
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

    const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        Authorization: authorization,
      },
      body: body as any,
    });
  } catch (err: any) {
    console.warn("[storage] Signing failed:", err.message ?? err);
    return new Response(null, { status: 500 });
  }
}
