import { Link } from "react-router-dom";
import { finalChecklist } from "../content";
import { SectionTitle } from "../components/SectionTitle";
import { CardList } from "../components/CardList";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function ControlsPage() {
  useDocumentTitle("ARM x Tickmill — Контроль");

  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="Контроль"
        title="Финальные проверки"
        copy="Перед завершением маршрута проверьте контакты, сеть, адрес и сохраненные учетные данные."
        level={1}
      />

      <div className="final-grid">
        <article className="card section-card">
          <p className="eyebrow">Под рукой</p>
          <h2>Что должно быть готово</h2>
          <CardList items={finalChecklist} />
        </article>

        <article className="card section-card section-card-dark">
          <p className="eyebrow">Важно не потерять</p>
          <h2>Контакты и ориентиры</h2>
          <ul className="summary-list">
            <li>
              Ссылка на регистрацию Tickmill:
              <strong> https://tickmill.link/4IT792J</strong>
            </li>
            <li>
              Email поддержки:
              <strong> support@tickmill.com</strong>
            </li>
            <li>
              PAMM MASTER в инструкции:
              <strong> 55770045</strong>
            </li>
          </ul>
          <div className="mini-note">
            Если выбрана европейская юрисдикция, подключение к PAMM не
            получится.
          </div>
        </article>
      </div>

      <div className="page-actions">
        <Link className="button button-secondary" to="/operations">
          Назад
        </Link>
        <Link className="button button-primary" to="/">
          К обзору
        </Link>
      </div>
    </div>
  );
}
