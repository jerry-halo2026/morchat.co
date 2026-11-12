import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent } from "@morechat/core/types";
import { decodeAoraSpec } from "@morechat/core/avatar/aora-spec";
import { renderWithI18n } from "../../test/i18n";
import { AgentDetailInspector } from "./agent-detail-inspector";

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ data: undefined, isSuccess: false }),
}));

// The upload/emoji control is deliberately not part of this form any more; the
// mock exists so the assertion fails on a re-added row instead of on a control
// that silently renders nothing.
vi.mock("../../common/avatar-upload-control", () => ({
  AvatarUploadControl: () => <div data-testid="avatar-upload" />,
}));

vi.mock("./inspector/model-picker", () => ({
  ModelPicker: () => <div data-testid="model-picker" />,
}));

vi.mock("./inspector/runtime-picker", () => ({
  RuntimePicker: () => <div data-testid="runtime-picker" />,
}));

vi.mock("./inspector/thinking-prop-row", () => ({
  ThinkingSettingField: () => <div data-testid="thinking-field" />,
}));

vi.mock("./inspector/service-tier-setting-field", () => ({
  ServiceTierSettingField: () => <div data-testid="service-tier-field" />,
}));

const SPEC = "aora::blob:blue:capsule:vector:1a2b";

const agent = {
  id: "agent-1",
  workspace_id: "workspace-1",
  name: "Lambda",
  description: "Test agent",
  runtime_id: "runtime-1",
  avatar_url: SPEC,
} as Agent;

function renderInspector(onUpdate = vi.fn(async () => {})) {
  return renderWithI18n(
    <AgentDetailInspector
      agent={agent}
      runtime={null}
      runtimes={[]}
      members={[]}
      currentUserId="user-1"
      canEdit
      onUpdate={onUpdate}
    />,
  );
}

describe("AgentDetailInspector avatar", () => {
  afterEach(() => {
    cleanup();
  });

  // The page used to offer two avatar surfaces side by side — the upload/emoji
  // control and the Aora editor — so people read the settings as "the same
  // avatar settings as before". The avatar itself is now the only entry point.
  it("offers the avatar itself as the single editor entry", () => {
    renderInspector();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.queryByTestId("avatar-upload")).toBeNull();

    const editor = document.querySelector('[data-aora-editor="agent-1"]');
    expect(editor).not.toBeNull();
    // Upstream's Studio button is the entry: pressing the face edits the face.
    expect(screen.getAllByRole("button", { name: "Edit avatar" })).toHaveLength(1);
  });

  it("writes the spec a rolled face is confirmed with", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(async () => {});
    renderInspector(onUpdate);

    await user.click(screen.getByRole("button", { name: "Randomize" }));
    // A roll is a preview: nothing is written before the confirmation.
    expect(onUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Use this one" }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const [agentId, patch] = onUpdate.mock.calls[0]! as unknown as [
      string,
      { avatar_url: string },
    ];
    expect(agentId).toBe("agent-1");
    expect(patch.avatar_url.startsWith("aora:")).toBe(true);
    expect(decodeAoraSpec(patch.avatar_url)).not.toBeNull();
  });
});
