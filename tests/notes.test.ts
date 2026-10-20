import { describe, expect, it } from "vitest";
import { decodeEntities, pickImage, stripSiteSuffix } from "../src/lib/link-meta";
import {
  assignCategoryColors,
  parseCategoryColors,
  pickCategoryColor,
  safeJson,
  normalizeCategory,
  titleFromUrl,
  bodyWithoutUrl,
  classifyNote,
  detectUrl,
  isLongText,
  isNoteSection,
  looksLikeSecret,
  NOTE_SECTIONS,
  noteDomain,
  noteFromForm,
  noteHeading,
  normalizeNoteUrl,
  normalizeTags,
  relativeDay,
  sectionOf,
  suggestNoteTags,
  urlKindOf,
  youtubeId,
} from "@/lib/notes-logic";

const fd = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });

describe("secciones", () => {
  it("tienen ids únicos y las que pidió Facu", () => {
    const ids = NOTE_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["videos", "compras", "ideas", "cursos", "musica", "datos", "archivos", "links"]);
  });
  it("una sección que ya no existe se ve en Links", () => {
    expect(isNoteSection("videos")).toBe(true);
    expect(isNoteSection("textos")).toBe(false);
    expect(sectionOf("textos").id).toBe("links");
  });
});

describe("detectUrl", () => {
  it("toma el primer link y saca la puntuación pegada", () => {
    expect(detectUrl("mirá esto: https://example.com/a. y esto https://otro.com")).toBe("https://example.com/a");
    expect(detectUrl("(https://example.com/x)")).toBe("https://example.com/x");
    expect(detectUrl("www.ejemplo.com.uy/algo, bueno")).toBe("https://www.ejemplo.com.uy/algo");
  });
  it("conserva un paréntesis que es del link", () => {
    expect(detectUrl("https://es.wikipedia.org/wiki/Mercurio_(planeta)")).toBe("https://es.wikipedia.org/wiki/Mercurio_(planeta)");
  });
  it("sin link, null", () => {
    expect(detectUrl("comprar cuerdas")).toBeNull();
    expect(detectUrl("")).toBeNull();
  });
  it("normalizeNoteUrl rechaza lo que no es http", () => {
    expect(normalizeNoteUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeNoteUrl("ftp://x.com")).toBeNull();
    expect(normalizeNoteUrl("ejemplo.com")).toBe("https://ejemplo.com/");
    expect(normalizeNoteUrl("hola")).toBeNull();
  });
});

describe("urlKindOf y youtubeId", () => {
  it("reconoce los sitios", () => {
    expect(urlKindOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(urlKindOf("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(urlKindOf("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe("youtube");
    expect(urlKindOf("https://www.instagram.com/reel/C8abc/")).toBe("instagram");
    expect(urlKindOf("https://www.instagram.com/p/C8abc/")).toBe("instagram");
    expect(urlKindOf("https://www.tiktok.com/@x/video/123")).toBe("tiktok");
    expect(urlKindOf("https://vm.tiktok.com/ZMabc/")).toBe("tiktok");
    expect(urlKindOf("https://open.spotify.com/track/abc")).toBe("spotify");
    expect(urlKindOf("https://x.com/user/status/1")).toBe("x");
    expect(urlKindOf("https://twitter.com/user/status/1")).toBe("x");
    expect(urlKindOf("https://example.com")).toBe("web");
    expect(urlKindOf("nada")).toBeNull();
    // Un dominio que solo termina parecido no cuenta.
    expect(urlKindOf("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBe("web");
  });
  it("saca el id del video", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?si=xyz")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/@canal")).toBeNull();
    expect(youtubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
  it("noteDomain sin www", () => {
    expect(noteDomain("https://www.thomann.de/intl/x.htm")).toBe("thomann.de");
    expect(noteDomain(null)).toBe("");
  });
});

describe("classifyNote", () => {
  const c = (text: string, url?: string) => classifyNote({ text, url });
  it("videos: YouTube, shorts, reels y TikTok", () => {
    expect(c("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("videos");
    expect(c("ver https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("videos");
    expect(c("", "https://youtu.be/dQw4w9WgXcQ")).toBe("videos");
    expect(c("https://www.instagram.com/reel/C8abc/?igsh=1")).toBe("videos");
    expect(c("https://vm.tiktok.com/ZMabc/")).toBe("videos");
  });
  it("una publicación de Instagram (/p/) no es video ni compra", () => {
    expect(c("https://www.instagram.com/p/C8abc/")).toBe("links");
  });
  it("música: Beatport, Bandcamp, SoundCloud, Spotify y plugins", () => {
    expect(c("https://www.beatport.com/track/x/123")).toBe("musica");
    expect(c("https://artista.bandcamp.com/album/y")).toBe("musica");
    expect(c("https://soundcloud.com/a/b")).toBe("musica");
    expect(c("https://open.spotify.com/track/abc")).toBe("musica");
    expect(c("https://www.pluginboutique.com/product/1")).toBe("musica");
    expect(c("https://fabfilter.com/products/pro-q-plugin")).toBe("musica");
  });
  it("cursos: Skool, Wistia, Hotmart o un link con 'curso'", () => {
    expect(c("https://www.skool.com/comunidad")).toBe("cursos");
    expect(c("https://fast.wistia.net/embed/abc")).toBe("cursos");
    expect(c("https://pay.hotmart.com/X123")).toBe("cursos");
    expect(c("seminario de mezcla https://example.com/evento")).toBe("cursos");
    expect(c("Curso https://drive.google.com/drive/folders/abc")).toBe("cursos");
  });
  it("compras: tiendas y caminos de producto", () => {
    expect(c("https://www.amazon.com/dp/B000")).toBe("compras");
    expect(c("https://articulo.mercadolibre.com.uy/MLU-123-algo")).toBe("compras");
    expect(c("https://www.facebook.com/marketplace/item/123/")).toBe("compras");
    expect(c("https://www.thomann.de/intl/behringer.htm")).toBe("compras");
    expect(c("https://tienda.myshopify.com/x")).toBe("compras");
    expect(c("https://www.marca.com.uy/products/pedal")).toBe("compras");
    expect(c("https://www.marca.com.uy/producto/pedal")).toBe("compras");
    expect(c("https://shop.com/p/123")).toBe("compras");
    expect(c("https://algo.com/tienda/cosa")).toBe("compras");
  });
  it("links: el resto", () => {
    expect(c("https://example.com/articulo")).toBe("links");
    expect(c("https://x.com/u/status/1")).toBe("links");
    expect(c("https://www.facebook.com/groups/1")).toBe("links");
  });
  it("sin link: ideas (largo, además 'personal')", () => {
    expect(c("tema con bajo distorsionado")).toBe("ideas");
    const largo = "a".repeat(300);
    expect(c(largo)).toBe("ideas");
    expect(suggestNoteTags({ text: largo })).toEqual(["personal"]);
    expect(suggestNoteTags({ text: "uno\ndos\ntres" })).toEqual(["personal"]);
    expect(suggestNoteTags({ text: "idea corta" })).toEqual([]);
    expect(suggestNoteTags({ text: `${largo} https://example.com` })).toEqual([]);
  });
  it("isLongText", () => {
    expect(isLongText("corto")).toBe(false);
    expect(isLongText("título\ntexto")).toBe(false);
    expect(isLongText("párrafo\n\notro")).toBe(true);
  });
});

describe("normalizeTags", () => {
  it("minúsculas, sin #, sin repetir y con tildes", () => {
    expect(normalizeTags("#Música, negocios, música")).toEqual(["música", "negocios"]);
    expect(normalizeTags("#personal #ideas  locas")).toEqual(["personal", "ideas locas"]);
    expect(normalizeTags(["  Uno ", "uno", 3, "Dos"])).toEqual(["uno", "dos"]);
    expect(normalizeTags("")).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });
});

describe("looksLikeSecret", () => {
  it("claves de API y tokens", () => {
    expect(looksLikeSecret("sk-proj-abcdefghijklmnop1234567890")).toBe(true);
    expect(looksLikeSecret("mi clave sk-ant-api03-AAAAbbbbCCCCdddd1111")).toBe(true);
    expect(looksLikeSecret("ghp_abcdefghij1234567890ABCD")).toBe(true);
    expect(looksLikeSecret("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U")).toBe(true);
    expect(looksLikeSecret("mcp_token: 8f3a9c2b1d4e5f60718293a4b5c6d7e8")).toBe(true);
    expect(looksLikeSecret("mcp_token 8f3a9c2b1d4e5f60718293a4b5c6")).toBe(true);
    expect(looksLikeSecret("AKIAIOSFODNN7EXAMPLE")).toBe(true);
    expect(looksLikeSecret("a8f5f167f44f4964e6c998dee827110c3f2b6a1d9e7c")).toBe(true);
  });
  it("contraseñas escritas", () => {
    expect(looksLikeSecret("contraseña: perro123")).toBe(true);
    expect(looksLikeSecret("Password = hunter2")).toBe(true);
    expect(looksLikeSecret("la clave es Gato!2020")).toBe(true);
    expect(looksLikeSecret("wifi contraseña Casa2024")).toBe(true);
    expect(looksLikeSecret("Facu1234!")).toBe(true);
    expect(looksLikeSecret("mezcla2024")).toBe(true);
  });
  it("lo de todos los días no", () => {
    expect(looksLikeSecret("idea: tema con bajo distorsionado")).toBe(false);
    expect(looksLikeSecret("la clave para el éxito es la constancia")).toBe(false);
    expect(looksLikeSecret("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(looksLikeSecret("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789")).toBe(false);
    expect(looksLikeSecret("260usd")).toBe(false);
    expect(looksLikeSecret("20x3")).toBe(false);
    expect(looksLikeSecret("099123456")).toBe(false);
    expect(looksLikeSecret("19/10/2026")).toBe(false);
    expect(looksLikeSecret("comprar")).toBe(false);
    expect(looksLikeSecret("Pedal Boss DS-1 260 con envío")).toBe(false);
    expect(looksLikeSecret("")).toBe(false);
  });
});

describe("noteFromForm", () => {
  it("toma el link del texto y clasifica si no viene la sección", () => {
    const r = noteFromForm(fd({ body: "ver https://youtu.be/dQw4w9WgXcQ", tags: "#Música" }));
    expect(r.ok && r.note).toMatchObject({ section: "videos", url: "https://youtu.be/dQw4w9WgXcQ", urlKind: "youtube", tags: ["música"] });
  });
  it("respeta la sección elegida a mano y el precio", () => {
    const r = noteFromForm(fd({ body: "pedal", section: "compras", price: "260 con envío" }));
    expect(r.ok && r.note).toMatchObject({ section: "compras", price: "260 con envío", url: null });
  });
  it("vacía o con un link roto, error", () => {
    expect(noteFromForm(fd({ body: "   " })).ok).toBe(false);
    expect(noteFromForm(fd({ url: "javascript:alert(1)" })).ok).toBe(false);
  });
});

describe("cómo se muestra", () => {
  it("noteHeading: título, primer renglón o dominio", () => {
    expect(noteHeading({ title: "Hola", body: "", url: null })).toBe("Hola");
    expect(noteHeading({ title: null, body: "https://x.com/a\nprimer renglón", url: "https://x.com/a" })).toBe("primer renglón");
    expect(noteHeading({ title: null, body: "", url: "https://www.example.com/a" })).toBe("example.com");
  });
  it("bodyWithoutUrl saca el link que se ve aparte", () => {
    expect(bodyWithoutUrl("https://example.com/a", "https://example.com/a")).toBe("");
    expect(bodyWithoutUrl("mirá https://example.com/a", "https://example.com/a")).toBe("mirá");
  });
  it("relativeDay", () => {
    expect(relativeDay("2026-10-19", "2026-10-19")).toBe("Hoy");
    expect(relativeDay("2026-10-18", "2026-10-19")).toBe("Ayer");
    expect(relativeDay("2026-10-15", "2026-10-19")).toBe("hace 4 días");
    expect(relativeDay("2026-09-02", "2026-10-19")).toMatch(/^2 (set|sept)$/);
    expect(relativeDay("2025-03-03", "2026-10-19")).toMatch(/^3 mar 2025$/);
  });
});

describe("ajustes con los mensajes reales de Facu", () => {
  it("Thomann (thomannmusic.com) es una tienda", () => {
    expect(classifyNote({ text: "https://www.thomannmusic.com/thon_mixer_case_fuer_xone92.htm" })).toBe("compras");
  });
  it("un recordatorio de un curso sin link va a Cursos", () => {
    expect(classifyNote({ text: "Curso nico gallusi" })).toBe("cursos");
    expect(classifyNote({ text: "Curso de edición en edits l cupcut para mis videos" })).toBe("cursos");
    expect(classifyNote({ text: "Pensar en mezclar diferente los canales de ableton" })).toBe("ideas");
  });
});

describe("datos y cursos de plataformas", () => {
  it("mail, teléfono y datos con rótulos van a Datos", () => {
    expect(classifyNote({ text: "FL186818@facs365.ort.edu.uy" })).toBe("datos");
    expect(classifyNote({ text: "+49 9286 9555-0" })).toBe("datos");
    expect(classifyNote({ text: "Nombre: Juan Pérez\nDirección: Calle 123\nRUT: 1234" })).toBe("datos");
    expect(classifyNote({ text: "Agregar encuesta de feedback" })).toBe("ideas");
  });
  it("Wisboo es un curso y /catalogo/ una tienda", () => {
    expect(classifyNote({ text: "Dominá Apps https://anapauladating.wisboo.com/product/domina-apps" })).toBe("cursos");
    expect(classifyNote({ text: "https://www.palaciodelamusica.com.uy/catalogo/estuche-magma_41020" })).toBe("compras");
  });
});

describe("titleFromUrl (link sin título)", () => {
  it("arma un nombre con la dirección", () => {
    expect(titleFromUrl("https://www.kaboa.com.uy/products/canguro-cultura-regular?variant=47287873274109")).toBe("Canguro cultura regular");
    expect(titleFromUrl("https://www.thomannmusic.com/thon_mixer_case_fuer_xone92.htm")).toBe("Thon mixer case fuer xone92");
    expect(titleFromUrl("https://vcp.com.uy/p/buzo-over-pyur-martini/255/3361")).toBe("Buzo over pyur martini");
  });
  it("salta ids y números; si no queda nada, null", () => {
    expect(titleFromUrl("https://www.facebook.com/marketplace/item/1046146951132785/")).toBe("Marketplace");
    expect(titleFromUrl("https://example.com/1234567")).toBeNull();
    expect(titleFromUrl("https://claude.ai/public/artifacts/53725aa9-66f2-4497-bbe1-ca86fbf75b9a")).toBe("Artifacts");
  });
});

describe("normalizeCategory (categoría propia)", () => {
  it("limpia espacios y pone mayúscula al principio", () => {
    expect(normalizeCategory("  desarrollo   personal ")).toBe("Desarrollo personal");
    expect(normalizeCategory("IA")).toBe("IA");
  });
  it("vacía o \"sin\" = sin categoría", () => {
    expect(normalizeCategory("   ")).toBeNull();
    expect(normalizeCategory(null)).toBeNull();
    expect(normalizeCategory("Sin")).toBeNull();
  });
  it("corta en 40 caracteres", () => {
    expect(normalizeCategory("a".repeat(60))?.length).toBe(40);
  });
});

describe("colores de las categorías", () => {
  it("cada categoría nueva de una sección toma un color que no se usa", () => {
    expect(pickCategoryColor([], "IA")).toBe("blue");
    expect(pickCategoryColor(["blue"], "Música")).toBe("green");
  });
  it("reparte sin repetir y respeta lo guardado", () => {
    const cats = [
      { section: "videos", name: "Música" },
      { section: "videos", name: "IA" },
      { section: "compras", name: "Ropa" },
    ];
    const out = assignCategoryColors(cats, { "videos/Música": "blue" });
    expect(out["videos/Música"]).toBe("blue");
    expect(out["videos/IA"]).toBe("green");
    expect(out["compras/Ropa"]).toBe("blue");
  });
  it("lo guardado que no es un color se ignora", () => {
    expect(parseCategoryColors({ "videos/IA": "red", "videos/X": "fucsia" })).toEqual({ "videos/IA": "red" });
    expect(safeJson("{roto")).toBeNull();
  });
});

describe("foto y título de un link", () => {
  it("toma la primera imagen usable, en https y sin logos", () => {
    expect(pickImage([null, "/img/p.jpg"], "https://tienda.uy/products/x")).toBe("https://tienda.uy/img/p.jpg");
    expect(pickImage(["http://cdn.uy/a.jpg"], "https://tienda.uy/")).toBe("https://cdn.uy/a.jpg");
    expect(pickImage(["https://luxo.com.uy/cdn/Luxo_-_Logo.png", "https://luxo.com.uy/cdn/buzo.jpg"], "https://luxo.com.uy/")).toBe("https://luxo.com.uy/cdn/buzo.jpg");
  });
  it("traduce los códigos HTML de los títulos", () => {
    expect(decodeEntities("dise&ntilde;o &middot; Vinile 12&Prime; &ndash; A&amp;B")).toBe("diseño · Vinile 12″ – A&B");
  });
});

describe("stripSiteSuffix", () => {
  it("saca el nombre de la tienda del final del título", () => {
    expect(stripSiteSuffix("Viandas congeladas - Mosca de Mori", "www.moscademori.com.uy")).toBe("Viandas congeladas");
    expect(stripSiteSuffix("Buzo Over Pyur Martini - VCP - Tienda Online", "vcp.com.uy")).toBe("Buzo Over Pyur Martini");
  });
  it("no corta si el tramo no es el sitio", () => {
    expect(stripSiteSuffix("Technics - T-SHIRT YOYAKU X TECHNICS", "yoyaku.io")).toBe("Technics - T-SHIRT YOYAKU X TECHNICS");
    expect(stripSiteSuffix("MarkItDown: deja de quemar tokens", "www.josegerardo.ai")).toBe("MarkItDown: deja de quemar tokens");
  });
});

describe("pickImage descarta lo que vence", () => {
  it("Instagram y Facebook no (direcciones firmadas)", () => {
    expect(pickImage(["https://scontent.cdninstagram.com/v/x.jpg", "https://tienda.uy/p.jpg"], "https://tienda.uy/")).toBe("https://tienda.uy/p.jpg");
  });
});
