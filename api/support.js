function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const { name, contact, message, pagePath, pageUrl } = request.body ?? {};
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (!telegramToken || !telegramChatId) {
    return response.status(500).json({
      error: "Support channel is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.",
    });
  }

  if (!name || !contact || !message) {
    return response.status(400).json({ error: "Fill in name, contact, and message." });
  }

  const telegramMessage = [
    "<b>Новая заявка с arm-start</b>",
    `Имя: ${escapeHtml(name)}`,
    `Контакт: ${escapeHtml(contact)}`,
    `Страница: ${escapeHtml(pagePath || "/")}`,
    `URL: ${escapeHtml(pageUrl || "")}`,
    "",
    "<b>Сообщение</b>",
    escapeHtml(message),
  ].join("\n");

  const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: telegramChatId,
      text: telegramMessage,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!telegramResponse.ok) {
    const errorBody = await telegramResponse.text();
    return response.status(502).json({
      error: "Telegram delivery failed",
      details: errorBody,
    });
  }

  return response.status(200).json({ ok: true });
}
