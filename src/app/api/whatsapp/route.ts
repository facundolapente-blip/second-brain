import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleBotMessage } from "@/lib/bot/bot";
import { saveMediaNote, type IncomingMedia } from "@/lib/bot/notes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Webhook del bot de WhatsApp (API de WhatsApp Cloud de Meta). No pasa por la sesión (ver
 * `proxy.ts`): se protege solo.
 * - GET: Meta verifica el webhook con `hub.verify_token` (= `WHATSAPP_VERIFY_TOKEN`) y espera
 *   de vuelta `hub.challenge`.
 * - POST: cada mensaje llega firmado con `X-Hub-Signature-256` (HMAC SHA-256 del cuerpo con
 *   `WHATSAPP_APP_SECRET`); solo se atiende el número de Facu (`WHATSAPP_ALLOWED_NUMBER`).
 *   Cualquier otra cosa recibe un 200 vacío y no se hace nada. Siempre 200: si no, Meta reintenta.
 * Responde con la Graph API (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`), en texto plano.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const OK = () => new Response(null, { status: 200 });

/** Comparación de tiempo constante (con hash, así los largos distintos no se notan). */
function same(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const digits = (s: string) => s.replace(/\D/g, "");

/** Con un token que empieza con "test" (pruebas locales) no se llama a Meta: se loguea. */
const isTestToken = (token: string) => token.startsWith("test") && process.env.NODE_ENV !== "production";

export async function GET(req: Request) {
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  const url = new URL(req.url);
  if (verify && url.searchParams.get("hub.mode") === "subscribe" && same(url.searchParams.get("hub.verify_token"), verify)) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response(null, { status: 403 });
}

async function send(to: string, text: string) {
  const token = process.env.WHATSAPP_TOKEN!;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const body = { messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000), preview_url: false } };
  if (isTestToken(token)) {
    console.log("[whatsapp] respuesta simulada:", JSON.stringify(body));
    return;
  }
  await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (r) => {
      if (!r.ok) console.error("[whatsapp] Meta respondió", r.status, (await r.text()).slice(0, 300));
    })
    .catch((e) => console.error("[whatsapp] no se pudo responder:", e instanceof Error ? e.message : e));
}

/** Responde. En las pruebas locales la respuesta vuelve también en el cuerpo, para verla con curl. */
async function reply(to: string, text: string) {
  await send(to, text);
  return isTestToken(process.env.WHATSAPP_TOKEN ?? "") ? Response.json({ reply: text }) : OK();
}

type MediaPart = { id?: unknown; mime_type?: unknown; caption?: unknown; filename?: unknown };
type Incoming = {
  id?: unknown;
  from?: unknown;
  type?: unknown;
  text?: { body?: unknown };
  image?: MediaPart;
  document?: MediaPart;
  video?: MediaPart;
  audio?: MediaPart;
};

const MEDIA_KINDS = ["image", "document", "video", "audio"] as const;
const IMAGE_MAX = 8 * 1024 * 1024;

/** Baja una imagen de WhatsApp (dos pasos: la URL del archivo y después el archivo, los dos con el token). */
async function downloadImage(mediaId: string, mime: string): Promise<File | null> {
  const token = process.env.WHATSAPP_TOKEN!;
  if (isTestToken(token)) return null;
  try {
    const info = await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    }).then((r) => (r.ok ? (r.json() as Promise<{ url?: string; mime_type?: string; file_size?: number }>) : null));
    if (!info?.url || (info.file_size ?? 0) > IMAGE_MAX) return null;
    const res = await fetch(info.url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > IMAGE_MAX) return null;
    const type = info.mime_type || mime || "image/jpeg";
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    return new File([buf], `whatsapp.${ext}`, { type });
  } catch (e) {
    console.error("[whatsapp] no se pudo bajar la foto:", e instanceof Error ? e.message : e);
    return null;
  }
}
type Payload = { entry?: { changes?: { value?: { messages?: Incoming[] } }[] }[] };

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) return OK();

  const raw = await req.text().catch(() => "");
  if (raw.length > 200_000) return OK();
  const expected = "sha256=" + createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  if (!same(req.headers.get("x-hub-signature-256"), expected)) return OK();

  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return OK();
  }
  // Solo mensajes entrantes (los avisos de "entregado"/"leído" llegan como statuses y se ignoran).
  const msg = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || typeof msg.from !== "string") return OK();
  const from = digits(msg.from);

  const allowed = digits(process.env.WHATSAPP_ALLOWED_NUMBER ?? "");
  if (!allowed) {
    // Solo para la puesta en marcha: con la firma buena y sin número configurado.
    return reply(from, `Tu número es ${from}: cargalo en WHATSAPP_ALLOWED_NUMBER`);
  }
  if (from !== allowed) return OK();

  const text = msg.type === "text" && typeof msg.text?.body === "string" ? msg.text.body : "";
  const mediaKind = MEDIA_KINDS.find((k) => msg.type === k);
  if (!text && !mediaKind) return reply(from, "Eso no lo puedo guardar todavía (stickers, ubicaciones, contactos). Mandá texto, links o fotos.");

  // Meta puede mandar el mismo mensaje dos veces: un recibo por id evita cargar el gasto repetido.
  if (typeof msg.id === "string" && msg.id) {
    try {
      await prisma.actionReceipt.create({ data: { id: `wa-${msg.id.slice(0, 120)}`, name: "whatsapp" } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return OK();
      throw e;
    }
  }

  const msgId = typeof msg.id === "string" && msg.id ? msg.id.slice(0, 120) : null;
  let answer: string;
  try {
    if (mediaKind) {
      // Fotos y documentos van a Notas → Archivos (la foto se guarda; lo demás queda anotado).
      const part = msg[mediaKind] ?? {};
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      const media: IncomingMedia = {
        kind: mediaKind,
        caption: str(part.caption),
        filename: str(part.filename),
        file: mediaKind === "image" && str(part.id) ? await downloadImage(str(part.id)!, str(part.mime_type) ?? "image/jpeg") : null,
      };
      answer = await saveMediaNote(media, msgId);
    } else answer = await handleBotMessage(text, msgId);
  } catch (e) {
    console.error("[whatsapp]", e);
    answer = "Algo falló. Fijate en la app si quedó guardado antes de mandarlo de nuevo.";
  }
  return reply(from, answer);
}
