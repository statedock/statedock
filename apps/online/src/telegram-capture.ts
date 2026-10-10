import { instanceConfig } from "./instance-config.js";
import { StateDockService } from "@statedock/core";
import { Buffer } from "node:buffer";
import type { OnlineEnv } from "./auth.js";
import type { D1Repository } from "./repository.js";
import { handleTelegramQuery } from "./telegram-queries.js";
import { sendTelegramMessage } from "./telegram.js";
export { ensureTelegramWebhook, telegramWebhookSecret } from "./telegram-webhook.js";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Message {
  text?: string;
  caption?: string;
  chat?: { id: number; type: string };
  from?: { id: number; username?: string; first_name?: string };
  photo?: { file_id: string; file_size?: number }[];
}

export async function captureTelegram(
  env: OnlineEnv,
  update: { update_id?: number; message?: Message },
  repository: (env: OnlineEnv, userId: string) => D1Repository,
) {
  const msg = update.message;
  if (!msg?.chat || !msg.from || !env.TELEGRAM_BOT_TOKEN) return;
  const chatId = String(msg.chat.id),
    sender = String(msg.from.id),
    text = (msg.text ?? msg.caption ?? "").trim();
  const reply = (message: string) => sendTelegramMessage(env.TELEGRAM_BOT_TOKEN!, chatId, message);
  if (!Number.isSafeInteger(update.update_id)) return;
  const claimed = await env.DB.prepare(
    "INSERT OR IGNORE INTO telegram_updates(update_id,created_at) VALUES(?,?) RETURNING update_id",
  )
    .bind(update.update_id!, new Date().toISOString())
    .first();
  if (!claimed) return;

  try {
    if (/^\/start(?:@\w+)?(?:\s|$)/.test(text)) {
      const token = text.split(/\s+/)[1];
      if (!token) {
        await reply("请在 StateDock → 提醒设置 → Telegram 中生成绑定链接。");
        return;
      }
      const row = await env.DB.prepare(
        "DELETE FROM telegram_link_tokens WHERE token=? AND expires_at>? AND EXISTS(SELECT 1 FROM users WHERE id=telegram_link_tokens.user_id AND disabled_at IS NULL AND instance_approved_at IS NOT NULL) RETURNING user_id",
      )
        .bind(token, new Date().toISOString())
        .first<{ user_id: string }>();
      if (!row) {
        await reply("绑定链接无效或已过期，请重新生成。");
        return;
      }
      await env.DB.prepare(
        "INSERT INTO telegram_subscribers(id,user_id,chat_id,username,first_name,notify_on_complete,notify_on_create,created_at,telegram_user_id) VALUES(?,?,?,?,?,1,1,?,?) ON CONFLICT(user_id,chat_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,telegram_user_id=excluded.telegram_user_id",
      )
        .bind(
          crypto.randomUUID(),
          row.user_id,
          chatId,
          msg.from.username ?? null,
          msg.from.first_name ?? null,
          new Date().toISOString(),
          sender,
        )
        .run();
      await reply(
        "已绑定！\n\n" +
          "<b>常用指令：</b>\n" +
          "• /projects — 查看项目并设置默认项目\n" +
          "• /todo — 查看待安排任务\n" +
          "• /doing — 查看正在进行的工作\n" +
          "• /review — 查看需要处理的阻碍\n" +
          "• /done — 查看最近完成成果\n" +
          "• /summary — 查看项目整体状态\n\n" +
          "发送文字或图片即可自动记录想法 (PLAN)。输入 /help 查看完整帮助。",
      );
      return;
    }

    const sub = await env.DB.prepare(
      "SELECT id,user_id,default_project_id FROM telegram_subscribers WHERE EXISTS(SELECT 1 FROM users WHERE id=telegram_subscribers.user_id AND disabled_at IS NULL AND instance_approved_at IS NOT NULL) AND chat_id=? AND (telegram_user_id=? OR (telegram_user_id IS NULL AND chat_id=?)) LIMIT 1",
    )
      .bind(chatId, sender, sender)
      .first<{ id: string; user_id: string; default_project_id: string | null }>();
    if (!sub) {
      await reply("请先通过 StateDock 的专属链接绑定此 Telegram 账号。");
      return;
    }

    if (/^\/stop(?:@\w+)?$/.test(text)) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM telegram_subscribers WHERE id=?").bind(sub.id),
        env.DB.prepare(
          "DELETE FROM notification_preferences WHERE user_id=? AND channel='telegram' AND connection_id=?",
        ).bind(sub.user_id, sub.id),
      ]);
      await reply("已解除此连接。");
      return;
    }

    const repo = repository(env, sub.user_id),
      service = new StateDockService(repo);
    const projects = await repo.listProjects();

    // /help
    if (/^\/help(?:@\w+)?$/.test(text)) {
      await reply(
        "<b>StateDock 协作指令：</b>\n\n" +
          "• <code>/todo [项目]</code> — 查看待安排任务 (PLAN)\n" +
          "• <code>/doing [项目]</code> — 查看正在进行的工作 (WORKING)\n" +
          "• <code>/review [项目]</code> — 查看需要处理的阻碍 (WAITING)\n" +
          "• <code>/done [项目]</code> — 查看最近完成成果 (DONE)\n" +
          "• <code>/summary [项目]</code> — 查看项目状态概览\n" +
          "• <code>/add [项目] 内容</code> — 记录想法或任务\n" +
          "• <code>/use 项目slug</code> — 设置默认项目\n" +
          "• <code>/projects</code> — 查看所有可用项目\n\n" +
          "💡 直接发送文字或截图，也会自动保存为默认项目的 PLAN。",
      );
      return;
    }

    // /projects
    if (/^\/projects(?:@\w+)?$/.test(text)) {
      await reply(
        projects.length
          ? projects
              .map(
                (p) =>
                  `${p.id === sub.default_project_id ? "✓ " : ""}<b>${escape(p.name)}</b> · <code>${escape(p.slug)}</code>`,
              )
              .join("\n") + "\n\n发送 /use 项目slug 设置默认项目。"
          : "请先在 StateDock 创建项目。",
      );
      return;
    }

    // /use [slug]
    const use = /^\/use(?:@\w+)?\s+(\S+)\s*$/.exec(text);
    if (use) {
      const project = projects.find((p) => p.slug === use[1] || p.id === use[1]);
      if (!project) {
        await reply("项目不存在或无权访问。发送 /projects 查看可用项目。");
        return;
      }
      await env.DB.prepare("UPDATE telegram_subscribers SET default_project_id=? WHERE id=?")
        .bind(project.id, sub.id)
        .run();
      await reply(`默认项目：<b>${escape(project.name)}</b>。现在可以直接发送文字或图片记录想法。`);
      return;
    }

    if (await handleTelegramQuery(env, text, sub, projects, reply)) return;

    // /add [project] [content] or default project / inbox
    const add = /^\/add(?:@\w+)?\s+(\S+)(?:\s+([\s\S]*))?$/.exec(text);
    let project: (typeof projects)[number] | undefined;
    let description = "";

    if (add) {
      const candidate = projects.find((p) => p.slug === add[1] || p.id === add[1]);
      if (!candidate) {
        await reply(`未找到项目 <code>${escape(add[1])}</code>。发送 /projects 查看可用项目。`);
        return;
      }
      project = candidate;
      description = (add[2] ?? "").trim();
    } else {
      project = projects.find((p) => p.id === sub.default_project_id);
      description = text.replace(/^\/(?:plan|idea)(?:@\w+)?\s*/i, "").trim();
    }

    if (description.startsWith("/")) {
      await reply(
        "未识别指令。支持 /todo、/doing、/review、/done、/summary、/projects、/use、/add。发送 /help 查看说明。",
      );
      return;
    }
    if (!description && !msg.photo?.length) return;
    const actor = {
      id: `tg:${sender}`,
      type: "human" as const,
      name: msg.from.first_name || msg.from.username || "Telegram",
    };

    if (!project) {
      project = projects.find((p) => p.slug === "inbox");
      if (!project) {
        project = await service.createProject(
          {
            slug: "inbox",
            name: "📥 收集箱",
            description: "快速收集未经分类的想法与灵感，可随时移至对应项目",
          },
          actor,
        );
      }
    }

    const plan = await service.createPlan(
      project.id,
      {
        title: (description || "截图反馈").split("\n")[0].slice(0, 100),
        body: description,
        status: "PLAN",
      },
      actor,
    );
    let imageNote = "";
    if (msg.photo?.length) {
      try {
        const photo = [...msg.photo].reverse().find((p) => (p.file_size ?? 0) <= 5 * 1024 * 1024);
        if (!photo) throw new Error("image too large");
        const response = await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(photo.file_id)}`,
          { signal: AbortSignal.timeout(8000) },
        );
        const file = (await response.json()) as {
          ok: boolean;
          result?: { file_path: string; file_size?: number };
        };
        if (
          !file.ok ||
          !file.result ||
          !/^photos\/[a-zA-Z0-9_.-]+$/.test(file.result.file_path) ||
          (file.result.file_size ?? 0) > 5 * 1024 * 1024
        )
          throw new Error("invalid photo");
        const download = await fetch(
          `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.result.file_path}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (!download.ok || !download.body) throw new Error("photo download failed");
        const reader = download.body.getReader(),
          chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 5 * 1024 * 1024) {
            await reader.cancel();
            throw new Error("photo too large");
          }
          chunks.push(part.value);
        }
        await service.writeAttachment(
          { reference: plan.reference },
          {
            name: "telegram-photo.jpg",
            mimeType: "image/jpeg",
            data: Buffer.concat(chunks).toString("base64"),
          },
          actor,
        );
        imageNote = "\n图片已保存。";
      } catch {
        imageNote = "\n图片保存失败，任务已保留，请在 PWA 中补充图片。";
      }
    }
    const isInbox = project.slug === "inbox";
    const statusText = isInbox ? "PLAN · 📥 待归类" : "PLAN · 等待安排";
    const hintText = isInbox ? "\n<i>💡 电脑端打开任务可随时移至指定项目</i>" : "";
    await reply(
      `已记录到 <b>${escape(project.name)}</b>\n<b>${plan.reference}</b> · ${escape(plan.title)}\n${statusText}${imageNote}${hintText}\n<a href="${instanceConfig(env).appOrigin}/?project=${project.id}&amp;task=${plan.reference}">查看任务</a>`,
    );
  } catch (error) {
    await env.DB.prepare("DELETE FROM telegram_updates WHERE update_id=?")
      .bind(update.update_id!)
      .run();
    throw error;
  }
}
