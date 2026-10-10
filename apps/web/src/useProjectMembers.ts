import { api, ApiError } from "./api";
import type { Project } from "@statedock/core";
import React, { useCallback, useEffect, useState } from "react";
import type { Translations } from "./i18n/types";
import type { MembersData } from "./project-members";
export function useProjectMembers(
  open: boolean,
  project: Project | undefined,
  c: Translations["app"]["collaborators"],
  onClose: () => void,
  onProjectLeft?: () => void,
) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MembersData | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api<MembersData>(`/projects/${encodeURIComponent(project.id)}/members`));
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "fetchFailed");
    } finally {
      setLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    if (open) {
      setData(null);
      setInviteEmail("");
      setError(null);
      setSuccess(false);
      fetchMembers();
    }
  }, [open, fetchMembers]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !project) return;
    setInviting(true);
    setError(null);
    setSuccess(false);

    try {
      await api(`/projects/${encodeURIComponent(project.id)}/members`, "POST", {
        email: inviteEmail.trim(),
      });
      setInviteEmail("");
      setSuccess(true);
      await fetchMembers();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "requestFailed");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(memberId: string) {
    if (!project) return;
    if (!window.confirm(c.removeMemberConfirm)) return;

    setActionId(memberId);
    setError(null);
    try {
      await api(
        `/projects/${encodeURIComponent(project.id)}/members/${encodeURIComponent(memberId)}`,
        "DELETE",
      );
      await fetchMembers();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "removeFailed");
    } finally {
      setActionId(null);
    }
  }

  async function handleLeave() {
    if (!project) return;
    if (!window.confirm(c.leaveProjectConfirm)) return;

    setActionId("me");
    setError(null);
    try {
      await api(`/projects/${encodeURIComponent(project.id)}/members/me`, "DELETE");
      onClose();
      onProjectLeft?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "leaveFailed");
    } finally {
      setActionId(null);
    }
  }
  return {
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
  };
}
