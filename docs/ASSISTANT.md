# The Messages assistant

## How it works
A performer picks a topic (profile, application, other) and writes a message. The server builds a short list of facts for that topic only (stage first name, plan, profile completeness and missing items, specialties, job preferences, the last 10 applications and searches in progress). Contact details, content boundaries and media links are never included, and a test enforces it.

Two modes:
- **Rules (production today).** Fixed answers built from those facts. No API key, no cost. When the question goes beyond the facts, it says so and the thread shows "Waiting for the Agental team".
- **Model (off until you switch it on).** Needs `ANTHROPIC_API_KEY` and `ASSISTANT_MODEL_ENABLED=true` in Vercel Production. Any refusal, cut-off answer, timeout or error falls back to the rules answer. There is no retry on another model.

## Settings (Vercel variables)
| Variable | Default | Meaning |
|---|---|---|
| `ASSISTANT_MODEL_ENABLED` | empty (off) | `true` to use the model |
| `ASSISTANT_MODEL` | `claude-haiku-5-5` | Model id. Sonnet is `claude-sonnet-5-5` |
| `ASSISTANT_DAILY_LIMIT` | 20 | Model replies per performer per 24 hours. After that, messages go to the team |

Each reply is capped at 300 output tokens. The context is the topic facts above plus the last 6 messages.

## What one message costs
Prices checked on Anthropic's pricing page on 2026-11-20 (per million tokens, input / output): Haiku 5.5 $0.10 / $0.50, Sonnet 5.5 $2 / $10. (Opus 5.5 is $4 / $20, which is why it is not the default.)

One message is about 1,200 input tokens (instructions, facts, short history) and at most 300 output tokens.
- **Haiku 5.5:** about $0.00012 in + $0.00015 out, so **under $0.0003 per message** (about 3 messages per tenth of a cent).
- **Sonnet 5.5:** about $0.0024 in + $0.003 out, so **under $0.006 per message**.

Worst case per performer at the daily cap (20 a day, 30 days): Haiku about $0.16 a month, Sonnet about $3.20. A thousand active performers on Haiku stay under $200 a month even if all of them hit the cap every day; real use will be far lower. These are estimates, check the Console usage page after the first week.

## Before you add a key: set a spend limit
1. In the Anthropic Console (platform.claude.com), create a workspace named "Agental production" and create the API key inside it.
2. Open Settings, then Limits, and set a monthly spend limit for that workspace (for example $20 to start). Optionally add a notification threshold at 50%.
3. Paste the key into Vercel as `ANTHROPIC_API_KEY` yourself, add `ASSISTANT_MODEL_ENABLED=true`, and redeploy.
When the limit is reached the API refuses calls and the assistant falls back to rules, so the site never breaks.
