import { StateDockLogo } from "@/components/layout/StateDockLogo";
import { ArrowUpRight, Bot, Check, Copy, ExternalLink, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";

export function DocPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyFullMarkdown = async () => {
    try {
      const res = await fetch("/doc.md");
      const md = await res.text();
      await navigator.clipboard.writeText(md);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (e) {
      console.error("Failed to copy markdown", e);
    }
  };

  const connectionName = `statedock_${window.location.host.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const mcpConfigJson = `{
  "mcpServers": {
    "${connectionName}": {
      "url": "${window.location.origin}/mcp",
      "headers": {
        "Authorization": "Bearer sdm_YOUR_TOKEN_HERE"
      }
    }
  }
}`;

  const codexConfigToml = `[mcp_servers.${connectionName}]
url = "${window.location.origin}/mcp"
http_headers = { "Authorization" = "Bearer sdm_YOUR_TOKEN_HERE" }`;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center gap-2 text-foreground font-semibold tracking-tight hover:opacity-85 transition-opacity"
            >
              <StateDockLogo className="h-7 w-7" />
              <span className="text-base font-bold">StateDock</span>
            </a>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-medium">
              /doc
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <button
              onClick={copyFullMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors font-medium"
              title="Copy entire markdown document for AI Agent or clipboard"
            >
              {copiedAll ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copiedAll ? "Copied All" : "Copy Markdown"}</span>
            </button>

            <a
              href="/doc.md"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/80 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Raw .md</span>
              <ExternalLink className="h-3 w-3" />
            </a>

            <a
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-xs"
            >
              <span>Open App</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 w-full grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sticky Table of Contents Sidebar */}
        <aside className="hidden lg:block lg:col-span-1">
          <div className="sticky top-20 space-y-1 text-xs">
            <p className="font-semibold text-foreground/70 uppercase tracking-wider text-[11px] mb-3 px-2">
              On this page
            </p>
            <nav className="space-y-0.5 border-l border-border/60 pl-3">
              <a
                href="#overview"
                className="block py-1 text-muted-foreground hover:text-primary transition-colors"
              >
                1. Overview
              </a>
              <a
                href="#quickstart"
                className="block py-1 text-muted-foreground hover:text-primary transition-colors"
              >
                2. Quickstart
              </a>
              <a
                href="#collaboration"
                className="block py-1 text-muted-foreground hover:text-primary transition-colors font-medium text-foreground"
              >
                3. Team & Full Access
              </a>
              <a
                href="#lifecycle"
                className="block py-1 text-muted-foreground hover:text-primary transition-colors"
              >
                4. Task Lifecycle
              </a>
              <a
                href="#quotas"
                className="block py-1 text-muted-foreground hover:text-primary transition-colors"
              >
                5. Self-hosted Capabilities
              </a>
              <a
                href="#notifications"
                className="block py-1 text-muted-foreground hover:text-primary transition-colors"
              >
                6. Real-time Notifications
              </a>
              <a
                href="#faq"
                className="block py-1 text-muted-foreground hover:text-primary transition-colors"
              >
                7. FAQ & Troubleshooting
              </a>
            </nav>

            <div className="mt-8 pt-6 border-t border-border/50 text-[11px] text-muted-foreground space-y-2">
              <p className="font-medium text-foreground/80">Useful Links</p>
              <a href="/agent.md" target="_blank" className="block text-primary hover:underline">
                agent.md (Agent Setup Guide)
              </a>
              <a href="/skill.md" target="_blank" className="block text-primary hover:underline">
                skill.md (Authoritative Skill)
              </a>
              <a
                href="/mcp"
                target="_blank"
                className="block text-primary hover:underline font-mono"
              >
                Remote MCP Endpoint
              </a>
            </div>
          </div>
        </aside>

        {/* Content Column */}
        <main className="lg:col-span-3 space-y-12 max-w-3xl">
          {/* Header */}
          <div className="space-y-3 pb-6 border-b border-border/60">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              StateDock Operations Guide
            </h1>
            <p className="text-base text-muted-foreground">
              A pragmatic quick reference for human developers (solo or 1–5 member teams) and AI
              coding agents.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
              <span className="px-2 py-0.5 rounded bg-muted font-mono text-[11px]">
                Last Updated: October 2026
              </span>
              <span>•</span>
              <span className="font-mono text-[11px]">Direct Markdown: /doc.md</span>
            </div>
          </div>

          {/* Section 1: Overview */}
          <section id="overview" className="space-y-4 scroll-mt-20">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-primary font-mono text-lg">01.</span> Overview
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              StateDock is an append-only goal, task, and context ledger for human developers and AI
              coding agents:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded-xl border border-border/70 bg-card space-y-1.5">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-blue-500" /> For Humans
                </span>
                <p className="text-muted-foreground">
                  Track project plans, high-level decisions, active tasks, and verified outcomes
                  without context drift.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-border/70 bg-card space-y-1.5">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Bot className="h-4 w-4 text-indigo-500" /> For AI Agents
                </span>
                <p className="text-muted-foreground">
                  Recover context across sessions via{" "}
                  <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">
                    resume_project
                  </code>
                  , claim tasks, log blockers, and submit handoffs.
                </p>
              </div>
            </div>
            <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-foreground/90">
              <p className="font-medium">
                🛡️ <strong>Zero Source Code Access:</strong> StateDock never reads or stores your
                code. Source code stays strictly in your local Git repository; StateDock only
                records goals, tasks, handoff summaries, and documents.
              </p>
            </div>
          </section>

          {/* Section 2: Quickstart */}
          <section id="quickstart" className="space-y-5 scroll-mt-20">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-primary font-mono text-lg">02.</span> Quickstart
            </h2>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">1. Access StateDock Web App</h3>
              <p className="text-xs text-muted-foreground">
                Visit{" "}
                <a href="/" className="text-primary underline">
                  {window.location.origin}
                </a>{" "}
                and sign in using your email address. You will receive a passwordless 6-digit
                verification code.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  2. Connect Local Coding Agents (Cursor, Claude Code, Windsurf, Antigravity, Cline)
                </h3>
                <button
                  onClick={() => copyText(mcpConfigJson, "mcp-json")}
                  className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border border-border hover:bg-muted text-muted-foreground"
                >
                  {copiedId === "mcp-json" ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copiedId === "mcp-json" ? "Copied" : "Copy JSON"}</span>
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Generate your token in <strong>Settings → MCP Clients</strong> (token begins with{" "}
                <code className="font-mono text-foreground">sdm_</code>), then add to your editor's
                MCP config:
              </p>
              <pre className="p-3.5 rounded-xl border border-border/80 bg-muted/50 font-mono text-xs overflow-x-auto text-foreground/90">
                {mcpConfigJson}
              </pre>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">3. Connect OpenAI Codex</h3>
                <button
                  onClick={() => copyText(codexConfigToml, "codex-toml")}
                  className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border border-border hover:bg-muted text-muted-foreground"
                >
                  {copiedId === "codex-toml" ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copiedId === "codex-toml" ? "Copied" : "Copy TOML"}</span>
                </button>
              </div>
              <pre className="p-3.5 rounded-xl border border-border/80 bg-muted/50 font-mono text-xs overflow-x-auto text-foreground/90">
                {codexConfigToml}
              </pre>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                4. Connect ChatGPT Web (OAuth 2.1)
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Add a Custom MCP in ChatGPT with server URL:{" "}
                <code className="font-mono text-foreground">{`${window.location.origin}/mcp`}</code>
                . ChatGPT automatically negotiates OAuth 2.1 PKCE. Authorize your account on the web
                prompt to allow ChatGPT to read your projects and save planned tasks.
              </p>
            </div>
          </section>

          {/* Section 3: Collaboration & Full Access */}
          <section id="collaboration" className="space-y-5 scroll-mt-20">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-primary font-mono text-lg">03.</span> Team Collaboration & Full
              Access
            </h2>

            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2 text-xs">
              <p className="font-bold text-foreground text-sm flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" /> Core Collaboration Principle: Full
                Access
              </p>
              <p className="text-muted-foreground leading-relaxed">
                StateDock is designed for solo hackers and 1–5 person small teams.{" "}
                <strong>
                  Anyone added to a project automatically receives full read and write access
                </strong>{" "}
                to all tasks, plans, markdown documents, activity logs, and agent connections. No
                complex role hierarchies or read-only masks.
              </p>
            </div>

            <div className="border border-border/70 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-semibold text-foreground">
                    <th className="py-2.5 px-3">Capability</th>
                    <th className="py-2.5 px-3 text-center">Project Owner (Founder)</th>
                    <th className="py-2.5 px-3 text-center">Collaborator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-muted-foreground">
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-foreground">
                      Read & write tasks, plans, documents
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-500 font-semibold">
                      ✅ Full Access
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-500 font-semibold">
                      ✅ Full Access
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-foreground">
                      Connect AI agents to project via MCP
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-500 font-semibold">
                      ✅ Yes
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-500 font-semibold">
                      ✅ Yes
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-foreground">
                      Receive real-time outbound notifications
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-500 font-semibold">
                      ✅ Yes
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-500 font-semibold">
                      ✅ Yes
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-foreground">
                      Invite or remove collaborators
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-500 font-semibold">
                      ✅ Owner Only
                    </td>
                    <td className="py-2.5 px-3 text-center text-muted-foreground/60">❌ No</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-foreground">Delete the project</td>
                    <td className="py-2.5 px-3 text-center text-emerald-500 font-semibold">
                      ✅ Owner Only
                    </td>
                    <td className="py-2.5 px-3 text-center text-muted-foreground/60">❌ No</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-foreground">
                      Voluntarily leave the project
                    </td>
                    <td className="py-2.5 px-3 text-center text-muted-foreground/60">
                      ❌ No (Owns project)
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-500 font-semibold">
                      ✅ Yes
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
              <p>
                <strong>How to Invite:</strong> In the Web App, open the project → click{" "}
                <strong>Collaborators</strong> in the sidebar → enter the teammate's email → click{" "}
                <strong>Invite</strong>.
              </p>
              <p>
                <strong>Pre-provisioning:</strong> Even if your teammate has not signed up for
                StateDock yet, they can be invited immediately. Once they sign in with that email
                address, the shared project will instantly appear in their workspace.
              </p>
            </div>
          </section>

          {/* Section 4: Task Lifecycle */}
          <section id="lifecycle" className="space-y-5 scroll-mt-20">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-primary font-mono text-lg">04.</span> Task & Goal Lifecycle
            </h2>
            <p className="text-xs text-muted-foreground">
              Every development item in StateDock transitions through clean, deterministic states:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
                <span className="font-semibold text-blue-500 font-mono">WORKING</span>
                <p className="text-muted-foreground">
                  Direct implementation requests start here immediately. Coding agents must record a
                  WORKING task before writing code.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
                <span className="font-semibold text-muted-foreground font-mono">PLAN</span>
                <p className="text-muted-foreground">
                  Deferred proposals, backlogs, or discussion ideas. Does NOT automatically trigger
                  agent execution.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
                <span className="font-semibold text-amber-500 font-mono">WAITING</span>
                <p className="text-muted-foreground">
                  Blocked on external dependencies, human decisions, or API keys. Must always
                  include a clear blocker reason.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
                <span className="font-semibold text-emerald-500 font-mono">DONE</span>
                <p className="text-muted-foreground">
                  Task completed. Submit a structured handoff (changes, verification, next steps).
                  Keep summaries human-readable without raw diffs.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-border/70 bg-muted/30 text-xs text-muted-foreground">
              <strong className="text-foreground">Optimistic Concurrency Control:</strong> Whenever
              updating a task, pass{" "}
              <code className="font-mono bg-muted px-1 py-0.5 rounded">expectedUpdatedAt</code>. If
              another teammate or agent modified the plan concurrently, the server returns{" "}
              <code className="font-mono bg-muted px-1 py-0.5 rounded">409 Conflict</code> so you
              can re-fetch and resolve safely.
            </div>
          </section>

          {/* Section 5: Self-hosted capabilities */}
          <section id="quotas" className="space-y-5 scroll-mt-20">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              <span className="text-primary font-mono text-lg">05.</span> Self-hosted Capabilities
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All product capabilities are included: projects, collaborators, notification channels,
              API, MCP, and OAuth. There are no subscription quotas or license checks. Your
              Cloudflare account and integration providers determine infrastructure limits and
              costs.
            </p>
          </section>

          {/* Section 6: Outbound Notifications */}
          <section id="notifications" className="space-y-4 scroll-mt-20">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-primary font-mono text-lg">06.</span> Real-time Notifications
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Stay in sync with autonomous coding agents without staring at terminal screens.
              StateDock dispatches event pushes whenever a task is started, paused, or completed.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl border border-border bg-card">
                <p className="font-semibold text-foreground">Telegram</p>
                <p className="text-muted-foreground text-[11px]">Instant bot pushes</p>
              </div>
              <div className="p-3 rounded-xl border border-border bg-card">
                <p className="font-semibold text-foreground">Bark (iOS)</p>
                <p className="text-muted-foreground text-[11px]">Native iOS notifications</p>
              </div>
              <div className="p-3 rounded-xl border border-border bg-card">
                <p className="font-semibold text-foreground">Discord</p>
                <p className="text-muted-foreground text-[11px]">Team server channel alerts</p>
              </div>
              <div className="p-3 rounded-xl border border-border bg-card">
                <p className="font-semibold text-foreground">Ntfy</p>
                <p className="text-muted-foreground text-[11px]">Open-source unified push</p>
              </div>
              <div className="p-3 rounded-xl border border-border bg-card col-span-2 sm:col-span-1">
                <p className="font-semibold text-foreground">Custom Webhook</p>
                <p className="text-muted-foreground text-[11px]">HMAC-SHA256 signed JSON</p>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-border bg-muted/20 text-xs text-muted-foreground">
              💡 <strong>Private Per-User Settings:</strong> You configure your personal
              notification preferences in your own account. You will automatically receive alerts
              for tasks in projects you created <em>and</em> projects you collaborate on.
            </div>
          </section>

          {/* Section 7: FAQ & Troubleshooting */}
          <section id="faq" className="space-y-5 scroll-mt-20">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="text-primary font-mono text-lg">07.</span> FAQ & Troubleshooting
            </h2>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl border border-border bg-card space-y-1.5">
                <p className="font-bold text-foreground">
                  Q: I was invited to a project, but my sidebar still says "0 PROJECTS"?
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Verify the email address shown at the bottom of your sidebar. You must be signed
                  in to the <strong>exact email address</strong> that was invited by the project
                  owner. If you have multiple accounts, sign out and log in with the invited email.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-border bg-card space-y-1.5">
                <p className="font-bold text-foreground">
                  Q: Can collaborators see my other private projects?
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  No. StateDock isolates projects strictly. Collaborators can only see the project
                  they were explicitly added to.
                </p>
              </div>
            </div>
          </section>

          {/* Footer Callout */}
          <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <StateDockLogo className="h-4 w-4" />
              <span>StateDock — Project states for coding agents</span>
            </div>
            <div className="flex items-center gap-4">
              <a href="/doc.md" className="hover:text-foreground underline">
                doc.md
              </a>
              <a href="/agent.md" className="hover:text-foreground underline">
                agent.md
              </a>
              <a href="/skill.md" className="hover:text-foreground underline">
                skill.md
              </a>
              <a href="/" className="text-primary font-medium hover:underline">
                Launch App →
              </a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
