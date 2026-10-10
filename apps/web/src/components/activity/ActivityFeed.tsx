import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/context";
import type { Activity, Plan } from "@statedock/core";
import { Bot, HelpCircle, User } from "lucide-react";

interface Props {
  activity: Activity[];
  plans: Plan[];
}

export function ActivityFeed({ activity, plans }: Props) {
  const { t, lang } = useI18n();
  const act = t.app.activity;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
        <div>
          <CardTitle className="text-base font-semibold">{act.title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{act.desc}</p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          {act.count(activity.length)}
        </Badge>
      </CardHeader>

      <CardContent className="divide-y border-border/40 p-0">
        {activity.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground space-y-2">
            <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">{act.emptyTitle}</p>
          </div>
        ) : (
          activity.map((a) => {
            const isAgent = a.actor.type === "agent";
            const planSubject =
              a.subjectType === "plan" ? plans.find((p) => p.id === a.subjectId) : null;

            return (
              <div
                key={a.id}
                className="flex items-start gap-3.5 p-4 transition-colors hover:bg-muted/30"
              >
                {/* Actor Avatar */}
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isAgent
                      ? "bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20"
                      : "bg-purple-500/10 text-purple-500 ring-1 ring-purple-500/20"
                  }`}
                >
                  {isAgent ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-xs font-semibold text-foreground">
                      {a.actor.name || a.actor.id}
                    </strong>
                    <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
                      {a.action}
                    </Badge>
                    <time className="ml-auto text-[11px] text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}
                    </time>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {a.subjectType === "plan" ? (
                      planSubject ? (
                        <>
                          <span className="font-mono font-medium text-blue-500 mr-1.5">
                            {planSubject.reference}
                          </span>
                          <span>{planSubject.title}</span>
                        </>
                      ) : (
                        `Plan ${a.subjectId}`
                      )
                    ) : (
                      a.subjectId
                    )}
                    {a.details?.status ? act.statusChanged(String(a.details.status)) : ""}
                  </p>

                  {a.details?.note != null && (
                    <blockquote className="mt-2 rounded border-l-2 border-primary/50 bg-muted/40 px-3 py-1.5 text-xs text-foreground/90 font-mono">
                      {String(a.details.note)}
                    </blockquote>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
