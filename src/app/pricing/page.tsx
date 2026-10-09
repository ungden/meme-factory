import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, Check } from "lucide-react";
import SiteFooter from "@/components/marketing/site-footer";
import SiteHeader from "@/components/marketing/site-header";
import { FREE_TRIAL_POINTS, POINT_COSTS, POINT_PACKAGES, formatVND } from "@/lib/point-pricing";
import {
  FILM_POINTS_RANGE,
  PRICING_EXAMPLES,
  autopilotDayEstimate,
  pointsToVnd,
  trialImageCount,
} from "@/lib/pricing-examples";

export const metadata: Metadata = {
  title: "Bảng giá",
  description:
    "AIDA tính theo điểm: 1 điểm = 500đ, nạp bao nhiêu dùng bấy nhiêu, không thuê bao. Meme, nhân vật, phim ngắn và tự làm mỗi ngày đều thấy giá trước khi làm.",
};

type Points = number | { min: number; max: number };

function pointsText(points: Points) {
  if (typeof points === "number") return points === 0 ? "Miễn phí" : `${points.toLocaleString("vi-VN")} điểm`;
  if (points.min === points.max) return `${points.min.toLocaleString("vi-VN")} điểm`;
  return `${points.min.toLocaleString("vi-VN")}–${points.max.toLocaleString("vi-VN")} điểm`;
}

function vndText(points: Points) {
  if (typeof points === "number") return points === 0 ? "" : `≈ ${formatVND(pointsToVnd(points))}`;
  if (points.min === points.max) return `≈ ${formatVND(pointsToVnd(points.min))}`;
  return `≈ ${formatVND(pointsToVnd(points.min))} – ${formatVND(pointsToVnd(points.max))}`;
}

// Ví dụ "tự làm mỗi ngày": tính từ giá thật, không ghi số tay, để đổi giá meme
// hay khoảng giá phim thì trang này đổi theo.
const AUTOPILOT_PLANS = [
  { label: "Chỉ meme", detail: "3 meme mỗi ngày", plan: { films: 0, memes: 3 } },
  { label: "Phim và meme", detail: "1 phim ngắn + 3 meme mỗi ngày", plan: { films: 1, memes: 3 } },
].map((item) => ({ ...item, day: autopilotDayEstimate(item.plan) }));

export default function PricingPage() {
  return (
    <div className="media-home min-h-screen overflow-x-clip">
      <SiteHeader />

      <main>
        <section className="media-hero">
          <div className="mx-auto max-w-[1100px] px-4 pb-12 pt-14 text-center sm:px-6 sm:pt-20 lg:px-8">
            <span className="media-kicker">Bảng giá</span>
            <h1 className="mx-auto mt-4 max-w-[760px] text-[36px] font-extrabold leading-[1.06] tracking-[-0.04em] sm:text-[56px]">
              Trả theo thứ <span className="th-text-gradient">kênh bạn làm ra.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[620px] text-[16px] leading-7 th-text-secondary sm:text-[18px]">
              Không thuê bao, không ràng buộc tháng. Nạp điểm, mỗi meme, ảnh nhân vật hay phim ngắn trừ đúng số điểm
              của việc đó — và bạn luôn thấy giá trước khi bấm làm.
            </p>
            <ul className="mx-auto mt-7 flex max-w-[760px] flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px] th-text-secondary">
              {[
                `1 điểm = ${formatVND(pointsToVnd(1))}`,
                `Tặng ${FREE_TRIAL_POINTS} điểm (khoảng ${trialImageCount()} meme) khi xác nhận email`,
                "Điểm không hết hạn",
              ].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check size={15} strokeWidth={2.5} className="shrink-0 th-text-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-[1100px] px-4 pb-20 sm:px-6 lg:px-8" aria-labelledby="packages">
          <h2 id="packages" className="text-[24px] font-bold tracking-[-0.02em]">Gói nạp</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {POINT_PACKAGES.map((pkg) => {
              const memes = Math.floor(pkg.points / POINT_COSTS.meme);
              const films = Math.floor(pkg.points / FILM_POINTS_RANGE.min);
              return (
                <article
                  key={pkg.id}
                  className={`media-card flex flex-col rounded-[20px] p-5 ${pkg.popular ? "media-card-feature" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{pkg.name}</h3>
                    {pkg.popular && (
                      <span className="media-pill rounded-full px-2 py-0.5 text-[11px] font-semibold">Phổ biến</span>
                    )}
                  </div>
                  <p className="mt-4 text-[28px] font-extrabold tracking-[-0.03em]">{formatVND(pkg.price)}</p>
                  <p className="mt-0.5 th-text-secondary">{pkg.points.toLocaleString("vi-VN")} điểm</p>
                  <p className="mt-4 border-t pt-4 text-[13px] leading-5 th-border th-text-tertiary">
                    Khoảng {memes} meme
                    {films > 0 ? ` hoặc ${films === 1 ? "một" : `${films}`} phim ngắn` : ""}.
                  </p>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-sm th-text-tertiary">
            Nạp bằng chuyển khoản ngân hàng (quét mã QR). Điểm vào tài khoản ngay khi ngân hàng báo có.
          </p>
        </section>

        <section className="media-section-alt" aria-labelledby="examples">
          <div className="mx-auto grid max-w-[1100px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8">
            <div>
              <h2 id="examples" className="text-[24px] font-bold tracking-[-0.02em]">Mỗi thứ tốn bao nhiêu</h2>
              <p className="mt-2 text-[15px] leading-6 th-text-secondary">Giá đúng như lúc trừ điểm trong kênh.</p>
              <ul className="media-card mt-6 divide-y rounded-[20px] th-border">
                {PRICING_EXAMPLES.map((example) => (
                  <li key={example.label} className="flex items-start justify-between gap-4 p-4 th-border">
                    <div className="min-w-0">
                      <p className="font-medium">{example.label}</p>
                      {example.note && <p className="mt-1 text-[13px] leading-5 th-text-tertiary">{example.note}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{pointsText(example.points)}</p>
                      <p className="text-[13px] th-text-tertiary">{vndText(example.points)}</p>
                    </div>
                  </li>
                ))}
                <li className="flex items-start justify-between gap-4 p-4 th-border">
                  <div className="min-w-0">
                    <p className="font-medium">Một video ngắn từ ảnh của bạn</p>
                    <p className="mt-1 text-[13px] leading-5 th-text-tertiary">
                      Tuỳ độ dài và độ nét; số điểm hiện trên nút trước khi bạn bấm làm.
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-semibold">Báo giá trước</p>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="flex items-center gap-2 text-[24px] font-bold tracking-[-0.02em]">
                <CalendarClock size={22} className="th-text-accent" /> Tự làm mỗi ngày
              </h2>
              <p className="mt-2 text-[15px] leading-6 th-text-secondary">
                Bạn chọn mỗi ngày làm bao nhiêu phim, bao nhiêu meme, và mức chi tối đa cho mỗi phim. Mỗi bài trừ điểm
                như khi bạn tự bấm làm; tắt lúc nào cũng được.
              </p>
              <div className="mt-6 space-y-4">
                {AUTOPILOT_PLANS.map((item) => (
                  <article key={item.label} className="media-card rounded-[20px] p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="font-semibold">{item.label}</h3>
                      <p className="text-[13px] th-text-tertiary">{item.detail}</p>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3">
                      <div className="media-mini rounded-[14px] p-3">
                        <dt className="text-[12px] th-text-tertiary">Mỗi ngày</dt>
                        <dd className="mt-1 font-semibold">{pointsText(item.day)}</dd>
                        <dd className="text-[12px] th-text-tertiary">{vndText(item.day)}</dd>
                      </div>
                      <div className="media-mini rounded-[14px] p-3">
                        <dt className="text-[12px] th-text-tertiary">30 ngày</dt>
                        <dd className="mt-1 font-semibold">{pointsText({ min: item.day.min * 30, max: item.day.max * 30 })}</dd>
                        <dd className="text-[12px] th-text-tertiary">{vndText({ min: item.day.min * 30, max: item.day.max * 30 })}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              <p className="mt-4 text-[13px] leading-5 th-text-tertiary">
                Ví dụ tính từ giá meme {POINT_COSTS.meme} điểm và phim {FILM_POINTS_RANGE.min}–{FILM_POINTS_RANGE.max} điểm
                một tập ~{FILM_POINTS_RANGE.seconds} giây. Phim có mức chi tối đa cho từng tập và cả ngày; AI không tiêu quá
                mức đó.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1100px] px-4 py-20 sm:px-6 lg:px-8" aria-labelledby="faq">
          <h2 id="faq" className="text-[24px] font-bold tracking-[-0.02em]">Câu hỏi thường gặp</h2>
          <dl className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              ["Điểm có hết hạn không?", "Không. Điểm đã nạp ở lại trong tài khoản cho tới khi bạn dùng hết."],
              [
                "Làm hỏng thì có mất điểm không?",
                "Không. Lượt làm thất bại được hoàn điểm tự động; bạn xem lại toàn bộ trong lịch sử ví.",
              ],
              ["Tôi có phải cam kết theo tháng không?", "Không. Nạp bao nhiêu dùng bấy nhiêu, ngưng lúc nào cũng được."],
            ].map(([question, answer]) => (
              <div key={question} className="media-card rounded-[20px] p-5">
                <dt className="font-semibold">{question}</dt>
                <dd className="mt-1.5 text-[15px] leading-6 th-text-secondary">{answer}</dd>
              </div>
            ))}
            <div className="media-card rounded-[20px] p-5">
              <dt className="font-semibold">Nội dung làm ra thuộc về ai?</dt>
              <dd className="mt-1.5 text-[15px] leading-6 th-text-secondary">
                Thuộc về bạn. Chi tiết trong{" "}
                <Link href="/terms" className="th-text-accent underline underline-offset-4">Điều khoản sử dụng</Link>.
              </dd>
            </div>
          </dl>

          <div className="media-cta mt-14 rounded-[28px] px-6 py-12 text-center sm:px-12">
            <h2 className="text-[26px] font-extrabold tracking-[-0.03em] sm:text-[36px]">
              Thử với {FREE_TRIAL_POINTS} điểm tặng.
            </h2>
            <p className="mx-auto mt-3 max-w-[480px] text-[15px] leading-6 th-text-secondary">
              Đủ làm vài meme đầu tiên cho kênh để xem AIDA làm được gì, không cần nạp tiền.
            </p>
            <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link
                href="/login"
                className="media-primary-button inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold"
              >
                Dùng thử miễn phí <ArrowRight size={17} strokeWidth={2.5} />
              </Link>
              <Link
                href="/"
                className="media-secondary-button inline-flex h-12 items-center justify-center rounded-xl px-6 text-[15px] font-semibold"
              >
                Về trang chủ
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
