// ============================================================================
// /api/profile  —  Vercel serverless function (Node 18+)
//
// Flow:  GET /api/profile?url=https://instagram.com/<handle>
//   1. Parse the handle from the URL.
//   2. Check the Postgres cache. If a fresh row exists (< CACHE_TTL_HOURS old),
//      return it WITHOUT calling Apify — this is what protects your $5 credits.
//   3. Otherwise call the Apify Instagram Profile Scraper, compute averages
//      from the most recent posts, upsert into the cache, and return.
//
// Required environment variables (set in Vercel project settings):
//   APIFY_TOKEN   — your Apify API token (Console → Settings → Integrations)
//   DATABASE_URL  — Postgres connection string (Supabase / Neon / Vercel PG)
//
// NOTE ON THE ACTOR: actor input/output field names differ between actors and
// versions. The parsing below targets the common shape of Instagram profile
// scrapers (followersCount + a latestPosts[] array with likesCount/commentsCount).
// Open your chosen actor's "Output" tab and adjust the field names if they differ.
// ============================================================================

import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const APIFY_ACTOR = "apify~instagram-profile-scraper"; // verify/replace with your chosen actor
const CACHE_TTL_HOURS = 24 * 7; // re-scrape a profile at most once a week
const POSTS_TO_AVERAGE = 12;    // average over the last N posts, not the single best

function handleFromUrl(url) {
  try {
    const path = new URL(url.startsWith("http") ? url : "https://" + url).pathname;
    const seg = path.split("/").filter(Boolean);
    return seg.length ? seg[0].replace(/^@/, "").toLowerCase() : null;
  } catch {
    return null;
  }
}

async function scrapeApify(handle) {
  const endpoint =
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items` +
    `?token=${process.env.APIFY_TOKEN}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [handle], resultsLimit: POSTS_TO_AVERAGE }),
  });
  if (!res.ok) throw new Error(`Apify run failed: ${res.status}`);

  const items = await res.json();
  if (!Array.isArray(items) || !items.length) throw new Error("No data returned for handle");

  const profile = items[0];
  const followers = Number(profile.followersCount ?? profile.followers ?? 0);

  // Posts may arrive nested under latestPosts, or as separate dataset items.
  const posts = Array.isArray(profile.latestPosts) && profile.latestPosts.length
    ? profile.latestPosts
    : items.filter((it) => it.likesCount != null);

  const recent = posts.slice(0, POSTS_TO_AVERAGE);
  if (!recent.length) throw new Error("No posts found to compute engagement");

  const avg = (key) =>
    Math.round(recent.reduce((s, p) => s + Number(p[key] ?? 0), 0) / recent.length);

  return {
    handle,
    followers,
    avgLikes: avg("likesCount"),
    avgComments: avg("commentsCount"),
    postsSampled: recent.length,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // tighten to your domain in production

  const handle = handleFromUrl(req.query.url || "");
  if (!handle) return res.status(400).json({ error: "Invalid Instagram URL" });

  try {
    // 1. Cache check
    const cached = await pool.query(
      `SELECT * FROM profile_cache
       WHERE handle = $1 AND scraped_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'`,
      [handle]
    );
    if (cached.rows.length) {
      const r = cached.rows[0];
      return res.status(200).json({
        handle, followers: r.followers, avgLikes: r.avg_likes,
        avgComments: r.avg_comments, cached: true,
      });
    }

    // 2. Scrape + upsert
    const data = await scrapeApify(handle);
    await pool.query(
      `INSERT INTO profile_cache (handle, followers, avg_likes, avg_comments, posts_sampled, scraped_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (handle) DO UPDATE SET
         followers = EXCLUDED.followers, avg_likes = EXCLUDED.avg_likes,
         avg_comments = EXCLUDED.avg_comments, posts_sampled = EXCLUDED.posts_sampled,
         scraped_at = NOW()`,
      [data.handle, data.followers, data.avgLikes, data.avgComments, data.postsSampled]
    );

    return res.status(200).json({ ...data, cached: false });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: err.message || "Scrape failed" });
  }
}
