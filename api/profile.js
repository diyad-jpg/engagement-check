import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const APIFY_ACTOR = "apify~instagram-profile-scraper";
const CACHE_TTL_HOURS = 24 * 7;
const POSTS_TO_AVERAGE = 12;

function handleFromUrl(url) {
  try {
    const path = new URL(url.startsWith("http") ? url : "https://" + url).pathname;
    const seg = path.split("/").filter(Boolean);
    return seg.length ? seg[0].replace(/^@/, "").toLowerCase() : null;
  } catch { return null; }
}

async function scrapeApify(handle) {
  const endpoint =
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items` +
    `?token=${process.env.APIFY_TOKEN}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [handle] }),
  });
  if (!res.ok) throw new Error(`Apify run failed: ${res.status}`);

  const items = await res.json();
  if (!Array.isArray(items) || !items.length) throw new Error("No data returned");

  const profile = items[0];
  const followers = Number(profile.followersCount ?? 0);
  const posts = Array.isArray(profile.latestPosts) ? profile.latestPosts : [];
  const recent = posts.slice(0, POSTS_TO_AVERAGE);
  if (!recent.length) throw new Error("No posts found");

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
  res.setHeader("Access-Control-Allow-Origin", "*");

  const handle = handleFromUrl(req.query.url || "");
  if (!handle) return res.status(400).json({ error: "Invalid Instagram URL" });

  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from("profile_cache")
      .select("*")
      .eq("handle", handle)
      .gte("scraped_at", cutoff)
      .maybeSingle();

    if (cached) {
      return res.status(200).json({
        handle,
        followers: cached.followers,
        avgLikes: cached.avg_likes,
        avgComments: cached.avg_comments,
        cached: true,
      });
    }

    const data = await scrapeApify(handle);

    await supabase.from("profile_cache").upsert({
      handle: data.handle,
      followers: data.followers,
      avg_likes: data.avgLikes,
      avg_comments: data.avgComments,
      posts_sampled: data.postsSampled,
      scraped_at: new Date().toISOString(),
    });

    return res.status(200).json({ ...data, cached: false });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: err.message || "Scrape failed" });
  }
}
