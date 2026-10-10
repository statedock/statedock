import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/context";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "./api";

interface Client {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface Props {
  close: () => void;
}

export function McpClients({ close }: Props) {
  const { t, lang } = useI18n();
  const m = t.app.mcp;
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState("Codex");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setClients(await api<Client[]>("/auth/mcp-clients"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const created = await api<{ token: string }>("/auth/mcp-clients", "POST", { name });
      setToken(created.token);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/auth/mcp-clients/${id}`, "DELETE");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const copyToken = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const agentPrompt = m.agentPromptDirective(token);
  const copyAgentPrompt = () => {
    navigator.clipboard.writeText(agentPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && close()}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[560px] min-w-0 grid-cols-1 max-h-[90dvh] overflow-y-auto">
        <DialogHeader className="min-w-0 pr-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-blue-500" />
            <DialogTitle>{m.dialogTitle}</DialogTitle>
          </div>
          <DialogDescription>{m.dialogDesc}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4 py-2">
          {error && (
            <p className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-500">
              {error}
            </p>
          )}

          {token && (
            <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs">
              <div className="space-y-1.5">
                <strong className="block text-emerald-700 dark:text-emerald-300">
                  {m.tokenSavedNotice}
                </strong>
                <div className="flex items-center justify-between gap-2 rounded bg-background p-2 font-mono text-[11px] border border-border">
                  <code className="min-w-0 break-all">{token}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyToken}
                    className="h-7 shrink-0 px-2"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t border-emerald-500/20 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-200">
                    {m.agentPromptTitle}
                  </span>
                  <a
                    href="/agent.md"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {m.viewAgentGuide}
                  </a>
                </div>
                <div className="flex min-w-0 flex-col items-stretch gap-3 rounded bg-background/80 p-2 text-[11px] border border-border">
                  <span className="min-w-0 [overflow-wrap:anywhere] text-muted-foreground font-mono">
                    {agentPrompt}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={copyAgentPrompt}
                    className="h-7 max-w-full self-end px-2 text-xs font-medium"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="mr-1 h-3.5 w-3.5 text-emerald-500" />
                        {m.copiedPrompt}
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        {m.copyPrompt}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {m.endpointLabel}
                <code className="font-mono break-all text-foreground">{`${window.location.origin}/mcp`}</code>
              </p>
            </div>
          )}

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Input
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder={m.clientNamePlaceholder}
              className="min-w-0 flex-1 text-xs"
            />
            <Button
              size="sm"
              disabled={busy || !name.trim()}
              onClick={() => void create()}
              className="h-9 shrink-0 text-xs"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {m.createBtn}
            </Button>
          </div>

          <div className="divide-y divide-border/40 rounded-lg border border-border/60">
            {clients.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{m.emptyTokens}</p>
            ) : (
              clients.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="break-all font-medium text-foreground">{c.name}</strong>
                      <code className="font-mono text-[11px] text-muted-foreground">
                        {c.token_prefix}…
                      </code>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {c.last_used_at
                        ? m.lastUsed(
                            new Date(c.last_used_at).toLocaleString(
                              lang === "zh" ? "zh-CN" : "en-US",
                            ),
                          )
                        : m.neverUsed}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void revoke(c.id)}
                    className="h-8 w-8 shrink-0 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                    title={m.revokeTitle(c.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
