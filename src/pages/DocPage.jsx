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

export function DocPage({ slug }) {
  const section = sectionsBySlug[slug] || sectionsBySlug.overview;
  const isOverview = section.slug === "overview";

  useEffect(() => {
    document.title = `${section.title} — ARM Start`;
  }, [section.title]);

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
