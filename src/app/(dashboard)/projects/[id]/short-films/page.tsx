import { Suspense } from "react";
import EpisodeStudio from "./_components/episode-studio";

// Màn cho người dùng cuối: ý tưởng → AI làm cả tập → duyệt. Trình chỉnh từng
// cảnh đầy đủ vẫn ở /video/multiscene cho người cần kiểm soát chi tiết.
export default function ShortFilmsPage() {
  return (
    <Suspense>
      <EpisodeStudio />
    </Suspense>
  );
}
