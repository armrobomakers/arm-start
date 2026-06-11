import { Link } from "react-router-dom";
import { guideSections, prerequisites } from "../content";
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
          <img src={imageMap[image.src]} alt={image.caption} />
          <figcaption>{image.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function CopyBlock({ block }) {
  if (!block) return null;

  return (
    <div className="copy-block">
      <div className="copy-head">
        <span>{block.label}</span>
        <small>скопируйте и замените данные в скобках</small>
      </div>
      <pre>{renderRichText(block.text)}</pre>
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
