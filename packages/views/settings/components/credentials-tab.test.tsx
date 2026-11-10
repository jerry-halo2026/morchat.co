import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithI18n } from "../../test/i18n";
import { CredentialsTab } from "./credentials-tab";
import type {
  RuntimeConfiguratorBridge,
  RuntimeConfiguratorStatus,
} from "./credentials-bridge";

// The bridge is the only door between this section and the main process, so the
// tests replace `window.runtimeConfigurator` itself rather than mocking an
// import: what a user gets is decided by whether that object exists, and by what
// its three methods answer. Three states are asserted — no desktop shell, a
// desktop shell with only the company credential, and one with a personal key
// already stored — plus the two writes and the "the input is cleared the moment
// the value has been handed over" rule.

function status(overrides: Partial<RuntimeConfiguratorStatus> = {}): RuntimeConfiguratorStatus {
  return {
    state: "configured",
    detail: "已配置 3 个文件",
    ...overrides,
  };
}

function bridge(overrides: Partial<RuntimeConfiguratorBridge> = {}): RuntimeConfiguratorBridge {
  return {
    getStatus: vi.fn(async () =>
      status({
        credentials: {
          keychainAvailable: true,
          company: { configured: true, suffix: "a1b2" },
          personal: { configured: false, suffix: null },
          effective: "company",
        },
      }),
    ),
    setPersonalKey: vi.fn(async (value: string) => ({
      ok: true as const,
      status: status({
        credentialSource: "personal",
        credentials: {
          keychainAvailable: true,
          company: { configured: true, suffix: "a1b2" },
          personal: { configured: true, suffix: value.slice(-4) },
          effective: "company",
        },
      }),
    })),
    clearPersonalKey: vi.fn(async () => ({
      ok: true as const,
      status: status({
        credentials: {
          keychainAvailable: true,
          company: { configured: true, suffix: "a1b2" },
          personal: { configured: false, suffix: null },
          effective: "company",
        },
      }),
    })),
    onStatusChange: vi.fn(() => () => {}),
    ...overrides,
  };
}

function installBridge(api: RuntimeConfiguratorBridge | undefined) {
  const host = window as unknown as { runtimeConfigurator?: RuntimeConfiguratorBridge };
  if (api) host.runtimeConfigurator = api;
  else delete host.runtimeConfigurator;
}

describe("模型凭据 section", () => {
  beforeEach(() => {
    installBridge(undefined);
  });
  afterEach(() => {
    cleanup();
    installBridge(undefined);
  });

  it("says credentials are desktop-only on web, and never offers a form", () => {
    renderWithI18n(<CredentialsTab />);

    expect(screen.getByTestId("credentials-desktop-only")).toBeInTheDocument();
    // No key input, no clear button: a form that cannot reach a keychain would
    // only produce a "saved" message for something that was never stored.
    expect(screen.queryByLabelText("Personal key")).toBeNull();
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
    expect(screen.queryByTestId("credentials-effective")).toBeNull();
  });

  it("renders the company credential as configured and the personal key as unset", async () => {
    const api = bridge();
    installBridge(api);
    renderWithI18n(<CredentialsTab />);

    await waitFor(() =>
      expect(screen.getByTestId("credentials-company-status")).toHaveTextContent("Configured"),
    );
    expect(screen.getByTestId("credentials-personal-status")).toHaveTextContent("Not set");
    expect(screen.getByTestId("credentials-effective")).toHaveTextContent("Company credential");
    // The suffix is shown so a person can recognise the key; the key itself is
    // never part of the payload in the first place.
    expect(screen.getByText(/ending in a1b2/)).toBeInTheDocument();
    expect(api.getStatus).toHaveBeenCalledTimes(1);
    // Read-only mount: opening settings must not write anything.
    expect(api.setPersonalKey).not.toHaveBeenCalled();
    expect(api.clearPersonalKey).not.toHaveBeenCalled();
  });

  it("stores a personal key through IPC, clears the field, and shows it as set", async () => {
    const user = userEvent.setup();
    const api = bridge();
    installBridge(api);
    renderWithI18n(<CredentialsTab />);

    const input = await screen.findByLabelText("Personal key");
    await user.type(input, "sk-personal-key-9z8y");
    await user.click(screen.getByRole("button", { name: /Save/ }));

    expect(api.setPersonalKey).toHaveBeenCalledWith("sk-personal-key-9z8y");
    // The submitted value must not linger in the DOM after it has been handed
    // to the main process.
    await waitFor(() => expect(input).toHaveValue(""));
    await waitFor(() =>
      expect(screen.getByTestId("credentials-personal-status")).toHaveTextContent("Set"),
    );
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();
  });

  it("clears the stored personal key through IPC", async () => {
    const user = userEvent.setup();
    const api = bridge({
      getStatus: vi.fn(async () =>
        status({
          credentials: {
            keychainAvailable: true,
            company: { configured: true, suffix: "a1b2" },
            personal: { configured: true, suffix: "9z8y" },
            effective: "company",
          },
        }),
      ),
    });
    installBridge(api);
    renderWithI18n(<CredentialsTab />);

    await waitFor(() =>
      expect(screen.getByTestId("credentials-personal-status")).toHaveTextContent("Set"),
    );
    await user.click(screen.getByRole("button", { name: /Clear/ }));

    expect(api.clearPersonalKey).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByTestId("credentials-personal-status")).toHaveTextContent("Not set"),
    );
    expect(screen.getByText("Personal key cleared from this device")).toBeInTheDocument();
  });

  it("surfaces a rejected key without claiming it was saved", async () => {
    const user = userEvent.setup();
    const api = bridge({
      setPersonalKey: vi.fn(async () => ({ ok: false as const, reason: "contains-whitespace" as const })),
    });
    installBridge(api);
    renderWithI18n(<CredentialsTab />);

    const input = await screen.findByLabelText("Personal key");
    await user.type(input, "sk key with space");
    await user.click(screen.getByRole("button", { name: /Save/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A key can't contain spaces or line breaks",
    );
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.getByTestId("credentials-personal-status")).toHaveTextContent("Not set");
  });

  it("refreshes the readback when asked", async () => {
    const user = userEvent.setup();
    const api = bridge();
    installBridge(api);
    renderWithI18n(<CredentialsTab />);

    await waitFor(() => expect(api.getStatus).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /Refresh status/ }));
    await waitFor(() => expect(api.getStatus).toHaveBeenCalledTimes(2));
  });

  it("keeps following pushed status changes", async () => {
    let push: ((next: RuntimeConfiguratorStatus) => void) | undefined;
    const api = bridge({
      onStatusChange: vi.fn((callback: (next: RuntimeConfiguratorStatus) => void) => {
        push = callback;
        return () => {};
      }),
    });
    installBridge(api);
    renderWithI18n(<CredentialsTab />);

    await waitFor(() =>
      expect(screen.getByTestId("credentials-personal-status")).toHaveTextContent("Not set"),
    );
    // The push arrives from the main process, i.e. outside React's event
    // system — exactly what `act` is for.
    await act(async () => {
      push?.(
        status({
          credentials: {
            keychainAvailable: true,
            company: { configured: true, suffix: "a1b2" },
            personal: { configured: true, suffix: "9z8y" },
            effective: "personal",
          },
        }),
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId("credentials-personal-status")).toHaveTextContent("Set"),
    );
    expect(screen.getByTestId("credentials-effective")).toHaveTextContent(
      "Personal key (this device only)",
    );
  });

  it("explains a device with no usable system keychain instead of failing silently", async () => {
    installBridge(
      bridge({
        getStatus: vi.fn(async () =>
          status({
            credentials: {
              keychainAvailable: false,
              company: { configured: false, suffix: null },
              personal: { configured: false, suffix: null },
              effective: null,
            },
          }),
        ),
      }),
    );
    renderWithI18n(<CredentialsTab />);

    expect(
      await screen.findByText(/no usable system keychain/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("credentials-effective")).toHaveTextContent(
      "No credential available",
    );
    expect(screen.getByLabelText("Personal key")).toBeDisabled();
  });
});
