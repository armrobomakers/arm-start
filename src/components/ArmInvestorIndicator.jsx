import { useEffect, useMemo, useState } from "react";
import { ARM_INDICATOR_TICKS, formatSignedPercent } from "../lib/armIndicatorCore.js";
import brandLogo from "../assets/brand/logo.svg";

const CURRENT_ENDPOINT = "/api/arm-indicator/current";
const HISTORY_ENDPOINT = "/api/arm-indicator/history?days=90";
const GAUGE_CENTER = { x: 160, y: 152 };
const GAUGE_RADIUS = 112;
const NEEDLE_LENGTH = 88;

const GAUGE_SEGMENTS = [
  { from: -100, to: -60, color: "#215d31" },
  { from: -60, to: -20, color: "#3f7a41" },
  { from: -20, to: 0, color: "#7ca25b" },
  { from: 0, to: 20, color: "#9ca3af" },
  { from: 20, to: 60, color: "#d28b45" },
  { from: 60, to: 100, color: "#b45309" },
];

function polarToCartesian(centerX, centerY, radius, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleRad),
    y: centerY + radius * Math.sin(angleRad),
  };
}

function describeArc(centerX, centerY, radius, startAngle, endAngle) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function scoreToAngle(score) {
  const normalized = Math.max(-100, Math.min(100, Number(score) || 0));
  return (normalized / 100) * 90;
}

function formatDateTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(date);
}

function buildSparkline(history) {
  const values = history
    .map((item) => Number(item?.score))
    .filter((value) => Number.isFinite(value));

  if (values.length < 2) {
    return null;
  }

  const width = 320;
  const height = 90;
  const paddingX = 14;
  const paddingY = 10;
  const min = Math.min(...values, -100);
  const max = Math.max(...values, 100);
  const range = Math.max(1, max - min);
  const stepX = (width - paddingX * 2) / (values.length - 1);

  const points = values.map((value, index) => {
    const x = paddingX + index * stepX;
    const y = paddingY + (1 - (value - min) / range) * (height - paddingY * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return points.join(" ");
}

function useArmIndicatorData() {
  const [state, setState] = useState({
    status: "loading",
    current: null,
    history: [],
    error: "",
    isRefreshing: false,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function readJson(url) {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      const text = await response.text();
      let body = null;

      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }

      if (!response.ok) {
        throw new Error(body?.message || body?.error || "Indicator data is not available yet");
      }

      return body;
    }

    async function load() {
      setState((prev) => ({
        ...prev,
        status: prev.current ? "refreshing" : "loading",
        isRefreshing: Boolean(prev.current),
        error: "",
      }));

      try {
        const [currentResult, historyResult] = await Promise.allSettled([
          readJson(CURRENT_ENDPOINT),
          readJson(HISTORY_ENDPOINT),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        if (currentResult.status !== "fulfilled") {
          throw currentResult.reason;
        }

        setState({
          status: "ready",
          current: currentResult.value,
          history: historyResult.status === "fulfilled" && Array.isArray(historyResult.value) ? historyResult.value : [],
          error: "",
          isRefreshing: false,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          current: null,
          history: [],
          error: error instanceof Error ? error.message : "Indicator data is not available yet",
          isRefreshing: false,
        });
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return {
    state,
    refresh: async () => {
      try {
        setState((prev) => ({
          ...prev,
          status: prev.current ? "refreshing" : "loading",
          isRefreshing: true,
          error: "",
        }));

        const [currentResult, historyResult] = await Promise.allSettled([
          fetch(CURRENT_ENDPOINT, { headers: { Accept: "application/json" } }),
          fetch(HISTORY_ENDPOINT, { headers: { Accept: "application/json" } }),
        ]);

        if (currentResult.status !== "fulfilled") {
          throw currentResult.reason;
        }

        const currentResponse = currentResult.value;
        const currentText = await currentResponse.text();
        let currentBody = null;
        try {
          currentBody = currentText ? JSON.parse(currentText) : null;
        } catch {
          currentBody = null;
        }

        if (!currentResponse.ok) {
          throw new Error(currentBody?.message || currentBody?.error || "Indicator data is not available yet");
        }

        let history = [];
        if (historyResult.status === "fulfilled") {
          try {
            const historyResponse = historyResult.value;
            const historyText = await historyResponse.text();
            const historyBody = historyText ? JSON.parse(historyText) : null;
            if (historyResponse.ok && Array.isArray(historyBody)) {
              history = historyBody;
            }
          } catch {
            history = [];
          }
        }

        setState({
          status: "ready",
          current: currentBody,
          history,
          error: "",
          isRefreshing: false,
        });
      } catch (error) {
        setState({
          status: "error",
          current: null,
          history: [],
          error: error instanceof Error ? error.message : "Indicator data is not available yet",
          isRefreshing: false,
        });
      }
    },
  };
}

function Gauge({ snapshot, history }) {
  const angle = scoreToAngle(snapshot?.score);
  const sparkline = useMemo(() => buildSparkline(history), [history]);
  const score = Number(snapshot?.score);
  const scoreText = Number.isFinite(score) ? (score > 0 ? `+${score}` : String(score)) : "—";

  return (
    <div className="arm-indicator-gauge">
      <svg
        viewBox="0 0 320 220"
        className="arm-indicator-gauge-svg"
        role="img"
        aria-label={`Оценка ARM: ${scoreText}. ${snapshot?.zoneLabel || ""} ${snapshot?.recommendation || ""}`.trim()}
      >
        <path d={describeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, -90, 90)} className="arm-indicator-gauge-track" />

        {GAUGE_SEGMENTS.map((segment) => (
          <path
            key={`${segment.from}-${segment.to}`}
            d={describeArc(
              GAUGE_CENTER.x,
              GAUGE_CENTER.y,
              GAUGE_RADIUS,
              (segment.from / 100) * 90,
              (segment.to / 100) * 90,
            )}
            stroke={segment.color}
            className="arm-indicator-gauge-segment"
          />
        ))}

        {ARM_INDICATOR_TICKS.map((tick) => {
          const angleDeg = (tick / 100) * 90;
          const outer = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + 12, angleDeg);
          const inner = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS - 2, angleDeg);
          const labelPoint = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + 28, angleDeg);

          return (
            <g key={tick}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="arm-indicator-tick" />
              <text x={labelPoint.x} y={labelPoint.y} className="arm-indicator-tick-label">
                {tick > 0 ? `+${tick}` : String(tick)}
              </text>
            </g>
          );
        })}

        <g
          className={snapshot?.stale ? "arm-indicator-needle stale" : "arm-indicator-needle"}
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: `${GAUGE_CENTER.x}px ${GAUGE_CENTER.y}px`,
          }}
        >
          <line
            x1={GAUGE_CENTER.x}
            y1={GAUGE_CENTER.y}
            x2={GAUGE_CENTER.x}
            y2={GAUGE_CENTER.y - NEEDLE_LENGTH}
            className="arm-indicator-needle-line"
          />
          <circle cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="11" className="arm-indicator-needle-hub" />
        </g>

        <circle cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="26" className="arm-indicator-center-ring" />
        <text x={GAUGE_CENTER.x} y={GAUGE_CENTER.y - 8} textAnchor="middle" className="arm-indicator-score">
          {scoreText}
        </text>
        <text x={GAUGE_CENTER.x} y={GAUGE_CENTER.y + 18} textAnchor="middle" className="arm-indicator-score-caption">
          ОЦЕНКА ARM
        </text>
      </svg>

      {sparkline ? (
        <div className="arm-indicator-sparkline" aria-hidden="true">
          <svg viewBox="0 0 320 90">
            <polyline points={sparkline} className="arm-indicator-sparkline-line" />
          </svg>
        </div>
      ) : null}
    </div>
  );
}

export function ArmInvestorIndicator() {
  const { state, refresh } = useArmIndicatorData();
  const snapshot = state.current;
  const metrics = snapshot?.metrics || {};
  const updatedAt = formatDateTime(snapshot?.updatedAt);
  const dataAsOf = formatDate(snapshot?.dataAsOf);
  const sourceLabel = snapshot?.source === "myfxbook" ? "Myfxbook API" : snapshot?.source === "fixture" ? "Fixture mode" : "API";

  const metricCards = [
    { label: "Просадка", value: formatSignedPercent(metrics.currentDrawdownPct || 0) },
    { label: "30D", value: formatSignedPercent(metrics.return30dPct || 0) },
    { label: "60D", value: formatSignedPercent(metrics.return60dPct || 0) },
    { label: "90D", value: formatSignedPercent(metrics.return90dPct || 0) },
    { label: "Momentum", value: formatSignedPercent(metrics.momentumPct || 0) },
    { label: "High", value: `${Math.max(0, Math.round(metrics.daysSinceHigh || 0))} дн.` },
  ];

  return (
    <section className="arm-indicator card" id="arm-investor-indicator">
      <div className="arm-indicator-head">
        <div className="arm-indicator-brand">
          <img src={brandLogo} alt="" aria-hidden="true" />
          <div>
            <p className="eyebrow">ARM Investor Indicator</p>
            <h2>На основе реальных данных торговой системы ARM</h2>
            <p className="arm-indicator-lead">
              Индикатор отражает текущее состояние кривой доходности ARM и помогает понять, когда логичнее увеличивать
              капитал, ждать или фиксировать прибыль.
            </p>
          </div>
        </div>

        <div className="arm-indicator-meta">
          <span className={`arm-indicator-badge${snapshot?.stale ? " stale" : ""}`}>
            {snapshot?.stale ? "Последние доступные данные" : "Актуальные данные"}
          </span>
          <span className="arm-indicator-source">{sourceLabel}</span>
          <button
            className="arm-indicator-refresh"
            type="button"
            onClick={() => void refresh()}
            disabled={state.status === "loading" || state.isRefreshing}
          >
            {state.isRefreshing ? "Обновление..." : "Обновить"}
          </button>
        </div>
      </div>

      {state.status === "error" ? (
        <div className="arm-indicator-error" role="alert">
          <strong>Индикатор временно недоступен</strong>
          <p>{state.error || "Попробуйте обновить позже."}</p>
        </div>
      ) : null}

      {state.status === "loading" ? (
        <div className="arm-indicator-placeholder" aria-hidden="true">
          <div className="arm-indicator-placeholder-gauge" />
          <div className="arm-indicator-placeholder-grid">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : null}

      {snapshot ? (
        <>
          <div className="arm-indicator-body">
            <Gauge snapshot={snapshot} history={state.history} />

            <div className="arm-indicator-summary">
              <div className="arm-indicator-zone">
                <span className="arm-indicator-zone-label">{snapshot.zoneLabel}</span>
                <strong>{snapshot.recommendation}</strong>
              </div>

              <div className="arm-indicator-grid">
                {metricCards.map((metric) => (
                  <article className="arm-indicator-metric" key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </article>
                ))}
              </div>

              <div className="arm-indicator-footer">
                <div>
                  <span>Дата данных</span>
                  <strong>{dataAsOf || "—"}</strong>
                </div>
                <div>
                  <span>Обновлено</span>
                  <strong>{updatedAt || "—"}</strong>
                </div>
              </div>
            </div>
          </div>

          {snapshot.warnings?.length ? (
            <div className="arm-indicator-warnings">
              {snapshot.warnings.slice(0, 3).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
