import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { guideSections } from "../src/content.js";

const DIST_DIR = resolve(process.cwd(), "dist");
const SITE_URL = "https://start.robomakers.org";
const DEFAULT_IMAGE = `${SITE_URL}/og-cover.png`;
const ROBOTS_CONTENT = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
const OVERVIEW_TITLE = "ARM Start — индикатор инвестора, Tickmill и PAMM";
const OVERVIEW_DESCRIPTION = "Индикатор инвестора ARM и пошаговое подключение: регистрация, пополнение, подписки VIP/PREMIUM, Tickmill, Depomost и подключение к PAMM ARM.";

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function cleanDescription(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 170) return text;
  const slice = text.slice(0, 167);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 120 ? lastSpace : 167)}…`;
}

function replaceOrInsert(html, pattern, tag) {
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace("</head>", `    ${tag}\n  </head>`);
}

function applySeo(html, { title, description, url, image = DEFAULT_IMAGE, imageType = "image/png", siteName = "ARM Start", schema }) {
  const safeTitle = escapeAttribute(title);
  const safeDescription = escapeAttribute(cleanDescription(description));
  const safeUrl = escapeAttribute(url);
  const safeImage = escapeAttribute(image);

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  html = replaceOrInsert(html, /<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${safeDescription}" />`);
  html = replaceOrInsert(html, /<meta\s+name=["']robots["'][^>]*>/i, `<meta name="robots" content="${ROBOTS_CONTENT}" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:type["'][^>]*>/i, `<meta property="og:type" content="website" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:locale["'][^>]*>/i, `<meta property="og:locale" content="ru_RU" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${safeTitle}" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${safeDescription}" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${safeUrl}" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${safeImage}" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:image:type["'][^>]*>/i, `<meta property="og:image:type" content="${imageType}" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:image:width["'][^>]*>/i, `<meta property="og:image:width" content="1200" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:image:height["'][^>]*>/i, `<meta property="og:image:height" content="630" />`);
  html = replaceOrInsert(html, /<meta\s+property=["']og:site_name["'][^>]*>/i, `<meta property="og:site_name" content="${escapeAttribute(siteName)}" />`);
  html = replaceOrInsert(html, /<meta\s+name=["']twitter:card["'][^>]*>/i, `<meta name="twitter:card" content="summary_large_image" />`);
  html = replaceOrInsert(html, /<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${safeTitle}" />`);
  html = replaceOrInsert(html, /<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${safeDescription}" />`);
  html = replaceOrInsert(html, /<meta\s+name=["']twitter:image["'][^>]*>/i, `<meta name="twitter:image" content="${safeImage}" />`);
  html = replaceOrInsert(html, /<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${safeUrl}" />`);

  html = html.replace(/\s*<script\s+type=["']application\/ld\+json["']\s+data-seo-generated[^>]*>[\s\S]*?<\/script>/gi, "");
  if (schema) {
    const json = JSON.stringify(schema).replaceAll("<", "\\u003c");
    html = html.replace("</head>", `    <script type="application/ld+json" data-seo-generated>${json}</script>\n  </head>`);
  }

  return html;
}

function buildSchema({ title, description, url, root = false }) {
  const graph = [];
  if (root) {
    graph.push({
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "ARM Start",
      inLanguage: "ru-RU",
    });
  }

  graph.push({
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: title,
    description: cleanDescription(description),
    inLanguage: "ru-RU",
    isPartOf: { "@id": `${SITE_URL}/#website` },
  });

  if (!root) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ARM Start", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: title.replace(/\s+—\s+ARM Start$/, ""), item: url },
      ],
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

const baseTemplate = await readFile(resolve(DIST_DIR, "index.html"), "utf8");
const overview = guideSections.find((section) => section.slug === "overview");
const overviewUrl = `${SITE_URL}/`;
const overviewHtml = applySeo(baseTemplate, {
  title: OVERVIEW_TITLE,
  description: OVERVIEW_DESCRIPTION,
  url: overviewUrl,
  schema: buildSchema({ title: OVERVIEW_TITLE, description: OVERVIEW_DESCRIPTION, url: overviewUrl, root: true }),
});
await writeFile(resolve(DIST_DIR, "index.html"), overviewHtml, "utf8");

for (const section of guideSections) {
  if (section.slug === "overview") continue;
  const url = `${SITE_URL}/${section.slug}`;
  const title = `${section.title} — ARM Start`;
  const description = section.lead || section.title;
  const html = applySeo(baseTemplate, {
    title,
    description,
    url,
    schema: buildSchema({ title, description, url }),
  });
  await writeFile(resolve(DIST_DIR, `${section.slug}.html`), html, "utf8");
}

const giveawayPath = resolve(DIST_DIR, "giveaway.html");
const giveawayTemplate = await readFile(giveawayPath, "utf8");
const giveawayUrl = `${SITE_URL}/giveaway`;
const giveawayTitle = "ARM — Розыгрыш среди участников";
const giveawayDescription = "Рейтинг участников розыгрыша ARM, количество купонов, прогресс до финала, условия участия и призы.";
const giveawayHtml = applySeo(giveawayTemplate, {
  title: giveawayTitle,
  description: giveawayDescription,
  url: giveawayUrl,
  image: `${SITE_URL}/og-cover-v7.png`,
  imageType: "image/png",
  siteName: "ARM",
  schema: buildSchema({ title: giveawayTitle, description: giveawayDescription, url: giveawayUrl }),
});
await writeFile(giveawayPath, giveawayHtml, "utf8");

const urls = [
  `${SITE_URL}/`,
  ...guideSections.filter((section) => section.slug !== "overview").map((section) => `${SITE_URL}/${section.slug}`),
  giveawayUrl,
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile(resolve(DIST_DIR, "sitemap.xml"), sitemap, "utf8");

const robots = `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
await writeFile(resolve(DIST_DIR, "robots.txt"), robots, "utf8");

console.log(`SEO pages generated: ${guideSections.length + 1}; sitemap URLs: ${urls.length}; overview: ${overview?.slug || "missing"}`);
