import { useEffect, useState } from "react";
import { ARM_INDICATOR_TICKS, calculatePointerEndpoint } from "../lib/armIndicatorCore.js";

const CURRENT_ENDPOINT = "/api/arm-indicator/current";
const GAUGE_CENTER = { x: 210, y: 165 };
const GAUGE_RADIUS = 122;
const NEEDLE_LENGTH = 116;
const GAUGE_SEGMENTS = [
  { from: -99, to: -61, color: "#225f35", zone: "strong_buy" },
  { from: -59, to: -21, color: "#4caf50", zone: "buy" },
  { from: -19, to: 19, color: "#a7b0bd", zone: "neutral" },
  { from: 21, to: 59, color: "#e5a323", zone: "profit" },
  { from: 61, to: 99, color: "#cc4b3e", zone: "strong_profit" },
];
const GAUGE_TICKS = Array.from({ length: 21 }, (_, index) => -100 + index * 10);
const MAJOR_TICKS = new Set(ARM_INDICATOR_TICKS);

export const ARM_INDICATOR_LEGEND = [
  { zone: "strong_buy", label: "Сильная зона пополнения", description: "Хорошая точка для увеличения капитала", range: "−100…−60" },
  { zone: "buy", label: "Зона пополнения", description: "Можно рассмотреть увеличение капитала", range: "−59…−21" },
  { zone: "neutral", label: "Нейтральная зона", description: "Ждать / ничего не делать", range: "−20…+20" },
  { zone: "profit", label: "Зона фиксации прибыли", description: "Можно зафиксировать часть прибыли", range: "+21…+59" },
  { zone: "strong_profit", label: "Сильная зона фиксации прибыли", description: "Хорошая точка для фиксации прибыли", range: "+60…+100" },
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

function formatScore(value) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

function getCurrentZone(snapshot) {
  return ARM_INDICATOR_LEGEND.find((item) => item.zone === snapshot?.zone) || ARM_INDICATOR_LEGEND[2];
}

function getCurrentSegment(snapshot) {
  return GAUGE_SEGMENTS.find((item) => item.zone === snapshot?.zone) || GAUGE_SEGMENTS[2];
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

function PanelHeading({ type, children }) {
  return (
    <div className="arm-panel-heading">
      <span className={`arm-panel-icon arm-panel-icon-${type}`} aria-hidden="true">
        {type === "info" ? (
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 10.5v6M12 7.3h.01" /></svg>
        ) : (
          <svg viewBox="0 0 24 24"><path d="M4 5.5c2.7-.8 5.3-.4 8 1.3v12c-2.7-1.7-5.3-2.1-8-1.3v-12Z" /><path d="M20 5.5c-2.7-.8-5.3-.4-8 1.3v12c2.7-1.7 5.3-2.1 8-1.3v-12Z" /></svg>
        )}
      </span>
      <h3>{children}</h3>
    </div>
  );
}

function IndicatorInfo({ snapshot }) {
  const score = Number(snapshot?.score) || 0;
  const currentZone = getCurrentZone(snapshot);

  return (
    <aside className="arm-indicator-info-panel">
      <PanelHeading type="info">Что это значит</PanelHeading>
      <div className="arm-indicator-info-copy">
        <p>Индикатор показывает положение торговой системы ARM относительно собственной истории результатов.</p>
        <p>Значение <strong>{formatScore(score)}</strong> находится в зоне «{currentZone.label}» и помогает выбрать действие с капиталом.</p>
        <p>Отрицательная часть шкалы относится к пополнению, положительная — к фиксации прибыли.</p>
      </div>
      <div className="arm-indicator-note">
        <span aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3 5.5 5.6v5.8c0 4.3 2.6 7.8 6.5 9.6 3.9-1.8 6.5-5.3 6.5-9.6V5.6L12 3Z" /><path d="m9.3 12.2 1.8 1.8 3.8-4" /></svg>
        </span>
        <p>Используйте индикатор вместе с управлением рисками и собственным инвестиционным планом.</p>
      </div>
    </aside>
  );
}

function Gauge({ snapshot }) {
  const score = Number(snapshot?.score) || 0;
  const currentZone = getCurrentZone(snapshot);
  const currentSegment = getCurrentSegment(snapshot);
  const pointer = calculatePointerEndpoint(score, GAUGE_CENTER.x, GAUGE_CENTER.y, NEEDLE_LENGTH);
  const zoneStyle = { "--arm-zone-color": currentSegment.color };

  return (
    <div className="arm-indicator-center" style={zoneStyle} data-zone={snapshot?.zone || "neutral"}>
      <div className="arm-indicator-gauge-wrap">
        <div className="arm-indicator-gauge-stage">
          <svg className="arm-indicator-gauge-svg" viewBox="0 0 420 215" role="img" aria-label={`Шкала оценки ARM, значение ${score}`}>
            <path className="arm-indicator-gauge-track" d={describeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, -90, 90)} />
            {GAUGE_SEGMENTS.map((segment) => (
              <path className="arm-indicator-gauge-segment" d={describeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, segment.from * 0.9, segment.to * 0.9)} stroke={segment.color} key={segment.zone} />
            ))}
            {GAUGE_TICKS.map((tick) => {
              const major = MAJOR_TICKS.has(tick);
              const angle = tick * 0.9;
              const inner = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, major ? GAUGE_RADIUS - 16 : GAUGE_RADIUS - 10, angle);
              const outer = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + (major ? 10 : 1), angle);
              const label = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + 29, angle);
              return (
                <g key={tick} className={`arm-indicator-tick-group${major ? " is-major" : ""}`}>
                  <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="arm-indicator-tick" />
                  {major ? <text x={label.x} y={label.y} className="arm-indicator-tick-label">{tick > 0 ? `+${tick}` : tick}</text> : null}
                </g>
              );
            })}
            <line className="arm-gauge-pointer" x1={GAUGE_CENTER.x} y1={GAUGE_CENTER.y} x2={pointer.x} y2={pointer.y} />
            <circle className="arm-gauge-pointer-tip" cx={pointer.x} cy={pointer.y} r="3.8" />
            <circle className="arm-indicator-needle-hub-ring" cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="12" />
            <circle className="arm-indicator-needle-hub" cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="8" />
          </svg>
          <div className="arm-gauge-score-overlay" aria-label={`Оценка ARM: ${score}`}>
            <div className="arm-score-value">{formatScore(score)}</div>
            <div className="arm-score-label">ОЦЕНКА ARM</div>
          </div>
        </div>
      </div>
      <div className="arm-indicator-status-pill"><span aria-hidden="true">✓</span>{currentZone.label}</div>
      <h2 className="arm-indicator-signal-title">{currentZone.label}</h2>
      <p className="arm-indicator-recommendation">{currentZone.description}</p>
      <span className="sr-only">Текущая зона: {currentZone.label}</span>
    </div>
  );
}

function IndicatorLegend({ snapshot }) {
  return (
    <aside className="arm-indicator-legend-panel" aria-label="Как читать шкалу">
      <PanelHeading type="book">Как читать шкалу</PanelHeading>
      <div className="arm-indicator-legend">
        {ARM_INDICATOR_LEGEND.map((item, index) => {
          const segment = GAUGE_SEGMENTS[index];
          const isActive = snapshot?.zone === item.zone;
          return (
            <div
              className={`arm-indicator-legend-row${isActive ? " is-active" : ""}`}
              style={{ "--arm-zone-color": segment.color }}
              key={item.zone}
            >
              <span className="arm-indicator-legend-dot" style={{ backgroundColor: segment.color }} />
              <div className="arm-indicator-legend-copy">
                <div className="arm-indicator-legend-line"><strong>{item.label}</strong><span>{item.range}</span></div>
                <p>{item.description}</p>
              </div>
              {isActive ? <em>Текущая зона</em> : null}
            </div>
          );
        })}
      </div>
    </aside>
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
          <div className="arm-indicator-main-grid arm-dashboard-grid">
            <IndicatorInfo snapshot={snapshot} />
            <Gauge snapshot={snapshot} />
            <IndicatorLegend snapshot={snapshot} />
          </div>
          <footer className="arm-indicator-footer">
            <span className="arm-indicator-data-date"><b aria-hidden="true">i</b>Данные по состоянию на: <strong>{formatDate(snapshot.dataAsOf)}</strong></span>
            {snapshot.stale ? <small className="arm-indicator-stale">Данные временно не обновляются</small> : null}
            <p>Индикатор является информационным ориентиром на основе статистики торговой системы ARM и не гарантирует будущую доходность.</p>
          </footer>
        </>
      ) : null}
    </section>
  );
}
