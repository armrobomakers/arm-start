import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import brandLogo from "../assets/brand/logo.svg";

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function GiveawayPage() {
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/leaderboard/current", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("leaderboard_unavailable"); return response.json(); })
      .then((payload) => setState({ status: "ready", data: payload.data }))
      .catch((error) => { if (error.name !== "AbortError") setState({ status: "empty", data: null }); });
    return () => controller.abort();
  }, []);

  const data = state.data;
  const rows = data?.rows || [];
  const podium = rows.slice(0, 3);

  return (
    <main className="giveaway-page">
      <header className="giveaway-header">
        <Link className="giveaway-brand" to="/" aria-label="На главную ARM"><img src={brandLogo} alt="ARM" /></Link>
        <Link className="giveaway-back" to="/">Вернуться на сайт <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="leaderboard-hero" aria-labelledby="giveaway-title">
        <div>
          <p className="giveaway-kicker"><span /> ARM COMMUNITY / COUPONS</p>
          <h1 id="giveaway-title"><span>Топ по</span> <em>купонам.</em></h1>
          <p className="leaderboard-lead">Рейтинг участников розыгрыша. Данные обновляются один раз в день после утреннего отчёта.</p>
        </div>
        <div className="leaderboard-dashboard" aria-label="Сводка рейтинга">
          <div className="dashboard-heading"><span>LIVE SNAPSHOT</span><i aria-hidden="true" /></div>
          <div className="leaderboard-meta"><span>Сейчас в рейтинге</span><strong>{data ? formatNumber(data.participants) : "—"}</strong><small>{data ? `Обновлено ${formatDate(data.updatedAt)}` : "Загрузка данных"}</small></div>
          <div className="dashboard-metrics">
            <div><span>Купоны</span><strong>{data ? formatNumber(data.totalCoupons) : "—"}</strong></div>
            <div><span>Период с</span><strong>{data ? data.periodStart.slice(0, 10).split("-").reverse().join(".") : "—"}</strong></div>
            <div><span>Правило</span><strong>{data ? `${formatNumber(data.couponStepAmount)} ${data.currency}` : "—"}</strong></div>
          </div>
        </div>
      </section>

      {state.status === "loading" ? <div className="leaderboard-state">Загружаем рейтинг…</div> : null}
      {state.status === "empty" ? <div className="leaderboard-state"><strong>Рейтинг пока недоступен.</strong><span>Данные появятся после ближайшего ежедневного обновления.</span></div> : null}

      {data ? (
        <section className="leaderboard-content" aria-label="Рейтинг участников">
          {podium.length > 0 ? <div className="leaderboard-podium">{podium.map((row, index) => <article className={`podium-card podium-${index + 1}`} key={`${row.name}-${row.rank}`}><span className="podium-rank">{String(index + 1).padStart(2, "0")}</span><h2>{row.name}</h2><strong>{formatNumber(row.coupons)} <small>купонов</small></strong></article>)}</div> : null}
          <div className="leaderboard-table-wrap">
            <div className="leaderboard-table-head"><span>Место</span><span>Участник</span><span>Купоны</span></div>
            {rows.map((row) => <div className="leaderboard-row" key={`${row.name}-${row.rank}`}><span className="row-rank">{String(row.rank).padStart(2, "0")}</span><strong>{row.name}</strong><span className="row-coupons">{formatNumber(row.coupons)}</span></div>)}
          </div>
        </section>
      ) : null}
      <footer className="giveaway-footer"><span>ARM / AI ROBO MAKERS</span><Link to="/">На главную <span aria-hidden="true">↗</span></Link></footer>
    </main>
  );
}
