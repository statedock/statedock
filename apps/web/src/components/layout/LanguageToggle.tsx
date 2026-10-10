import { useI18n } from "@/i18n/context";
import { Globe } from "lucide-react";

interface Props {
  className?: string;
}

export function LanguageToggle({ className = "" }: Props) {
  const { lang, setLang } = useI18n();

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-[#c9ccc3] bg-background/60 p-0.5 text-xs backdrop-blur-xs ${className}`}
      role="group"
      aria-label="Language selector"
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all ${
          lang === "en"
            ? "bg-[#30392f] text-white shadow-xs font-semibold"
            : "text-[#62695b] hover:text-[#262a29]"
        }`}
      >
        <Globe size={11} className={lang === "en" ? "opacity-90" : "opacity-60"} />
        <span>EN</span>
      </button>

      <button
        type="button"
        onClick={() => setLang("zh")}
        aria-pressed={lang === "zh"}
        className={`inline-flex items-center rounded-md px-2.5 py-1 font-medium transition-all ${
          lang === "zh"
            ? "bg-[#30392f] text-white shadow-xs font-semibold"
            : "text-[#62695b] hover:text-[#262a29]"
        }`}
      >
        <span>中文</span>
      </button>
    </div>
  );
}
