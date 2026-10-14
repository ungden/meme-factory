import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/page";
import CharacterStage from "./_components/character-stage";

export default function CharactersPage() {
  return (
    <Suspense fallback={<PageSkeleton blocks={3} />}>
      <CharacterStage />
    </Suspense>
  );
}
