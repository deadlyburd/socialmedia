/**
 * Cloudflare R2 Storage Adapter for Payload CMS
 *
 * Setup:
 *   1. Create R2 bucket in Cloudflare Dashboard
 *   2. Create API token with Object Read & Write
 *   3. Fill in env vars below
 *   4. Add this plugin to payload.config.ts plugins array
 *
 * For video uploads specifically:
 *   - R2 has zero egress fees → perfect for video serving
 *   - Supports up to 5TB per object
 *   - Use a custom domain + CDN for production
 */

import { s3Storage } from "@payloadcms/storage-s3";
import type { CollectionSlug } from "payload";

interface R2StorageOptions {
  /** Which collections should use R2 storage */
  collections: Partial<Record<CollectionSlug, { disablePayloadAccessControl?: boolean }>>;
}

export function r2Storage({ collections }: R2StorageOptions) {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    console.warn("[payload-r2] R2 env vars not set — media will be stored locally");
    // Return a no-op plugin when R2 isn't configured
    return (config: any) => config;
  }

  return s3Storage({
    collections: Object.fromEntries(
      Object.entries(collections).map(([slug, opts]) => [
        slug,
        {
          ...opts,
          generateFileURL: ({ filename, prefix }: { filename: string; prefix?: string }) => {
            const cdnDomain = publicUrl ?? endpoint;
            const pathPrefix = prefix ? `/${prefix}` : "";
            return `${cdnDomain}${pathPrefix}/${filename}`;
          },
        },
      ]),
    ) as any,
    bucket,
    config: {
      endpoint,
      region: "auto", // Cloudflare R2 requires 'auto'
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    },
  });
}
