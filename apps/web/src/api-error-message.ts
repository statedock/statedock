import { ApiError } from "./api";
const messages: Record<string, [string, string]> = {
  unauthorized: ["请重新登录。", "Please sign in again."],
  forbidden: ["你无权执行此操作。", "You do not have permission to do this."],
  conflict: [
    "内容已更新或操作不符合当前状态，请刷新后重试。",
    "The content or current state changed. Refresh and try again.",
  ],
  not_found: ["内容不存在或你无权查看。", "The item does not exist or is not accessible."],
  validation_error: ["请检查填写的内容。", "Please check the submitted values."],
  request_failed: [
    "暂时无法完成请求，请重试。",
    "The request could not be completed. Please try again.",
  ],
};
export function apiErrorMessage(error: unknown, lang: "en" | "zh") {
  const code = error instanceof ApiError ? error.code : "request_failed";
  return (messages[code] ?? messages.request_failed)[lang === "zh" ? 0 : 1];
}
