import { StateDockLogo } from "@/components/layout/StateDockLogo";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { useI18n } from "@/i18n/context";
import { ArrowUpRight, Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type Heading = { id: string; title: string; level: number; alias?: string };

const SECTION_IDS = [
  "overview",
  "getting-started",
  "shared-features",
  "agent-identities-and-ready-queues",
  "task-lifecycle",
  "statedock-cloud",
  "cloudflare-self-hosted",
  "statedock-local",
  "notifications",
  "troubleshooting",
];

const LEGACY_ANCHORS: Record<number, string> = {
  0: "overview",
  1: "quickstart",
  2: "collaboration",
  3: "identities",
  4: "lifecycle",
  5: "quotas",
  7: "docker-self-hosted",
  8: "notifications",
  9: "faq",
};

function cleanHeading(value: string): string {
  return value
    .replace(/\[(.*?)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]/g, "")
    .trim();
}

function slugify(value: string): string {
  return cleanHeading(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function headingsIn(markdown: string): Heading[] {
  let section = 0;
  return markdown.split("\n").flatMap((line) => {
    const match = line.match(/^(#{2,3})\s+(.+?)\s*#*$/);
    if (!match) return [];
    const level = match[1].length;
    const sectionIndex = level === 2 ? section++ : -1;
    return [
      {
        id: sectionIndex >= 0 ? SECTION_IDS[sectionIndex] || slugify(match[2]) : slugify(match[2]),
        title: cleanHeading(match[2]),
        level,
        alias: sectionIndex >= 0 ? LEGACY_ANCHORS[sectionIndex] : undefined,
      },
    ];
  });
}

function safeHref(href: string): string | null {
  const value = href.trim();
  return /^(https?:|mailto:)/i.test(value) || value.startsWith("/") || value.startsWith("#")
    ? value
    : null;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g);
  return parts.filter(Boolean).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      return href ? (
        <a
          key={index}
          href={href}
          className="text-primary underline underline-offset-2 hover:opacity-80"
          target={/^https?:/i.test(href) ? "_blank" : undefined}
          rel={/^https?:/i.test(href) ? "noreferrer" : undefined}
        >
          {link[1]}
        </a>
      ) : (
        link[1]
      );
    }
    if (
      (part.startsWith("**") && part.endsWith("**")) ||
      (part.startsWith("__") && part.endsWith("__"))
    ) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (
      (part.startsWith("*") && part.endsWith("*")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function renderMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let h2Index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("~~~")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("~~~")) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(
        <pre
          key={blocks.length}
          className="overflow-x-auto rounded-xl border border-border bg-muted/50 p-4 text-sm"
        >
          <code className="font-mono">{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2];
      const sectionIndex = level === 2 ? h2Index++ : -1;
      const id = sectionIndex >= 0 ? SECTION_IDS[sectionIndex] || slugify(title) : slugify(title);
      const alias = sectionIndex >= 0 ? LEGACY_ANCHORS[sectionIndex] : undefined;
      const Tag = ("h" + level) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      const classes =
        level === 1
          ? "scroll-mt-24 text-3xl font-bold tracking-tight sm:text-4xl"
          : level === 2
            ? "scroll-mt-24 border-b border-border/70 pb-2 text-2xl font-semibold tracking-tight"
            : "scroll-mt-24 text-lg font-semibold tracking-tight";
      blocks.push(
        <Tag key={blocks.length} id={id} className={classes}>
          {alias && alias !== id && <span id={alias} />} {renderInline(title)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    if (line.trim() === "---" || line.trim() === "***") {
      blocks.push(<hr key={blocks.length} className="border-border" />);
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].startsWith(">"))
        quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote
          key={blocks.length}
          className="border-l-2 border-primary/40 pl-4 text-muted-foreground"
        >
          {renderInline(quote.join(" "))}
        </blockquote>,
      );
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = tableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().includes("|"))
        rows.push(tableCells(lines[index++]));
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/60">
              <tr>
                {headers.map((cell, cellIndex) => (
                  <th key={cellIndex} className="border-b border-border px-3 py-2 font-semibold">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="even:bg-muted/20">
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex} className="border-b border-border/70 px-3 py-2 align-top">
                      {renderInline(row[cellIndex] || "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const listMatch = line.match(/^\s*([-*+]\s+|\d+\.\s+)(.*)$/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]\s+|\d+\.\s+)(.*)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(item[2]);
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List
          key={blocks.length}
          className={ordered ? "list-decimal space-y-2 pl-6" : "list-disc space-y-2 pl-6"}
        >
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </List>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (
        !current.trim() ||
        current.startsWith("~~~") ||
        /^(#{1,6})\s/.test(current) ||
        current.startsWith(">") ||
        current.trim() === "---"
      )
        break;
      if (current.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1]))
        break;
      if (/^\s*([-*+]\s+|\d+\.\s+)/.test(current)) break;
      paragraph.push(current.trim());
      index += 1;
    }
    blocks.push(
      <p key={blocks.length} className="leading-7 text-foreground/85">
        {renderInline(paragraph.join(" "))}
      </p>,
    );
  }
  return blocks;
}

export function DocPage({ initialMarkdown }: { initialMarkdown?: string } = {}) {
  const { lang } = useI18n();
  const [markdown, setMarkdown] = useState(initialMarkdown ?? "");
  const [loading, setLoading] = useState(!initialMarkdown);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);
  const markdownPath = lang === "zh" ? "/doc.zh.md" : "/doc.md";

  useEffect(() => {
    if (initialMarkdown && markdown) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    fetch(markdownPath, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Documentation request failed");
        setMarkdown(await response.text());
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [markdownPath]);

  const headings = useMemo(() => headingsIn(markdown), [markdown]);
  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const text =
    lang === "zh"
      ? {
          onPage: "本页内容",
          loading: "正在加载文档…",
          failed: "文档加载失败。请直接打开 Markdown 文档。",
          copy: "复制 Markdown",
          copied: "已复制",
          raw: "原始 Markdown",
          app: "打开应用",
          machine: "Agent 配置",
          footer: "一个文档源，适用于不同部署版本。",
        }
      : {
          onPage: "On this page",
          loading: "Loading documentation…",
          failed: "The guide could not be loaded. Open the Markdown document directly.",
          copy: "Copy Markdown",
          copied: "Copied",
          raw: "Raw Markdown",
          app: "Open App",
          machine: "Agent setup",
          footer: "One documentation source for every deployment.",
        };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="flex shrink-0 items-center gap-2 font-semibold">
            <StateDockLogo className="h-7 w-7" />
            <span>StateDock</span>
            <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
              /doc
            </span>
          </a>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <button
              onClick={copyMarkdown}
              disabled={!markdown}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{copied ? text.copied : text.copy}</span>
            </button>
            <a
              href={markdownPath}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted sm:inline-flex"
            >
              {text.raw}
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://app.statedock.dev"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              {text.app}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-2 text-sm">
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {text.onPage}
            </p>
            <nav className="space-y-1 border-l border-border pl-3">
              {headings
                .filter((heading) => heading.level === 2)
                .map((heading) => (
                  <a
                    key={heading.id}
                    href={"#" + heading.id}
                    className="block py-1 text-muted-foreground hover:text-primary"
                  >
                    {heading.title}
                  </a>
                ))}
            </nav>
            <div className="space-y-1 border-t border-border pt-4 text-xs">
              <p className="font-semibold">{text.machine}</p>
              <a href="/agent.md" className="block text-primary hover:underline">
                agent.md
              </a>
              <a href="/setup.md" className="block text-primary hover:underline">
                setup.md
              </a>
              <a href="/skill.md" className="block text-primary hover:underline">
                skill.md
              </a>
            </div>
          </div>
        </aside>
        <main className="min-w-0 max-w-4xl space-y-5">
          {loading && <p className="text-muted-foreground">{text.loading}</p>}
          {loadError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p>{text.failed}</p>
              <a href={markdownPath} className="mt-2 inline-block text-primary underline">
                {markdownPath}
              </a>
            </div>
          )}
          {!loading && !loadError && (
            <article className="space-y-6 break-words">{renderMarkdown(markdown)}</article>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <StateDockLogo className="h-4 w-4" />
              <span>{text.footer}</span>
            </div>
            <a
              href="https://app.statedock.dev"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {text.app}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
