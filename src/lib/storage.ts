/**
 * Storage Service — Cloudflare R2 with Base64 fallback.
 *
 * Priority:
 *   1. Cloudflare R2 (R2_* env vars set)
 *   2. Base64 data URL (always works, limited scalability)
 *
 * To add Vercel Blob: npm install @vercel/blob, then set BLOB_READ_WRITE_TOKEN
 */

export interface StorageResult {
  url: string;
  key: string;
  size: number;
  contentType: string;
}

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

  const uploadRes = await fetch(`${r2Endpoint}/${r2Bucket}/${key}`, {
    method: "PUT",
    headers: {
      "Content-Type": params.contentType,
      Authorization: `Basic ${Buffer.from(`${r2Key}:${r2Secret}`).toString("base64")}`,
    },
    body: data,
  });

  if (!uploadRes.ok) {
    throw new Error(`R2 upload failed: ${uploadRes.status}`);
  }

  const url = r2Public
    ? `${r2Public}/${key}`
    : `${r2Endpoint}/${r2Bucket}/${key}`;

  return { url, key, size: data.length, contentType: params.contentType };
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
 * Smart upload: tries R2 → tries Vercel Blob (if installed at runtime) → Base64.
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

  // Try R2
  if (
    process.env.R2_ENDPOINT &&
    process.env.R2_BUCKET &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  ) {
    try {
      return await uploadToR2(params);
    } catch (err: any) {
      console.warn(`[storage] R2 upload failed, falling back to base64: ${err.message}`);
    }
  }

  // Fallback to base64
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
