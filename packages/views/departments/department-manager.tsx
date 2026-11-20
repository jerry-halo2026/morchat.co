"use client";

/**
 * Department management, inside the member list.
 *
 * A department is attribution (docs/engineering/ORG-MODEL.md §3), so the place
 * to name one, rename it, name its lead and remove it is the same page that
 * files members under it — not a separate destination. This dialog is that
 * small surface: the server has had `POST/PATCH/DELETE /api/departments` since
 * migration 645, but the client only ever read the list, which left a fresh
 * workspace with no way to create its first department (the invitation form
 * hides its department field until one exists).
 *
 * Writes are owner/admin only; the caller decides whether to render this at
 * all, and the server rejects the rest regardless (`requireDepartmentWriter`).
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Check, Pencil, Plus, Trash2, X } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@morechat/ui/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import type { Department, MemberWithUser } from "@morechat/core/types";
import { api } from "@morechat/core/api";
import { memberListOptions, workspaceKeys } from "@morechat/core/workspace/queries";
import { useT } from "../i18n";

/** Select value for "this department has no lead"; ids are UUIDs. */
const NO_LEAD = "none";

export function DepartmentManager({
  wsId,
  open,
  onOpenChange,
  departments,
}: {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: readonly Department[];
}) {
  const { t } = useT("settings");
  const qc = useQueryClient();
  const members = useQuery({ ...memberListOptions(wsId), enabled: open && !!wsId });
  const [name, setName] = useState("");
  const [lead, setLead] = useState(NO_LEAD);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Department | null>(null);

  const memberRows = useMemo<MemberWithUser[]>(() => members.data ?? [], [members.data]);
  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of memberRows) map.set(member.user_id, member.name || member.email);
    return map;
  }, [memberRows]);
  const leadItems = useMemo(
    () => [
      { value: NO_LEAD, label: t(($) => $.members.department_lead_none) },
      ...memberRows.map((member) => ({
        value: member.user_id,
        label: member.name || member.email,
      })),
    ],
    // `t` is stable per locale; the list only changes with the roster.
    [memberRows, t],
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: workspaceKeys.departments(wsId) });
    // Rows print the department's name, so the roster has to reread with it.
    void qc.invalidateQueries({ queryKey: workspaceKeys.members(wsId) });
  };

  const errorText = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await api.createDepartment({
        name: trimmed,
        ...(lead === NO_LEAD ? {} : { lead_user_id: lead }),
      });
      setName("");
      setLead(NO_LEAD);
      refresh();
      toast.success(t(($) => $.members.toast_department_created, { name: trimmed }));
    } catch (error) {
      toast.error(errorText(error, t(($) => $.members.toast_department_create_failed)));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (department: Department) => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === department.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      await api.updateDepartment(department.id, { name: trimmed });
      setEditingId(null);
      refresh();
      toast.success(t(($) => $.members.toast_department_renamed, { name: trimmed }));
    } catch (error) {
      toast.error(errorText(error, t(($) => $.members.toast_department_rename_failed)));
    } finally {
      setBusy(false);
    }
  };

  const handleLead = async (department: Department, userId: string) => {
    setBusy(true);
    try {
      // Empty string clears the lead; the server treats absent/null as "keep".
      await api.updateDepartment(department.id, {
        lead_user_id: userId === NO_LEAD ? "" : userId,
      });
      refresh();
      toast.success(t(($) => $.members.toast_department_lead_updated));
    } catch (error) {
      toast.error(errorText(error, t(($) => $.members.toast_department_lead_failed)));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (department: Department) => {
    setBusy(true);
    try {
      const result = await api.deleteDepartment(department.id);
      refresh();
      toast.success(
        t(($) => $.members.toast_department_deleted, {
          name: department.name,
          projects: result.detached_projects,
          members: result.detached_members,
        }),
      );
    } catch (error) {
      toast.error(errorText(error, t(($) => $.members.toast_department_delete_failed)));
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t(($) => $.members.departments_manage)}</DialogTitle>
            <DialogDescription>{t(($) => $.members.departments_manage_description)}</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="department-name">{t(($) => $.members.department_name_label)}</Label>
                <Input
                  id="department-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t(($) => $.members.department_name_placeholder)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department-lead">
                  {t(($) => $.members.department_lead_label)}
                </Label>
                <Select items={leadItems} value={lead} onValueChange={(next) => setLead(String(next))}>
                  <SelectTrigger id="department-lead" className="w-full">
                    <SelectValue>
                      {() => leadItems.find((item) => item.value === lead)?.label ?? ""}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {leadItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={busy || !name.trim()}>
                <Plus />
                {t(($) => $.members.department_create)}
              </Button>
            </div>
          </form>

          {departments.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-caption text-muted-foreground">
              {t(($) => $.members.departments_empty)}
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {departments.map((department) => {
                const leadName = department.lead_user_id
                  ? (memberNameById.get(department.lead_user_id) ?? null)
                  : null;
                const editing = editingId === department.id;
                return (
                  <li key={department.id} className="flex items-center gap-2 px-3 py-2">
                    <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {editing ? (
                      <>
                        <Input
                          aria-label={t(($) => $.members.department_name_label)}
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleRename(department);
                            }
                            if (event.key === "Escape") setEditingId(null);
                          }}
                          className="h-8 flex-1"
                          autoFocus
                        />
                        <IconButton
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          onClick={() => void handleRename(department)}
                          label={t(($) => $.members.department_save)}
                        >
                          <Check className="size-4" />
                        </IconButton>
                        <IconButton
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditingId(null)}
                          label={t(($) => $.members.department_cancel)}
                        >
                          <X className="size-4" />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-body">{department.name}</span>
                        <Select
                          items={leadItems}
                          value={department.lead_user_id ?? NO_LEAD}
                          onValueChange={(next) => void handleLead(department, String(next))}
                        >
                          <SelectTrigger
                            aria-label={t(($) => $.members.department_lead_label)}
                            className="h-8 w-36"
                          >
                            <SelectValue>
                              {() =>
                                leadName ?? t(($) => $.members.department_lead_none)
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {leadItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <IconButton
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(department.id);
                            setEditName(department.name);
                          }}
                          label={t(($) => $.members.department_rename)}
                        >
                          <Pencil className="size-4 text-muted-foreground" />
                        </IconButton>
                        <IconButton
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          onClick={() => setPendingDelete(department)}
                          label={t(($) => $.members.department_delete)}
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </IconButton>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.members.department_delete_title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.members.department_delete_description, {
                name: pendingDelete?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(($) => $.members.department_cancel)}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) void handleDelete(pendingDelete);
              }}
            >
              {t(($) => $.members.department_delete)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
