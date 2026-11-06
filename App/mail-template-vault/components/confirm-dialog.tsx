"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ConfirmOptions = { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type Pending = ConfirmOptions & { resolve: (confirmed: boolean) => void };

// The theme's popup, used in place of the browser's confirm(). A native <dialog> keeps
// focus inside it and closes on Escape.
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const element = useRef<HTMLDialogElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), []);

  function finish(confirmed: boolean) {
    pending?.resolve(confirmed);
    setPending(null);
  }

  useEffect(() => {
    if (pending && !element.current?.open) element.current?.showModal();
  }, [pending]);

  const dialog = pending ? (
    <dialog
      ref={element}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onCancel={(event) => { event.preventDefault(); finish(false); }}
      onClick={(event) => { if (event.target === event.currentTarget) finish(false); }}
    >
      <div className="confirm-body">
        <h2 id="confirm-title">{pending.title}</h2>
        <p id="confirm-message">{pending.message}</p>
        <div className="confirm-actions">
          <button type="button" className="button button-secondary" onClick={() => finish(false)} autoFocus>{pending.cancelLabel || "Cancel"}</button>
          <button type="button" className={`button ${pending.danger ? "button-danger" : "button-primary"}`} onClick={() => finish(true)}>{pending.confirmLabel || "Confirm"}</button>
        </div>
      </div>
    </dialog>
  ) : null;

  return { confirm, dialog };
}
