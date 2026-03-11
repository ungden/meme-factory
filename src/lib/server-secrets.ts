import { createClient } from "@supabase/supabase-js";

let cachedGeminiApiKey: string | null = null;

function fromEnv(): string | null {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key.startsWith("your_")) return null;
  return key;
}

function extractStringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const maybe = value as Record<string, unknown>;
    const nested = maybe.apiKey ?? maybe.key ?? maybe.value;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return null;
}

async function fromSupabaseSettings(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;

  const supabaseAdmin = createClient(url, serviceRole);
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", ["gemini_api_key", "GEMINI_API_KEY", "google_api_key", "GOOGLE_API_KEY"])
    .limit(4);

  if (error || !data?.length) return null;

  const priority = ["gemini_api_key", "GEMINI_API_KEY", "google_api_key", "GOOGLE_API_KEY"];
  data.sort((a, b) => priority.indexOf(a.key) - priority.indexOf(b.key));

  for (const row of data) {
    const key = extractStringValue(row.value);
    if (key) return key;
  }

  return null;
}

export async function getGeminiApiKey(): Promise<string> {
  if (cachedGeminiApiKey) return cachedGeminiApiKey;

  const envKey = fromEnv();
  if (envKey) {
    cachedGeminiApiKey = envKey;
    return envKey;
  }

  const supabaseKey = await fromSupabaseSettings();
  if (supabaseKey) {
    cachedGeminiApiKey = supabaseKey;
    return supabaseKey;
  }

  throw new Error("AI_KEY_NOT_CONFIGURED");
}
