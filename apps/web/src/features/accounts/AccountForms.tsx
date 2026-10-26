import { useState, type FormEvent } from "react";
import { Alert, Button, Field, PageHeader } from "@aqours/ui";
import { FiLogIn, FiLock, FiUserPlus } from "react-icons/fi";
import { Brand } from "../../shared/Brand";
import { FormError } from "../../shared/FormError";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, ApiError, csrf, type Account } from "./api";
import { queryClient } from "../../shared/query";

function AccountField({
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
    <Field
      id={name}
      label={label}
      optional={!required}
      error={errors?.join(" ")}
    >
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
    </Field>
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
        <PageHeader
          title="Sign in"
          description="Access the Aqours supplier portal."
        />
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate(fields(event.currentTarget));
          }}
        >
          <AccountField
            name="email"
            label="Email address"
            type="email"
            autoComplete="username"
            error={mutation.error as ApiError}
          />
          <AccountField
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
          />
          <FormError error={mutation.error} login />
          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending}
          >
            <FiLogIn aria-hidden="true" />
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </Button>
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
      <PageHeader
        title="Change your password"
        description="Set a new password before continuing to the portal."
      />
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
        <AccountField
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={mutation.error as ApiError}
        />
        <AccountField
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          error={mutation.error as ApiError}
        />
        <AccountField
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
        />
        {mismatch && (
          <Alert tone="error">The new passwords do not match.</Alert>
        )}
        <FormError error={mutation.error} />
        <Button type="submit" disabled={mutation.isPending}>
          <FiLock aria-hidden="true" />
          {mutation.isPending ? "Saving…" : "Save new password"}
        </Button>
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
      <PageHeader
        title="Create account"
        description="Give a colleague or customer access to Aqours."
      />
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
            <Alert tone="success" className="mb-6">
              Account created for <strong>{created.email}</strong> as{" "}
              {created.role}. They must change their initial password when
              signing in.
            </Alert>
          )}
          <div className="grid gap-x-4 sm:grid-cols-2">
            <AccountField
              name="firstName"
              label="First name"
              autoComplete="off"
              error={mutation.error as ApiError}
            />
            <AccountField
              name="lastName"
              label="Last name"
              autoComplete="off"
              error={mutation.error as ApiError}
            />
          </div>
          <AccountField
            name="middleName"
            label="Middle name"
            required={false}
            autoComplete="off"
            error={mutation.error as ApiError}
          />
          <AccountField
            name="email"
            label="Email address"
            type="email"
            autoComplete="off"
            error={mutation.error as ApiError}
          />
          <AccountField
            name="role"
            label="Role"
            error={mutation.error as ApiError}
          >
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
          </AccountField>
          <AccountField
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
            <Button type="submit" disabled={mutation.isPending}>
              <FiUserPlus aria-hidden="true" />
              {mutation.isPending ? "Creating…" : "Create account"}
            </Button>
            <Link to="/dashboard">Cancel</Link>
          </div>
        </form>
      </div>
    </section>
  );
}
