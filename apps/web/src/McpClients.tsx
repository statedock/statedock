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
  agent_id: string | null;
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
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [agentId, setAgentId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [name, setName] = useState("Codex");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [rows, profiles] = await Promise.all([
        api<Client[]>("/auth/mcp-clients"),
        api<{ id: string; name: string }[]>("/auth/agents"),
      ]);
      setClients(rows);
      setAgents(profiles);
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
      const created = await api<{ token: string }>("/auth/mcp-clients", "POST", {
        name,
        agentId: agentId || null,
      });
      setToken(created.token);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createAgent() {
    setBusy(true);
    setError("");
    try {
      const profile = await api<{ id: string; name: string }>("/auth/agents", "POST", {
        name: agentName,
      });
      setNotice(
        lang === "zh"
          ? `已添加身份 ${profile.name}。如需 Token，请在下方单独选择绑定身份。`
          : `Added identity ${profile.name}. Select an identity separately below when creating a token.`,
      );
      setAgentName("");
      await refresh();
      window.dispatchEvent(new Event("statedock:agents-changed"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteAgent(agent: { id: string; name: string }) {
    if (
      !window.confirm(
        lang === "zh"
          ? `删除身份「${agent.name}」？将解除它的 Token 绑定及待执行任务分配，历史记录保留。`
          : `Delete identity “${agent.name}”? Its tokens and pending tasks will be unbound. History will be retained.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/auth/agents/${agent.id}`, "DELETE");
      if (agentId === agent.id) setAgentId("");
      await refresh();
      window.dispatchEvent(new Event("statedock:agents-changed"));
      setNotice(lang === "zh" ? `已删除 ${agent.name}。` : `Deleted ${agent.name}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function bindAgent(id: string, value: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/auth/mcp-clients/${id}`, "PATCH", { agentId: value || null });
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
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[760px] min-w-0 grid-cols-1 max-h-[90dvh] overflow-y-auto">
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

          <section
            className="space-y-3"
            aria-label={lang === "zh" ? "管理 Agent 身份" : "Manage Agent Identities"}
          >
            <div>
              <h3 className="text-sm font-semibold">
                {lang === "zh" ? "Agent 身份" : "Agent Identities"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {lang === "zh"
                  ? "创建身份，用于分配任务和归组 MCP 连接。身份不会创建或启动真正的 AI Agent。"
                  : "Create identities to assign tasks and group MCP connections. An identity doesn't create or launch an AI agent."}
              </p>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-3 rounded-lg border p-3">
                <h4 className="text-xs font-semibold">
                  {lang === "zh" ? "添加身份" : "Add Identity"}
                </h4>
                <Input
                  aria-label={lang === "zh" ? "新身份名称" : "New identity name"}
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  maxLength={200}
                  placeholder={lang === "zh" ? "例如 Codex、DeepSeek" : "e.g. Codex, DeepSeek"}
                  className="min-w-0"
                />
                <Button
                  disabled={busy || !agentName.trim()}
                  onClick={() => void createAgent()}
                  className="w-full"
                >
                  {lang === "zh" ? "添加身份" : "Add Identity"}
                </Button>
              </div>
              <div className="min-w-0 space-y-2 rounded-lg border p-3">
                <h4 className="text-xs font-semibold">
                  {lang === "zh" ? "身份列表" : "Identities"} ({agents.length})
                </h4>
                {agents.length === 0 ? (
                  <p className="py-3 text-xs text-muted-foreground">
                    {lang === "zh"
                      ? "还没有身份，请在左侧添加。"
                      : "No identities yet. Add an identity to get started."}
                  </p>
                ) : (
                  <ul className="max-h-44 space-y-1 overflow-y-auto overscroll-contain">
                    {agents.map((a) => (
                      <li
                        key={a.id}
                        className="flex min-w-0 items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1"
                      >
                        <span className="min-w-0 break-all text-xs">{a.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          onClick={() => void deleteAgent(a)}
                          aria-label={
                            lang === "zh" ? `删除身份 ${a.name}` : `Delete identity ${a.name}`
                          }
                          className="h-7 w-7 shrink-0 text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {lang === "zh"
                ? "删除身份会解除 Token 绑定及待执行任务分配；有正在执行的任务时，需先完成或交接。历史记录保留。"
                : "Deleting an identity unbinds its tokens and pending tasks. Complete or hand off working tasks first. History is retained."}
            </p>
            {notice && (
              <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
                {notice}
              </p>
            )}
          </section>
          <section
            className="space-y-3 rounded-lg border p-3"
            aria-label={lang === "zh" ? "创建 Token" : "Create token"}
          >
            <h3 className="text-sm font-semibold">
              {lang === "zh" ? "创建 Token" : "Create token"}
            </h3>
            <label className="block text-xs">
              {lang === "zh" ? "分配给身份" : "Assign to identity"}
              <select
                className="mt-1 w-full rounded-md border bg-background p-2"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                disabled={busy}
              >
                <option value="">{lang === "zh" ? "暂不绑定" : "Unbound"}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <Input
                aria-label={lang === "zh" ? "Token 名称" : "Token name"}
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
            <p className="text-[11px] text-muted-foreground">
              {lang === "zh"
                ? "只影响这次创建的新 Token。下方已有 Token 可分别修改绑定身份；OAuth 需重新授权并选择身份。"
                : "Only affects the new token created here. Existing tokens below have their own bindings. For OAuth, reconnect and select an identity."}
            </p>
          </section>
          <h3 className="text-sm font-semibold">
            {lang === "zh" ? "已有 Token" : "Existing tokens"}
          </h3>
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
                    <label className="block text-[11px]">
                      {lang === "zh" ? "身份" : "Identity"}
                      <select
                        aria-label={`${c.name} Identity`}
                        disabled={busy}
                        value={c.agent_id ?? ""}
                        onChange={(e) => void bindAgent(c.id, e.target.value)}
                        className="ml-2 max-w-full rounded border bg-background p-1"
                      >
                        <option value="">{lang === "zh" ? "暂不绑定" : "Unbound"}</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
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
