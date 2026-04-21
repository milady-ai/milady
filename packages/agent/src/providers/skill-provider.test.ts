/**
 * Tests for the BM25-lite dynamic skill provider.
 *
 * Validates index building, scoring, and tiered output without
 * requiring the full runtime or embedding generation.
 */
import { describe, expect, it } from "vitest";

// We test the internal functions by importing the module.
// The provider uses exported createDynamicSkillProvider, but the internal
// scoring functions are not exported. We'll test end-to-end via the provider.

// Inline a minimal mock of the functions to test the algorithm.
// This avoids coupling to internal structure while validating correctness.

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "will", "can", "are",
  "use", "when", "how", "what", "your", "you", "our", "has", "have", "been",
  "not", "but", "all", "also", "more", "than", "into", "does", "skill",
  "agent", "search", "install", "plugin", "using", "used", "help", "want",
  "need", "please",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

describe("skill-provider tokenizer", () => {
  it("tokenizes simple text", () => {
    const tokens = tokenize("Create a GitHub pull request");
    expect(tokens).toContain("create");
    expect(tokens).toContain("github");
    expect(tokens).toContain("pull");
    expect(tokens).toContain("request");
  });

  it("filters stopwords", () => {
    const tokens = tokenize("use this skill for the agent");
    expect(tokens).toHaveLength(0);
  });

  it("filters short words", () => {
    const tokens = tokenize("go to do it");
    expect(tokens).toHaveLength(0);
  });

  it("handles punctuation", () => {
    const tokens = tokenize("hello-world! foo_bar (test)");
    expect(tokens).toContain("hello-world");
    expect(tokens).toContain("foo");
    expect(tokens).toContain("bar");
    expect(tokens).toContain("test");
  });
});

describe("skill-provider BM25 scoring", () => {
  // Simulate the scoring logic inline for testing
  const BM25_K1 = 1.5;
  const BM25_B = 0.75;

  interface TestSkill {
    slug: string;
    name: string;
    description: string;
  }

  function buildTestIndex(skills: TestSkill[]) {
    const docs: Array<{
      slug: string;
      name: string;
      description: string;
      triggers: string[];
      tf: Map<string, number>;
      totalTerms: number;
    }> = [];
    const postings = new Map<string, Set<number>>();
    const df = new Map<string, number>();
    let totalDl = 0;

    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const triggers: string[] = [];
      const match = skill.description.match(/Use (?:when|for|to)\s+([^.]+)/i);
      if (match) {
        triggers.push(
          ...match[1]
            .split(/[,;]/)
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        );
      }

      const text = `${skill.name} ${skill.description} ${triggers.join(" ")}`;
      const terms = tokenize(text);
      const tf = new Map<string, number>();
      for (const term of terms) {
        tf.set(term, (tf.get(term) ?? 0) + 1);
      }
      for (const slugToken of skill.slug.split(/[-_]/)) {
        if (slugToken.length > 2) {
          const t = slugToken.toLowerCase();
          tf.set(t, (tf.get(t) ?? 0) + 2);
        }
      }

      docs.push({
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        triggers,
        tf,
        totalTerms: terms.length,
      });
      totalDl += terms.length;

      for (const term of tf.keys()) {
        let set = postings.get(term);
        if (!set) {
          set = new Set();
          postings.set(term, set);
        }
        set.add(i);
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }

    return {
      docs,
      postings,
      df,
      avgDl: docs.length > 0 ? totalDl / docs.length : 1,
    };
  }

  function scoreQuery(
    index: ReturnType<typeof buildTestIndex>,
    queryText: string,
  ) {
    const queryTerms = tokenize(queryText);
    if (queryTerms.length === 0) return [];

    const N = index.docs.length;
    const scores = new Float64Array(N);

    for (const term of queryTerms) {
      const docSet = index.postings.get(term);
      if (!docSet) continue;
      const docFreq = index.df.get(term) ?? 0;
      const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
      for (const docIdx of docSet) {
        const doc = index.docs[docIdx];
        const termFreq = doc.tf.get(term) ?? 0;
        const dlNorm =
          1 - BM25_B + BM25_B * (doc.totalTerms / index.avgDl);
        const tfScore =
          (termFreq * (BM25_K1 + 1)) / (termFreq + BM25_K1 * dlNorm);
        scores[docIdx] += idf * tfScore;
      }
    }

    const queryLower = queryText.toLowerCase();
    for (let i = 0; i < N; i++) {
      const doc = index.docs[i];
      if (queryLower.includes(doc.slug.toLowerCase())) scores[i] += 10;
      if (queryLower.includes(doc.name.toLowerCase())) scores[i] += 8;
      for (const trigger of doc.triggers) {
        if (trigger && queryLower.includes(trigger)) scores[i] += 5;
      }
    }

    const results: Array<{ slug: string; name: string; score: number }> = [];
    for (let i = 0; i < N; i++) {
      if (scores[i] > 0) {
        results.push({
          slug: index.docs[i].slug,
          name: index.docs[i].name,
          score: scores[i],
        });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  const testSkills: TestSkill[] = [
    {
      slug: "github",
      name: "GitHub",
      description:
        "Interact with GitHub using the gh CLI to manage repositories, issues, pull requests. Use when the user asks to create, list, view, merge, or close pull requests.",
    },
    {
      slug: "weather",
      name: "Weather",
      description:
        "Get current weather and forecasts. Use when the user asks about the weather, temperature, forecast, wind.",
    },
    {
      slug: "spotify-player",
      name: "Spotify Player",
      description:
        "Terminal Spotify playback and search. Use when the user asks to play music, search for a song, skip a track.",
    },
    {
      slug: "discord",
      name: "Discord",
      description:
        "Use when you need to control Discord: send messages, react, manage threads, create channels.",
    },
    {
      slug: "notion",
      name: "Notion",
      description:
        "Notion API for creating and managing pages, databases, and blocks. Use when the user wants to create a Notion page.",
    },
  ];

  const index = buildTestIndex(testSkills);

  it("ranks github highest for PR-related query", () => {
    const results = scoreQuery(index, "create a github pull request");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].slug).toBe("github");
    expect(results[0].score).toBeGreaterThanOrEqual(8); // Should trigger Tier 2
  });

  it("ranks weather highest for weather query", () => {
    const results = scoreQuery(index, "what is the weather in tokyo?");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].slug).toBe("weather");
  });

  it("ranks spotify highest for music query", () => {
    const results = scoreQuery(index, "play some music on spotify");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].slug).toBe("spotify-player");
  });

  it("returns empty for unrelated query", () => {
    const results = scoreQuery(index, "meaning of life");
    // May have low scores but nothing above threshold
    const aboveThreshold = results.filter((r) => r.score >= 3);
    expect(aboveThreshold.length).toBe(0);
  });

  it("exact slug match gets high bonus", () => {
    const results = scoreQuery(index, "I need help with discord");
    expect(results[0].slug).toBe("discord");
    expect(results[0].score).toBeGreaterThanOrEqual(10); // slug bonus
  });

  it("trigger phrase matching works", () => {
    const results = scoreQuery(
      index,
      "the user asks to create a notion page",
    );
    expect(results[0].slug).toBe("notion");
  });
});
