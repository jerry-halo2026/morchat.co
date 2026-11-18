import type {
  ImportError,
  ImportKind,
  ImportPreviewResponse,
  ImportRow,
  ImportRowAction,
} from "@morechat/core/types";

/**
 * The batch-import contract, as the frontend consumes it.
 *
 * `POST /api/workbench/import?kind=&dry_run=` (`WORKBENCH-API` §23,
 * `packages/core/types/workbench.ts`) takes the CSV as the request body and
 * answers one shape for both a preview and a real import — the difference is
 * `committed`, which stays 0 while `dry_run=1` writes nothing at all.
 *
 * The types are **core's**, re-exported here so the dialog and its model import
 * from one place: when the wire shape changes, it changes in `packages/core` and
 * every page that imports this module follows. Nothing in this file restates a
 * field, so nothing here can drift from the schema.
 *
 * Three properties the UI depends on, spelled out because they drive the dialog:
 *
 *   - **`errors` is fatal, not advisory.** The real import is all-or-nothing: one
 *     bad row rolls the batch back and `committed` comes back 0, so a preview with
 *     errors must never reach the confirm button (`model.canCommit`).
 *   - **`skip` is not `error`.** A row whose identity already exists in the ledger
 *     is `action: "skip"`, counted in `parsed` but not in `accepted` and **not** in
 *     `errors` — so the preview has to name the skipped rows itself, or a reader
 *     counting lines sees two of them disappear for no stated reason.
 *   - **A reason is a token, not a sentence.** `creator_not_found` and friends are
 *     translated in `copy.ts`; a token this client does not know prints as itself
 *     rather than being replaced by a guess.
 */
export type { ImportError, ImportKind, ImportPreviewResponse, ImportRow, ImportRowAction };
