"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Film,
  Images,
  Layers3,
  Moon,
  Package,
  Shirt,
  Sparkles,
  Sun,
  WandSparkles,
  Zap,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { createClient } from "@/lib/supabase/client";

const creationModes = [
  {
    icon: Zap,
    eyebrow: "SOCIAL",
    title: "Nội dung nhanh",
    description: "Meme, social post và caption từ một ý tưởng duy nhất.",
  },
  {
    icon: Shirt,
    eyebrow: "FASHION",
    title: "Thời trang",
    description: "Giữ đúng người mẫu, look và art direction qua cả campaign.",
  },
  {
    icon: Film,
    eyebrow: "STORY",
    title: "Storyboard",
    description: "Dựng từng cú máy với nhân vật và bối cảnh nhất quán.",
  },
  {
    icon: Package,
    eyebrow: "BRAND",
    title: "Sản phẩm",
    description: "Khoá item, màu sắc và typography cho visual thương mại.",
  },
];

const workflow = [
  {
    number: "01",
    title: "Khoá tài nguyên",
    description: "Lưu nhân vật, trang phục, vật phẩm và bối cảnh thành master dùng lại được.",
  },
  {
    number: "02",
    title: "Dựng khung hình",
    description: "Chọn tài nguyên, mô tả cảnh và để AI hoàn thiện chỉ đạo hình ảnh.",
  },
  {
    number: "03",
    title: "Duyệt và tiếp tục",
    description: "So sánh phương án, sửa đúng vùng rồi dùng ảnh đã duyệt cho shot tiếp theo.",
  },
];

const trustItems = [
  "Reference có vai trò rõ ràng",
  "Prompt AI bằng tiếng Việt",
  "Review và sửa theo vùng",
];

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: unknown } }) => {
      setUser(data.user as { email?: string } | null);
    });
  }, []);

  const appHref = user ? "/projects" : "/login";

  return (
    <div className="home-shell min-h-screen overflow-x-hidden">
      <nav className="home-nav sticky top-0 z-50 border-b">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70" aria-label="AIDA — Trang chủ">
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-blue-600 shadow-[0_8px_24px_rgba(37,99,235,.24)]">
              <Sparkles size={17} className="text-white" />
            </span>
            <span className="text-[17px] font-semibold tracking-[-0.02em]">AIDA</span>
            <span className="home-brand-label hidden rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] sm:inline-flex">
              Creative Studio
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            <a href="#workflow" className="home-nav-link hidden rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 md:inline-flex">
              Cách hoạt động
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              className="home-icon-button inline-flex h-10 w-10 items-center justify-center rounded-lg border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
              aria-label={theme === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng"}
              title={theme === "light" ? "Giao diện tối" : "Giao diện sáng"}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            {!user && (
              <Link href="/login" className="home-nav-link hidden rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 sm:inline-flex">
                Đăng nhập
              </Link>
            )}
            <Link
              href={appHref}
              className="ml-1 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,.2)] outline-none transition hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-2"
            >
              {user ? "Mở Studio" : "Bắt đầu miễn phí"} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="home-hero border-b">
          <div className="mx-auto grid min-h-[700px] max-w-6xl items-center gap-14 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-[.86fr_1.14fr] lg:gap-16 lg:py-16">
            <div className="max-w-[560px]">
              <div className="home-eyebrow mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em]">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Continuity-first creative studio
              </div>
              <h1 className="max-w-[560px] text-[46px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[54px] lg:text-[58px]">
                Một nhân vật.
                <br />
                <span className="home-gradient-text">Mọi khung hình.</span>
              </h1>
              <p className="home-body-copy mt-6 max-w-[530px] text-[17px] leading-[1.7]">
                Tạo meme, chiến dịch thời trang, storyboard và visual sản phẩm từ cùng một thư viện — không phải dựng lại nhân vật ở mỗi ảnh.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={appHref}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,.22)] outline-none transition hover:-translate-y-0.5 hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-2"
                >
                  Bắt đầu sáng tạo <ArrowRight size={16} />
                </Link>
                <a
                  href="#modes"
                  className="home-secondary-button inline-flex h-12 items-center justify-center rounded-lg border px-6 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/70"
                >
                  Khám phá Studio
                </a>
              </div>
              <div className="home-trust mt-8 flex flex-wrap gap-x-5 gap-y-2.5 border-t pt-5 text-[12px]">
                {trustItems.map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <Check size={13} className="text-emerald-500" /> {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[640px] lg:mx-0">
              <div className="home-preview relative overflow-hidden rounded-[22px] border p-2.5">
                <div className="home-preview-chrome flex items-center justify-between px-2.5 pb-2.5 pt-1 text-[10px]">
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Cảnh 02 · Cú máy 02D</div>
                  <div className="rounded-md border px-2 py-1">6 ảnh tham chiếu</div>
                </div>
                <div className="relative aspect-[16/10] overflow-hidden rounded-[15px]">
                  <Image
                    src="/continuity/scene-02d-main.webp"
                    alt="Cú máy điện ảnh với nhân vật nhất quán trong AIDA Studio"
                    fill
                    priority
                    sizes="(max-width: 1024px) 92vw, 52vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/10 bg-slate-950/88 p-3 text-white backdrop-blur-lg">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="flex items-center gap-1.5"><WandSparkles size={12} className="text-blue-400" /> Chỉ đạo cảnh quay</span>
                      <span>Nano Banana 2</span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-5 text-slate-200">
                      Buổi sáng dịu sau mưa trong một con hẻm Sài Gòn thanh lịch. Giữ đúng nhân vật, điện thoại đỏ và ánh sáng ngọc trai.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-2">
                  {["scene-02d-variant-1.webp", "scene-02d-variant-2.webp", "scene-02d-variant-3.webp", "scene-02d-variant-4.webp"].map((image, index) => (
                    <div key={image} className={`relative aspect-video overflow-hidden rounded-md border ${index === 0 ? "border-blue-500" : "home-preview-border"}`}>
                      <Image src={`/continuity/${image}`} alt={`Phương án ${index + 1}`} fill sizes="140px" className="object-cover" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="home-identity-card absolute -bottom-5 -left-5 hidden w-48 rounded-xl border p-3 shadow-xl md:block">
                <div className="flex items-center gap-3">
                  <div className="relative h-11 w-11 overflow-hidden rounded-lg">
                    <Image src="/continuity/linh-master.webp" alt="Identity master của Linh" fill sizes="44px" className="object-cover" />
                  </div>
                  <div><p className="text-xs font-semibold">Linh · Đã khoá</p><p className="home-caption mt-1 text-[10px]">5 ảnh tham chiếu</p></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="modes" className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
          <div className="max-w-2xl">
            <span className="home-section-label text-xs font-semibold uppercase tracking-[0.16em]">Một Studio hợp nhất</span>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.035em] md:text-[42px]">Một workflow, bốn cách kể.</h2>
            <p className="home-body-copy mt-4 max-w-xl text-[16px] leading-7">
              Chọn mục tiêu đầu ra. AIDA đổi đúng bộ điều khiển, còn tài nguyên và lịch sử vẫn ở cùng một nơi.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {creationModes.map((mode) => (
              <article key={mode.title} className="home-card group flex min-h-52 flex-col rounded-2xl border p-5 transition duration-200 hover:-translate-y-1">
                <div className="flex items-start justify-between">
                  <span className="home-mode-icon flex h-10 w-10 items-center justify-center rounded-xl"><mode.icon size={18} /></span>
                  <span className="home-caption text-[9px] font-semibold tracking-[0.16em]">{mode.eyebrow}</span>
                </div>
                <div className="mt-auto pt-8">
                  <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{mode.title}</h3>
                  <p className="home-body-copy mt-2 text-[13px] leading-5.5">{mode.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="home-section-alt border-y">
          <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
            <div className="max-w-2xl">
              <span className="home-section-label text-xs font-semibold uppercase tracking-[0.16em]">Từ ref đến output</span>
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.035em] md:text-[42px]">Một đường thẳng từ ý tưởng đến ảnh đã duyệt.</h2>
            </div>
            <div className="mt-10 grid gap-3 md:grid-cols-3">
              {workflow.map((step) => (
                <article key={step.number} className="home-card rounded-2xl border p-6">
                  <span className="font-mono text-xs font-semibold text-blue-500">{step.number}</span>
                  <h3 className="mt-12 text-lg font-semibold">{step.title}</h3>
                  <p className="home-body-copy mt-3 text-sm leading-6">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:px-8 md:py-24 lg:grid-cols-[1.05fr_.95fr] lg:gap-16">
          <div className="relative aspect-[5/4] overflow-hidden rounded-[22px] border home-media-frame">
            <Image src="/continuity/reference-board.webp" alt="Bảng tài nguyên nhân vật và bối cảnh" fill sizes="(max-width: 1024px) 92vw, 48vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/50 p-4 text-white backdrop-blur-md">
              <div><p className="text-sm font-semibold">Reference Router</p><p className="mt-1 text-xs text-white/70">Đúng ref, đúng vai trò, đúng model.</p></div>
              <Layers3 size={22} className="text-blue-300" />
            </div>
          </div>
          <div>
            <span className="home-section-label text-xs font-semibold uppercase tracking-[0.16em]">Continuity trước, model sau</span>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.035em] md:text-[42px]">Bạn chọn tài nguyên. AIDA lo phần routing.</h2>
            <p className="home-body-copy mt-5 text-[16px] leading-7">
              Không có slider “độ giống” giả. Mỗi chế độ là một policy thật: chọn model, sắp xếp reference và báo rõ ảnh nào bị loại trước khi chạy.
            </p>
            <div className="mt-7 space-y-4">
              {[
                [Images, "Identity, look, item và environment có vai trò riêng."],
                [Clapperboard, "Shot mới kế thừa từ master và ảnh đã duyệt."],
                [WandSparkles, "Repair tạo version mới, không ghi đè output cũ."],
              ].map(([Icon, text]) => {
                const FeatureIcon = Icon as typeof Images;
                return <div key={text as string} className="home-feature flex gap-3 text-sm leading-6"><span className="home-mode-icon mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><FeatureIcon size={15} /></span><span>{text as string}</span></div>;
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20 md:px-8 md:pb-24">
          <div className="home-cta relative overflow-hidden rounded-[24px] border px-6 py-14 text-center md:px-12 md:py-16">
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-semibold leading-tight tracking-[-0.035em] md:text-[42px]">Bắt đầu bằng một nhân vật.<br className="hidden sm:block" /> Mở rộng thành cả một thế giới.</h2>
              <p className="home-body-copy mx-auto mt-4 max-w-xl text-[16px] leading-7">Tạo project, khoá tài nguyên gốc và dựng output đầu tiên trong cùng một Studio.</p>
              <Link href={appHref} className="mt-7 inline-flex h-12 items-center gap-2 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,.2)] outline-none transition hover:-translate-y-0.5 hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/70">
                Mở AIDA Studio <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="home-footer border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-2"><Sparkles size={15} className="text-blue-500" /> <strong>AIDA</strong><span className="home-caption">· Creative production studio</span></div>
          <div className="home-caption flex gap-5"><Link href="/privacy" className="transition hover:text-blue-500">Quyền riêng tư</Link><Link href="/terms" className="transition hover:text-blue-500">Điều khoản</Link></div>
        </div>
      </footer>
    </div>
  );
}
