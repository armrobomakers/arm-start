export function SectionTitle({ eyebrow, title, copy, level = 2 }) {
  const Heading = level === 1 ? "h1" : "h2";

  return (
    <div className="section-title">
      <p className="eyebrow">{eyebrow}</p>
      <Heading>{title}</Heading>
      {copy ? <p className="section-copy">{copy}</p> : null}
    </div>
  );
}
