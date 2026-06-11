import { Link } from "react-router-dom";
import { armFormFields, tickmillFields, verificationFields } from "../content";
import { SectionTitle } from "../components/SectionTitle";
import { CardList } from "../components/CardList";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function FormsPage() {
  useDocumentTitle("ARM x Tickmill — Формы");

  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="Формы"
        title="Поля, которые нужно заполнить"
        copy="Здесь сведены поля из ARM и Tickmill, а также список требований к верификации."
        level={1}
      />

      <div className="forms-grid">
        <article className="card section-card">
          <p className="eyebrow">ARM</p>
          <h2>Регистрация инвестора</h2>
          <CardList items={armFormFields} />
        </article>

        <article className="card section-card">
          <p className="eyebrow">Tickmill</p>
          <h2>Анкета брокера</h2>
          <CardList items={tickmillFields} />
        </article>

        <article className="card section-card section-card-wide">
          <p className="eyebrow">KYC</p>
          <h2>Верификация личности</h2>
          <CardList items={verificationFields} />
        </article>
      </div>

      <div className="page-actions">
        <Link className="button button-secondary" to="/flow">
          Назад
        </Link>
        <Link className="button button-primary" to="/operations">
          К операциям
        </Link>
      </div>
    </div>
  );
}
