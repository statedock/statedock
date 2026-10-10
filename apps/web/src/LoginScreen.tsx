import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { StateDockLogo } from "@/components/layout/StateDockLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/context";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "./api";

interface Props {
  onSignedIn: (user: { id: string; email: string }) => void;
}

export function LoginScreen({ onSignedIn }: Props) {
  const { t } = useI18n();
  const l = t.app.login;
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!sent) {
        await api("/auth/request-code", "POST", { email });
        setSent(true);
      } else {
        const user = await api<{ id: string; email: string }>("/auth/verify-code", "POST", {
          email,
          code,
        });
        onSignedIn(user);
      }
    } catch (e) {
      setError(
        e instanceof ApiError && ["invalid_code", "invalid_or_expired_code"].includes(e.code)
          ? l.invalidCode
          : e instanceof ApiError && e.code === "too_many_requests"
            ? l.rateLimited
            : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-[420px] space-y-4">
        <Card className="w-full border-border/80 shadow-xl">
          <form onSubmit={submit}>
            <CardHeader className="space-y-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                <StateDockLogo className="h-8 w-8" />
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <CardTitle className="text-xl font-bold">{l.title}</CardTitle>
                <Badge variant="outline" className="font-mono text-[10px]">
                  ONLINE
                </Badge>
              </div>
              <CardDescription className="text-xs">{l.subtitle}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">{l.emailLabel}</label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    disabled={sent}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={l.emailPlaceholder}
                    className="pl-9 text-xs"
                  />
                </div>
              </div>

              {sent && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{l.requestHint}</p>
                  <label className="text-xs font-semibold text-foreground">{l.codeLabel}</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder={l.codePlaceholder}
                      className="pl-9 font-mono text-xs tracking-wider"
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-500">
                  {error}
                </p>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-2 pt-2">
              <Button type="submit" disabled={busy} className="w-full text-xs">
                {busy ? l.waitingBtn : sent ? l.verifyBtn : l.sendCodeBtn}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
              {sent && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSent(false);
                    setCode("");
                    setError("");
                  }}
                  className="w-full text-xs text-muted-foreground"
                >
                  {l.switchEmailBtn}
                </Button>
              )}
            </CardFooter>
          </form>
        </Card>
        <div className="text-center">
          <a
            href="/doc"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors py-1"
          >
            {l.documentationLink}
          </a>
        </div>
      </div>
    </main>
  );
}
