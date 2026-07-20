# Giá AI image generation và chính sách thu phí

Cập nhật: 2026-07-21. AIDA dùng giá **Standard API**, không lấy giá Batch vì luồng tạo ảnh hiện tại là tương tác trực tiếp. Giá bán được tính theo công thức:

`giá khách hàng = (input + output của provider) × 1,5`

Sau đó quy đổi theo 26.500 VND/USD và làm tròn lên point nguyên. Hệ thống dùng giá trị của gói point rẻ nhất, 499đ/point, để gói lớn vẫn đạt mức cộng 50%. Đây là **markup 50%**, tương đương biên lợi nhuận gộp khoảng 33,3% trước phí thanh toán, thuế và hạ tầng.

## Giá vốn chính thức

| Model | Đầu ra | Giá provider / ảnh | Giá bán tối thiểu sau +50% |
| --- | ---: | ---: | ---: |
| Nano Banana 2 Lite | 1K | $0.0336 | 3 pts |
| Nano Banana 2 | 0.5K | $0.045 | 4 pts |
| Nano Banana 2 | 1K | $0.067 | 6 pts |
| Nano Banana 2 | 2K | $0.101 | 9 pts |
| Nano Banana 2 | 4K | $0.151 | 13 pts |
| Nano Banana Pro | 1K/2K | $0.134 | 11 pts |
| Nano Banana Pro | 4K | $0.24 | 20 pts |
| GPT Image 2 | 1024×1024, low | $0.006 | 1 pt |
| GPT Image 2 | 1024×1024, medium | $0.053 | 5 pts |
| GPT Image 2 | 1024×1024, high | $0.211 | 17 pts |
| GPT Image 2 | 1536×1024 hoặc 1024×1536, medium | $0.041 | 4 pts |
| GPT Image 2 | 1536×1024 hoặc 1024×1536, high | $0.165 | 14 pts |

Các mức “tối thiểu” chỉ gồm output. Mỗi request còn cộng prompt và ảnh tham chiếu:

- Nano Banana 2: input text/image $0.50/1M tokens; output text/thinking $3/1M; output image $60/1M.
- Nano Banana Pro: input text/image $2/1M tokens, khoảng $0.0011 mỗi ảnh input; output text/thinking $12/1M; output image $120/1M.
- GPT Image 2: text input $5/1M tokens; image input $8/1M; image output $30/1M. Model luôn xử lý ảnh input ở high fidelity nên repair nhiều refs có thể đắt hơn đáng kể.

## Mức đang áp dụng trong AIDA

| Hành động | Cấu hình thật | Giá thu |
| --- | --- | ---: |
| Tạo nhân vật | Nano Banana 2, 1K, dự phòng tối đa 4 refs | 6 pts |
| Tạo meme / cú máy | Nano Banana 2, 1K, dự phòng tối đa 14 refs | 6 pts |
| Tạo background | Nano Banana 2, 2K, không ref | 9 pts |

Pricing engine nằm ở `src/lib/ai-pricing.ts`. Các generation job meme/cú máy lưu `estimated_cost_usd`, `actual_cost_usd`, usage, mức markup và ngày hiệu lực. Khi provider trả modality token usage, hệ thống reconcile giá vốn thật; nếu provider không trả breakdown, hệ thống giữ estimate đã báo trước.

Nguồn chính thức:

- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini image generation guide](https://ai.google.dev/gemini-api/docs/image-generation)
- [OpenAI image generation pricing calculator/table](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing#image-generation)
- [Vietcombank exchange rates](https://www.vietcombank.com.vn/KHCN/Cong-cu-tien-ich/Ty-gia)
