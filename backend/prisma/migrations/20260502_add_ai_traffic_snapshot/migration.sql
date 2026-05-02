-- Agrega tráfico desde IAs al AnalyticsSnapshot mensual
-- JSON: { "chatgpt": 45, "claude": 12, "gemini": 8, "grok": 3, "metaAi": 5, "perplexity": 2, "copilot": 1, "other": 0 }
ALTER TABLE "AnalyticsSnapshot" ADD COLUMN IF NOT EXISTS "aiTraffic" TEXT NOT NULL DEFAULT '{}';
