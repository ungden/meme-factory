"use client";

import Link from "next/link";
import Image from "next/image";
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
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/theme-provider";

const creationModes = [
  {
    icon: Zap,
    eyebrow: "SOCIAL",
    title: "Nội dung nhanh",
    description: "Từ một ý tưởng thành meme, social post và caption sẵn đăng.",
  },
  {
    icon: Shirt,
    eyebrow: "FASHION",
    title: "Chiến dịch thời trang",
    description: "Giữ đúng người mẫu, look và ngôn ngữ hình ảnh qua cả campaign.",
  },
  {
    icon: Film,
    eyebrow: "STORY",
    title: "Storyboard & movie",
    description: "Dựng từng cú máy trên timeline với continuity rõ ràng.",
  },
  {
    icon: Package,
    eyebrow: "BRAND",
    title: "Sản phẩm & thương hiệu",
    description: "Khoá item, màu sắc và typography cho visual thương mại.",
  },
];

const workflow = [
  {
    number: "01",
    title: "Khoá tài nguyên gốc",
    description: "Lưu nhân vật, trang phục, vật phẩm và bối cảnh thành một thư viện dùng lại được.",
  },
  {
    number: "02",
    title: "Dựng trong một Studio",
    description: "Chọn loại đầu ra, thêm tài nguyên và mô tả cảnh. AI hỗ trợ hoàn thiện chỉ đạo hình ảnh.",
  },
  {
    number: "03",
    title: "Duyệt, sửa, tiếp tục",
    description: "So sánh phương án, sửa đúng vùng cần thiết rồi dùng ảnh đã duyệt làm continuity parent.",
  },
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
    <div className="min-h-screen overflow-x-hidden" style={{ background: "var(--bg-primary)" }}>
      <nav
        className="sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{
          backgroundColor: "color-mix(in srgb, var(--bg-primary) 88%, transparent)",
          borderColor: "var(--border-primary)",
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="AIDA — Trang chủ">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
              <Sparkles size={18} className="text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight th-text-primary">AIDA</span>
            <span className="hidden rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] th-border th-text-muted sm:inline-flex">
              Creative Studio
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <a href="#workflow" className="hidden rounded-lg px-3 py-2 text-sm th-text-secondary th-bg-hover md:inline-flex">
              Cách hoạt động
            </a>
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2.5 th-text-secondary th-bg-hover"
              aria-label={theme === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng"}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            {!user && (
              <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium th-text-secondary th-bg-hover sm:inline-flex">
                Đăng nhập
              </Link>
            )}
            <Link
              href={appHref}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
            >
              {user ? "Mở Studio" : "Bắt đầu miễn phí"} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative border-b" style={{ borderColor: "var(--border-primary)" }}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_12%,rgba(59,130,246,.14),transparent_34%),radial-gradient(circle_at_22%_44%,rgba(139,92,246,.11),transparent_30%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 md:px-8 md:py-24 lg:grid-cols-[.9fr_1.1fr] lg:py-20 xl:py-24">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold th-border-accent th-bg-accent-light th-text-accent">
                <WandSparkles size={14} /> Một workspace cho mọi định dạng sáng tạo
              </div>
              <h1 className="text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.045em] th-text-primary md:text-6xl">
                Một Studio.
                <br />
                Mọi câu chuyện.
                <br />
                <span className="bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
                  Nhân vật luôn nhất quán.
                </span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 th-text-tertiary">
                Tạo social post, chiến dịch thời trang, storyboard và visual sản phẩm từ cùng một thư viện nhân vật — không phải bắt đầu lại ở mỗi tấm ảnh.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={appHref}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-xl shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-500"
                >
                  Tạo dự án đầu tiên <ArrowRight size={16} />
                </Link>
                <a
                  href="#modes"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border px-6 text-sm font-semibold th-border th-text-secondary transition th-bg-hover"
                >
                  Khám phá Studio
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs th-text-muted">
                {["Ảnh ref có vai trò rõ ràng", "Prompt AI bằng tiếng Việt", "Review & repair theo vùng"].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <Check size={13} className="text-emerald-500" /> {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-3xl lg:mx-0">
              <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-blue-500/15 via-violet-500/10 to-transparent blur-2xl" />
              <div className="relative overflow-hidden rounded-[1.5rem] border bg-[#0d1118] p-2 shadow-2xl shadow-black/30" style={{ borderColor: "rgba(148,163,184,.18)" }}>
                <div className="flex items-center justify-between px-3 py-2 text-[10px] text-slate-400">
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Cảnh 02 / Cú máy 02D</div>
                  <div className="rounded-md border border-slate-700/70 px-2 py-1">6 ảnh tham chiếu</div>
                </div>
                <div className="relative aspect-[16/10] overflow-hidden rounded-[1.1rem]">
                  <Image
                    src="/continuity/scene-02d-main.webp"
                    alt="Cú máy điện ảnh với nhân vật nhất quán trong AIDA Studio"
                    fill
                    priority
                    sizes="(max-width: 1024px) 92vw, 54vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/10 bg-slate-950/88 p-3 backdrop-blur-lg">
                    <div className="mb-2 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="flex items-center gap-1.5"><Sparkles size={12} className="text-blue-400" /> Chỉ đạo cảnh quay</span>
                      <span>Nano Banana 2</span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-5 text-slate-200">
                      Buổi sáng dịu sau mưa trong một con hẻm Sài Gòn thanh lịch. Giữ đúng nhân vật, chiếc điện thoại đỏ và ánh sáng ngọc trai.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 p-2">
                  {["scene-02d-variant-1.webp", "scene-02d-variant-2.webp", "scene-02d-variant-3.webp", "scene-02d-variant-4.webp"].map((image, index) => (
                    <div key={image} className={`relative aspect-video overflow-hidden rounded-md border ${index === 0 ? "border-blue-500" : "border-slate-800"}`}>
                      <Image src={`/continuity/${image}`} alt={`Phương án ${index + 1}`} fill sizes="140px" className="object-cover" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="absolute -bottom-7 -left-4 hidden w-52 rounded-2xl border bg-slate-950/92 p-3 shadow-2xl backdrop-blur-xl md:block" style={{ borderColor: "rgba(148,163,184,.2)" }}>
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-xl">
                    <Image src="/continuity/linh-master.webp" alt="Identity master của Linh" fill sizes="48px" className="object-cover" />
                  </div>
                  <div><p className="text-xs font-semibold text-white">Linh · Đã khoá</p><p className="mt-1 text-[10px] text-slate-400">5 ảnh tham chiếu</p></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="modes" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]">
            <div className="max-w-lg">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500">Một core workflow</span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight th-text-primary md:text-4xl">Không còn bốn công cụ rời rạc cho bốn loại nội dung.</h2>
              <p className="mt-5 leading-7 th-text-tertiary">
                AIDA tự thay đổi bộ điều khiển theo mục tiêu đầu ra, còn tài nguyên, lịch sử tạo ảnh và review vẫn ở cùng một nơi.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {creationModes.map((mode) => (
                <article key={mode.title} className="group rounded-2xl border p-5 transition hover:-translate-y-1 hover:border-blue-500/40 hover:shadow-xl" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
                  <div className="flex items-start justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><mode.icon size={19} /></span>
                    <span className="text-[10px] font-semibold tracking-[0.18em] th-text-muted">{mode.eyebrow}</span>
                  </div>
                  <h3 className="mt-8 text-lg font-semibold th-text-primary">{mode.title}</h3>
                  <p className="mt-2 text-sm leading-6 th-text-tertiary">{mode.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="border-y" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-primary)" }}>
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">Từ ref đến output</span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight th-text-primary md:text-4xl">Một đường thẳng từ ý tưởng đến ảnh đã duyệt.</h2>
            </div>
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {workflow.map((step) => (
                <article key={step.number} className="rounded-2xl border p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-primary)" }}>
                  <span className="text-sm font-mono text-blue-500">{step.number}</span>
                  <h3 className="mt-10 text-lg font-semibold th-text-primary">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 th-text-tertiary">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 md:px-8 md:py-28 lg:grid-cols-2">
          <div className="relative aspect-[5/4] overflow-hidden rounded-3xl border" style={{ borderColor: "var(--border-primary)" }}>
            <Image src="/continuity/reference-board.webp" alt="Bảng tài nguyên nhân vật và bối cảnh" fill sizes="(max-width: 1024px) 92vw, 48vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/45 p-4 text-white backdrop-blur-md">
              <div><p className="text-sm font-semibold">Reference Router</p><p className="mt-1 text-xs text-white/65">Gửi đúng ref, đúng vai trò, đúng model.</p></div>
              <Layers3 size={24} className="text-blue-300" />
            </div>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Continuity trước, model sau</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight th-text-primary md:text-4xl">Bạn chọn tài nguyên. AIDA lo phần routing phức tạp.</h2>
            <p className="mt-5 leading-7 th-text-tertiary">
              Không có slider “độ giống” giả. Mỗi chế độ Nghiêm ngặt, Cân bằng và Sáng tạo là một policy thật: chọn model, sắp xếp reference và báo rõ ảnh nào bị loại trước khi chạy.
            </p>
            <div className="mt-8 space-y-4">
              {[
                [Images, "Identity, look, item, environment và previous shot có vai trò riêng."],
                [Clapperboard, "Shot timeline giúp branch từ ảnh đã duyệt thay vì nối output vô hạn."],
                [WandSparkles, "Repair tạo version mới; ảnh đã duyệt không bao giờ bị ghi đè."],
              ].map(([Icon, text]) => {
                const FeatureIcon = Icon as typeof Images;
                return <div key={text as string} className="flex gap-3 text-sm leading-6 th-text-secondary"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg th-bg-accent-light th-text-accent"><FeatureIcon size={16} /></span><span>{text as string}</span></div>;
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 md:px-8 md:pb-28">
          <div className="relative overflow-hidden rounded-3xl bg-[#0e1524] px-6 py-14 text-center text-white md:px-12 md:py-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(59,130,246,.42),transparent_50%),radial-gradient(circle_at_100%_100%,rgba(139,92,246,.24),transparent_40%)]" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Bắt đầu bằng một nhân vật. Mở rộng thành cả thế giới.</h2>
              <p className="mx-auto mt-5 max-w-xl leading-7 text-slate-300">Tạo project, khoá tài nguyên gốc và dựng output đầu tiên trong cùng một Studio.</p>
              <Link href={appHref} className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-blue-50">
                Mở AIDA Studio <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: "var(--border-primary)" }}>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm th-text-muted md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-2"><Sparkles size={15} className="text-blue-500" /> <strong className="th-text-primary">AIDA</strong> · Creative production studio</div>
          <div className="flex gap-5"><Link href="/privacy" className="hover:th-text-primary">Quyền riêng tư</Link><Link href="/terms" className="hover:th-text-primary">Điều khoản</Link></div>
        </div>
      </footer>
    </div>
  );
}
