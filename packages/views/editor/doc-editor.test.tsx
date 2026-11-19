import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithI18n } from "../test/i18n";
import en from "../locales/en/blocks.json";
import { DocEditor } from "./doc-editor";

// jsdom has no layout, so `Range` exposes neither of the geometry methods
// ProseMirror reads back after a DOM-mutating edit (`scrollToSelection` ->
// `coordsAtPos` -> `singleRect`). Without these two stubs every keystroke
// throws *after* the transaction already succeeded, which would fail the file
// on the uncaught error rather than on an assertion.
const ZERO_RECT: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
};
Range.prototype.getClientRects = function getClientRects() {
  return [] as unknown as DOMRectList;
};
Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return ZERO_RECT;
};

// The editor's contract is what a host can rely on: one value in, one value out
// (on blur, not per keystroke), a ceiling that actually refuses input, and
// chrome that disappears when the field is not editable.

const LABEL = "Content script";
const ALERT = "Required";

function limitText(count: number): string {
  return en.doc_editor.limit.replace("{{count}}", String(count));
}

afterEach(cleanup);

describe("DocEditor", () => {
  it("hands the HTML back once, when the reader leaves the field", async () => {
    const onChange = vi.fn();
    renderWithI18n(<DocEditor label={LABEL} value="" onChange={onChange} />);

    const body = await screen.findByRole("textbox", { name: LABEL });
    await userEvent.click(body);
    await userEvent.keyboard("hook");

    // Typing alone never reaches the host: a controlled parent would re-render
    // the editor mid-word.
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(body);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toContain("hook");
    expect(onChange.mock.calls[0]![0]).toMatch(/^</);
  });

  it("refuses input past maxLength and says where the ceiling is", async () => {
    const onChange = vi.fn();
    renderWithI18n(
      <DocEditor label={LABEL} value="<p>abcd</p>" maxLength={4} onChange={onChange} />,
    );

    const body = await screen.findByRole("textbox", { name: LABEL });
    await userEvent.click(body);
    await userEvent.keyboard("x");

    // The document is unchanged: the transaction never reached the state.
    expect(body.textContent).toBe("abcd");
    expect(await screen.findByText(limitText(4))).toBeInTheDocument();

    fireEvent.blur(body);
    expect(onChange).not.toHaveBeenCalledWith(expect.stringContaining("x"));
  });

  it("marks the active format with aria-pressed", async () => {
    renderWithI18n(<DocEditor label={LABEL} value="<p>hook</p>" onChange={() => {}} />);

    const bold = await screen.findByRole("button", { name: en.doc_editor.tools.bold });
    expect(bold).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(bold);

    await waitFor(() => expect(bold).toHaveAttribute("aria-pressed", "true"));
  });

  it("hides the toolbar and refuses input when readOnly", async () => {
    renderWithI18n(
      <DocEditor label={LABEL} value="<p>Published</p>" readOnly onChange={() => {}} />,
    );

    const body = await screen.findByRole("textbox", { name: LABEL });

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(body).toHaveAttribute("contenteditable", "false");
  });

  it("renders the error as an alert and marks the surface invalid", async () => {
    renderWithI18n(<DocEditor label={LABEL} value="" error={ALERT} onChange={() => {}} />);

    const body = await screen.findByRole("textbox", { name: LABEL });

    expect(await screen.findByRole("alert")).toHaveTextContent(ALERT);
    expect(body).toHaveAttribute("aria-invalid", "true");
  });

  it("falls back to a textarea in plain mode and reports the raw string", async () => {
    const onChange = vi.fn();
    renderWithI18n(
      <DocEditor mode="plain" label={LABEL} value="" onChange={onChange} />,
    );

    const box = screen.getByRole("textbox", { name: LABEL });
    expect(box.tagName).toBe("TEXTAREA");

    // "> " is text here, not markup: the plain surface has no schema to parse.
    fireEvent.change(box, { target: { value: "hook\n> quote\n- item" } });
    fireEvent.blur(box);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toBe("hook\n> quote\n- item");
  });

  it("emits once after the quiet period, without waiting for blur", () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      renderWithI18n(<DocEditor mode="plain" label={LABEL} value="" onChange={onChange} />);
      const box = screen.getByRole("textbox", { name: LABEL });

      fireEvent.change(box, { target: { value: "a" } });
      fireEvent.change(box, { target: { value: "ab" } });
      expect(onChange).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(onChange).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("ab");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps block structure and strips styling and scripts on paste", async () => {
    const onChange = vi.fn();
    renderWithI18n(<DocEditor label={LABEL} value="" onChange={onChange} />);

    const body = await screen.findByRole("textbox", { name: LABEL });
    const pasted =
      '<p style="color:red" onclick="steal()">hook</p><script>alert(1)</script>' +
      "<ul><li>item</li></ul>";

    fireEvent.paste(body, {
      clipboardData: {
        types: ["text/html"],
        getData: (type: string) => (type === "text/html" ? pasted : ""),
      },
    });
    fireEvent.blur(body);

    const out = onChange.mock.calls[0]![0] as string;
    // The fragment is rebuilt through the schema: paragraph and list survive,
    // the inline style and the script have no rule to land in and are dropped.
    expect(out).toContain("<p>hook</p>");
    expect(out).toContain("<li><p>item</p></li>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("style=");
  });
});
