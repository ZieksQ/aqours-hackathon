import { useEffect, useRef, type ReactNode } from "react";
import { FiX } from "react-icons/fi";
import { Button } from "./Controls";

/** Native modal supplies focus containment, background inertness and focus restoration. */
export function Dialog({
  title,
  titleId,
  description,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  titleId: string;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="ui-dialog"
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="ui-dialog-heading">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p className="muted">{description}</p>}
        </div>
        <Button
          variant="ghost"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <FiX aria-hidden="true" />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
