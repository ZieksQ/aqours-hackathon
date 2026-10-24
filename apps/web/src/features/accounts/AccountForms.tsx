import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, ApiError, csrf, type Account } from "./api";
import { queryClient } from "../../shared/query";

export function Field({
  name,
  label,
  type = "text",
  required = true,
  autoComplete,
  error,
  children,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  error?: ApiError | null;
  children?: React.ReactNode;
}) {
  const errors = error?.errors[name];
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {!required && <span className="muted"> (optional)</span>}
      </label>
      {children ?? (
        <input
          id={name}
          name={name}
          type={type}
          required={required}
          autoComplete={autoComplete}
          maxLength={type === "password" || type === "email" ? 256 : 100}
          minLength={
            type === "password" &&
            name !== "password" &&
            name !== "currentPassword"
              ? 12
              : undefined
          }
          aria-invalid={!!errors}
          aria-describedby={errors ? `${name}-error` : undefined}
        />
      )}
      {errors && (
        <p id={`${name}-error`} className="field-error">
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}
export function FormError({
  error,
  login = false,
}: {
  error: Error | null;
  login?: boolean;
}) {
  if (!error) return null;
  return (
    <div className="error" role="alert">
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
    </div>
  );
}
function fields(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries());
}
async function submitCredentials(
  path: string,
  body: Record<string, FormDataEntryValue>,
) {
  try {
    return await api<Account>(path, body);
  } finally {
    // TanStack retains mutation variables; remove credentials once the request settles.
    for (const key of Object.keys(body)) {
      if (key.toLowerCase().includes("password")) delete body[key];
    }
  }
}

async function acceptSession(account: Account) {
  await queryClient.cancelQueries();
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== "account",
  });
  queryClient.setQueryData(["account"], account);
  // Antiforgery request tokens are identity-bound; acquire a fresh one after a session replacement.
  await csrf().catch(() => undefined);
}
export function SignIn() {
  const mutation = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      submitCredentials("/auth/web/login", body),
    onSuccess: acceptSession,
  });
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Brand />
      </div>
      <main className="auth-form">
        <h1>Sign in</h1>
        <p className="muted mb-6">Access the Aqours supplier portal.</p>
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate(fields(event.currentTarget));
          }}
        >
          <Field
            name="email"
            label="Email address"
            type="email"
            autoComplete="username"
            error={mutation.error as ApiError}
          />
          <Field
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
          />
          <FormError error={mutation.error} login />
          <button className="primary w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="muted mt-6">
          Accounts are provided by your administrator. Customers sign in through
          the mobile app.
        </p>
      </main>
      <footer className="auth-footer">
        Water reporting & supplier response
      </footer>
    </div>
  );
}
export function ChangePassword() {
  const mutation = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      submitCredentials("/auth/change-password", body),
    onSuccess: acceptSession,
  });
  const [mismatch, setMismatch] = useState(false);
  return (
    <section className="max-w-xl">
      <h1>Change your password</h1>
      <p className="muted mb-6">
        Set a new password before continuing to the portal.
      </p>
      <p id="password-help" className="mb-6">
        Use at least 12 characters with an uppercase letter, a lowercase letter,
        a number, and a symbol.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const body = fields(event.currentTarget);
          setMismatch(body.newPassword !== body.confirmPassword);
          if (body.newPassword === body.confirmPassword)
            mutation.mutate({
              currentPassword: body.currentPassword,
              newPassword: body.newPassword,
            });
        }}
        aria-describedby="password-help"
      >
        <Field
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={mutation.error as ApiError}
        />
        <Field
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          error={mutation.error as ApiError}
        />
        <Field
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
        />
        {mismatch && (
          <p className="error" role="alert">
            The new passwords do not match.
          </p>
        )}
        <FormError error={mutation.error} />
        <button className="primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save new password"}
        </button>
      </form>
    </section>
  );
}
export function CreateAccount() {
  const [created, setCreated] = useState<Account | null>(null);
  const mutation = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      submitCredentials("/accounts", body),
  });
  return (
    <section>
      <h1>Create account</h1>
      <div className="settings-grid">
        <div>
          <h2>Account details</h2>
          <p className="muted mt-2">
            Create access for a supplier colleague or customer.
          </p>
          <p className="muted mt-4">
            Share the initial password securely. Every new account must change
            it on first sign-in.
          </p>
          <p className="muted mt-4">
            Admin and Staff use this portal. Customer accounts use the mobile
            app.
          </p>
        </div>
        <form
          className="form-panel"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            setCreated(null);
            try {
              const account = await mutation.mutateAsync(fields(form));
              form.reset();
              setCreated(account);
            } catch {
              /* Display field errors below. */
            }
          }}
        >
          {created && (
            <div role="status" className="success mb-6">
              Account created for <strong>{created.email}</strong> as{" "}
              {created.role}. They must change their initial password when
              signing in.
            </div>
          )}
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field
              name="firstName"
              label="First name"
              autoComplete="off"
              error={mutation.error as ApiError}
            />
            <Field
              name="lastName"
              label="Last name"
              autoComplete="off"
              error={mutation.error as ApiError}
            />
          </div>
          <Field
            name="middleName"
            label="Middle name"
            required={false}
            autoComplete="off"
            error={mutation.error as ApiError}
          />
          <Field
            name="email"
            label="Email address"
            type="email"
            autoComplete="off"
            error={mutation.error as ApiError}
          />
          <Field name="role" label="Role" error={mutation.error as ApiError}>
            <select
              id="role"
              name="role"
              defaultValue="Staff"
              aria-invalid={!!(mutation.error as ApiError)?.errors?.role}
              aria-describedby={
                (mutation.error as ApiError)?.errors?.role
                  ? "role-error"
                  : undefined
              }
            >
              <option value="Staff">Staff</option>
              <option value="Admin">Admin</option>
              <option value="Customer">Customer</option>
            </select>
          </Field>
          <Field
            name="initialPassword"
            label="Initial password"
            type="password"
            autoComplete="new-password"
            error={mutation.error as ApiError}
          />
          <p className="muted mb-6">
            At least 12 characters, including uppercase, lowercase, a number,
            and a symbol.
          </p>
          <FormError error={mutation.error} />
          <div className="flex flex-wrap items-center gap-4">
            <button className="primary" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create account"}
            </button>
            <Link to="/dashboard">Cancel</Link>
          </div>
        </form>
      </div>
    </section>
  );
}
export function Brand() {
  return (
    <span className="brand">
      <svg width="24" height="28" viewBox="0 0 24 28" aria-hidden="true">
        <path
          d="M12 2C9 7 3 13 3 18a9 9 0 0 0 18 0c0-5-6-11-9-16Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M7 18a5 5 0 0 0 5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      Aqours
    </span>
  );
}
