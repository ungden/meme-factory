"use client";

import Link from "next/link";
import NextImage from "next/image";
import { useState, useEffect } from "react";
import {
  Sparkles, Zap, Users, Image as ImageIcon, ArrowRight, Palette, Download,
  Layers, Moon, Sun, ChevronDown, ChevronUp, MessageSquare,
  Star, Play, Heart, Flame, PartyPopper, TrendingUp, Gamepad2,
  UtensilsCrossed, Dumbbell, Bitcoin, GraduationCap, HeartHandshake, Briefcase
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { getBlur } from "@/lib/image-blurs";

/* ============================================
   Mascot SVG Components
   Cute cartoon characters drawn with SVG
   ============================================ */

function BearMascot({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 200 200" className={className} style={style} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ears */}
      <circle cx="60" cy="45" r="28" fill="#8B6914" />
      <circle cx="60" cy="45" r="18" fill="#C49A2E" />
      <circle cx="140" cy="45" r="28" fill="#8B6914" />
      <circle cx="140" cy="45" r="18" fill="#C49A2E" />
      {/* Head */}
      <circle cx="100" cy="90" r="55" fill="#C49A2E" />
      {/* Face */}
      <ellipse cx="100" cy="100" rx="35" ry="30" fill="#E8C96A" />
      {/* Eyes */}
      <circle cx="80" cy="82" r="8" fill="#1a1a2e" />
      <circle cx="120" cy="82" r="8" fill="#1a1a2e" />
      <circle cx="83" cy="79" r="3" fill="white" />
      <circle cx="123" cy="79" r="3" fill="white" />
      {/* Nose */}
      <ellipse cx="100" cy="96" rx="8" ry="6" fill="#8B6914" />
      <ellipse cx="100" cy="94" rx="3" ry="2" fill="#C49A2E" />
      {/* Mouth */}
      <path d="M90 104 Q100 114 110 104" stroke="#8B6914" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Blush */}
      <circle cx="68" cy="98" r="8" fill="#FF9999" opacity="0.4" />
      <circle cx="132" cy="98" r="8" fill="#FF9999" opacity="0.4" />
      {/* Body */}
      <ellipse cx="100" cy="165" rx="42" ry="35" fill="#C49A2E" />
      <ellipse cx="100" cy="170" rx="28" ry="22" fill="#E8C96A" />
      {/* Arms */}
      <ellipse cx="55" cy="155" rx="14" ry="22" fill="#C49A2E" transform="rotate(-15 55 155)" />
      <ellipse cx="145" cy="155" rx="14" ry="22" fill="#C49A2E" transform="rotate(15 145 155)" />
      {/* Hoodie */}
      <path d="M68 145 Q100 135 132 145 L128 175 Q100 180 72 175 Z" fill="#7c3aed" opacity="0.9" />
      <path d="M88 145 L88 155 Q100 160 112 155 L112 145" fill="#6d28d9" />
    </svg>
  );
}

function BunnyMascot({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 200 220" className={className} style={style} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ears */}
      <ellipse cx="75" cy="40" rx="16" ry="45" fill="white" stroke="#E8E8F0" strokeWidth="2" />
      <ellipse cx="75" cy="40" rx="9" ry="32" fill="#FFB5C0" />
      <ellipse cx="125" cy="35" rx="16" ry="48" fill="white" stroke="#E8E8F0" strokeWidth="2" />
      <ellipse cx="125" cy="35" rx="9" ry="35" fill="#FFB5C0" />
      {/* Ear fold on right ear */}
      <path d="M118 8 Q135 15 128 5" fill="#E8E8F0" />
      {/* Head */}
      <circle cx="100" cy="110" r="52" fill="white" stroke="#E8E8F0" strokeWidth="2" />
      {/* Eyes - big kawaii eyes */}
      <ellipse cx="82" cy="105" rx="10" ry="12" fill="#1a1a2e" />
      <ellipse cx="118" cy="105" rx="10" ry="12" fill="#1a1a2e" />
      <circle cx="86" cy="100" r="4" fill="white" />
      <circle cx="122" cy="100" r="4" fill="white" />
      <circle cx="80" cy="107" r="2" fill="white" />
      <circle cx="116" cy="107" r="2" fill="white" />
      {/* Nose */}
      <ellipse cx="100" cy="118" rx="5" ry="4" fill="#FFB5C0" />
      {/* Mouth */}
      <path d="M93 123 Q100 130 107 123" stroke="#FFB5C0" strokeWidth="2" fill="none" strokeLinecap="round" />
      <line x1="100" y1="122" x2="100" y2="126" stroke="#FFB5C0" strokeWidth="1.5" />
      {/* Blush */}
      <circle cx="65" cy="118" r="9" fill="#FFB5C0" opacity="0.35" />
      <circle cx="135" cy="118" r="9" fill="#FFB5C0" opacity="0.35" />
      {/* Body */}
      <ellipse cx="100" cy="185" rx="38" ry="32" fill="white" stroke="#E8E8F0" strokeWidth="2" />
      {/* Belly */}
      <ellipse cx="100" cy="188" rx="22" ry="18" fill="#FFF0F3" />
      {/* Arms */}
      <ellipse cx="58" cy="178" rx="12" ry="18" fill="white" stroke="#E8E8F0" strokeWidth="2" transform="rotate(-10 58 178)" />
      <ellipse cx="142" cy="178" rx="12" ry="18" fill="white" stroke="#E8E8F0" strokeWidth="2" transform="rotate(10 142 178)" />
      {/* Bow tie */}
      <path d="M88 158 L100 165 L112 158 L100 170 Z" fill="#FF6B8A" />
      <circle cx="100" cy="164" r="4" fill="#FF4571" />
    </svg>
  );
}

function CatMascot({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 200 200" className={className} style={style} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ears */}
      <path d="M55 55 L40 15 L80 45 Z" fill="#FF8C42" />
      <path d="M60 50 L48 22 L75 45 Z" fill="#FFB88C" />
      <path d="M145 55 L160 15 L120 45 Z" fill="#FF8C42" />
      <path d="M140 50 L152 22 L125 45 Z" fill="#FFB88C" />
      {/* Head */}
      <circle cx="100" cy="85" r="52" fill="#FF8C42" />
      {/* Face patch */}
      <ellipse cx="100" cy="95" rx="38" ry="32" fill="#FFB88C" />
      {/* Eyes - sly cat eyes */}
      <ellipse cx="80" cy="80" rx="10" ry="9" fill="#2D5016" />
      <ellipse cx="120" cy="80" rx="10" ry="9" fill="#2D5016" />
      <ellipse cx="80" cy="80" rx="5" ry="8" fill="#1a1a2e" />
      <ellipse cx="120" cy="80" rx="5" ry="8" fill="#1a1a2e" />
      <circle cx="83" cy="77" r="3" fill="white" />
      <circle cx="123" cy="77" r="3" fill="white" />
      {/* Nose */}
      <path d="M96 93 L100 98 L104 93 Z" fill="#FF6B6B" />
      {/* Mouth */}
      <path d="M92 100 Q96 105 100 100 Q104 105 108 100" stroke="#CC6633" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Whiskers */}
      <line x1="48" y1="88" x2="72" y2="92" stroke="#CC6633" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="45" y1="96" x2="72" y2="96" stroke="#CC6633" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="48" y1="104" x2="72" y2="100" stroke="#CC6633" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="152" y1="88" x2="128" y2="92" stroke="#CC6633" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="155" y1="96" x2="128" y2="96" stroke="#CC6633" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="152" y1="104" x2="128" y2="100" stroke="#CC6633" strokeWidth="1.5" strokeLinecap="round" />
      {/* Blush */}
      <circle cx="66" cy="96" r="7" fill="#FF9999" opacity="0.35" />
      <circle cx="134" cy="96" r="7" fill="#FF9999" opacity="0.35" />
      {/* Body */}
      <ellipse cx="100" cy="160" rx="40" ry="35" fill="#FF8C42" />
      <ellipse cx="100" cy="163" rx="26" ry="22" fill="#FFB88C" />
      {/* Paws */}
      <ellipse cx="60" cy="155" rx="13" ry="18" fill="#FF8C42" transform="rotate(-12 60 155)" />
      <ellipse cx="140" cy="155" rx="13" ry="18" fill="#FF8C42" transform="rotate(12 140 155)" />
      {/* Sunglasses */}
      <rect x="66" y="72" width="28" height="18" rx="6" fill="#1a1a2e" opacity="0.85" />
      <rect x="106" y="72" width="28" height="18" rx="6" fill="#1a1a2e" opacity="0.85" />
      <line x1="94" y1="81" x2="106" y2="81" stroke="#1a1a2e" strokeWidth="2.5" />
      <line x1="66" y1="81" x2="55" y2="76" stroke="#1a1a2e" strokeWidth="2.5" />
      <line x1="134" y1="81" x2="145" y2="76" stroke="#1a1a2e" strokeWidth="2.5" />
      {/* Glasses shine */}
      <path d="M72 76 L78 76" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M112 76 L118 76" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function ChickMascot({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 200 200" className={className} style={style} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Hair tuft */}
      <path d="M95 30 Q100 10 105 30 Q110 15 112 32 Q98 18 95 30" fill="#FFC107" />
      {/* Head */}
      <circle cx="100" cy="80" r="48" fill="#FFD54F" />
      {/* Wing left */}
      <ellipse cx="48" cy="145" rx="18" ry="24" fill="#FFD54F" transform="rotate(-20 48 145)" />
      <ellipse cx="50" cy="145" rx="12" ry="18" fill="#FFE082" transform="rotate(-20 50 145)" />
      {/* Wing right */}
      <ellipse cx="152" cy="145" rx="18" ry="24" fill="#FFD54F" transform="rotate(20 152 145)" />
      <ellipse cx="150" cy="145" rx="12" ry="18" fill="#FFE082" transform="rotate(20 150 145)" />
      {/* Eyes */}
      <circle cx="82" cy="75" r="8" fill="#1a1a2e" />
      <circle cx="118" cy="75" r="8" fill="#1a1a2e" />
      <circle cx="85" cy="72" r="3" fill="white" />
      <circle cx="121" cy="72" r="3" fill="white" />
      {/* Beak */}
      <path d="M92 90 L100 100 L108 90 Z" fill="#FF8F00" />
      {/* Blush */}
      <circle cx="68" cy="90" r="8" fill="#FF9999" opacity="0.3" />
      <circle cx="132" cy="90" r="8" fill="#FF9999" opacity="0.3" />
      {/* Body */}
      <ellipse cx="100" cy="155" rx="42" ry="38" fill="#FFD54F" />
      <ellipse cx="100" cy="160" rx="28" ry="25" fill="#FFE082" />
      {/* Feet */}
      <path d="M78 190 L70 200 L78 198 L82 200 L80 190" fill="#FF8F00" />
      <path d="M118 190 L120 200 L124 198 L130 200 L122 190" fill="#FF8F00" />
      {/* Headphones */}
      <path d="M52 68 Q52 40 100 38 Q148 40 148 68" stroke="#7c3aed" strokeWidth="5" fill="none" />
      <rect x="42" y="60" width="18" height="22" rx="8" fill="#7c3aed" />
      <rect x="140" y="60" width="18" height="22" rx="8" fill="#7c3aed" />
      <rect x="45" y="63" width="12" height="16" rx="5" fill="#9333ea" />
      <rect x="143" y="63" width="12" height="16" rx="5" fill="#9333ea" />
    </svg>
  );
}

function PandaMascot({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 200 200" className={className} style={style} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ears */}
      <circle cx="60" cy="40" r="22" fill="#1a1a2e" />
      <circle cx="140" cy="40" r="22" fill="#1a1a2e" />
      {/* Head */}
      <circle cx="100" cy="85" r="52" fill="white" />
      {/* Eye patches */}
      <ellipse cx="78" cy="80" rx="18" ry="16" fill="#1a1a2e" transform="rotate(-10 78 80)" />
      <ellipse cx="122" cy="80" rx="18" ry="16" fill="#1a1a2e" transform="rotate(10 122 80)" />
      {/* Eyes */}
      <circle cx="78" cy="80" r="7" fill="white" />
      <circle cx="122" cy="80" r="7" fill="white" />
      <circle cx="80" cy="79" r="4" fill="#1a1a2e" />
      <circle cx="124" cy="79" r="4" fill="#1a1a2e" />
      <circle cx="82" cy="77" r="1.5" fill="white" />
      <circle cx="126" cy="77" r="1.5" fill="white" />
      {/* Nose */}
      <ellipse cx="100" cy="96" rx="7" ry="5" fill="#1a1a2e" />
      {/* Mouth */}
      <path d="M93 102 Q100 110 107 102" stroke="#1a1a2e" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Blush */}
      <circle cx="65" cy="98" r="7" fill="#FFB5C0" opacity="0.4" />
      <circle cx="135" cy="98" r="7" fill="#FFB5C0" opacity="0.4" />
      {/* Body */}
      <ellipse cx="100" cy="162" rx="42" ry="35" fill="white" />
      <ellipse cx="100" cy="165" rx="28" ry="22" fill="#F5F5F5" />
      {/* Arms */}
      <ellipse cx="55" cy="155" rx="14" ry="22" fill="#1a1a2e" transform="rotate(-12 55 155)" />
      <ellipse cx="145" cy="155" rx="14" ry="22" fill="#1a1a2e" transform="rotate(12 145 155)" />
      {/* Bamboo */}
      <rect x="148" y="130" width="5" height="60" rx="2" fill="#4CAF50" />
      <path d="M150 140 L165 135 L165 140 L152 143" fill="#66BB6A" />
      <path d="M150 155 L165 150 L165 155 L152 158" fill="#66BB6A" />
    </svg>
  );
}

/* ============================================
   Floating speech bubbles for mascots
   ============================================ */
function SpeechBubble({ text, position = "top", className = "" }: { text: string; position?: "top" | "left" | "right"; className?: string }) {
  return (
    <div className={`absolute px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg whitespace-nowrap ${className}`}
      style={{
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        border: "2px solid var(--border-primary)",
        ...(position === "top" ? { top: "-12px", left: "50%", transform: "translateX(-50%)" } :
           position === "left" ? { top: "30%", right: "105%" } :
           { top: "30%", left: "105%" })
      }}
    >
      {text}
      <div className="absolute w-3 h-3 rotate-45"
        style={{
          background: "var(--bg-card)",
          borderRight: "2px solid var(--border-primary)",
          borderBottom: "2px solid var(--border-primary)",
          ...(position === "top" ? { bottom: "-7px", left: "50%", marginLeft: "-6px" } :
             position === "left" ? { right: "-7px", top: "40%" } :
             { left: "-7px", top: "40%", transform: "rotate(180deg)" })
        }}
      />
    </div>
  );
}

/* ============================================
   Animated sparkle particles
   ============================================ */
function SparkleParticle({ delay, x, y, size = 8 }: { delay: number; x: string; y: string; size?: number }) {
  return (
    <div
      className="absolute animate-sparkle"
      style={{
        left: x, top: y,
        animationDelay: `${delay}s`,
        width: size, height: size,
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
        <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z" fill="#7c3aed" opacity="0.6" />
      </svg>
    </div>
  );
}

/* ============================================
   Main Landing Page
   ============================================ */
export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "var(--bg-primary)" }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl border-b transition-colors duration-300" style={{ backgroundColor: "color-mix(in srgb, var(--bg-primary) 85%, transparent)", borderColor: "var(--border-primary)" }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold th-text-primary">AIDA</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl th-text-secondary th-bg-hover transition-colors"
              aria-label="Chuyển giao diện"
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <Link href="/login" className="px-5 py-2 text-sm font-semibold th-text-secondary th-bg-hover rounded-xl transition-colors">
              Đăng nhập
            </Link>
            <Link href="/login" className="px-5 py-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md shadow-violet-500/20">
              Bắt đầu miễn phí
            </Link>
          </div>
        </div>
      </nav>

      {/* ============================================
         HERO - Mascots flying around
         ============================================ */}
      <section className="relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/8 via-transparent to-pink-500/8" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-violet-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-pink-500/5 rounded-full blur-3xl" />
        <div className="absolute top-40 right-20 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl" />

        {/* Sparkle particles */}
        {mounted && (
          <>
            <SparkleParticle delay={0} x="15%" y="20%" size={10} />
            <SparkleParticle delay={1.5} x="80%" y="15%" size={8} />
            <SparkleParticle delay={0.8} x="70%" y="70%" size={12} />
            <SparkleParticle delay={2.2} x="25%" y="75%" size={7} />
            <SparkleParticle delay={3} x="50%" y="10%" size={9} />
            <SparkleParticle delay={1} x="90%" y="50%" size={6} />
          </>
        )}

        <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28">
          <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
            {/* Text content */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6 th-bg-accent-light th-text-accent border" style={{ borderColor: "var(--accent-border)" }}>
                <Zap size={14} /> Được hỗ trợ bởi AIDA AI
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold th-text-primary mb-6 leading-tight animate-fade-up">
                Xây dựng fanpage<br />
                <span className="bg-gradient-to-r from-violet-600 via-pink-500 to-amber-500 bg-clip-text text-transparent">
                  chuyên nghiệp bằng AI
                </span>
              </h1>
              <p className="text-lg md:text-xl th-text-secondary mb-8 max-w-xl leading-relaxed">
                Tạo nội dung, hình ảnh và meme với nhân vật mascot riêng cho fanpage. AI lo hết từ ý tưởng đến sản phẩm
                &mdash; bạn chỉ cần sáng tạo!
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4 lg:justify-start justify-center">
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-2xl hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-violet-500/25 text-lg"
                >
                  Bắt đầu ngay
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </Link>
                <a href="#demo" className="inline-flex items-center gap-2 px-6 py-4 font-semibold rounded-2xl transition-all th-text-secondary th-bg-hover">
                  <Play size={18} /> Xem demo
                </a>
              </div>
            </div>

            {/* Mascot showcase - right side */}
            <div className="flex-1 relative w-full max-w-lg h-[400px] md:h-[440px]">
              {/* Central meme card — real AI image */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-72 rounded-3xl border-2 shadow-2xl overflow-hidden z-10 animate-float"
                style={{ borderColor: "var(--border-primary)" }}
              >
                <div className="relative w-full h-3/5">
                  <NextImage src="/showcase/chungkhoan.webp" alt="Meme chứng khoán" fill className="object-cover" sizes="224px" placeholder="blur" blurDataURL={getBlur("showcase", "chungkhoan")} />
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-violet-500 to-pink-500 text-white shadow">
                    AI Generated
                  </div>
                </div>
                <div className="p-3" style={{ background: "var(--bg-card)" }}>
                  <p className="font-bold th-text-primary text-sm leading-snug">&ldquo;Khi cổ phiếu tăng trần&rdquo;</p>
                  <p className="text-xs th-text-muted mt-1">Bò Chứng Khoán &bull; Streetwear Flex</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-xs th-text-muted"><Heart size={12} /> 2.4k</span>
                    <span className="flex items-center gap-1 text-xs th-text-muted"><MessageSquare size={12} /> 186</span>
                    <span className="flex items-center gap-1 text-xs th-text-muted"><Flame size={12} /> Viral</span>
                  </div>
                </div>
              </div>

              {/* Background meme cards for depth */}
              <div className="absolute left-1/2 top-1/2 w-44 h-56 rounded-2xl border shadow-lg overflow-hidden z-[5] opacity-60"
                style={{ borderColor: "var(--border-primary)", transform: "translate(-85%, -55%) rotate(-8deg)" }}
              >
                <NextImage src="/showcase/food.webp" alt="Meme ẩm thực" fill className="object-cover" sizes="176px" placeholder="blur" blurDataURL={getBlur("showcase", "food")} />
              </div>
              <div className="absolute left-1/2 top-1/2 w-44 h-56 rounded-2xl border shadow-lg overflow-hidden z-[5] opacity-60"
                style={{ borderColor: "var(--border-primary)", transform: "translate(15%, -45%) rotate(6deg)" }}
              >
                <NextImage src="/showcase/gaming.webp" alt="Meme gaming" fill className="object-cover" sizes="176px" placeholder="blur" blurDataURL={getBlur("showcase", "gaming")} />
              </div>

              {/* Floating mascots around the card */}
              <div className="absolute top-2 left-2 md:left-4 animate-float-slow">
                <div className="relative">
                  <BunnyMascot className="w-24 h-24 md:w-28 md:h-28 drop-shadow-lg" />
                  <SpeechBubble text="Dễ thương quá!" position="right" className="animate-bounce-slow" />
                </div>
              </div>

              <div className="absolute bottom-4 left-0 md:left-2 animate-float-reverse">
                <div className="relative">
                  <ChickMascot className="w-20 h-20 md:w-24 md:h-24 drop-shadow-lg" />
                  <SpeechBubble text="Tạo meme nào!" position="top" className="animate-bounce-slow" />
                </div>
              </div>

              <div className="absolute top-0 right-0 md:right-4 animate-float-delayed">
                <div className="relative">
                  <CatMascot className="w-24 h-24 md:w-28 md:h-28 drop-shadow-lg" />
                  <SpeechBubble text="Cool vãi!" position="left" className="animate-bounce-slow" />
                </div>
              </div>

              <div className="absolute bottom-2 right-2 md:right-8 animate-float">
                <div className="relative">
                  <PandaMascot className="w-20 h-20 md:w-24 md:h-24 drop-shadow-lg" />
                </div>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex items-center justify-center gap-8 md:gap-16 mt-16 pt-8 border-t" style={{ borderColor: "var(--border-primary)" }}>
            {[
              { value: "8+", label: "Phong cách AI", icon: Palette },
              { value: "15", label: "Biểu cảm", icon: Heart },
              { value: "4", label: "Định dạng", icon: Layers },
              { value: "∞", label: "Meme miễn phí", icon: Sparkles },
            ].map((s) => (
              <div key={s.label} className="text-center group">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <s.icon size={16} className="th-text-accent opacity-70 group-hover:opacity-100 transition-opacity" />
                  <p className="text-2xl md:text-3xl font-extrabold th-text-primary">{s.value}</p>
                </div>
                <p className="text-xs md:text-sm th-text-muted">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================
         MASCOT PARADE - scrolling mascot strip
         ============================================ */}
      <section className="py-6 overflow-hidden border-y" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-primary)" }}>
        <div className="flex animate-scroll-left items-center w-max">
          {[...Array(2)].map((_, setIdx) => (
            <div key={setIdx} className="flex gap-12 items-center flex-shrink-0 pr-12">
              <div className="flex items-center gap-3 flex-shrink-0">
                <BearMascot className="w-14 h-14" />
                <span className="text-base font-bold th-text-secondary whitespace-nowrap">Gấu Finance</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <BunnyMascot className="w-14 h-14" />
                <span className="text-base font-bold th-text-secondary whitespace-nowrap">Thỏ Bảy Màu</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <CatMascot className="w-14 h-14" />
                <span className="text-base font-bold th-text-secondary whitespace-nowrap">Mèo Đường Phố</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <ChickMascot className="w-14 h-14" />
                <span className="text-base font-bold th-text-secondary whitespace-nowrap">Gà DJ</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <PandaMascot className="w-14 h-14" />
                <span className="text-base font-bold th-text-secondary whitespace-nowrap">Gấu Trúc Chill</span>
              </div>
              <div className="w-px h-8 flex-shrink-0" style={{ background: "var(--border-secondary)" }} />
            </div>
          ))}
        </div>
      </section>

      {/* ============================================
         DEMO - Real AI-generated meme showcase
         ============================================ */}
      <section id="demo" className="py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-500/3 to-transparent" />
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-4 bg-gradient-to-r from-pink-500/10 to-violet-500/10 th-text-accent">
              <PartyPopper size={14} /> SHOWCASE — TẠO BỞI AI
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold th-text-primary mb-4">Nội dung cho mọi chủ đề fanpage</h2>
            <p className="text-lg th-text-tertiary max-w-2xl mx-auto">
              Chứng khoán, tình yêu, office, gaming, ẩm thực, crypto... Chỉ cần nhập ý tưởng, AI lo hết!
            </p>
          </div>

          {/* Real meme image grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
            {[
              { id: "chungkhoan", title: "Khi cổ phiếu tăng trần", category: "Chứng khoán", icon: TrendingUp, color: "#10b981" },
              { id: "couple", title: "Khi bạn nói 'anh đói' lúc 2h sáng", category: "Couple / Tình yêu", icon: HeartHandshake, color: "#ec4899" },
              { id: "office", title: "Friday 5h chiều vs Monday 8h sáng", category: "Office / Công sở", icon: Briefcase, color: "#6366f1" },
              { id: "gaming", title: "Đêm nay không ngủ, rank phải lên", category: "Gaming", icon: Gamepad2, color: "#7c3aed" },
              { id: "food", title: "Ai nói đi ăn là đi ngay", category: "Ẩm thực", icon: UtensilsCrossed, color: "#f59e0b" },
              { id: "gym", title: "Ngày đầu đi gym", category: "Gym / Fitness", icon: Dumbbell, color: "#ef4444" },
              { id: "crypto", title: "HODL to the moon", category: "Crypto / Tài chính", icon: Bitcoin, color: "#f97316" },
              { id: "student", title: "Thi ngày mai, hôm nay mới học", category: "Học sinh / Sinh viên", icon: GraduationCap, color: "#3b82f6" },
            ].map((meme) => (
              <div key={meme.id} className="group relative rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 cursor-pointer"
                style={{ borderColor: "var(--border-primary)" }}
              >
                <div className="aspect-square relative overflow-hidden">
                  <NextImage
                    src={`/showcase/${meme.id}.webp`}
                    alt={meme.title}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    placeholder="blur"
                    blurDataURL={getBlur("showcase", meme.id)}
                  />
                  {/* Overlay gradient on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                {/* Info bar */}
                <div className="p-3 relative" style={{ background: "var(--bg-card)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <meme.icon size={14} style={{ color: meme.color }} />
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: meme.color }}>{meme.category}</span>
                  </div>
                  <p className="text-xs font-semibold th-text-primary leading-snug line-clamp-2">{meme.title}</p>
                </div>
                {/* AI badge */}
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold bg-black/50 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                  AI Generated
                </div>
              </div>
            ))}
          </div>

          {/* CTA under showcase */}
          <div className="text-center mt-10">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md shadow-violet-500/20"
            >
              Tạo meme cho fanpage của bạn
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================
         FEATURES - with mascot illustrations
         ============================================ */}
      <section id="features" className="py-20" style={{ background: "var(--bg-secondary)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold th-text-primary mb-4">Mọi thứ bạn cần để tạo meme</h2>
            <p className="text-lg th-text-tertiary max-w-2xl mx-auto">
              Từ quản lý nhân vật, tạo nội dung bằng AI đến xuất ảnh nhiều định dạng — tất cả trong một.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Zap size={24} />}
              title="AI Content Engine"
              description="Nhập ý tưởng, AI tạo headline, subtext, caption với giọng điệu chuẩn meme Việt Nam. Hỗ trợ ảnh tham khảo."
              gradient="from-violet-500 to-indigo-500"
              mascot={<BearMascot className="w-28 h-28 opacity-[0.15] absolute -bottom-4 -right-4 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-3 group-hover:opacity-30" />}
            />
            <FeatureCard
              icon={<Users size={24} />}
              title="Hệ thống nhân vật"
              description="Tạo và quản lý nhân vật mascot với nhiều biểu cảm. AI tự động chọn nhân vật phù hợp cho mỗi meme."
              gradient="from-pink-500 to-rose-500"
              mascot={<BunnyMascot className="w-28 h-28 opacity-[0.15] absolute -bottom-4 -right-4 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-3 group-hover:opacity-30" />}
            />
            <FeatureCard
              icon={<Palette size={24} />}
              title="8 phong cách AI"
              description="Streetwear Flex, Chibi Cute, Manga Anime, Pixel Retro... Chọn phong cách phù hợp với fanpage."
              gradient="from-amber-500 to-orange-500"
              mascot={<CatMascot className="w-28 h-28 opacity-[0.15] absolute -bottom-4 -right-4 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-3 group-hover:opacity-30" />}
            />
            <FeatureCard
              icon={<ImageIcon size={24} />}
              title="AI tạo ảnh"
              description="AIDA AI tạo ảnh meme hoàn chỉnh với nhân vật, text overlay và background. Hoặc dùng Canvas tự ghép."
              gradient="from-emerald-500 to-teal-500"
              mascot={<ChickMascot className="w-28 h-28 opacity-[0.15] absolute -bottom-4 -right-4 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-3 group-hover:opacity-30" />}
            />
            <FeatureCard
              icon={<Download size={24} />}
              title="Xuất nhiều định dạng"
              description="1:1 (Feed), 9:16 (Story/Reels), 16:9 (YouTube), 4:5 (IG Portrait). Có watermark tuỳ chỉnh."
              gradient="from-blue-500 to-cyan-500"
              mascot={<PandaMascot className="w-28 h-28 opacity-[0.15] absolute -bottom-4 -right-4 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-3 group-hover:opacity-30" />}
            />
            <FeatureCard
              icon={<Layers size={24} />}
              title="Quản lý dự án"
              description="Mỗi fanpage là một dự án riêng với nhân vật, phong cách và watermark riêng. Lưu trữ mọi meme."
              gradient="from-purple-500 to-fuchsia-500"
              mascot={<BearMascot className="w-28 h-28 opacity-[0.15] absolute -bottom-4 -right-4 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-3 group-hover:opacity-30" />}
            />
          </div>
        </div>
      </section>

      {/* ============================================
         HOW IT WORKS - with mascot illustrations
         ============================================ */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold th-text-primary mb-4">Tạo meme trong 4 bước</h2>
            <p className="text-lg th-text-tertiary">Đơn giản, nhanh chóng và vui!</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { step: "1", title: "Tạo dự án", desc: "Thiết lập fanpage với phong cách và watermark riêng", mascot: <BearMascot className="w-16 h-16" />, color: "from-violet-500 to-indigo-500" },
              { step: "2", title: "Thêm nhân vật", desc: "Upload hoặc tạo nhân vật bằng AI với nhiều biểu cảm", mascot: <BunnyMascot className="w-16 h-16" />, color: "from-pink-500 to-rose-500" },
              { step: "3", title: "Nhập ý tưởng", desc: "Gõ ý tưởng meme, AI tạo nội dung và gợi ý nhân vật", mascot: <CatMascot className="w-16 h-16" />, color: "from-amber-500 to-orange-500" },
              { step: "4", title: "Xuất meme", desc: "Chọn định dạng, tải về hoặc lưu vào thư viện", mascot: <ChickMascot className="w-16 h-16" />, color: "from-emerald-500 to-teal-500" },
            ].map((item, i) => (
              <div key={item.step} className="text-center relative group">
                {i < 3 && (
                  <div className="hidden lg:block absolute top-12 left-[65%] w-[70%] border-t-2 border-dashed" style={{ borderColor: "var(--border-secondary)" }} />
                )}
                <div className={`w-24 h-24 mx-auto rounded-3xl flex items-center justify-center mb-4 relative z-10 bg-gradient-to-br ${item.color} shadow-lg group-hover:scale-110 transition-transform`}>
                  {item.mascot}
                </div>
                <div className="absolute -top-1 -right-1 md:right-[calc(50%-3rem)] w-7 h-7 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center justify-center z-20 shadow-md">
                  <span className="text-white text-xs font-bold">{item.step}</span>
                </div>
                <h3 className="font-bold th-text-primary mb-2 text-lg">{item.title}</h3>
                <p className="text-sm th-text-tertiary leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================
         STYLE SHOWCASE - 8 AI styles
         ============================================ */}
      <section className="py-20" style={{ background: "var(--bg-secondary)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold th-text-primary mb-4">8 phong cách AI độc đáo</h2>
            <p className="text-lg th-text-tertiary max-w-2xl mx-auto">
              Mỗi phong cách mang đến diện mạo riêng cho mascot của bạn
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: "Streetwear Flex", desc: "Hoodie, sneakers, chains", color: "#7c3aed", emoji: "🔥" },
              { name: "Chibi Cute", desc: "Đầu to, mắt tròn", color: "#ec4899", emoji: "🌸" },
              { name: "Flat Vector", desc: "Hình học, tối giản", color: "#3b82f6", emoji: "📐" },
              { name: "Manga Anime", desc: "Mắt anime, cel shading", color: "#ef4444", emoji: "⚡" },
              { name: "Watercolor Soft", desc: "Pastel, healing", color: "#a855f7", emoji: "🎨" },
              { name: "Pixel Retro", desc: "32-bit, retro gaming", color: "#10b981", emoji: "👾" },
              { name: "Graffiti Urban", desc: "Street art, neon", color: "#f59e0b", emoji: "🎤" },
              { name: "Corporate Mascot", desc: "Chuyên nghiệp, sạch", color: "#6366f1", emoji: "💼" },
            ].map((s) => (
              <div
                key={s.name}
                className="group relative p-5 rounded-2xl border overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-default"
                style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
              >
                <div className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity" style={{ background: s.color }} />
                <span className="text-3xl mb-3 block">{s.emoji}</span>
                <h3 className="font-bold th-text-primary text-sm mb-1">{s.name}</h3>
                <p className="text-xs th-text-muted">{s.desc}</p>
                <div className="mt-3 w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                  <div className="h-full rounded-full w-0 group-hover:w-full transition-all duration-500" style={{ background: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================
         TESTIMONIALS
         ============================================ */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold th-text-primary mb-4">Content creators yêu thích</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: "Minh Quân",
                role: "Admin Bò và Gấu Finance",
                text: "Trước giờ mỗi ngày mất 2-3 tiếng làm meme. Giờ chỉ cần 15 phút là xong. AI hiểu rất tốt giọng điệu fanpage mình.",
                stars: 5,
                mascot: <BearMascot className="w-10 h-10" />,
              },
              {
                name: "Thu Trang",
                role: "Content Creator @ThỏMeme",
                text: "Tính năng tạo nhân vật bằng AI siêu tiện. Upload một kiểu, AI tạo thêm hàng chục biểu cảm khác nhau.",
                stars: 5,
                mascot: <BunnyMascot className="w-10 h-10" />,
              },
              {
                name: "Đức Anh",
                role: "Social Media Manager",
                text: "Quản lý 5 fanpage cùng lúc mà không cần thuê designer. Mỗi dự án riêng biệt, không bị lẫn. Recommend 100%.",
                stars: 5,
                mascot: <CatMascot className="w-10 h-10" />,
              },
            ].map((t) => (
              <div
                key={t.name}
                className="group p-6 rounded-2xl border transition-all duration-300 hover:shadow-xl hover:-translate-y-2"
                style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} size={16} fill="var(--warning)" style={{ color: "var(--warning)" }} />
                  ))}
                </div>
                <p className="th-text-secondary text-sm leading-relaxed mb-5">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center" style={{ background: "var(--bg-tertiary)" }}>
                    {t.mascot}
                  </div>
                  <div>
                    <p className="font-semibold th-text-primary text-sm">{t.name}</p>
                    <p className="text-xs th-text-muted">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================
         FAQ
         ============================================ */}
      <section className="py-20" style={{ background: "var(--bg-secondary)" }}>
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold th-text-primary mb-4">Câu hỏi thường gặp</h2>
          </div>
          <div className="space-y-3">
            <FaqItem q="AIDA có miễn phí không?" a="Tính năng tạo nội dung AI hoàn toàn miễn phí! Tạo hình ảnh AI sử dụng hệ thống điểm (points) với giá rất hợp lý." />
            <FaqItem q="Cần kinh nghiệm thiết kế không?" a="Không cần. AI tự động tạo nội dung, chọn nhân vật và ghép ảnh. Bạn chỉ cần nhập ý tưởng bằng tiếng Việt." />
            <FaqItem q="Hỗ trợ những phong cách nào?" a="8 phong cách: Streetwear Flex, Chibi Cute, Flat Vector, Manga Anime, Watercolor, Pixel Retro, Graffiti Urban, Corporate Mascot." />
            <FaqItem q="Có thể dùng cho fanpage kinh doanh không?" a="Hoàn toàn được. Mỗi fanpage là một dự án riêng với watermark, phong cách và nhân vật riêng." />
            <FaqItem q="Ảnh xuất ra chất lượng thế nào?" a="Ảnh xuất độ phân giải cao (1080px+), phù hợp Facebook, Instagram, TikTok, YouTube." />
            <FaqItem q="Dữ liệu có an toàn không?" a="Toàn bộ dữ liệu lưu trên Supabase với Row Level Security. Chỉ bạn mới truy cập được dự án của mình." />
          </div>
        </div>
      </section>

      {/* ============================================
         CTA - with mascots
         ============================================ */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="relative p-10 md:p-16 rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 overflow-hidden">
            {/* Decorative blobs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

            {/* Floating mascots in CTA */}
            <div className="absolute left-4 md:left-8 bottom-4 md:bottom-8 opacity-30 animate-float-slow">
              <BunnyMascot className="w-20 h-20 md:w-28 md:h-28" />
            </div>
            <div className="absolute right-4 md:right-8 bottom-4 md:bottom-8 opacity-30 animate-float-delayed">
              <CatMascot className="w-20 h-20 md:w-28 md:h-28" />
            </div>

            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4 relative z-10">
              Sẵn sàng xây dựng fanpage?
            </h2>
            <p className="text-lg text-white/80 mb-8 relative z-10">
              Tham gia cùng hàng nghìn content creators Việt Nam. Bắt đầu miễn phí ngay hôm nay.
            </p>
            <Link
              href="/login"
              className="relative z-10 group inline-flex items-center gap-2 px-8 py-4 bg-white text-violet-700 font-bold rounded-2xl hover:bg-gray-100 transition-all text-lg shadow-xl"
            >
              Bắt đầu ngay
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================
         FOOTER
         ============================================ */}
      <footer className="border-t py-10" style={{ borderColor: "var(--border-primary)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Sparkles size={14} className="text-white" />
              </div>
              <span className="font-bold th-text-primary">AIDA</span>
              <div className="flex items-center gap-1 ml-2">
                <BearMascot className="w-5 h-5" />
                <BunnyMascot className="w-5 h-5" />
                <CatMascot className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm th-text-muted">
              <span>Powered by AIDA AI</span>
              <span>|</span>
              <span>Dành cho content creators Việt Nam</span>
            </div>
            <p className="text-sm th-text-muted">
              &copy; {new Date().getFullYear()} AIDA
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ============================================
   Sub-components
   ============================================ */

function FeatureCard({ icon, title, description, gradient, mascot }: {
  icon: React.ReactNode; title: string; description: string; gradient: string; mascot?: React.ReactNode
}) {
  return (
    <div className="group relative p-6 rounded-2xl border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div className={`relative z-10 w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br ${gradient} text-white shadow-md group-hover:scale-110 transition-transform duration-300`}>
        {icon}
      </div>
      <h3 className="relative z-10 text-lg font-semibold th-text-primary mb-2 group-hover:text-violet-600 transition-colors">{title}</h3>
      <p className="relative z-10 text-sm th-text-tertiary leading-relaxed">{description}</p>
      {mascot}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all"
      style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <span className="font-semibold th-text-primary text-sm pr-4">{q}</span>
        {open ? <ChevronUp size={18} className="th-text-muted flex-shrink-0" /> : <ChevronDown size={18} className="th-text-muted flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 -mt-1">
          <p className="text-sm th-text-secondary leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}
