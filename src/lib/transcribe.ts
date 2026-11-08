import "server-only";

/**
 * Audio → texto con Whisper (para los audios que llegan por WhatsApp).
 * Usa Groq si está `GROQ_API_KEY` (gratis, whisper-large-v3-turbo) y si no OpenAI con
 * `OPENAI_API_KEY`. Las dos tienen la misma API (`/audio/transcriptions`, multipart)
 * y aceptan el .ogg/opus de las notas de voz de WhatsApp tal cual.
 */
type Provider = { url: string; key: string; model: string };

function provider(): Provider | null {
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) return { url: "https://api.groq.com/openai/v1/audio/transcriptions", key: groq, model: "whisper-large-v3-turbo" };
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai) return { url: "https://api.openai.com/v1/audio/transcriptions", key: openai, model: "gpt-4o-mini-transcribe" };
  return null;
}

/** Tope de los dos servicios para un archivo. */
export const AUDIO_MAX = 25 * 1024 * 1024;

export const transcriptionReady = () => provider() !== null;

/** El texto del audio, o null si no hay servicio, falló o no se dijo nada. */
export async function transcribe(file: File): Promise<string | null> {
  const p = provider();
  if (!p || file.size > AUDIO_MAX) return null;
  const form = new FormData();
  form.append("file", file);
  form.append("model", p.model);
  form.append("language", "es");
  form.append("response_format", "json");
  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { authorization: `Bearer ${p.key}` },
      body: form,
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) {
      console.error("[transcribir]", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { text?: unknown };
    const text = typeof data.text === "string" ? data.text.trim() : "";
    return text || null;
  } catch (e) {
    console.error("[transcribir]", e instanceof Error ? e.message : e);
    return null;
  }
}
