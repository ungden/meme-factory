import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hỗ trợ",
  description: "Câu hỏi thường gặp và cách liên hệ đội ngũ AIDA.",
};

const FAQS: { question: string; answer: React.ReactNode }[] = [
  {
    question: "Tôi mới đăng ký, bắt đầu từ đâu?",
    answer: (
      <>
        Sau khi xác nhận email, bạn được tặng điểm dùng thử. Vào <strong>Tạo dự án đầu tiên</strong>,
        đặt tên fanpage, chọn một nhân vật AI gợi ý, rồi tạo tấm ảnh đầu tiên — không cần nạp tiền.
      </>
    ),
  },
  {
    question: "Điểm được trừ như thế nào?",
    answer: (
      <>
        Mỗi lần tạo nội dung trừ đúng số điểm của việc đó, và số điểm luôn hiện trước khi bạn bấm tạo.
        Xem chi tiết ở <Link href="/pricing" className="th-text-accent underline">bảng giá</Link>.
      </>
    ),
  },
  {
    question: "Tạo hỏng có mất điểm không?",
    answer: "Không. Lượt tạo thất bại được hoàn điểm tự động, và bạn xem lại được trong lịch sử giao dịch của ví.",
  },
  {
    question: "Nạp tiền bao lâu thì có điểm?",
    answer:
      "Quét QR và chuyển khoản đúng nội dung; điểm vào tài khoản ngay khi ngân hàng báo có, thường trong vòng một phút.",
  },
  {
    question: "Phim của tôi đang dừng ở một bước, phải làm gì?",
    answer:
      "Mở tập phim trong Studio: nếu đang ở trạng thái chờ bạn quyết định, màn hình sẽ nói rõ cần gì. Nếu chờ quá lâu, gửi cho chúng tôi mã tập phim trong email hỗ trợ.",
  },
  {
    question: "Tôi muốn xoá tài khoản và dữ liệu?",
    answer: (
      <>
        Vào <strong>Cài đặt → Xoá tài khoản</strong>. Chi tiết về dữ liệu nằm trong{" "}
        <Link href="/privacy" className="th-text-accent underline">Chính sách bảo mật</Link>.
      </>
    ),
  },
];

const SUPPORT_EMAIL = "support@aida.vn";

export default function HelpPage() {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Cần hỗ trợ AIDA")}&body=${encodeURIComponent(
    "Mô tả vấn đề bạn gặp:\n\n\nMàn hình / tính năng:\n\nMã tập phim hoặc mã lượt tạo (nếu có):\n",
  )}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="text-3xl font-extrabold tracking-tight th-text-primary sm:text-4xl">Hỗ trợ</h1>
      <p className="mt-4 text-lg th-text-secondary">
        Phần lớn câu hỏi đã có câu trả lời ở đây. Nếu chưa, viết cho chúng tôi — thường trả lời trong
        vòng một ngày làm việc.
      </p>

      <div className="mt-8 rounded-2xl border p-5" style={{ borderColor: "var(--border-primary)", background: "var(--bg-card)" }}>
        <p className="th-text-primary">
          Email hỗ trợ: <a href={mailto} className="th-text-accent underline">{SUPPORT_EMAIL}</a>
        </p>
        <p className="mt-2 text-sm th-text-tertiary">
          Kèm giúp chúng tôi màn hình bạn đang ở và mã tập phim (nếu có) — có hai thứ đó thì tra ra lỗi
          nhanh hơn nhiều.
        </p>
      </div>

      <section className="mt-12" aria-labelledby="faq">
        <h2 id="faq" className="text-xl font-bold th-text-primary">Câu hỏi thường gặp</h2>
        <dl className="mt-5 space-y-6">
          {FAQS.map((faq) => (
            <div key={faq.question}>
              <dt className="font-semibold th-text-primary">{faq.question}</dt>
              <dd className="mt-1 th-text-secondary">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-12 flex flex-wrap gap-4 text-sm th-text-tertiary">
        <Link href="/pricing" className="underline">Bảng giá</Link>
        <Link href="/terms" className="underline">Điều khoản</Link>
        <Link href="/privacy" className="underline">Bảo mật</Link>
      </div>
    </div>
  );
}
