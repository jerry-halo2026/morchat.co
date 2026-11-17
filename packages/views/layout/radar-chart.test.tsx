// @vitest-environment jsdom

import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// recharts measures its own container, and jsdom has no layout: every element
// resolves to 0×0 and the chart renders nothing. Same tactic as
// runtimes/components/usage-section.test.tsx — replace the chart layer instead
// of fighting it. This stub keeps the one recharts contract the radar depends
// on: `PolarAngleAxis` really renders its ticks, from the chart's own `data`,
// so the label truncation below is our tick code and not recharts'.
vi.mock("recharts", async () => {
  const React = await import("react");

  const ChartRows = React.createContext<readonly Record<string, unknown>[]>([]);

  const ResponsiveContainer = ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  );

  const RadarChart = ({
    children,
    data = [],
  }: {
    children?: React.ReactNode;
    data?: readonly Record<string, unknown>[];
  }) => <ChartRows.Provider value={data}>{children}</ChartRows.Provider>;

  const PolarGrid = () => <div data-testid="polar-grid" />;

  const PolarAngleAxis = ({ dataKey, tick }: { dataKey?: string; tick?: unknown }) => {
    const rows = React.useContext(ChartRows);
    const renderTick =
      typeof tick === "function"
        ? (tick as (props: unknown) => React.ReactNode)
        : undefined;
    return (
      <svg data-testid="polar-angle-axis">
        {rows.map((row, index) => (
          <React.Fragment key={index}>
            {renderTick?.({
              x: 80,
              y: 20,
              index,
              textAnchor: "middle",
              verticalAnchor: "middle",
              payload: { value: row[dataKey ?? "label"], payload: row },
            })}
          </React.Fragment>
        ))}
      </svg>
    );
  };

  const Radar = ({ dataKey }: { dataKey?: string }) => (
    <div data-testid={`radar-series-${String(dataKey)}`} />
  );

  return {
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    Radar,
    Tooltip: () => null,
    Legend: () => null,
  };
});

import { RadarChart } from "@morechat/ui/components/ui/radar-chart";

const AXES = [
  { key: "plan", label: "规划" },
  { key: "design", label: "设计" },
  { key: "code", label: "编码" },
  { key: "test", label: "测试" },
  { key: "review", label: "评审" },
  { key: "ops", label: "运维" },
] as const;

const ONE_SERIES = [
  { key: "boss", label: "张三", values: [8, 6, 9, 4, 7, 5] },
] as const;

const TWO_SERIES = [
  ...ONE_SERIES,
  { key: "avg", label: "团队均值", values: [6, 6, 7, 5, 6, 6] },
] as const;

describe("RadarChart", () => {
  it("每个维度渲染一个轴标签", () => {
    render(<RadarChart axes={AXES} series={ONE_SERIES} label="能力画像" />);

    const ticks = screen
      .getByTestId("polar-angle-axis")
      .querySelectorAll("text");
    expect(ticks).toHaveLength(6);
    expect(
      Array.from(ticks).map((tick) => tick.lastChild?.textContent)
    ).toEqual(["规划", "设计", "编码", "测试", "评审", "运维"]);
  });

  it("单序列不渲染图例，多序列渲染图例", () => {
    const { container, unmount } = render(
      <RadarChart axes={AXES} series={ONE_SERIES} label="能力画像" />
    );
    expect(container.querySelector('[data-slot="radar-chart-legend"]')).toBeNull();
    unmount();

    const { container: multi } = render(
      <RadarChart axes={AXES} series={TWO_SERIES} label="能力画像" />
    );
    const legend = multi.querySelector('[data-slot="radar-chart-legend"]');
    expect(legend).not.toBeNull();
    expect(
      Array.from(
        multi.querySelectorAll('[data-slot="radar-chart-legend-item"]')
      ).map((item) => item.textContent)
    ).toEqual(["张三", "团队均值"]);
  });

  it("全 0 值渲染空态而不是空多边形", () => {
    const { container } = render(
      <RadarChart
        axes={AXES}
        series={[{ key: "boss", label: "张三", values: [0, 0, 0, 0, 0, 0] }]}
        label="能力画像"
      />
    );

    const empty = container.querySelector('[data-slot="radar-chart-empty"]');
    expect(empty).not.toBeNull();
    expect(empty).toHaveTextContent("—");
    expect(container.querySelector('[data-testid="radar-series-boss"]')).toBeNull();
    expect(container.querySelector('[data-testid="polar-angle-axis"]')).toBeNull();
  });

  it("没有序列时也走空态", () => {
    const { container } = render(
      <RadarChart axes={AXES} series={[]} label="能力画像" empty="暂无评分" />
    );

    expect(container.querySelector('[data-slot="radar-chart-empty"]')).toHaveTextContent(
      "暂无评分"
    );
  });

  it("loading 渲染骨架而不是图", () => {
    const { container } = render(
      <RadarChart axes={AXES} series={ONE_SERIES} label="能力画像" loading />
    );

    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="radar-chart"]')).toHaveAttribute(
      "data-state",
      "loading"
    );
    expect(container.querySelector('[data-testid="polar-angle-axis"]')).toBeNull();
  });

  it("超过 6 字的轴标签截断，全文保留在 title 里", () => {
    const longAxes = [
      { key: "collab", label: "跨部门协作能力" },
      { key: "plan", label: "规划" },
    ];
    render(
      <RadarChart
        axes={longAxes}
        series={[{ key: "boss", label: "张三", values: [7, 5] }]}
        label="能力画像"
      />
    );

    const ticks = Array.from(
      screen.getByTestId("polar-angle-axis").querySelectorAll("text")
    );
    const [truncated, short] = ticks;
    expect(ticks).toHaveLength(2);

    expect(truncated?.lastChild?.textContent).toBe("跨部门协作能…");
    expect(truncated?.querySelector("title")).toHaveTextContent("跨部门协作能力");
    // A label that already fits is passed through untouched.
    expect(short?.lastChild?.textContent).toBe("规划");
    expect(short?.querySelector("title")).toHaveTextContent("规划");
  });
});
