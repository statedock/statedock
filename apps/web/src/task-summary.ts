export function parseHandoffSummary(text: string | null | undefined) {
  if (!text) return null;
  const matchChanges = text.match(
    /(?:变更|Changes)[：:]\s*(.*?)(?=(?:；|;)\s*(?:(?:验证|Verification)|(?:注意|Notes))[：:]|$)/is,
  );
  const matchVerification = text.match(
    /(?:验证|Verification)[：:]\s*(.*?)(?=(?:；|;)\s*(?:注意|Notes)[：:]|$)/is,
  );
  const matchNextSteps = text.match(/(?:注意|Notes)[：:]\s*(.*)$/is);
  if (!matchChanges && !matchVerification && !matchNextSteps) return null;
  return {
    changes: matchChanges?.[1]?.trim() || null,
    verification: matchVerification?.[1]?.trim() || null,
    nextSteps: matchNextSteps?.[1]?.trim() || null,
  };
}

export function parseBlocker(body: string | null | undefined) {
  if (!body) return null;
  const match = body.match(/^(?:⚠️\s*)?(?:卡点|Blocker)[：:]\s*([^\n]+)/i);
  return match ? match[1].trim() : null;
}
