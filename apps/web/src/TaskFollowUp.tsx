import { Button } from "@/components/ui/button";
import type { FeedbackInput, Plan, ReviewInput, TaskEntry } from "@statedock/core";
import { useEffect, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n/context";

export function TaskFollowUp({ plan }: { plan: Plan }) {
  const { t, lang } = useI18n();
  const f = t.app.followUp;

  const verdictLabel: Record<ReviewInput["verdict"], string> = {
    passed: f.verdictPassed,
    changes_requested: f.verdictChanges,
    inconclusive: f.verdictInconclusive,
  };

  const [reviews, setReviews] = useState<TaskEntry[]>([]);
  const [feedback, setFeedback] = useState<TaskEntry[]>([]);
  const [body, setBody] = useState("");
  const [scope, setScope] = useState("");
  const [verdict, setVerdict] = useState<ReviewInput["verdict"]>("inconclusive");
  const [summary, setSummary] = useState("");
  const [limitations, setLimitations] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const [r, fb] = await Promise.all([
      api<TaskEntry[]>(`/plans/${plan.reference}/reviews`),
      api<TaskEntry[]>(`/plans/${plan.reference}/feedback`),
    ]);
    setReviews(r);
    setFeedback(fb);
  }

  useEffect(() => {
    void refresh().catch((e) => setMessage(e.message));
    const timer = setInterval(() => void refresh().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [plan.reference]);

  async function submit(kind: "reviews" | "feedback", content: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await api(`/plans/${plan.reference}/${kind}`, "POST", content);
      if (kind === "feedback") setBody("");
      else {
        setScope("");
        setSummary("");
        setLimitations("");
        setEvidence("");
      }
      setMessage(f.submittedMsg);
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border bg-background p-3 text-base sm:text-sm";
  const isZh = lang === "zh";

  return (
    <section className="space-y-5 border-t pt-4">
      {/* 1. Independent Reviews */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{f.reviewsTitle}</h3>
        <p className="text-xs text-muted-foreground">{f.reviewsDesc}</p>
        {reviews.map((row) => {
          const value = row.content as ReviewInput;
          return (
            <article key={row.id} className="space-y-1 rounded-xl border p-3 text-sm">
              <p className="font-semibold">{verdictLabel[value.verdict]}</p>
              <p className="text-xs text-muted-foreground">
                {row.actor.name || row.actor.id} ·{" "}
                {new Date(row.createdAt).toLocaleString(isZh ? "zh-CN" : "en-US")}
              </p>
              <p className="whitespace-pre-wrap">{value.summary}</p>
              <p className="whitespace-pre-wrap text-xs">
                {isZh ? "范围：" : "Scope: "}
                {value.scope}
              </p>
              {value.limitations && (
                <p className="whitespace-pre-wrap text-xs">
                  {isZh ? "未检查 / 限制：" : "Unchecked / Limitations: "}
                  {value.limitations}
                </p>
              )}
              {value.evidence && (
                <details className="text-xs">
                  <summary className="cursor-pointer">{isZh ? "检查依据" : "Evidence"}</summary>
                  <p className="whitespace-pre-wrap break-words">{value.evidence}</p>
                </details>
              )}
            </article>
          );
        })}
        {!reviews.length && <p className="text-xs text-muted-foreground">{f.noReviews}</p>}
        <details>
          <summary className="cursor-pointer text-sm font-medium">{f.addReviewTitle}</summary>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit("reviews", { scope, verdict, summary, limitations, evidence });
            }}
          >
            <label className="block text-xs">
              {f.scopeLabel}
              <input
                className={field}
                required
                maxLength={2000}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              {f.verdictLabel}
              <select
                className={field}
                value={verdict}
                onChange={(e) => setVerdict(e.target.value as ReviewInput["verdict"])}
              >
                {Object.entries(verdictLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              {f.summaryLabel}
              <textarea
                className={field}
                required
                maxLength={1000}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              {f.limitationsLabel}
              <textarea
                className={field}
                maxLength={2000}
                value={limitations}
                onChange={(e) => setLimitations(e.target.value)}
              />
            </label>
            <details>
              <summary className="cursor-pointer text-xs">{f.evidenceSummary}</summary>
              <textarea
                aria-label={f.evidenceAriaLabel}
                className={field}
                maxLength={2000}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </details>
            <Button disabled={busy || !scope.trim() || !summary.trim()}>{f.saveReviewBtn}</Button>
          </form>
        </details>
      </div>

      {/* 2. User Feedback */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{f.feedbackTitle}</h3>
        {feedback.map((row) => (
          <article key={row.id} className="rounded-xl border p-3">
            <p className="whitespace-pre-wrap text-sm">{(row.content as FeedbackInput).body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.actor.name || row.actor.id} ·{" "}
              {new Date(row.createdAt).toLocaleString(isZh ? "zh-CN" : "en-US")}
            </p>
          </article>
        ))}
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit("feedback", { body });
          }}
        >
          <textarea
            aria-label={f.feedbackTitle}
            placeholder={f.feedbackPlaceholder}
            className={field}
            rows={3}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button disabled={busy || !body.trim()}>{f.saveFeedbackBtn}</Button>
          <p className="text-xs text-muted-foreground">{f.feedbackDesc(plan.reference)}</p>
        </form>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
    </section>
  );
}
