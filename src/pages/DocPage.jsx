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
import { guideMeta, sectionsBySlug } from "../content";
import brandLogo from "../assets/brand/logo.svg";

export function DocPage({ slug }) {
  const section = sectionsBySlug[slug] || sectionsBySlug.overview;

  useEffect(() => {
    document.title = `${section.title} - ARM Guide`;
  }, [section.title]);

  const isOverview = section.slug === "overview";

  return (
    <main className="doc-page">
      <section className={isOverview ? "hero hero-overview" : "hero"}>
        <div>
          <p className="eyebrow">{section.eyebrow}</p>
          <h1>{section.title}</h1>
          <p>{section.lead}</p>
          {isOverview ? <img className="hero-logo" src={brandLogo} alt="ARM AI Robo Makers" /> : null}
          {isOverview ? (
            <div className="hero-actions">
              <a className="primary-action" href={guideMeta.tickmillLink} target="_blank" rel="noreferrer">
                Ссылка Tickmill
              </a>
              <span className="soft-pill">IB: {guideMeta.ibCode}</span>
            </div>
          ) : null}
        </div>
      </section>

      <StageProgress currentSlug={section.slug} />

      {isOverview ? <Prerequisites /> : null}

      <CardGrid cards={section.cards} />

      {section.callouts?.map((callout) => (
        <Callout key={callout.title} callout={callout} />
      ))}

      <StepList steps={section.steps} />
      <CopyBlock block={section.copyBlock} />
      <Checklist items={section.checklist} />
      <ScreenshotGrid images={section.images} />
      <PageNav current={section} />
    </main>
  );
}
