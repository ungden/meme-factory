let cachedGeminiApiKey: string | null = null;

function fromEnv(): string | null {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key.startsWith("your_")) return null;
  return key;
}

export async function getGeminiApiKey(): Promise<string> {
  if (cachedGeminiApiKey) return cachedGeminiApiKey;

  const envKey = fromEnv();
  if (envKey) {
    cachedGeminiApiKey = envKey;
    return envKey;
  }

  throw new Error("AI_KEY_NOT_CONFIGURED");
}

let cachedOpenAiApiKey: string | null = null;

function openAiFromEnv(): string | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.startsWith("your_")) return null;
  return key;
}

/** Optional: the app falls back to Gemini when OpenAI is not configured. */
export function hasOpenAiApiKey(): boolean {
  return Boolean(cachedOpenAiApiKey || openAiFromEnv());
}

export async function getOpenAiApiKey(): Promise<string> {
  if (cachedOpenAiApiKey) return cachedOpenAiApiKey;

  const envKey = openAiFromEnv();
  if (envKey) {
    cachedOpenAiApiKey = envKey;
    return envKey;
  }

  throw new Error("OPENAI_KEY_NOT_CONFIGURED");
}
