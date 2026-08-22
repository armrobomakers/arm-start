import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GIVEAWAY_CONFIG } from "../../shared/giveawayConfig.js";
import brandLogo from "../assets/brand/logo.svg";
import "../styles/giveaway-terms.css";
import "../styles/giveaway-metrics-fix.css";
import "../styles/giveaway-stage2.css";

const METRIKA_ID = 110091324;

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value || 0));
}

function formatDate(value, timeZone = GIVEAWAY_CONFIG.timezone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatPeriodStart(value) {
  const text = String(value || "").slice(0, 10);
  const [year, month, day] = text.split("-");
  if (!year || !month || !day) return "—";
  return `${day}.${month}.${year}`;
}

function formatPeriodStartLong(value) {
  const text = String(value || "").slice(0, 10);
  const date = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function couponWord(value) {
  const number = Math.abs(Number(value)) % 100;
  const lastDigit = number % 10;
  if (number > 10 && number < 20) return "купонов";
  if (lastDigit === 1) return "купон";
  if (lastDigit >= 2 && lastDigit <= 4) return "купона";
  return "купонов";
}

function reachGoal(goal, params) {
  if (typeof window === "undefined" || typeof window.ym !== "function") return;
  window.ym(METRIKA_ID, "reachGoal", goal, params);
}

function setMeta(selector, value) {
  const node = document.head.querySelector(selector);
  if (node) node.setAttribute("content", value);
}

function applyGiveawayMeta() {
  document.title = "ARM — Розыгрыш среди участников";
  setMeta('meta[name="description"]', "Рейтинг участников розыгрыша ARM, количество купонов, прогресс до финала, условия участия и призы.");
  setMeta('meta[property="og:title"]', "ARM — Розыгрыш среди участников");
  setMeta('meta[property="og:description"]', "Следите за рейтингом участников, количеством купонов, прогрессом до финала и призами ARM.");
  setMeta('meta[property="og:image"]', "https://arm-start.vercel.app/giveaway-og.svg");
  setMeta('meta[name="twitter:title"]', "ARM — Розыгрыш среди участников");
  setMeta('meta[name="twitter:description"]', "Рейтинг, купоны, прогресс до финала, условия и призы ARM.");
  setMeta('meta[name="twitter:image"]', "https://arm-start.vercel.app/og-cover-v7.png");
}

function restoreDefaultMeta() {
  document.title = "ARM Start";
  setMeta('meta[name="description"]', "ARM Start: инструкция по подключению инвестора");
  setMeta('meta[property="og:title"]', "ARM Start");
  setMeta('meta[property="og:description"]', "ARM, Tickmill, Depomost и PAMM ARM");
  setMeta('meta[property="og:image"]', "https://arm-start.vercel.app/og-cover.png");
  setMeta('meta[name="twitter:title"]', "ARM Start");
  setMeta('meta[name="twitter:description"]', "ARM, Tickmill, Depomost и PAMM ARM");
  setMeta('meta[name="twitter:image"]', "https://arm-start.vercel.app/og-cover.png");
}

export function GiveawayPage() {
  const [state, setState] = useState({ status: "loading", data: null });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchState, setSearchState] = useState({ status: "idle", matches: [] });

  useEffect(() => {
    applyGiveawayMeta();
    reachGoal("giveaway_view");
    return restoreDefaultMeta;
  }, []);

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

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const goals = new Map([
      ["giveaway-terms", "giveaway_terms_view"],
      ["giveaway-prizes", "giveaway_prizes_view"],
    ]);
    const fired = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || fired.has(entry.target.id)) return;
          const goal = goals.get(entry.target.id);
          if (goal) reachGoal(goal);
          fired.add(entry.target.id);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.25 },
    );
    goals.forEach((_, id) => {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [state.status]);

  const data = state.data;
  const rows = data?.rows || [];
  const leaders = rows.filter((row) => row.rank <= 3);
  const periodStart = formatPeriodStart(data?.periodStart);
  const periodStartLong = formatPeriodStartLong(data?.periodStart);
  const progress = Math.min(100, Math.max(0, Number(data?.progressPercent || 0)));
  const currency = data?.currency || "USD";
  const rules = data?.rules || {
    eligiblePlans: GIVEAWAY_CONFIG.eligiblePlans,
    planPricesUsd: GIVEAWAY_CONFIG.planPricesUsd,
    planCoupons: GIVEAWAY_CONFIG.planCoupons,
  };
  const prizes = data?.prizes || {
    main: GIVEAWAY_CONFIG.mainPrize,
    extra: GIVEAWAY_CONFIG.extraPrizes,
  };
  const ctaPath = data?.ctaPath || GIVEAWAY_CONFIG.ctaPath;

  const matchedKeys = useMemo(
    () => new Set((searchState.matches || []).map((row) => `${row.rank}|${row.name}|${row.coupons}`)),
    [searchState.matches],
  );

  async function handleSearch(event) {
    event.preventDefault();
    const query = searchQuery.trim();
    const isIdentifier = /^\d+$/.test(query);
    if ((!isIdentifier && query.length < 2) || (isIdentifier && query.length < 6)) {
      setSearchState({ status: "short", matches: [] });
      return;
    }

    setSearchState({ status: "loading", matches: [] });
    reachGoal("giveaway_find_self", { queryType: isIdentifier ? "identifier" : "name" });
    try {
      const response = await fetch(`/api/leaderboard/find?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("lookup_failed");
      const payload = await response.json();
      setSearchState({ status: "ready", matches: payload.matches || [] });
    } catch {
      setSearchState({ status: "error", matches: [] });
    }
  }

  function handleAnchor(section) {
    reachGoal("giveaway_nav", { section });
  }

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
            <small>
              {data
                ? `Обновлено ${formatDate(data.updatedAt, data.timezone || GIVEAWAY_CONFIG.timezone)} (${data.timezoneLabel || GIVEAWAY_CONFIG.timezoneLabel})`
                : "Загрузка данных"}
            </small>
          </div>
          <div className="dashboard-metrics">
            <div><span>Купоны</span><strong>{data ? formatNumber(data.totalCoupons) : "—"}</strong></div>
            <div><span>Период</span><strong>{data ? `с ${periodStart}` : "—"}</strong></div>
            <div>
              <span>Правило</span>
              <strong>{data ? <>{formatNumber(data.couponStepAmount)} {currency}<br />= 1 купон</> : "—"}</strong>
            </div>
          </div>

          <div className="giveaway-progress" aria-label="Прогресс до финального розыгрыша">
            <div className="giveaway-progress-head">
              <span>Прогресс до финала</span>
              <strong>{data ? `${formatNumber(data.totalCoupons)} / ${formatNumber(data.targetCoupons)}` : "—"}</strong>
            </div>
            <div className="giveaway-progress-track" aria-hidden="true">
              <i style={{ width: `${progress}%` }} />
            </div>
            <div className="giveaway-progress-foot">
              <span>{data ? `${progress.toLocaleString("ru-RU")}% пути` : "—"}</span>
              <strong>{data ? `Осталось ${formatNumber(data.remainingCoupons)} ${couponWord(data.remainingCoupons)}` : "—"}</strong>
            </div>
          </div>
        </div>
      </section>

      <nav className="giveaway-anchor-nav" aria-label="Навигация по странице розыгрыша">
        <a href="#giveaway-rating" onClick={() => handleAnchor("rating")}>Рейтинг</a>
        <a href="#giveaway-terms" onClick={() => handleAnchor("terms")}>Условия</a>
        <a href="#giveaway-prizes" onClick={() => handleAnchor("prizes")}>Призы</a>
      </nav>

      {state.status === "loading" ? <div className="leaderboard-state">Загружаем рейтинг…</div> : null}
      {state.status === "empty" ? (
        <div className="leaderboard-state">
          <strong>Рейтинг пока недоступен.</strong>
          <span>Данные появятся после ближайшего ежедневного обновления.</span>
        </div>
      ) : null}

      {data ? (
        <section id="giveaway-rating" className="leaderboard-content giveaway-rating-section" aria-labelledby="leaders-title">
          <div className="leaders-heading">
            <div>
              <p className="giveaway-kicker"><span /> РЕЙТИНГ УЧАСТНИКОВ</p>
              <h2 id="leaders-title">Лидеры по количеству купонов</h2>
            </div>
            <p>Позиция отражает только количество купонов и не является результатом розыгрыша. При одинаковом количестве купонов участники занимают одинаковое место.</p>
          </div>

          {leaders.length > 0 ? (
            <div className={`leaderboard-podium leaders-count-${leaders.length}`}>
              {leaders.map((row) => (
                <article className={`podium-card podium-${Math.min(row.rank, 3)}`} key={`${row.name}-${row.rank}-${row.coupons}`}>
                  <span className="podium-rank">{String(row.rank).padStart(2, "0")}</span>
                  <h3>{row.name}</h3>
                  <strong>{formatNumber(row.coupons)} <small>{couponWord(row.coupons)}</small></strong>
                </article>
              ))}
            </div>
          ) : null}

          <form className="participant-search" onSubmit={handleSearch} role="search">
            <div>
              <label htmlFor="participant-search-input">Найти себя в рейтинге</label>
              <p>Введите имя, фамилию или свой внутренний идентификатор. Идентификатор используется только для поиска и нигде не публикуется.</p>
            </div>
            <div className="participant-search-controls">
              <input
                id="participant-search-input"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Например: Евгений или 9997166787"
                autoComplete="off"
              />
              <button type="submit">Найти</button>
            </div>
          </form>

          <div className="participant-search-result" aria-live="polite">
            {searchState.status === "loading" ? <span>Ищем участника…</span> : null}
            {searchState.status === "short" ? <span>Введите минимум 2 буквы имени или минимум 6 цифр идентификатора.</span> : null}
            {searchState.status === "error" ? <span>Не удалось выполнить поиск. Попробуйте ещё раз.</span> : null}
            {searchState.status === "ready" && searchState.matches.length === 0 ? <span>Совпадений не найдено.</span> : null}
            {searchState.status === "ready" && searchState.matches.length > 0 ? (
              <div className="participant-search-matches">
                {searchState.matches.map((row) => (
                  <article key={`${row.rank}-${row.name}-${row.coupons}`}>
                    <span>Место {row.rank}</span>
                    <strong>{row.name}</strong>
                    <b>{formatNumber(row.coupons)} {couponWord(row.coupons)}</b>
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          <div className="leaderboard-table-wrap">
            <table className="leaderboard-table">
              <caption className="sr-only">Полный рейтинг участников розыгрыша ARM</caption>
              <thead>
                <tr>
                  <th scope="col">Место</th>
                  <th scope="col">Участник</th>
                  <th scope="col">Купоны</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const matchKey = `${row.rank}|${row.name}|${row.coupons}`;
                  return (
                    <tr className={matchedKeys.has(matchKey) ? "is-search-match" : ""} key={`${row.rank}-${row.name}-${row.coupons}`}>
                      <td className="row-rank">{String(row.rank).padStart(2, "0")}</td>
                      <th scope="row" className="participant-name">{row.name}</th>
                      <td className="row-coupons">{formatNumber(row.coupons)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section id="giveaway-terms" className="giveaway-terms" aria-labelledby="giveaway-terms-title">
        <div className="terms-heading">
          <p className="giveaway-kicker"><span /> УСЛОВИЯ РОЗЫГРЫША</p>
          <h2 id="giveaway-terms-title">Как участвовать <em>и что можно выиграть.</em></h2>
          <p>Купоны начисляются за личные продажи подписок VIP и PREMIUM. Чем больше личных продаж, тем больше купонов участвует в финальном розыгрыше.</p>
        </div>

        <div className="terms-grid">
          <article className="term-card">
            <span className="term-number">01</span>
            <h3>Кто участвует</h3>
            <p>В программе учитываются только личные продажи подписок <strong>{rules.eligiblePlans.join(" и ")}</strong>.</p>
          </article>

          <article className="term-card term-card-accent">
            <span className="term-number">02</span>
            <h3>Как начисляются купоны</h3>
            <p>
              <strong>{data ? `${formatNumber(data.couponStepAmount)} ${currency} личных продаж = 1 купон.` : "Данные о шаге начисления загружаются."}</strong>{" "}
              VIP стоимостью {formatNumber(rules.planPricesUsd.VIP)} USD дает {rules.planCoupons.VIP} купон, PREMIUM стоимостью {formatNumber(rules.planPricesUsd.PREMIUM)} USD — {rules.planCoupons.PREMIUM} купонов.
            </p>
          </article>

          <article className="term-card">
            <span className="term-number">03</span>
            <h3>Когда состоится финал</h3>
            <p>Накопление купонов началось <strong>{periodStartLong}</strong>. Розыгрыш активируется при накоплении <strong>{data ? `${formatNumber(data.targetCoupons)} купонов` : `${formatNumber(GIVEAWAY_CONFIG.targetCoupons)} купонов`}</strong>{data ? ` — это ${formatNumber(data.targetTurnover)} ${currency} оборота.` : "."}</p>
          </article>

          <article className="term-card">
            <span className="term-number">04</span>
            <h3>Как определят победителей</h3>
            <p>Победители определяются <strong>в прямом эфире</strong>. Купоны автоматически учитываются в Telegram-боте.</p>
          </article>
        </div>

        <div id="giveaway-prizes" className="prizes-panel">
          <article className="main-prize-card">
            <span>Главный приз</span>
            <h3>{prizes.main.label}</h3>
            <strong>В эквиваленте — {formatNumber(prizes.main.valueUsd)} USD</strong>
          </article>

          <article className="extra-prizes-card">
            <span>Дополнительные призы</span>
            <ul>
              {prizes.extra.map((prize) => (
                <li key={prize.label}><strong>{prize.quantity}</strong><span>{prize.label}</span></li>
              ))}
            </ul>
          </article>
        </div>

        <aside className="giveaway-cta" aria-label="Как получить купоны">
          <div>
            <span>Хотите участвовать?</span>
            <h3>Получайте купоны за личные продажи VIP и PREMIUM.</h3>
            <p>Перейдите к информации о подписках ARM и условиям их подключения.</p>
          </div>
          <Link to={ctaPath} onClick={() => reachGoal("giveaway_cta_click")}>
            Узнать о VIP и PREMIUM <span aria-hidden="true">↗</span>
          </Link>
        </aside>
      </section>

      <footer className="giveaway-footer">
        <span>ARM</span>
        <Link to="/">На главную <span aria-hidden="true">↗</span></Link>
      </footer>
    </main>
  );
}
