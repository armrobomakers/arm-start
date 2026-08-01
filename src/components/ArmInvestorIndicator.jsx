import { useEffect, useState } from "react";
import { ARM_INDICATOR_TICKS, scoreToAngle } from "../lib/armIndicatorCore.js";
import brandLogo from "../assets/brand/logo.svg";

const CURRENT_ENDPOINT = "/api/arm-indicator/current";
const GAUGE_CENTER = { x: 180, y: 166 };
const GAUGE_RADIUS = 126;
const NEEDLE_LENGTH = 98;
const GAUGE_SEGMENTS = [
  { from: -100, to: -60, color: "#225f35", zone: "strong_buy" },
  { from: -60, to: -20, color: "#4caf50", zone: "buy" },
  { from: -20, to: 20, color: "#a7b0bd", zone: "neutral" },
  { from: 20, to: 60, color: "#e5a323", zone: "profit" },
  { from: 60, to: 100, color: "#cc4b3e", zone: "strong_profit" },
];

const LEGEND = [
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
  const needleAngle = scoreToAngle(score);
  const zone = LEGEND.find((item) => item.zone === snapshot.zone) || LEGEND[2];

  return (
    <div className="arm-indicator-gauge-wrap">
      <svg className="arm-indicator-gauge-svg" viewBox="0 0 360 245" role="img" aria-labelledby="arm-gauge-title arm-gauge-description">
        <title id="arm-gauge-title">Шкала оценки ARM</title>
        <desc id="arm-gauge-description">Значение {score} из диапазона от минус 100 до плюс 100</desc>
        <path className="arm-indicator-gauge-track" d={describeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, -90, 90)} />
        {GAUGE_SEGMENTS.map((segment) => (
          <path className="arm-indicator-gauge-segment" d={describeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, scoreToAngle(segment.from), scoreToAngle(segment.to))} stroke={segment.color} key={segment.zone} />
        ))}
        {ARM_INDICATOR_TICKS.map((tick) => {
          const angle = scoreToAngle(tick);
          const outer = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + 17, angle);
          const label = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + 34, angle);
          return (
            <g key={tick} className="arm-indicator-tick-group">
              <line x1={outer.x} y1={outer.y} x2={label.x} y2={label.y} className="arm-indicator-tick" />
              <text x={label.x} y={label.y} className="arm-indicator-tick-label">{tick > 0 ? `+${tick}` : tick}</text>
            </g>
          );
        })}
        <g className="arm-indicator-needle" transform={`rotate(${needleAngle} ${GAUGE_CENTER.x} ${GAUGE_CENTER.y})`}>
          <line x1={GAUGE_CENTER.x} y1={GAUGE_CENTER.y} x2={GAUGE_CENTER.x} y2={GAUGE_CENTER.y - NEEDLE_LENGTH} className="arm-indicator-needle-line" />
          <circle cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="10" className="arm-indicator-needle-hub" />
        </g>
        <circle cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="57" className="arm-indicator-center-ring" />
        <text x={GAUGE_CENTER.x} y={GAUGE_CENTER.y - 4} className="arm-indicator-score">{score > 0 ? `+${score}` : score < 0 ? `−${Math.abs(score)}` : "0"}</text>
        <text x={GAUGE_CENTER.x} y={GAUGE_CENTER.y + 22} className="arm-indicator-score-caption">ОЦЕНКА ARM</text>
      </svg>
      <div className="arm-indicator-status" aria-live="polite">
        <strong>{zone.label}</strong>
        <span>{zone.description}</span>
      </div>
    </div>
  );
}

export function ArmInvestorIndicator() {
  const state = useArmIndicatorData();
  const snapshot = state.current;
  const currentZone = snapshot ? LEGEND.find((item) => item.zone === snapshot.zone) || LEGEND[2] : null;

  return (
    <section className="arm-indicator card" id="arm-investor-indicator" aria-labelledby="arm-indicator-title">
      <header className="arm-indicator-header">
        <div>
          <p className="arm-indicator-kicker">ARM INVESTOR</p>
          <h2 id="arm-indicator-title">АРМ ИНДИКАТОР ИНВЕСТОРА</h2>
          <p>На основе реальных данных торговой системы ARM</p>
        </div>
        <img className="arm-indicator-logo" src={brandLogo} alt="ARM AI Robo Makers" />
      </header>

      {state.status === "loading" ? <div className="arm-indicator-loading" role="status" aria-label="Загрузка индикатора" /> : null}
      {state.status === "unavailable" ? <div className="arm-indicator-empty" role="status"><strong>Данные индикатора пока недоступны</strong><span>{state.error}</span></div> : null}
      {state.status === "error" ? <div className="arm-indicator-error" role="alert">{state.error}</div> : null}

      {snapshot ? (
        <div className="arm-indicator-layout">
          <div>
            <Gauge snapshot={snapshot} />
            <div className="arm-indicator-result" aria-label={`Зона: ${currentZone.label}`}>
              <strong>{currentZone.label}</strong>
              <span>{currentZone.description}</span>
            </div>
          </div>
          <aside className="arm-indicator-legend" aria-label="Как читать шкалу">
            <h3>КАК ЧИТАТЬ ШКАЛУ</h3>
            {LEGEND.map((item) => {
              const segment = GAUGE_SEGMENTS.find((candidate) => candidate.zone === item.zone);
              const isActive = snapshot.zone === item.zone;
              return (
                <div className={`arm-indicator-legend-row${isActive ? " is-active" : ""}`} key={item.zone}>
                  <span className="arm-indicator-legend-dot" style={{ backgroundColor: segment.color }} />
                  <div><strong>{item.label}{isActive ? <em>Текущая зона</em> : null}</strong><span>{item.description}</span></div>
                </div>
              );
            })}
          </aside>
        </div>
      ) : null}

      {snapshot ? (
        <footer className="arm-indicator-footer">
          <span>Данные по состоянию на: {formatDate(snapshot.dataAsOf)}</span>
          {snapshot.stale ? <small className="arm-indicator-stale">Данные временно не обновляются</small> : null}
          <p>Индикатор является информационным ориентиром на основе статистики торговой системы ARM и не гарантирует будущую доходность.</p>
        </footer>
      ) : null}
    </section>
  );
}
