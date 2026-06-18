import { useEffect, useState } from "react";
import { sectionsBySlug } from "../content";

const initialForm = {
  name: "",
  contact: "",
  message: "",
};

function getCurrentPageLabel(pathname) {
  const slug = pathname === "/" ? "overview" : pathname.replace(/^\//, "");
  return sectionsBySlug[slug]?.title || pathname || "Главная";
}

export function SupportModal({ open, onClose }) {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    setForm(initialForm);
    setStatus("idle");
    setError("");
  }, [open]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("sending");
    setError("");

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          pagePath: window.location.pathname,
          pageUrl: window.location.href,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fallbackMessage = "Канал поддержки временно недоступен. Напишите на armrobomakers@gmail.com.";
        if (response.status === 503) {
          throw new Error(fallbackMessage);
        }
        throw new Error(payload?.error || fallbackMessage);
      }

      setStatus("success");
    } catch (submitError) {
      setStatus("idle");
      const fallbackMessage = "Канал поддержки временно недоступен. Напишите на armrobomakers@gmail.com.";
      const message = submitError instanceof Error ? submitError.message : fallbackMessage;
      setError(message || fallbackMessage);
    }
  }

  const canSubmit = form.name.trim() && form.contact.trim() && form.message.trim() && status !== "sending";
  const currentPageLabel = getCurrentPageLabel(window.location.pathname);

  return (
    <div className="support-overlay" role="dialog" aria-modal="true" aria-labelledby="support-title">
      <button className="support-backdrop" type="button" aria-label="Закрыть" onClick={onClose} />
      <section className="support-panel">
        <div className="support-head">
          <div>
            <p className="eyebrow">Поддержка</p>
            <h2 id="support-title">Связаться с поддержкой</h2>
          </div>
          <button className="support-close" type="button" onClick={onClose} aria-label="Закрыть форму">
            ×
          </button>
        </div>

        <p className="support-copy">Опишите вопрос или что именно не получается, и мы поможем разобраться.</p>

        {status === "success" ? (
          <div className="support-success">
            <strong>Заявка отправлена</strong>
            <p>Мы получили сообщение и ответим через внутренний канал поддержки.</p>
            <div className="support-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  setForm(initialForm);
                  setStatus("idle");
                }}
              >
                Отправить ещё
              </button>
              <button className="button button-secondary" type="button" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </div>
        ) : (
          <form className="support-form" onSubmit={handleSubmit}>
            <label className="support-field">
              <span>Имя</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Как к вам обращаться"
                autoComplete="name"
              />
            </label>

            <label className="support-field">
              <span>Контакт *</span>
              <input
                value={form.contact}
                onChange={(event) => setForm((current) => ({ ...current, contact: event.target.value }))}
                placeholder="Telegram, email или телефон"
                autoComplete="email"
                required
              />
            </label>

            <label className="support-field support-field-wide">
              <span>Сообщение</span>
              <textarea
                value={form.message}
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                placeholder="Опишите, что нужно сделать или что у вас не получается"
                rows={5}
              />
            </label>

            <div className="support-meta support-field-wide">
              <span>Сейчас открыта страница: {currentPageLabel}</span>
              <span>
                Если форма не отправится, напишите на <a href="mailto:armrobomakers@gmail.com">armrobomakers@gmail.com</a>.
              </span>
            </div>

            {error ? <div className="support-error support-field-wide">{error}</div> : null}

            <div className="support-actions support-field-wide">
              <button className="button button-primary" type="submit" disabled={!canSubmit}>
                {status === "sending" ? "Отправка..." : "Отправить заявку"}
              </button>
              <button className="button button-secondary" type="button" onClick={onClose}>
                Отмена
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
