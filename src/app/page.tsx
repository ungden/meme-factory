"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  Clapperboard,
  Images,
  Lock,
  Sparkles,
  UserRound,
  Video,
  Wand2,
} from "lucide-react";
import SiteFooter from "@/components/marketing/site-footer";
import SiteHeader from "@/components/marketing/site-header";
import { useSignedIn } from "@/components/marketing/use-signed-in";
import { FREE_TRIAL_POINTS, POINT_COSTS, formatVND } from "@/lib/point-pricing";
import { FILM_POINTS_RANGE, pointsToVnd } from "@/lib/pricing-examples";

// Hai giá trị này được trang chính trong app đọc lại từ nháp, nên giữ nguyên
// chữ dù nhãn hiển thị là "Phim ngắn" / "Meme".
const OUTPUTS = [
  { value: "Tạo phim ngắn", label: "Phim ngắn" },
  { value: "Tạo ảnh", label: "Meme" },
] as const;

const EXAMPLE_IDEAS = [
  "Mẹ than lương con về ba ngày đã hết",
  "Mèo văn phòng và sáng thứ Hai",
  "Quán cà phê nhỏ kể chuyện khách quen",
];

const FILM_RANGE = `${FILM_POINTS_RANGE.min}–${FILM_POINTS_RANGE.max}`;

const OFFERINGS = [
  {
    icon: Images,
    title: "Meme",
    body: "Ảnh có chữ, đúng nhân vật, đúng giọng kênh. AI nghĩ câu đùa, bạn tải về là đăng.",
    price: `khoảng ${POINT_COSTS.meme} điểm một tấm`,
  },
  {
    icon: Video,
    title: "Video ngắn",
    body: "Một clip từ vài dòng mô tả. Muốn đúng sản phẩm, đúng người thì đưa ảnh của bạn làm mẫu.",
    price: "Báo giá hiện trước khi làm",
  },
  {
    icon: Clapperboard,
    title: "Phim ngắn",
    body: "AI viết chuyện, dựng từng cảnh, lồng tiếng rồi ghép thành phim. Chỉ hỏi bạn khi thật sự cần.",
    price: `${FILM_RANGE} điểm một phim ~${FILM_POINTS_RANGE.seconds} giây`,
  },
  {
    icon: CalendarClock,
    title: "Tự làm mỗi ngày",
    body: "Chọn mỗi ngày bao nhiêu phim, bao nhiêu meme. AI tự nghĩ ý tưởng theo hồ sơ kênh và làm đều đặn.",
    price: "Bật, tắt lúc nào cũng được",
    featured: true,
  },
];

const PRICE_ROWS = [
  { label: "Một meme", points: POINT_COSTS.meme },
  { label: "Một ảnh nhân vật", points: POINT_COSTS.character },
  { label: `Một phim ngắn ~${FILM_POINTS_RANGE.seconds} giây`, points: FILM_POINTS_RANGE },
];

function formatPoints(points: number | { min: number; max: number }) {
  return typeof points === "number" ? `${points} điểm` : `${points.min}–${points.max} điểm`;
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

  const outputLabel = OUTPUTS.find((item) => item.value === output)?.label ?? OUTPUTS[0].label;

  return (
    <div className="media-home min-h-screen overflow-x-clip">
      <SiteHeader />

      <main>
        {/* Mở đầu */}
        <section className="media-hero">
          <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-24">
            <div className="mx-auto max-w-[820px] text-center">
              <span className="media-pill inline-flex max-w-full items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium">
                <Sparkles size={14} className="shrink-0" />
                <span className="truncate">Nội dung AI cho fanpage, TikTok…</span>
              </span>
              <h1 className="mt-6 text-balance text-[40px] font-extrabold leading-[1.04] tracking-[-0.04em] sm:text-[60px] lg:text-[72px]">
                Kênh của bạn,
                <br />
                <span className="th-text-gradient">ngày nào cũng có bài mới.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-[620px] text-[16px] leading-[1.7] th-text-secondary sm:text-[18px]">
                AIDA lo phần sản xuất: dựng hồ sơ kênh, giữ đúng gương mặt nhân vật, rồi làm meme, video và phim
                ngắn — từng bài khi bạn cần, hoặc tự làm đều đặn mỗi ngày.
              </p>
            </div>

            <form onSubmit={submitIdea} className="media-composer mx-auto mt-10 max-w-[860px] rounded-[22px] p-2.5 sm:p-3">
              <label htmlFor="media-idea" className="sr-only">Ý tưởng hoặc vài câu mô tả kênh</label>
              <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
                <input
                  ref={promptRef}
                  id="media-idea"
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  className="media-idea-input min-w-0 flex-1 rounded-[14px] px-4 text-[16px] outline-none"
                  placeholder="Ý tưởng, hoặc vài câu về kênh…"
                />
                <div className="flex gap-2.5">
                  <label className="media-select flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[14px] px-3 md:w-[164px] md:flex-none">
                    <Wand2 size={18} className="shrink-0 th-text-accent" />
                    <span className="min-w-0 flex-1">
                      <small>AI làm</small>
                      <strong>{outputLabel}</strong>
                    </span>
                    <select aria-label="Chọn loại nội dung" value={output} onChange={(event) => setOutput(event.target.value)}>
                      {OUTPUTS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="shrink-0 th-text-tertiary" />
                  </label>
                  <button
                    type="submit"
                    className="media-submit inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-[14px] px-5 text-[15px] font-semibold"
                  >
                    <span>Bắt đầu</span>
                    <ArrowRight size={18} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </form>

            <div className="mx-auto mt-4 flex max-w-[860px] flex-wrap items-center justify-center gap-2">
              <span className="text-[13px] th-text-tertiary">Thử:</span>
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

            <ul className="mx-auto mt-8 flex max-w-[860px] flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px] th-text-secondary">
              {[`Tặng ${FREE_TRIAL_POINTS} điểm khi đăng ký`, "Không thuê bao", "Luôn thấy giá trước khi làm"].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check size={15} strokeWidth={2.5} className="th-text-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Ba bước */}
        <section id="how" className="media-section-alt scroll-mt-16">
          <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="max-w-[640px]">
              <span className="media-kicker">Cách làm</span>
              <h2 className="mt-3 text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
                Ba bước, rồi kênh tự có bài.
              </h2>
              <p className="mt-4 text-[16px] leading-7 th-text-secondary">
                Hai bước đầu làm một lần. Từ bước ba, mỗi bài chỉ là một ô nhập — hoặc chẳng cần gõ gì.
              </p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              <article className="media-card flex flex-col rounded-[20px] p-6">
                <span className="media-step-number">BƯỚC 01</span>
                <h3 className="mt-3 text-[21px] font-bold">Tạo kênh</h3>
                <p className="mt-2 text-[15px] leading-6 th-text-secondary">
                  Viết vài câu: kênh nói về gì, cho ai xem, giọng ra sao. AI điền đủ hồ sơ kênh để mọi bài sau đúng chất.
                </p>
                <div className="media-mini mt-6 rounded-[14px] p-4 text-[13px]">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="font-semibold">Hồ sơ kênh</span>
                    <span className="media-pill inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                      <Sparkles size={11} /> AI điền
                    </span>
                  </div>
                  <dl className="space-y-2">
                    {[
                      ["Tên kênh", "Mèo Văn Phòng"],
                      ["Người xem", "Dân văn phòng 22–30 tuổi"],
                      ["Giọng kể", "Hài, châm nhẹ"],
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
                <span className="media-step-number">BƯỚC 02</span>
                <h3 className="mt-3 text-[21px] font-bold">Dựng nhân vật</h3>
                <p className="mt-2 text-[15px] leading-6 th-text-secondary">
                  AI vẽ nhân vật, hoặc dùng ảnh của bạn. Khoá bộ ảnh chuẩn một lần để mọi bài giữ đúng một gương mặt.
                </p>
                <div className="media-mini mt-6 rounded-[14px] p-4 text-[13px]">
                  <div className="grid grid-cols-4 gap-2">
                    {["Ảnh gốc", "Cận mặt", "Toàn thân", "Sau lưng"].map((pose) => (
                      <div key={pose} className="flex min-w-0 flex-col items-center gap-1.5">
                        <span className="media-avatar flex aspect-square w-full items-center justify-center rounded-[12px]">
                          <UserRound size={22} />
                        </span>
                        <span className="w-full truncate text-center text-[11px] th-text-tertiary">{pose}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 inline-flex items-center gap-1.5 font-medium th-text-success">
                    <Lock size={13} /> Đã khoá bộ ảnh chuẩn
                  </p>
                </div>
              </article>

              <article className="media-card flex flex-col rounded-[20px] p-6">
                <span className="media-step-number">BƯỚC 03</span>
                <h3 className="mt-3 text-[21px] font-bold">Làm nội dung</h3>
                <p className="mt-2 text-[15px] leading-6 th-text-secondary">
                  Mỗi meme, video hay phim ngắn bắt đầu từ một ô nhập. Hoặc bật tự làm mỗi ngày để AI đều đặn ra bài.
                </p>
                <ul className="media-mini mt-6 space-y-2.5 rounded-[14px] p-4 text-[13px]">
                  {[
                    { icon: Images, label: "Meme · Sáng thứ Hai", status: "Xong" },
                    { icon: Clapperboard, label: "Phim ngắn · 30 giây", status: "Đang dựng" },
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

        {/* Làm được gì */}
        <section id="what" className="mx-auto max-w-[1200px] scroll-mt-16 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="max-w-[640px]">
            <span className="media-kicker">Bạn nhận được gì</span>
            <h2 className="mt-3 text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
              Đủ loại nội dung một kênh cần.
            </h2>
            <p className="mt-4 text-[16px] leading-7 th-text-secondary">
              Cùng một nhân vật, cùng một giọng kênh — từ tấm meme buổi sáng tới tập phim cuối tuần.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {OFFERINGS.map((item) => (
              <article
                key={item.title}
                className={`media-card flex flex-col rounded-[20px] p-6 ${item.featured ? "media-card-feature" : ""}`}
              >
                <span className="media-icon flex h-11 w-11 items-center justify-center rounded-xl">
                  <item.icon size={21} />
                </span>
                <h3 className="mt-5 text-[19px] font-bold">{item.title}</h3>
                <p className="mt-2 flex-1 text-[15px] leading-6 th-text-secondary">{item.body}</p>
                <p className="mt-5 border-t pt-4 text-[13px] font-medium th-border th-text-tertiary">{item.price}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Giá */}
        <section className="media-section-alt">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
            <div>
              <span className="media-kicker">Bảng giá</span>
              <h2 className="mt-3 text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
                Trả theo bài, không thuê bao.
              </h2>
              <p className="mt-4 max-w-[480px] text-[16px] leading-7 th-text-secondary">
                1 điểm = {formatVND(pointsToVnd(1))}. Nạp bao nhiêu dùng bấy nhiêu, điểm không hết hạn, làm hỏng thì
                được hoàn điểm tự động.
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

        {/* Kêu gọi cuối */}
        <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="media-cta rounded-[28px] px-6 py-14 text-center sm:px-12 sm:py-16">
            <h2 className="mx-auto max-w-[680px] text-[30px] font-extrabold leading-[1.1] tracking-[-0.035em] sm:text-[46px]">
              Kênh đầu tiên chỉ cần <span className="th-text-gradient">vài câu mô tả.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-[540px] text-[16px] leading-7 th-text-secondary">
              Gõ ý tưởng, AI dựng kênh và nhân vật để bạn duyệt. Tặng {FREE_TRIAL_POINTS} điểm để làm thử ngay hôm nay.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={focusComposer}
                className="media-primary-button inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold"
              >
                Bắt đầu miễn phí <ArrowRight size={17} strokeWidth={2.5} />
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
