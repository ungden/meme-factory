import { Suspense } from "react";
import CharacterStage from "./_components/character-stage";

// Bước 2 của kênh: dựng kho nhân vật có bộ ảnh chuẩn. Trang thư viện biểu cảm
// cũ vẫn ở /mascots cho từng nhân vật.
export default function CharactersPage() {
  return (
    <Suspense>
      <CharacterStage />
    </Suspense>
  );
}
