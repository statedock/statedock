export function formatProjectName(
  project?: { name?: string; slug?: string } | null,
  inboxLabel = "Inbox",
): string {
  if (!project) return "";
  if (project.slug === "inbox") {
    return inboxLabel;
  }
  return project.name ?? "";
}
