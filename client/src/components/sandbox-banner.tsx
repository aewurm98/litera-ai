import { AlertTriangle } from "lucide-react";

export function SandboxBanner() {
  return (
    <div
      className="bg-amber-500 text-white text-center py-2 px-4 text-sm font-semibold flex items-center justify-center gap-2 sticky top-0 z-50"
      data-testid="banner-sandbox-mode"
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span>Simulation Mode — No data is saved</span>
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
    </div>
  );
}
