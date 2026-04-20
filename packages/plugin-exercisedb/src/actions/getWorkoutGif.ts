import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  logger,
  type Memory,
  type State,
} from "@elizaos/core";

interface Exercise {
  id?: string;
  exerciseId?: string;
  name: string;
  gifUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  target?: string;
  targetMuscles?: string[];
  bodyPart?: string;
  bodyParts?: string[];
  equipment?: string;
  equipments?: string[];
  category?: string;
  secondaryMuscles?: string[];
}

const DEFAULT_BASE_URL = "https://exercisedb-api.vercel.app/api/v2";
const FALLBACK_BASE_URL =
  "https://raw.githubusercontent.com/exercisedb/exercisedb-api/main";

const MUSCLE_KEYWORDS = [
  "chest",
  "back",
  "shoulders",
  "shoulder",
  "biceps",
  "bicep",
  "triceps",
  "tricep",
  "legs",
  "leg",
  "quads",
  "quadriceps",
  "hamstrings",
  "hamstring",
  "glutes",
  "glute",
  "calves",
  "calf",
  "abs",
  "core",
  "forearms",
  "forearm",
  "lats",
  "traps",
  "delts",
];

const CATEGORY_KEYWORDS = [
  "yoga",
  "stretch",
  "stretching",
  "cardio",
  "plyometric",
  "plyometrics",
  "powerlifting",
  "strength",
  "strongman",
];

const GIF_INTENT_KEYWORDS = [
  "gif",
  "workout",
  "exercise",
  "pose",
  "stretch",
  "demo",
  "demonstration",
  "animation",
];

function baseUrl(runtime: IAgentRuntime): string {
  return runtime.getSetting("EXERCISEDB_BASE_URL") || DEFAULT_BASE_URL;
}

function extractQuery(text: string): {
  muscle?: string;
  category?: string;
  raw: string;
} {
  const lower = text.toLowerCase();
  const muscle = MUSCLE_KEYWORDS.find((word) =>
    new RegExp(`\\b${word}\\b`).test(lower),
  );
  const category = CATEGORY_KEYWORDS.find((word) =>
    new RegExp(`\\b${word}\\b`).test(lower),
  );
  return { muscle, category, raw: lower };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`exercisedb request failed: ${response.status} ${url}`);
  }
  return (await response.json()) as T;
}

async function queryExercises(
  runtime: IAgentRuntime,
  query: { muscle?: string; category?: string; raw: string },
): Promise<Exercise[]> {
  const base = baseUrl(runtime);
  const params = new URLSearchParams({ limit: "10" });
  if (query.muscle) params.set("search", query.muscle);
  else if (query.category) params.set("search", query.category);
  else params.set("search", query.raw.slice(0, 80));

  const primaryUrl = `${base}/exercises?${params.toString()}`;
  try {
    const payload = await fetchJson<{ data?: Exercise[] } | Exercise[]>(
      primaryUrl,
    );
    const list = Array.isArray(payload) ? payload : (payload.data ?? []);
    if (list.length > 0) return list;
  } catch (error) {
    logger.warn(
      { err: error, url: primaryUrl },
      "exercisedb primary endpoint failed, trying fallback",
    );
  }

  const fallback = await fetchJson<Exercise[]>(
    `${FALLBACK_BASE_URL}/data/exercises.json`,
  );
  const needle = query.muscle ?? query.category ?? query.raw;
  return fallback.filter((e) => matchesExercise(e, needle)).slice(0, 10);
}

function matchesExercise(exercise: Exercise, needle: string): boolean {
  const haystack = [
    exercise.name,
    exercise.target,
    exercise.bodyPart,
    exercise.equipment,
    exercise.category,
    ...(exercise.targetMuscles ?? []),
    ...(exercise.bodyParts ?? []),
    ...(exercise.equipments ?? []),
    ...(exercise.secondaryMuscles ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle.toLowerCase());
}

function pickExercise(list: Exercise[]): Exercise {
  const withGif = list.filter((e) => e.gifUrl || e.imageUrl || e.videoUrl);
  const pool = withGif.length > 0 ? withGif : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

function formatExercise(exercise: Exercise): string {
  const target =
    exercise.target ??
    exercise.targetMuscles?.[0] ??
    exercise.bodyPart ??
    exercise.bodyParts?.[0] ??
    "unspecified";
  const equipment =
    exercise.equipment ?? exercise.equipments?.[0] ?? "bodyweight";
  const media = exercise.gifUrl ?? exercise.imageUrl ?? exercise.videoUrl;
  const lines = [
    `**${exercise.name}**`,
    `Target: ${target}`,
    `Equipment: ${equipment}`,
  ];
  if (media) lines.push(`Gif: ${media}`);
  return lines.join("\n");
}

export const getWorkoutGifAction: Action = {
  name: "GET_WORKOUT_GIF",
  similes: [
    "SHOW_WORKOUT_GIF",
    "FIND_EXERCISE_GIF",
    "GET_EXERCISE_GIF",
    "SHOW_EXERCISE",
    "WORKOUT_DEMO",
  ],
  description:
    "Fetch a workout gif and exercise details (target muscle, equipment) from the exercisedb API in response to requests like 'show me a chest workout gif' or 'give me a yoga pose'.",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() ?? "";
    if (!text) return false;
    const hasIntent = GIF_INTENT_KEYWORDS.some((w) => text.includes(w));
    const hasTopic =
      MUSCLE_KEYWORDS.some((w) => text.includes(w)) ||
      CATEGORY_KEYWORDS.some((w) => text.includes(w));
    return hasIntent && hasTopic;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const text = message.content.text ?? "";
    const query = extractQuery(text);

    const exercises = await queryExercises(runtime, query);
    if (exercises.length === 0) {
      const reply = {
        text: `I couldn't find any exercises matching "${text.trim()}". Try a specific muscle like "chest", "biceps", or "glutes".`,
        source: message.content.source,
      };
      if (callback) await callback(reply);
      return { success: false, text: reply.text };
    }

    const exercise = pickExercise(exercises);
    const formatted = formatExercise(exercise);
    if (callback) {
      await callback({ text: formatted, source: message.content.source });
    }
    return {
      success: true,
      text: formatted,
      data: {
        name: exercise.name,
        target:
          exercise.target ??
          exercise.targetMuscles?.[0] ??
          exercise.bodyPart ??
          exercise.bodyParts?.[0],
        equipment: exercise.equipment ?? exercise.equipments?.[0],
        gifUrl: exercise.gifUrl ?? exercise.imageUrl ?? exercise.videoUrl,
      },
    };
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "show me a chest workout gif" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Here's a chest exercise you can try.",
          actions: ["GET_WORKOUT_GIF"],
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "give me a yoga pose" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Pulling a yoga pose for you.",
          actions: ["GET_WORKOUT_GIF"],
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "workout gif for biceps please" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Fetching a biceps exercise demo.",
          actions: ["GET_WORKOUT_GIF"],
        },
      },
    ],
  ] satisfies ActionExample[][],
};

export default getWorkoutGifAction;
