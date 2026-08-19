#!/usr/bin/env node

/**
 * Vietnamese diacritics: Gemini vs GPT Image 2, same prompt, side by side.
 *
 * The claim being tested is that gpt-image-2 draws Vietnamese type more cleanly.
 * OpenAI's own docs only promise "improved text rendering" and name no language,
 * so this settles it with one paid image per provider instead of an argument.
 *
 * Usage:
 *   node scripts/compare-vietnamese-text.mjs
 *   node scripts/compare-vietnamese-text.mjs "CÂU CỦA BẠN"
 *
 * Needs GEMINI_API_KEY and OPENAI_API_KEY in .env (or the shell).
 * Cost: about 0.067 USD on Gemini + 0.053 USD on GPT Image 2 (medium).
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

// Diacritics stacked on top of each other, plus đ and ơ/ư — the exact glyphs that
// break first when a model draws Vietnamese.
const HEADLINE = process.argv[2] || "ỦA EM? ĐỖ ĐẠT ƯỚC MƠ";
const SUBTEXT = "Ế ẩm quá trời quỷ thần ơi";

const PROMPT = `Dựng một ảnh meme 3D vuông cho fanpage Việt Nam.

NHÂN VẬT: một chú bò vàng nhân hoá, lông nhung mềm, mắt to tròn, biểu cảm ngơ ngác.

CHỮ TRÊN ẢNH — BẮT BUỘC VẼ CHÍNH XÁC, ĐÚNG TỪNG DẤU:
Dòng lớn phía trên: "${HEADLINE}"
Dòng nhỏ phía dưới: "${SUBTEXT}"
Font đậm, chữ trắng viền đen dày, dễ đọc, căn giữa.
Tiếng Việt có dấu đầy đủ. KHÔNG được bỏ dấu, KHÔNG được thay chữ khác.

PHONG CÁCH: render 3D, ánh sáng studio dịu, nền kem ngà, không viền nét kiểu truyện tranh.`;

const outDir = join("artifacts", "vietnamese-text-compare");
mkdirSync(outDir, { recursive: true });

async function gemini() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return { skipped: "GEMINI_API_KEY chưa có" };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
        },
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) return { error: payload?.error?.message || `HTTP ${response.status}` };

  const part = payload?.candidates?.[0]?.content?.parts?.find((entry) => entry.inlineData?.data);
  if (!part) return { error: "không có ảnh trả về" };
  return { base64: part.inlineData.data, usage: payload.usageMetadata };
}

async function openai() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { skipped: "OPENAI_API_KEY chưa có" };

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt: PROMPT,
      n: 1,
      size: "1024x1024",
      quality: "medium",
      output_format: "png",
    }),
  });

  const payload = await response.json();
  if (!response.ok) return { error: payload?.error?.message || `HTTP ${response.status}` };

  const image = payload?.data?.[0]?.b64_json;
  if (!image) return { error: "không có ảnh trả về" };
  return { base64: image, usage: payload.usage };
}

function save(name, result) {
  if (result.skipped) return console.log(`- ${name}: bỏ qua (${result.skipped})`);
  if (result.error) return console.log(`- ${name}: LỖI — ${result.error}`);
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(result.base64, "base64"));
  const kb = Math.round(Buffer.from(result.base64, "base64").length / 1024);
  console.log(`- ${name}: ${file} (${kb} KB)`);
  if (result.usage) console.log(`  usage: ${JSON.stringify(result.usage)}`);
}

console.log(`Câu thử: "${HEADLINE}" / "${SUBTEXT}"\n`);
const [g, o] = await Promise.all([gemini(), openai()]);
save("gemini-3.1-flash-image", g);
save("gpt-image-2-medium", o);
console.log(`\nMở thư mục ${outDir} để so hai ảnh.`);
