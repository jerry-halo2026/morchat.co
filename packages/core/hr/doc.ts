import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { workbenchKeys } from "../crm/queries";
import { hrKeys } from "./queries";
import type {
  CreateHrDocGenerationRequest,
  CreateHrDocTemplateRequest,
  HrDocTemplateListFilters,
  UpdateHrDocTemplateRequest,
} from "../types/doc";

/**
 * HR document hooks (docs/engineering/WORKBENCH-API.md §18).
 *
 * Its own module rather than more of `queries.ts` / `mutations.ts`, for the reason
 * §16 states: a document is not a record of the person, it is a file produced *from*
 * one, so it has its own invalidation rule —
 *
 *   **generating a document changes what the employee's file page shows and the
 *   workbench counts, and writing a template changes every generation screen at
 *   once.**
 *
 * No optimistic writes: the server assigns the generation row, the attachment id,
 * the filename and the values snapshot, so a predicted row would be a guess to
 * reconcile.
 *
 * Key shapes, verbatim:
 *
 *   ["doc", wsId, "templates", filters]
 *   ["doc", wsId, "documents", employeeId]
 *
 * There is no detail key for a generation: a document has no `GET` of its own —
 * it is read from the employee's list, and the only per-row operation is "create
 * another one".
 */

export const docKeys = {
  all: (wsId: string) => ["doc", wsId] as const,
  /** The template resource prefix, so one invalidation refreshes every filter. */
  templates: (wsId: string) => [...docKeys.all(wsId), "templates"] as const,
  templateList: <F extends object>(wsId: string, filters: F) =>
    [...docKeys.templates(wsId), filters] as const,
  /** One employee's generated documents. */
  documents: (wsId: string, employeeId: string) =>
    [...docKeys.all(wsId), "documents", employeeId] as const,
};

export function hrDocTemplateListOptions(
  wsId: string,
  filters: HrDocTemplateListFilters = {},
) {
  return queryOptions({
    queryKey: docKeys.templateList(wsId, filters),
    queryFn: () => api.listHrDocTemplates(filters),
    enabled: !!wsId,
  });
}

export function hrEmployeeDocumentListOptions(wsId: string, employeeId: string) {
  return queryOptions({
    queryKey: docKeys.documents(wsId, employeeId),
    queryFn: () => api.listHrEmployeeDocuments(employeeId),
    enabled: !!wsId && !!employeeId,
  });
}

/**
 * Invalidate this domain, the employee files a generated document is filed into,
 * and the workbench aggregates.
 */
function useInvalidateDocs() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return () => {
    void qc.invalidateQueries({ queryKey: docKeys.all(wsId) });
    void qc.invalidateQueries({ queryKey: hrKeys.resource(wsId, "employees") });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

export function useCreateHrDocTemplate() {
  const invalidate = useInvalidateDocs();
  return useMutation({
    mutationFn: (data: CreateHrDocTemplateRequest) => api.createHrDocTemplate(data),
    onSuccess: invalidate,
  });
}

/** A builtin template is read-only: the server answers 400 for it. */
export function useUpdateHrDocTemplate() {
  const invalidate = useInvalidateDocs();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateHrDocTemplateRequest) =>
      api.updateHrDocTemplate(id, data),
    onSuccess: invalidate,
  });
}

/** Soft delete: an archived template stops being offered, and its name is freed. */
export function useDeleteHrDocTemplate() {
  const invalidate = useInvalidateDocs();
  return useMutation({
    mutationFn: (id: string) => api.deleteHrDocTemplate(id),
    onSuccess: invalidate,
  });
}

/**
 * Generate one document for one employee. The caller gets the ledger row and the
 * warnings; a non-empty `warnings` means the stored file still contains a literal
 * `{{...}}`, so the page should be reviewed before it is stamped.
 */
export function useCreateHrEmployeeDocument() {
  const invalidate = useInvalidateDocs();
  return useMutation({
    mutationFn: ({
      employeeId,
      ...data
    }: { employeeId: string } & CreateHrDocGenerationRequest) =>
      api.createHrEmployeeDocument(employeeId, data),
    onSuccess: invalidate,
  });
}
