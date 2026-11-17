import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithI18n } from "../test/i18n";
import {
  CalendarView,
  type CalendarEvent,
  type CalendarViewProps,
} from "./calendar-view";

// Every date in these tests is written as a `YYYY-MM-DD` calendar day, the way
// the component takes it: nothing here builds an instant, so the suite says the
// same thing in Jakarta and in Los Angeles.
const ANCHOR = "2026-11-17";

function renderCalendar(overrides: Partial<CalendarViewProps> = {}) {
  const onAnchorChange = vi.fn();
  const onSelectDay = vi.fn();
  const onSelectEvent = vi.fn();
  const props: CalendarViewProps = {
    view: "month",
    anchor: ANCHOR,
    events: [],
    onAnchorChange,
    onSelectDay,
    onSelectEvent,
    label: "Schedule",
    ...overrides,
  };
  const result = renderWithI18n(<CalendarView {...props} />);
  return { ...result, onAnchorChange, onSelectDay, onSelectEvent };
}

function dayCell(container: HTMLElement, date: string): HTMLElement {
  const cell = container.querySelector<HTMLElement>(`[data-date="${date}"]`);
  if (!cell) throw new Error(`no day cell for ${date}`);
  return cell;
}

function eventsOn(date: string, count: number): CalendarEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${date}-${index}`,
    date,
    title: `Item ${index}`,
  }));
}

describe("CalendarView month", () => {
  it("renders six Monday-started rows — 42 cells — for the anchor month", () => {
    const { container } = renderCalendar();
    const cells = Array.from(container.querySelectorAll("[data-date]"));

    expect(cells).toHaveLength(42);
    // 2026-11-01 is a Sunday, so the grid opens on Monday 2026-10-26 and closes
    // on Sunday 2026-12-06.
    const first = cells.at(0)?.getAttribute("data-date") ?? "";
    const last = cells.at(41)?.getAttribute("data-date") ?? "";
    expect(first).toBe("2026-10-26");
    expect(last).toBe("2026-12-06");
    expect(new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, Number(first.slice(8, 10))).getDay()).toBe(1);
  });

  it("keeps the day number of its own local day", () => {
    const { container } = renderCalendar();

    // A UTC-parsed `new Date("2026-11-01")` would print 10-31 west of
    // Greenwich; the grid must always print the day the string names.
    expect(dayCell(container, "2026-11-01")).toHaveTextContent("1");
    expect(dayCell(container, "2026-11-30")).toHaveTextContent("30");
  });

  it("shows three events per cell and counts the rest as +N", () => {
    const { container } = renderCalendar({
      events: eventsOn(ANCHOR, 5),
    });
    const cell = dayCell(container, ANCHOR);

    expect(cell.querySelectorAll("[data-event-id]")).toHaveLength(3);
    expect(within(cell).getByText("+2")).toBeInTheDocument();
  });

  it("reports the clicked calendar day", () => {
    const { container, onSelectDay } = renderCalendar();

    fireEvent.click(dayCell(container, "2026-11-05"));

    expect(onSelectDay).toHaveBeenCalledTimes(1);
    expect(onSelectDay).toHaveBeenCalledWith("2026-11-05");
  });

  it("opens the anchor's month in the reader's language", () => {
    renderWithI18n(
      <CalendarView
        view="month"
        anchor={ANCHOR}
        events={[]}
        onAnchorChange={() => {}}
        label="Schedule"
      />,
      { locale: "zh-Hans" },
    );

    expect(screen.getByText("2026年11月")).toBeInTheDocument();
  });
});

describe("CalendarView week", () => {
  it("catches an event with no time in the all-day row", () => {
    const { container } = renderCalendar({
      view: "week",
      events: [
        { id: "standup", date: ANCHOR, title: "Stand up" },
        { id: "interview", date: ANCHOR, time: "09:30", title: "Interview" },
      ],
    });

    const allDay = container.querySelector<HTMLElement>(
      `[data-allday="${ANCHOR}"]`,
    );
    expect(allDay).not.toBeNull();
    expect(within(allDay as HTMLElement).getByText("Stand up")).toBeInTheDocument();
    expect(
      within(allDay as HTMLElement).queryByText("Interview"),
    ).toBeNull();
    // 09:30 lands in the 09:00 row, not in the all-day row.
    expect(
      container.querySelector(`[data-hour-cell="${ANCHOR}T09"]`),
    ).toHaveTextContent("Interview");
  });

  it("moves a week per arrow key", () => {
    const { container, onAnchorChange } = renderCalendar({ view: "week" });
    const grid = container.querySelector('[role="grid"]');

    fireEvent.keyDown(grid as HTMLElement, { key: "ArrowRight" });
    expect(onAnchorChange).toHaveBeenLastCalledWith("2026-11-24");

    fireEvent.keyDown(grid as HTMLElement, { key: "ArrowLeft" });
    expect(onAnchorChange).toHaveBeenLastCalledWith("2026-11-10");
  });

  it("names the week as the Monday-to-Sunday span it shows", () => {
    const { container } = renderCalendar({ view: "week" });

    expect(
      container.querySelector('[data-slot="calendar-title"]'),
    ).toHaveTextContent("Nov 16 – Nov 22");
  });
});

describe("CalendarView navigation", () => {
  it("shifts the anchor by a month, clamping a short month", () => {
    const next = renderCalendar();
    fireEvent.click(
      next.container.querySelector('[data-slot="calendar-next"]') as HTMLElement,
    );
    expect(next.onAnchorChange).toHaveBeenLastCalledWith("2026-12-17");

    fireEvent.click(
      next.container.querySelector('[data-slot="calendar-prev"]') as HTMLElement,
    );
    expect(next.onAnchorChange).toHaveBeenLastCalledWith("2026-10-17");

    // 2026-01-31 has no 31st to land on in February.
    const clamped = renderCalendar({ anchor: "2026-01-31" });
    fireEvent.click(
      clamped.container.querySelector(
        '[data-slot="calendar-next"]',
      ) as HTMLElement,
    );
    expect(clamped.onAnchorChange).toHaveBeenLastCalledWith("2026-02-28");
  });

  it("returns to today from the toolbar", () => {
    const { container, onAnchorChange } = renderCalendar();

    fireEvent.click(
      container.querySelector('[data-slot="calendar-today"]') as HTMLElement,
    );

    const [today] = onAnchorChange.mock.calls.at(-1) as [string];
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("CalendarView with no events", () => {
  it("renders an empty month grid and a single dash for an empty week", () => {
    const month = renderCalendar();
    expect(month.container.querySelectorAll("[data-date]")).toHaveLength(42);
    expect(month.container.querySelectorAll("[data-event-id]")).toHaveLength(0);

    const week = renderCalendar({ view: "week" });
    expect(week.container.querySelector("[data-allday]")).toBeNull();
    expect(
      week.container.querySelector('[data-empty="true"]'),
    ).toHaveTextContent("\u2014");
  });
});
