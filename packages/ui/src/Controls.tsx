import type { ButtonHTMLAttributes, ReactNode } from "react";
import { FiAlertCircle, FiCheckCircle, FiInfo } from "react-icons/fi";
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
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="ui-field">
      <label htmlFor={id}>
        {label}
        {optional && <span className="muted"> (optional)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="ui-field-error">
          {error}
        </p>
      )}
    </div>
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
