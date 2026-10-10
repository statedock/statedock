import { instanceConfig } from "./instance-config.js";
import { StateDockService } from "@statedock/core";
import type { OnlineEnv } from "./auth.js";
import type { D1Repository } from "./repository.js";

import {
  ephemeral,
  pong,
  response,
  type DiscordInteraction,
  type DiscordInteractionResponse,
} from "./discord-protocol.js";
import { handleDiscordQuery } from "./discord-queries.js";
export {
  verifyDiscordSignature,
  type DiscordInteraction,
  type DiscordInteractionResponse,
} from "./discord-protocol.js";

export async function handleDiscordInteraction(
  env: OnlineEnv,
  interaction: DiscordInteraction,
  repository: (env: OnlineEnv, userId: string) => D1Repository,
): Promise<DiscordInteractionResponse> {
  // 1. PING -> PONG
  if (interaction.type === 1) {
    return pong();
  }

  // Only handle application commands (type 2)
  if (interaction.type !== 2 || !interaction.data) {
    return ephemeral("未知的交互类型。");
  }

  const sender = interaction.user ?? interaction.member?.user;
  if (!sender?.id) {
    return ephemeral("无法获取 Discord 用户身份。");
  }

  const cmdName = interaction.data.name.toLowerCase();
  const optionsMap = new Map<string, any>();
  for (const opt of interaction.data.options ?? []) {
    optionsMap.set(opt.name.toLowerCase(), opt.value);
  }

  // Handle /link <token>
  if (cmdName === "link") {
    const token = String(optionsMap.get("token") ?? "").trim();
    if (!token) {
      return ephemeral(
        "请提供绑定令牌。在 StateDock 控制台「提醒设置 → Discord」点击生成。用法：`/link token`",
      );
    }
    const row = await env.DB.prepare(
      "DELETE FROM discord_link_tokens WHERE token=? AND expires_at>? AND EXISTS(SELECT 1 FROM users WHERE id=discord_link_tokens.user_id AND disabled_at IS NULL AND instance_approved_at IS NOT NULL) RETURNING user_id",
    )
      .bind(token, new Date().toISOString())
      .first<{ user_id: string }>();

    if (!row) {
      return ephemeral("绑定令牌无效或已过期，请在 StateDock 控制台重新生成。");
    }

    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO discord_subscribers(id,user_id,discord_user_id,discord_username,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(discord_user_id) DO UPDATE SET user_id=excluded.user_id,discord_username=excluded.discord_username,updated_at=excluded.updated_at",
    )
      .bind(crypto.randomUUID(), row.user_id, sender.id, sender.username, now, now)
      .run();

    return response(
      undefined,
      [
        {
          title: "🎉 StateDock 账号绑定成功！",
          description:
            `已将 Discord 用户 **@${sender.username}** 绑定至 StateDock 账号。\n\n` +
            "**常用指令：**\n" +
            "• `/todo [项目]` — 查询待安排任务 (PLAN)\n" +
            "• `/doing [项目]` — 查询正在进行的工作 (WORKING)\n" +
            "• `/review [项目]` — 查询需要处理的阻碍 (WAITING)\n" +
            "• `/done [项目]` — 查询最近完成成果 (DONE)\n" +
            "• `/summary [项目]` — 查看项目状态概览\n" +
            "• `/plan <内容> [项目]` — 快速随手记录想法\n" +
            "• `/projects` — 查看可用项目\n" +
            "• `/use <项目slug>` — 设置默认项目",
          color: 0x238636,
        },
      ],
      true,
    );
  }

  // Check if subscriber exists
  const subscriber = await env.DB.prepare(
    "SELECT id, user_id, default_project_id FROM discord_subscribers WHERE EXISTS(SELECT 1 FROM users WHERE id=discord_subscribers.user_id AND disabled_at IS NULL AND instance_approved_at IS NOT NULL) AND discord_user_id=? LIMIT 1",
  )
    .bind(sender.id)
    .first<{ id: string; user_id: string; default_project_id: string | null }>();

  // If not bound and not /help
  if (!subscriber) {
    if (cmdName === "help") {
      return ephemeral(
        "**StateDock Discord 机器人**\n\n" +
          "请先在 StateDock 控制台（设置 → 提醒 → Discord）生成绑定指令，输入 `/link <token>` 完成绑定后即可使用所有查询与录入指令。",
      );
    }
    return ephemeral(
      "⚠️ 尚未绑定 StateDock 账号。\n" +
        `请登录 [StateDock](${instanceConfig(env).appOrigin})，在「设置 → 提醒 → Discord」生成绑定指令，并在 Discord 输入 /link <token> 完成绑定。`,
    );
  }

  // Handle /unlink
  if (cmdName === "unlink") {
    await env.DB.prepare("DELETE FROM discord_subscribers WHERE id=?").bind(subscriber.id).run();
    return ephemeral(
      "已成功解除当前 Discord 账号与 StateDock 的绑定。如需重新连接，可在网页端生成新指令绑定。",
    );
  }

  const repo = repository(env, subscriber.user_id);
  const service = new StateDockService(repo);
  const projects = await repo.listProjects();

  // Helper to resolve target project
  const resolveTarget = (slugOrId?: string) => {
    if (slugOrId) {
      const match = projects.find((p) => p.slug === slugOrId || p.id === slugOrId);
      if (!match)
        return { error: `未找到项目 \`${slugOrId}\`。输入 \`/projects\` 可查看可用项目。` };
      return { project: match };
    }
    if (subscriber.default_project_id) {
      const match = projects.find((p) => p.id === subscriber.default_project_id);
      if (match) return { project: match };
    }
    if (projects.length === 1) return { project: projects[0] };
    return { project: null };
  };

  // /help
  if (cmdName === "help") {
    return response(
      undefined,
      [
        {
          title: "StateDock · 协作指令速查",
          description:
            "• `/todo [项目]` — 查看待安排任务 (PLAN)\n" +
            "• `/doing [项目]` — 查看正在进行的工作 (WORKING)\n" +
            "• `/review [项目]` — 查看需要处理的阻碍 (WAITING)\n" +
            "• `/done [项目]` — 查看最近完成成果 (DONE)\n" +
            "• `/summary [项目]` — 查看项目状态概览\n" +
            "• `/plan <内容> [项目]` — 快速随手记录想法\n" +
            "• `/add <内容> [项目]` — 快速随手记录想法（别名）\n" +
            "• `/use <项目slug>` — 设置当前默认项目\n" +
            "• `/projects` — 列出所有可用项目\n" +
            "• `/unlink` — 解除当前账号绑定",
          color: 0x5865f2,
        },
      ],
      true,
    );
  }

  // /projects
  if (cmdName === "projects") {
    if (!projects.length) {
      return ephemeral("尚未创建任何项目。请先在 StateDock 控制台创建项目。");
    }
    const list = projects
      .map(
        (p) =>
          `${p.id === subscriber.default_project_id ? "👉 **[默认]** " : "• "}` +
          `**${p.name}** (\`${p.slug}\`)`,
      )
      .join("\n");
    return response(undefined, [
      {
        title: "StateDock · 可用项目列表",
        description: `${list}\n\n使用 \`/use <项目slug>\` 可快速切换默认项目。`,
        color: 0x5865f2,
      },
    ]);
  }

  // /use [project]
  if (cmdName === "use") {
    const slug = String(optionsMap.get("project") ?? optionsMap.get("slug") ?? "").trim();
    if (!slug) return ephemeral("请指定项目 slug。用法：`/use <项目slug>`");
    const project = projects.find((p) => p.slug === slug || p.id === slug);
    if (!project) {
      return ephemeral(`未找到项目 \`${slug}\`。输入 \`/projects\` 查看可用项目。`);
    }
    await env.DB.prepare(
      "UPDATE discord_subscribers SET default_project_id=?, updated_at=? WHERE id=?",
    )
      .bind(project.id, new Date().toISOString(), subscriber.id)
      .run();
    return response(undefined, [
      {
        title: "已切换默认项目",
        description: `默认项目已设置为 **${project.name}** (\`${project.slug}\`)。后续执行 \`/todo\` 或 \`/plan\` 时无需重复指定项目。`,
        color: 0x238636,
      },
    ]);
  }

  const queryResponse = await handleDiscordQuery(
    cmdName,
    optionsMap,
    projects,
    repo,
    resolveTarget,
  );
  if (queryResponse) return queryResponse;

  // /plan <content> [project] OR /add <content> [project]
  if (cmdName === "plan" || cmdName === "add") {
    const content = String(optionsMap.get("content") ?? optionsMap.get("text") ?? "").trim();
    if (!content) {
      return ephemeral("请提供要记录的内容。用法：`/plan <内容> [项目]`");
    }
    const targetSlug = optionsMap.get("project") as string | undefined;
    const resolved = resolveTarget(targetSlug);
    if (targetSlug && resolved.error) return ephemeral(resolved.error);
    let project = resolved.project;
    if (!project) {
      project = projects.find((p) => p.slug === "inbox");
      if (!project) {
        project = await repo.createProject(
          {
            slug: "inbox",
            name: "📥 收集箱",
            description: "快速收集未经分类的想法与灵感，可随时移至对应项目",
          },
          {
            id: `discord:${sender.id}`,
            type: "human",
            name: sender.username,
          },
        );
      }
    }

    const firstLine = content.split("\n")[0].trim();
    const title = firstLine.slice(0, 100);

    const created = await repo.createPlan(
      project.id,
      {
        title,
        body: content,
        status: "PLAN",
      },
      {
        id: `discord:${sender.id}`,
        type: "human",
        name: sender.username,
      },
    );

    const isInbox = project.slug === "inbox";
    const naturalRef = `${project.slug}-${created.number}`;
    const taskLink = `${instanceConfig(env).appOrigin}/?project=${project.slug}&plan=${created.number}`;

    return response(undefined, [
      {
        title: isInbox
          ? `📥 已记录到收集箱 #${created.number}`
          : `💡 已记录新想法 #${created.number}`,
        description: `**${created.title}**\n\n${content !== title ? content : ""}${isInbox ? "\n\n*💡 电脑端打开任务可随时移至指定项目*" : ""}`,
        url: taskLink,
        color: 0x5865f2,
        footer: {
          text: isInbox
            ? `项目: 📥 收集箱 · 编号: ${created.reference} · 状态: 待归类`
            : `项目: ${project.name} · 编号: ${naturalRef} · 状态: PLAN`,
        },
      },
    ]);
  }

  return ephemeral(`未知的指令：\`/${cmdName}\`。输入 \`/help\` 查看支持的指令。`);
}
