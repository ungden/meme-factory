#!/usr/bin/env node

/**
 * Generate branding assets: favicons, apple-touch-icon, OG image
 */

import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const publicDir = join(rootDir, "public");

// ============================================
// 1. Generate favicon SVG (icon only, no text)
// ============================================
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
    <linearGradient id="star" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <circle cx="165" cy="170" r="48" fill="#C49A2E"/>
  <circle cx="165" cy="170" r="32" fill="#E8C96A"/>
  <circle cx="347" cy="170" r="48" fill="#C49A2E"/>
  <circle cx="347" cy="170" r="32" fill="#E8C96A"/>
  <circle cx="256" cy="270" r="110" fill="#C49A2E"/>
  <ellipse cx="256" cy="290" rx="72" ry="60" fill="#E8C96A"/>
  <circle cx="218" cy="255" r="17" fill="#1a1a2e"/>
  <circle cx="294" cy="255" r="17" fill="#1a1a2e"/>
  <circle cx="224" cy="249" r="6" fill="white"/>
  <circle cx="300" cy="249" r="6" fill="white"/>
  <ellipse cx="256" cy="286" rx="14" ry="10" fill="#8B6914"/>
  <ellipse cx="256" cy="283" rx="5" ry="3.5" fill="#C49A2E"/>
  <path d="M234 302 Q256 322 278 302" stroke="#8B6914" stroke-width="5" fill="none" stroke-linecap="round"/>
  <circle cx="193" cy="295" r="14" fill="#FF9999" opacity="0.4"/>
  <circle cx="319" cy="295" r="14" fill="#FF9999" opacity="0.4"/>
  <path d="M410 105 L418 129 L442 137 L418 145 L410 169 L402 145 L378 137 L402 129Z" fill="url(#star)"/>
  <path d="M120 370 L124 382 L136 386 L124 390 L120 402 L116 390 L104 386 L116 382Z" fill="url(#star)" opacity="0.7"/>
</svg>`;

// ============================================
// 2. Generate OG Image SVG (1200x630)
// ============================================
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" fill="none">
  <defs>
    <linearGradient id="ogbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="50%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#6d28d9"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="1200" height="630" fill="url(#ogbg)"/>
  <!-- Decorative circles -->
  <circle cx="100" cy="530" r="200" fill="white" opacity="0.03"/>
  <circle cx="1100" cy="100" r="250" fill="white" opacity="0.03"/>
  <circle cx="900" cy="500" r="150" fill="white" opacity="0.02"/>

  <!-- Bear mascot (left side) -->
  <g transform="translate(120, 140) scale(0.7)">
    <circle cx="165" cy="155" r="52" fill="#C49A2E"/>
    <circle cx="165" cy="155" r="34" fill="#E8C96A"/>
    <circle cx="347" cy="155" r="52" fill="#C49A2E"/>
    <circle cx="347" cy="155" r="34" fill="#E8C96A"/>
    <circle cx="256" cy="240" r="105" fill="#C49A2E"/>
    <ellipse cx="256" cy="260" rx="70" ry="58" fill="#E8C96A"/>
    <circle cx="220" cy="230" r="16" fill="#1a1a2e"/>
    <circle cx="292" cy="230" r="16" fill="#1a1a2e"/>
    <circle cx="226" cy="224" r="6" fill="white"/>
    <circle cx="298" cy="224" r="6" fill="white"/>
    <ellipse cx="256" cy="258" rx="14" ry="10" fill="#8B6914"/>
    <path d="M234 274 Q256 296 278 274" stroke="#8B6914" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <circle cx="195" cy="265" r="14" fill="#FF9999" opacity="0.4"/>
    <circle cx="317" cy="265" r="14" fill="#FF9999" opacity="0.4"/>
  </g>

  <!-- Sparkles -->
  <path d="M480 80 L486 98 L504 104 L486 110 L480 128 L474 110 L456 104 L474 98Z" fill="#fbbf24"/>
  <path d="M380 450 L384 462 L396 466 L384 470 L380 482 L376 470 L364 466 L376 462Z" fill="#fbbf24" opacity="0.6"/>
  <path d="M1050 380 L1054 392 L1066 396 L1054 400 L1050 412 L1046 400 L1034 396 L1046 392Z" fill="#fbbf24" opacity="0.5"/>

  <!-- Title text -->
  <text x="560" y="220" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="72" fill="white">Meme Factory</text>

  <!-- Subtitle -->
  <text x="560" y="290" font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="28" fill="white" opacity="0.85">Công cụ tạo meme AI cho fanpage Việt Nam</text>

  <!-- Feature pills -->
  <rect x="560" y="330" width="160" height="40" rx="20" fill="white" opacity="0.15"/>
  <text x="640" y="356" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="600" font-size="16" fill="white">8 Phong cách AI</text>

  <rect x="740" y="330" width="180" height="40" rx="20" fill="white" opacity="0.15"/>
  <text x="830" y="356" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="600" font-size="16" fill="white">15 Biểu cảm</text>

  <rect x="940" y="330" width="160" height="40" rx="20" fill="white" opacity="0.15"/>
  <text x="1020" y="356" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="600" font-size="16" fill="white">100% Miễn phí</text>

  <!-- URL -->
  <text x="560" y="540" font-family="system-ui, -apple-system, sans-serif" font-weight="400" font-size="22" fill="white" opacity="0.5">meme-factory-bice.vercel.app</text>

  <!-- Powered by badge -->
  <rect x="560" y="440" width="220" height="36" rx="18" fill="white" opacity="0.1"/>
  <text x="670" y="464" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="600" font-size="15" fill="white" opacity="0.7">⚡ Powered by Gemini AI</text>
</svg>`;

async function main() {
  console.log("🎨 Generating branding assets...\n");

  // Favicon sizes
  const sizes = [16, 32, 48, 96, 128, 180, 192, 512];
  const svgBuffer = Buffer.from(faviconSvg);

  for (const size of sizes) {
    const output = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();

    if (size === 180) {
      writeFileSync(join(publicDir, "apple-touch-icon.png"), output);
      console.log(`   ✅ apple-touch-icon.png (${size}x${size}, ${(output.length/1024).toFixed(0)}KB)`);
    }
    if (size === 192 || size === 512) {
      writeFileSync(join(publicDir, `icon-${size}.png`), output);
      console.log(`   ✅ icon-${size}.png (${(output.length/1024).toFixed(0)}KB)`);
    }
    if (size === 32) {
      writeFileSync(join(publicDir, "favicon-32x32.png"), output);
      console.log(`   ✅ favicon-32x32.png (${(output.length/1024).toFixed(0)}KB)`);
    }
    if (size === 16) {
      writeFileSync(join(publicDir, "favicon-16x16.png"), output);
      console.log(`   ✅ favicon-16x16.png (${(output.length/1024).toFixed(0)}KB)`);
    }
  }

  // ICO (32x32 PNG as .ico — browsers accept PNG in .ico)
  const ico32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  writeFileSync(join(publicDir, "favicon.ico"), ico32);
  console.log(`   ✅ favicon.ico (${(ico32.length/1024).toFixed(0)}KB)`);

  // Favicon SVG
  writeFileSync(join(publicDir, "favicon.svg"), faviconSvg);
  console.log(`   ✅ favicon.svg`);

  // OG Image
  const ogBuffer = Buffer.from(ogSvg);
  const ogPng = await sharp(ogBuffer)
    .resize(1200, 630)
    .png({ quality: 90 })
    .toBuffer();
  writeFileSync(join(publicDir, "og-image.png"), ogPng);
  console.log(`   ✅ og-image.png (1200x630, ${(ogPng.length/1024).toFixed(0)}KB)`);

  // Also WebP version for faster load
  const ogWebp = await sharp(ogBuffer)
    .resize(1200, 630)
    .webp({ quality: 85 })
    .toBuffer();
  writeFileSync(join(publicDir, "og-image.webp"), ogWebp);
  console.log(`   ✅ og-image.webp (1200x630, ${(ogWebp.length/1024).toFixed(0)}KB)`);

  // Web manifest
  const manifest = {
    name: "Meme Factory",
    short_name: "MemeFactory",
    description: "Công cụ tạo meme AI cho fanpage Việt Nam",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c3aed",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  writeFileSync(join(publicDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`   ✅ manifest.json`);

  console.log("\n✨ All branding assets generated!");
}

main().catch(console.error);
