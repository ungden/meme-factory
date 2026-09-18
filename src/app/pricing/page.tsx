import type { Metadata } from "next";
import Link from "next/link";
import { FREE_TRIAL_POINTS, POINT_PACKAGES, formatVND } from "@/lib/point-pricing";
import { PRICING_EXAMPLES, trialImageCount } from "@/lib/pricing-examples";

export const metadata: Metadata = {
  title: "Bảng giá",
  description:
    "AIDA tính theo điểm: 1 điểm = 500đ, nạp bao nhiêu dùng bấy nhiêu, không thuê bao. Tài khoản mới được tặng điểm dùng thử.",
};

function PointsLabel({ points }: { points: number | { min: number; max: number } }) {
  if (typeof points === "number")
    return <span>{points === 0 ? "Miễn phí" : `${points} điểm`}</span>;
  return <span>{points.min}–{points.max} điểm</span>;
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight th-text-primary sm:text-4xl">
          Trả theo thứ bạn làm ra
        </h1>
        <p className="mt-4 text-lg th-text-secondary">
          Không thuê bao, không ràng buộc tháng. Bạn nạp điểm, mỗi lần tạo nội dung trừ đúng số điểm của
          việc đó — và luôn thấy giá trước khi bấm tạo.
        </p>
        <p className="mt-3 th-text-tertiary">
          <strong className="th-text-primary">1 điểm = 500đ.</strong> Tài khoản mới được tặng{" "}
          {FREE_TRIAL_POINTS} điểm (khoảng {trialImageCount()} tấm ảnh) ngay khi xác nhận email.
        </p>
      </header>

      <section className="mt-12" aria-labelledby="packages">
        <h2 id="packages" className="text-xl font-bold th-text-primary">
          Gói nạp
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {POINT_PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-2xl border p-5"
              style={{
                borderColor: pkg.popular ? "var(--accent-primary)" : "var(--border-primary)",
                background: "var(--bg-card)",
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold th-text-primary">{pkg.name}</h3>
                {pkg.popular && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold th-bg-accent-light th-text-accent">
                    Phổ biến
                  </span>
                )}
              </div>
              <p className="mt-3 text-2xl font-bold th-text-primary">{formatVND(pkg.price)}</p>
              <p className="mt-1 th-text-secondary">{pkg.points} điểm</p>
              <p className="mt-3 text-sm th-text-tertiary">
                Đủ khoảng {Math.floor(pkg.points / 6)} tấm ảnh
                {pkg.points >= 300 ? " hoặc một phim ngắn" : ""}.
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm th-text-tertiary">
          Nạp bằng chuyển khoản ngân hàng (quét QR). Điểm vào tài khoản ngay khi ngân hàng báo có.
        </p>
      </section>

      <section className="mt-14" aria-labelledby="examples">
        <h2 id="examples" className="text-xl font-bold th-text-primary">
          Một điểm mua được gì
        </h2>
        <ul className="mt-5 divide-y rounded-2xl border" style={{ borderColor: "var(--border-primary)", background: "var(--bg-card)" }}>
          {PRICING_EXAMPLES.map((example) => (
            <li key={example.label} className="flex flex-wrap items-baseline justify-between gap-2 p-4" style={{ borderColor: "var(--border-primary)" }}>
              <div className="min-w-0">
                <p className="th-text-primary">{example.label}</p>
                {example.note && <p className="mt-0.5 text-sm th-text-tertiary">{example.note}</p>}
              </div>
              <p className="font-semibold th-text-primary">
                <PointsLabel points={example.points} />
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14" aria-labelledby="faq">
        <h2 id="faq" className="text-xl font-bold th-text-primary">
          Câu hỏi thường gặp
        </h2>
        <dl className="mt-5 space-y-6">
          <div>
            <dt className="font-semibold th-text-primary">Điểm có hết hạn không?</dt>
            <dd className="mt-1 th-text-secondary">Không. Điểm đã nạp ở lại trong tài khoản cho tới khi bạn dùng hết.</dd>
          </div>
          <div>
            <dt className="font-semibold th-text-primary">Tạo hỏng thì có mất điểm không?</dt>
            <dd className="mt-1 th-text-secondary">
              Không. Lượt tạo thất bại được hoàn điểm tự động; bạn xem lại toàn bộ trong lịch sử giao dịch.
            </dd>
          </div>
          <div>
            <dt className="font-semibold th-text-primary">Tôi có phải cam kết theo tháng không?</dt>
            <dd className="mt-1 th-text-secondary">Không. Nạp bao nhiêu dùng bấy nhiêu, ngưng lúc nào cũng được.</dd>
          </div>
          <div>
            <dt className="font-semibold th-text-primary">Nội dung tạo ra thuộc về ai?</dt>
            <dd className="mt-1 th-text-secondary">
              Thuộc về bạn. Chi tiết trong <Link href="/terms" className="th-text-accent underline">Điều khoản sử dụng</Link>.
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-14 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-xl px-5 py-3 font-semibold text-white"
          style={{ background: "var(--accent-primary)" }}
        >
          Dùng thử miễn phí
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-xl border px-5 py-3 font-semibold th-text-secondary"
          style={{ borderColor: "var(--border-primary)" }}
        >
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
