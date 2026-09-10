import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chính sách bảo mật (Privacy Policy) | AIDA",
  description: "Chính sách bảo mật thông tin và dữ liệu người dùng của AIDA Media Studio.",
};

export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8">
      <div className="prose prose-violet max-w-none">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl mb-8">
          Chính sách bảo mật (Privacy Policy)
        </h1>
        <p className="text-gray-500 mb-8">Cập nhật lần cuối: 10/09/2026</p>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Thu thập thông tin</h2>
          <p className="text-gray-600 mb-4">
            AIDA Media Studio (“chúng tôi”, “ứng dụng”, “website”) thu thập các thông tin sau khi bạn sử dụng dịch vụ:
          </p>
          <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
            <li><strong>Thông tin tài khoản:</strong> Địa chỉ email khi bạn đăng ký và tạo tài khoản (thông qua Supabase hoặc đăng nhập Google).</li>
            <li><strong>Dữ liệu người dùng tạo ra:</strong> Ý tưởng, prompt, kịch bản, hình ảnh và giọng nhân vật, ảnh, video, phụ đề và các bản dựng được tạo ra trong quá trình sử dụng.</li>
            <li><strong>Thông tin giao dịch:</strong> Lịch sử nạp points và lịch sử giao dịch tiêu dùng points trong hệ thống (chúng tôi KHÔNG lưu trữ trực tiếp số thẻ tín dụng hay thông tin ngân hàng của bạn).</li>
            <li><strong>Dữ liệu sử dụng:</strong> Thông tin về cách bạn tương tác với hệ thống để phục vụ cải thiện tính năng và chất lượng AI.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Sử dụng thông tin</h2>
          <p className="text-gray-600 mb-4">Chúng tôi sử dụng thông tin của bạn vào các mục đích sau:</p>
          <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
            <li>Cung cấp, vận hành và duy trì các tính năng của ứng dụng.</li>
            <li>Xử lý các yêu cầu tạo văn bản, hình ảnh, giọng nói và video thông qua các đối tác cung cấp dịch vụ AI.</li>
            <li>Quản lý tài khoản, hỗ trợ khách hàng và giải quyết các vấn đề kỹ thuật.</li>
            <li>Theo dõi thanh toán và nạp/rút điểm số (points) trên hệ thống.</li>
            <li>Phân tích để cải thiện trải nghiệm người dùng.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Chia sẻ thông tin với bên thứ ba</h2>
          <p className="text-gray-600 mb-4">
            Chúng tôi không bán, trao đổi hoặc cho thuê thông tin cá nhân của bạn cho bên thứ ba. Tuy nhiên, để cung cấp dịch vụ, thông tin của bạn có thể được chia sẻ cho:
          </p>
          <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
            <li><strong>Nhà cung cấp dịch vụ AI:</strong> Prompt, kịch bản và media tham chiếu cần thiết có thể được gửi tới API AI để tạo nội dung. Dữ liệu này chịu thêm chính sách xử lý của nhà cung cấp tương ứng.</li>
            <li><strong>Nhà cung cấp hạ tầng:</strong> Supabase (xác thực, cơ sở dữ liệu và lưu trữ), Vercel (website), Railway (worker xử lý media) và SePay (đối soát thanh toán).</li>
            <li><strong>Yêu cầu pháp lý:</strong> Khi được yêu cầu bởi cơ quan chức năng hoặc để bảo vệ quyền lợi hợp pháp của chúng tôi.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Quyền của người dùng</h2>
          <p className="text-gray-600 mb-4">Bạn có các quyền sau đối với dữ liệu của mình:</p>
          <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
            <li>Xem và chỉnh sửa thông tin cá nhân trong phần Cài đặt tài khoản.</li>
            <li>Xóa các dự án, nhân vật, hình ảnh và video đã tạo trong ứng dụng, theo các nghĩa vụ lưu giữ giao dịch và đối soát áp dụng.</li>
            <li>Yêu cầu xóa hoàn toàn tài khoản bằng cách liên hệ với chúng tôi. Khi tài khoản bị xóa, mọi dữ liệu liên quan sẽ bị xóa khỏi cơ sở dữ liệu trừ các thông tin bắt buộc lưu trữ theo quy định của pháp luật.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Lưu trữ và bảo mật</h2>
          <p className="text-gray-600 mb-4">
            Chúng tôi áp dụng các biện pháp bảo mật tiêu chuẩn (bao gồm mã hóa truyền tải và xác thực bảo mật thông qua Supabase) để bảo vệ dữ liệu của bạn khỏi việc truy cập trái phép. Tuy nhiên, không có phương thức truyền tải qua Internet nào là an toàn 100%, do đó chúng tôi không thể đảm bảo an toàn tuyệt đối.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Liên hệ</h2>
          <p className="text-gray-600 mb-4">
            Nếu bạn có bất kỳ câu hỏi nào về Chính sách bảo mật này, vui lòng liên hệ với chúng tôi tại: support@aida.vn.
          </p>
        </section>
      </div>
    </div>
  );
}
