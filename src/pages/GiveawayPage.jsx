import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import brandLogo from "../assets/brand/logo.svg";

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

      <footer className="giveaway-footer">
        <span>ARM</span>
        <Link to="/">На главную <span aria-hidden="true">↗</span></Link>
      </footer>
    </main>
  );
}
