import type { Project } from "@statedock/core";
export interface ReadyInstance {
  publicOrigin: string;
  mcpUrl: string;
}
export function buildReadyInstruction(
  instance: ReadyInstance,
  project: Pick<Project, "id" | "slug">,
  lang: "zh" | "en",
) {
  const origin = new URL(instance.publicOrigin);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.origin !== instance.publicOrigin ||
    new URL(instance.mcpUrl).href !== new URL("/mcp", origin).href ||
    !project.id ||
    !project.slug
  )
    throw new Error("Invalid instance or project binding");
  const binding = JSON.stringify({
    publicOrigin: origin.origin,
    mcpUrl: instance.mcpUrl,
    projectId: project.id,
    projectSlug: project.slug,
  });
  return lang === "zh"
    ? `请在空闲且具备此项目仓库执行权限时，依次执行 StateDock 的 Ready 任务。绑定：${binding}。
先通过当前已连接的 MCP 调用 get_instance_info，确认 publicOrigin 和 mcpUrl 完全一致，并读取项目 UUID 核对 slug 与当前仓库绑定。连接、项目或仓库不一致时停止，不能猜测、切换目录或回退到其他实例。
每次使用 claim_next_task(project: ${JSON.stringify(project.id)}) 原子认领一条 READY；PLAN 只供讨论，绝不领取。认领后核对所属项目，读取目标、决定、反馈与附件，在已绑定仓库内实施并验证，不依赖过去的聊天上下文，也不自行扩大任务范围。
完成后 submit_handoff 写回真实结果，再领取下一条。需求不明确、遇到阻碍或需要我决定时，用 pause_task 标记 WAITING，说明原因，暂停队列。
没有 READY 时安静结束。不能仅靠此指令创建后台轮询或定时任务；若宿主已有获授权的定时唤醒，可在下次唤醒重新检查。不得接管其他 Agent 的 WORKING 任务，不得进行未授权的部署、删除或外部通信。`
    : `When idle and authorized to work in this project's repository, execute StateDock Ready tasks sequentially. Binding: ${binding}.
Call get_instance_info through the active MCP connection first. Confirm publicOrigin and mcpUrl exactly, and verify the project UUID, slug and current repository binding. Stop on any mismatch; never guess, switch directories or fall back to another instance.
Atomically claim one READY task with claim_next_task(project: ${JSON.stringify(project.id)}). Never claim PLAN ideas. Verify the claimed project, read the goal, decisions, feedback and attachments, implement and verify in the bound repository. Use task records rather than relying on past chat context; do not expand scope.
Submit actual results using submit_handoff, then claim the next task. If requirements are unclear, blocked or need my decision, use pause_task to mark WAITING, explain the blocker and stop the queue.
If no READY task exists, finish quietly. This instruction does not create background polling or a schedule. An already-authorized host schedule may check again on its next wake-up. Do not take over another agent's WORKING task or perform unauthorized deployments, deletions or external communications.`;
}
