/**
 * Test the E-E-A-T blog pipeline end-to-end.
 *
 * Usage: npx tsx src/scripts/test-blog-pipeline.ts
 *
 * Requires: FIRECRAWL_API_KEY, DEEPSEEK_API_KEY or OPENAI_API_KEY in .env.local
 */

// Load env vars from .env.local
import { readFileSync } from "fs";
import { join } from "path";
const envPath = join(process.cwd(), ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !match[1]!.startsWith("#")) {
      process.env[match[1]!.trim()] = match[2]!.trim().replace(/^["']|["']$/g, "");
    }
  }
} catch { /* .env.local not found, use existing env */ }

async function main() {
  console.log("🧪 Testing E-E-A-T Blog Pipeline\n");
  console.log("=" .repeat(60));

  // Dynamically import the pipeline
  const { generateSingleBlog } = await import("../lib/saas-core/services/blog-automation");

  const testConfig = {
    tenantId: "test-tenant",
    niche: "social media marketing for small businesses",
    websiteUrl: "https://example.com",
    websiteType: "custom" as const,
    blogTone: "authoritative yet approachable",
    targetKeywords: ["social media strategy", "small business marketing", "organic social media growth"],
    competitorUrls: [] as string[],
    authorName: "Alex Rivera",
    authorRole: "Social Media Strategist",
    companyName: "Social Automations",
  };

  console.log(`Niche: ${testConfig.niche}`);
  console.log(`Author: ${testConfig.authorName}, ${testConfig.authorRole}`);
  console.log(`Keywords: ${testConfig.targetKeywords.join(", ")}`);
  console.log("=" .repeat(60));

  const topic = "how small businesses can grow organically on social media without paid ads";

  console.log(`\n📝 Topic: "${topic}"`);
  console.log("\n⏳ Generating... (this takes 30-60 seconds)\n");

  const startTime = Date.now();
  const result = await generateSingleBlog(topic, testConfig);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✅ Done in ${elapsed}s\n`);
  console.log("=" .repeat(60));

  if (result.error || !result.blog) {
    console.log(`\n❌ FAILED: ${result.error ?? "No blog generated"}`);
    process.exit(1);
  }

  const blog = result.blog;

  console.log(`\n📊 RESULTS:`);
  console.log(`   Title: ${blog.title}`);
  console.log(`   Slug: ${blog.slug}`);
  console.log(`   Excerpt: ${blog.excerpt?.slice(0, 120)}...`);
  console.log(`   Body length: ${blog.body.length} chars`);
  console.log(`   Competitors analyzed: ${result.competitorCount}`);
  console.log(`   Quality Score: ${blog.qualityScore ?? "N/A"}/100`);
  console.log(`   Pushed to website: ${result.pushed}`);
  console.log(`   Tags: ${blog.tags?.join(", ")}`);
  console.log(`   SEO Title: ${blog.seoTitle}`);
  console.log(`   SEO Description: ${blog.seoDescription}`);

  if (blog.humanizationLog?.length) {
    console.log(`\n🔧 Humanization Changes (${blog.humanizationLog.length}):`);
    blog.humanizationLog.forEach((change, i) => {
      console.log(`   ${i + 1}. ${change}`);
    });
  }

  console.log(`\n📄 BLOG CONTENT (first 2000 chars):`);
  console.log("─".repeat(60));
  // Strip HTML tags for clean terminal output
  const plainText = blog.body
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  console.log(plainText.slice(0, 2000));
  if (plainText.length > 2000) console.log("... (truncated)");
  console.log("─".repeat(60));

  // Check for banned phrases
  const BANNED = [
    "in today's fast-paced world",
    "in the ever-evolving landscape",
    "plays a pivotal role",
    "in conclusion",
    "game-changer",
    "unprecedented times",
  ];

  const foundBanned = BANNED.filter(phrase =>
    blog.body.toLowerCase().includes(phrase.toLowerCase())
  );

  if (foundBanned.length > 0) {
    console.log(`\n⚠️  BANNED PHRASES FOUND: ${foundBanned.join(", ")}`);
  } else {
    console.log(`\n✅ No banned AI phrases detected`);
  }

  // E-E-A-T signal check
  const hasFirstPerson = /\b(we|our|I|my)\b.*\b(tested|found|discovered|learned|tried|implemented|client)\b/i.test(blog.body);
  const hasData = /\d+%|\d+ (increase|decrease|growth|improvement|reduction)/i.test(blog.body);
  const hasLinks = (blog.body.match(/<a\s+href=/g) ?? []).length;

  console.log(`\n🔍 E-E-A-T Signal Check:`);
  console.log(`   First-person experience: ${hasFirstPerson ? "✅" : "❌"}`);
  console.log(`   Data/statistics: ${hasData ? "✅" : "❌"}`);
  console.log(`   External links: ${hasLinks} (target: 2-4)`);

  console.log(`\n✅ Pipeline test complete!`);
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
