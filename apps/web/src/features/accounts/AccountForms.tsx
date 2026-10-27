import { useState, type FormEvent } from "react";
import { Alert, Button, Field, PageHeader, PasswordInput } from "@aqours/ui";
import { FiInfo, FiLock } from "react-icons/fi";
import { Brand } from "../../shared/Brand";
import { FormError } from "../../shared/FormError";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
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
  const Input = type === "password" ? PasswordInput : "input";
  return (
    <Field
      id={name}
      label={label}
      optional={!required}
      error={errors?.join(" ")}
    >
      {children ?? (
        <Input
          id={name}
          name={name}
          {...(type === "password" ? {} : { type })}
          required={required}
          autoComplete={autoComplete}
          placeholder={
            (
              {
                firstName: "e.g. Dina",
                lastName: "e.g. Flores",
                middleName: "e.g. Santos",
                email: "name@example.com",
                password: "Enter your password",
                initialPassword: "Enter initial password",
              } as Record<string, string>
            )[name]
          }
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
        <span className="auth-scope">· Supplier portal</span>
      </div>
      <main className="auth-form">
        <div className="auth-card-brand">
          <span className="auth-droplet">
            <Brand />
          </span>
          <h1>Aqours Supplier Portal</h1>
          <p className="muted">Water reporting and response</p>
        </div>
        <div className="auth-intro">
          <h2>Sign in</h2>
          <p className="muted">
            Use the account provided by your administrator.
          </p>
        </div>
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
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="auth-card-footer muted">
          Water reporting, response and monitoring
        </p>
      </main>
      <footer className="auth-footer">
        <span>Aqours · Supplier portal</span>
        <span>Water reporting, response and monitoring</span>
      </footer>
    </div>
  );
}
export function ChangePassword({ required = true }: { required?: boolean }) {
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      submitCredentials("/auth/change-password", body),
    onSuccess: async (account) => {
      await acceptSession(account);
      navigate("/dashboard", { replace: true });
    },
  });
  const [mismatch, setMismatch] = useState(false);
  return (
    <section className="max-w-xl">
      <PageHeader
        title="Change your password"
        description={
          required
            ? "Set a new password before continuing to the portal."
            : "Choose a new password for your account."
        }
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
        {!required && (
          <Link className="ml-4" to="/dashboard">
            Back to dashboard
          </Link>
        )}
      </form>
    </section>
  );
}
export function CreateAccount() {
  const [created, setCreated] = useState<Account | null>(null);
  const mutation = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      submitCredentials("/accounts", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });
  return (
    <section className="create-account">
      <PageHeader
        title="Create account"
        description="Give a colleague or customer access to Aqours."
      />
      <div className="settings-grid">
        <aside className="account-help">
          <h2>
            <FiInfo aria-hidden="true" />
            Account provisioning
          </h2>
          <div>
            <h3>Roles</h3>
            <p>
              Admin &amp; Staff access the web portal; Customers access the
              mobile app.
            </p>
          </div>
          <div>
            <h3>Initial password policy</h3>
            <p>
              Temporary passwords must be changed by the user upon first
              sign-in.
            </p>
          </div>
          <div>
            <h3>Secure distribution</h3>
            <p>
              Share the temporary credentials securely through your internal
              operational channels.
            </p>
          </div>
        </aside>
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
          <h2 className="form-panel-title">Credential details</h2>
          <p className="muted form-panel-description">
            Enter complete identity and assign role authorization.
          </p>
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
          <ul className="password-policy">
            <li>At least 12 characters</li>
            <li>Uppercase and lowercase letters</li>
            <li>Number and special symbol (!@#$)</li>
            <li>First sign-in password change required</li>
          </ul>
          <FormError error={mutation.error} />
          <div className="account-form-actions">
            <Link className="ui-button ui-button-secondary" to="/accounts">
              Cancel
            </Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
