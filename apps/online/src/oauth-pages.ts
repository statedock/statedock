import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";
function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function renderErrorPage(message: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>授权错误 - StateDock</title>
  <style>
    body {
      margin: 0;
      background: #090d16;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
      box-sizing: border-box;
    }
    .card {
      background: #111827;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 2rem;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .logo {
      width: 48px;
      height: 48px;
      margin: 0 auto 1.25rem;
      border-radius: 12px;
      background: rgba(14, 165, 233, 0.15);
      border: 1px solid rgba(14, 165, 233, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #38bdf8;
      font-weight: bold;
      font-size: 24px;
    }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; color: #f87171; }
    p { font-size: 0.875rem; color: #94a3b8; line-height: 1.5; margin: 0 0 1.5rem; }
    .btn {
      display: inline-block;
      background: #1e293b;
      color: #f1f5f9;
      text-decoration: none;
      padding: 0.625rem 1.25rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      transition: background 0.2s;
    }
    .btn:hover { background: #334155; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚡</div>
    <h1>授权请求失败</h1>
    <p>${escapeHtml(message)}</p>
    <a href="/" class="btn">返回 StateDock</a>
  </div>
</body>
</html>`;
}

export function renderLoginPage(oauthUrl: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登录 StateDock - 授权连接</title>
  <style>
    body {
      margin: 0;
      background: #090d16;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
      box-sizing: border-box;
    }
    .card {
      background: #111827;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 2rem;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .logo-container {
      display: flex;
      justify-content: center;
      margin-bottom: 1.25rem;
    }
    .logo {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(14, 165, 233, 0.15);
      border: 1px solid rgba(14, 165, 233, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #38bdf8;
      font-size: 24px;
    }
    h1 { font-size: 1.25rem; text-align: center; margin: 0 0 0.5rem; }
    .desc { font-size: 0.8125rem; color: #94a3b8; text-align: center; margin: 0 0 1.5rem; line-height: 1.4; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 0.375rem; color: #cbd5e1; }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.625rem 0.75rem;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #f8fafc;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #38bdf8; }
    button {
      width: 100%;
      padding: 0.625rem 1rem;
      border-radius: 8px;
      border: none;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #0284c7;
      color: #fff;
    }
    .btn-primary:hover { background: #0369a1; }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .error-msg {
      color: #f87171;
      font-size: 0.75rem;
      margin-top: 0.5rem;
      text-align: center;
      min-height: 1rem;
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-container">
      <div class="logo">⚡</div>
    </div>
    <h1>登录 StateDock</h1>
    <p class="desc">请先登录你的 StateDock 账号，以授权第三方客户端连接 MCP。</p>

    <div id="step-email">
      <div class="form-group">
        <label for="email">电子邮箱</label>
        <input type="email" id="email" placeholder="name@example.com" autocomplete="email" required>
      </div>
      <button type="button" class="btn-primary" id="btn-send">获取验证码</button>
    </div>

    <div id="step-code" class="hidden">
      <div class="form-group">
        <label for="code">6 位验证码</label>
        <input type="text" id="code" placeholder="123456" pattern="[0-9]{6}" maxlength="6" inputmode="numeric" required>
      </div>
      <button type="button" class="btn-primary" id="btn-verify">登录并继续</button>
    </div>

    <div class="error-msg" id="err-msg"></div>
  </div>

  <script>
    const emailEl = document.getElementById('email');
    const codeEl = document.getElementById('code');
    const btnSend = document.getElementById('btn-send');
    const btnVerify = document.getElementById('btn-verify');
    const stepEmail = document.getElementById('step-email');
    const stepCode = document.getElementById('step-code');
    const errMsg = document.getElementById('err-msg');

    function showError(msg) { errMsg.textContent = msg || ''; }

    btnSend.addEventListener('click', async () => {
      const email = emailEl.value.trim();
      if (!email || !email.includes('@')) {
        showError('请输入有效的电子邮箱');
        return;
      }
      showError('');
      btnSend.disabled = true;
      btnSend.textContent = '发送中...';
      try {
        const res = await fetch('/api/auth/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '发送验证码失败');
        stepEmail.classList.add('hidden');
        stepCode.classList.remove('hidden');
        codeEl.focus();
      } catch (err) {
        showError(err.message);
        btnSend.disabled = false;
        btnSend.textContent = '获取验证码';
      }
    });

    btnVerify.addEventListener('click', async () => {
      const email = emailEl.value.trim();
      const code = codeEl.value.trim();
      if (!code || code.length !== 6) {
        showError('请输入 6 位数字验证码');
        return;
      }
      showError('');
      btnVerify.disabled = true;
      btnVerify.textContent = '验证中...';
      try {
        const res = await fetch('/api/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '验证码错误或已过期');
        // Cookie is set! Reload to continue authorization
        window.location.reload();
      } catch (err) {
        showError(err.message);
        btnVerify.disabled = false;
        btnVerify.textContent = '登录并继续';
      }
    });
  </script>
</body>
</html>`;
}

export function renderConsentPage(params: {
  details: ConsentDescription;
  handle: string;
  userEmail: string;
  oauthUrl: string;
}): string {
  const { details, handle, userEmail, oauthUrl } = params;
  const clientName = escapeHtml(details.clientName || "第三方客户端");
  const redirectHost = escapeHtml(details.redirectHost);
  const clientDomain = details.clientDomain
    ? `<div class="verified-badge">✓ 已验证域名：<strong>${escapeHtml(details.clientDomain)}</strong></div>`
    : `<div class="unverified-badge">注意：该应用为动态注册，其标识尚未进行官方域名核验</div>`;

  const loopbackWarning = details.redirectIsLoopback
    ? `<div class="warning-box">⚠️ 授权将被发送至本机应用 (<code>${redirectHost}</code>)。请确认这是你刚才在本地发起的连接请求。</div>`
    : "";

  const scopesHtml = `
    <div class="scope-item">
      <input type="checkbox" checked disabled style="cursor: default;">
      <div class="scope-text">
        <div class="scope-title">完整读写与管理权限 (mcp:read & mcp:write)</div>
        <div class="scope-desc">允许客户端读取并管理你的 StateDock 项目与任务（包含查看项目状态、创建需求与任务、更新计划讨论、记录笔记与协同交付）。</div>
      </div>
    </div>
    <input type="hidden" name="scope" value="mcp:read">
    <input type="hidden" name="scope" value="mcp:write">
  `;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>授权 ${clientName} - StateDock</title>
  <style>
    body {
      margin: 0;
      background: #090d16;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
      box-sizing: border-box;
    }
    .card {
      background: #111827;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 2rem;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .header {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    .logo {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(14, 165, 233, 0.15);
      border: 1px solid rgba(14, 165, 233, 0.3);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #38bdf8;
      font-size: 24px;
      margin-bottom: 0.75rem;
    }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    .subtitle { font-size: 0.875rem; color: #94a3b8; margin: 0; line-height: 1.4; }
    .user-pill {
      display: inline-block;
      margin-top: 0.5rem;
      background: #1e293b;
      color: #38bdf8;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-family: monospace;
    }
    .verified-badge {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: #34d399;
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      font-size: 0.75rem;
      margin-bottom: 1rem;
    }
    .unverified-badge {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      font-size: 0.75rem;
      margin-bottom: 1rem;
    }
    .warning-box {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 0.625rem 0.75rem;
      border-radius: 8px;
      font-size: 0.75rem;
      margin-bottom: 1rem;
      line-height: 1.4;
    }
    .redirect-info {
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 1rem;
    }
    .section-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    .scopes-list {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 0.75rem;
      margin-bottom: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .scope-item {
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      cursor: pointer;
    }
    .scope-item input {
      margin-top: 0.2rem;
      accent-color: #0284c7;
      cursor: pointer;
    }
    .scope-title {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #f1f5f9;
    }
    .scope-desc {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 0.125rem;
      line-height: 1.3;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
    }
    button {
      flex: 1;
      padding: 0.625rem 1rem;
      border-radius: 8px;
      border: none;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-approve {
      background: #0284c7;
      color: #fff;
    }
    .btn-approve:hover { background: #0369a1; }
    .btn-deny {
      background: #1e293b;
      color: #94a3b8;
    }
    .btn-deny:hover { background: #334155; color: #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">⚡</div>
      <h1>授权 ${clientName}</h1>
      <p class="subtitle">该应用请求通过 Remote MCP 访问你的 StateDock 项目任务</p>
      <div class="user-pill">${escapeHtml(userEmail)}</div>
    </div>

    ${clientDomain}
    ${loopbackWarning}

    <div class="redirect-info">
      授权完成后将安全返回至：<strong>${redirectHost}</strong>
    </div>

    <form method="post" action="${escapeHtml(oauthUrl)}">
      <input type="hidden" name="handle" value="${escapeHtml(handle)}">
      <div class="section-title">权限范围</div>
      <div class="scopes-list">
        ${scopesHtml}
      </div>
      <div class="actions">
        <button type="submit" name="decision" value="deny" class="btn-deny">拒绝 (Deny)</button>
        <button type="submit" name="decision" value="approve" class="btn-approve">同意授权 (Allow)</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}
