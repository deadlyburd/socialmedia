/**
 * Payload CMS Configuration — v3
 *
 * Runs inside your existing Next.js App Router.
 * Admin UI: /admin
 * API: /api/payload/...
 *
 * Collections:
 *   - blogs: AI-generated blog posts
 *   - media: Images, videos, documents (R2-backed)
 *   - tenants: Client businesses (extends existing Supabase tenants)
 */

import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { r2Storage } from "./payload/r2-storage";
import path from "path";
import { fileURLToPath } from "url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  // Admin UI
  admin: {
    user: "users",
    meta: {
      titleSuffix: "— Social Automations",
    },
  },

  // Collections
  collections: [
    // Users (admins who log into Payload admin)
    {
      slug: "users",
      auth: true,
      admin: { useAsTitle: "email" },
      fields: [
        { name: "name", type: "text" },
      ],
    },

    // Blog Posts — replaces content_assets for blog content
    {
      slug: "blogs",
      admin: {
        useAsTitle: "title",
        defaultColumns: ["title", "tenant", "status", "qualityScore", "publishedAt", "createdAt"],
      },
      access: { read: () => true },
      fields: [
        { name: "title", type: "text", required: true },
        { name: "slug", type: "text", required: true, unique: true, admin: { position: "sidebar" } },
        { name: "excerpt", type: "textarea" },
        {
          name: "body",
          type: "richText",
          editor: lexicalEditor(),
        },
        { name: "seoTitle", type: "text", admin: { position: "sidebar" } },
        { name: "seoDescription", type: "textarea", admin: { position: "sidebar" } },
        { name: "tags", type: "json", admin: { position: "sidebar" } },
        {
          name: "status",
          type: "select",
          options: ["draft", "published", "archived"],
          defaultValue: "draft",
          admin: { position: "sidebar" },
        },
        {
          name: "tenant",
          type: "relationship",
          relationTo: "tenants",
          required: true,
          admin: { position: "sidebar" },
        },
        { name: "qualityScore", type: "number", min: 0, max: 100, admin: { position: "sidebar" } },
        { name: "competitorCount", type: "number", admin: { position: "sidebar" } },
        { name: "topicSearched", type: "text", admin: { position: "sidebar" } },
        { name: "publishedAt", type: "date", admin: { position: "sidebar" } },
      ],
    },

    // Media — images, videos, documents (stored on Cloudflare R2)
    {
      slug: "media",
      upload: {
        staticDir: path.resolve(dirname, "public/media"),
        adminThumbnail: "thumbnail",
        mimeTypes: ["image/*", "video/*", "application/pdf"],
        // 500MB limit for videos
        limits: { fileSize: 500 * 1024 * 1024 },
      },
      fields: [
        { name: "alt", type: "text" },
        { name: "tenant", type: "relationship", relationTo: "tenants", admin: { position: "sidebar" } },
      ],
    },

    // Tenants — client businesses
    {
      slug: "tenants",
      admin: { useAsTitle: "name" },
      access: { read: () => true },
      fields: [
        { name: "name", type: "text", required: true },
        { name: "slug", type: "text", required: true, unique: true },
        { name: "email", type: "email" },
        { name: "niche", type: "text" },
        { name: "websiteUrl", type: "text" },
        { name: "apiKey", type: "text", admin: { readOnly: true } },
        {
          name: "tier",
          type: "select",
          options: ["free", "starter", "growth", "empire", "custom"],
          defaultValue: "free",
          admin: { position: "sidebar" },
        },
        {
          name: "status",
          type: "select",
          options: ["active", "trial", "suspended", "cancelled"],
          defaultValue: "trial",
          admin: { position: "sidebar" },
        },
        { name: "automationConfig", type: "json", admin: { position: "sidebar" } },
      ],
    },
  ],

  // Database — connect to your existing Supabase Postgres
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL ?? process.env.SUPABASE_URL
        ? `postgresql://postgres.mlqvcvgzjwkfaonepsdl:${process.env.SUPABASE_SERVICE_KEY}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
        : "postgresql://localhost:5432/social_automations",
    },
    // Use a schema prefix so Payload tables don't clash with existing ones
    schemaName: "payload",
  }),

  // Rich text editor
  editor: lexicalEditor(),

  // TypeScript output
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },

  // Disable Payload's built-in CORS — your Hono router handles it
  cors: [],

  // Sharp for image processing (used by media uploads)
  sharp: true,

  // Secret for encrypting API keys, auth tokens, etc.
  secret: process.env.PAYLOAD_SECRET ?? "replace-me-in-production",

  // Plugins
  plugins: [
    // Cloudflare R2 storage for video/image uploads
    r2Storage({
      collections: {
        media: { disablePayloadAccessControl: true },
      },
    }),
  ],
});
