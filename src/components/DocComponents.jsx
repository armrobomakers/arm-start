import { useState } from "react";
import { Link } from "react-router-dom";
import { guideSections, guideStages, prerequisites } from "../content";
import { imageMap } from "../imageMap";

function renderRichText(text) {
  if (typeof text !== "string" || !text) return text;

  const urlPattern = /(https?:\/\/[^\s<]+)/g;
  const parts = text.split(urlPattern);

  return parts.map((part, index) => {
    if (!part.match(urlPattern)) {
      return part;
    }

    const trimmed = part.replace(/[.,;:!?)]*$/, "");
    const suffix = part.slice(trimmed.length);

    return (
      <span key={`${trimmed}-${index}`}>
        <a href={trimmed} target="_blank" rel="noreferrer">
          {trimmed}
        </a>
        {suffix}
      </span>
    );
  });
}

export function StepList({ steps = [] }) {
  if (!steps.length) return null;

  return (
    <div className="step-list">
      {steps.map((step, index) => (
        <article className="step-card" key={step.title}>
          <div className="step-number">{String(index + 1).padStart(2, "0")}</div>
          <div>
            <h3>{step.title}</h3>
            <p>{renderRichText(step.text)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function Callout({ callout }) {
  return (
    <aside className={`callout ${callout.type || "info"}`}>
      <strong>{callout.title}</strong>
      <p>{renderRichText(callout.text)}</p>
    </aside>
  );
}

export function CardGrid({ cards = [] }) {
  if (!cards.length) return null;

  return (
    <div className="feature-grid">
      {cards.map((card) => (
        <article className="feature-card" key={card.title}>
          <h3>{card.title}</h3>
          <p>{card.text}</p>
        </article>
      ))}
    </div>
  );
}

export function ScreenshotGrid({ images = [] }) {
  if (!images.length) return null;

  return (
    <div className="screenshot-grid">
      {images.map((image) => (
        <figure className="screenshot-card" key={image.src}>
          <img src={imageMap[image.src]} alt={image.caption} loading="lazy" decoding="async" />
          <figcaption>{image.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function StageProgress({ currentSlug }) {
  const currentIndex = guideStages.findIndex((stage) => stage.slugs.includes(currentSlug));

  if (currentIndex === -1) return null;

  return (
    <section className="stage-progress card">
      <div className="stage-progress-head">
        <div>
          <p className="eyebrow">Путь</p>
          <h2>Прогресс по стадиям</h2>
        </div>
        <span className="stage-progress-count">
          {currentIndex + 1}/{guideStages.length}
        </span>
      </div>

      <div className="stage-progress-track" aria-hidden="true">
        <span style={{ width: `${((currentIndex + 1) / guideStages.length) * 100}%` }} />
      </div>

      <div className="stage-progress-list">
        {guideStages.map((stage, index) => {
          const active = index === currentIndex;
          const complete = index < currentIndex;
          const stageHref = stage.slugs[0] === "overview" ? "/" : `/${stage.slugs[0]}`;

          return (
            <Link
              key={stage.key}
              to={stageHref}
              className={`stage-pill stage-pill-link${active ? " active" : ""}${complete ? " complete" : ""}`}
              aria-current={active ? "step" : undefined}
              aria-label={`Перейти к стадии ${stage.label}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{stage.label}</strong>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function Checklist({ items = [] }) {
  if (!items.length) return null;

  return (
    <section className="checklist card">
      <div className="section-title">
        <p className="eyebrow">Чек-лист</p>
        <h2>Что должно быть готово</h2>
      </div>
      <div className="checklist-grid">
        {items.map((item) => (
          <label key={item} className="checklist-item">
            <input type="checkbox" readOnly />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

export function CopyBlock({ block }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  if (!block) return null;

  const normalizedText = String(block.text || "").replace(/\\n/g, "\n");
  const lines = normalizedText.split("\n");

  async function handleCopy() {
    try {
      setCopyError("");
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API недоступен");
      }
      await navigator.clipboard.writeText(normalizedText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setCopyError("Копирование недоступно в этом браузере. Скопируйте текст вручную.");
    }
  }

  return (
    <div className="copy-block">
      <div className="copy-head">
        <div>
          <span>{block.label}</span>
          <small>Скопируйте и замените данные в скобках</small>
        </div>
        <button className="copy-button" type="button" onClick={handleCopy}>
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      {copyError ? <div className="copy-error" role="alert">{copyError}</div> : null}
      <div className="copy-body" aria-label={block.label}>
        {lines.map((line, index) => {
          const trimmed = line.trim();

          if (!trimmed) {
            return <div className="copy-spacer" key={`spacer-${index}`} />;
          }

          const labeledUrl = trimmed.match(/^(.+?):\s*(https?:\/\/\S+)$/);
          if (labeledUrl) {
            return (
              <div className="copy-line copy-line-link" key={`line-${index}`}>
                <span className="copy-line-label">{labeledUrl[1]}</span>
                <a className="copy-link-pill" href={labeledUrl[2]} target="_blank" rel="noreferrer">
                  {labeledUrl[2]}
                </a>
              </div>
            );
          }

          const urlOnly = trimmed.match(/^(https?:\/\/\S+)$/);
          if (urlOnly) {
            return (
              <a className="copy-link-pill copy-link-block" key={`line-${index}`} href={urlOnly[1]} target="_blank" rel="noreferrer">
                {urlOnly[1]}
              </a>
            );
          }

          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            return (
              <a className="copy-link-pill copy-link-block" key={`line-${index}`} href={`mailto:${trimmed}`}>
                {trimmed}
              </a>
            );
          }

          return (
            <p className="copy-line copy-line-text" key={`line-${index}`}>
              {renderRichText(trimmed)}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export function Prerequisites() {
  return (
    <div className="prep-box">
      <h2>Перед началом подготовьте</h2>
      <div className="prep-grid">
        {prerequisites.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

export function PageNav({ current }) {
  const prev = guideSections[current.index - 1];
  const next = guideSections[current.index + 1];

  return (
    <div className="page-nav">
      {prev ? (
        <Link className="page-nav-card" to={prev.slug === "overview" ? "/" : `/${prev.slug}`}>
          <span>Назад</span>
          <strong>{prev.title}</strong>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link className="page-nav-card next" to={`/${next.slug}`}>
          <span>Далее</span>
          <strong>{next.title}</strong>
        </Link>
      ) : null}
    </div>
  );
}
