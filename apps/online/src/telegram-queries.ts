import type { Project } from "@statedock/core";
import type { OnlineEnv } from "./auth.js";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Read-only commands return false so capture can handle text and attachments. */
export async function handleTelegramQuery(
  env: OnlineEnv,
  text: string,
  sub: { user_id: string; default_project_id: string | null },
  projects: Project[],
  reply: (message: string) => Promise<unknown>,
): Promise<boolean> {
  // Target project helper for queries
  const resolveTarget = (slugOrId?: string): { error: string } | { project: Project | null } => {
    if (slugOrId) {
      const match = projects.find((p) => p.slug === slugOrId || p.id === slugOrId);
      if (!match)
        return {
          error: `未找到项目 <code>${escape(slugOrId)}</code>。发送 /projects 查看可用项目。`,
        };
      return { project: match };
    }
    if (sub.default_project_id) {
      const match = projects.find((p) => p.id === sub.default_project_id);
      if (match) return { project: match };
    }
    if (projects.length === 1) return { project: projects[0] };
    return { project: null };
  };

  // /todo [project?]
  const todoMatch = /^\/todo(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
  if (todoMatch) {
    const target = resolveTarget(todoMatch[1]);
    if ("error" in target) {
      await reply(target.error);
      return true;
    }
    const pId = target.project ? target.project.id : null;
    const sql = pId
      ? env.DB.prepare(
          "SELECT p.title, p.number, p.global_number, pr.name FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND pr.id=? AND p.status='PLAN' ORDER BY p.updated_at DESC LIMIT 10",
        ).bind(sub.user_id, pId)
      : env.DB.prepare(
          "SELECT p.title, p.number, p.global_number, pr.name FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND p.status='PLAN' ORDER BY p.updated_at DESC LIMIT 10",
        ).bind(sub.user_id);
    const rows = await sql.all<{
      title: string;
      number: number;
      global_number: number;
      name: string;
    }>();
    if (!rows.results.length) {
      await reply(
        `${target.project ? `<b>${escape(target.project.name)}</b> · ` : ""}暂无待安排的任务。`,
      );
      return true;
    }
    const header = target.project
      ? `<b>${escape(target.project.name)} · 待安排 (${rows.results.length})</b>`
      : `<b>待安排任务 (${rows.results.length})</b>`;
    const list = rows.results
      .map(
        (p) =>
          `• #${p.number} ${escape(p.title)}${target.project ? "" : ` <i>(${escape(p.name)})</i>`}`,
      )
      .join("\n");
    await reply(`${header}\n\n${list}`);
    return true;
  }

  // /doing [project?]
  const doingMatch = /^\/doing(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
  if (doingMatch) {
    const target = resolveTarget(doingMatch[1]);
    if ("error" in target) {
      await reply(target.error);
      return true;
    }
    const pId = target.project ? target.project.id : null;
    const sql = pId
      ? env.DB.prepare(
          "SELECT p.title, p.number, p.global_number, p.summary, p.body, pr.name FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND pr.id=? AND p.status='WORKING' ORDER BY p.updated_at DESC LIMIT 5",
        ).bind(sub.user_id, pId)
      : env.DB.prepare(
          "SELECT p.title, p.number, p.global_number, p.summary, p.body, pr.name FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND p.status='WORKING' ORDER BY p.updated_at DESC LIMIT 5",
        ).bind(sub.user_id);
    const rows = await sql.all<{
      title: string;
      number: number;
      global_number: number;
      summary: string | null;
      body: string;
      name: string;
    }>();
    if (!rows.results.length) {
      await reply(
        `${target.project ? `<b>${escape(target.project.name)}</b> · ` : ""}当前没有正在进行的工作。`,
      );
      return true;
    }
    const header = target.project
      ? `<b>${escape(target.project.name)} · 正在进行 (${rows.results.length})</b>`
      : `<b>正在进行的工作 (${rows.results.length})</b>`;
    const list = rows.results
      .map((p) => {
        const desc = p.summary || p.body.split("\n").find((l) => l.trim()) || "";
        return `• #${p.number} <b>${escape(p.title)}</b>${target.project ? "" : ` <i>(${escape(p.name)})</i>`}${
          desc ? `\n  ${escape(desc)}` : ""
        }`;
      })
      .join("\n\n");
    await reply(`${header}\n\n${list}`);
    return true;
  }

  // /review [project?]
  const reviewMatch = /^\/review(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
  if (reviewMatch) {
    const target = resolveTarget(reviewMatch[1]);
    if ("error" in target) {
      await reply(target.error);
      return true;
    }
    const pId = target.project ? target.project.id : null;
    const sql = pId
      ? env.DB.prepare(
          "SELECT p.title, p.number, p.global_number, p.body, pr.name FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND pr.id=? AND p.status='WAITING' ORDER BY p.updated_at DESC LIMIT 5",
        ).bind(sub.user_id, pId)
      : env.DB.prepare(
          "SELECT p.title, p.number, p.global_number, p.body, pr.name FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND p.status='WAITING' ORDER BY p.updated_at DESC LIMIT 5",
        ).bind(sub.user_id);
    const rows = await sql.all<{
      title: string;
      number: number;
      global_number: number;
      body: string;
      name: string;
    }>();
    if (!rows.results.length) {
      await reply(
        `${target.project ? `<b>${escape(target.project.name)}</b> · ` : ""}当前没有需要介入的卡点任务。`,
      );
      return true;
    }
    const header = target.project
      ? `<b>${escape(target.project.name)} · 需要我处理 (${rows.results.length})</b>`
      : `<b>需要我处理的阻碍 (${rows.results.length})</b>`;
    const list = rows.results
      .map((p) => {
        const reason = p.body.split("\n").find((l) => l.trim()) || "缺少具体阻碍说明";
        return `• #${p.number} <b>${escape(p.title)}</b>${target.project ? "" : ` <i>(${escape(p.name)})</i>`}\n  ⚠️ 卡点：${escape(reason)}`;
      })
      .join("\n\n");
    await reply(`${header}\n\n${list}`);
    return true;
  }

  // /done [project?]
  const doneMatch = /^\/done(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
  if (doneMatch) {
    const target = resolveTarget(doneMatch[1]);
    if ("error" in target) {
      await reply(target.error);
      return true;
    }
    const pId = target.project ? target.project.id : null;
    const sql = pId
      ? env.DB.prepare(
          "SELECT p.title, p.number, p.global_number, p.summary, pr.name FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND pr.id=? AND p.status='DONE' ORDER BY p.updated_at DESC LIMIT 5",
        ).bind(sub.user_id, pId)
      : env.DB.prepare(
          "SELECT p.title, p.number, p.global_number, p.summary, pr.name FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND p.status='DONE' ORDER BY p.updated_at DESC LIMIT 5",
        ).bind(sub.user_id);
    const rows = await sql.all<{
      title: string;
      number: number;
      global_number: number;
      summary: string | null;
      name: string;
    }>();
    if (!rows.results.length) {
      await reply(
        `${target.project ? `<b>${escape(target.project.name)}</b> · ` : ""}暂无已完成的记录。`,
      );
      return true;
    }
    const header = target.project
      ? `<b>${escape(target.project.name)} · 最近完成</b>`
      : `<b>最近完成成果</b>`;
    const list = rows.results
      .map(
        (p) =>
          `• #${p.number} <b>${escape(p.title)}</b>${target.project ? "" : ` <i>(${escape(p.name)})</i>`}\n  ✓ 成果：${escape(p.summary || "已按目标顺利完成")}`,
      )
      .join("\n\n");
    await reply(`${header}\n\n${list}`);
    return true;
  }

  // /summary [project?]
  const summaryMatch = /^\/summary(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
  if (summaryMatch) {
    const target = resolveTarget(summaryMatch[1]);
    if ("error" in target) {
      await reply(target.error);
      return true;
    }
    const pId = target.project ? target.project.id : null;
    const countSql = pId
      ? env.DB.prepare(
          "SELECT p.status, count(*) as count FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND pr.id=? GROUP BY p.status",
        ).bind(sub.user_id, pId)
      : env.DB.prepare(
          "SELECT p.status, count(*) as count FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? GROUP BY p.status",
        ).bind(sub.user_id);
    const counts = (await countSql.all<{ status: string; count: number }>()).results;
    const countMap = Object.fromEntries(counts.map((c) => [c.status, c.count]));

    const latestDoneSql = pId
      ? env.DB.prepare(
          "SELECT p.title, p.number, p.summary FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND pr.id=? AND p.status='DONE' ORDER BY p.updated_at DESC LIMIT 1",
        ).bind(sub.user_id, pId)
      : env.DB.prepare(
          "SELECT p.title, p.number, p.summary FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND p.status='DONE' ORDER BY p.updated_at DESC LIMIT 1",
        ).bind(sub.user_id);
    const latestDone = await latestDoneSql.first<{
      title: string;
      number: number;
      summary: string | null;
    }>();

    const header = target.project
      ? `<b>${escape(target.project.name)} · 状态概览</b>`
      : `<b>项目状态概览</b>`;
    let msg =
      `${header}\n` +
      `• 正在做 (WORKING): ${countMap["WORKING"] ?? 0} 项\n` +
      `• 需要处理 (WAITING): ${countMap["WAITING"] ?? 0} 项\n` +
      `• 待安排 (PLAN): ${countMap["PLAN"] ?? 0} 项\n` +
      `• 已完成 (DONE): ${countMap["DONE"] ?? 0} 项`;
    if (latestDone) {
      msg += `\n\n<b>最新成果：</b>\n✓ #${latestDone.number} ${escape(latestDone.title)}\n  ${escape(latestDone.summary || "顺利完成")}`;
    }
    await reply(msg);
    return true;
  }

  // /tasks or /status (all active tasks)
  if (/^\/(?:tasks|status)(?:@\w+)?(?:\s+(\S+))?$/.test(text)) {
    const match = /^\/(?:tasks|status)(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
    const target = resolveTarget(match?.[1]);
    if ("error" in target) {
      await reply(target.error);
      return true;
    }
    const pId = target.project ? target.project.id : null;
    const sql = pId
      ? env.DB.prepare(
          "SELECT p.title, p.number, p.global_number, p.status, pr.name FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND pr.id=? AND p.status IN ('PLAN','READY','WORKING','WAITING') ORDER BY p.updated_at DESC LIMIT 15",
        ).bind(sub.user_id, pId)
      : env.DB.prepare(
          "SELECT p.title, p.number, p.global_number, p.status, pr.name FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE pr.owner_id=? AND p.status IN ('PLAN','READY','WORKING','WAITING') ORDER BY p.updated_at DESC LIMIT 15",
        ).bind(sub.user_id);
    const rows = await sql.all<{
      title: string;
      number: number;
      global_number: number;
      status: string;
      name: string;
    }>();
    if (!rows.results.length) {
      await reply("当前没有待处理任务。");
      return true;
    }
    await reply(
      rows.results
        .map((p) => `${escape(p.name)} · #${p.number} · ${p.status}\n${escape(p.title)}`)
        .join("\n\n"),
    );
    return true;
  }
  return false;
}
