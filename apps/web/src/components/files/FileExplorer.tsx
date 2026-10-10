import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/context";
import type { MarkdownFile } from "@statedock/core";
import { ChevronRight, Clock, FileText, HelpCircle, Plus } from "lucide-react";

interface Props {
  files: MarkdownFile[];
  onOpenFile: (path: string) => void;
  onNewFile: () => void;
}

export function FileExplorer({ files, onOpenFile, onNewFile }: Props) {
  const { t, lang } = useI18n();
  const f = t.app.files;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
        <div>
          <CardTitle className="text-base font-semibold">{f.title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
        </div>
        <Button size="sm" onClick={onNewFile} className="h-8 text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" />
          {f.newFile}
        </Button>
      </CardHeader>

      <CardContent className="divide-y divide-border/40 p-0">
        {files.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground space-y-2">
            <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">{f.emptyTitle}</p>
            <p className="text-xs text-muted-foreground/70">{f.emptyDesc}</p>
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.path}
              onClick={() => onOpenFile(file.path)}
              className="group flex cursor-pointer items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-blue-500" />
                <span className="font-mono text-xs font-semibold text-foreground group-hover:text-primary">
                  {file.path}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <time className="flex items-center gap-1 text-[11px]">
                  <Clock className="h-3 w-3" />
                  {new Date(file.updatedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}
                </time>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground" />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
