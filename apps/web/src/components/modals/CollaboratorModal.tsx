import { Badge } from "@/components/ui/badge";
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
import type { Project } from "@statedock/core";
import {
  AlertCircle,
  CheckCircle2,
  Crown,
  Loader2,
  LogOut,
  Mail,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useProjectMembers } from "../../useProjectMembers";

interface Props {
  open: boolean;
  onClose: () => void;
  project?: Project;
  user?: {
    id: string;
    email: string;
  };
  onProjectLeft?: () => void;
}

export function CollaboratorModal({ open, onClose, project, user, onProjectLeft }: Props) {
  const { t, lang } = useI18n();
  const c = t.app.collaborators;

  const {
    loading,
    data,
    inviteEmail,
    setInviteEmail,
    inviting,
    actionId,
    error,
    success,
    fetchMembers,
    handleInvite,
    handleRemove,
    handleLeave,
  } = useProjectMembers(open, project, c, onClose, onProjectLeft);
  if (!open || !project) return null;
  const isOwner = data ? data.isOwner : (project.isOwner ?? true);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px] p-6 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {c.modalTitle}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {project.name} · {c.modalDesc}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p>{c.errors[error] || c.errors.requestFailed}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-500">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{c.inviteSuccess}</span>
          </div>
        )}

        {/* 成员展示区域 */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>{c.membersListTitle}</span>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          <div className="divide-y divide-border/40 rounded-lg border border-border/60 bg-muted/20">
            {/* 项目 Owner */}
            <div className="flex items-center justify-between p-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 font-bold">
                  <Crown className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {data?.owner?.email || c.ownerLabel}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{c.ownerDescription}</p>
                </div>
              </div>
              <Badge
                variant="secondary"
                className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              >
                {c.ownerLabel}
              </Badge>
            </div>

            {/* 协作者列表 */}
            {data?.members && data.members.length > 0 ? (
              data.members.map((member) => {
                const isMe =
                  user?.id === member.userId ||
                  user?.email.toLowerCase() === member.email.toLowerCase();
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 text-xs hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/30 font-medium text-[11px]">
                        {member.email.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-medium text-foreground">{member.email}</p>
                          {isMe && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 text-muted-foreground"
                            >
                              {c.youLabel}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {c.memberDescription}{" "}
                          {member.joinedAt
                            ? new Date(member.joinedAt).toLocaleDateString(
                                lang === "zh" ? "zh-CN" : "en-US",
                              )
                            : "-"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] border-blue-500/30 text-blue-500 bg-blue-500/5"
                      >
                        {c.collaboratorLabel}
                      </Badge>

                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={actionId === member.id}
                          onClick={() => handleRemove(member.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                          title={c.removeBtn}
                        >
                          {actionId === member.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : !loading ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground/60" />
                <p>{c.noMembersYet}</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* 创世人操作区：邀请协作者 */}
        {isOwner ? (
          <div className="mt-4 pt-3 border-t border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5 text-primary" />
                {c.inviteTitle}
              </span>
            </div>

            <form onSubmit={handleInvite} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="email"
                    required
                    placeholder={c.invitePlaceholder}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="pl-8 text-xs h-9"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="h-9 px-4 text-xs shrink-0"
                >
                  {inviting ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      {c.inviting}
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3 w-3 mr-1" />
                      {c.inviteBtn}
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{c.inviteHelp}</p>
            </form>
          </div>
        ) : (
          /* 协作者视角：提示与主动退出按钮 */
          <div className="mt-4 pt-3 border-t border-border/50 space-y-3">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs flex items-start gap-2 text-muted-foreground">
              <Shield className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p>{c.collaboratorNotice}</p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={actionId === "me"}
                onClick={handleLeave}
                className="text-xs text-rose-500 border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-600 h-8"
              >
                {actionId === "me" ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    {c.leaving}
                  </>
                ) : (
                  <>
                    <LogOut className="h-3 w-3 mr-1.5" />
                    {c.leaveBtn}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
