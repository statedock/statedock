import { useEffect, useState } from "react";
import { useI18n } from "./i18n/context";
import { api } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

type Instance = {
  registrationMode: "invite";
  publicUrl: string;
  emailConfigured: boolean;
  telegramConfigured: boolean;
  discordConfigured: boolean;
};
type User = {
  id: string;
  email: string;
  disabled_at: string | null;
  instance_approved_at: string | null;
  created_at: string;
};
type Event = { id: string; action: string; subject_id: string; created_at: string };

export function InstanceAdmin({ currentUserId }: { currentUserId: string }) {
  const { t } = useI18n();
  const a = t.app.instanceAdmin;
  const [instance, setInstance] = useState<Instance | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    const [info, members, history] = await Promise.all([
      api<Instance>("/admin/instance"),
      api<User[]>("/admin/users"),
      api<Event[]>("/admin/events"),
    ]);
    setInstance(info);
    setUsers(members);
    setEvents(history);
  }
  useEffect(() => {
    refresh().catch(() => setError(a.failed));
  }, [a.failed]);
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch {
      setError(a.failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="p-5 space-y-5 max-w-4xl">
      <h2 className="text-lg font-semibold">{a.title}</h2>
      <p className="text-sm text-muted-foreground">{a.description}</p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {!instance ? (
        <p>{a.loading}</p>
      ) : (
        <>
          <div className="rounded-lg border p-4 space-y-3">
            <p>{instance.publicUrl}</p>
            <p>
              {a.registration}: {a.inviteOnly}
            </p>
            <p>
              {a.email}: {instance.emailConfigured ? a.configured : a.missing}
            </p>
            <p>
              Telegram: {instance.telegramConfigured ? a.configured : a.missing} · Discord:{" "}
              {instance.discordConfigured ? a.configured : a.missing}
            </p>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(async () => {
                await api("/admin/users", "POST", { email });
                setEmail("");
              });
            }}
          >
            <Input
              type="email"
              required
              placeholder={a.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button disabled={busy}>{a.invite}</Button>
          </form>
          <p className="text-xs text-muted-foreground">{a.inviteHelp}</p>
          <div className="space-y-2">
            {users.map((user) => (
              <div
                className="border rounded p-3 flex items-center justify-between gap-4"
                key={user.id}
              >
                <span>
                  {user.email} ·{" "}
                  {!user.instance_approved_at
                    ? a.pending
                    : user.disabled_at
                      ? a.disabled
                      : a.active}
                </span>
                {user.id === currentUserId ? (
                  <span>{a.administrator}</span>
                ) : (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void mutate(() =>
                        user.instance_approved_at
                          ? api(`/admin/users/${encodeURIComponent(user.id)}`, "PUT", {
                              disabled: !user.disabled_at,
                            })
                          : api("/admin/users", "POST", { email: user.email }),
                      )
                    }
                  >
                    {!user.instance_approved_at
                      ? a.approve
                      : user.disabled_at
                        ? a.enable
                        : a.disable}
                  </Button>
                )}
              </div>
            ))}
          </div>
          <h3 className="font-semibold">{a.history}</h3>
          <div className="space-y-1 text-xs text-muted-foreground">
            {events.map((event) => (
              <p key={event.id}>
                {new Date(event.created_at).toLocaleString()} ·{" "}
                {a.actions[event.action as keyof typeof a.actions] ?? event.action} ·{" "}
                {event.subject_id}
              </p>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
