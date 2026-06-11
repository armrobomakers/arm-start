import { Link } from "react-router-dom";
import armRegistrationScreenshot from "../../pdf_pages/page_1.png";
import {
  armRegistrationAfter,
  armRegistrationChecks,
  armRegistrationFields,
  armRegistrationStats,
} from "../content";
import { CardList } from "../components/CardList";
import { SectionTitle } from "../components/SectionTitle";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function HomePage() {
  useDocumentTitle("ARM x Tickmill — Регистрация ARM");

  return (
    <div className="page-stack arm-page">
      <section className="hero card hero-home hero-arm" id="overview">
        <div className="hero-copy">
          <p className="eyebrow">Первый раздел</p>
          <h1>Регистрация в ARM на robomakers.org</h1>
          <p className="hero-text">
            Сначала человек должен создать аккаунт в ARM. Здесь собрана вся
            информация по этому блоку: что вводить в форму, какие согласия
            отметить, как выглядит экран регистрации и что происходит после
            успешной отправки данных.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#fields">
              К полям формы
            </a>
            <a className="button button-secondary" href="#screenshot">
              Посмотреть скриншот
            </a>
          </div>
        </div>

        <div className="hero-panel">
          <div className="hero-panel-header">
            <span>Что важно</span>
            <strong>Регистрация доступна только по partner link / ID</strong>
          </div>

          <div className="stat-grid">
            {armRegistrationStats.map((stat) => (
              <div key={stat.label} className="stat">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>

          <div className="mini-note">
            На странице «Регистрация» нужно заполнить данные, подтвердить
            согласия и нажать «Зарегистрироваться».
          </div>
        </div>
      </section>

      <section className="grid-section" id="fields">
        <SectionTitle
          eyebrow="Поля формы"
          title="Что нужно заполнить в ARM"
          copy="Ниже разбитый на карточки список данных, которые пользователь видит в форме регистрации."
          level={2}
        />

        <div className="arm-field-grid">
          {armRegistrationFields.map((field) => (
            <article key={field.title} className="card arm-field-card">
              <p className="arm-field-kicker">{field.title}</p>
              <p>{field.copy}</p>
            </article>
          ))}
        </div>

        <div className="card section-card arm-checks-card">
          <p className="eyebrow">Согласия</p>
          <CardList items={armRegistrationChecks} />
        </div>
      </section>

      <section className="grid-section" id="screenshot">
        <SectionTitle
          eyebrow="Скриншот"
          title="Как выглядит форма регистрации"
          copy="Скрин из инструкции показывает сам экран регистрации, поля и кнопку отправки."
          level={2}
        />

        <div className="arm-screenshot-layout">
          <figure className="card screenshot-card">
            <img
              src={armRegistrationScreenshot}
              alt="Скриншот страницы регистрации ARM из инструкции"
            />
            <figcaption>
              Форма регистрации ARM из инструкции. Это базовый экран для
              первого шага подключения.
            </figcaption>
          </figure>

          <article className="card section-card section-card-dark">
            <p className="eyebrow">Порядок заполнения</p>
            <ol className="arm-ordered-list">
              <li>Введите ID спонсора, email, телефон, имя и фамилию.</li>
              <li>Придумайте пароль и повторите его в подтверждении.</li>
              <li>Поставьте все согласия с условиями и политиками.</li>
              <li>Нажмите «Зарегистрироваться».</li>
            </ol>
            <div className="mini-note">
              Используйте реальные данные. В инструкции указано, что регистрация
              идет через партнерскую ссылку или ID спонсора.
            </div>
          </article>
        </div>
      </section>

      <section className="grid-section arm-after" id="after">
        <SectionTitle
          eyebrow="После регистрации"
          title="Что получает человек после отправки формы"
          copy="Этот блок нужен, чтобы пользователь понимал следующий шаг после завершения регистрации."
          level={2}
        />

        <div className="final-grid">
          <article className="card section-card">
            <p className="eyebrow">Результат</p>
            <CardList items={armRegistrationAfter} />
          </article>

          <article className="card section-card section-card-dark">
            <p className="eyebrow">Кратко</p>
            <ul className="summary-list">
              <li>
                Платформа:
                <strong> robomakers.org</strong>
              </li>
              <li>
                Доступ открывается после завершения формы и подтверждения
                согласий.
              </li>
              <li>
                Далее пользователь переходит к выбору инвестиционной подписки
                ARM.
              </li>
            </ul>
            <div className="page-actions">
              <Link className="button button-primary button-inline" to="/flow">
                Следующий раздел
              </Link>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
