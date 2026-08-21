import { Link } from "react-router-dom";
import brandLogo from "../assets/brand/logo.svg";

const steps = [
  {
    number: "01",
    title: "Присоединитесь",
    text: "Откройте условия розыгрыша и подтвердите участие одним понятным действием.",
  },
  {
    number: "02",
    title: "Выполните условия",
    text: "Следуйте короткому списку шагов. Всё важное собрано на одной странице.",
  },
  {
    number: "03",
    title: "Ждите результат",
    text: "Победитель будет выбран честно, а результат появится в официальных каналах ARM.",
  },
];

export function GiveawayPage() {
  return (
    <main className="giveaway-page">
      <div className="giveaway-noise" aria-hidden="true" />
      <header className="giveaway-header">
        <Link className="giveaway-brand" to="/" aria-label="На главную ARM">
          <img src={brandLogo} alt="ARM" />
        </Link>
        <Link className="giveaway-back" to="/">
          Вернуться на сайт <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <section className="giveaway-hero" aria-labelledby="giveaway-title">
        <div className="giveaway-hero-copy">
          <p className="giveaway-kicker"><span /> ARM COMMUNITY / GIVEAWAY</p>
          <h1 id="giveaway-title">
            Твой шанс
            <br />
            <em>начинается здесь.</em>
          </h1>
          <p className="giveaway-lead">
            Участвуйте в розыгрыше от ARM и оставайтесь ближе к сообществу,
            которое строит будущее вместе.
          </p>
          <div className="giveaway-actions">
            <a className="giveaway-primary" href="#how-to-join">
              Как участвовать <span aria-hidden="true">↓</span>
            </a>
            <span className="giveaway-note">Условия участия внутри</span>
          </div>
        </div>

        <div className="giveaway-visual" aria-label="Карточка розыгрыша" role="img">
          <div className="giveaway-orbit giveaway-orbit-one" />
          <div className="giveaway-orbit giveaway-orbit-two" />
          <div className="giveaway-ticket">
            <div className="giveaway-ticket-top">
              <span className="giveaway-ticket-label">ARM / 2026</span>
              <span className="giveaway-ticket-mark">✦</span>
            </div>
            <div className="giveaway-ticket-title">Твой<br /><strong>билет</strong><br />в удачу</div>
            <div className="giveaway-ticket-bottom">
              <span>COMMUNITY DRAW</span>
              <span>ARM—01</span>
            </div>
          </div>
          <span className="giveaway-spark giveaway-spark-one">✦</span>
          <span className="giveaway-spark giveaway-spark-two">+</span>
          <span className="giveaway-spark giveaway-spark-three">✦</span>
        </div>
      </section>

      <section className="giveaway-strip" aria-label="Преимущества участия">
        <div><strong>01</strong><span>Просто</span></div>
        <div><strong>02</strong><span>Прозрачно</span></div>
        <div><strong>03</strong><span>Для сообщества ARM</span></div>
      </section>

      <section className="giveaway-steps" id="how-to-join" aria-labelledby="how-to-join-title">
        <div className="giveaway-section-heading">
          <p className="giveaway-kicker"><span /> THE FORMULA</p>
          <h2 id="how-to-join-title">Три шага до участия</h2>
          <p>Никаких сложных форм и мелкого шрифта. Только понятные действия.</p>
        </div>
        <div className="giveaway-step-grid">
          {steps.map((step) => (
            <article className="giveaway-step-card" key={step.number}>
              <span className="giveaway-step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <span className="giveaway-card-arrow" aria-hidden="true">↘</span>
            </article>
          ))}
        </div>
      </section>

      <section className="giveaway-rules">
        <div>
          <p className="giveaway-kicker"><span /> IMPORTANT</p>
          <h2>Условия и результат — открыто.</h2>
        </div>
        <p>
          Финальные условия, сроки и информация о призе будут опубликованы
          здесь до старта розыгрыша. Следите за обновлениями ARM, чтобы ничего
          не пропустить.
        </p>
      </section>

      <footer className="giveaway-footer">
        <span>ARM / AI ROBO MAKERS</span>
        <Link to="/">На главную <span aria-hidden="true">↗</span></Link>
      </footer>
    </main>
  );
}
