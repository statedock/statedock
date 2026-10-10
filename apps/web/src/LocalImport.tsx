import { Database, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { api } from "./api";
import { useI18n } from "./i18n/context";

export function LocalImport({ onComplete }: { onComplete: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const payload = JSON.parse(await file.text());
      const result = await api<{
        projects: number;
        plans: number;
        markdownFiles: number;
        activities: number;
        planEvents: number;
      }>("/auth/import-local", "POST", payload);
      window.alert(
        t.app.empty.importSuccess(
          result.projects,
          result.plans,
          result.markdownFiles,
          result.activities,
        ),
      );
      onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="local-import">
      <label className="secondary">
        <Database size={15} />
        <Upload size={14} />
        {busy ? t.app.empty.importing : t.app.empty.importLocal}
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => void upload(e)}
          hidden
        />
      </label>
      <small>{t.app.empty.importLocalHint}</small>
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
