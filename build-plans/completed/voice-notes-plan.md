# Voice Notes → Vault Pipeline

**Status: SHIPPED 2026-04-27.** Bot: `@VaultVoiceApp_bot` (token in Supabase secrets). Validated end-to-end with three test notes; semantic slugs and entity tagging working under real content.

Capture phone voice notes via Telegram, transcribe, land them in `~/vault/Notes/` as markdown that the existing Brain pipeline indexes for semantic search.

## Architecture

```
Telegram bot (BotFather)
    │
    ▼  webhook
Supabase Edge Function: telegram-voice-handler
    ├─→ Storage: voice-notes/<id>.ogg            (30-day TTL via pg_cron)
    ├─→ OpenAI whisper-1                         (transcript; accepts OGG natively)
    ├─→ Claude Haiku                             (slug + tags)
    └─→ INSERT voice_notes_inbox                 (transcript, audio_url, slug, tags, synced_at: null)
                                                          │
                                                          ▼  polled every 30s
LaunchAgent: com.genzen.voice-notes-pull
    ├─ SELECT WHERE synced_at IS NULL
    ├─ write ~/vault/Notes/YYYY-MM-DD-<slug>.md  (frontmatter: audio_url, audio_expires)
    └─ UPDATE synced_at = now()
                                                          │
                                                          ▼
com.genzen.vault-watch  (existing)
    └─ syncs new markdown back up to Brain for vector search
```

## Prerequisites

- Telegram bot token (BotFather → `/newbot`)
- OpenAI API key with credits (separate from ChatGPT Plus billing)
- Supabase CLI (`brew install supabase/tap/supabase`)
- Anthropic API key (for slug + summary generation; reuses InteliZen's `VITE_ANTHROPIC_API_KEY`)

## Step 1 — Supabase schema

```sql
-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-notes', 'voice-notes', false);

-- Inbox table
CREATE TABLE voice_notes_inbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  telegram_msg_id bigint,
  telegram_chat_id bigint,
  transcript      text NOT NULL,
  slug            text NOT NULL,
  tags            text[] NOT NULL DEFAULT '{}',
  audio_path      text,                    -- Storage object path
  audio_expires   timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  synced_at       timestamptz              -- set by local puller after write
);

CREATE INDEX voice_notes_inbox_unsynced_idx
  ON voice_notes_inbox (created_at)
  WHERE synced_at IS NULL;

-- 30-day cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'voice-notes-cleanup',
  '0 3 * * *',
  $$
  -- delete expired audio objects
  DELETE FROM storage.objects
   WHERE bucket_id = 'voice-notes'
     AND created_at < now() - interval '30 days';

  -- delete inbox rows older than 30 days that have already synced
  DELETE FROM voice_notes_inbox
   WHERE synced_at IS NOT NULL
     AND created_at < now() - interval '30 days';
  $$
);
```

## Step 2 — Edge Function `telegram-voice-handler`

`supabase/functions/telegram-voice-handler/index.ts`

Responsibilities:
1. Verify `X-Telegram-Bot-Api-Secret-Token` header matches `FUNCTION_SECRET`.
2. Parse update; ignore non-voice messages (text, stickers, etc.).
3. `getFile` → download OGG from Telegram CDN.
4. Upload OGG to Storage bucket `voice-notes/<uuid>.ogg`.
5. POST audio to OpenAI `/v1/audio/transcriptions` with `model: whisper-1` (accepts Telegram's `.oga` OGG/Opus directly; no transcoding required).
6. Call Claude Haiku with the transcript to produce `{slug, tags}`. Slug names the *idea* in kebab-case (max 6 words) — not the opening line, which often contains "OK so I was just thinking" preamble. Tags are 3-7 kebab-case keywords drawn from substance: entities, topics, projects, concepts. Tags are the primary semantic-recall lever, so prompt Haiku to favor specificity (`predatory-entitlement` > `psychology`).
7. INSERT row into `voice_notes_inbox`.
8. Return 200 to Telegram (silent — no chat reply needed; could send a "transcribed" confirmation).

Required Edge Function secrets:

```bash
supabase secrets set \
  TELEGRAM_BOT_TOKEN=... \
  FUNCTION_SECRET=... \
  OPENAI_API_KEY=... \
  ANTHROPIC_API_KEY=...
```

## Step 3 — Webhook registration

```bash
curl -F "url=https://jicrdrwtwubveyvzyyrh.supabase.co/functions/v1/telegram-voice-handler" \
     -F "secret_token=$FUNCTION_SECRET" \
     "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"
```

Verify:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

## Step 4 — Local pull service

`~/.claude/scripts/voice-notes-pull.mjs`

Loop body:
1. Query Supabase: `SELECT * FROM voice_notes_inbox WHERE synced_at IS NULL ORDER BY created_at`.
2. For each row:
   - Build filename `YYYY-MM-DD-<slug>.md` (use `created_at` in local TZ).
   - If file exists, append a numeric suffix.
   - Write markdown with frontmatter:
     ```markdown
     ---
     created: 2026-04-27T14:32:11+08:00
     source: telegram-voice
     audio_url: https://<project>.supabase.co/storage/v1/object/sign/voice-notes/<id>.ogg?token=...
     audio_expires: 2026-05-27T14:32:11+08:00
     tags: [shadow-lotus, predatory-entitlement, follow-up]
     ---

     <transcript body>
     ```
   - Generate signed URL with 30-day expiry for `audio_url`.
   - `UPDATE voice_notes_inbox SET synced_at = now() WHERE id = ...`.

LaunchAgent: `~/Library/LaunchAgents/com.genzen.voice-notes-pull.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.genzen.voice-notes-pull</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/adamking/.claude/scripts/voice-notes-pull.mjs</string>
  </array>
  <key>StartInterval</key><integer>30</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/Users/adamking/.claude/logs/voice-notes-pull.out</string>
  <key>StandardErrorPath</key><string>/Users/adamking/.claude/logs/voice-notes-pull.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SUPABASE_URL</key><string>https://jicrdrwtwubveyvzyyrh.supabase.co</string>
    <key>SUPABASE_SERVICE_ROLE_KEY</key><string>...</string>
  </dict>
</dict>
</plist>
```

Load: `launchctl load ~/Library/LaunchAgents/com.genzen.voice-notes-pull.plist`

## Step 5 — Test plan

1. Send a text message to the bot — function should ignore (no row inserted).
2. Send a 10-second voice note — within ~60s, expect a new file in `~/vault/Notes/`.
3. Confirm `audio_url` in frontmatter resolves and audio plays.
4. Confirm `vault-watch` picks up the new markdown and Brain returns it via `mcp__genzen-brain__search_vault`.
5. Manually set `audio_expires` to past + run cleanup cron once: confirm Storage object deletes; markdown remains.
6. Check `voice-notes-pull.err` is empty after a clean run.

## Open decisions parked

- **Bot confirmation reply:** silent or "Transcribed: <slug>"? Default silent; easy to add later.
- **Accuracy upgrade path:** if whisper-1 garbles names/jargon noticeably in real use (Adam's voice notes are short, dense, entity-heavy — exactly the case where this matters), swap to `gpt-4o-mini-transcribe`. Requires transcoding OGG→WAV via `ffmpeg.wasm` in the Edge Function. Contained change — Edge Function only, no schema or pipeline impact.
- **Failure handling:** if transcription fails, row still inserts with `transcript = "[TRANSCRIPTION FAILED: <reason>]"` so the audio isn't lost silently.

## Out of scope

- Two-way conversation with the bot (asking it to summarize, search, etc.) — separate plan.
- Signal-CLI route — only if voice notes start carrying client-sensitive material.
- Redaction / PII scrubbing — defer until volume justifies it.

## Lessons learned (V1 shipping)

- **Haiku wraps JSON in ` ```json ` fences** despite explicit "no markdown fencing" instructions. Worth a `stripJsonFences()` helper before `JSON.parse`. Fixed in [index.ts](/Users/adamking/projects/intelizen-app/supabase/functions/telegram-voice-handler/index.ts) at the `classify()` parser.
- **Whisper-1 transcription accuracy is high** on Adam's voice + dense vocabulary. "GenZen" came back as "Genzen" (one word) — a brand-spelling normalization layer could go in the classifier prompt later if it bothers downstream search. Names like "Adam King", "Steve", "VoiceNote" all landed clean.
- **The genzen-brain repo had no `node_modules` installed**. `npm install` was needed before the LaunchAgent could run. Worth checking on any host machine before installing the plist.
- **Sync latency observed: 14s** under realistic conditions (Telegram delivery → Edge Function processing → next LaunchAgent tick). Well within the 30-60s budget. No backpressure under volume of 3 notes / 5 min.
- **The vault-watch LaunchAgent path is stale** — points to `~/projects/strategy-upgrade/` which no longer exists. Real script is at `~/projects/genzen-brain/vault-watch.mjs`. Adjacent fix; not blocking voice notes.

## V2 candidates (when a real frustration justifies)

- **Drop local file, ingest direct to `documents` + `chunks`.** Removes LaunchAgent + Mac dependency. Voice notes still searchable via Brain MCP. Worth doing if Adam stops opening notes in Obsidian and the local file is dead weight.
- **Tag normalization across notes.** Once tag corpus grows, "genzen" / "gen-zen" / "GenZen" should converge. Could be a periodic cleanup job.
- **Bot reply on success.** Currently silent; could echo the slug + tags so Adam knows what got captured before he checks the vault.
- **Long-form chunking** (>25MB single-file). Whisper-1 caps at 25MB. Not relevant while voice notes stay short and dense.
