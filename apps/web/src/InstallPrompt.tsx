import { StateDockLogo } from "@/components/layout/StateDockLogo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

export function InstallPrompt() {
  const { t } = useI18n();
  const p = t.app.installPrompt;
  const [prompt, setPrompt] = useState<any>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (standalone || localStorage.getItem("statedock.install-dismissed")) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios) setShowIos(true);

    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(
        event as Event & {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: string }>;
        },
      );
    };
    const installed = () => {
      setPrompt(null);
      setShowIos(false);
    };

    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!prompt && !showIos) return null;

  return (
    <aside className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-foreground">
      <div className="flex items-center gap-2.5">
        <StateDockLogo className="h-5 w-5 shrink-0" />
        <div>
          <strong className="block font-medium">{p.title}</strong>
          <small className="text-muted-foreground">
            {showIos ? (
              <>
                <Share className="inline h-3 w-3 mr-1" />
                {p.iosHint}
              </>
            ) : (
              p.defaultHint
            )}
          </small>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {prompt && (
          <Button
            size="sm"
            onClick={async () => {
              await prompt.prompt();
              const result = await prompt.userChoice;
              if (result.outcome !== "accepted") setPrompt(null);
            }}
            className="h-7 text-xs"
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            {p.installBtn}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            localStorage.setItem("statedock.install-dismissed", "1");
            setPrompt(null);
            setShowIos(false);
          }}
          className="h-7 w-7 text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </aside>
  );
}
