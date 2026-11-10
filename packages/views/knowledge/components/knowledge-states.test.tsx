/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithI18n } from "../../test/i18n";
import { KnowledgeQueryState } from "./knowledge-parts";
import { KnowledgeApiError } from "../data/knowledge-api";

afterEach(cleanup);

// The three failures a knowledge surface has to tell apart. A 403 is a
// permission story ("your role cannot read this space"), a 404 is a
// deployment story ("this workspace has no knowledge API yet"), and anything
// else is a bug — they must never collapse into one message.

describe("KnowledgeQueryState", () => {
  it("renders the permission state for a 403", () => {
    renderWithI18n(
      <KnowledgeQueryState error={new KnowledgeApiError("forbidden", 403)} />,
    );

    expect(screen.getByText("You do not have access")).toBeInTheDocument();
    expect(screen.getByText(/Your role cannot read this knowledge space/)).toBeInTheDocument();
    // A permission failure is not retryable by the reader, so no retry affordance.
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("renders the backend-not-ready empty state for a 404", () => {
    renderWithI18n(
      <KnowledgeQueryState error={new KnowledgeApiError("not found", 404)} empty />,
    );

    expect(screen.getByText("Knowledge backend is not ready")).toBeInTheDocument();
    expect(screen.queryByText("You do not have access")).toBeNull();
  });

  it("renders the failure state with a retry for anything else", () => {
    const onRetry = () => {};
    renderWithI18n(
      <KnowledgeQueryState error={new Error("boom")} onRetry={onRetry} />,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows the empty state for a loaded-but-empty list", () => {
    renderWithI18n(<KnowledgeQueryState error={null} empty />);

    expect(screen.getByText("No pages yet")).toBeInTheDocument();
  });
});
