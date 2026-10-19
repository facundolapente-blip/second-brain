import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleBotMessage } from "@/lib/bot/bot";

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

type Incoming = { id?: unknown; from?: unknown; type?: unknown; text?: { body?: unknown } };
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
  if (!text) return reply(from, "Por ahora solo entiendo texto. Escribí ayuda para ver los ejemplos.");

  // Meta puede mandar el mismo mensaje dos veces: un recibo por id evita cargar el gasto repetido.
  if (typeof msg.id === "string" && msg.id) {
    try {
      await prisma.actionReceipt.create({ data: { id: `wa-${msg.id.slice(0, 120)}`, name: "whatsapp" } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return OK();
      throw e;
    }
  }

  let answer: string;
  try {
    answer = await handleBotMessage(text);
  } catch (e) {
    console.error("[whatsapp]", e);
    answer = "Algo falló. Fijate en la app si quedó guardado antes de mandarlo de nuevo.";
  }
  return reply(from, answer);
}
