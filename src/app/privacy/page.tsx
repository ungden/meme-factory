import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/marketing/site-footer";
import SiteHeader from "@/components/marketing/site-header";

export const metadata: Metadata = {
  title: "Chính sách bảo mật",
  description: "AIDA thu thập, dùng và bảo vệ dữ liệu của bạn như thế nào.",
};

const linkClass = "th-text-accent underline underline-offset-4";

export default function PrivacyPolicy() {
  return (
    <div className="media-home min-h-screen overflow-x-clip">
      <SiteHeader />

      <main>
        <article className="mx-auto max-w-[860px] px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
          <h1 className="text-4xl font-extrabold tracking-tight th-text-primary">Chính sách bảo mật</h1>
          <p className="mt-3 th-text-tertiary">Cập nhật lần cuối: 10/09/2026</p>

          <Section title="1. Thông tin chúng tôi thu thập">
            <p>AIDA (“chúng tôi”) thu thập các thông tin sau khi bạn dùng dịch vụ:</p>
            <ul>
              <li><strong>Thông tin tài khoản:</strong> địa chỉ email khi bạn đăng ký (bằng email hoặc đăng nhập Google).</li>
              <li><strong>Những gì bạn làm trên AIDA:</strong> ý tưởng, mô tả, kịch bản, nhân vật và giọng nhân vật, ảnh, video, phụ đề và phim làm ra trong lúc dùng.</li>
              <li><strong>Thông tin giao dịch:</strong> lịch sử nạp tiền, mua điểm và dùng điểm. Chúng tôi không lưu số thẻ hay thông tin đăng nhập ngân hàng của bạn.</li>
              <li><strong>Cách bạn dùng sản phẩm:</strong> để cải thiện tính năng và chất lượng bài làm ra. Việc đo lường chỉ bật khi bạn đồng ý.</li>
            </ul>
          </Section>

          <Section title="2. Chúng tôi dùng thông tin để làm gì">
            <ul>
              <li>Cung cấp và vận hành các tính năng của AIDA.</li>
              <li>Gửi yêu cầu viết chữ, vẽ ảnh, đọc giọng và làm video tới các đối tác cung cấp mô hình AI.</li>
              <li>Quản lý tài khoản, trả lời khi bạn cần trợ giúp và xử lý sự cố.</li>
              <li>Đối soát tiền nạp và điểm trong ví.</li>
              <li>Phân tích để sản phẩm dễ dùng hơn.</li>
            </ul>
          </Section>

          <Section title="3. Chia sẻ thông tin với bên thứ ba">
            <p>
              Chúng tôi không bán, trao đổi hay cho thuê thông tin cá nhân của bạn. Để cung cấp dịch vụ, một phần thông tin
              được chia sẻ cho:
            </p>
            <ul>
              <li><strong>Nhà cung cấp mô hình AI:</strong> ý tưởng, kịch bản và ảnh mẫu cần thiết để làm bài. Phần dữ liệu này chịu thêm chính sách của nhà cung cấp tương ứng.</li>
              <li><strong>Nhà cung cấp hạ tầng:</strong> Supabase (đăng nhập, cơ sở dữ liệu và lưu trữ), Vercel (website), Railway (máy xử lý video) và SePay (đối soát chuyển khoản).</li>
              <li><strong>Yêu cầu pháp lý:</strong> khi cơ quan có thẩm quyền yêu cầu, hoặc để bảo vệ quyền lợi hợp pháp của chúng tôi.</li>
            </ul>
          </Section>

          <Section title="4. Quyền của bạn">
            <ul>
              <li>Xem và sửa thông tin cá nhân ở trang <Link href="/settings" className={linkClass}>Tài khoản</Link>.</li>
              <li>Xoá kênh, nhân vật, ảnh và video đã làm, trừ phần sổ giao dịch phải giữ để đối soát.</li>
              <li>
                Xoá hẳn tài khoản ở trang <Link href="/settings" className={linkClass}>Tài khoản</Link>, hoặc viết cho chúng tôi.
                Khi tài khoản bị xoá, mọi dữ liệu liên quan bị xoá khỏi cơ sở dữ liệu, trừ thông tin pháp luật bắt buộc lưu giữ.
              </li>
            </ul>
          </Section>

          <Section title="5. Lưu trữ và bảo mật">
            <p>
              Chúng tôi áp dụng các biện pháp bảo mật tiêu chuẩn (mã hoá đường truyền, đăng nhập an toàn qua Supabase) để
              bảo vệ dữ liệu khỏi truy cập trái phép. Tuy vậy, không cách truyền dữ liệu nào qua Internet an toàn tuyệt đối.
            </p>
          </Section>

          <Section title="6. Liên hệ">
            <p>
              Có câu hỏi về chính sách này, bạn viết cho chúng tôi tại{" "}
              <a href="mailto:support@aida.vn" className={linkClass}>support@aida.vn</a> nhé.
            </p>
          </Section>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 space-y-4 leading-7 th-text-secondary [&_li]:pl-1 [&_strong]:th-text-primary [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
      <h2 className="text-xl font-bold th-text-primary">{title}</h2>
      {children}
    </section>
  );
}
