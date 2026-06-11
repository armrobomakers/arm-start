import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { guideMeta, guideSections, navGroups } from "../content";

export function SiteLayout() {
  const location = useLocation();
  const pathSlug = location.pathname === "/" ? "overview" : location.pathname.replace(/^\//, "");
  const currentIndex = guideSections.findIndex((section) => section.slug === pathSlug);
  const progress = Math.round(((currentIndex + 1) / guideSections.length) * 100);

  return (
    <div className="docs-shell">
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="На главную">
          <span className="brand-mark">ARM</span>
          <span>
            <strong>Investor Guide</strong>
            <small>{guideMeta.version}</small>
          </span>
        </Link>

        <div className="progress-card">
          <div className="progress-row">
            <span>Прогресс</span>
            <strong>{Number.isFinite(progress) ? progress : 0}%</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${Number.isFinite(progress) ? progress : 0}%` }} />
          </div>
        </div>

        <nav className="side-nav" aria-label="Разделы инструкции">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.title}>
              <p>{group.title}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.slug}
                  to={item.slug === "overview" ? "/" : `/${item.slug}`}
                  end={item.slug === "overview"}
                  className={({ isActive }) => (isActive ? "side-link active" : "side-link")}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="docs-main">
        <header className="topbar">
          <div>
            <span className="top-kicker">Публичная инструкция</span>
            <strong>{guideMeta.title}</strong>
          </div>
          <a className="support-link" href={`mailto:${guideMeta.supportEmail}`}>Поддержка</a>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
