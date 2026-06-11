import { Link } from "react-router-dom";
import { accountFields, walletSteps } from "../content";
import { SectionTitle } from "../components/SectionTitle";
import { CardList } from "../components/CardList";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function OperationsPage() {
  useDocumentTitle("ARM x Tickmill — Операции");

  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="Операции"
        title="Счет и пополнение"
        copy="Параметры торгового счета, схема пополнения кошелька и практический порядок действий."
        level={1}
      />

      <div className="operations-grid">
        <article className="card section-card">
          <p className="eyebrow">Tickmill счет</p>
          <h2>Параметры торгового счета</h2>
          <CardList items={accountFields} />
          <div className="mini-note">
            После создания счета логин и пароль приходят на email.
          </div>
        </article>

        <article className="card section-card">
          <p className="eyebrow">Кошелек</p>
          <h2>Пополнение кошелька Tickmill</h2>
          <CardList items={walletSteps} />
        </article>
      </div>

      <div className="page-actions">
        <Link className="button button-secondary" to="/forms">
          Назад
        </Link>
        <Link className="button button-primary" to="/controls">
          Контроль
        </Link>
      </div>
    </div>
  );
}
