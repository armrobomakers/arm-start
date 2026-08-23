import { useEffect } from "react";
import {
  CardGrid,
  Callout,
  Checklist,
  CopyBlock,
  PageNav,
  Prerequisites,
  ScreenshotGrid,
  StageProgress,
  StepList,
} from "../components/DocComponents";
import { ArmInvestorIndicator } from "../components/ArmInvestorIndicator";
import { sectionsBySlug } from "../content";

const SITE_URL = "https://start.robomakers.org";
const DEFAULT_IMAGE = `${SITE_URL}/og-cover.png`;
const ROBOTS_CONTENT = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
const OVERVIEW_TITLE = "ARM Start — индикатор инвестора, Tickmill и PAMM";
const OVERVIEW_DESCRIPTION = "Индикатор инвестора ARM и пошаговое подключение: регистрация, пополнение, подписки VIP/PREMIUM, Tickmill, Depomost и подключение к PAMM ARM.";

function upsertMeta(attribute, key, content) {
  let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attribute, key);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function upsertCanonical(href) {
  let node = document.head.querySelector('link[rel="canonical"]');
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", "canonical");
    document.head.appendChild(node);
  }
  node.setAttribute("href", href);
}

function applySectionMeta(section) {
  const isOverview = section.slug === "overview";
  const path = isOverview ? "/" : `/${section.slug}`;
  const canonical = `${SITE_URL}${path}`;
  const title = isOverview ? OVERVIEW_TITLE : `${section.title} — ARM Start`;
  const description = isOverview ? OVERVIEW_DESCRIPTION : (section.lead || section.title);

  document.title = title;
  upsertMeta("name", "description", description);
  upsertMeta("name", "robots", ROBOTS_CONTENT);
  upsertMeta("property", "og:type", "website");
  upsertMeta("property", "og:locale", "ru_RU");
  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:description", description);
  upsertMeta("property", "og:url", canonical);
  upsertMeta("property", "og:image", DEFAULT_IMAGE);
  upsertMeta("property", "og:site_name", "ARM Start");
  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "twitter:title", title);
  upsertMeta("name", "twitter:description", description);
  upsertMeta("name", "twitter:image", DEFAULT_IMAGE);
  upsertCanonical(canonical);
}

export function DocPage({ slug }) {
  const section = sectionsBySlug[slug] || sectionsBySlug.overview;
  const isOverview = section.slug === "overview";

  useEffect(() => {
    applySectionMeta(section);
  }, [section]);

  return (
    <main className={`doc-page${isOverview ? " doc-page-indicator" : ""}`}>
      {isOverview ? (
        <header className="arm-indicator-page-header">
          <h1 id="arm-indicator-title">ИНДИКАТОР ИНВЕСТОРА</h1>
          <p>На основе реальных данных торговой системы ARM</p>
        </header>
      ) : (
        <section className="hero">
          <p className="eyebrow">{section.eyebrow}</p>
          <h1>{section.title}</h1>
          <p>{section.lead}</p>
        </section>
      )}

      {isOverview ? <ArmInvestorIndicator /> : null}
      <StageProgress currentSlug={section.slug} />
      {isOverview ? <Prerequisites /> : null}
      <CardGrid cards={section.cards} />
      {section.callouts?.map((callout) => <Callout key={callout.title} callout={callout} />)}
      <StepList steps={section.steps} />
      <CopyBlock block={section.copyBlock} />
      <Checklist items={section.checklist} />
      <ScreenshotGrid images={section.images} />
      <PageNav current={section} />
    </main>
  );
}
