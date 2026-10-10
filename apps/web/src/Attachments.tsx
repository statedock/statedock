import { Button } from "@/components/ui/button";
import type { Attachment } from "@statedock/core";
import { useEffect, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n/context";

export async function uploadImage(
  reference: string,
  file: File,
  sizeErrorMsg?: string,
  failMsg?: string,
) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  ) {
    throw new Error(sizeErrorMsg || "Please select PNG, JPEG, or WebP images under 5 MB.");
  }
  const response = await fetch(`/api/plans/${encodeURIComponent(reference)}/attachments`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "x-file-name": encodeURIComponent(file.name),
    },
    body: file,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? (failMsg || "Image upload failed, please retry."));
  }
}

export function Attachments({ reference }: { reference: string }) {
  const { t } = useI18n();
  const a = t.app.attachments;

  const [rows, setRows] = useState<Attachment[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setRows(await api<Attachment[]>(`/plans/${reference}/attachments`));
  }

  useEffect(() => {
    setRows([]);
    void refresh().catch((e) => setMessage(e.message));
  }, [reference]);

  return (
    <section className="space-y-3 rounded-xl border border-border p-3">
      <h3 className="text-sm font-semibold">{a.title}</h3>
      <div className="flex flex-wrap gap-3">
        {rows.map((row) => (
          <div key={row.id} className="w-28">
            <a href={`/api/attachments/${row.id}`} target="_blank" rel="noreferrer">
              <img
                src={`/api/attachments/${row.id}`}
                alt={row.name}
                className="h-24 w-28 rounded-lg border border-border object-cover"
                loading="lazy"
              />
            </a>
            <p className="truncate text-xs">{row.name}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/attachments/${row.id}`, "DELETE");
                  await refresh();
                } catch (e) {
                  setMessage((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {a.removeBtn}
            </Button>
          </div>
        ))}
      </div>
      <label className="block text-xs">
        {a.uploadLabel}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          className="mt-2 block w-full text-xs"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setMessage("");
            try {
              await uploadImage(reference, file, a.sizeError, a.uploadFailed);
              await refresh();
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <p role="status" className="text-xs text-muted-foreground">
        {message}
      </p>
    </section>
  );
}
