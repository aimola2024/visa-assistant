# Визовый ассистент

Веб-страница для сотрудников визового центра: сопроводительные письма, маршруты поездок,
чек-листы документов и ответы клиентам. Тексты пишет Claude через API.

## Структура

- `index.html` — страница
- `netlify/functions/generate.mjs` — серверная функция, держит ключ API и проверяет код доступа
- `netlify.toml` — настройки Netlify

## Переменные окружения (Netlify → Site configuration → Environment variables)

| Переменная | Что это |
|---|---|
| `ANTHROPIC_API_KEY` | Ключ Claude API с console.anthropic.com |
| `ACCESS_CODE` | Код, который сотрудники вводят на странице |
| `CLAUDE_MODEL` | Необязательно. По умолчанию `claude-sonnet-5-5` |

После добавления переменных сделайте повторный деплой (Deploys → Trigger deploy).

## Настройка тона

В `index.html` найдите блок `CENTER` и впишите тон общения и подпись центра.
