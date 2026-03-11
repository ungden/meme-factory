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
