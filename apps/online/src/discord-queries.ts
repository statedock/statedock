import type { Project } from "@statedock/core";
import { ephemeral, response, type DiscordInteractionResponse } from "./discord-protocol.js";
import type { D1Repository } from "./repository.js";

export async function handleDiscordQuery(
  cmdName: string,
  optionsMap: Map<string, unknown>,
  projects: Project[],
  repo: D1Repository,
  resolveTarget: (slugOrId?: string) => { error?: string; project?: Project | null },
): Promise<DiscordInteractionResponse | null> {
  // /todo [project]
  if (cmdName === "todo") {
    const targetSlug = optionsMap.get("project") as string | undefined;
    const resolved = resolveTarget(targetSlug);
    if (resolved.error) return ephemeral(resolved.error);
    if (!resolved.project) {
      return ephemeral(
        `你有 ${projects.length} 个项目。请指定项目名称（如 \`/todo ${projects[0]?.slug}\`），或输入 \`/use <项目slug>\` 设为默认。`,
      );
    }
    const plans = await repo.listPlans(resolved.project.id);
    const todoList = plans.filter((p) => p.status === "PLAN");
    if (!todoList.length) {
      return response(undefined, [
        {
          title: `${resolved.project.name} · 待安排任务`,
          description: "目前没有待安排的 PLAN。可使用 `/plan <描述>` 随手记录新想法。",
          color: 0x5865f2,
          footer: { text: `项目: ${resolved.project.name} · 共 0 项` },
        },
      ]);
    }
    const items = todoList
      .slice(0, 10)
      .map((p) => `• **#${p.number}** ${p.title}`)
      .join("\n");
    return response(undefined, [
      {
        title: `${resolved.project.name} · 待安排任务 (PLAN)`,
        description: `${items}${todoList.length > 10 ? `\n\n*(还有 ${todoList.length - 10} 项未列出)*` : ""}`,
        color: 0x5865f2,
        footer: { text: `项目: ${resolved.project.name} · 共 ${todoList.length} 项待安排` },
      },
    ]);
  }

  // /doing [project]
  if (cmdName === "doing") {
    const targetSlug = optionsMap.get("project") as string | undefined;
    const resolved = resolveTarget(targetSlug);
    if (resolved.error) return ephemeral(resolved.error);
    if (!resolved.project) {
      return ephemeral(
        `你有多个项目。请指定项目（如 \`/doing ${projects[0]?.slug}\`）或使用 \`/use\`。`,
      );
    }
    const plans = await repo.listPlans(resolved.project.id);
    const doingList = plans.filter((p) => p.status === "WORKING");
    if (!doingList.length) {
      return response(undefined, [
        {
          title: `${resolved.project.name} · 正在进行的工作`,
          description: "当前没有正在执行中的任务。",
          color: 0x5865f2,
          footer: { text: `项目: ${resolved.project.name}` },
        },
      ]);
    }
    const items = doingList
      .slice(0, 10)
      .map((p) => `• **#${p.number}** ${p.title}`)
      .join("\n");
    return response(undefined, [
      {
        title: `${resolved.project.name} · 正在进行中 (WORKING)`,
        description: items,
        color: 0x1f6feb,
        footer: { text: `项目: ${resolved.project.name} · ${doingList.length} 项进行中` },
      },
    ]);
  }

  // /review [project]
  if (cmdName === "review") {
    const targetSlug = optionsMap.get("project") as string | undefined;
    const resolved = resolveTarget(targetSlug);
    if (resolved.error) return ephemeral(resolved.error);
    if (!resolved.project) {
      return ephemeral(`你有多个项目。请指定项目（如 \`/review ${projects[0]?.slug}\`）。`);
    }
    const plans = await repo.listPlans(resolved.project.id);
    const reviewList = plans.filter((p) => p.status === "WAITING");
    if (!reviewList.length) {
      return response(undefined, [
        {
          title: `${resolved.project.name} · 需要人工介入`,
          description: "太棒了，目前没有任何卡住或需要决定的任务！",
          color: 0x238636,
          footer: { text: `项目: ${resolved.project.name}` },
        },
      ]);
    }
    const items = reviewList
      .slice(0, 10)
      .map((p) => `• **#${p.number}** ${p.title}`)
      .join("\n");
    return response(undefined, [
      {
        title: `⚠️ ${resolved.project.name} · 需要我处理 (WAITING)`,
        description: items,
        color: 0xd29922,
        footer: { text: `项目: ${resolved.project.name} · ${reviewList.length} 项需要介入` },
      },
    ]);
  }

  // /done [project]
  if (cmdName === "done") {
    const targetSlug = optionsMap.get("project") as string | undefined;
    const resolved = resolveTarget(targetSlug);
    if (resolved.error) return ephemeral(resolved.error);
    if (!resolved.project) {
      return ephemeral(`你有多个项目。请指定项目（如 \`/done ${projects[0]?.slug}\`）。`);
    }
    const plans = await repo.listPlans(resolved.project.id);
    const doneList = plans
      .filter((p) => p.status === "DONE")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);

    if (!doneList.length) {
      return response(undefined, [
        {
          title: `${resolved.project.name} · 最近完成`,
          description: "暂无已完成的任务。",
          color: 0x5865f2,
        },
      ]);
    }
    const items = doneList
      .map((p) => `✓ **#${p.number}** ${p.title}${p.summary ? `\n> ${p.summary}` : ""}`)
      .join("\n\n");
    return response(undefined, [
      {
        title: `${resolved.project.name} · 最近完成成果 (DONE)`,
        description: items,
        color: 0x238636,
        footer: { text: `项目: ${resolved.project.name}` },
      },
    ]);
  }

  // /summary [project]
  if (cmdName === "summary") {
    const targetSlug = optionsMap.get("project") as string | undefined;
    const resolved = resolveTarget(targetSlug);
    if (resolved.error) return ephemeral(resolved.error);
    if (!resolved.project) {
      return ephemeral(`你有多个项目。请指定项目（如 \`/summary ${projects[0]?.slug}\`）。`);
    }
    const plans = await repo.listPlans(resolved.project.id);
    const doing = plans.filter((p) => p.status === "WORKING").length;
    const waiting = plans.filter((p) => p.status === "WAITING").length;
    const plan = plans.filter((p) => p.status === "PLAN").length;
    const done = plans.filter((p) => p.status === "DONE").length;

    const fields = [
      { name: "正在进行", value: `${doing} 项`, inline: true },
      { name: "需要介入", value: `${waiting} 项`, inline: true },
      { name: "待安排想法", value: `${plan} 项`, inline: true },
      { name: "已完成", value: `${done} 项`, inline: true },
    ];

    return response(undefined, [
      {
        title: `📊 ${resolved.project.name} · 状态总览`,
        description: resolved.project.description || "暂无项目描述",
        fields,
        color: 0x5865f2,
        footer: { text: `路径: ${resolved.project.localPath}` },
      },
    ]);
  }

  return null;
}
