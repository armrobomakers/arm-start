import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import brandLogo from "../assets/brand/logo.svg";
import "../styles/giveaway-terms.css";

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatParticipantName(value) {
  const cleanName = String(value || "").replace(/\s*\(\d+\)\s*$/, "").trim();
  return cleanName.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
}

function couponWord(value) {
  const number = Math.abs(Number(value)) % 100;
  const lastDigit = number % 10;
  if (number > 10 && number < 20) return "купонов";
  if (lastDigit === 1) return "купон";
  if (lastDigit >= 2 && lastDigit <= 4) return "купона";
  return "купонов";
}

export function GiveawayPage() {
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/leaderboard/current", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("leaderboard_unavailable");
        return response.json();
      })
      .then((payload) => setState({ status: "ready", data: payload.data }))
      .catch((error) => {
        if (error.name !== "AbortError") setState({ status: "empty", data: null });
      });
    return () => controller.abort();
  }, []);

  const data = state.data;
  const rows = data?.rows || [];
  const podium = rows.slice(0, 3);
  const periodStart = data?.periodStart
    ? data.periodStart.slice(0, 10).split("-").reverse().join(".")
    : "—";

  return (
    <main className="giveaway-page">
      <header className="giveaway-header">
        <Link className="giveaway-brand" to="/" aria-label="На главную ARM">
          <img src={brandLogo} alt="ARM" />
        </Link>
        <Link className="giveaway-back" to="/">
          Вернуться на сайт <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <section className="leaderboard-hero" aria-labelledby="giveaway-title">
        <div>
          <p className="giveaway-kicker"><span /> СООБЩЕСТВО ARM / КУПОНЫ</p>
          <h1 id="giveaway-title"><span>Топ по</span> <em>купонам.</em></h1>
          <p className="leaderboard-lead">Рейтинг участников розыгрыша. Данные обновляются 1 раз в сутки.</p>
        </div>

        <div className="leaderboard-dashboard" aria-label="Сводка рейтинга">
          <div className="dashboard-heading"><span>АКТУАЛЬНЫЕ ДАННЫЕ</span><i aria-hidden="true" /></div>
          <div className="leaderboard-meta">
            <span>Участников</span>
            <strong>{data ? formatNumber(data.participants) : "—"}</strong>
            <small>{data ? `Обновлено ${formatDate(data.updatedAt)}` : "Загрузка данных"}</small>
          </div>
          <div className="dashboard-metrics">
            <div><span>Купоны</span><strong>{data ? formatNumber(data.totalCoupons) : "—"}</strong></div>
            <div><span>Период</span><strong>{data ? `с ${periodStart}` : "—"}</strong></div>
            <div>
              <span>Правило</span>
              <strong>{data ? <>{formatNumber(data.couponStepAmount)} {data.currency}<br />= 1 купон</> : "—"}</strong>
            </div>
          </div>
        </div>
      </section>

      {state.status === "loading" ? <div className="leaderboard-state">Загружаем рейтинг…</div> : null}
      {state.status === "empty" ? (
        <div className="leaderboard-state">
          <strong>Рейтинг пока недоступен.</strong>
          <span>Данные появятся после ближайшего ежедневного обновления.</span>
        </div>
      ) : null}

      {data ? (
        <section className="leaderboard-content" aria-label="Рейтинг участников">
          {podium.length > 0 ? (
            <div className="leaderboard-podium">
              {podium.map((row, index) => (
                <article className={`podium-card podium-${index + 1}`} key={`${row.name}-${row.rank}`}>
                  <span className="podium-rank">{String(row.rank).padStart(2, "0")}</span>
                  <h2>{formatParticipantName(row.name)}</h2>
                  <strong>{formatNumber(row.coupons)} <small>{couponWord(row.coupons)}</small></strong>
                </article>
              ))}
            </div>
          ) : null}

          <div className="leaderboard-table-wrap">
            <div className="leaderboard-table-head"><span>Место</span><span>Участник</span><span>Купоны</span></div>
            {rows.map((row) => (
              <div className="leaderboard-row" key={`${row.name}-${row.rank}`}>
                <span className="row-rank">{String(row.rank).padStart(2, "0")}</span>
                <strong className="participant-name">{formatParticipantName(row.name)}</strong>
                <span className="row-coupons">{formatNumber(row.coupons)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="giveaway-terms" aria-labelledby="giveaway-terms-title">
        <div className="terms-heading">
          <p className="giveaway-kicker"><span /> УСЛОВИЯ РОЗЫГРЫША</p>
          <h2 id="giveaway-terms-title">Как участвовать <em>и что можно выиграть.</em></h2>
          <p>Купоны начисляются за личные продажи подписок VIP и PREMIUM. Чем больше личных продаж, тем больше купонов участвует в финальном розыгрыше.</p>
        </div>

        <div className="terms-grid">
          <article className="term-card">
            <span className="term-number">01</span>
            <h3>Кто участвует</h3>
            <p>В программе учитываются только личные продажи подписок <strong>VIP</strong> и <strong>PREMIUM</strong>.</p>
          </article>

          <article className="term-card term-card-accent">
            <span className="term-number">02</span>
            <h3>Как начисляются купоны</h3>
            <p><strong>500 USD личных продаж = 1 купон.</strong> VIP стоимостью 500 USD дает 1 купон, PREMIUM стоимостью 2 500 USD — 5 купонов.</p>
          </article>

          <article className="term-card">
            <span className="term-number">03</span>
            <h3>Когда состоится финал</h3>
            <p>Накопление купонов началось <strong>4 февраля</strong>. Розыгрыш активируется при накоплении <strong>600 купонов</strong> — это 300 000 USD оборота.</p>
          </article>

          <article className="term-card">
            <span className="term-number">04</span>
            <h3>Как определят победителей</h3>
            <p>Победители определяются <strong>в прямом эфире</strong>. Купоны автоматически учитываются в Telegram-боте.</p>
          </article>
        </div>

        <div className="prizes-panel">
          <article className="main-prize-card">
            <span>Главный приз</span>
            <h3>Автомобиль</h3>
            <p>Главный приз — автомобиль в эквиваленте 35 000 USD.</p>
            <strong>Эквивалент — 35 000 USD</strong>
          </article>

          <article className="extra-prizes-card">
            <span>Дополнительные призы</span>
            <ul>
              <li><strong>1</strong><span>MacBook Pro</span></li>
              <li><strong>2</strong><span>iPhone 17 Pro Max</span></li>
              <li><strong>3</strong><span>AirPods 3 Pro</span></li>
            </ul>
          </article>
        </div>
      </section>

      <footer className="giveaway-footer">
        <span>ARM</span>
        <Link to="/">На главную <span aria-hidden="true">↗</span></Link>
      </footer>
    </main>
  );
}
