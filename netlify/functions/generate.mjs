// Netlify Function: принимает промпт со страницы и стримит ответ Claude обратно текстом.
// Переменные окружения (Netlify → Site configuration → Environment variables):
//   ANTHROPIC_API_KEY — ключ Claude API (console.anthropic.com)
//   ACCESS_CODE       — код доступа для сотрудников (без него сайт открыт всем, кто знает адрес)
//   CLAUDE_MODEL      — необязательно, по умолчанию claude-sonnet-5-5

const env = (k) => (globalThis.Netlify?.env?.get(k)) ?? process.env[k];
const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Только POST" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Неверный запрос" }, 400); }
  const { prompt, code } = body || {};

  const need = env("ACCESS_CODE");
  if (need && code !== need) return json({ error: "Неверный код доступа" }, 401);
  if (typeof prompt !== "string" || !prompt.trim()) return json({ error: "Пустой запрос" }, 400);
  if (prompt.length > 60000) return json({ error: "Слишком длинный текст. Сократите данные клиента." }, 413);

  const key = env("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "На сервере не задан ANTHROPIC_API_KEY" }, 500);

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: env("CLAUDE_MODEL") || "claude-sonnet-5-5",
      max_tokens: 4000,
      stream: true,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    const msg = upstream.status === 401 ? "Неверный ANTHROPIC_API_KEY"
      : upstream.status === 429 ? "Слишком много запросов. Подождите минуту."
      : upstream.status === 529 ? "Claude сейчас перегружен. Попробуйте через минуту."
      : `Ошибка Claude API (${upstream.status})`;
    console.error("Anthropic error", upstream.status, t.slice(0, 500));
    return json({ error: msg }, 502);
  }

  // Разбираем SSE от Anthropic и отдаём наружу только текст
  const enc = new TextEncoder(), dec = new TextDecoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const reader = upstream.body.getReader();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            let ev;
            try { ev = JSON.parse(line.slice(5)); } catch { continue; }
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
              ctrl.enqueue(enc.encode(ev.delta.text));
            } else if (ev.type === "message_delta" && ev.delta?.stop_reason === "max_tokens") {
              ctrl.enqueue(enc.encode("\n\n[Текст оборвался: слишком длинный ответ]"));
            } else if (ev.type === "error") {
              ctrl.enqueue(enc.encode(`\n\n[Ошибка: ${ev.error?.message || "неизвестная"}]`));
            }
          }
        }
      } catch (e) {
        ctrl.enqueue(enc.encode("\n\n[Связь прервалась]"));
      } finally {
        ctrl.close();
      }
    }
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
  });
};

export const config = { path: "/api/generate" };
