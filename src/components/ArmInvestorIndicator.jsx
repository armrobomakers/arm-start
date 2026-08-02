import { useEffect, useState } from "react";
import { ARM_INDICATOR_TICKS, scoreToNeedleTransform } from "../lib/armIndicatorCore.js";

const CURRENT_ENDPOINT = "/api/arm-indicator/current";
const GAUGE_CENTER = { x: 180, y: 132 };
const GAUGE_RADIUS = 94;
const NEEDLE_LENGTH = 96;
const GAUGE_SEGMENTS = [
  { from: -99, to: -61, color: "#225f35", zone: "strong_buy" },
  { from: -59, to: -21, color: "#4caf50", zone: "buy" },
  { from: -19, to: 19, color: "#a7b0bd", zone: "neutral" },
  { from: 21, to: 59, color: "#e5a323", zone: "profit" },
  { from: 61, to: 99, color: "#cc4b3e", zone: "strong_profit" },
];

export const ARM_INDICATOR_LEGEND = [
  { zone: "strong_buy", label: "Сильная зона пополнения", description: "Хорошая точка для увеличения капитала" },
  { zone: "buy", label: "Зона пополнения", description: "Можно рассмотреть увеличение капитала" },
  { zone: "neutral", label: "Нейтральная зона", description: "Ждать / ничего не делать" },
  { zone: "profit", label: "Зона фиксации прибыли", description: "Можно зафиксировать часть прибыли" },
  { zone: "strong_profit", label: "Сильная зона фиксации прибыли", description: "Хорошая точка для фиксации прибыли" },
];

function polarToCartesian(centerX, centerY, radius, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: centerX + radius * Math.cos(angleRad), y: centerY + radius * Math.sin(angleRad) };
}

function describeArc(centerX, centerY, radius, startAngle, endAngle) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
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
        const response = await fetch(CURRENT_ENDPOINT, { signal: controller.signal, headers: { Accept: "application/json" } });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          if (body?.status === "unavailable") {
            setState({ status: "unavailable", current: null, error: body.message || "Индикатор пока недоступен" });
            return;
          }
          throw new Error("Индикатор временно недоступен");
        }
        if (!controller.signal.aborted) setState({ status: "ready", current: body, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: "error", current: null, error: error.message || "Индикатор временно недоступен" });
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return state;
}

function Gauge({ snapshot }) {
  const score = Number(snapshot?.score) || 0;
  const currentZone = ARM_INDICATOR_LEGEND.find((item) => item.zone === snapshot?.zone) || ARM_INDICATOR_LEGEND[2];

  return (
    <div className="arm-indicator-gauge-wrap">
      <svg className="arm-indicator-gauge-svg" viewBox="0 0 360 220" role="img" aria-label={`Шкала оценки ARM, значение ${score}`}>
        <path className="arm-indicator-gauge-track" d={describeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, -90, 90)} />
        {GAUGE_SEGMENTS.map((segment) => (
          <path className="arm-indicator-gauge-segment" d={describeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, segment.from * 0.9, segment.to * 0.9)} stroke={segment.color} key={segment.zone} />
        ))}
        {ARM_INDICATOR_TICKS.map((tick) => {
          const angle = tick * 0.9;
          const outer = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + 12, angle);
          const label = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + 26, angle);
          return (
            <g key={tick} className="arm-indicator-tick-group">
              <line x1={outer.x} y1={outer.y} x2={label.x} y2={label.y} className="arm-indicator-tick" />
              <text x={label.x} y={label.y} className="arm-indicator-tick-label">{tick > 0 ? `+${tick}` : tick}</text>
            </g>
          );
        })}
        <g className="arm-indicator-needle" transform={scoreToNeedleTransform(score, GAUGE_CENTER.x, GAUGE_CENTER.y)}>
          <line x1={GAUGE_CENTER.x} y1={GAUGE_CENTER.y} x2={GAUGE_CENTER.x} y2={GAUGE_CENTER.y - NEEDLE_LENGTH} className="arm-indicator-needle-line" />
          <polygon points={`${GAUGE_CENTER.x - 5},${GAUGE_CENTER.y - NEEDLE_LENGTH + 11} ${GAUGE_CENTER.x},${GAUGE_CENTER.y - NEEDLE_LENGTH} ${GAUGE_CENTER.x + 5},${GAUGE_CENTER.y - NEEDLE_LENGTH + 11}`} className="arm-indicator-needle-tip" />
        </g>
        <circle cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="8" className="arm-indicator-needle-hub" />
      </svg>
      <div className="arm-score-block" aria-label={`Оценка ARM: ${score}`}>
        <div className="arm-score-value">{score > 0 ? `+${score}` : score < 0 ? `−${Math.abs(score)}` : "0"}</div>
        <div className="arm-score-label">ОЦЕНКА ARM</div>
      </div>
      <span className="sr-only">Текущая зона: {currentZone.label}</span>
    </div>
  );
}

function CurrentSignal({ snapshot }) {
  const currentZone = ARM_INDICATOR_LEGEND.find((item) => item.zone === snapshot?.zone) || ARM_INDICATOR_LEGEND[2];

  return (
    <div className="arm-indicator-signal">
      <p className="arm-indicator-section-label">ТЕКУЩИЙ СИГНАЛ</p>
      <h2 className="arm-indicator-signal-title">{currentZone.label}</h2>
      <p className="arm-indicator-recommendation">{currentZone.description}</p>
      <div className="arm-indicator-legend" aria-label="Как читать шкалу">
        <p className="arm-indicator-section-label">КАК ЧИТАТЬ ШКАЛУ</p>
        {ARM_INDICATOR_LEGEND.map((item, index) => {
          const segment = GAUGE_SEGMENTS[index];
          const isActive = snapshot?.zone === item.zone;
          return (
            <div className={`arm-indicator-legend-row${isActive ? " is-active" : ""}`} key={item.zone}>
              <span className="arm-indicator-legend-dot" style={{ backgroundColor: segment.color }} />
              <div><strong>{item.label}</strong><span>{item.description}</span></div>
              {isActive ? <em>Текущая</em> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ArmInvestorIndicator() {
  const state = useArmIndicatorData();
  const snapshot = state.current;

  return (
    <section className="arm-indicator-card" id="arm-investor-indicator" aria-labelledby="arm-indicator-title">
      {state.status === "loading" ? <div className="arm-indicator-loading" role="status" aria-label="Загрузка индикатора" /> : null}
      {state.status === "unavailable" ? <div className="arm-indicator-empty" role="status"><strong>Данные индикатора пока недоступны</strong><span>{state.error}</span></div> : null}
      {state.status === "error" ? <div className="arm-indicator-error" role="alert">{state.error}</div> : null}
      {snapshot ? (
        <>
          <div className="arm-indicator-main-grid">
            <div className="arm-indicator-gauge-column"><Gauge snapshot={snapshot} /></div>
            <CurrentSignal snapshot={snapshot} />
          </div>
          <footer className="arm-indicator-footer">
            <span>Данные по состоянию на: {formatDate(snapshot.dataAsOf)}</span>
            {snapshot.stale ? <small className="arm-indicator-stale">Данные временно не обновляются</small> : null}
            <p>Индикатор является информационным ориентиром на основе статистики торговой системы ARM и не гарантирует будущую доходность.</p>
          </footer>
        </>
      ) : null}
    </section>
  );
}
