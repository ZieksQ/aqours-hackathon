import {
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiEye,
  FiEyeOff,
  FiInfo,
} from "react-icons/fi";
import { buttonClassName, type ButtonVariant } from "./buttonStyles";

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={buttonClassName(variant, className)}
      {...props}
    />
  );
}

export function Field({
  id,
  label,
  optional = false,
  error,
  required = false,
  hint,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ui-field">
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="ui-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
        {optional && <span className="muted"> (optional)</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="ui-field-hint muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="ui-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function SectionPanel({
  title,
  icon,
  children,
  className = "",
  note,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  note?: ReactNode;
}) {
  return (
    <section className={`ui-section-panel ${className}`}>
      <div className="ui-section-heading">
        <h2>
          {icon}
          {title}
        </h2>
        {note && <span className="muted">{note}</span>}
      </div>
      {children}
    </section>
  );
}

export function PasswordInput(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="ui-password-input">
      <input {...props} type={visible ? "text" : "password"} />
      <Button
        variant="ghost"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? (
          <FiEyeOff aria-hidden="true" />
        ) : (
          <FiEye aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  className?: string;
  children: ReactNode;
  tone?: "neutral" | "info" | "warning" | "success" | "danger";
}) {
  return (
    <span className={`ui-badge ui-badge-${tone} ${className}`}>{children}</span>
  );
}

export function MetricStrip({
  label,
  items,
}: {
  label: string;
  items: {
    label: string;
    value: number | undefined;
    detail?: string;
    unit?: string;
  }[];
}) {
  return (
    <dl className="ui-metric-strip" aria-label={label}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            {item.value === undefined ? (
              <span className="ui-metric-loading" aria-label="Loading" />
            ) : (
              item.value
            )}
            {item.unit && <span className="ui-metric-unit">{item.unit}</span>}
          </dd>
          {item.detail && <p className="ui-metric-detail">{item.detail}</p>}
        </div>
      ))}
    </dl>
  );
}

export function Alert({
  tone = "info",
  children,
  className = "",
}: {
  tone?: "info" | "error" | "success";
  children: ReactNode;
  className?: string;
}) {
  const Icon =
    tone === "error"
      ? FiAlertCircle
      : tone === "success"
        ? FiCheckCircle
        : FiInfo;
  return (
    <div
      className={`ui-alert ui-alert-${tone} ${className}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="ui-page-header">
      <div>
        {back && <div className="ui-back-link">{back}</div>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </div>
  );
}

export function StatePanel({
  title,
  children,
  action,
  role,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div className="ui-state-panel" role={role}>
      <h2>{title}</h2>
      {children && <div className="muted">{children}</div>}
      {action && <div className="ui-state-action">{action}</div>}
    </div>
  );
}

export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  const words = name.trim().split(/\s+/);
  const initials = (
    (words[0]?.[0] ?? "") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
  return (
    <span
      className={`ui-avatar${small ? " ui-avatar-small" : ""}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
