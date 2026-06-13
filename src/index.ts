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
  getKomikByGenre,
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

// ─── Input Sanitizer (Dibawa dari Deno) ──────────────────────────────────────
function sanitize(input: string | undefined, maxLength = 100): string {
  if (!input) return "";
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>"'`]/g, ""); // Hapus karakter berbahaya
}

function sanitizePage(raw: string | undefined): number {
  const n = Number(raw ?? 1);
  return Math.min(Math.max(Number.isFinite(n) ? n : 1, 1), 500); // Batasi page 1-500
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ok = (c: any, data: unknown) => c.json({ success: true, data }, 200);
const err = (c: any, message: string, status = 500) =>
  c.json({ success: false, message }, status);

// Routes
app.get("/", (c) => {
  const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MangNime API Playground</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        /* Custom scrollbar untuk area JSON */
        pre::-webkit-scrollbar { width: 8px; height: 8px; }
        pre::-webkit-scrollbar-track { background: #1f2937; }
        pre::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
        pre::-webkit-scrollbar-thumb:hover { background: #6b7280; }
      </style>
    </head>
    <body class="bg-gray-950 text-gray-200 font-sans min-h-screen p-4 md:p-8">
      <div class="max-w-4xl mx-auto space-y-6">
        
        <div class="border-b border-gray-800 pb-4">
          <h1 class="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500">
            MangNime API Playground 🚀
          </h1>
          <p class="text-sm text-gray-400 mt-2">Vercel Edge Serverless Environment</p>
        </div>

        <div class="bg-gray-900 p-5 rounded-xl border border-gray-800 shadow-lg">
          <label class="block text-sm font-semibold text-gray-300 mb-2">🔑 API Secret Key (Bearer Token):</label>
          <input type="password" id="apiKey" 
            class="w-full p-3 bg-gray-950 rounded-lg border border-gray-700 text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all" 
            placeholder="Masukkan API_SECRET_KEY kamu di sini...">
        </div>

        <div class="bg-gray-900 p-5 rounded-xl border border-gray-800 shadow-lg space-y-3">
          <p class="text-sm font-semibold text-gray-300">📡 Pilih Endpoint Uji Coba:</p>
          <div class="flex flex-wrap gap-3">
            <button onclick="testAPI('/api/home')" class="bg-gray-800 hover:bg-pink-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-gray-700 hover:border-pink-500">/api/home</button>
            <button onclick="testAPI('/api/latest?page=1')" class="bg-gray-800 hover:bg-violet-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-gray-700 hover:border-violet-500">/api/latest</button>
            <button onclick="testAPI('/api/advanceSearch?search=one&page=1')" class="bg-gray-800 hover:bg-blue-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-gray-700 hover:border-blue-500">/api/search (Query: One)</button>
            <button onclick="testAPI('/api/komik/one-piece')" class="bg-gray-800 hover:bg-emerald-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-gray-700 hover:border-emerald-500">/api/komik/one-piece</button>
          </div>
        </div>

        <div class="bg-[#0d1117] rounded-xl border border-gray-800 shadow-lg overflow-hidden flex flex-col">
          <div class="bg-gray-900 px-4 py-2 border-b border-gray-800 flex justify-between items-center">
            <span class="text-xs font-mono text-gray-400" id="statusLabel">Status: Menunggu eksekusi...</span>
            <span class="text-xs font-mono text-gray-500" id="timeLabel"></span>
          </div>
          <pre id="output" class="p-4 text-sm font-mono text-green-400 h-[400px] overflow-auto">Siap menerima perintah...</pre>
        </div>

      </div>

      <script>
        async function testAPI(endpoint) {
          const output = document.getElementById('output');
          const statusLabel = document.getElementById('statusLabel');
          const timeLabel = document.getElementById('timeLabel');
          const token = document.getElementById('apiKey').value;
          
          if (!token) {
            output.className = "p-4 text-sm font-mono text-yellow-400 h-[400px] overflow-auto";
            output.innerText = "⚠️ Peringatan: API Secret Key belum diisi!";
            statusLabel.innerText = "Status: Dibatalkan";
            return;
          }

          output.className = "p-4 text-sm font-mono text-gray-400 h-[400px] overflow-auto flex items-center justify-center";
          output.innerText = "Menghubungi server komikcast...";
          statusLabel.innerText = \`Status: Fetching \${endpoint}...\`;
          timeLabel.innerText = "";
          
          const startTime = performance.now();

          try {
            const res = await fetch(endpoint, {
              headers: { 
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + token 
              }
            });
            
            const endTime = performance.now();
            const timeTaken = (endTime - startTime).toFixed(2);
            timeLabel.innerText = \`Waktu: \${timeTaken}ms\`;

            const data = await res.json();
            
            if (res.ok && data.success !== false) {
              output.className = "p-4 text-sm font-mono text-emerald-400 h-[400px] overflow-auto";
              statusLabel.innerText = \`Status: \${res.status} OK\`;
            } else {
              output.className = "p-4 text-sm font-mono text-red-400 h-[400px] overflow-auto";
              statusLabel.innerText = \`Status: \${res.status} Error\`;
            }

            output.innerText = JSON.stringify(data, null, 2);
          } catch (err) {
            output.className = "p-4 text-sm font-mono text-red-500 h-[400px] overflow-auto";
            output.innerText = '🔴 CRASH: ' + err.message;
            statusLabel.innerText = "Status: Network Error";
          }
        }
      </script>
    </body>
    </html>
  `;
  return c.html(html);
});

// ─── ENDPOINTS ────────────────────────────────────────────────────────────────

app.get("/api/home", async (c) => {
  try {
    return ok(c, await getHomeData());
  } catch (e) {
    return err(c, (e as Error).message);
  }
});

app.get("/api/latest", async (c) => {
  try {
    const page = sanitizePage(c.req.query("page")); // Memakai sanitizer
    return ok(c, await getLatestKomik(page));
  } catch (e) {
    return err(c, (e as Error).message);
  }
});

app.get("/api/popular", async (c) => {
  try {
    const page = sanitizePage(c.req.query("page"));
    const category = sanitize(c.req.query("category") || "all", 20);
    return ok(c, await getPopularKomik(page, category));
  } catch (e) {
    return err(c, (e as Error).message);
  }
});

app.get("/api/advanceSearch", async (c) => {
  try {
    const search = sanitize(c.req.query("search"), 100);
    const genreIds = sanitize(c.req.query("genreIds"), 50);
    const format = sanitize(c.req.query("format"), 20);
    const page = sanitizePage(c.req.query("page"));

    // Logika pencegat dibawa dari Deno
    if (!search && !genreIds && !format) {
      return err(
        c,
        "Parameter pencarian wajib diisi (search / genre / format)",
        400
      );
    }
    
    return ok(c, await searchKomik(search, page, genreIds, format));
  } catch (e) {
    return err(c, (e as Error).message);
  }
});

app.get("/api/genres", async (c) => {
  try {
    return ok(c, await getGenreList());
  } catch (e) {
    return err(c, (e as Error).message);
  }
});

// (Rute Baru) Akhirnya getKomikByGenre dipakai!
app.get("/api/genre/:genreSlug", async (c) => {
  try {
    const genreSlug = sanitize(c.req.param("genreSlug"), 100);
    const page = sanitizePage(c.req.query("page"));
    return ok(c, await getKomikByGenre(genreSlug, page));
  } catch (e) {
    return err(c, (e as Error).message);
  }
});

app.get("/api/komik/:slug", async (c) => {
  try {
    const slug = sanitize(c.req.param("slug"), 200);
    return ok(c, await getKomikDetail(slug));
  } catch (e) {
    return err(c, (e as Error).message);
  }
});

app.get("/api/komik/:slug/:chapterId", async (c) => {
  try {
    const slug = sanitize(c.req.param("slug"), 200);
    const chapterId = sanitize(c.req.param("chapterId"), 100);
    return ok(c, await getChapterDetail(slug, chapterId));
  } catch (e) {
    return err(c, (e as Error).message);
  }
});

// Custom 404 Handler agar seragam dengan JSON
app.notFound((c) => err(c, "Endpoint API tidak ditemukan di Vercel Edge", 404));

export default handle(app);