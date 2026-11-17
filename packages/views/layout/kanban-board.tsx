"use client";

import {
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, type SortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useReducedMotion } from "@morechat/core/appearance";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { cn } from "@morechat/ui/lib/utils";

export type KanbanTone = "neutral" | "brand" | "warn" | "danger";

export interface KanbanColumn<T> {
  /** The key the row is filed under — the value a caller persists (a stage). */
  key: string;
  /** Column heading. */
  title: string;
  tone?: KanbanTone;
  /** Authoritative total when it differs from the cards on screen (a paged
   *  column); the board counts its own cards otherwise. */
  count?: number;
  /** Type-only brand: keeps one column set tied to the row type it describes,
   *  so a board cannot be handed columns from another domain. Never read. */
  readonly _item?: T;
}

export interface KanbanBoardProps<T> {
  columns: readonly KanbanColumn<T>[];
  items: readonly T[];
  /** The column an item currently belongs to. */
  columnOf: (item: T) => string;
  itemKey: (item: T) => string;
  /** Card body. The board clamps it to two lines and never re-lays it out. */
  renderCard: (item: T) => ReactNode;
  /** Drop handler. `onMove` may be async: while it settles the card shows
   *  `aria-busy` and cannot be picked up again. A rejection restores the
   *  previous column and is re-raised to the caller — the board owns the
   *  visual rollback only, it never swallows the failure. */
  onMove?: (item: T, toColumn: string) => void | Promise<void>;
  onCardClick?: (item: T) => void;
  /** Called when a move rejects, after the card has rolled back. The component
   *  never rethrows: dnd-kit drops the value onDragEnd returns, so a throw
   *  would only surface as an unhandledrejection. */
  onMoveError?: (error: unknown, item: T) => void;
  loading?: boolean;
  /** Whole-board empty state, shown instead of the columns. */
  empty?: ReactNode;
  /** Per-column empty state; defaults to an em dash. */
  emptyColumn?: ReactNode;
  /** Accessible name of the board ("Recruiting board"). */
  label: string;
  className?: string;
}

/** Where a drag ended: the dragged item and the column it should file under. */
export interface KanbanDropTarget {
  itemKey: string;
  fromColumn: string;
  toColumn: string;
}

type KanbanLayout = Readonly<Record<string, readonly string[]>>;

const TONE_DOT: Record<KanbanTone, string> = {
  neutral: "bg-muted-foreground/40",
  brand: "bg-brand",
  warn: "bg-warning",
  danger: "bg-destructive",
};

/**
 * Cards keep their own order inside a column; a drop only changes the column.
 * Previewing a reorder here would shift cards around a move that is never
 * committed, so the sortable strategy reports no displacement at all.
 */
const NO_REORDER_PREVIEW: SortingStrategy = () => null;

const COLUMN_WIDTH = "w-72";

const ITEM_SEPARATOR = "\u0001";
const COLUMN_SEPARATOR = "\u0002";

function layoutSignature(layout: KanbanLayout): string {
  return Object.entries(layout)
    .map(([column, keys]) => `${column}${ITEM_SEPARATOR}${keys.join(ITEM_SEPARATOR)}`)
    .join(COLUMN_SEPARATOR);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof (value as { then?: unknown } | null | undefined)?.then === "function"
  );
}

/**
 * Resolve a finished drag against the board's columns.
 *
 * Column keys and item keys share one id space (a column key wins), which is
 * what lets a drop land either on a column's empty space or on another card:
 * dropping on a card carries that card's column. Returns `null` for a drag
 * that ended nowhere, on its own column, or on an id the board does not know —
 * all of which are "nothing moved".
 */
export function resolveDrop({
  itemKey,
  overId,
  columnKeys,
  columnOfItem,
}: {
  itemKey: string;
  overId: string | null;
  columnKeys: readonly string[];
  columnOfItem: (itemKey: string) => string | undefined;
}): KanbanDropTarget | null {
  if (!overId) return null;
  const fromColumn = columnOfItem(itemKey);
  if (!fromColumn) return null;
  const toColumn = columnKeys.includes(overId) ? overId : columnOfItem(overId);
  if (!toColumn || toColumn === fromColumn) return null;
  return { itemKey, fromColumn, toColumn };
}

/**
 * A stage board over any row type.
 *
 * The caller owns the rows, the columns, and what a card looks like; the board
 * owns the column layout while a move is in flight. It keeps the dragged card
 * in its new column until the caller's data catches up (the optimistic layout
 * is keyed to a signature of `items` + `columns`, so the next real change
 * replaces it), and otherwise draws exactly what `columnOf` says.
 *
 * Out of scope on purpose: swimlanes, column reordering, creating a card from
 * a column, virtualization, and keyboard dragging (a card's Enter opens it, so
 * it is not also the drag activator — pointers and screen readers get the
 * column transition through `onMove` only).
 */
export function KanbanBoard<T>({
  columns,
  items,
  columnOf,
  itemKey,
  renderCard,
  onMove,
  onCardClick,
  onMoveError,
  loading = false,
  empty,
  emptyColumn,
  label,
  className,
}: KanbanBoardProps<T>): ReactElement {
  const reduceMotion = useReducedMotion();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const itemsByKey = useMemo(() => {
    const map = new Map<string, T>();
    for (const item of items) map.set(itemKey(item), item);
    return map;
  }, [items, itemKey]);

  const derived = useMemo(() => {
    const layout: Record<string, string[]> = {};
    for (const column of columns) layout[column.key] = [];
    for (const item of items) {
      const bucket = layout[columnOf(item)];
      // A card whose column is not on the board is not drawn: inventing a
      // column for it would report a stage the caller never declared.
      if (bucket) bucket.push(itemKey(item));
    }
    return { layout, signature: layoutSignature(layout) };
  }, [columns, items, columnOf, itemKey]);

  const [optimistic, setOptimistic] = useState<{
    signature: string;
    layout: KanbanLayout;
  } | null>(null);
  const [pendingKeys, setPendingKeys] = useState<readonly string[]>([]);
  const layout =
    optimistic && optimistic.signature === derived.signature
      ? optimistic.layout
      : derived.layout;

  const settlePending = (key: string) =>
    setPendingKeys((prev) => prev.filter((pending) => pending !== key));

  const columnOfKey = (key: string) => {
    for (const [column, keys] of Object.entries(layout)) {
      if (keys.includes(key)) return column;
    }
    return undefined;
  };

  const handleDragEnd = (event: DragEndEvent): void | Promise<unknown> => {
    const draggedKey = String(event.active.id);
    const plan = resolveDrop({
      itemKey: draggedKey,
      overId: event.over ? String(event.over.id) : null,
      columnKeys: columns.map((column) => column.key),
      columnOfItem: columnOfKey,
    });
    if (!plan || !onMove) return;

    const item = itemsByKey.get(draggedKey);
    if (!item) return;

    setOptimistic({
      signature: derived.signature,
      layout: {
        ...layout,
        [plan.fromColumn]: (layout[plan.fromColumn] ?? []).filter(
          (key) => key !== draggedKey,
        ),
        [plan.toColumn]: [...(layout[plan.toColumn] ?? []), draggedKey],
      },
    });

    const result = onMove(item, plan.toColumn);
    if (!isPromiseLike(result)) return;

    setPendingKeys((prev) => [...prev, draggedKey]);
    return Promise.resolve(result).then(
      () => settlePending(draggedKey),
      (error: unknown) => {
        // Back to the caller's order, then hand the failure to the caller.
        // Rethrowing here would not reach anyone: dnd-kit discards the value
        // `onDragEnd` returns, so a throw turns into an `unhandledrejection`
        // while the caller's own catch never runs. `onMoveError` is the hook.
        setOptimistic(null);
        settlePending(draggedKey);
        onMoveError?.(error, item);
      },
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <div
        role="group"
        aria-label={label}
        aria-busy={loading || undefined}
        data-kanban-board=""
        className={cn(
          "flex min-h-0 items-stretch gap-3 overflow-x-auto overflow-y-hidden p-1",
          className,
        )}
      >
        {loading ? (
          <LoadingColumns columns={columns} />
        ) : items.length === 0 && empty !== undefined ? (
          <div className="flex min-h-24 min-w-full items-center justify-center">
            {empty}
          </div>
        ) : (
          columns.map((column) => (
            <BoardColumnView
              key={column.key}
              column={column}
              itemKeys={layout[column.key] ?? []}
              itemsByKey={itemsByKey}
              renderCard={renderCard}
              emptyColumn={emptyColumn}
              pendingKeys={pendingKeys}
              reduceMotion={reduceMotion}
              onCardClick={onCardClick}
            />
          ))
        )}
      </div>
    </DndContext>
  );
}

function BoardColumnView<T>({
  column,
  itemKeys,
  itemsByKey,
  renderCard,
  emptyColumn,
  pendingKeys,
  reduceMotion,
  onCardClick,
}: {
  column: KanbanColumn<T>;
  itemKeys: readonly string[];
  itemsByKey: ReadonlyMap<string, T>;
  renderCard: (item: T) => ReactNode;
  emptyColumn?: ReactNode;
  pendingKeys: readonly string[];
  reduceMotion: boolean;
  onCardClick?: (item: T) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  const count = column.count ?? itemKeys.length;

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={column.title}
      data-kanban-column={column.key}
      data-over={isOver || undefined}
      className={cn(
        "flex min-h-0 shrink-0 flex-col rounded-xl bg-muted p-2",
        COLUMN_WIDTH,
        isOver && "ring-2 ring-brand/30",
      )}
    >
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            TONE_DOT[column.tone ?? "neutral"],
          )}
        />
        <h3 className="min-w-0 flex-1 truncate text-label font-medium text-foreground">
          {column.title}
        </h3>
        <span className="shrink-0 rounded-full bg-surface px-1.5 text-micro font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-0.5">
        {itemKeys.length === 0 ? (
          <p className="py-6 text-center text-caption text-muted-foreground">
            {emptyColumn ?? "—"}
          </p>
        ) : null}
        <div role="list" className="flex flex-col gap-2">
          <SortableContext items={[...itemKeys]} strategy={NO_REORDER_PREVIEW}>
            {itemKeys.map((key) => {
              const item = itemsByKey.get(key);
              if (item === undefined) return null;
              return (
                <BoardCard
                  key={key}
                  itemKey={key}
                  item={item}
                  renderCard={renderCard}
                  pending={pendingKeys.includes(key)}
                  reduceMotion={reduceMotion}
                  onCardClick={onCardClick}
                />
              );
            })}
          </SortableContext>
        </div>
      </div>
    </div>
  );
}

function BoardCard<T>({
  itemKey,
  item,
  renderCard,
  pending,
  reduceMotion,
  onCardClick,
}: {
  itemKey: string;
  item: T;
  renderCard: (item: T) => ReactNode;
  pending: boolean;
  reduceMotion: boolean;
  onCardClick?: (item: T) => void;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } =
    useSortable({ id: itemKey, disabled: pending });

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    if (!onCardClick) return;
    event.preventDefault();
    onCardClick(item);
  };

  return (
    <div
      ref={setNodeRef}
      role="listitem"
      tabIndex={0}
      aria-busy={pending || undefined}
      data-kanban-card={itemKey}
      {...listeners}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: reduceMotion ? undefined : transition,
      }}
      className={cn(
        "min-w-0 cursor-grab rounded-lg border border-surface-border bg-surface p-2.5 text-label text-foreground outline-none",
        "transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        isDragging && "cursor-grabbing opacity-50",
        pending && "cursor-progress opacity-60",
      )}
      onClick={() => onCardClick?.(item)}
      onKeyDown={handleKeyDown}
    >
      <div className="line-clamp-2">{renderCard(item)}</div>
    </div>
  );
}

function LoadingColumns<T>({ columns }: { columns: readonly KanbanColumn<T>[] }) {
  return (
    <>
      {columns.map((column) => (
        <div
          key={column.key}
          aria-hidden
          className={cn(
            "flex min-h-0 shrink-0 flex-col rounded-xl bg-muted p-2",
            COLUMN_WIDTH,
          )}
        >
          <div className="mb-2 flex items-center gap-2 px-0.5">
            <Skeleton className="size-1.5 rounded-full" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <div className="flex flex-col gap-2 p-0.5">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
