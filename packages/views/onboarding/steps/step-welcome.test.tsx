import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithI18n } from "../../test/i18n";
import { StepWelcome } from "./step-welcome";

// The welcome illustration's mock cards carry issue statuses, and the status
// label used to come from `STATUS_CONFIG.label` — the server's English seed —
// while every other string on the screen went through `useT` (MUL-6850). A
// non-English member met the product on a line that read half in each
// language. These assert against the REAL locale bundles, so a regression that
// re-introduces the English seed fails here rather than in a screenshot.
describe("StepWelcome status labels", () => {
  it("renders the built-in status labels in English", () => {
    renderWithI18n(<StepWelcome onNext={vi.fn()} />);

    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("In Review")).toBeInTheDocument();
    expect(screen.getAllByText("Done")).toHaveLength(2);
  });

  it("localizes them rather than rendering the English seed", () => {
    renderWithI18n(<StepWelcome onNext={vi.fn()} />, { locale: "zh-Hans" });

    expect(screen.getByText("进行中")).toBeInTheDocument();
    expect(screen.getByText("审核中")).toBeInTheDocument();
    expect(screen.getAllByText("已完成")).toHaveLength(2);
    expect(screen.queryByText("In Progress")).not.toBeInTheDocument();
  });
});

// Landing side of the login → onboarding handoff
// (`apps/web/features/auth/login-handoff.ts`). The route swap is client-side,
// so there is no navigation event for a screen reader to follow: the headline
// is the thing that has to take focus, and it has to be the only announcement —
// exactly one focus move, no live region repeating the same text.
describe("StepWelcome login handoff", () => {
  it("takes focus to the headline when it is where a login landed", () => {
    renderWithI18n(<StepWelcome onNext={vi.fn()} enteringFromLogin />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveFocus();
    // Focusable but not a tab stop: it is a landing target, not a control.
    expect(heading).toHaveAttribute("tabindex", "-1");
    // The heading is not inside a live region — focus is what announces it.
    expect(heading.closest("[aria-live]")).toBeNull();
  });

  it("leaves focus alone on an ordinary visit", () => {
    renderWithI18n(<StepWelcome onNext={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
  });
});
