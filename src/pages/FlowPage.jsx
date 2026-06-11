import { Link } from "react-router-dom";
import { flowSteps } from "../content";
import { SectionTitle } from "../components/SectionTitle";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function FlowPage() {
  useDocumentTitle("ARM x Tickmill — Маршрут");

  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="Маршрут"
        title="Последовательность из инструкции"
        copy="Сначала ARM, потом Tickmill, затем верификация, торговый счет и пополнение кошелька."
        level={1}
      />

      <div className="timeline-grid">
        {flowSteps.map((step) => (
          <article key={step.id} className="card timeline-card">
            <div className="timeline-head">
              <div className="timeline-index">{step.id}</div>
              <div className="timeline-rule" />
            </div>
            <h2>{step.title}</h2>
            <p>{step.copy}</p>
            <ul className="card-list">
              {step.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="page-actions">
        <Link className="button button-secondary" to="/">
          Назад к обзору
        </Link>
        <Link className="button button-primary" to="/forms">
          К формам
        </Link>
      </div>
    </div>
  );
}
