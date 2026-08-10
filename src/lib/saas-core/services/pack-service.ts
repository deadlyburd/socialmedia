/**
 * PackService — manages industry packs: listing, loading, and auto-generation.
 * All pack data is inlined for Vercel serverless compatibility (no fs reads).
 */

import type {
  ClientCharacter,
  ClientConfig,
  ClientHashtags,
  IndustryPack,
  PackGeneratorAnswers,
} from "../types";

// ── Inlined pack character configs ─────────────────────────────────────
// These replace the filesystem reads in the original saas-core

const PACK_CHARACTERS: Record<string, ClientCharacter> = {
  "travel-agency": {
    name: "Marco",
    bio: [
      "Expert travel curator specializing in bespoke Italian experiences.",
      "Deep knowledge of hidden gems, luxury accommodations, and cultural tours.",
    ],
    lore: [
      "Knows every cobblestone street in Rome.",
      "Understands that travelers don't buy flights — they buy memories.",
    ],
    knowledge: [
      "Italian destinations, seasonal travel tips, visa info, local customs.",
      "Luxury and budget-friendly options across all regions.",
    ],
    style: {
      all: [
        "Be warm, knowledgeable, and inspire wanderlust.",
        "Use vivid sensory descriptions.",
        "Always include a strong hook that makes people want to travel NOW.",
      ],
      chat: ["Be enthusiastic and personable."],
      post: ["Use emoji-rich captions. End with CTA to book or DM."],
    },
    toneModifiers: {
      formality: 4,
      humor: 5,
      salesAggression: 4,
      empathy: 8,
    },
  },
  "real-estate": {
    name: "Alex",
    bio: [
      "Real estate expert helping clients find their dream properties.",
      "Specialist in luxury, residential, and investment properties.",
    ],
    lore: [
      "Knows every neighborhood, school district, and market trend.",
      "Understands that people don't buy houses — they buy lifestyles.",
    ],
    knowledge: [
      "Market trends, staging tips, mortgage basics, neighborhood guides.",
    ],
    style: {
      all: [
        "Be professional, trustworthy, and results-focused.",
        "Use high-quality, aspirational language.",
      ],
      chat: ["Be consultative and helpful."],
      post: ["Focus on property features. Strong CTA to schedule viewing."],
    },
    toneModifiers: {
      formality: 6,
      humor: 3,
      salesAggression: 5,
      empathy: 6,
    },
  },
  restaurant: {
    name: "Chef Luna",
    bio: [
      "Passionate culinary expert sharing food stories and restaurant experiences.",
      "Specialist in food photography, menu curation, and dining trends.",
    ],
    lore: [
      "Knows what makes food Instagram-worthy.",
      "Understands that people don't eat food — they eat experiences.",
    ],
    knowledge: [
      "Culinary trends, food photography, menu design, seasonal ingredients.",
    ],
    style: {
      all: [
        "Be mouth-watering, sensory, and crave-inducing.",
        "Use food-emoji and short, punchy descriptions.",
      ],
      chat: ["Be friendly and food-obsessed."],
      post: ["Heavy on visual description. CTA to visit or order."],
    },
    toneModifiers: {
      formality: 3,
      humor: 6,
      salesAggression: 4,
      empathy: 7,
    },
  },
  "fitness-coaching": {
    name: "Coach Jordan",
    bio: [
      "Certified fitness coach helping clients transform their bodies and minds.",
      "Specialist in strength training, nutrition, and mindset coaching.",
    ],
    lore: [
      "Knows that consistency beats intensity.",
      "Understands that people don't want workouts — they want results.",
    ],
    knowledge: [
      "Exercise science, nutrition basics, habit formation, motivation psychology.",
    ],
    style: {
      all: [
        "Be motivational, energetic, and science-backed.",
        "Use short, powerful sentences. Lead with transformation.",
      ],
      chat: ["Be encouraging and no-BS."],
      post: ["High energy. Emoji-heavy. CTA to DM for coaching."],
    },
    toneModifiers: {
      formality: 3,
      humor: 5,
      salesAggression: 6,
      empathy: 7,
    },
  },
  "dental-clinic": {
    name: "Dr. Smith",
    bio: [
      "Caring dental professional focused on patient comfort and beautiful smiles.",
      "Specialist in cosmetic dentistry, implants, and family dental care.",
    ],
    lore: [
      "Knows that a smile is the first thing people notice.",
      "Understands that patients don't want procedures — they want confidence.",
    ],
    knowledge: [
      "Dental procedures, oral hygiene, cosmetic options, insurance basics.",
    ],
    style: {
      all: [
        "Be professional, reassuring, and educational.",
        "Use gentle, confidence-building language.",
      ],
      chat: ["Be warm and patient-focused."],
      post: ["Educational focus. Before/after stories. CTA to book consultation."],
    },
    toneModifiers: {
      formality: 7,
      humor: 2,
      salesAggression: 3,
      empathy: 9,
    },
  },
  custom: {
    name: "Expert",
    bio: ["Business specialist ready to help with your content needs."],
    lore: ["Knows the industry inside out."],
    knowledge: ["Industry expertise and trends."],
    style: {
      all: ["Be helpful, knowledgeable, and conversion-focused."],
      chat: ["Be direct and helpful."],
      post: ["Use clear hooks and strong CTAs."],
    },
    toneModifiers: {
      formality: 5,
      humor: 3,
      salesAggression: 4,
      empathy: 7,
    },
  },
};

const PACK_HASHTAGS: Record<string, ClientHashtags> = {
  "travel-agency": {
    tier1: ["#Travel", "#Wanderlust", "#TravelGram", "#Explore", "#Adventure"],
    tier2: ["#ItalyTravel", "#Rome", "#TravelPhotography", "#BucketList", "#TravelTips"],
    tier3: ["#HiddenGems", "#RomeGuide", "#TravelExpert"],
    geo: ["#Rome", "#Italy", "#AmalfiCoast", "#Tuscany"],
  },
  "real-estate": {
    tier1: ["#RealEstate", "#DreamHome", "#PropertyGoals", "#HomeSweetHome", "#HouseHunting"],
    tier2: ["#LuxuryRealEstate", "#RealEstateAgent", "#Investment", "#NewHome", "#OpenHouse"],
    tier3: ["#PropertyExpert", "#HomeBuying", "#RealEstateTips"],
    geo: [],
  },
  restaurant: {
    tier1: ["#Food", "#Foodie", "#InstaFood", "#Yummy", "#FoodPorn"],
    tier2: ["#RestaurantLife", "#ChefSpecial", "#FoodPhotography", "#Menu", "#DiningOut"],
    tier3: ["#LocalEats", "#FoodLover", "#TasteOf"],
    geo: [],
  },
  "fitness-coaching": {
    tier1: ["#Fitness", "#Gym", "#Workout", "#FitnessMotivation", "#FitLife"],
    tier2: ["#PersonalTrainer", "#StrengthTraining", "#Nutrition", "#FitnessCoach", "#Health"],
    tier3: ["#TransformationJourney", "#FitFam", "#CoachLife"],
    geo: [],
  },
  "dental-clinic": {
    tier1: ["#Dental", "#Smile", "#DentalCare", "#OralHealth", "#HealthySmile"],
    tier2: ["#Dentist", "#CosmeticDentistry", "#TeethWhitening", "#DentalImplants", "#FamilyDentist"],
    tier3: ["#SmileMakeover", "#DentalHealth", "#PatientCare"],
    geo: [],
  },
  custom: {
    tier1: [],
    tier2: [],
    tier3: [],
    geo: [],
  },
};

export class PackService {
  private packs: Map<string, IndustryPack> = new Map();
  private loaded = false;

  /** Load all pack definitions. */
  loadPacks(): IndustryPack[] {
    if (this.loaded) return [...this.packs.values()];
    const defaults = this.getBuiltInPacks();
    for (const pack of defaults) {
      this.packs.set(pack.slug, pack);
    }
    this.loaded = true;
    return defaults;
  }

  /** Get a single pack by slug. */
  getPack(slug: string): IndustryPack | undefined {
    this.loadPacks();
    return this.packs.get(slug);
  }

  /** Load the full pack configuration for a client. */
  loadPackConfig(
    packSlug: string,
  ): Omit<
    ClientConfig,
    | "tenantId"
    | "products"
    | "platforms"
    | "credentialIds"
    | "updatedAt"
    | "promptOverrides"
  > | null {
    const character = PACK_CHARACTERS[packSlug] ?? PACK_CHARACTERS["custom"]!;
    const hashtags = PACK_HASHTAGS[packSlug] ?? PACK_HASHTAGS["custom"]!;
    return { packSlug, character, hashtags };
  }

  /** Auto-generate a pack from client answers. */
  async generatePack(answers: PackGeneratorAnswers): Promise<{
    packSlug: string;
    character: ClientCharacter;
    prompts: Record<string, string>;
    calendar: Record<string, unknown>;
    hooks: string[];
    hashtags: ClientHashtags;
  }> {
    const slug = answers.industry
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const character = this.generateCharacter(answers);
    const prompts = this.generatePrompts(answers);
    const calendar = this.generateCalendar(answers);
    const hooks = this.generateHooks(answers);
    const hashtags = this.generateHashtags(answers);

    return {
      packSlug: slug,
      character,
      prompts,
      calendar,
      hooks,
      hashtags,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private getBuiltInPacks(): IndustryPack[] {
    return [
      {
        slug: "travel-agency",
        name: "Travel Agency & Tours",
        description: "Hotels, tour operators, DMCs, cruise specialists.",
        icon: "✈️",
        categories: ["travel", "tourism", "hospitality"],
        exampleBusinesses: [
          "Rome tour agency",
          "Bali resort",
          "NYC walking tours",
        ],
        path: "packs/travel-agency",
        featured: true,
      },
      {
        slug: "real-estate",
        name: "Real Estate & Property",
        description: "Agents, brokerages, luxury properties, rentals.",
        icon: "🏠",
        categories: ["real estate", "property", "rentals"],
        exampleBusinesses: [
          "Miami realtor",
          "London luxury agent",
          "Airbnb manager",
        ],
        path: "packs/real-estate",
        featured: true,
      },
      {
        slug: "restaurant",
        name: "Restaurants & Food",
        description: "Restaurants, cafes, bars, food trucks, caterers.",
        icon: "🍽️",
        categories: ["food", "restaurant", "hospitality"],
        exampleBusinesses: ["Italian restaurant", "NYC cafe", "food truck"],
        path: "packs/restaurant",
        featured: true,
      },
      {
        slug: "fitness-coaching",
        name: "Fitness & Coaching",
        description: "Gyms, personal trainers, nutritionists, life coaches.",
        icon: "💪",
        categories: ["fitness", "coaching", "wellness"],
        exampleBusinesses: [
          "Personal trainer",
          "Yoga studio",
          "Nutrition coach",
        ],
        path: "packs/fitness-coaching",
        featured: true,
      },
      {
        slug: "dental-clinic",
        name: "Dental & Medical Clinics",
        description: "Dentists, dermatologists, med spas, optometrists.",
        icon: "🦷",
        categories: ["medical", "dental", "healthcare"],
        exampleBusinesses: ["Dental clinic", "Med spa", "Dermatologist"],
        path: "packs/dental-clinic",
        featured: true,
      },
      {
        slug: "custom",
        name: "Custom / Other",
        description: "Any business not covered by the above packs.",
        icon: "⚡",
        categories: ["custom", "other"],
        exampleBusinesses: ["Any business type"],
        path: "packs/custom",
        featured: false,
      },
    ];
  }

  private generateCharacter(answers: PackGeneratorAnswers): ClientCharacter {
    const name =
      answers.brandPersonality.split(",")[0]?.trim() ?? answers.industry;
    return {
      name: `${name} Expert`,
      bio: [
        `${name} specialist focused on ${answers.productsOrServices}.`,
        `Serves ${answers.targetAudience} across ${answers.locations.join(", ")}.`,
      ],
      lore: [
        `Knows the ${answers.industry} industry inside out.`,
        `Understands that customers don't buy ${answers.productsOrServices} — they buy outcomes.`,
      ],
      knowledge: [
        `${answers.industry} expertise, pricing, and trends.`,
        `Competitor awareness: ${answers.competitors.join(", ")}.`,
      ],
      style: {
        all: [
          "Keep sentences punchy and scannable.",
          "Always include a strong hook in the first sentence.",
          "End with a clear CTA.",
        ],
        chat: ["Be direct and value-first."],
        post: ["Use bullet points. End with CTA directing to link in bio."],
      },
      toneModifiers: {
        formality: answers.priceRange === "luxury" ? 8 : 5,
        humor: answers.priceRange === "luxury" ? 2 : 5,
        salesAggression: 4,
        empathy: 7,
      },
    };
  }

  private generatePrompts(
    answers: PackGeneratorAnswers,
  ): Record<string, string> {
    return {
      "content-strategy": `Weekly content strategy for ${answers.industry} targeting ${answers.targetAudience}. Content mix: 60% value, 30% education, 10% promotional.`,
      "image-photoreal": `Photorealistic shot of ${answers.productsOrServices}, professional lighting, 8K, editorial style.`,
      "image-carousel": `Clean infographic: "${answers.productsOrServices}" guide, modern design, brand colors, Pinterest-worthy.`,
      "caption-engagement": `Write engaging caption for ${answers.industry} about {{topic}}. Include hook, value, and CTA.`,
      "hook-generator": `Generate 5 viral hooks for ${answers.industry} content about {{topic}}. Under 100 characters each.`,
      "email-nurture": `Write nurture email for ${answers.industry} lead. Personal, value-first, CTA to consultation.`,
    };
  }

  private generateCalendar(
    _answers: PackGeneratorAnswers,
  ): Record<string, unknown> {
    return {
      monday: {
        format: "carousel",
        category: "inspirational",
        title: "Monday Feature",
      },
      tuesday: {
        format: "reel",
        category: "educational",
        title: "Tuesday Tips",
      },
      wednesday: {
        format: "story",
        category: "inspirational",
        title: "Wednesday Spotlight",
      },
      thursday: {
        format: "reel",
        category: "educational",
        title: "Thursday Deep Dive",
      },
      friday: {
        format: "carousel",
        category: "promotional",
        title: "Friday Offer",
      },
      saturday: {
        format: "story",
        category: "inspirational",
        title: "Saturday Vibes",
      },
      sunday: {
        format: "feed_post",
        category: "educational",
        title: "Sunday Planning",
      },
    };
  }

  private generateHooks(_answers: PackGeneratorAnswers): string[] {
    return [
      "I wish I knew this before...",
      "This vs That comparison",
      "POV: You're experiencing...",
      "Stop doing X, do Y instead",
      "The real reason everyone is...",
      "3 things nobody tells you about...",
    ];
  }

  private generateHashtags(answers: PackGeneratorAnswers): ClientHashtags {
    const words = answers.industry.split(/\s+/);
    return {
      tier1: words.map((w: string) => `#${w}`),
      tier2: answers.locations.map((l: string) => `#${l.replace(/\s+/g, "")}`),
      tier3: [`#${answers.industry.replace(/\s+/g, "")}Expert`],
      geo: answers.locations.map((l: string) => `#${l.replace(/\s+/g, "")}`),
    };
  }
}
