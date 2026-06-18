import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { guideMeta, guideSections, navGroups } from "../content";
import brandMark from "../assets/brand/favicon.svg";
import { SupportModal } from "./SupportModal";

export function SiteLayout() {
  const location = useLocation();
  const pathSlug = location.pathname === "/" ? "overview" : location.pathname.replace(/^\//, "");
  const currentIndex = guideSections.findIndex((section) => section.slug === pathSlug);
  const progress = Math.round(((currentIndex + 1) / guideSections.length) * 100);
  const [supportOpen, setSupportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  return (
    <div className="docs-shell">
      <aside className={`sidebar${menuOpen ? " sidebar-open" : ""}`}>
        <div className="sidebar-inner">
          <div className="sidebar-head">
            <Link className="brand" to="/" aria-label="На главную">
              <img className="brand-icon" src={brandMark} alt="" aria-hidden="true" />
              <span className="brand-copy">
                <strong>ARM</strong>
                <small>AI Robo Makers</small>
              </span>
            </Link>
            <button className="drawer-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню">
              ×
            </button>
          </div>

          <div className="progress-card">
            <div className="progress-row">
              <span>Прогресс</span>
              <strong>{Number.isFinite(progress) ? progress : 0}%</strong>
            </div>
            <div className="progress-track">
              <span style={{ width: `${Number.isFinite(progress) ? progress : 0}%` }} />
            </div>
          </div>

          <nav className="side-nav" aria-label="Меню инструкции">
            {navGroups.map((group) => (
              <div className="nav-group" key={group.title}>
                <p>{group.title}</p>
                {group.items.map((item) => (
                  <NavLink
                    key={item.slug}
                    to={item.slug === "overview" ? "/" : `/${item.slug}`}
                    end={item.slug === "overview"}
                    className={({ isActive }) => (isActive ? "side-link active" : "side-link")}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <div className="docs-main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="top-kicker">Публичная инструкция</span>
            <strong>{guideMeta.title}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="menu-button"
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
            >
              Меню
            </button>
            <button
              className="support-link"
              type="button"
              onClick={() => setSupportOpen(true)}
              aria-haspopup="dialog"
            >
              Поддержка
            </button>
          </div>
        </header>

        <Outlet />
      </div>

      {menuOpen ? <button className="drawer-backdrop" type="button" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} /> : null}

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}
