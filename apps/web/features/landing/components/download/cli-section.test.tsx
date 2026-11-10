import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CliSection } from "./cli-section";

vi.mock("../../i18n", () => ({
  useLocale: () => ({
    t: {
      download: {
        cli: {
          title: "Prefer the CLI?",
          sub: "For servers and headless setups.",
          installLabel: "Install",
          platformGroup: "Choose your platform",
          platformMacosLinux: "macOS / Linux",
          platformWindows: "Windows",
          startLabel: "Start daemon",
          copyLabel: "Copy",
          copiedLabel: "Copied",
        },
      },
    },
  }),
}));

// The Windows command comes from @morechat/views, which still carries its own
// host; assert the script (not the host) so this stays a wiring test.
const WINDOWS_SCRIPT = /install\.ps1/;

describe("CliSection", () => {
  // The switch itself is covered in @morechat/views; this checks the landing
  // dictionary is wired into it and the daemon block stays shared.
  it("wires the platform switch into the install block", async () => {
    const user = userEvent.setup();
    render(<CliSection />);

    await user.click(screen.getByRole("tab", { name: "Windows" }));

    expect(screen.getByText(WINDOWS_SCRIPT)).toBeInTheDocument();
    expect(screen.getByText("multica setup")).toBeInTheDocument();
  });
});
