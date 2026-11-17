import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  KanbanBoard,
  resolveDrop,
  type KanbanBoardProps,
  type KanbanColumn,
} from "./kanban-board";

// dnd-kit's pointer sensor needs layout (jsdom reports every rect as 0×0), so
// the drag itself is not simulated: the DndContext below passes through to the
// real one — real sensors, real draggables/droppables, real context — and only
// records the `onDragEnd` it was handed, the handler a pointer release would
// call. Everything a drop does after that (`resolveDrop`, the optimistic
// column, pending, rollback) is the component's own code, exercised for real.
const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as ((event: DragEndEvent) => unknown) | undefined,
}));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    DndContext: (props: Parameters<typeof actual.DndContext>[0]) => {
      dnd.onDragEnd = props.onDragEnd as typeof dnd.onDragEnd;
      return createElement(actual.DndContext, props);
    },
  };
});

interface Candidate {
  id: string;
  name: string;
  stage: string;
}

const COLUMNS: readonly KanbanColumn<Candidate>[] = [
  { key: "applied", title: "Applied" },
  { key: "screening", title: "Screening", tone: "brand" },
  { key: "offer", title: "Offer", tone: "warn" },
];

// A real 3 × 5 board: the shape the recruiting workbench hands over.
const CANDIDATES: readonly Candidate[] = [
  { id: "cand-1", name: "Ada Lin", stage: "applied" },
  { id: "cand-2", name: "Bo Chen", stage: "applied" },
  { id: "cand-3", name: "Cai Wu", stage: "applied" },
  { id: "cand-4", name: "Dai Zhou", stage: "applied" },
  { id: "cand-5", name: "Eli Xu", stage: "applied" },
  { id: "cand-6", name: "Fang Yu", stage: "screening" },
  { id: "cand-7", name: "Gao Sun", stage: "screening" },
  { id: "cand-8", name: "Hana Mori", stage: "screening" },
  { id: "cand-9", name: "Ivo Park", stage: "screening" },
  { id: "cand-10", name: "Jia Tan", stage: "screening" },
  { id: "cand-11", name: "Kai Luo", stage: "offer" },
  { id: "cand-12", name: "Lena Fo", stage: "offer" },
  { id: "cand-13", name: "Ming He", stage: "offer" },
  { id: "cand-14", name: "Nora Qin", stage: "offer" },
  { id: "cand-15", name: "Owen Bai", stage: "offer" },
];

const columnOf = (candidate: Candidate) => candidate.stage;
const itemKey = (candidate: Candidate) => candidate.id;
const candidateById = new Map(CANDIDATES.map((candidate) => [candidate.id, candidate]));

function renderCard(candidate: Candidate) {
  return <span>{candidate.name}</span>;
}

function renderBoard(overrides: Partial<KanbanBoardProps<Candidate>> = {}) {
  return render(
    <KanbanBoard<Candidate>
      columns={COLUMNS}
      items={CANDIDATES}
      columnOf={columnOf}
      itemKey={itemKey}
      renderCard={renderCard}
      label="Recruiting board"
      {...overrides}
    />,
  );
}

const board = () => screen.getByRole("group", { name: "Recruiting board" });
const column = (title: string) =>
  within(board()).getByRole("group", { name: title });

function cardNamed(name: string): HTMLElement {
  const text = screen.getByText(name);
  const card = text.closest<HTMLElement>('[role="listitem"]');
  if (!card) throw new Error(`no card around "${name}"`);
  return card;
}

function dropEvent(activeId: string, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  } as unknown as DragEndEvent;
}

describe("KanbanBoard", () => {
  it("draws a real board: headings, counts, cards, click and Enter", () => {
    const onCardClick = vi.fn();
    renderBoard({ onCardClick });

    expect(board()).toBeInTheDocument();
    for (const { title, key } of COLUMNS) {
      const section = column(title);
      expect(within(section).getByRole("heading", { name: title })).toBeInTheDocument();
      expect(within(section).getByText("5")).toBeInTheDocument();
      expect(within(section).getAllByRole("listitem")).toHaveLength(5);
      expect(within(section).getAllByRole("listitem")[0]).toHaveAttribute(
        "data-kanban-card",
        CANDIDATES.find((candidate) => candidate.stage === key)!.id,
      );
    }

    fireEvent.click(cardNamed("Ada Lin"));
    expect(onCardClick).toHaveBeenCalledTimes(1);
    expect(onCardClick).toHaveBeenCalledWith(candidateById.get("cand-1"));

    const card = cardNamed("Bo Chen");
    card.focus();
    expect(card).toHaveFocus();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onCardClick).toHaveBeenCalledTimes(2);
    expect(onCardClick).toHaveBeenLastCalledWith(candidateById.get("cand-2"));
  });

  it("moves a card to the dropped column and reports it once", () => {
    const onMove = vi.fn();
    renderBoard({ onMove });

    act(() => {
      dnd.onDragEnd?.(dropEvent("cand-1", "offer"));
    });

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(candidateById.get("cand-1"), "offer");
    expect(within(column("Offer")).getByText("Ada Lin")).toBeInTheDocument();
    expect(within(column("Applied")).queryByText("Ada Lin")).toBeNull();
  });

  it("reports nothing for a drop on its own column, an unknown id, or nowhere", () => {
    const onMove = vi.fn();
    renderBoard({ onMove });

    act(() => {
      dnd.onDragEnd?.(dropEvent("cand-1", "applied"));
      dnd.onDragEnd?.(dropEvent("cand-1", "cand-2"));
      dnd.onDragEnd?.(dropEvent("cand-1", "not-a-column"));
      dnd.onDragEnd?.(dropEvent("cand-1", null));
    });

    expect(onMove).not.toHaveBeenCalled();
  });

  it("holds the card in flight, then keeps it once onMove settles", async () => {
    let resolveMove: () => void = () => {};
    const onMove = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMove = resolve;
        }),
    );
    renderBoard({ onMove });

    let settlement: Promise<unknown> = Promise.resolve();
    act(() => {
      settlement = Promise.resolve(dnd.onDragEnd?.(dropEvent("cand-1", "offer")));
    });

    // In flight: already in the target column, not draggable again.
    const inFlight = cardNamed("Ada Lin");
    expect(inFlight).toHaveAttribute("aria-busy", "true");
    expect(inFlight.closest('[data-kanban-column="offer"]')).not.toBeNull();

    await act(async () => {
      resolveMove();
      await settlement;
    });

    const settled = cardNamed("Ada Lin");
    expect(settled).not.toHaveAttribute("aria-busy");
    expect(settled.closest('[data-kanban-column="offer"]')).not.toBeNull();
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("restores the original column when onMove rejects, and reports it once", async () => {
    let rejectMove: (error: unknown) => void = () => {};
    const onMove = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectMove = reject;
        }),
    );
    const onMoveError = vi.fn();
    renderBoard({ onMove, onMoveError });

    let result: unknown;
    let settlement: Promise<unknown> = Promise.resolve();
    act(() => {
      settlement = Promise.resolve(dnd.onDragEnd?.(dropEvent("cand-1", "offer"))).then(
        () => "resolved",
        (error: unknown) => ({ rejected: error }),
      );
    });

    expect(cardNamed("Ada Lin").closest('[data-kanban-column="offer"]')).not.toBeNull();

    await act(async () => {
      rejectMove(new Error("write failed"));
      result = await settlement;
    });

    // Rolled back to the column the caller's data says the card is in.
    expect(cardNamed("Ada Lin").closest('[data-kanban-column="applied"]')).not.toBeNull();
    expect(within(column("Offer")).queryByText("Ada Lin")).toBeNull();
    expect(cardNamed("Ada Lin")).not.toHaveAttribute("aria-busy");
    // Rolled back, and the failure is handed to the caller's hook exactly once.
    // It is not rethrown: dnd-kit drops the value `onDragEnd` returns, so a
    // throw would only reach the global unhandledrejection handler.
    expect(result).toBe("resolved");
    expect(onMoveError).toHaveBeenCalledTimes(1);
    expect(onMoveError).toHaveBeenCalledWith(new Error("write failed"), expect.objectContaining({ id: "cand-1" }));
  });

  it("renders skeletons while loading", () => {
    renderBoard({ loading: true });

    expect(board()).toHaveAttribute("aria-busy", "true");
    const boardNode = board();
    expect(
      boardNode.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThanOrEqual(COLUMNS.length * 3);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("renders the whole-board empty state instead of the columns", () => {
    renderBoard({ items: [], empty: <p>No candidates yet</p> });

    expect(screen.getByText("No candidates yet")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Applied" })).toBeNull();
  });

  it("falls back to an em dash in an empty column, and uses emptyColumn when given", () => {
    const items = CANDIDATES.filter((candidate) => candidate.stage !== "offer");
    const view = renderBoard({ items });
    expect(within(column("Offer")).getByText("—")).toBeInTheDocument();
    view.unmount();

    renderBoard({ items, emptyColumn: "No offers out" });
    expect(within(column("Offer")).getByText("No offers out")).toBeInTheDocument();
  });
});

describe("resolveDrop", () => {
  const columnKeys = COLUMNS.map((entry) => entry.key);
  const layout: Record<string, string[]> = {
    applied: ["cand-1", "cand-2"],
    screening: ["cand-6"],
    offer: ["cand-11"],
  };
  const columnOfItem = (key: string) =>
    Object.entries(layout).find(([, keys]) => keys.includes(key))?.[0];

  it("resolves a drop on another column", () => {
    expect(
      resolveDrop({ itemKey: "cand-1", overId: "offer", columnKeys, columnOfItem }),
    ).toEqual({ itemKey: "cand-1", fromColumn: "applied", toColumn: "offer" });
  });

  it("resolves a drop on a card in another column to that card's column", () => {
    expect(
      resolveDrop({ itemKey: "cand-1", overId: "cand-6", columnKeys, columnOfItem }),
    ).toEqual({ itemKey: "cand-1", fromColumn: "applied", toColumn: "screening" });
  });

  it("treats a column key that collides with an item key as the column", () => {
    const colliding = ["applied", "screening", "offer", "cand-11"];
    expect(
      resolveDrop({
        itemKey: "cand-1",
        overId: "cand-11",
        columnKeys: colliding,
        columnOfItem,
      }),
    ).toEqual({ itemKey: "cand-1", fromColumn: "applied", toColumn: "cand-11" });
  });

  it("returns null when nothing moved", () => {
    expect(
      resolveDrop({ itemKey: "cand-1", overId: null, columnKeys, columnOfItem }),
    ).toBeNull();
    expect(
      resolveDrop({ itemKey: "cand-1", overId: "cand-2", columnKeys, columnOfItem }),
    ).toBeNull();
    expect(
      resolveDrop({ itemKey: "unknown", overId: "offer", columnKeys, columnOfItem }),
    ).toBeNull();
    expect(
      resolveDrop({
        itemKey: "cand-1",
        overId: "not-a-column",
        columnKeys,
        columnOfItem,
      }),
    ).toBeNull();
  });
});
