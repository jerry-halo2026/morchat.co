"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@morechat/ui/components/ui/button";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { useCreateHrEmployeeDocument } from "@morechat/core/hr/doc";
import type { HrDocFormat, HrDocTemplate } from "@morechat/core/types";
import { SegmentedToggle } from "../../common/segmented-toggle";
import { formatLabel, useFilesCopy } from "./files-copy";
import { DEFAULT_FORMAT, DOC_FORMATS, startDownload, unfilledSlots } from "./files-model";

/** One employee the generator can be pointed at: the id it writes, the words on screen. */
export interface GenerateEmployeeOption {
  id: string;
  label: string;
}

/**
 * 生成文书: one employee, one template, one format — and the file.
 *
 * **Word is the default, and the format line is not decoration.** `docx` is an
 * OOXML package any Office opens; `pdf` is written by the server with the
 * standard CJK font named but **not embedded**, so a reader without a Chinese
 * font substitutes glyphs and can show a blank page. That is a property of the
 * file, not a preference, so the line sits next to the picker in both states and
 * says more when PDF is the one chosen. The customer prints and stamps the paper
 * by hand; a blank page discovered at the printer is the failure this line
 * exists to prevent.
 *
 * **Warnings are the other thing the page must not swallow.** An unknown slot is
 * kept verbatim in the file (§18), so the response names it; the sheet lists the
 * slots themselves and keeps them on screen until the reader closes it, because
 * the file has already been downloaded by then.
 */
export function GenerateSheet({
  templates,
  employees,
  onOpenChange,
}: {
  templates: readonly HrDocTemplate[];
  employees: readonly GenerateEmployeeOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const copy = useFilesCopy();
  const generate = useCreateHrEmployeeDocument();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [format, setFormat] = useState<HrDocFormat>(DEFAULT_FORMAT);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [failed, setFailed] = useState(false);

  const ready = employeeId !== null && templateId !== null && !generate.isPending;
  const missing = unfilledSlots(warnings);

  const submit = async () => {
    if (employeeId === null || templateId === null) return;
    setFailed(false);
    setWarnings([]);
    try {
      const response = await generate.mutateAsync({
        employeeId,
        template_id: templateId,
        format,
      });
      // The file is the point: it is downloaded before anything else on this
      // sheet changes, so a reader who closes it still has the document.
      startDownload(response.document.url, response.document.filename);
      toast.success(copy("generated_toast"));
      if (response.warnings.length > 0) {
        setWarnings(response.warnings);
        return;
      }
      onOpenChange(false);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="gap-1 border-b">
          <SheetTitle>{copy("generate_title")}</SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="files-generate-employee">{copy("generate_employee")}</Label>
            <Select
              items={employees.map((employee) => ({
                value: employee.id,
                label: employee.label,
              }))}
              value={employeeId}
              disabled={generate.isPending || employees.length === 0}
              onValueChange={(next) => setEmployeeId(next === null ? null : String(next))}
            >
              <SelectTrigger id="files-generate-employee" className="w-full">
                <SelectValue placeholder={copy("generate_employee_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    <span className="truncate">{employee.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="files-generate-template">{copy("generate_template")}</Label>
            <Select
              items={templates.map((template) => ({
                value: template.id,
                label: template.name,
              }))}
              value={templateId}
              disabled={generate.isPending || templates.length === 0}
              onValueChange={(next) => setTemplateId(next === null ? null : String(next))}
            >
              <SelectTrigger id="files-generate-template" className="w-full">
                <SelectValue placeholder={copy("generate_template_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <span className="truncate">{template.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-label">{copy("generate_format")}</span>
            <div role="group" aria-label={copy("generate_format")} className="w-fit">
              <SegmentedToggle
                value={format}
                options={DOC_FORMATS.map((value) => [value, formatLabel(value, copy)] as const)}
                onChange={(next) => setFormat(next as HrDocFormat)}
              />
            </div>
            <p data-slot="files-format-note" className="text-caption text-muted-foreground">
              {copy("generate_note")}
            </p>
            {format === "pdf" ? (
              <p
                data-slot="files-format-pdf-note"
                className="text-caption text-warning"
              >
                {copy("generate_pdf_note")}
              </p>
            ) : null}
          </div>

          {employees.length === 0 ? (
            <p className="text-caption text-muted-foreground">{copy("generate_no_employee")}</p>
          ) : null}
          {templates.length === 0 ? (
            <p className="text-caption text-muted-foreground">{copy("generate_no_template")}</p>
          ) : null}

          {warnings.length > 0 ? (
            <section
              data-slot="files-warnings"
              role="alert"
              className="flex flex-col gap-1 rounded-md bg-warning/15 p-3"
            >
              <h3 className="text-caption font-medium text-warning">{copy("warnings_title")}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {(missing.length > 0 ? missing : warnings).map((slot) => (
                  <li
                    key={slot}
                    className="rounded-xs bg-background px-1 font-mono text-caption"
                  >
                    {slot}
                  </li>
                ))}
              </ul>
              <p className="text-caption text-muted-foreground">{copy("warnings_hint")}</p>
            </section>
          ) : null}

          {failed ? (
            <p role="alert" className="text-caption text-destructive">
              {copy("generate_failed")}
            </p>
          ) : null}
        </div>

        <SheetFooter className="mt-0 flex-row items-center justify-end gap-2 border-t">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {copy("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            data-action="files-generate-submit"
            disabled={!ready}
            onClick={() => void submit()}
          >
            {generate.isPending ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
            {copy(generate.isPending ? "generate_pending" : "generate_submit")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
