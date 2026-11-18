"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import { ApiError } from "@morechat/core/api";
import { useCreateHrDocTemplate } from "@morechat/core/hr/doc";
import type { HrDocTemplate, HrDocTemplateKind } from "@morechat/core/types";
import { useFilesCopy } from "./files-copy";
import { KindPicker } from "./files-template-sheet";

/**
 * Naming a new template: a name and a kind, nothing else.
 *
 * The row is created empty and the sheet opens on it, rather than the dialog
 * collecting the body: a letter is written over an afternoon — drafted, read,
 * corrected — so the row existing is what lets the work survive closing the
 * window. A name is unique per workspace among live templates (§18), so a repeat
 * is a 409 and the dialog says so instead of clearing itself.
 */
export function TemplateCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after the server confirms, with the row it wrote. */
  onCreated: (template: HrDocTemplate) => void;
}) {
  const copy = useFilesCopy();
  const create = useCreateHrDocTemplate();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<HrDocTemplateKind>("employment");
  const [failure, setFailure] = useState<"conflict" | "failed" | null>(null);

  // One attempt per opening: the draft belongs to the dialog, so a reopen starts
  // from an empty form instead of the last template's name.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setKind("employment");
      setFailure(null);
    }
  }

  const trimmed = name.trim();
  const ready = trimmed !== "" && !create.isPending;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    setFailure(null);
    try {
      const template = await create.mutateAsync({ name: trimmed, kind, body: "" });
      onCreated(template);
      onOpenChange(false);
    } catch (error) {
      setFailure(error instanceof ApiError && error.status === 409 ? "conflict" : "failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy("create_title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="files-create-name">{copy("create_name")}</Label>
            <Input
              id="files-create-name"
              autoFocus
              value={name}
              disabled={create.isPending}
              placeholder={copy("create_name_placeholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="files-create-kind">{copy("create_kind")}</Label>
            <KindPicker
              id="files-create-kind"
              value={kind}
              disabled={create.isPending}
              copy={copy}
              onChange={setKind}
            />
          </div>

          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {copy(failure === "conflict" ? "create_conflict" : "create_failed")}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {copy("create_cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!ready}>
              {copy("create_submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
