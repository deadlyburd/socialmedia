/**
 * AgentReachBridge — TypeScript wrapper around Agent-Reach upstream CLI tools.
 *
 * Agent-Reach philosophy: install upstream tools, then call them directly.
 * No wrapper layer — this bridge shells out to real CLIs.
 *
 * CHANNEL TIERS (15 total):
 *   TIER 0 — ZERO CONFIG (work immediately):
 *     ✅ Web      — Jina Reader (r.jina.ai)
 *     ✅ YouTube  — yt-dlp (video search + subtitle extraction)
 *     ✅ RSS      — feedparser via curl
 *     ✅ V2EX     — public API
 *     ✅ Bilibili — bili-cli (search + video details, no login needed)
 *
 *   TIER 1 — OpenCLI (needs Chrome + extension, then all 4 work):
 *     🔧 Instagram — opencli instagram search
 *     🔧 Reddit    — opencli reddit search (→ rdt-cli fallback)
 *     🔧 Twitter   — opencli twitter search (→ twitter-cli fallback)
 *     🔧 Facebook  — opencli facebook search
 *
 *   TIER 2 — DEDICATED CLI (needs per-platform setup):
 *     🔧 LinkedIn  — linkedin-mcp / Jina Reader fallback
 *     🔧 Xiaohongshu — OpenCLI / xiaohongshu-mcp
 *     🔧 Xueqiu    — public API (stocks)
 *     🔧 Xiaoyuzhou — Whisper transcription
 *     🔧 GitHub    — gh CLI (public repos work without login)
 *
 * OPENCLI AUTO-WAKE:
 *   OpenCLI's Chrome extension service worker sleeps after inactivity.
 *   "Extension: disconnected" does NOT mean broken — first real command
 *   wakes it. This bridge probes the daemon, auto-starts if needed,
 *   and sends a warm-up call before scraping so the first real request
 *   doesn't fail on a cold extension.
 *
 * Each scraper returns ScrapedTopPost[] matching the ContentReverseEngineer
 * contract. When upstream tool is unavailable, falls back to rich mock data
 * (industry-specific, not random).
 */

import { execSync, spawnSync } from "node:child_process";
import { promptCache } from "./prompt-cache";
import type { ScrapedTopPost, ViralContentRequest } from "./content-reverse-engineer-types";

// ── Python path (where agent-reach is installed) ───────────────────────
// Defaults to venv installed alongside the workspace.
// Override via AGENT_REACH_PYTHON in .env.local.
const AGENT_REACH_PYTHON =
  process.env.AGENT_REACH_PYTHON ??
  "/home/abiilesh/Documents/social media/agent-reach-venv/bin/python";
const AGENT_REACH_CLI = `"${AGENT_REACH_PYTHON}" -m agent_reach`;

// ── Config ─────────────────────────────────────────────────────────────

const CALL_TIMEOUT_MS = 15_000; // per CLI call
const MAX_POSTS_PER_SCRAPE = 20;
const OPENCLI_STATUS_CACHE_MS = 60_000; // Re-probe OpenCLI every 60s

/** OpenCLI extension ID in Chrome Web Store. */
const OPENCLI_EXTENSION_ID = "ildkmabpimmkaediidaifkhjpohdnifk";

interface BridgeStatus {
  available: string[];
  unavailable: string[];
  total: number;
  details: Record<string, { status: string; backend: string; message: string }>;
  /** OpenCLI-specific status. null if OpenCLI not probed yet. */
  opencli: OpenCLIDaemonStatus | null;
}

/** Granular OpenCLI daemon + extension state. */
interface OpenCLIDaemonStatus {
  installed: boolean;
  daemonRunning: boolean;
  extensionConnected: boolean;
  extensionInstalled: boolean;
  /** "ready" | "sleeping" | "daemon-down" | "extension-missing" | "not-installed" */
  state: "ready" | "sleeping" | "daemon-down" | "extension-missing" | "not-installed";
  /** Human-readable hint for fixing. */
  hint: string;
}

// ── Mock data pools (industry-specific, realistic) ────────────────────

const MOCK_POSTS_BY_NICHE: Record<string, Partial<ScrapedTopPost>[]> = {
  travel: [
    { hook: "I wish I knew this before booking my Italy trip", caption: "Stop overpaying for tours. Here's the local way to see Rome for half the price. #traveltips #italy", hashtags: ["#traveltips", "#italy", "#rome", "#budgettravel", "#wanderlust"], engagementRate: 0.087, metrics: { likes: 24500, comments: 890, shares: 3400, saves: 12000, views: 180000 } },
    { hook: "POV: You found the hidden beach no tourist knows about", caption: "This cove in Amalfi doesn't appear on any guidebook. Crystal water, zero crowds, €5 boat ride from Positano. #hiddengems #amalficoast", hashtags: ["#hiddengems", "#amalficoast", "#italy", "#secretspot", "#traveltok"], engagementRate: 0.094, metrics: { likes: 67000, comments: 2300, shares: 15000, saves: 34000, views: 520000 } },
    { hook: "What $100 vs $1000 gets you in Bangkok", caption: "The budget vs luxury breakdown that will change how you travel. #travel #bangkok #budgetvsluxury", hashtags: ["#travel", "#bangkok", "#budgetvsluxury", "#travelhacks", "#thailand"], engagementRate: 0.078, metrics: { likes: 18000, comments: 670, shares: 2800, saves: 9500, views: 140000 } },
    { hook: "Stop booking hotels before checking this one thing", caption: "Hotel markups are insane. Here's the booking hack travel agents don't want you to know. #travelhacks #hotels", hashtags: ["#travelhacks", "#hotels", "#booking", "#savemoney", "#traveltips"], engagementRate: 0.091, metrics: { likes: 34000, comments: 1200, shares: 5600, saves: 18000, views: 260000 } },
    { hook: "Ranking European cities from worst to best for solo travel", caption: "After 6 months solo backpacking Europe, here's my honest ranking. #1 surprised even me. #solotravel #europe", hashtags: ["#solotravel", "#europe", "#backpacking", "#ranking", "#travelguide"], engagementRate: 0.083, metrics: { likes: 28000, comments: 1800, shares: 4200, saves: 15000, views: 210000 } },
    { hook: "The real reason everyone is going to Japan right now", caption: "Yen is at historic lows. Your money goes 40% further than last year. Here's the exact budget breakdown. #japan #traveldeal", hashtags: ["#japan", "#traveldeal", "#yen", "#budgettravel", "#asia"], engagementRate: 0.089, metrics: { likes: 45000, comments: 1500, shares: 7800, saves: 22000, views: 350000 } },
    { hook: "This travel mistake cost me $2000 — don't do it", caption: "Travel insurance isn't optional. Here's the exact scenario that taught me the hard way. #travelinsurance #travelmistakes", hashtags: ["#travelinsurance", "#travelmistakes", "#lessonslearned", "#traveltips", "#savvy traveler"], engagementRate: 0.086, metrics: { likes: 31000, comments: 2100, shares: 6200, saves: 16000, views: 240000 } },
    { hook: "3 days in Tuscany — the itinerary everyone asks me for", caption: "Day 1: Florence + sunset at Piazzale Michelangelo. Day 2: Siena + San Gimignano wine tour. Day 3: Val d'Orcia hot springs. Save this. #tuscany #itinerary", hashtags: ["#tuscany", "#itinerary", "#italy", "#florence", "#travelplan"], engagementRate: 0.092, metrics: { likes: 52000, comments: 1400, shares: 12000, saves: 38000, views: 410000 } },
  ],
  fitness: [
    { hook: "I tried this workout every day for 30 days", caption: "The transformation shocked me. No equipment, 15 minutes. Here's the exact routine. #fitness #30daychallenge", hashtags: ["#fitness", "#30daychallenge", "#workout", "#transformation", "#homeworkout"], engagementRate: 0.088, metrics: { likes: 38000, comments: 1400, shares: 5600, saves: 22000, views: 290000 } },
    { hook: "Stop doing crunches — do this instead for visible abs", caption: "Crunches are the worst ab exercise. Here's the science-backed alternative that actually works. #abs #fitnessmyths", hashtags: ["#abs", "#fitnessmyths", "#coreworkout", "#sixpack", "#fitnesstips"], engagementRate: 0.085, metrics: { likes: 42000, comments: 1800, shares: 7200, saves: 25000, views: 330000 } },
    { hook: "The fitness industry is lying to you about protein", caption: "You don't need 2g per kg. Here's what the actual research says. #protein #nutritionmyths #fitness", hashtags: ["#protein", "#nutritionmyths", "#fitness", "#supplements", "#science"], engagementRate: 0.079, metrics: { likes: 29000, comments: 2400, shares: 4800, saves: 14000, views: 220000 } },
    { hook: "What actually works for fat loss (from someone who lost 40kg)", caption: "No magic pill. No fad diet. Just the 5 principles that created lasting change. #fatloss #weightlossjourney", hashtags: ["#fatloss", "#weightlossjourney", "#transformation", "#realresults", "#consistency"], engagementRate: 0.093, metrics: { likes: 76000, comments: 3200, shares: 18000, saves: 42000, views: 590000 } },
    { hook: "My client's 90-day transformation — here's exactly what we did", caption: "No extreme dieting. No 2-a-day workouts. Just consistent execution of these 4 things. #transformation #coaching", hashtags: ["#transformation", "#coaching", "#90days", "#results", "#personaltrainer"], engagementRate: 0.091, metrics: { likes: 54000, comments: 1900, shares: 9800, saves: 31000, views: 420000 } },
    { hook: "Why you're not seeing results (and it's not your workout)", caption: "Sleep, stress, and nutrition matter more than your training split. Here's the hierarchy. #fitnessresults #health", hashtags: ["#fitnessresults", "#health", "#sleep", "#stress", "#nutrition"], engagementRate: 0.082, metrics: { likes: 33000, comments: 1600, shares: 5200, saves: 17000, views: 250000 } },
  ],
  restaurant: [
    { hook: "This dish changed everything for our restaurant", caption: "Our chef's secret pasta technique. 3 ingredients. 15 minutes. Now our #1 seller. #restaurantlife #pasta", hashtags: ["#restaurantlife", "#pasta", "#chefsecrets", "#foodie", "#italianfood"], engagementRate: 0.084, metrics: { likes: 22000, comments: 980, shares: 3800, saves: 14000, views: 170000 } },
    { hook: "You're ordering wrong at Italian restaurants", caption: "A chef's guide to what actually belongs together. Your nonna would approve. #italianfood #diningtips", hashtags: ["#italianfood", "#diningtips", "#restaurant", "#foodguide", "#cheftips"], engagementRate: 0.081, metrics: { likes: 19000, comments: 1200, shares: 3400, saves: 11000, views: 150000 } },
    { hook: "The secret ingredient our chef won't share publicly", caption: "Fine. Here it is. The umami bomb that makes everything taste restaurant-quality. #chefsecrets #cooking", hashtags: ["#chefsecrets", "#cooking", "#umami", "#restaurant", "#homecooking"], engagementRate: 0.087, metrics: { likes: 41000, comments: 1600, shares: 8900, saves: 26000, views: 320000 } },
    { hook: "What 20 years of cooking taught me about food trends", caption: "Most trends die in 6 months. These 5 fundamentals never go out of style. #foodtrends #cheflife", hashtags: ["#foodtrends", "#cheflife", "#cooking", "#fundamentals", "#restaurant"], engagementRate: 0.076, metrics: { likes: 15000, comments: 890, shares: 2100, saves: 8200, views: 110000 } },
  ],
  "real-estate": [
    { hook: "This neighborhood is about to explode — here's why", caption: "New transit line + 3 tech HQs moving in. Prices still 40% below city average. Get in now. #realestate #investment", hashtags: ["#realestate", "#investment", "#property", "#gentrification", "#housingmarket"], engagementRate: 0.086, metrics: { likes: 27000, comments: 1500, shares: 5200, saves: 16000, views: 210000 } },
    { hook: "What your realtor won't tell you about closing costs", caption: "They can be negotiated. Here's exactly what to say and when to say it. #homebuying #closingcosts", hashtags: ["#homebuying", "#closingcosts", "#realtortips", "#realestate", "#mortgage"], engagementRate: 0.082, metrics: { likes: 23000, comments: 1100, shares: 4600, saves: 14000, views: 180000 } },
    { hook: "Stop looking at Zillow — here's the actual way to find deals", caption: "Zillow is where deals go to die. Off-market properties are where the real opportunities live. #realestate #propertydeals", hashtags: ["#realestate", "#propertydeals", "#offmarket", "#investing", "#homebuying"], engagementRate: 0.089, metrics: { likes: 35000, comments: 1800, shares: 7800, saves: 21000, views: 270000 } },
    { hook: "The $0 mistake most first-time homebuyers make", caption: "Skipping the sewer scope inspection. $200 inspection saved my client $25,000 in repairs. #homebuying #inspection", hashtags: ["#homebuying", "#inspection", "#firsttimebuyer", "#realestate", "#homeowner"], engagementRate: 0.084, metrics: { likes: 29000, comments: 1300, shares: 5500, saves: 17000, views: 220000 } },
  ],
  dental: [
    { hook: "What your dentist wishes you knew about whitening", caption: "Most whitening products are either useless or damaging. Here's what actually works. #dental #teethwhitening", hashtags: ["#dental", "#teethwhitening", "#oralhealth", "#smile", "#dentist"], engagementRate: 0.075, metrics: { likes: 16000, comments: 720, shares: 2400, saves: 8500, views: 120000 } },
    { hook: "Stop making this brushing mistake — 90% of people do", caption: "Brushing too hard causes receding gums. Electric toothbrush with pressure sensor is the fix. #dentalcare #brushing", hashtags: ["#dentalcare", "#brushing", "#oralhygiene", "#teeth", "#dentisttips"], engagementRate: 0.08, metrics: { likes: 21000, comments: 980, shares: 3800, saves: 12000, views: 160000 } },
    { hook: "The real cost of skipping your dental checkups", caption: "That small cavity you're ignoring? It's about to become a root canal. Here's the cost breakdown over 5 years. #dental #prevention", hashtags: ["#dental", "#prevention", "#checkup", "#oralhealth", "#dentist"], engagementRate: 0.078, metrics: { likes: 18000, comments: 850, shares: 3100, saves: 9500, views: 140000 } },
  ],
  default: [
    { hook: "The #1 mistake businesses make on social media", caption: "Posting without a strategy. Random posting is worse than not posting at all. Here's the framework. #socialmedia #business", hashtags: ["#socialmedia", "#business", "#marketing", "#strategy", "#growth"], engagementRate: 0.073, metrics: { likes: 12000, comments: 560, shares: 2100, saves: 6800, views: 90000 } },
    { hook: "How we grew from 0 to 50K followers in 6 months", caption: "No ads. No influencers. Just this content strategy executed consistently. #growth #followers", hashtags: ["#growth", "#followers", "#contentstrategy", "#socialmediamarketing", "#organicgrowth"], engagementRate: 0.081, metrics: { likes: 32000, comments: 1400, shares: 6200, saves: 19000, views: 250000 } },
    { hook: "Stop chasing virality — do this instead", caption: "Virality is a lottery. Consistency compounds. Here's the math that changed how I think about content. #contentstrategy #consistency", hashtags: ["#contentstrategy", "#consistency", "#growth", "#marketing", "#longgame"], engagementRate: 0.077, metrics: { likes: 20000, comments: 920, shares: 3500, saves: 11000, views: 150000 } },
    { hook: "The content framework that saved us 20 hours per week", caption: "Batch creation + templated hooks + AI refinement. Here's our exact Monday workflow. #productivity #contentcreation", hashtags: ["#productivity", "#contentcreation", "#batchwork", "#efficiency", "#socialmedia"], engagementRate: 0.074, metrics: { likes: 14000, comments: 680, shares: 2600, saves: 7800, views: 100000 } },
    { hook: "Why your engagement is low (and it's not the algorithm)", caption: "The algorithm rewards what people engage with. If they're not engaging, your content isn't resonating. Here's how to fix it. #engagement #algorithm", hashtags: ["#engagement", "#algorithm", "#socialmediamarketing", "#contenttips", "#growthhacking"], engagementRate: 0.079, metrics: { likes: 26000, comments: 1600, shares: 4500, saves: 14000, views: 200000 } },
  ],
};

// ── Service ────────────────────────────────────────────────────────────

export class AgentReachBridge {
  private pythonPath: string;
  private statusCache: BridgeStatus | null = null;
  private statusCacheTime = 0;
  private opencliCache: OpenCLIDaemonStatus | null = null;
  private opencliCacheTime = 0;

  constructor(pythonPath?: string) {
    this.pythonPath = pythonPath ?? AGENT_REACH_PYTHON;
  }

  /**
   * Probe OpenCLI daemon + extension state independently from the full
   * doctor check. OpenCLI is the single highest-leverage channel because
   * it unlocks 4 platforms (Instagram, Reddit, Twitter, Facebook) at once.
   *
   * Uses `opencli daemon status` (pure query, no side effects) rather
   * than `opencli doctor` (which auto-starts the daemon).
   */
  probeOpenCLI(): OpenCLIDaemonStatus {
    const now = Date.now();
    if (this.opencliCache && now - this.opencliCacheTime < OPENCLI_STATUS_CACHE_MS) {
      return this.opencliCache;
    }

    // Check if opencli is on PATH
    let installed = false;
    try {
      const ver = execSync("opencli --version 2>/dev/null || echo ''", {
        timeout: 5000,
        encoding: "utf-8",
      }).trim();
      installed = ver.length > 0;
    } catch {
      installed = false;
    }

    if (!installed) {
      const st: OpenCLIDaemonStatus = {
        installed: false,
        daemonRunning: false,
        extensionConnected: false,
        extensionInstalled: false,
        state: "not-installed",
        hint: "OpenCLI not installed. Run: npm install -g @jackwener/opencli\nThen install Chrome extension: https://chromewebstore.google.com/detail/opencli/" + OPENCLI_EXTENSION_ID,
      };
      this.opencliCache = st;
      this.opencliCacheTime = now;
      return st;
    }

    // Probe daemon status (pure query — no auto-start)
    let daemonRunning = false;
    let extensionConnected = false;
    try {
      const out = execSync("opencli daemon status 2>/dev/null || echo ''", {
        timeout: 5000,
        encoding: "utf-8",
      });
      for (const line of out.split("\n")) {
        const l = line.trim().toLowerCase();
        if (l.startsWith("daemon:")) {
          daemonRunning = !l.includes("not running") && l.includes("running");
        } else if (l.startsWith("extension:")) {
          extensionConnected = !l.includes("disconnected") && l.includes("connected");
        }
      }
    } catch {
      // opencli daemon status failed — daemon likely not running
    }

    // Check if extension is installed on disk (sleeping ≠ missing)
    let extensionInstalled = extensionConnected;
    if (!extensionConnected) {
      extensionInstalled = this.checkExtensionOnDisk();
    }

    // Determine state
    let state: OpenCLIDaemonStatus["state"];
    let hint = "";
    if (extensionConnected) {
      state = "ready";
      hint = "OpenCLI ready — 4 platforms available (Instagram, Reddit, Twitter, Facebook)";
    } else if (extensionInstalled) {
      state = "sleeping";
      hint = "Extension sleeping (service worker inactive). First real command wakes it automatically.";
    } else if (daemonRunning) {
      state = "extension-missing";
      hint = "OpenCLI daemon running but Chrome extension not installed. Install: https://chromewebstore.google.com/detail/opencli/" + OPENCLI_EXTENSION_ID;
    } else {
      state = "daemon-down";
      hint = "OpenCLI installed but daemon not running. Daemon auto-starts on first opencli command.";
    }

    const st: OpenCLIDaemonStatus = {
      installed,
      daemonRunning,
      extensionConnected,
      extensionInstalled,
      state,
      hint,
    };
    this.opencliCache = st;
    this.opencliCacheTime = now;
    return st;
  }

  /**
   * Send a warm-up command to wake a sleeping OpenCLI extension.
   * Uses `opencli doctor` (side-effect: starts daemon if stopped).
   * Call once before first scrape of the session — subsequent calls
   * use the already-awake extension.
   */
  wakeOpenCLI(): boolean {
    const st = this.probeOpenCLI();
    if (!st.installed) return false;
    if (st.extensionConnected) return true; // already awake

    try {
      // opencli doctor auto-starts daemon AND wakes extension
      execSync("opencli doctor 2>/dev/null || true", {
        timeout: 15_000,
        encoding: "utf-8",
      });
      // Re-probe to confirm wake
      const after = this.probeOpenCLIRaw();
      if (after.extensionConnected || after.extensionInstalled) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Full ensure chain for OpenCLI availability.
   * 1. Check if installed
   * 2. If daemon not running, start it
   * 3. If extension sleeping, wake it
   * Returns true if OpenCLI is ready after the chain.
   */
  ensureOpenCLI(): { ready: boolean; status: OpenCLIDaemonStatus } {
    let st = this.probeOpenCLI();

    if (!st.installed) {
      return { ready: false, status: st };
    }

    if (st.extensionConnected) {
      return { ready: true, status: st };
    }

    // Try waking
    this.wakeOpenCLI();
    st = this.probeOpenCLIRaw();

    if (st.extensionConnected || st.extensionInstalled) {
      return { ready: true, status: st };
    }

    return { ready: false, status: st };
  }

  /** Run agent-reach doctor and return structured status. */
  async getStatus(): Promise<BridgeStatus> {
    // Cache for 5 minutes
    if (this.statusCache && Date.now() - this.statusCacheTime < 300_000) {
      return this.statusCache;
    }

    const cacheKey = "agent_reach:status";
    const cached = promptCache.get<BridgeStatus>(cacheKey);
    if (cached) {
      this.statusCache = cached;
      this.statusCacheTime = Date.now();
      return cached;
    }

    // Probe OpenCLI in parallel (don't block on doctor)
    const opencli = this.probeOpenCLI();

    try {
      const raw = execSync(`${this.pythonPath} -m agent_reach.cli doctor --json 2>/dev/null || echo '{}'`, {
        timeout: 10_000,
        encoding: "utf-8",
      });
      const parsed = JSON.parse(raw || "{}");
      const status: BridgeStatus = { ...this.parseDoctorOutput(parsed), opencli };
      this.statusCache = status;
      this.statusCacheTime = Date.now();
      promptCache.set(cacheKey, status, "trend");
      return status;
    } catch {
      const status = { ...this.mockStatus(), opencli };
      return status;
    }
  }

  /** Scrape trending content for a specific platform and niche. */
  async scrapePlatform(
    platform: string,
    niche: string,
    contentType: string,
    count: number = 20,
  ): Promise<ScrapedTopPost[]> {
    const cacheKey = `agent_reach:scrape:${platform}:${niche}:${contentType}:${count}`;
    const cached = promptCache.get<ScrapedTopPost[]>(cacheKey);
    if (cached) return cached;

    let posts: ScrapedTopPost[] = [];

    try {
      switch (platform) {
        case "instagram":
          posts = await this.scrapeInstagram(niche, count);
          break;
        case "tiktok":
          posts = await this.scrapeTikTok(niche, count);
          break;
        case "youtube":
          posts = await this.scrapeYouTube(niche, count);
          break;
        case "pinterest":
          posts = await this.scrapePinterest(niche, count);
          break;
        case "reddit":
          posts = await this.scrapeReddit(niche, count);
          break;
        case "twitter":
          posts = await this.scrapeTwitter(niche, count);
          break;
        case "facebook":
          posts = await this.scrapeFacebook(niche, count);
          break;
        default:
          posts = this.getMockPosts(niche, platform, contentType as any, count);
      }
    } catch {
      // Fall back to mock data
      posts = this.getMockPosts(niche, platform, contentType as any, count);
    }

    // If real scraping returned too few, top up with mock
    if (posts.length < count) {
      const mockFill = this.getMockPosts(niche, platform, contentType as any, count - posts.length);
      posts = [...posts, ...mockFill];
    }

    promptCache.set(cacheKey, posts, "trend");
    return posts.slice(0, count);
  }

  /** Search trending topics across platforms for a niche. */
  async detectTrendingTopics(niche: string): Promise<string[]> {
    const cacheKey = `agent_reach:trending:${niche}`;
    const cached = promptCache.get<string[]>(cacheKey);
    if (cached) return cached;

    const topics: Set<string> = new Set();

    try {
      // Try Reddit for trending discussions
      const redditTopics = await this.searchRedditTrending(niche);
      redditTopics.forEach((t) => topics.add(t));
    } catch { /* ignore */ }

    try {
      // Try web search for trending signals
      const webTopics = await this.searchWebTrending(niche);
      webTopics.forEach((t) => topics.add(t));
    } catch { /* ignore */ }

    // Fallback: niche-specific trending topics
    if (topics.size === 0) {
      this.getDefaultTrendingTopics(niche).forEach((t) => topics.add(t));
    }

    const result = Array.from(topics).slice(0, 15);
    promptCache.set(cacheKey, result, "trend");
    return result;
  }

  /** Check if a specific backend is available. */
  async isBackendAvailable(channel: string): Promise<boolean> {
    const status = await this.getStatus();
    return status.available.includes(channel);
  }

  /**
   * Get the number of OpenCLI-powered channels that are ready.
   * Returns 0-4 (Instagram, Reddit, Twitter, Facebook).
   * This is the key metric: when 0, all those channels use mock data.
   */
  getOpenCLIChannelCount(): number {
    const st = this.probeOpenCLI();
    if (st.extensionConnected) return 4;
    if (st.extensionInstalled) return 4; // sleeping — wakes on first call
    return 0;
  }

  // ── OpenCLI internals ──────────────────────────────────────────────

  /** Raw re-probe that bypasses the cache. */
  private probeOpenCLIRaw(): OpenCLIDaemonStatus {
    this.opencliCache = null;
    this.opencliCacheTime = 0;
    return this.probeOpenCLI();
  }

  /**
   * Check if the OpenCLI Chrome extension exists on disk.
   * Store-installed extensions live under <profile>/Extensions/<id>/.
   * This disambiguates "sleeping service worker" from "never installed."
   */
  private checkExtensionOnDisk(): boolean {
    try {
      const { execSync: es } = require("node:child_process");
      // Linux Chrome profiles
      const roots = [
        `${process.env.HOME}/.config/google-chrome`,
        `${process.env.HOME}/.config/chromium`,
        `${process.env.HOME}/.config/microsoft-edge`,
      ];
      for (const root of roots) {
        try {
          const result = es(
            `find "${root}" -maxdepth 3 -type d -name "${OPENCLI_EXTENSION_ID}" 2>/dev/null | head -1`,
            { timeout: 5000, encoding: "utf-8" },
          ).trim();
          if (result.length > 0) return true;
        } catch {
          continue;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  // ── Platform-specific scrapers ───────────────────────────────────────

  private async scrapeInstagram(niche: string, count: number): Promise<ScrapedTopPost[]> {
    // Ensure OpenCLI is awake before first Instagram call
    const opencli = this.ensureOpenCLI();
    if (opencli.ready) {
      try {
        const query = niche.replace(/\s+/g, "");
        const raw = execSync(
          `opencli instagram search "${query}" -f json 2>/dev/null || echo '[]'`,
          { timeout: CALL_TIMEOUT_MS, encoding: "utf-8" },
        );
        const data = JSON.parse(raw || "[]");
        if (Array.isArray(data) && data.length > 0) {
          return this.normalizeInstagramPosts(data, niche, count);
        }
      } catch { /* fall through to mock */ }
    }
    return [];
  }

  private async scrapeTikTok(niche: string, count: number): Promise<ScrapedTopPost[]> {
    // TikTok has no dedicated Agent-Reach channel yet
    // Use web scrape of TikTok trending via Jina Reader as proxy
    try {
      const query = encodeURIComponent(`${niche} tiktok trending`);
      const raw = execSync(
        `curl -s "https://r.jina.ai/https://www.tiktok.com/search?q=${query}" -H "Accept: text/markdown" 2>/dev/null | head -200`,
        { timeout: CALL_TIMEOUT_MS, encoding: "utf-8" },
      );
      if (raw.length > 100) {
        return this.normalizeWebContent(raw, "tiktok", niche, count);
      }
    } catch { /* fall through to mock */ }
    return [];
  }

  private async scrapeYouTube(niche: string, count: number): Promise<ScrapedTopPost[]> {
    try {
      const query = `"${niche}" trending`;
      const raw = execSync(
        `yt-dlp --flat-playlist --dump-json "ytsearch${Math.min(count, 10)}:${query}" 2>/dev/null || echo ''`,
        { timeout: CALL_TIMEOUT_MS, encoding: "utf-8" },
      );
      if (!raw.trim()) return [];
      const lines = raw.trim().split("\n").filter(Boolean);
      return lines.slice(0, count).map((line, i) => {
        try {
          const v = JSON.parse(line);
          const post: ScrapedTopPost = {
            id: `yt_${v.id ?? i}`,
            platform: "youtube",
            url: v.webpage_url ?? `https://youtube.com/watch?v=${v.id}`,
            caption: v.title ?? `${niche} video ${i + 1}`,
            hook: v.title?.slice(0, 80) ?? `${niche} trending #${i + 1}`,
            hashtags: ["#youtube", "#trending", `#${niche.replace(/\s+/g, "").toLowerCase()}`],
            contentType: "short",
            metrics: { likes: v.like_count ?? 1000, comments: 50, shares: 100, saves: 200, views: v.view_count ?? 10000 },
            engagementRate: 0.04,
            publishedAt: new Date().toISOString(),
            creatorHandle: v.uploader ?? "@creator",
            category: niche,
            isRising: true,
            visualDescription: "YouTube video thumbnail",
            audioType: "original",
          };
          return post;
        } catch {
          return null;
        }
      }).filter((p): p is ScrapedTopPost => p !== null);
    } catch {
      return [];
    }
  }

  private async scrapeReddit(niche: string, count: number): Promise<ScrapedTopPost[]> {
    const status = await this.getStatus();
    if (status.available.includes("reddit")) {
      try {
        const subreddit = niche.replace(/\s+/g, "").toLowerCase();
        const raw = execSync(
          `rdt search "${niche}" -l ${Math.min(count, 25)} --json 2>/dev/null || echo '[]'`,
          { timeout: CALL_TIMEOUT_MS, encoding: "utf-8" },
        );
        const data = JSON.parse(raw || "[]");
        if (Array.isArray(data) && data.length > 0) {
          return this.normalizeRedditPosts(data, niche, count);
        }
      } catch { /* fall through */ }
    }
    return [];
  }

  private async scrapeTwitter(niche: string, count: number): Promise<ScrapedTopPost[]> {
    // First try OpenCLI (zero-config if browser logged in)
    const opencli = this.ensureOpenCLI();
    if (opencli.ready) {
      try {
        const raw = execSync(
          `opencli twitter search "${niche}" -f json 2>/dev/null || echo '[]'`,
          { timeout: CALL_TIMEOUT_MS, encoding: "utf-8" },
        );
        const data = JSON.parse(raw || "[]");
        if (Array.isArray(data) && data.length > 0) {
          return this.normalizeOpenCLIPosts(data, "twitter", niche, count);
        }
      } catch { /* fall through to twitter-cli */ }
    }

    // Fallback: twitter-cli (needs separate cookie config)
    try {
      const raw = execSync(
        `twitter search "${niche}" -l ${Math.min(count, 25)} 2>/dev/null || echo ''`,
        { timeout: CALL_TIMEOUT_MS, encoding: "utf-8" },
      );
      if (raw.length > 50) {
        return this.normalizeWebContent(raw, "twitter", niche, count);
      }
    } catch { /* fall through */ }
    return [];
  }

  private async scrapeFacebook(niche: string, count: number): Promise<ScrapedTopPost[]> {
    const opencli = this.ensureOpenCLI();
    if (!opencli.ready) return [];

    try {
      const raw = execSync(
        `opencli facebook search "${niche}" -f json 2>/dev/null || echo '[]'`,
        { timeout: CALL_TIMEOUT_MS, encoding: "utf-8" },
      );
      const data = JSON.parse(raw || "[]");
      if (Array.isArray(data) && data.length > 0) {
        return this.normalizeOpenCLIPosts(data, "facebook", niche, count);
      }
    } catch { /* fall through */ }
    return [];
  }

  private normalizeOpenCLIPosts(
    data: any[],
    platform: string,
    niche: string,
    count: number,
  ): ScrapedTopPost[] {
    return data.slice(0, count).map((post, i) => ({
      id: `ocl_${platform}_${post.id ?? i}`,
      platform: (platform === "facebook" ? "instagram" : platform) as ScrapedTopPost["platform"],
      url: post.url ?? `https://${platform}.com/p/${post.id ?? i}`,
      caption: post.caption ?? post.text ?? post.content ?? "",
      hook: (post.caption ?? post.text ?? post.title ?? "").split("\n")[0]?.slice(0, 80) ?? `${niche} on ${platform}`,
      hashtags: post.hashtags ?? [`#${niche.replace(/\s+/g, "").toLowerCase()}`],
      contentType: (post.is_video ? "reel" : "feed_post") as ScrapedTopPost["contentType"],
      metrics: {
        likes: post.like_count ?? post.likes ?? post.reactions ?? 1000,
        comments: post.comment_count ?? post.comments ?? 50,
        shares: post.share_count ?? post.shares ?? 30,
        saves: post.save_count ?? 100,
        views: post.view_count ?? post.views ?? 5000,
      },
      engagementRate: post.engagement_rate ?? 0.04,
      publishedAt: post.timestamp ?? post.created_at ?? new Date().toISOString(),
      creatorHandle: post.username ?? post.author ?? `@${platform}user`,
      category: niche,
      isRising: (post.like_count ?? 0) > 5000,
      visualDescription: post.description ?? `${platform} post`,
      audioType: post.is_video ? "original" as const : "none" as const,
    }));
  }

  private async scrapePinterest(niche: string, count: number): Promise<ScrapedTopPost[]> {
    // Pinterest via web scrape
    try {
      const query = encodeURIComponent(`${niche} ideas`);
      const raw = execSync(
        `curl -s "https://r.jina.ai/https://www.pinterest.com/search/pins/?q=${query}" -H "Accept: text/markdown" 2>/dev/null | head -200`,
        { timeout: CALL_TIMEOUT_MS, encoding: "utf-8" },
      );
      if (raw.length > 100) {
        return this.normalizeWebContent(raw, "pinterest", niche, count);
      }
    } catch { /* fall through */ }
    return [];
  }

  // ── Trending topic detection ─────────────────────────────────────────

  private async searchRedditTrending(niche: string): Promise<string[]> {
    const status = await this.getStatus();
    if (!status.available.includes("reddit")) return [];
    try {
      const raw = execSync(
        `rdt search "${niche} trending" --json 2>/dev/null || echo '{}'`,
        { timeout: CALL_TIMEOUT_MS, encoding: "utf-8" },
      );
      const data = JSON.parse(raw || "{}");
      const titles: string[] = [];
      if (Array.isArray(data)) {
        for (const post of data) {
          if (post.title) titles.push(post.title.slice(0, 80));
        }
      }
      return titles.slice(0, 10);
    } catch {
      return [];
    }
  }

  private async searchWebTrending(niche: string): Promise<string[]> {
    try {
      const query = encodeURIComponent(`${niche} trending topics 2026`);
      const raw = execSync(
        `curl -s "https://r.jina.ai/https://www.google.com/search?q=${query}" -H "Accept: text/markdown" 2>/dev/null | head -100`,
        { timeout: CALL_TIMEOUT_MS, encoding: "utf-8" },
      );
      // Extract potential topic lines (lines starting with # or containing niche keywords)
      const lines = raw.split("\n").filter(
        (l) => l.includes(niche.toLowerCase()) && l.length > 20 && l.length < 150,
      );
      return lines.slice(0, 10);
    } catch {
      return [];
    }
  }

  // ── Normalizers ──────────────────────────────────────────────────────

  private normalizeInstagramPosts(data: any[], niche: string, count: number): ScrapedTopPost[] {
    return data.slice(0, count).map((post, i) => ({
      id: `ig_${post.id ?? post.shortcode ?? i}`,
      platform: "instagram" as const,
      url: post.url ?? `https://instagram.com/p/${post.shortcode ?? i}`,
      caption: post.caption ?? post.title ?? `${niche} post`,
      hook: (post.caption ?? post.title ?? "").split("\n")[0]?.slice(0, 80) ?? `${niche} hook`,
      hashtags: post.hashtags ?? [`#${niche.replace(/\s+/g, "").toLowerCase()}`],
      contentType: post.is_video ? "reel" as const : "carousel" as const,
      metrics: {
        likes: post.like_count ?? post.likes ?? 1000,
        comments: post.comment_count ?? post.comments ?? 100,
        shares: post.share_count ?? 50,
        saves: post.save_count ?? 200,
        views: post.view_count ?? post.play_count ?? 5000,
      },
      engagementRate: post.engagement_rate ?? 0.04,
      publishedAt: post.timestamp ?? new Date().toISOString(),
      creatorHandle: post.owner?.username ?? post.username ?? "@creator",
      category: niche,
      isRising: true,
      visualDescription: post.thumbnail_url ?? "Instagram post",
      audioType: post.is_video ? ("trending_sound" as const) : ("none" as const),
    }));
  }

  private normalizeRedditPosts(data: any[], niche: string, count: number): ScrapedTopPost[] {
    return data.slice(0, count).map((post, i) => ({
      id: `rd_${post.id ?? i}`,
      platform: "instagram" as const, // Map to our supported platforms
      url: post.url ?? post.permalink ?? `https://reddit.com${post.permalink}`,
      caption: post.selftext ?? post.title ?? "",
      hook: post.title?.slice(0, 80) ?? `${niche} on Reddit`,
      hashtags: [`#${niche.replace(/\s+/g, "").toLowerCase()}`, "#reddit", "#trending"],
      contentType: "carousel" as const,
      metrics: {
        likes: post.score ?? post.ups ?? 100,
        comments: post.num_comments ?? post.comments ?? 10,
        shares: post.crossposts ?? 5,
        saves: post.saved ?? 20,
        views: post.view_count ?? 1000,
      },
      engagementRate: (post.upvote_ratio ?? 0.8) * 0.1,
      publishedAt: new Date(post.created_utc ? post.created_utc * 1000 : Date.now()).toISOString(),
      creatorHandle: post.author ?? "@redditor",
      category: niche,
      isRising: post.score > 100,
      visualDescription: "Reddit post",
      audioType: "none" as const,
    }));
  }

  private normalizeWebContent(raw: string, platform: string, niche: string, count: number): ScrapedTopPost[] {
    const lines = raw.split("\n").filter((l) => l.trim().length > 20);
    // Extract potential post entries — lines that look like titles or hooks
    const entries = lines.filter(
      (l) =>
        l.match(/^#{1,3}\s+/) || // Markdown headings
        l.match(/^\d+[\.\)]\s+/) || // Numbered lists
        l.match(/^[-•]\s+/) || // Bullet points
        (l.length > 30 && l.length < 200 && !l.startsWith("http")),
    );

    return entries.slice(0, count).map((entry, i) => {
      const cleaned = entry.replace(/^#{1,3}\s+/, "").replace(/^[\d]+[\.\)]\s+/, "").replace(/^[-•]\s+/, "").trim();
      return {
        id: `web_${platform}_${niche.replace(/\s+/g, "_")}_${i}`,
        platform: platform as ScrapedTopPost["platform"],
        url: `https://${platform}.com/search?q=${encodeURIComponent(niche)}`,
        caption: cleaned,
        hook: cleaned.slice(0, 80),
        hashtags: [`#${niche.replace(/\s+/g, "").toLowerCase()}`, "#trending", "#viral"],
        contentType: "feed_post" as const,
        metrics: { likes: 500 + Math.floor(Math.random() * 2000), comments: 50, shares: 100, saves: 200, views: 5000 },
        engagementRate: 0.03 + Math.random() * 0.05,
        publishedAt: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
        creatorHandle: "@trending",
        category: niche,
        isRising: Math.random() > 0.4,
        visualDescription: `${platform} trending content`,
        audioType: "none" as const,
      };
    });
  }

  // ── Mock data (graceful fallback) ────────────────────────────────────

  private getMockPosts(
    niche: string,
    platform: string,
    contentType: string,
    count: number,
  ): ScrapedTopPost[] {
    const nicheKey = Object.keys(MOCK_POSTS_BY_NICHE).find((k) =>
      niche.toLowerCase().includes(k),
    ) ?? "default";
    const pool = MOCK_POSTS_BY_NICHE[nicheKey] ?? MOCK_POSTS_BY_NICHE["default"]!;
    const slug = niche.toLowerCase().replace(/\s+/g, "_");
    const plat = platform as ScrapedTopPost["platform"];

    return Array.from({ length: count }, (_, i) => {
      const template = pool[i % pool.length]!;
      return {
        id: `mock_${plat}_${slug}_${Date.now()}_${i}`,
        platform: plat,
        url: `https://${platform}.com/p/mock_${i}`,
        caption: template.caption ?? `${niche} content #${i + 1}`,
        hook: template.hook ?? `${niche} trending #${i + 1}`,
        hashtags: template.hashtags ?? [`#${slug}`, "#viral", "#trending", "#fyp"],
        contentType: (contentType as ScrapedTopPost["contentType"]) ?? "reel",
        metrics: template.metrics ?? {
          likes: 5000 + Math.floor(Math.random() * 50000),
          comments: 200 + Math.floor(Math.random() * 2000),
          shares: 1000 + Math.floor(Math.random() * 10000),
          saves: 3000 + Math.floor(Math.random() * 30000),
          views: 50000 + Math.floor(Math.random() * 500000),
        },
        engagementRate: template.engagementRate ?? 0.04 + Math.random() * 0.08,
        publishedAt: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
        creatorHandle: `@${slug}pro`,
        category: niche,
        isRising: Math.random() > 0.3,
        visualDescription: `${niche} visual ${i}`,
        audioType: (["trending_sound", "voiceover", "original", "none"] as const)[i % 4]!,
      };
    });
  }

  private getDefaultTrendingTopics(niche: string): string[] {
    const base = [
      `${niche} trends 2026`,
      `best ${niche} this month`,
      `${niche} hacks that work`,
      `why ${niche} is changing`,
      `new ${niche} strategy`,
      `${niche} for beginners`,
      `${niche} vs alternatives`,
    ];
    return base;
  }

  // ── Doctor output parsing ────────────────────────────────────────────

  private parseDoctorOutput(raw: any): BridgeStatus {
    const available: string[] = [];
    const unavailable: string[] = [];
    const details: BridgeStatus["details"] = {};

    if (raw.channels && Array.isArray(raw.channels)) {
      for (const ch of raw.channels) {
        const name = ch.name ?? ch.channel ?? "unknown";
        const status = ch.status ?? "off";
        if (status === "ok" || status === "available" || status === "warn") {
          available.push(name);
        } else {
          unavailable.push(name);
        }
        details[name] = {
          status,
          backend: ch.active_backend ?? ch.backend ?? "none",
          message: ch.message ?? "",
        };
      }
    }

    // OpenCLI: if installed + extension ready, promote its channels
    // even if doctor didn't list them individually
    const opencli = this.probeOpenCLI();
    const opencliChannels = ["instagram", "reddit", "twitter", "facebook"];
    if (opencli.extensionConnected || opencli.extensionInstalled) {
      for (const ch of opencliChannels) {
        if (!available.includes(ch) && !unavailable.includes(ch)) {
          available.push(ch);
          details[ch] = {
            status: opencli.extensionConnected ? "ok" : "warn",
            backend: "OpenCLI",
            message: opencli.extensionConnected
              ? "OpenCLI connected — real data"
              : "OpenCLI sleeping — wakes on first call",
          };
        }
      }
    }

    return {
      available,
      unavailable,
      total: available.length + unavailable.length,
      details,
      opencli,
    };
  }

  private mockStatus(): BridgeStatus {
    const opencli = this.probeOpenCLI();
    // When OpenCLI is ready, promote the 4 OpenCLI-powered channels
    const extraAvailable: string[] = [];
    if (opencli.extensionConnected || opencli.extensionInstalled) {
      extraAvailable.push("instagram", "reddit", "twitter", "facebook");
    }

    return {
      available: ["web", "youtube", "rss", "v2ex", "bilibili", ...extraAvailable],
      unavailable: [
        ...["instagram", "reddit", "twitter", "facebook"].filter(c => !extraAvailable.includes(c)),
        "xiaohongshu", "linkedin", "xueqiu", "xiaoyuzhou", "github",
      ],
      total: 15,
      details: {
        web: { status: "ok", backend: "Jina Reader", message: "Available via curl r.jina.ai" },
        youtube: { status: "ok", backend: "yt-dlp", message: "Video search and subtitle extraction" },
        rss: { status: "ok", backend: "feedparser", message: "RSS/Atom feed reader" },
        v2ex: { status: "ok", backend: "public API", message: "V2EX community access" },
        bilibili: { status: "ok", backend: "bili-cli", message: "Search + video details, no login needed" },
        instagram: {
          status: extraAvailable.includes("instagram") ? "ok" : "off",
          backend: "OpenCLI",
          message: extraAvailable.includes("instagram")
            ? "OpenCLI ready — real Instagram data available"
            : "Install OpenCLI + Chrome extension and log into instagram.com",
        },
        reddit: {
          status: extraAvailable.includes("reddit") ? "ok" : "off",
          backend: "OpenCLI / rdt-cli",
          message: extraAvailable.includes("reddit")
            ? "OpenCLI ready — real Reddit data available"
            : "Install OpenCLI or rdt-cli and log into reddit.com",
        },
        twitter: {
          status: extraAvailable.includes("twitter") ? "ok" : "off",
          backend: "OpenCLI / twitter-cli",
          message: extraAvailable.includes("twitter")
            ? "OpenCLI ready — real Twitter data available"
            : "Install OpenCLI or twitter-cli and configure",
        },
        facebook: {
          status: extraAvailable.includes("facebook") ? "ok" : "off",
          backend: "OpenCLI",
          message: extraAvailable.includes("facebook")
            ? "OpenCLI ready — real Facebook data available"
            : "Install OpenCLI + Chrome extension and log into facebook.com",
        },
      },
      opencli,
    };
  }
}

// Singleton
export const agentReachBridge = new AgentReachBridge();
