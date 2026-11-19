import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@morechat/core/api";
import { renderWithI18n } from "../test/i18n";
import { OverwriteReasonDialog, isOverwriteReasonRequired, useOverwriteRetry } from "./overwrite-reason";

/**
 * The overwrite attribution (§26.3): one dialog, four answers, and the error that
 * opens it.
 *
 * The dialog is asked by three drawers, so what it does is contract-shaped rather
 * than page-shaped: pick a reason and the retry runs; cancel and nothing is sent.
 * The predicate is the other half — a 400 that is *not* this refusal must stay an
 * ordinary save failure instead of opening a question nobody asked.
 */

afterEach(() => {
  cleanup();
});

function apiError(status: number, body: unknown): ApiError {
  return new ApiError("refused", status, status === 400 ? "Bad Request" : "Conflict", body);
}

describe("isOverwriteReasonRequired", () => {
  it("recognises the refusal in either body shape", () => {
    expect(isOverwriteReasonRequired(apiError(400, { reason: "overwrite_reason_required" }))).toBe(
      true,
    );
    expect(isOverwriteReasonRequired(apiError(400, { error: "overwrite_reason_required" }))).toBe(
      true,
    );
  });

  it("leaves every other error alone", () => {
    expect(isOverwriteReasonRequired(apiError(400, { error: "invalid_stage" }))).toBe(false);
    expect(isOverwriteReasonRequired(apiError(409, { reason: "overwrite_reason_required" }))).toBe(
      false,
    );
    expect(isOverwriteReasonRequired(new Error("network"))).toBe(false);
    expect(isOverwriteReasonRequired(null)).toBe(false);
  });
});

describe("OverwriteReasonDialog", () => {
  it("offers exactly the four contract reasons", async () => {
    renderWithI18n(
      <OverwriteReasonDialog open pending={false} onPick={() => {}} onCancel={() => {}} />,
    );

    for (const label of ["Wrong fact", "Wrong judgement", "It went stale", "A matter of taste"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("sends the picked reason and nothing else", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    renderWithI18n(
      <OverwriteReasonDialog open pending={false} onPick={onPick} onCancel={() => {}} />,
    );

    await user.click(screen.getByRole("button", { name: "It went stale" }));
    expect(onPick).toHaveBeenCalledWith("stale");
  });

  it("abandons the save when the reader cancels", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onCancel = vi.fn();
    renderWithI18n(
      <OverwriteReasonDialog open pending={false} onPick={onPick} onCancel={onCancel} />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("waits for the server while a retry is in flight", () => {
    renderWithI18n(
      <OverwriteReasonDialog open pending onPick={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Wrong fact" })).toBeDisabled();
  });
});

describe("useOverwriteRetry", () => {
  it("runs the registered retry once and forgets it", async () => {
    const retry = vi.fn(async () => true);
    const states: boolean[] = [];

    function Harness() {
      const overwrite = useOverwriteRetry();
      states.push(overwrite.open);
      return (
        <div>
          <button type="button" onClick={() => overwrite.ask(retry)}>
            ask
          </button>
          <button type="button" onClick={() => void overwrite.pick("wrong_fact")}>
            pick
          </button>
          <span data-testid="open">{String(overwrite.open)}</span>
        </div>
      );
    }

    const user = userEvent.setup();
    renderWithI18n(<Harness />);
    expect(screen.getByTestId("open").textContent).toBe("false");

    await user.click(screen.getByRole("button", { name: "ask" }));
    expect(screen.getByTestId("open").textContent).toBe("true");

    await user.click(screen.getByRole("button", { name: "pick" }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith("wrong_fact"));
    // A second pick has nothing to run: the retry was consumed.
    await user.click(screen.getByRole("button", { name: "pick" }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("open").textContent).toBe("false");
  });
});
