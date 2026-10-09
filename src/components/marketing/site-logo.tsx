import { Sparkles } from "lucide-react";

export function SiteLogo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="media-logo flex h-9 w-9 items-center justify-center rounded-[11px]">
        <Sparkles size={18} fill="currentColor" />
      </span>
      <span className="text-[20px] font-extrabold tracking-[-0.03em]">AIDA</span>
    </span>
  );
}
