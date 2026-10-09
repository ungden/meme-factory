import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import SiteFooter from "@/components/marketing/site-footer";
import SiteHeader from "@/components/marketing/site-header";
import { FREE_TRIAL_POINTS } from "@/lib/point-pricing";

export const metadata: Metadata = {
  title: "Hỗ trợ",
  description: "Câu hỏi thường gặp về kênh, nhân vật, meme, video, phim ngắn và điểm trên AIDA.",
};

type Faq = { question: string; answer: React.ReactNode };

const linkClass = "th-text-accent underline underline-offset-4";

const GROUPS: { title: string; items: Faq[] }[] = [
  {
    title: "Bắt đầu",
    items: [
      {
        question: "Tôi mới đăng ký, bắt đầu từ đâu?",
        answer: (
          <>
            Không cần cài đặt gì trước. Ở <Link href="/projects" className={linkClass}>trang chính</Link>, gõ vài câu
            về kênh của bạn — nói về gì, cho ai xem — hoặc mở <Link href="/projects/new" className={linkClass}>Kênh mới</Link>.
            AI điền hồ sơ kênh (tên kênh, người xem, giọng kể), bạn xem lại và sửa nếu muốn. Tài khoản mới được tặng{" "}
            {FREE_TRIAL_POINTS} điểm để làm thử.
          </>
        ),
      },
      {
        question: "Một tài khoản có nhiều kênh được không?",
        answer:
          "Được. Mỗi kênh có hồ sơ, nhân vật và nội dung riêng — một fanpage, một kênh TikTok, mỗi cái một kênh trên AIDA.",
      },
    ],
  },
  {
    title: "Nhân vật",
    items: [
      {
        question: "Nhân vật dùng để làm gì?",
        answer:
          "Nhân vật là gương mặt của kênh. Khi bộ ảnh chuẩn đã khoá, mọi meme, video và phim ngắn của kênh đều lấy đúng nhân vật đó, nên người xem nhận ra ngay dù bài đăng khác nhau.",
      },
      {
        question: "Làm sao để có nhân vật?",
        answer: (
          <>
            Mở kênh, vào mục <strong>Nhân vật</strong>. AI vẽ nhân vật theo hồ sơ kênh, hoặc bạn tải ảnh của mình lên làm
            ảnh gốc. AI dựng thêm các góc (cận mặt, toàn thân, sau lưng); bạn duyệt rồi khoá bộ ảnh chuẩn.
          </>
        ),
      },
    ],
  },
  {
    title: "Làm nội dung",
    items: [
      {
        question: "Làm meme, video hay phim ngắn thế nào?",
        answer:
          "Ở trang chính, gõ một ý tưởng, chọn kênh, chọn phim ngắn hoặc meme rồi bấm làm. Để trống ý tưởng thì AI tự nghĩ chuyện mới theo hồ sơ kênh. Phim ngắn có thể hỏi bạn giữa chừng khi cần quyết định; meme làm xong là hiện ngay. Video lẻ làm ở mục Tạo video trong kênh.",
      },
      {
        question: "Video có dùng ảnh của tôi được không?",
        answer: (
          <>
            Được. Khi làm một video ngắn trong kênh (mục <strong>Tạo video</strong>), bạn có thể đưa ảnh của mình — sản
            phẩm, con người, khung cảnh — để AI làm theo cho đúng.
          </>
        ),
      },
      {
        question: "“Tự làm mỗi ngày” là gì?",
        answer: (
          <>
            AI tự nghĩ ý tưởng và làm bài đều đặn cho kênh. Trong kênh, mở <strong>Tạo phim ngắn</strong> để bật tự làm
            phim mỗi ngày, hoặc <strong>Tạo ảnh</strong> để bật tự làm meme mỗi ngày. Bạn chọn số lượng và mức chi tối đa
            cho mỗi phim; mỗi bài trừ điểm như khi bạn tự làm, tắt lúc nào cũng được.
          </>
        ),
      },
      {
        question: "Phim của tôi đang dừng ở một bước, phải làm gì?",
        answer:
          "Mở tập phim trong kênh: nếu đang chờ bạn quyết định, màn hình sẽ nói rõ cần gì. Nếu chờ quá lâu, gửi cho chúng tôi tên kênh và tên tập phim qua email hỗ trợ.",
      },
    ],
  },
  {
    title: "Điểm và tài khoản",
    items: [
      {
        question: "Điểm được trừ như thế nào?",
        answer: (
          <>
            Mỗi lần làm trừ đúng số điểm của việc đó, và số điểm luôn hiện trước khi bạn bấm làm. Xem giá meme, nhân vật,
            phim ngắn và ví dụ tự làm mỗi ngày ở <Link href="/pricing" className={linkClass}>bảng giá</Link>.
          </>
        ),
      },
      {
        question: "Làm hỏng có mất điểm không?",
        answer: "Không. Lượt làm thất bại được hoàn điểm tự động, và bạn xem lại được trong lịch sử của ví.",
      },
      {
        question: "Nạp tiền bao lâu thì có điểm?",
        answer:
          "Quét mã QR và chuyển khoản đúng nội dung; điểm vào tài khoản ngay khi ngân hàng báo có, thường trong vòng một phút.",
      },
      {
        question: "Tôi muốn xoá tài khoản và dữ liệu?",
        answer: (
          <>
            Vào <strong>Cài đặt → Xoá tài khoản</strong>. Chi tiết về dữ liệu nằm trong{" "}
            <Link href="/privacy" className={linkClass}>Chính sách bảo mật</Link>.
          </>
        ),
      },
    ],
  },
];

const SUPPORT_EMAIL = "support@aida.vn";

export default function HelpPage() {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Cần hỗ trợ AIDA")}&body=${encodeURIComponent(
    "Mô tả vấn đề bạn gặp:\n\n\nKênh và màn hình đang mở:\n\nTên tập phim hoặc bài (nếu có):\n",
  )}`;

  return (
    <div className="media-home min-h-screen overflow-x-clip">
      <SiteHeader />

      <main>
        <section className="media-hero">
          <div className="mx-auto max-w-[860px] px-4 pb-10 pt-14 sm:px-6 sm:pt-20">
            <span className="media-kicker">Hỗ trợ</span>
            <h1 className="mt-4 text-[36px] font-extrabold leading-[1.06] tracking-[-0.04em] sm:text-[52px]">
              Cần giúp gì?
            </h1>
            <p className="mt-4 max-w-[620px] text-[16px] leading-7 th-text-secondary sm:text-[18px]">
              Ba bước dùng AIDA: tạo kênh, dựng nhân vật, rồi làm meme, video, phim ngắn — từng bài hoặc tự làm mỗi
              ngày. Phần lớn câu hỏi đã có câu trả lời bên dưới.
            </p>

            <div className="media-card mt-8 flex flex-col gap-4 rounded-[20px] p-5 sm:flex-row sm:items-center">
              <span className="media-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                <Mail size={20} />
              </span>
              <div className="min-w-0">
                <p className="font-medium">
                  Email hỗ trợ: <a href={mailto} className={linkClass}>{SUPPORT_EMAIL}</a>
                </p>
                <p className="mt-1 text-[14px] leading-6 th-text-tertiary">
                  Thường trả lời trong một ngày làm việc. Kèm tên kênh và màn hình bạn đang mở để chúng tôi tra ra nhanh
                  hơn.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[860px] space-y-12 px-4 pb-20 pt-4 sm:px-6">
          {GROUPS.map((group, index) => (
            <section key={group.title} aria-labelledby={`faq-${index}`}>
              <h2 id={`faq-${index}`} className="text-[20px] font-bold tracking-[-0.02em]">{group.title}</h2>
              <dl className="media-card mt-4 divide-y rounded-[20px] th-border">
                {group.items.map((faq) => (
                  <div key={faq.question} className="p-5 th-border">
                    <dt className="font-semibold">{faq.question}</dt>
                    <dd className="mt-1.5 text-[15px] leading-6 th-text-secondary">{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
