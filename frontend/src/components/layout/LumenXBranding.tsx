"use client";

import { useSettingsStore } from "@/store/settingsStore";

interface LumenXBrandingProps {
  size?: "sm" | "md";
  showSlogan?: boolean;
}

export default function LumenXBranding({ size = "md", showSlogan = true }: LumenXBrandingProps) {
  const { theme } = useSettingsStore();
  const logoSize = size === "sm" ? "w-10 h-10" : "w-16 h-16";
  const titleSize = size === "sm" ? "text-2xl" : "text-3xl";
  const xSize = size === "sm" ? "text-3xl" : "text-4xl";
  const studioSize = size === "sm" ? "text-2xl" : "text-3xl";

  const isProduction = typeof window !== "undefined" && process.env.NODE_ENV === "production";
  const logoSrc =
    theme === "light"
      ? isProduction
        ? "/static/LumenX_亮色.png"
        : "/LumenX_亮色.png"
      : isProduction
        ? "/static/LumenX.png"
        : "/LumenX.png";

  return (
    <div>
      <div className="flex gap-4 items-center">
        <div className="flex-shrink-0">
          <img
            src={logoSrc}
            alt="LumenX"
            className={`${logoSize} object-contain`}
          />
        </div>
        <div className="flex flex-col flex-1 justify-center h-full gap-1">
          <div className="flex items-center justify-start -mb-1">
            <span className={`font-display ${titleSize} font-bold tracking-tight text-primary`}>
              Lumen
            </span>
            <span
              className={`font-display ${xSize} font-black tracking-tighter ml-1`}
              style={{
                background: "linear-gradient(135deg, #a855f7 0%, #6366f1 50%, #ec4899 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              X
            </span>
          </div>
          <div className="flex justify-end -mt-1 pr-2">
            <span className={`font-display ${studioSize} font-bold tracking-tight text-foreground`}>
              Studio
            </span>
          </div>
        </div>
      </div>
      {showSlogan && (
        <p className="text-[9px] text-text-muted tracking-wide text-center mt-3">
          Render Noise into Narrative
        </p>
      )}
    </div>
  );
}
