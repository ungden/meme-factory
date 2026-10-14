import { Suspense } from "react";
import EpisodeStudio from "./_components/episode-studio";

// Màn cho người dùng cuối: ý tưởng → AIDA làm cả tập → duyệt. Sửa từng cảnh
// của một tập nằm ở trang Chỉnh tay (/video/multiscene).
export default function ShortFilmsPage() {
  return (
    <Suspense>
      <EpisodeStudio />
    </Suspense>
  );
}
