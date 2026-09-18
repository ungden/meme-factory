import { Suspense } from "react";
import OnboardingFlow from "./_components/onboarding-flow";

export const metadata = {
  title: "Bắt đầu với AIDA",
  description: "Ba bước để có nội dung đầu tiên cho fanpage của bạn.",
};

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-64 w-full max-w-2xl animate-pulse rounded-2xl th-bg-card" />}>
      <OnboardingFlow />
    </Suspense>
  );
}
