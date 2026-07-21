"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  CaretDown,
  ImagesSquare,
  Moon,
  Sparkle,
  Sun,
  TiktokLogo,
  TrendUp,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/theme-provider";
import { createClient } from "@/lib/supabase/client";

const formats = [
  { icon: ImagesSquare, label: "Meme & social", note: "Nhanh, đúng giọng fanpage" },
  { icon: TiktokLogo, label: "TikTok & Reels", note: "Hook, cảnh và caption" },
  { icon: TrendUp, label: "Quảng cáo", note: "Một campaign, nhiều tỷ lệ" },
  { icon: Sparkle, label: "Bộ ảnh thương hiệu", note: "Giữ nhân vật xuyên suốt" },
];

const steps = [
  ["01", "Chọn nhân vật", "Khoá diện mạo, cá tính và giọng nói để dùng lại mỗi ngày."],
  ["02", "Nói ý tưởng", "AIDA hỗ trợ viết hook, caption và shot direction bằng tiếng Việt."],
  ["03", "Nhận cả bộ content", "Xuất meme, social post, TikTok và quảng cáo từ cùng một ý tưởng."],
];

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [idea, setIdea] = useState("");
  const promptRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: unknown } }) => {
      setUser(data.user as { email?: string } | null);
    });
  }, []);

  const appHref = user ? "/projects" : "/login";

  function focusComposer() {
    promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => promptRef.current?.focus(), 450);
  }

  function submitIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = idea.trim() ? `?idea=${encodeURIComponent(idea.trim())}` : "";
    window.location.href = `${appHref}${query}`;
  }

  return (
    <div className="media-home min-h-screen overflow-x-hidden">
      <nav className="media-nav sticky top-0 z-50">
        <div className="mx-auto flex h-[78px] max-w-[1420px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href="/" className="group flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            <span className="media-logo flex h-10 w-10 items-center justify-center rounded-[13px] text-white">
              <Sparkle size={21} weight="fill" />
            </span>
            <span className="text-[23px] font-extrabold tracking-[-0.045em]">AIDA</span>
            <span className="media-studio-label hidden text-[11px] font-semibold uppercase tracking-[0.21em] sm:inline">Media Studio</span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-3">
            <a href="#how" className="media-nav-link hidden rounded-full px-4 py-2.5 text-sm font-medium lg:inline-flex">Cách hoạt động</a>
            <button
              type="button"
              onClick={toggleTheme}
              className="media-nav-link inline-flex h-10 w-10 items-center justify-center rounded-full"
              aria-label={theme === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng"}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            {!user && <Link href="/login" className="media-nav-link hidden rounded-full px-4 py-2.5 text-sm font-medium md:inline-flex">Đăng nhập</Link>}
            <Link href={appHref} className="media-primary-button ml-1 inline-flex h-11 items-center gap-2 rounded-[11px] px-4 text-sm font-semibold text-white sm:px-5">
              <span className="hidden sm:inline">{user ? "Mở Studio" : "Bắt đầu miễn phí"}</span>
              <span className="sm:hidden">Bắt đầu</span>
              <ArrowRight size={17} weight="bold" />
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="media-hero">
          <div className="mx-auto max-w-[1420px] px-5 pb-8 pt-8 sm:px-8 lg:px-12 lg:pb-12 lg:pt-10">
            <div className="grid items-center gap-5 lg:min-h-[610px] lg:grid-cols-[0.82fr_1.18fr] lg:gap-0">
              <div className="relative z-10 max-w-[590px] py-8 lg:py-0">
                <p className="media-hand-note mb-2 ml-auto hidden w-fit rotate-[-4deg] text-[25px] text-[#f05a32] md:block">cùng một nhân vật</p>
                <h1 className="media-display text-[54px] font-extrabold leading-[0.99] tracking-[-0.065em] sm:text-[68px] lg:text-[80px] xl:text-[88px]">
                  Một ý tưởng.
                  <br />
                  Đủ content
                  <br />
                  để đăng.
                </h1>
                <p className="media-copy mt-6 max-w-[500px] text-[16px] leading-[1.72] sm:text-[18px]">
                  Giữ nguyên nhân vật, đổi format linh hoạt — từ meme đến TikTok, quảng cáo và bài viết mỗi ngày.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <button type="button" onClick={focusComposer} className="media-primary-button inline-flex h-[54px] items-center gap-3 rounded-xl px-6 text-[16px] font-semibold text-white">
                    Tạo content ngay <ArrowRight size={20} weight="bold" />
                  </button>
                  <a href="#formats" className="media-text-link inline-flex items-center gap-2 px-2 py-3 text-sm font-semibold">
                    Xem các format <ArrowDown size={16} weight="bold" />
                  </a>
                </div>
              </div>

              <div className="media-collage relative -mr-5 min-h-[430px] sm:-mr-8 sm:min-h-[560px] lg:-mr-12 lg:min-h-[650px]">
                <Image
                  src="/media-studio/foxy-media-collage.png"
                  alt="Cùng nhân vật cáo Foxy trong meme, TikTok, quảng cáo cà phê và bài đăng fanpage"
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 62vw"
                  className="object-contain object-center"
                />
              </div>
            </div>

            <form onSubmit={submitIdea} className="media-composer relative z-20 mx-auto mt-1 max-w-[1260px] rounded-[24px] p-3 sm:p-4">
              <label htmlFor="media-idea" className="media-hand-note absolute -top-12 left-4 hidden -rotate-2 text-[26px] md:block">Ý tưởng hôm nay là gì?</label>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <input
                  ref={promptRef}
                  id="media-idea"
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  className="media-idea-input min-w-0 flex-1 rounded-[15px] px-4 py-3.5 text-[15px] outline-none"
                  placeholder="Ví dụ: Content cà phê sáng cho dân văn phòng..."
                  aria-label="Ý tưởng content"
                />
                <div className="grid gap-2 sm:grid-cols-2 xl:flex">
                  <label className="media-select flex min-w-[168px] cursor-pointer items-center gap-2 rounded-[15px] px-3 py-2">
                    <Image src="/media-studio/foxy-master.png" alt="Foxy" width={38} height={38} className="h-9 w-9 rounded-full object-cover" />
                    <span className="min-w-0 flex-1"><small>Nhân vật</small><strong>Foxy</strong></span>
                    <select aria-label="Chọn nhân vật" defaultValue="Foxy"><option>Foxy</option><option>Thêm nhân vật mới</option></select>
                    <CaretDown size={14} />
                  </label>
                  <label className="media-select flex min-w-[190px] cursor-pointer items-center gap-2 rounded-[15px] px-3 py-2">
                    <span className="media-select-icon">Aa</span>
                    <span className="min-w-0 flex-1"><small>Giọng nói</small><strong>Thân thiện, dí dỏm</strong></span>
                    <select aria-label="Chọn giọng nói" defaultValue="Thân thiện, dí dỏm"><option>Thân thiện, dí dỏm</option><option>Sang, tối giản</option><option>Năng động Gen Z</option><option>Chuyên gia đáng tin</option></select>
                    <CaretDown size={14} />
                  </label>
                  <label className="media-select flex min-w-[178px] cursor-pointer items-center gap-2 rounded-[15px] px-3 py-2">
                    <span className="media-select-icon">4:5</span>
                    <span className="min-w-0 flex-1"><small>Đầu ra</small><strong>Bộ 4 format</strong></span>
                    <select aria-label="Chọn định dạng" defaultValue="Bộ 4 format"><option>Bộ 4 format</option><option>Meme</option><option>TikTok / Reels</option><option>Quảng cáo</option><option>Bài fanpage</option></select>
                    <CaretDown size={14} />
                  </label>
                </div>
                <button type="submit" className="media-submit flex h-14 w-full items-center justify-center rounded-2xl text-white xl:w-14" aria-label="Tạo content">
                  <ArrowRight size={22} weight="bold" />
                </button>
              </div>
            </form>
          </div>
        </section>

        <section id="formats" className="media-formats mx-auto max-w-[1320px] px-5 py-24 sm:px-8 lg:px-12 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
            <div>
              <span className="media-kicker">Một character. Nhiều sân chơi.</span>
              <h2 className="mt-4 max-w-[520px] text-[38px] font-bold leading-[1.05] tracking-[-0.045em] sm:text-[52px]">Lên đúng format, vẫn đúng chất của bạn.</h2>
            </div>
            <p className="media-copy max-w-[590px] text-[16px] leading-7 lg:ml-auto">AIDA nhớ diện mạo, cá tính và giọng thương hiệu. Bạn chỉ cần đổi ý tưởng — nhân vật vẫn nhất quán từ post đầu tiên đến campaign thứ một trăm.</p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[25px] border sm:grid-cols-2 lg:grid-cols-4">
            {formats.map((format) => (
              <article key={format.label} className="media-format-item min-h-[190px] p-6">
                <format.icon size={29} weight="duotone" className="text-blue-600" />
                <h3 className="mt-12 text-[18px] font-bold tracking-[-0.02em]">{format.label}</h3>
                <p className="media-copy mt-1 text-sm">{format.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="media-how">
          <div className="mx-auto max-w-[1320px] px-5 py-24 sm:px-8 lg:px-12 lg:py-28">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <span className="media-kicker">Nhẹ đầu từ ý tưởng đến lịch đăng</span>
                <h2 className="mt-4 max-w-[680px] text-[38px] font-bold leading-[1.06] tracking-[-0.045em] sm:text-[52px]">Xây fanpage như có cả team media bên cạnh.</h2>
              </div>
              <Link href={appHref} className="media-text-link inline-flex items-center gap-2 py-3 text-sm font-semibold">Khám phá Studio <ArrowRight size={17} weight="bold" /></Link>
            </div>
            <div className="mt-14 grid gap-8 md:grid-cols-3 md:gap-12">
              {steps.map(([number, title, description]) => (
                <article key={number} className="media-step border-t pt-5">
                  <span className="media-step-number">{number}</span>
                  <h3 className="mt-10 text-[22px] font-bold tracking-[-0.025em]">{title}</h3>
                  <p className="media-copy mt-3 max-w-[340px] text-[15px] leading-6">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="media-final-cta relative overflow-hidden rounded-[30px] px-6 py-16 text-center sm:px-12 sm:py-20">
            <span className="media-hand-note text-[26px] text-[#f05a32]">content đều hơn, fanpage có chất hơn</span>
            <h2 className="mx-auto mt-4 max-w-[760px] text-[42px] font-extrabold leading-[1.02] tracking-[-0.055em] sm:text-[60px]">Để nhân vật của bạn làm việc mỗi ngày.</h2>
            <button type="button" onClick={focusComposer} className="media-primary-button mt-8 inline-flex h-[54px] items-center gap-3 rounded-xl px-6 text-[16px] font-semibold text-white">Bắt đầu với một ý tưởng <ArrowRight size={19} weight="bold" /></button>
          </div>
        </section>
      </main>

      <footer className="media-footer border-t">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-5 py-7 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <div className="flex items-center gap-2 font-bold"><Sparkle size={16} weight="fill" className="text-blue-600" /> AIDA Media Studio</div>
          <p className="media-copy">Một nhân vật. Mọi content.</p>
        </div>
      </footer>
    </div>
  );
}
