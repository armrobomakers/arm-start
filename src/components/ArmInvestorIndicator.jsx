import { useEffect, useState } from "react";
import { ARM_INDICATOR_TICKS, ARM_INDICATOR_ZONE_META, clamp } from "../lib/armIndicatorCore.js";
import brandLogo from "../assets/brand/logo.svg";

const CURRENT_ENDPOINT = "/api/arm-indicator/current";
const GAUGE_CENTER = { x: 180, y: 166 };
const GAUGE_RADIUS = 126;
const NEEDLE_LENGTH = 98;
const GAUGE_SEGMENTS = [
  { from: -100, to: -60, color: "#215d31", zone: "strong_buy" },
  { from: -60, to: -20, color: "#4caf50", zone: "buy" },
  { from: -20, to: 20, color: "#a7b0bd", zone: "neutral" },
  { from: 20, to: 60, color: "#f59e0b", zone: "profit" },
  { from: 60, to: 100, color: "#dc2626", zone: "strong_profit" },
];

const LEGEND = [
  { zone: "strong_buy", label: "Сильная покупка", description: "Хорошая зона для увеличения капитала" },
  { zone: "buy", label: "Покупка", description: "Можно рассмотреть пополнение" },
  { zone: "neutral", label: "Нейтрально", description: "Ждать и наблюдать" },
  { zone: "profit", label: "Профит", description: "Можно частично зафиксировать прибыль" },
  { zone: "strong_profit", label: "Сильный профит", description: "Хорошая зона для фиксации прибыли" },
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
  return (clamp(score, -100, 100) / 100) * 90;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU").format(date);
}

function useArmIndicatorData() {
  const [state, setState] = useState({ status: "loading", current: null, error: "" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(CURRENT_ENDPOINT, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error("Индикатор временно недоступен");
        }
        if (!controller.signal.aborted) {
          setState({ status: "ready", current: body, error: "" });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "error", current: null, error: error.message || "Индикатор временно недоступен" });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return state;
}

function Gauge({ snapshot }) {
  const score = Number(snapshot?.score) || 0;
  const needleAngle = scoreToAngle(score);

  return (
    <div className="arm-indicator-gauge-wrap">
      <svg className="arm-indicator-gauge-svg" viewBox="0 0 360 245" role="img" aria-label={`Оценка ARM ${score}`}>
        <path
          className="arm-indicator-gauge-track"
          d={describeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, -90, 90)}
        />
        {GAUGE_SEGMENTS.map((segment) => (
          <path
            className="arm-indicator-gauge-segment"
            d={describeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, scoreToAngle(segment.from), scoreToAngle(segment.to))}
            stroke={segment.color}
            key={segment.zone}
          />
        ))}
        {ARM_INDICATOR_TICKS.map((tick) => {
          const angle = scoreToAngle(tick);
          const outer = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + 17, angle);
          const label = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + 34, angle);
          return (
            <g key={tick} className="arm-indicator-tick-group">
              <line x1={outer.x} y1={outer.y} x2={label.x} y2={label.y} className="arm-indicator-tick" />
              <text x={label.x} y={label.y} className="arm-indicator-tick-label">
                {tick > 0 ? `+${tick}` : tick}
              </text>
            </g>
          );
        })}
        <g className="arm-indicator-needle" transform={`rotate(${needleAngle} ${GAUGE_CENTER.x} ${GAUGE_CENTER.y})`}>
          <line
            x1={GAUGE_CENTER.x}
            y1={GAUGE_CENTER.y}
            x2={GAUGE_CENTER.x}
            y2={GAUGE_CENTER.y - NEEDLE_LENGTH}
            className="arm-indicator-needle-line"
          />
          <circle cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="10" className="arm-indicator-needle-hub" />
        </g>
        <circle cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="57" className="arm-indicator-center-ring" />
        <text x={GAUGE_CENTER.x} y={GAUGE_CENTER.y - 4} className="arm-indicator-score">
          {score > 0 ? `+${score}` : score}
        </text>
        <text x={GAUGE_CENTER.x} y={GAUGE_CENTER.y + 22} className="arm-indicator-score-caption">
          ОЦЕНКА ARM
        </text>
      </svg>
      <div className="arm-indicator-status">
        <strong>{snapshot?.zoneLabel || ARM_INDICATOR_ZONE_META.neutral.label}</strong>
        <span>{snapshot?.recommendation || ARM_INDICATOR_ZONE_META.neutral.recommendation}</span>
      </div>
    </div>
  );
}

export function ArmInvestorIndicator() {
  const state = useArmIndicatorData();
  const snapshot = state.current;

  return (
    <section className="arm-indicator card" id="arm-investor-indicator">
      <header className="arm-indicator-header">
        <div>
          <h2>ARM ИНДИКАТОР ИНВЕСТОРА</h2>
          <p>На основе реальных данных торговой системы ARM</p>
        </div>
        <img className="arm-indicator-logo" src={brandLogo} alt="ARM AI Robo Makers" />
      </header>

      {state.status === "loading" ? <div className="arm-indicator-loading" aria-label="Загрузка индикатора" /> : null}
      {state.status === "error" ? <div className="arm-indicator-error" role="alert">{state.error}</div> : null}

      {snapshot ? (
        <div className="arm-indicator-layout">
          <Gauge snapshot={snapshot} />
          <aside className="arm-indicator-legend" aria-label="Пояснение зон">
            <h3>КАК ЧИТАТЬ ШКАЛУ</h3>
            {LEGEND.map((item) => {
              const segment = GAUGE_SEGMENTS.find((candidate) => candidate.zone === item.zone);
              return (
                <div className="arm-indicator-legend-row" key={item.zone}>
                  <span className="arm-indicator-legend-dot" style={{ backgroundColor: segment.color }} />
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </div>
                </div>
              );
            })}
          </aside>
        </div>
      ) : null}

      {snapshot ? (
        <footer className="arm-indicator-footer">
          <span>Обновлено: {formatDate(snapshot.dataAsOf)}</span>
          {snapshot.stale ? <small>Последние доступные данные</small> : null}
          <p>Индикатор является информационным ориентиром на основе статистики торговой системы ARM и не гарантирует будущую доходность.</p>
        </footer>
      ) : null}
    </section>
  );
}
