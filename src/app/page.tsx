"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { ArrowRight, CalendarClock, Check, Clapperboard, Images, Lock, Sparkles, Video } from "lucide-react";
import SiteFooter from "@/components/marketing/site-footer";
import SiteHeader from "@/components/marketing/site-header";
import { useSignedIn } from "@/components/marketing/use-signed-in";
import { FREE_TRIAL_POINTS, POINT_COSTS, formatVND } from "@/lib/point-pricing";
import { FILM_POINTS_RANGE, pointsToVnd, trialImageCount } from "@/lib/pricing-examples";

// Giá trị được trang chính trong app đọc lại từ nháp, nên giữ nguyên chữ dù nhãn
// hiển thị khác. Meme đứng trước: điểm tặng chỉ đủ vài meme, chọn sẵn phim là
// để người mới vấp "không đủ điểm" ngay lần bấm đầu tiên.
const OUTPUTS = [
  { value: "Tạo ảnh", label: "Meme", icon: Images },
  { value: "Tạo phim ngắn", label: "Phim ngắn", icon: Clapperboard },
] as const;

const EXAMPLE_IDEAS = [
  "Mẹ than lương con về ba ngày đã hết",
  "Mèo văn phòng và sáng thứ Hai",
  "Quán cà phê nhỏ kể chuyện khách quen",
];

// Ảnh mẫu làm bằng chính AIDA, để người xem thấy kết quả trước khi đọc chữ.
const SHOWCASE = [
  { src: "/showcase/office.webp", alt: "Meme mèo văn phòng chiều thứ Sáu" },
  { src: "/showcase/chungkhoan.webp", alt: "Meme chú bò chứng khoán" },
  { src: "/showcase/food.webp", alt: "Meme đồ ăn" },
  { src: "/showcase/gym.webp", alt: "Meme phòng gym" },
  { src: "/showcase/student.webp", alt: "Meme sinh viên" },
  { src: "/showcase/couple.webp", alt: "Meme cặp đôi" },
];

const CAST = [
  { src: "/continuity/linh-master.webp", label: "Chính diện" },
  { src: "/continuity/linh-three-quarter.webp", label: "Nghiêng" },
  { src: "/continuity/linh-profile.webp", label: "Một bên" },
  { src: "/continuity/linh-full-body.webp", label: "Toàn thân" },
];

const FILM_RANGE = `${FILM_POINTS_RANGE.min.toLocaleString("vi-VN")}–${FILM_POINTS_RANGE.max.toLocaleString("vi-VN")}`;

const OFFERINGS = [
  {
    icon: Images,
    image: "/showcase/office.webp",
    title: "Meme",
    body: "Ảnh có chữ, đúng nhân vật, đúng giọng kênh. Tải về là đăng.",
    price: `${POINT_COSTS.meme} điểm một tấm`,
  },
  {
    icon: Video,
    image: "/continuity/red-phone.webp",
    title: "Video",
    body: "Một đoạn clip từ vài dòng mô tả. Đưa ảnh sản phẩm hay ảnh người thật vào để giữ đúng hình.",
    price: "Báo giá trước khi làm",
  },
  {
    icon: Clapperboard,
    image: "/continuity/scene-02d-main.webp",
    title: "Phim ngắn",
    body: "Có kịch bản, nhiều cảnh, lồng tiếng, ghép thành phim. Chỉ hỏi bạn khi thật sự cần.",
    price: `${FILM_RANGE} điểm một phim ~${FILM_POINTS_RANGE.seconds} giây`,
  },
];

const PRICE_ROWS = [
  { label: "Một meme", points: POINT_COSTS.meme },
  { label: "Một ảnh nhân vật", points: POINT_COSTS.character },
  { label: `Một phim ngắn ~${FILM_POINTS_RANGE.seconds} giây`, points: FILM_POINTS_RANGE },
];

function formatPoints(points: number | { min: number; max: number }) {
  return typeof points === "number"
    ? `${points} điểm`
    : `${points.min.toLocaleString("vi-VN")}–${points.max.toLocaleString("vi-VN")} điểm`;
}

function formatPrice(points: number | { min: number; max: number }) {
  return typeof points === "number"
    ? formatVND(pointsToVnd(points))
    : `${formatVND(pointsToVnd(points.min))} – ${formatVND(pointsToVnd(points.max))}`;
}

export default function Home() {
  const { appHref } = useSignedIn();
  const [idea, setIdea] = useState("");
  const [output, setOutput] = useState<string>(OUTPUTS[0].value);
  const promptRef = useRef<HTMLInputElement>(null);
  const trialMemes = trialImageCount();

  function focusComposer() {
    promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => promptRef.current?.focus(), 450);
  }

  function submitIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Ý tưởng đi qua đăng nhập bằng sessionStorage, không nằm trên URL; trang
    // chính trong app đọc lại và điền sẵn vào ô nhập.
    window.sessionStorage.setItem("aida:landing-draft", JSON.stringify({ idea: idea.trim(), output }));
    window.location.href = appHref;
  }

  return (
    <div className="media-home min-h-screen overflow-x-clip">
      <SiteHeader />

      <main>
        <section className="media-hero">
          <div className="mx-auto grid max-w-[1200px] gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:px-8 lg:pb-24 lg:pt-20">
            <div className="min-w-0">
              <span className="media-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium">
                <Sparkles size={14} className="shrink-0" />
                Cho chủ fanpage và kênh TikTok
              </span>
              <h1 className="mt-6 text-[34px] font-extrabold leading-[1.08] tracking-[-0.04em] sm:text-[52px] lg:text-[50px] xl:text-[56px]">
                Gõ một ý tưởng.
                <br />
                <span className="th-text-gradient">Nhận bài đăng ngay.</span>
              </h1>
              <p className="mt-5 max-w-[540px] text-[16px] leading-[1.7] th-text-secondary sm:text-[18px]">
                AIDA viết, vẽ, lồng tiếng và dựng thành meme, video, phim ngắn — cùng một dàn nhân vật, đúng giọng kênh
                của bạn. Muốn thì để nó tự làm đều mỗi ngày.
              </p>

              <form onSubmit={submitIdea} className="media-composer mt-8 rounded-[20px] p-2.5">
                <label htmlFor="media-idea" className="sr-only">Ý tưởng cho bài đăng</label>
                <input
                  ref={promptRef}
                  id="media-idea"
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  className="media-idea-input w-full rounded-[14px] px-3 text-[16px] outline-none"
                  placeholder="Ví dụ: Sáng thứ Hai ở văn phòng…"
                />
                <div className="flex flex-wrap items-center gap-2 border-t pt-2.5 th-border">
                  <div role="radiogroup" aria-label="Muốn làm gì" className="flex rounded-full p-0.5 th-bg-tertiary">
                    {OUTPUTS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={output === value}
                        onClick={() => setOutput(value)}
                        className={`flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium transition-colors ${
                          output === value ? "th-bg-card th-text-primary th-shadow-sm" : "th-text-tertiary hover:th-text-primary"
                        }`}
                      >
                        <Icon size={15} aria-hidden /> {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="media-submit ml-auto inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] px-5 text-[15px] font-semibold"
                  >
                    Làm thử miễn phí
                    <ArrowRight size={17} strokeWidth={2.5} />
                  </button>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[13px] th-text-tertiary">Gợi ý:</span>
                {EXAMPLE_IDEAS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setIdea(example);
                      promptRef.current?.focus();
                    }}
                    className="media-chip max-w-full truncate rounded-full px-3 py-1.5 text-[13px]"
                  >
                    {example}
                  </button>
                ))}
              </div>

              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[14px] th-text-secondary">
                {[`Tặng ${FREE_TRIAL_POINTS} điểm, đủ làm ${trialMemes} meme`, "Không thuê bao", "Biết giá trước khi làm"].map((item) => (
                  <li key={item} className="inline-flex items-center gap-1.5">
                    <Check size={15} strokeWidth={2.5} className="th-text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Kết quả thật đứng cạnh ô nhập: người xem biết ngay mình sẽ nhận được gì. */}
            <div className="relative min-w-0" aria-label="Một vài bài AIDA đã làm">
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                {SHOWCASE.map((item, index) => (
                  <div
                    key={item.src}
                    className={`relative aspect-square overflow-hidden rounded-2xl border th-border th-shadow-md ${index % 3 === 1 ? "sm:translate-y-6" : ""}`}
                  >
                    <Image src={item.src} alt={item.alt} fill sizes="(min-width: 1024px) 190px, 33vw" className="object-cover" priority />
                  </div>
                ))}
              </div>
              <div className="relative mt-3 ml-auto w-[78%] overflow-hidden rounded-2xl border th-border th-shadow-lg sm:-mt-4">
                <div className="relative aspect-video">
                  <Image src="/continuity/scene-02d-main.webp" alt="Một cảnh trong phim ngắn" fill priority sizes="(min-width: 1024px) 420px, 78vw" className="object-cover" />
                </div>
                <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur">
                  <Clapperboard size={13} /> Cảnh trong một phim ngắn
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="media-section-alt scroll-mt-16">
          <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="max-w-[640px]">
              <span className="media-kicker">Cách làm</span>
              <h2 className="mt-3 text-balance text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
                Làm quen một lần, rồi chỉ việc gõ.
              </h2>
              <p className="mt-4 text-[16px] leading-7 th-text-secondary">
                Hai bước đầu chỉ làm khi tạo kênh. Sau đó mỗi bài là một dòng ý tưởng — hoặc không cần gõ gì.
              </p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              <article className="media-card flex flex-col rounded-[20px] p-6">
                <span className="media-step-number">BƯỚC 1</span>
                <h3 className="mt-3 text-[21px] font-bold">Kể về kênh</h3>
                <p className="mt-2 text-[15px] leading-6 th-text-secondary">
                  Vài câu là đủ: kênh nói về gì, ai xem, giọng ra sao. AIDA ghi nhớ để bài nào cũng đúng chất kênh.
                </p>
                <div className="media-mini mt-6 rounded-[14px] p-4 text-[13px]">
                  <dl className="space-y-2">
                    {[
                      ["Tên kênh", "Mèo Văn Phòng"],
                      ["Người xem", "Dân văn phòng 22–30 tuổi"],
                      ["Giọng", "Hài, châm nhẹ"],
                    ].map(([term, value]) => (
                      <div key={term} className="flex justify-between gap-3">
                        <dt className="shrink-0 th-text-tertiary">{term}</dt>
                        <dd className="truncate text-right font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </article>

              <article className="media-card flex flex-col rounded-[20px] p-6">
                <span className="media-step-number">BƯỚC 2</span>
                <h3 className="mt-3 text-[21px] font-bold">Chọn nhân vật</h3>
                <p className="mt-2 text-[15px] leading-6 th-text-secondary">
                  AIDA vẽ nhân vật cho kênh, hoặc dùng ảnh của bạn. Đã chốt là giữ nguyên gương mặt ở mọi bài.
                </p>
                <div className="media-mini mt-6 rounded-[14px] p-4 text-[13px]">
                  <div className="grid grid-cols-4 gap-2">
                    {CAST.map((pose) => (
                      <div key={pose.src} className="flex min-w-0 flex-col items-center gap-1.5">
                        <span className="relative aspect-square w-full overflow-hidden rounded-[10px] th-bg-tertiary">
                          <Image src={pose.src} alt="" fill sizes="80px" className="object-cover object-top" />
                        </span>
                        <span className="w-full truncate text-center text-[11px] th-text-tertiary">{pose.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 inline-flex items-center gap-1.5 font-medium th-text-success">
                    <Lock size={13} /> Đã chốt gương mặt
                  </p>
                </div>
              </article>

              <article className="media-card flex flex-col rounded-[20px] p-6">
                <span className="media-step-number">BƯỚC 3</span>
                <h3 className="mt-3 text-[21px] font-bold">Nhận bài</h3>
                <p className="mt-2 text-[15px] leading-6 th-text-secondary">
                  Gõ ý tưởng, hoặc để trống cho AIDA tự nghĩ. Bật chế độ mỗi ngày thì sáng ra đã có bài.
                </p>
                <ul className="media-mini mt-6 space-y-2.5 rounded-[14px] p-4 text-[13px]">
                  {[
                    { icon: Images, label: "Meme · Sáng thứ Hai", status: "Xong" },
                    { icon: Clapperboard, label: "Phim ngắn · 60 giây", status: "Đang làm" },
                    { icon: CalendarClock, label: "Mai 8:00 · 2 meme", status: "Đã hẹn" },
                  ].map((row) => (
                    <li key={row.label} className="flex items-center gap-2.5">
                      <span className="media-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                        <row.icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
                      <span className="shrink-0 th-text-tertiary">{row.status}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section id="what" className="mx-auto max-w-[1200px] scroll-mt-16 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="max-w-[640px]">
            <span className="media-kicker">Làm được gì</span>
            <h2 className="mt-3 text-balance text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
              Từ tấm meme buổi sáng đến tập phim cuối tuần.
            </h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {OFFERINGS.map((item) => (
              <article key={item.title} className="media-card flex flex-col overflow-hidden rounded-[20px]">
                <div className="relative aspect-[16/10] th-bg-tertiary">
                  <Image src={item.image} alt="" fill sizes="(min-width: 768px) 380px, 100vw" className="object-cover" />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="flex items-center gap-2 text-[19px] font-bold">
                    <item.icon size={19} className="th-text-accent" /> {item.title}
                  </h3>
                  <p className="mt-2 flex-1 text-[15px] leading-6 th-text-secondary">{item.body}</p>
                  <p className="mt-5 border-t pt-4 text-[13px] font-medium th-border th-text-tertiary">{item.price}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="media-card media-card-feature mt-5 flex flex-col gap-4 rounded-[20px] p-6 sm:flex-row sm:items-center">
            <span className="media-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
              <CalendarClock size={21} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[19px] font-bold">Tự làm mỗi ngày</h3>
              <p className="mt-1 text-[15px] leading-6 th-text-secondary">
                Chọn mỗi ngày mấy meme, mấy phim. AIDA tự nghĩ ý tưởng theo kênh và làm đúng giờ. Bật tắt lúc nào cũng được.
              </p>
            </div>
          </div>
        </section>

        <section className="media-section-alt">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
            <div>
              <span className="media-kicker">Giá</span>
              <h2 className="mt-3 text-balance text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
                Làm bao nhiêu trả bấy nhiêu.
              </h2>
              <p className="mt-4 max-w-[480px] text-[16px] leading-7 th-text-secondary">
                1 điểm = {formatVND(pointsToVnd(1))}. Điểm không hết hạn, không thuê bao. Làm hỏng thì tự hoàn điểm.
              </p>
              <Link
                href="/pricing"
                className="media-secondary-button mt-7 inline-flex h-12 items-center gap-2 rounded-xl px-5 text-[15px] font-semibold"
              >
                Xem bảng giá <ArrowRight size={17} strokeWidth={2.5} />
              </Link>
            </div>

            <div className="media-card rounded-[20px] p-2">
              <ul>
                {PRICE_ROWS.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-4 rounded-[14px] px-4 py-4">
                    <span className="min-w-0 font-medium">{row.label}</span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold">{formatPoints(row.points)}</span>
                      <span className="block text-[13px] th-text-tertiary">{formatPrice(row.points)}</span>
                    </span>
                  </li>
                ))}
                <li className="th-bg-accent-light flex items-center justify-between gap-4 rounded-[14px] px-4 py-4">
                  <span className="min-w-0 font-medium">Tặng khi đăng ký</span>
                  <span className="shrink-0 font-semibold th-text-accent">{FREE_TRIAL_POINTS} điểm</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="media-cta rounded-[28px] px-6 py-14 text-center sm:px-12 sm:py-16">
            <h2 className="mx-auto max-w-[680px] text-balance text-[30px] font-extrabold leading-[1.1] tracking-[-0.035em] sm:text-[46px]">
              Bài đầu tiên chỉ cách <span className="th-text-gradient">một dòng ý tưởng.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[540px] text-[16px] leading-7 th-text-secondary">
              Đăng ký là có {FREE_TRIAL_POINTS} điểm, đủ làm thử {trialMemes} meme.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={focusComposer}
                className="media-primary-button inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold"
              >
                Làm thử miễn phí <ArrowRight size={17} strokeWidth={2.5} />
              </button>
              <Link
                href="/pricing"
                className="media-secondary-button inline-flex h-12 items-center justify-center rounded-xl px-6 text-[15px] font-semibold"
              >
                Xem bảng giá
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
