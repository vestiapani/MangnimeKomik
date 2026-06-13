import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  getHomeData,
  getLatestKomik,
  getPopularKomik,
  getKomikDetail,
  getChapterDetail,
  searchKomik,
  getGenreList,
} from "./scraper";

export const config = {
  runtime: "edge",
};

const app = new Hono();

app.use("*", logger());

// CCTV & Bot Blocker
app.use("*", async (c, next) => {
  const userAgent = c.req.header("User-Agent") || "Unknown Bot";
  const blockedBots = ["Claude", "GPTBot", "ChatGPT", "CCBot", "anthropic"];
  const isBotBlocked = blockedBots.some((bot) =>
    userAgent.toLowerCase().includes(bot.toLowerCase()),
  );

  if (isBotBlocked) {
    return c.json(
      { success: false, message: "AI Bots are strictly prohibited." },
      403,
    );
  }

  const ip = c.req.header("x-forwarded-for") || "Unknown IP";
  console.log(`[CCTV] Akses dari IP: ${ip} | UA: ${userAgent}`);
  await next();
});

app.use(
  "/*",
  cors({
    origin: [
      "https://mangnime.my.id",
      "https://mangnime.vercel.app",
      "http://localhost:3000",
    ],
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// --- Rate Limiter Tanpa setInterval ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = { maxRequests: 100, windowMs: 60 * 1000 };

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return true;
  }

  if (entry.count >= RATE_LIMIT.maxRequests) return false;
  entry.count++;
  return true;
}

// Auth Middleware
app.use("/api/*", async (c, next) => {
  const authToken = c.req.header("Authorization");
  // Perubahan: Di Vercel menggunakan process.env
  const SECRET_KEY = process.env.API_SECRET_KEY;

  if (!authToken || authToken !== `Bearer ${SECRET_KEY}`) {
    return c.json({ success: false, message: "Token tidak valid." }, 401);
  }

  // Perubahan: Header IP di Vercel menggunakan x-forwarded-for
  const ip = c.req.header("x-forwarded-for") || "Unknown IP";

  if (!checkRateLimit(ip)) {
    return c.json(
      {
        success: false,
        message: "Terlalu banyak request. Server sedang sibuk.",
      },
      429,
    );
  }
  await next();
});

// Helper
const ok = (c: any, data: unknown) => c.json({ success: true, data });
const err = (c: any, message: string, status = 500) =>
  c.json({ success: false, message }, status);

// Routes
app.get("/", (c) => c.html("<h1>MangNime API Aktif di Vercel Edge!</h1>"));

app.get("/api/home", async (c) => {
  try {
    return ok(c, await getHomeData());
  } catch (e) {
    console.error("🔴 CRASH DI BACKEND VERCEL:", e);
    return err(c, (e as Error).message);
  }
});

app.get("/api/latest", async (c) => {
  try {
    return ok(c, await getLatestKomik(Number(c.req.query("page") || 1)));
  } catch (e) {
    console.error("🔴 CRASH DI BACKEND VERCEL:", e);
    return err(c, (e as Error).message);
  }
});

app.get("/api/komik/:slug", async (c) => {
  try {
    return ok(c, await getKomikDetail(c.req.param("slug")));
  } catch (e) {
    console.error("🔴 CRASH DI BACKEND VERCEL:", e);
    return err(c, (e as Error).message);
  }
});

app.get("/api/komik/:slug/:chapterId", async (c) => {
  try {
    return ok(
      c,
      await getChapterDetail(c.req.param("slug"), c.req.param("chapterId")),
    );
  } catch (e) {
    console.error("🔴 CRASH DI BACKEND VERCEL:", e);
    return err(c, (e as Error).message);
  }
});

app.get("/api/advanceSearch", async (c) => {
  try {
    const q = c.req.query("search") || "";
    const g = c.req.query("genreIds") || "";
    const f = c.req.query("format") || "";
    const p = Number(c.req.query("page") || 1);
    return ok(c, await searchKomik(q, p, g, f));
  } catch (e) {
    console.error("🔴 CRASH DI BACKEND VERCEL:", e);
    return err(c, (e as Error).message);
  }
});

// Jembatan Hono ke Vercel
export default handle(app);
