import "server-only";

import crypto from "node:crypto";
import {
  AI_PRICE_MARKUP_MULTIPLIER,
  AI_PRICING_USD_VND,
  BILLING_POINT_FLOOR_VND,
} from "@/lib/ai-pricing";

const API = "https://api.wavespeed.ai/api/v3";
export const WAVESPEED_SEEDANCE_IMAGE_TO_VIDEO_MODEL =
  "bytedance/seedance-2.5/image-to-video";
export const WAVESPEED_SEEDANCE_TEXT_TO_VIDEO_MODEL =
  "bytedance/seedance-2.5/text-to-video";
// Kept as a compatibility export for jobs created before the separate video tool.
export const WAVESPEED_SEEDANCE_MODEL = WAVESPEED_SEEDANCE_IMAGE_TO_VIDEO_MODEL;

export type VideoRequest = {
  mode: "text" | "image";
  prompt: string;
  image?: string;
  lastImage?: string;
  referenceImages?: string[];
  aspectRatio?: "9:16" | "1:1" | "16:9";
  duration: 5 | 10 | 15 | 30;
  resolution: "720p" | "1080p";
  generateAudio: boolean;
};

export function getSeedanceModel(input: Pick<VideoRequest, "mode">) {
  return input.mode === "text"
    ? WAVESPEED_SEEDANCE_TEXT_TO_VIDEO_MODEL
    : WAVESPEED_SEEDANCE_IMAGE_TO_VIDEO_MODEL;
}

function providerInputs(input: VideoRequest) {
  const common = {
    prompt: input.prompt,
    duration: input.duration,
    resolution: input.resolution,
    generate_audio: input.generateAudio,
  };
  if (input.mode === "text") {
    return {
      ...common,
      aspect_ratio: input.aspectRatio ?? "9:16",
      ...(input.referenceImages?.length
        ? { reference_images: input.referenceImages }
        : {}),
    };
  }
  if (!input.image)
    throw new Error("Ảnh đầu là bắt buộc khi tạo video từ ảnh.");
  return {
    ...common,
    image: input.image,
    ...(input.lastImage ? { last_image: input.lastImage } : {}),
  };
}

function apiKey() {
  const key = process.env.WAVESPEED_API_KEY;
  if (!key || key.startsWith("your_"))
    throw new Error("WAVESPEED_API_KEY_NOT_CONFIGURED");
  return key;
}

async function request(path: string, init: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      json?.message || json?.error || `WaveSpeed error ${response.status}`,
    );
  return json?.data ?? json;
}

export async function quoteSeedanceVideo(input: VideoRequest) {
  const data = await request("/model/price", {
    method: "POST",
    body: JSON.stringify({
      model_id: getSeedanceModel(input),
      inputs: providerInputs(input),
    }),
  });
  const providerCostUsd = Number(data.discounted_price ?? data.price);
  if (!Number.isFinite(providerCostUsd) || providerCostUsd <= 0)
    throw new Error("WAVESPEED_PRICE_UNAVAILABLE");
  const customerVnd = Math.ceil(
    providerCostUsd * AI_PRICE_MARKUP_MULTIPLIER * AI_PRICING_USD_VND,
  );
  return {
    providerCostUsd,
    customerPoints: Math.max(
      1,
      Math.ceil(customerVnd / BILLING_POINT_FLOOR_VND),
    ),
    customerVnd,
    raw: data,
  };
}

export async function submitSeedanceVideo(
  input: VideoRequest,
  webhook: string,
) {
  const endpoint =
    input.mode === "text"
      ? "/bytedance/seedance-2.5/text-to-video"
      : "/bytedance/seedance-2.5/image-to-video";
  return request(`${endpoint}?webhook=${encodeURIComponent(webhook)}`, {
    method: "POST",
    body: JSON.stringify(providerInputs(input)),
  });
}

export async function getWaveSpeedPrediction(id: string) {
  return request(`/predictions/${encodeURIComponent(id)}/result`, {
    method: "GET",
  });
}

export function verifyWaveSpeedWebhook(headers: Headers, rawBody: string) {
  const secret = process.env.WAVESPEED_WEBHOOK_SECRET?.replace(/^whsec_/, "");
  if (!secret) throw new Error("WAVESPEED_WEBHOOK_SECRET_NOT_CONFIGURED");
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature")?.replace(/^v3,/, "");
  if (
    !id ||
    !timestamp ||
    !signature ||
    !Number.isFinite(Number(timestamp)) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(signature, "hex");
  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
