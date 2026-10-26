export type ButtonVariant = "primary" | "secondary" | "ghost";

export function buttonClassName(
  variant: ButtonVariant = "primary",
  className = "",
) {
  return `ui-button ui-button-${variant} ${className}`.trim();
}
