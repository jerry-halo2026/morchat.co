"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@morechat/ui/components/ui/alert";
import { Input } from "@morechat/ui/components/ui/input";
import { Button } from "@morechat/ui/components/ui/button";
import { Label } from "@morechat/ui/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@morechat/ui/components/ui/input-otp";
import { MorechatArcade } from "@morechat/ui/components/common/morechat-graphics";
import { MorechatWordmark } from "@morechat/ui/components/common/morechat-wordmark";
import { cn } from "@morechat/ui/lib/utils";
import { useAuthStore } from "@morechat/core/auth";
import { workspaceKeys } from "@morechat/core/workspace/queries";
import { api } from "@morechat/core/api";
import type { User } from "@morechat/core/types";
import { DragStrip } from "../platform";
import { useT } from "../i18n";
// Exit half of the login → onboarding handoff. Imported here (not from the
// web shell) because this component owns the element that animates.
import "./login-handoff.css";

// Types

interface GoogleAuthConfig {
  clientId: string;
  redirectUri: string;
  /** Opaque state passed through Google OAuth (e.g. "platform:desktop"). */
  state?: string;
}

interface CliCallbackConfig {
  /** Validated localhost callback URL */
  url: string;
  /** Opaque state to pass back to CLI */
  state: string;
}

interface LoginPageProps {
  /** Logo element rendered above the title */
  logo?: ReactNode;
  /** Called after successful login. The workspace list is seeded into React
   *  Query before this fires, so the caller can compute a destination URL. */
  onSuccess: () => void;
  /** Google OAuth config. Omit to disable Google login. */
  google?: GoogleAuthConfig;
  /** CLI callback config for authorizing CLI tools. */
  cliCallback?: CliCallbackConfig;
  /** Called after a token is obtained (e.g. to set cookies). */
  onTokenObtained?: () => void;
  /** Override Google login handler (e.g. desktop opens browser externally). When provided, renders the Google button even if `google` config is omitted. */
  onGoogleLogin?: () => void;
  /** Slot rendered at the bottom of the sign-in panel, below the
   *  Google button. The web shell uses it for a "Prefer the desktop
   *  app?" prompt; desktop omits it (a download prompt inside the app
   *  would be absurd). */
  extra?: ReactNode;
  /** True while the caller is moving the member on to the next route (see
   *  `apps/web/features/auth/login-handoff.ts`). It plays this stage's exit
   *  half of the login → onboarding transition and takes the form out of the
   *  accessibility tree, so the handoff is not announced twice: once by the
   *  login page and again by the screen that replaces it.
   *
   *  The caller owns the timing: it flips this on, waits for the exit (or not,
   *  under `prefers-reduced-motion`) and only then navigates. The view cannot
   *  own that wait, because only the caller knows where the member is going. */
  exiting?: boolean;
}

/** Which sign-in method the panel is currently showing. */
type LoginMode = "password" | "code";

/** The panel's screens. `form` covers both modes. */
type LoginStep = "form" | "code" | "cli_confirm" | "force_password";

/** Sign-in capabilities the server advertises under `auth` in `/api/config`. */
interface AuthCapabilities {
  password_enabled: boolean;
  code_login_enabled: boolean;
}

/** The pre-contract server: no password sign-in, email codes unchanged. */
const LEGACY_AUTH_CAPABILITIES: AuthCapabilities = {
  password_enabled: false,
  code_login_enabled: true,
};

type PasswordFailure =
  | "invalid_credentials"
  | "locked"
  | "weak_password"
  | "unavailable"
  | "unknown";

// Helpers

export function redirectToCliCallback(url: string, token: string, state: string) {
  const separator = url.includes("?") ? "&" : "?";
  window.location.href = `${url}${separator}token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;
}

/**
 * Validate that a CLI callback URL points to a safe host over HTTP.
 * Allows localhost and private/LAN IPs (RFC 1918) to support self-hosted setups
 * on local VMs while blocking arbitrary public hosts.
 */
export function validateCliCallback(cliCallback: string): boolean {
  try {
    const cbUrl = new URL(cliCallback);
    if (cbUrl.protocol !== "http:") return false;
    const h = cbUrl.hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
    // Allow RFC 1918 private IPs: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
    if (/^10\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Normalizes both shapes a caller can hand us: the client's own
 * `{ password_enabled, code_login_enabled }` and a raw `/api/config` payload
 * that still nests them under `auth`. Anything unknown keeps the legacy
 * defaults, so a failed probe lands on the flow every server supports.
 */
export function normalizeAuthCapabilities(raw: unknown): AuthCapabilities {
  if (!raw || typeof raw !== "object") return { ...LEGACY_AUTH_CAPABILITIES };
  const value = raw as Record<string, unknown>;
  const nested =
    value.auth && typeof value.auth === "object"
      ? (value.auth as Record<string, unknown>)
      : value;
  return {
    password_enabled: nested.password_enabled === true,
    // Absent means "codes still work": the field only arrived with the
    // password contract, and a server without it only ever had codes.
    code_login_enabled: nested.code_login_enabled !== false,
  };
}

function readRetryAfterSeconds(body: Record<string, unknown> | undefined): number | undefined {
  const raw = body?.retry_after_seconds ?? body?.retry_after;
  const seconds =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

/**
 * Classifies a failed password call from the contract's machine-readable code
 * first (`invalid_credentials`, `too_many_attempts`, `weak_password`) and the
 * HTTP status second, so a server that only sets the status still produces the
 * right sentence. A 404/405 means the endpoint itself is missing: the build
 * predates password login.
 */
export function readPasswordFailure(error: unknown): {
  kind: PasswordFailure;
  retryAfterSeconds?: number;
} {
  const failure = error as { status?: unknown; body?: unknown } | null | undefined;
  const status = typeof failure?.status === "number" ? failure.status : 0;
  const body =
    failure?.body && typeof failure.body === "object"
      ? (failure.body as Record<string, unknown>)
      : undefined;
  const code =
    typeof body?.code === "string"
      ? body.code
      : typeof body?.error === "string"
        ? body.error
        : undefined;

  if (code === "too_many_attempts" || status === 429) {
    return { kind: "locked", retryAfterSeconds: readRetryAfterSeconds(body) };
  }
  if (code === "weak_password") return { kind: "weak_password" };
  if (code === "invalid_credentials" || status === 401) return { kind: "invalid_credentials" };
  if (status === 404 || status === 405) return { kind: "unavailable" };
  return { kind: "unknown" };
}

// Stage

/**
 * The login stage — the same spatial language as `/onboarding`, not a copy of
 * its flow.
 *
 * Three things are borrowed from onboarding's welcome screen, and nothing
 * else:
 *
 *   - **A split stage, not a centred card.** Onboarding never draws a bordered
 *     card: it puts one plain editorial column beside one muted panel. The
 *     login screen now does the same, which is what makes the two screens feel
 *     like one product instead of a form that happens to precede a flow. The
 *     panel edge (`lg:border-l`) does the separating, so the card's border and
 *     shadow are gone.
 *   - **The brand gets a zone, not a header slot.** The wordmark sits in the
 *     editorial column over the brand arcade — the same graphic, at the same
 *     geometry, that the welcome step raises behind its mock activity cards —
 *     so the eye meets the brand before the form. The caller's `logo` (the
 *     李陌茶 lockup) stays in the panel, where it belongs as the form's own
 *     header.
 *   - **One measure.** 26rem for the form; onboarding's steps cap at 28rem, so
 *     the input line length barely changes between the two screens.
 *
 * `DragStrip` is the first flex child for the same reason onboarding makes it
 * one: on desktop the window has to stay draggable from its top edge.
 *
 * Mobile drops the editorial column entirely and keeps the panel full-width —
 * onboarding hides its illustration column below `lg` for the same reason.
 */
function LoginStage({
  logo,
  exiting,
  children,
}: {
  logo?: ReactNode;
  exiting?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-login-stage
      data-login-handoff={exiting ? "out" : undefined}
      inert={exiting || undefined}
      // The exit itself lives in ./login-handoff.css, keyed off
      // `data-login-handoff="out"`: one attribute carries the whole state, the
      // same attribute the tests assert and the reduced-motion rule overrides.
      className="relative flex h-svh flex-col overflow-hidden bg-background"
    >
      <DragStrip />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <BrandStage />
        <div
          className={cn(
            // `flex-1` below `lg` so the panel fills the column and the form's
            // `m-auto` can actually centre it; at `lg` it goes back to a fixed
            // half and the editorial column takes the rest.
            "flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-muted/40",
            "px-6 py-10 sm:px-10 lg:flex-none lg:w-1/2 lg:border-l lg:px-14 lg:py-12 xl:px-16",
          )}
        >
          <div className="m-auto flex w-full max-w-[26rem] flex-col gap-8">
            {logo ? <div className="text-[1.4rem]">{logo}</div> : null}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The editorial column: brand arcade rising from the bottom edge behind the
 * wordmark. Decorative only — every string on this screen is a real control in
 * the panel, so the column carries no text a screen reader needs.
 *
 * The arcade reuses the welcome step's exact geometry (`count 9 / legs 120 /
 * w-130% / -bottom-6`), so the two screens read as the same backdrop rather
 * than two takes on it.
 */
function BrandStage() {
  return (
    <div
      aria-hidden
      className="relative hidden min-h-0 flex-1 items-center overflow-hidden px-10 lg:flex xl:px-16"
    >
      <MorechatArcade
        count={9}
        legs={120}
        rise="center"
        delay={0.5}
        className="pointer-events-none absolute -bottom-6 left-1/2 w-[130%] max-w-none -translate-x-1/2 text-muted"
      />
      <div className="relative flex w-full max-w-[26rem] flex-col gap-6">
        <span className="h-px w-14 bg-border" />
        <MorechatWordmark className="text-[clamp(2.25rem,3vw,3.25rem)] text-foreground" />
      </div>
    </div>
  );
}

/**
 * Title + one supporting line, in onboarding's type hierarchy: the serif
 * display face carries the headline (its welcome hero), the lede is a single
 * muted line. No eyebrow, no second label for the same screen.
 *
 * `aria-live` mirrors onboarding's `StepHeading`: the panes persist across
 * steps, so a screen reader user moving email → code gets no navigation event
 * and the new heading has to announce itself. It is scoped to this block, not
 * the stage, so the form controls are never re-read along with it.
 */
function StageHeading({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5" aria-live="polite">
      <h1 className="text-balance font-serif text-display font-medium leading-[1.12] tracking-tight text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="text-pretty text-body-lg text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

// Component

export function LoginPage({
  logo,
  onSuccess,
  google,
  cliCallback,
  onTokenObtained,
  onGoogleLogin,
  extra,
  exiting = false,
}: LoginPageProps) {
  const { t } = useT("auth");
  const qc = useQueryClient();
  const [step, setStep] = useState<LoginStep>("form");
  // Email codes first: that is what every server before the password contract
  // supports, and the config probe below replaces this with the password form
  // when the server says it can do better.
  const [mode, setMode] = useState<LoginMode>("code");
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  // The probe found no answer at all (404, old build, or no network): the
  // panel stays on codes and says so instead of pretending passwords work.
  const [passwordUnavailable, setPasswordUnavailable] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [existingUser, setExistingUser] = useState<User | null>(null);
  // Tracks how the existing session was detected so handleCliAuthorize
  // uses the matching token source (cookie → issueCliToken, localStorage → direct).
  const authSourceRef = useRef<"cookie" | "localStorage">("cookie");
  // A CLI password login that must change its password first: the redirect
  // waits for the new one, so the token is parked here.
  const cliTokenRef = useRef<string | null>(null);
  // The capability answer is applied once. A probe that resolves after the
  // visitor has already started typing must not swap the form under them.
  const capabilitiesSettledRef = useRef(false);
  // The last session ended because the server rejected its credential, not
  // because the user asked to leave. Without saying so, landing here reads as
  // the app having lost their work for no reason.
  const sessionExpired = useAuthStore((state) => state.expired);

  // Which sign-in methods this server offers (CONTRACTS.md 登录契约). The
  // server owns the answer; a missing endpoint or payload keeps the legacy
  // email-code flow rather than inventing capabilities.
  useEffect(() => {
    let active = true;
    const settle = (config: unknown) => {
      if (!active || capabilitiesSettledRef.current) return;
      capabilitiesSettledRef.current = true;
      if (config === null || config === undefined) {
        setPasswordUnavailable(true);
        setMode("code");
        return;
      }
      const next = normalizeAuthCapabilities(config);
      setCapabilities(next);
      setMode(next.password_enabled ? "password" : "code");
    };

    void (async () => {
      try {
        // Optional call: a test double or a very old shell may not expose the
        // probe at all, which is the same "no answer" case as a 404.
        const config = await api.getAuthConfig?.();
        settle(config ?? null);
      } catch {
        settle(null);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Check for existing session when CLI callback is present.
  // Prioritises cookie auth (= current browser session) to avoid authorising
  // the CLI with a stale or mismatched localStorage token.
  useEffect(() => {
    if (!cliCallback) return;

    // Snapshot the token before probing. The probe below is *expected* to 401
    // for a token-mode session, and a 401 ends the session — clearing this
    // very key — so reading it after the probe would always come back null
    // and the fallback could never run.
    const storedToken = localStorage.getItem("multica_token");

    // Ensure no stale bearer token interferes — we want to test the cookie first.
    api.setToken(null);

    api
      .getMe()
      .then((user) => {
        authSourceRef.current = "cookie";
        setExistingUser(user);
        setStep("cli_confirm");
      })
      .catch(() => {
        // Cookie auth failed — fall back to the token this browser had.
        if (!storedToken) return;

        localStorage.setItem("multica_token", storedToken);
        api.setToken(storedToken);
        api
          .getMe()
          .then((user) => {
            authSourceRef.current = "localStorage";
            setExistingUser(user);
            setStep("cli_confirm");
          })
          .catch(() => {
            api.setToken(null);
            localStorage.removeItem("multica_token");
          });
      });
  }, [cliCallback]);

  // Cooldown timer for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendCode = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!email) {
        setError(t(($) => $.common.email_required));
        return;
      }
      setLoading(true);
      setError("");
      try {
        await useAuthStore.getState().sendCode(email);
        setStep("code");
        setCode("");
        setCooldown(60);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `${t(($) => $.errors.send_failed)} ${t(($) => $.errors.server_unreachable)}`,
        );
      } finally {
        setLoading(false);
      }
    },
    [email, t],
  );

  const passwordErrorText = useCallback(
    (failure: { kind: PasswordFailure; retryAfterSeconds?: number }) => {
      switch (failure.kind) {
        case "invalid_credentials":
          return t(($) => $.password.invalid_credentials);
        case "locked":
          return failure.retryAfterSeconds
            ? t(($) => $.password.locked, { seconds: failure.retryAfterSeconds })
            : t(($) => $.password.locked_no_wait);
        case "weak_password":
          return t(($) => $.password.weak_password);
        case "unavailable":
          return t(($) => $.password.unavailable);
        default:
          return t(($) => $.signin.password_failed);
      }
    },
    [t],
  );

  // Seeds the workspace list into the Query cache so the caller's onSuccess
  // can read it synchronously to compute a destination URL (first workspace's
  // slug, or /workspaces/new for zero-workspace users).
  const finishLogin = useCallback(async () => {
    const wsList = await api.listWorkspaces();
    qc.setQueryData(workspaceKeys.list(), wsList);
    onTokenObtained?.();
    onSuccess();
  }, [qc, onSuccess, onTokenObtained]);

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password || loading) return;
    setLoading(true);
    setError("");
    try {
      if (cliCallback) {
        const { token } = await api.loginWithPassword(email, password);
        if (api.consumeMustChangePassword?.() === true) {
          // Keep the session usable for the password change, then redirect to
          // the CLI once the new password is saved.
          localStorage.setItem("multica_token", token);
          api.setToken(token);
          cliTokenRef.current = token;
          setStep("force_password");
          return;
        }
        onTokenObtained?.();
        redirectToCliCallback(cliCallback.url, token, cliCallback.state);
        return;
      }
      await useAuthStore.getState().loginWithPassword(email, password);
      if (api.consumeMustChangePassword?.() === true) {
        // The account is signed in, but the session is only good for setting
        // a new password (CONTRACTS.md). Stay on the stage; onSuccess fires
        // after the change so the caller never routes into the app first.
        setStep("force_password");
        return;
      }
      await finishLogin();
    } catch (err) {
      // Do not echo provider/network request details or credentials into UI.
      setError(passwordErrorText(readPasswordFailure(err)));
    } finally {
      setPassword("");
      setLoading(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    if (newPassword.length < 10) {
      setError(t(($) => $.password.weak_password));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t(($) => $.password.passwords_do_not_match));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.changePassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      const cliToken = cliTokenRef.current;
      if (cliToken && cliCallback) {
        onTokenObtained?.();
        redirectToCliCallback(cliCallback.url, cliToken, cliCallback.state);
        return;
      }
      await finishLogin();
    } catch (err) {
      const failure = readPasswordFailure(err);
      // A rejected change without a contract code is the change call failing,
      // not a wrong current password: say that instead of borrowing the
      // sign-in sentence.
      setError(
        failure.kind === "unknown"
          ? t(($) => $.password.change_failed)
          : passwordErrorText(failure),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = useCallback(
    async (value: string) => {
      if (value.length !== 6) return;
      setLoading(true);
      setError("");
      try {
        if (cliCallback) {
          // CLI path: get token directly for the redirect URL
          const { token } = await api.verifyCode(email, value);
          localStorage.setItem("multica_token", token);
          api.setToken(token);
          onTokenObtained?.();
          redirectToCliCallback(cliCallback.url, token, cliCallback.state);
          return;
        }

        // Normal path: seed the workspace list into the Query cache so the
        // caller's onSuccess can read it synchronously to compute a destination
        // URL (first workspace's slug, or /workspaces/new for zero-workspace
        // users).
        await useAuthStore.getState().verifyCode(email, value);
        const wsList = await api.listWorkspaces();
        qc.setQueryData(workspaceKeys.list(), wsList);
        onTokenObtained?.();
        onSuccess();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t(($) => $.errors.code_invalid),
        );
        setCode("");
        setLoading(false);
      }
    },
    [email, onSuccess, cliCallback, onTokenObtained, qc, t],
  );

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError("");
    try {
      await useAuthStore.getState().sendCode(email);
      setCooldown(60);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t(($) => $.errors.resend_failed),
      );
    }
  };

  const handleCliAuthorize = async () => {
    if (!cliCallback) return;
    setLoading(true);

    try {
      let token: string;

      if (authSourceRef.current === "localStorage") {
        // Session was detected via localStorage — reuse that token directly.
        const stored = localStorage.getItem("multica_token");
        if (!stored) throw new Error("token missing");
        token = stored;
      } else {
        // Session was detected via cookie — obtain a bearer token from the server.
        const res = await api.issueCliToken();
        token = res.token;
      }

      onTokenObtained?.();
      redirectToCliCallback(cliCallback.url, token, cliCallback.state);
    } catch {
      setError(t(($) => $.errors.cli_auth_failed));
      setExistingUser(null);
      setStep("form");
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (onGoogleLogin) {
      onGoogleLogin();
      return;
    }
    if (!google) return;
    const params = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: google.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
    });
    if (google.state) params.set("state", google.state);
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  };

  // CLI confirm step

  if (step === "cli_confirm" && existingUser) {
    // No step-change live region on this screen: it replaced the form, and it
    // is the first thing a keyboard or screen-reader user reaches anyway.
    // Announcing the heading again on mount is the duplicate to avoid.
    return (
      <LoginStage logo={logo} exiting={exiting}>
        <div className="flex flex-col gap-8">
          <StageHeading
            title={t(($) => $.cli.title)}
            description={t(($) => $.cli.description, {
              email: existingUser.email,
            })}
          />
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleCliAuthorize}
              disabled={loading || exiting}
              className="w-full"
              size="lg"
            >
              {loading
                ? t(($) => $.cli.authorizing)
                : t(($) => $.cli.authorize)}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={exiting}
              onClick={() => {
                setExistingUser(null);
                setStep("form");
              }}
            >
              {t(($) => $.cli.different_account)}
            </Button>
          </div>
        </div>
      </LoginStage>
    );
  }

  // Forced password change (CONTRACTS.md: must_change_password)

  if (step === "force_password") {
    return (
      <LoginStage logo={logo} exiting={exiting}>
        <div className="flex flex-col gap-8">
          <StageHeading
            title={t(($) => $.password.must_change_title)}
            description={t(($) => $.password.must_change_description)}
          />
          <form
            id="change-password-form"
            onSubmit={handleChangePassword}
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-new-password">
                {t(($) => $.password.new_password)}
              </Label>
              <Input
                id="login-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoFocus
                required
                disabled={loading || exiting}
                className="h-10 bg-background"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-confirm-password">
                {t(($) => $.password.confirm_password)}
              </Label>
              <Input
                id="login-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                disabled={loading || exiting}
                className="h-10 bg-background"
              />
            </div>
            {error && <p className="text-body text-destructive">{error}</p>}
          </form>
          <Button
            type="submit"
            form="change-password-form"
            className="w-full"
            size="lg"
            disabled={!newPassword || !confirmPassword || loading || exiting}
          >
            {loading
              ? t(($) => $.password.changing_password)
              : t(($) => $.password.change_password)}
          </Button>
        </div>
      </LoginStage>
    );
  }

  // Code verification step

  if (step === "code") {
    return (
      <LoginStage logo={logo} exiting={exiting}>
        <div className="flex flex-col gap-8">
          <StageHeading
            title={t(($) => $.verify.title)}
            description={t(($) => $.verify.description, { email })}
          />
          <div className="flex flex-col items-start gap-5">
            <InputOTP
              autoFocus
              maxLength={6}
              value={code}
              onChange={(value) => {
                setCode(value);
                if (value.length === 6) handleVerify(value);
              }}
              disabled={loading || exiting}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            {error && (
              <p className="text-body text-destructive">{error}</p>
            )}
            <div className="flex items-center gap-2 text-body text-muted-foreground">
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || exiting}
                className="text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
              >
                {cooldown > 0
                  ? t(($) => $.verify.resend_cooldown, { seconds: cooldown })
                  : t(($) => $.verify.resend)}
              </button>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={exiting}
            onClick={() => {
              setStep("form");
              setCode("");
              setError("");
            }}
          >
            {t(($) => $.common.back)}
          </Button>
        </div>
      </LoginStage>
    );
  }

  // Form step (password by default, email code as the fallback)

  const bothDisabled =
    capabilities !== null &&
    !capabilities.password_enabled &&
    !capabilities.code_login_enabled;
  const canSwitch =
    capabilities !== null &&
    (mode === "password"
      ? capabilities.code_login_enabled
      : capabilities.password_enabled);

  return (
    <LoginStage logo={logo} exiting={exiting}>
      <div className="flex flex-col gap-8">
        <StageHeading
          title={
            mode === "password"
              ? t(($) => $.password.title)
              : t(($) => $.signin.title)
          }
          description={
            mode === "password"
              ? t(($) => $.password.description)
              : t(($) => $.signin.description)
          }
        />

        {bothDisabled ? (
          <Alert variant="destructive">
            <AlertDescription>{t(($) => $.password.disabled)}</AlertDescription>
          </Alert>
        ) : (
          <form
            id="login-form"
            onSubmit={mode === "password" ? handlePasswordLogin : handleSendCode}
            className="flex flex-col gap-5"
          >
            {sessionExpired && (
              <Alert className="bg-background">
                <AlertDescription>
                  {t(($) => $.errors.session_expired)}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-email">
                {mode === "password"
                  ? t(($) => $.password.email)
                  : t(($) => $.common.email)}
              </Label>
              <Input
                id="login-email"
                type="email"
                placeholder={t(($) => $.common.email_placeholder)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                disabled={exiting}
                className="h-10 bg-background"
              />
            </div>
            {mode === "password" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="login-password">
                  {t(($) => $.password.password)}
                </Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading || exiting}
                  required
                  className="h-10 bg-background"
                />
              </div>
            )}
            {error && (
              <p className="text-body text-destructive">{error}</p>
            )}
          </form>
        )}

        <div className="flex flex-col gap-3">
          {!bothDisabled && (
            <Button
              type="submit"
              form="login-form"
              className="w-full"
              size="lg"
              disabled={
                !email ||
                loading ||
                exiting ||
                (mode === "password" && !password)
              }
            >
              {mode === "password"
                ? (loading ? t(($) => $.password.submitting) : t(($) => $.password.submit))
                : (loading ? t(($) => $.signin.sending) : t(($) => $.signin.continue))}
            </Button>
          )}
          {bothDisabled && (
            // No method left: the sentence above says so, and the panel keeps
            // the brand and nothing to press.
            <Button type="button" className="w-full" size="lg" disabled>
              {t(($) => $.password.submit)}
            </Button>
          )}
          {canSwitch && !bothDisabled && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={loading || exiting}
              onClick={() => {
                setMode(mode === "password" ? "code" : "password");
                setError("");
              }}
            >
              {mode === "password"
                ? t(($) => $.password.switch_to_code)
                : t(($) => $.password.switch_to_password)}
            </Button>
          )}
          {passwordUnavailable && mode === "code" && (
            <p className="text-body text-muted-foreground">
              {t(($) => $.password.unavailable)}
            </p>
          )}
          {(google || onGoogleLogin) && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              size="lg"
              onClick={handleGoogleLogin}
              disabled={loading || exiting}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {t(($) => $.signin.google)}
            </Button>
          )}
          {extra && <div className="w-full text-center">{extra}</div>}
        </div>
      </div>
    </LoginStage>
  );
}
