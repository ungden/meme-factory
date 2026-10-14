import type { Metadata } from "next";
import SiteFooter from "@/components/marketing/site-footer";
import SiteHeader from "@/components/marketing/site-header";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng",
  description: "Điều khoản khi dùng AIDA: tài khoản, nội dung, điểm và thanh toán.",
};

const linkClass = "th-text-accent underline underline-offset-4";

export default function TermsOfService() {
  return (
    <div className="media-home min-h-screen overflow-x-clip">
      <SiteHeader />

      <main>
        <article className="mx-auto max-w-[860px] px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
          <h1 className="text-4xl font-extrabold tracking-tight th-text-primary">Điều khoản sử dụng</h1>
          <p className="mt-3 th-text-tertiary">Cập nhật lần cuối: 10/09/2026</p>

          <Section title="1. Chấp nhận điều khoản">
            <p>
              Khi truy cập hoặc dùng website và ứng dụng AIDA (“Dịch vụ”), bạn đồng ý với các điều khoản này. Nếu không
              đồng ý với điều nào, bạn đừng dùng Dịch vụ nhé.
            </p>
          </Section>

          <Section title="2. Dịch vụ là gì">
            <p>
              AIDA giúp bạn làm, quản lý và lưu meme, video, phim ngắn và chữ đăng kèm cho kênh của mình, với sự hỗ trợ của
              trí tuệ nhân tạo.
            </p>
            <p>
              Bài do AI làm ra mang tính tham khảo; chúng tôi không cam kết mọi kết quả đều hoàn hảo. Mỗi việc làm bài trừ
              một số điểm theo bảng giá hiện trên hệ thống.
            </p>
          </Section>

          <Section title="3. Tài khoản và bảo mật">
            <ul>
              <li>Bạn tự giữ an toàn thông tin đăng nhập của mình.</li>
              <li>Bạn chịu trách nhiệm cho mọi hoạt động diễn ra trong tài khoản của bạn.</li>
              <li>Bạn đồng ý cung cấp thông tin chính xác khi tạo tài khoản.</li>
            </ul>
          </Section>

          <Section title="4. Trách nhiệm về nội dung">
            <p>Khi dùng AIDA để làm bài, bạn đồng ý:</p>
            <ul>
              <li>Không làm nội dung vi phạm pháp luật Việt Nam và quốc tế.</li>
              <li>Không làm nội dung khiêu dâm, bạo lực, thù địch, phân biệt chủng tộc hay tôn giáo, hoặc xâm phạm quyền riêng tư của người khác.</li>
              <li>Không dùng Dịch vụ để giả mạo, bôi nhọ hay lừa đảo bất kỳ cá nhân, tổ chức nào.</li>
              <li>
                Tự chịu trách nhiệm pháp lý với bài bạn làm ra và đăng tải. Chúng tôi có quyền ngừng cung cấp dịch vụ hoặc
                khoá tài khoản vi phạm các điều trên mà không cần báo trước.
              </li>
            </ul>
          </Section>

          <Section title="5. Thanh toán và điểm">
            <ul>
              <li>Điểm dùng cho các việc như vẽ ảnh, đọc giọng, làm video và phim ngắn. Giá luôn hiện trước khi bạn bấm làm.</li>
              <li>
                Điểm được mua bằng tiền thật và không đổi ngược lại thành tiền mặt, trừ khi hệ thống gặp lỗi kỹ thuật nghiêm
                trọng đã được chúng tôi xác minh.
              </li>
              <li>
                Việc chưa kịp gửi tới nhà cung cấp, hoặc hỏng vì lỗi kỹ thuật đã xác minh, được hoàn điểm. Việc chưa rõ nhà
                cung cấp đã nhận hay chưa sẽ được giữ lại để đối soát, tránh làm và tính tiền hai lần.
              </li>
            </ul>
          </Section>

          <Section title="6. Sở hữu trí tuệ">
            <p>
              Hệ thống, giao diện, phần mềm và thương hiệu AIDA thuộc sở hữu của chúng tôi. Bạn được dùng thương mại những bài
              bạn làm ra trên AIDA, trong phạm vi nhà cung cấp mô hình AI cho phép và với điều kiện bài đó không vi phạm mục 4.
            </p>
          </Section>

          <Section title="7. Sửa đổi điều khoản">
            <p>
              Chúng tôi có thể sửa các điều khoản này bất kỳ lúc nào. Bạn tiếp tục dùng Dịch vụ sau khi điều khoản thay đổi
              nghĩa là bạn đồng ý với bản mới.
            </p>
          </Section>

          <Section title="8. Liên hệ">
            <p>
              Có câu hỏi về điều khoản, bạn viết cho chúng tôi tại{" "}
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
    <section className="mt-10 space-y-4 leading-7 th-text-secondary [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
      <h2 className="text-xl font-bold th-text-primary">{title}</h2>
      {children}
    </section>
  );
}
