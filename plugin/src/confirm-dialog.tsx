import React, { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Accessible destructive confirmation shared by setup and reminder management. */
export function ConfirmDialog({ eyebrow, title, description, confirmLabel, cancelLabel, busy = false, error, onCancel, onConfirm }: ConfirmDialogProps): React.ReactElement {
  const backdropRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancelActionRef = useRef(onCancel);
  const busyRef = useRef(busy);
  cancelActionRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    const restoreFocus = document.activeElement instanceof window.HTMLElement ? document.activeElement : null;
    const backdrop = backdropRef.current;
    const siblings = backdrop?.parentElement
      ? [...backdrop.parentElement.children].filter((element) => element !== backdrop) as HTMLElement[]
      : [];
    const prior = siblings.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    for (const element of siblings) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        cancelActionRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(backdrop?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      for (const { element, inert, ariaHidden } of prior) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      restoreFocus?.focus();
    };
  }, []);

  return <div className="pulse-ui__modal-backdrop" ref={backdropRef}>
    <section className="pulse-ui__modal" role="dialog" aria-modal="true" aria-labelledby="pulse-confirm-title" aria-describedby="pulse-confirm-description">
      <p className="pulse-ui__eyebrow">{eyebrow}</p>
      <h2 id="pulse-confirm-title">{title}</h2>
      <div id="pulse-confirm-description" className="pulse-ui__muted">{description}</div>
      {error && <p className="pulse-ui__notice pulse-ui__notice--error" role="alert">{error}</p>}
      <div className="pulse-ui__modal-actions">
        <button ref={cancelRef} className="pulse-ui__button" type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
        <button className="pulse-ui__button pulse-ui__button--danger" type="button" disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </section>
  </div>;
}
