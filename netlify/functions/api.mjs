// Krispy Leafs backend (Netlify Function + Netlify Blobs).
// Set in Netlify > Site configuration > Environment variables:
//   ADMIN_PASSWORD (required), SESSION_SECRET (required, long random text), ADMIN_USER (optional)
import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const { ADMIN_USER = "Krispyleafs101", ADMIN_PASSWORD, SESSION_SECRET } = process.env;
const data = () => getStore({ name: "data", consistency: "strong" });
const photos = () => getStore("photos");

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

const safeEq = (a, b) => {
  const h = (v) => createHmac("sha256", "cmp").update(String(v)).digest();
  return timingSafeEqual(h(a), h(b));
};
const sign = (v) => createHmac("sha256", SESSION_SECRET).update(v).digest("hex");
const cookie = (val, maxAge) =>
  `kl_admin=${val}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

const authed = (req) => {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)kl_admin=(\d+)\.([a-f0-9]+)/);
  if (!m || !SESSION_SECRET || Date.now() > Number(m[1])) return false;
  return safeEq(m[2], sign(m[1]));
};
const sameOrigin = (req) => {
  const o = req.headers.get("origin");
  return !o || new URL(o).host === new URL(req.url).host;
};
const parsePrice = (x) => {
  if (String(x ?? "").trim() === "") return null;
  const p = Math.round(Number(x) * 100) / 100;
  return Number.isFinite(p) && p >= 0 && p < 100000 ? p : null;
};
const list = async () => (await data().get("products", { type: "json" })) || [];

export default async (req, context) => {
  const parts = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [a, b, c] = parts;
  const method = req.method;

  // ----- public -----
  if (a === "products" && method === "GET") return json(await list());

  if (a === "photo" && b && method === "GET") {
    const buf = await photos().get(b.replace(/[^a-z0-9]/gi, ""), { type: "arrayBuffer" });
    if (!buf) return new Response("Not found", { status: 404 });
    return new Response(buf, {
      headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
    });
  }

  // ----- admin (private) -----
  if (a !== "admin") return json({ error: "Not found" }, 404);
  if (method !== "GET" && !sameOrigin(req)) return json({ error: "Bad origin" }, 403);

  if (b === "login" && method === "POST") {
    if (!ADMIN_PASSWORD || !SESSION_SECRET) return json({ error: "Server not configured" }, 500);
    const key = `fails:${context.ip || "unknown"}`;
    const recent = ((await data().get(key, { type: "json" })) || []).filter((t) => Date.now() - t < 600000);
    if (recent.length >= 5) return json({ error: "Too many attempts. Try again in 10 minutes." }, 429);
    const body = await req.json().catch(() => ({}));
    const userOk = safeEq(body.username || "", ADMIN_USER);
    const passOk = safeEq(body.password || "", ADMIN_PASSWORD);
    if (!(userOk && passOk)) {
      await data().setJSON(key, [...recent, Date.now()]);
      return json({ error: "Wrong username or password." }, 401);
    }
    const exp = String(Date.now() + 8 * 3600 * 1000);
    return json({ ok: true }, 200, { "set-cookie": cookie(`${exp}.${sign(exp)}`, 8 * 3600) });
  }
  if (b === "logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });

  if (!authed(req)) return json({ error: "Unauthorized" }, 401);
  if (b === "me") return json({ ok: true });

  if (b === "products") {
    if (method === "POST") {
      const form = await req.formData();
      const name = String(form.get("name") || "").trim().slice(0, 80);
      const price = parsePrice(form.get("price"));
      const file = form.get("photo");
      if (!name || price === null || !file || typeof file === "string" || file.size > 5_000_000)
        return json({ error: "Enter a name, a valid price, and a photo under 5 MB." }, 400);
      const buf = await file.arrayBuffer();
      const head = new Uint8Array(buf, 0, 2);
      if (head[0] !== 0xff || head[1] !== 0xd8) return json({ error: "Photo must be a JPEG." }, 400);
      const id = randomUUID().replace(/-/g, "").slice(0, 12);
      await photos().set(id, buf);
      const items = await list();
      items.push({ id, name, price, image: `/api/photo/${id}` });
      await data().setJSON("products", items);
      return json({ ok: true, id });
    }
    if (method === "PATCH" && c) {
      const price = parsePrice((await req.json().catch(() => ({}))).price);
      if (price === null) return json({ error: "Invalid price." }, 400);
      const items = await list();
      items.forEach((it) => { if (it.id === c) it.price = price; });
      await data().setJSON("products", items);
      return json({ ok: true });
    }
    if (method === "DELETE" && c) {
      const id = c.replace(/[^a-z0-9]/gi, "");
      await data().setJSON("products", (await list()).filter((it) => it.id !== id));
      await photos().delete(id);
      return json({ ok: true });
    }
  }
  return json({ error: "Not found" }, 404);
};

export const config = { path: "/api/*" };