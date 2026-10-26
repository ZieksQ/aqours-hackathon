import { Alert } from "@aqours/ui";
import { ApiError } from "../features/accounts/api";

export function FormError({
  error,
  login = false,
}: {
  error: Error | null;
  login?: boolean;
}) {
  if (!error) return null;
  return (
    <Alert tone="error">
      {login && error instanceof ApiError && error.status === 401
        ? "Email or password is incorrect, this account uses the mobile app, or sign-in is temporarily locked. Try again in 15 minutes if you have made several attempts."
        : error.message}
      {error instanceof ApiError &&
        Object.entries(error.errors)
          .filter(
            ([key]) =>
              ![
                "firstName",
                "middleName",
                "lastName",
                "email",
                "initialPassword",
                "role",
                "currentPassword",
                "newPassword",
              ].includes(key),
          )
          .map(([key, values]) => <p key={key}>{values.join(" ")}</p>)}
    </Alert>
  );
}
