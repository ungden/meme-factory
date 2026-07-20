import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng (Terms of Service) | AIDA",
  description: "Điều khoản sử dụng dịch vụ của AIDA Meme Factory.",
};

export default function TermsOfService() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8">
      <div className="prose prose-violet max-w-none">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl mb-8">
          Điều khoản sử dụng (Terms of Service)
        </h1>
        <p className="text-gray-500 mb-8">Cập nhật lần cuối: 20/03/2026</p>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Chấp nhận điều khoản</h2>
          <p className="text-gray-600 mb-4">
            Bằng việc truy cập, tải xuống, cài đặt hoặc sử dụng ứng dụng/website AIDA (“Dịch vụ”), bạn đồng ý tuân thủ các Điều khoản sử dụng này. Nếu bạn không đồng ý với bất kỳ điều khoản nào, vui lòng không sử dụng Dịch vụ.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Mô tả dịch vụ</h2>
          <p className="text-gray-600 mb-4">
            AIDA là nền tảng giúp người dùng tạo, quản lý và lưu trữ các nội dung truyện tranh, meme, hình ảnh được tạo ra bởi trí tuệ nhân tạo (AI).
          </p>
          <p className="text-gray-600 mb-4">
            Mọi nội dung do AI tạo ra đều có tính chất tham khảo. Chúng tôi không cam kết tính hoàn hảo tuyệt đối của kết quả đầu ra. Việc tạo nội dung yêu cầu tiêu hao “points” (điểm) theo tỷ lệ được quy định trên hệ thống.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Tài khoản và Bảo mật</h2>
          <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
            <li>Bạn phải tự bảo mật thông tin đăng nhập của mình.</li>
            <li>Bạn chịu trách nhiệm cho tất cả các hoạt động diễn ra dưới tài khoản của bạn.</li>
            <li>Bạn đồng ý cung cấp thông tin chính xác khi tạo tài khoản.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Trách nhiệm về Nội dung (User-Generated Content)</h2>
          <p className="text-gray-600 mb-4">Khi sử dụng AIDA để tạo nội dung, bạn đồng ý tuân thủ các quy tắc sau:</p>
          <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
            <li>Không tạo nội dung vi phạm pháp luật hiện hành của nước sở tại và quốc tế.</li>
            <li>Không tạo nội dung khiêu dâm, bạo lực, thù địch, phân biệt chủng tộc, tôn giáo, hoặc xâm phạm quyền riêng tư của người khác.</li>
            <li>Không sử dụng Dịch vụ để giả mạo, phỉ báng, hay lừa đảo bất kỳ cá nhân hoặc tổ chức nào.</li>
            <li>Bạn tự chịu trách nhiệm pháp lý đối với nội dung (hình ảnh, văn bản) mà bạn tạo ra và chia sẻ/xuất bản (publish) thông qua Dịch vụ của chúng tôi. Chúng tôi bảo lưu quyền từ chối cung cấp dịch vụ hoặc khóa tài khoản của người dùng vi phạm các điều khoản này mà không cần báo trước.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Thanh toán và Điểm (Points)</h2>
          <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
            <li>Points (điểm) được sử dụng để thực hiện các tính năng như tạo hình ảnh AI.</li>
            <li>Points được mua bằng tiền thật và không thể quy đổi ngược lại thành tiền mặt (Non-refundable), trừ các trường hợp do lỗi kỹ thuật nghiêm trọng từ phía hệ thống (được chúng tôi xác minh).</li>
            <li>Nếu yêu cầu tạo AI bị lỗi do hệ thống, lượng points tương ứng sẽ được tự động hoàn lại vào tài khoản của bạn.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Quyền Sở hữu trí tuệ</h2>
          <p className="text-gray-600 mb-4">
            Hệ thống, giao diện, phần mềm và nhận diện thương hiệu của AIDA là tài sản sở hữu trí tuệ của chúng tôi. 
            Bạn được cấp quyền sử dụng thương mại đối với các hình ảnh và nội dung mà bạn TẠO RA thông qua Dịch vụ (tương ứng với số points bạn đã chi trả), với điều kiện nội dung đó không vi phạm quy định tại Mục 4.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Sửa đổi Điều khoản</h2>
          <p className="text-gray-600 mb-4">
            Chúng tôi có quyền sửa đổi Điều khoản sử dụng này vào bất kỳ lúc nào. Việc bạn tiếp tục sử dụng Dịch vụ sau khi có sự thay đổi đồng nghĩa với việc bạn chấp nhận Điều khoản mới.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Liên hệ</h2>
          <p className="text-gray-600 mb-4">
            Đối với bất kỳ vấn đề nào liên quan đến Điều khoản dịch vụ, bạn có thể liên hệ chúng tôi tại: support@aida.vn.
          </p>
        </section>
      </div>
    </div>
  );
}
