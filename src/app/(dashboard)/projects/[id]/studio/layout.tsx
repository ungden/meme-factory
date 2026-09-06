import type { ReactNode } from "react";

// The previous Studio loaded a global dark theme here. Keeping this layout
// intentionally neutral prevents a visit to the legacy URL from changing the
// dashboard after client-side navigation.
export default function ContinuityStudioLayout({ children }: { children: ReactNode }) {
  return children;
}
