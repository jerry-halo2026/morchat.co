import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CapAvatarPicker } from "./cap-avatar-picker";
import { parseCap } from "../../lib/agent-bot/appearance";

/**
 * 受控宿主：选择器本身不存值，值必须回报给调用方（创建页的 draft /
 * dialog 的 state）。测试用这层确保每次交互都真的走了一遍 onChange。
 */
function Harness({
  initial,
  onChange,
}: {
  initial: string | null;
  onChange?: (value: string | null) => void;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <>
      <CapAvatarPicker
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <output data-testid="value">{value ?? "null"}</output>
    </>
  );
}

function currentValue(): string | null {
  const raw = screen.getByTestId("value").textContent ?? "";
  return raw === "null" ? null : raw;
}

function shape(name: string): HTMLElement {
  return screen.getByRole("button", { name: `形状 ${name}` });
}

function palette(name: string): HTMLElement {
  return screen.getByRole("button", { name: `色板 ${name}` });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CapAvatarPicker 未设置状态", () => {
  it("空值时给出随机生成提示", () => {
    render(<Harness initial={null} />);
    expect(screen.getByText("未设置（新智能体将随机生成）")).toBeInTheDocument();
  });

  it("上传 / emoji 值不被接管，但仍可改选造型", () => {
    render(<Harness initial="emoji:🐼" />);
    expect(
      screen.getByText("当前头像来自上传或 emoji，选择造型会覆盖它"),
    ).toBeInTheDocument();

    fireEvent.click(shape("hex"));
    expect(currentValue()).toBe("cap:hex:deep-tide");
  });
});

describe("CapAvatarPicker 随机", () => {
  it("从 body × palette 里抽一套并写入 formatCap", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    render(<Harness initial={null} />);
    const button = screen.getByRole("button", { name: "随机造型" });

    fireEvent.click(button);
    expect(currentValue()).toBe("cap:blob:deep-tide");

    // 换个随机值必须换一套造型，而不是原地不动。
    random.mockReturnValue(0.99);
    fireEvent.click(button);
    expect(currentValue()).toBe("cap:star6:clay");
    expect(currentValue()).not.toBe("cap:blob:deep-tide");

    expect(parseCap(currentValue())).toEqual({
      bodyId: "star6",
      paletteId: "clay",
    });
  });

  it("随机结果永远在契约内", () => {
    render(<Harness initial={null} />);
    const button = screen.getByRole("button", { name: "随机造型" });
    for (let i = 0; i < 24; i += 1) {
      fireEvent.click(button);
      const parsed = parseCap(currentValue());
      expect(parsed).not.toBeNull();
      expect(currentValue()).toMatch(/^cap:[a-z0-9-]+:[a-z-]+$/);
    }
  });
});

describe("CapAvatarPicker 形状 × 色板", () => {
  it("先选形状再选色板，用当前另一半拼出新值", () => {
    render(<Harness initial={null} />);

    fireEvent.click(shape("hex"));
    expect(currentValue()).toBe("cap:hex:deep-tide");

    fireEvent.click(palette("teal"));
    expect(currentValue()).toBe("cap:hex:teal");

    fireEvent.click(shape("heart"));
    expect(currentValue()).toBe("cap:heart:teal");
  });

  it("已有值时改色板保留当前形状", () => {
    render(<Harness initial="cap:cloud:rose" />);

    fireEvent.click(palette("moss"));
    expect(currentValue()).toBe("cap:cloud:moss");
  });

  it("选中的形状和色板各自标记 aria-pressed", () => {
    render(<Harness initial="cap:star6:clay" />);

    expect(shape("star6")).toHaveAttribute("aria-pressed", "true");
    expect(shape("hex")).toHaveAttribute("aria-pressed", "false");
    expect(palette("clay")).toHaveAttribute("aria-pressed", "true");
    expect(palette("rose")).toHaveAttribute("aria-pressed", "false");
  });

  it("10 个形状 / 17 个色板全部可选", () => {
    render(<Harness initial={null} />);
    expect(screen.getByRole("group", { name: "形状" }).children).toHaveLength(10);
    expect(screen.getByRole("group", { name: "颜色" }).children).toHaveLength(17);
  });
});

describe("CapAvatarPicker 清除与键盘", () => {
  it("清除回报 null", () => {
    const onChange = vi.fn();
    render(<Harness initial="cap:hex:teal" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "清除造型" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(currentValue()).toBeNull();
    expect(screen.getByText("未设置（新智能体将随机生成）")).toBeInTheDocument();
  });

  it("键盘（Enter / 空格）可选形状与色板", () => {
    const onChange = vi.fn();
    render(<Harness initial={null} onChange={onChange} />);

    fireEvent.keyDown(shape("star6"), { key: "Enter" });
    expect(currentValue()).toBe("cap:star6:deep-tide");

    fireEvent.keyDown(palette("rose"), { key: " " });
    expect(currentValue()).toBe("cap:star6:rose");

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("其他按键不改变值", () => {
    render(<Harness initial="cap:hex:teal" />);
    fireEvent.keyDown(shape("egg"), { key: "a" });
    expect(currentValue()).toBe("cap:hex:teal");
  });
});

/**
 * 选择器的两块面板是"所见即所得"：形状预览就是 32px 的真实 `<CapAvatar>`
 * （引擎档起点），色板方块是同一 32px 的纯色本体 —— 不是缩小版装饰。
 */
describe("CapAvatarPicker 网格尺寸与选中态", () => {
  it("形状预览一律 32px，并且是真正的 cap 头像", () => {
    const { container } = render(<Harness initial={null} />);
    const previews = container.querySelectorAll<HTMLElement>('[data-slot="cap-avatar"]');
    // 顶部预览 + 10 个形状预览
    expect(previews).toHaveLength(11);
    for (const preview of previews) {
      expect(preview.style.width).toBe("32px");
      expect(preview.style.height).toBe("32px");
    }
  });

  it("色板方块 32px、纯色、无渐变，并带眼睛墨点", () => {
    const { container } = render(<Harness initial={null} />);
    const swatches = container.querySelectorAll<HTMLElement>('[data-slot="cap-palette-swatch"]');
    expect(swatches).toHaveLength(17);
    for (const swatch of swatches) {
      expect(swatch.style.width).toBe("32px");
      expect(swatch.style.height).toBe("32px");
      // 本体是一个纯色，不是渐变（`background-color` 而不是 `background-image`）。
      expect(swatch.style.backgroundColor).not.toBe("");
      expect(swatch.style.backgroundImage).toBe("");
    }
    const inks = container.querySelectorAll<HTMLElement>('[data-slot="cap-palette-ink"]');
    expect(inks).toHaveLength(17);
  });

  it("选中项带我们的 ring，未选中项没有", () => {
    render(<Harness initial="cap:heart:jade" />);
    // 逐 token 比较：`focus-visible:ring-2` 是焦点圈，不是选中圈。
    const tokens = (el: HTMLElement) => el.className.split(/\s+/);

    expect(tokens(shape("heart"))).toContain("ring-2");
    expect(tokens(shape("heart"))).toContain("ring-ring");
    expect(tokens(shape("blob"))).not.toContain("ring-2");

    expect(tokens(palette("jade"))).toContain("ring-2");
    expect(tokens(palette("amber"))).not.toContain("ring-2");
  });

  it("随机与清除是普通按钮，含 aria-label", () => {
    render(<Harness initial={null} />);
    expect(screen.getByRole("button", { name: "随机造型" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清除造型" })).toBeInTheDocument();
  });
});
