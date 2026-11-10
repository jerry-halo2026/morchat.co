"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@morechat/ui/components/ui/input";
import { Button } from "@morechat/ui/components/ui/button";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { Laptop, RefreshCw, Trash2 } from "@morechat/ui/icons";
import { useT } from "../../i18n";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsTab,
} from "./settings-layout";
import {
  forgetPersonalKey,
  isCredentialConfigurable,
  readCredentialStatus,
  storePersonalKey,
  subscribeCredentialStatus,
  type CredentialStatusSummary,
  type PersonalKeyRejection,
  type RuntimeConfiguratorStatus,
} from "./credentials-bridge";

/**
 * 模型凭据 — which key this device signs model traffic with.
 *
 * Three things this section must never do, all of them load-bearing:
 *
 *   1. Never render a key. What it shows is a state word and, at most, the last
 *      four characters of a stored value — enough to answer "is this the key I
 *      pasted", useless for anything else.
 *   2. Never pretend to work on web. The personal key lives in the OS keychain
 *      of one machine, so the whole section is desktop-only, and the web build
 *      says exactly that instead of offering a form that cannot store anything.
 *   3. Never guess which source a run used. `effective` is the stored
 *      preference order; the gateway self-check at run time is the authority,
 *      and it can still fall back to the personal key.
 *
 * State lives in this component rather than a query cache: the values are read
 * from the local keychain, not from the API, so there is nothing to invalidate
 * and no request to retry.
 */

type Phase = "loading" | "ready" | "error" | "unsupported";

export function CredentialsTab() {
  const { t } = useT("settings");
  const [phase, setPhase] = useState<Phase>(() =>
    isCredentialConfigurable() ? "loading" : "unsupported",
  );
  const [summary, setSummary] = useState<CredentialStatusSummary | null>(null);
  const [applyDetail, setApplyDetail] = useState<RuntimeConfiguratorStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"save" | "clear" | "refresh" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(
    null,
  );

  const applyStatus = useCallback((status: RuntimeConfiguratorStatus) => {
    setApplyDetail(status);
    if (status.credentials) {
      setSummary(status.credentials);
      setPhase("ready");
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!isCredentialConfigurable()) {
      setPhase("unsupported");
      return;
    }
    try {
      const status = await readCredentialStatus();
      if (!status) {
        setPhase("unsupported");
        return;
      }
      // A status without a credential readback is a half answer: keep the
      // skeleton rather than drawing "未设置" from silence.
      applyStatus(status);
      if (!status.credentials) setPhase("error");
    } catch {
      setPhase("error");
    }
  }, [applyStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A key stored or cleared in another window (or by a finished apply) pushes a
  // new status; following it keeps two open windows from disagreeing.
  useEffect(() => subscribeCredentialStatus(applyStatus), [applyStatus]);

  const rejectionText = (reason: PersonalKeyRejection): string => {
    switch (reason) {
      case "empty":
        return t(($) => $.credentials.rejection.empty);
      case "too-short":
        return t(($) => $.credentials.rejection.too_short);
      case "not-a-key":
        return t(($) => $.credentials.rejection.not_a_key);
      case "contains-whitespace":
        return t(($) => $.credentials.rejection.contains_whitespace);
      case "signed-out":
        return t(($) => $.credentials.rejection.signed_out);
      default:
        return t(($) => $.credentials.rejection.invalid);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy("save");
    setMessage(null);
    try {
      const result = await storePersonalKey(draft);
      if (result.ok) {
        applyStatus(result.status);
        setMessage({ tone: "success", text: t(($) => $.credentials.personal.saved) });
      } else {
        setMessage({ tone: "error", text: rejectionText(result.reason) });
      }
    } catch {
      setMessage({ tone: "error", text: t(($) => $.credentials.rejection.invalid) });
    } finally {
      // The value has served its purpose the moment the main process has it:
      // keeping it in component state (or a form field) only widens the window
      // in which a screenshot or a devtools peek leaks a live key.
      setDraft("");
      setBusy(null);
    }
  };

  const clear = async () => {
    if (busy) return;
    setBusy("clear");
    setMessage(null);
    try {
      const result = await forgetPersonalKey();
      if (result.ok) {
        applyStatus(result.status);
        setMessage({ tone: "success", text: t(($) => $.credentials.personal.cleared) });
      } else {
        setMessage({ tone: "error", text: rejectionText("signed-out") });
      }
    } catch {
      setMessage({ tone: "error", text: t(($) => $.credentials.rejection.invalid) });
    } finally {
      setBusy(null);
    }
  };

  const onRefresh = async () => {
    setBusy("refresh");
    setMessage(null);
    await refresh();
    setBusy(null);
  };

  const sourceLabel = (source: CredentialStatusSummary["effective"]): string => {
    switch (source) {
      case "company":
        return t(($) => $.credentials.effective.company);
      case "personal":
        return t(($) => $.credentials.effective.personal);
      default:
        return t(($) => $.credentials.effective.none);
    }
  };

  const companyDescription = summary?.company.configured
    ? `${t(($) => $.credentials.company.description)} (${
        summary.company.suffix
          ? t(($) => $.credentials.suffix_hint, { suffix: summary.company.suffix })
          : t(($) => $.credentials.company.configured)
      })`
    : t(($) => $.credentials.company.description);

  const personalDescription = `${t(($) => $.credentials.personal.description)} ${
    summary?.personal.configured && summary.personal.suffix
      ? t(($) => $.credentials.suffix_hint, { suffix: summary.personal.suffix })
      : ""
  }`.trim();

  return (
    <SettingsTab
      title={t(($) => $.page.tabs.credentials)}
      description={t(($) => $.credentials.description)}
      scope="device"
    >
      {phase === "unsupported" ? (
        <SettingsSection title={t(($) => $.credentials.desktop_only)}>
          <SettingsCard>
            <SettingsRow
              label={t(($) => $.credentials.desktop_only)}
              description={t(($) => $.credentials.desktop_only_description)}
            >
              <span
                data-testid="credentials-desktop-only"
                className="inline-flex items-center gap-1.5 text-caption text-muted-foreground"
              >
                <Laptop aria-hidden="true" className="size-3.5" />
                {t(($) => $.credentials.desktop_only)}
              </span>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      ) : (
        <>
          <SettingsSection
            title={t(($) => $.credentials.title)}
            anchor="credentials-sources"
          >
            <SettingsCard>
              <SettingsRow
                label={t(($) => $.credentials.company.title)}
                description={companyDescription}
                anchor="credentials-company"
              >
                {phase === "loading" ? (
                  <Skeleton className="h-5 w-24" />
                ) : (
                  <span
                    data-testid="credentials-company-status"
                    className="text-body text-muted-foreground"
                  >
                    {summary?.company.configured
                      ? t(($) => $.credentials.company.configured)
                      : t(($) => $.credentials.company.missing)}
                  </span>
                )}
              </SettingsRow>

              <SettingsRow
                label={
                  <span className="inline-flex items-center gap-2">
                    {t(($) => $.credentials.personal.title)}
                    <span className="rounded-full bg-muted px-2 text-caption text-muted-foreground">
                      {t(($) => $.credentials.personal.device_only)}
                    </span>
                  </span>
                }
                description={personalDescription}
                align="start"
                size="text"
                anchor="credentials-personal"
              >
                {phase === "loading" ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <div className="space-y-2">
                    <form className="flex items-center gap-2" onSubmit={submit}>
                      <label className="sr-only" htmlFor="personal-key-input">
                        {t(($) => $.credentials.personal.title)}
                      </label>
                      <Input
                        id="personal-key-input"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={t(($) => $.credentials.personal.placeholder)}
                        disabled={busy !== null || summary?.keychainAvailable === false}
                        className="flex-1"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          busy !== null ||
                          draft.trim().length === 0 ||
                          summary?.keychainAvailable === false
                        }
                      >
                        {busy === "save"
                          ? t(($) => $.credentials.personal.saving)
                          : t(($) => $.credentials.personal.save)}
                      </Button>
                    </form>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        data-testid="credentials-personal-status"
                        className="text-caption text-muted-foreground"
                      >
                        {summary?.personal.configured
                          ? t(($) => $.credentials.personal.configured)
                          : t(($) => $.credentials.personal.missing)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null || !summary?.personal.configured}
                        onClick={() => void clear()}
                      >
                        <Trash2 aria-hidden="true" className="mr-1 size-3.5" />
                        {busy === "clear"
                          ? t(($) => $.credentials.personal.clearing)
                          : t(($) => $.credentials.personal.clear)}
                      </Button>
                    </div>
                  </div>
                )}
              </SettingsRow>

              <SettingsRow
                label={t(($) => $.credentials.effective.title)}
                description={t(($) => $.credentials.effective.description)}
                anchor="credentials-effective"
              >
                <div className="flex items-center gap-2">
                  {phase === "loading" ? (
                    <Skeleton className="h-5 w-24" />
                  ) : (
                    <span data-testid="credentials-effective" className="text-body">
                      {sourceLabel(summary?.effective ?? null)}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void onRefresh()}
                    disabled={busy !== null}
                    aria-label={t(($) => $.credentials.refresh)}
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={`mr-1 size-3.5 ${busy === "refresh" ? "animate-spin" : ""}`}
                    />
                    {busy === "refresh"
                      ? t(($) => $.credentials.refreshing)
                      : t(($) => $.credentials.refresh)}
                  </Button>
                </div>
              </SettingsRow>
            </SettingsCard>
          </SettingsSection>

          {summary?.keychainAvailable === false ? (
            <p role="status" className="px-0.5 text-caption text-muted-foreground">
              {t(($) => $.credentials.keychain_unavailable)}
            </p>
          ) : null}

          {phase === "error" ? (
            <p role="alert" className="px-0.5 text-caption text-destructive">
              {t(($) => $.credentials.status_unavailable)}
            </p>
          ) : null}

          {message ? (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={
                message.tone === "error"
                  ? "px-0.5 text-caption text-destructive"
                  : "px-0.5 text-caption text-muted-foreground"
              }
            >
              {message.text}
            </p>
          ) : null}

          {applyDetail?.detail ? (
            <p className="px-0.5 text-caption text-muted-foreground">{applyDetail.detail}</p>
          ) : null}
        </>
      )}
    </SettingsTab>
  );
}
