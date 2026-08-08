import { useEffect, useState } from "react";
import { ARM_INDICATOR_TICKS, calculatePointerEndpoint } from "../lib/armIndicatorCore.js";

const CURRENT_ENDPOINT = "/api/arm-indicator/current";
const GAUGE_CENTER = { x: 210, y: 174 };
const GAUGE_BAND_INNER_RADIUS = 100;
const GAUGE_BAND_OUTER_RADIUS = 124;
const NEEDLE_VISIBLE_LENGTH = 95;
const GAUGE_SEGMENTS = [
  { from: -100, to: -60, color: "#5fa978", zone: "strong_buy" },
  { from: -60, to: -20, color: "#8cdd8a", zone: "buy" },
  { from: -20, to: 20, color: "#e4e9f0", zone: "neutral" },
  { from: 20, to: 60, color: "#f9d781", zone: "profit" },
  { from: 60, to: 100, color: "#f29a8f", zone: "strong_profit" },
];
const GAUGE_SCALE_TICKS = Array.from({ length: 51 }, (_, index) => -100 + index * 4);
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

function describeBandSegment(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle) {
  const outerStart = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, endAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, endAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    "Z",
  ].join(" ");
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

function IndicatorInfoBody({ snapshot }) {
  const score = Number(snapshot?.score) || 0;
  const currentZone = getCurrentZone(snapshot);

  return (
    <>
      <div className="arm-indicator-info-copy">
        <p>Индикатор сравнивает текущее состояние торговой системы ARM с её собственной историей результатов.</p>
        <p>Оценка <strong>{formatScore(score)}</strong> находится в зоне «{currentZone.label}». Отрицательная часть шкалы относится к пополнению, положительная — к фиксации прибыли.</p>
      </div>
      <div className="arm-indicator-note">
        <span aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3 5.5 5.6v5.8c0 4.3 2.6 7.8 6.5 9.6 3.9-1.8 6.5-5.3 6.5-9.6V5.6L12 3Z" /><path d="m9.3 12.2 1.8 1.8 3.8-4" /></svg>
        </span>
        <p>Используйте сигнал вместе с управлением рисками и собственным инвестиционным планом.</p>
      </div>
    </>
  );
}

function IndicatorInfo({ snapshot }) {
  return (
    <aside className="arm-indicator-info-panel arm-indicator-desktop-panel">
      <PanelHeading type="info">Что это значит</PanelHeading>
      <IndicatorInfoBody snapshot={snapshot} />
    </aside>
  );
}

function LegendRows({ snapshot }) {
  return (
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
  );
}

function IndicatorLegend({ snapshot }) {
  return (
    <aside className="arm-indicator-legend-panel arm-indicator-desktop-panel" aria-label="Как читать шкалу">
      <PanelHeading type="book">Как читать шкалу</PanelHeading>
      <LegendRows snapshot={snapshot} />
    </aside>
  );
}

function MobileAccordion({ type, title, className, children }) {
  return (
    <details className={`arm-mobile-accordion ${className}`}>
      <summary>
        <PanelHeading type={type}>{title}</PanelHeading>
        <span className="arm-mobile-accordion-chevron" aria-hidden="true">
          <svg viewBox="0 0 20 20"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" /></svg>
        </span>
      </summary>
      <div className="arm-mobile-accordion-body">{children}</div>
    </details>
  );
}

function Gauge({ snapshot }) {
  const score = Number(snapshot?.score) || 0;
  const currentZone = getCurrentZone(snapshot);
  const currentSegment = getCurrentSegment(snapshot);
  const pointer = calculatePointerEndpoint(score, GAUGE_CENTER.x, GAUGE_CENTER.y, NEEDLE_VISIBLE_LENGTH);
  const pointerDx = pointer.x - GAUGE_CENTER.x;
  const pointerDy = pointer.y - GAUGE_CENTER.y;
  const pointerDistance = Math.hypot(pointerDx, pointerDy) || 1;
  const unitX = pointerDx / pointerDistance;
  const unitY = pointerDy / pointerDistance;
  const pointerHalfWidth = 6;
  const pointerBaseLeft = {
    x: GAUGE_CENTER.x - unitY * pointerHalfWidth,
    y: GAUGE_CENTER.y + unitX * pointerHalfWidth,
  };
  const pointerBaseRight = {
    x: GAUGE_CENTER.x + unitY * pointerHalfWidth,
    y: GAUGE_CENTER.y - unitX * pointerHalfWidth,
  };
  const pointerPoints = `${pointer.x},${pointer.y} ${pointerBaseLeft.x},${pointerBaseLeft.y} ${pointerBaseRight.x},${pointerBaseRight.y}`;
  const zoneStyle = { "--arm-zone-color": currentSegment.color };
  const gaugeBandPath = describeBandSegment(
    GAUGE_CENTER.x,
    GAUGE_CENTER.y,
    GAUGE_BAND_INNER_RADIUS,
    GAUGE_BAND_OUTER_RADIUS,
    -90,
    90,
  );

  return (
    <div className="arm-indicator-center" style={zoneStyle} data-zone={snapshot?.zone || "neutral"}>
      <div className="arm-indicator-gauge-wrap">
        <div className="arm-indicator-gauge-stage">
          <svg className="arm-indicator-gauge-svg" viewBox="0 0 420 205" role="img" aria-label={`Шкала оценки ARM, значение ${score}`}>
            <defs>
              <linearGradient id="arm-gauge-band-gradient" gradientUnits="userSpaceOnUse" x1="86" y1="174" x2="334" y2="174">
                <stop offset="0%" stopColor="#5fa978" />
                <stop offset="8%" stopColor="#69b786" />
                <stop offset="21%" stopColor="#8cdd8a" />
                <stop offset="34%" stopColor="#b9e3b6" />
                <stop offset="46%" stopColor="#dde7e6" />
                <stop offset="50%" stopColor="#e4e9f0" />
                <stop offset="57%" stopColor="#eee5cb" />
                <stop offset="72%" stopColor="#f9d781" />
                <stop offset="86%" stopColor="#f5b28b" />
                <stop offset="100%" stopColor="#f29a8f" />
              </linearGradient>
              <linearGradient id="arm-gauge-band-highlight" gradientUnits="userSpaceOnUse" x1="210" y1="50" x2="210" y2="174">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
                <stop offset="42%" stopColor="#ffffff" stopOpacity="0.18" />
                <stop offset="78%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="arm-gauge-band-shade" gradientUnits="userSpaceOnUse" x1="210" y1="50" x2="210" y2="174">
                <stop offset="30%" stopColor="#173653" stopOpacity="0" />
                <stop offset="78%" stopColor="#173653" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#173653" stopOpacity="0.12" />
              </linearGradient>
              <filter id="arm-gauge-band-shadow" x="-20%" y="-30%" width="140%" height="170%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.2" floodColor="#173653" floodOpacity="0.14" />
              </filter>
            </defs>

            <path
              className="arm-indicator-gauge-band"
              d={gaugeBandPath}
              fill="url(#arm-gauge-band-gradient)"
              stroke="none"
              filter="url(#arm-gauge-band-shadow)"
            />
            <path className="arm-indicator-gauge-highlight" d={gaugeBandPath} fill="url(#arm-gauge-band-highlight)" stroke="none" />
            <path className="arm-indicator-gauge-shade" d={gaugeBandPath} fill="url(#arm-gauge-band-shade)" stroke="none" />

            {GAUGE_SCALE_TICKS.map((tick) => {
              const major = MAJOR_TICKS.has(tick);
              const medium = !major && tick % 20 === 0;
              const angle = tick * 0.9;
              const innerRadius = major
                ? GAUGE_BAND_INNER_RADIUS + 2
                : medium
                  ? GAUGE_BAND_INNER_RADIUS + 7
                  : GAUGE_BAND_INNER_RADIUS + 10;
              const outerRadius = GAUGE_BAND_OUTER_RADIUS - 2;
              const inner = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, innerRadius, angle);
              const outer = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, outerRadius, angle);
              const tickClass = major ? " is-major" : medium ? " is-medium" : "";
              return (
                <line
                  key={tick}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  className={`arm-indicator-scale-tick${tickClass}`}
                  stroke="#173653"
                />
              );
            })}

            {ARM_INDICATOR_TICKS.map((tick) => {
              const label = polarToCartesian(GAUGE_CENTER.x, GAUGE_CENTER.y, 84, tick * 0.9);
              return (
                <text x={label.x} y={label.y} className="arm-indicator-tick-label" key={`label-${tick}`}>
                  {tick > 0 ? `+${tick}` : tick}
                </text>
              );
            })}

            <polygon className="arm-gauge-pointer" points={pointerPoints} />
            <circle className="arm-indicator-needle-hub-ring" cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="10" />
            <circle className="arm-indicator-needle-hub" cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="6.5" />
          </svg>
          <div className="arm-gauge-score-overlay" aria-label={`Оценка ARM: ${score}`}>
            <div className="arm-score-value">{formatScore(score)}</div>
            <div className="arm-score-label">ОЦЕНКА ARM</div>
          </div>
        </div>
      </div>
      <div className="arm-indicator-status-pill"><span aria-hidden="true">✓</span>Текущая зона</div>
      <h2 className="arm-indicator-signal-title">{currentZone.label}</h2>
      <p className="arm-indicator-recommendation">{currentZone.description}</p>
      <span className="sr-only">Текущая зона: {currentZone.label}</span>
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
          <div className="arm-indicator-main-grid arm-dashboard-grid">
            <IndicatorInfo snapshot={snapshot} />
            <Gauge snapshot={snapshot} />
            <IndicatorLegend snapshot={snapshot} />
            <MobileAccordion type="info" title="Что это значит" className="arm-mobile-info">
              <IndicatorInfoBody snapshot={snapshot} />
            </MobileAccordion>
            <MobileAccordion type="book" title="Как читать шкалу" className="arm-mobile-legend">
              <LegendRows snapshot={snapshot} />
            </MobileAccordion>
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
