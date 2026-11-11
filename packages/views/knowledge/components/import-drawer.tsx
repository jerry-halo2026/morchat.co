"use client";

/**
 * S5 鈥?importing a document, as a three-step drawer.
 *
 *   1. source     file / URL / repository / issue attachment
 *   2. preview    the chunks the server proposes to index, before anything is
 *                 written
 *   3. progress   live over SSE; if the stream cannot be opened (or dies), the
 *                 drawer falls back to polling every 2 s and says so.
 *
 * The import job is the only long-running thing in the knowledge surface, so it
 * is the only place that owns an EventSource.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { File, Loader2, Upload, Link2, GitBranch, Paperclip } from "@morechat/ui/icons";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { Input } from "@morechat/ui/components/ui/input";
import { Progress } from "@morechat/ui/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { useT } from "../../i18n";
import { knowledgeApi } from "../data/knowledge-api";
import type {
  KnowledgeImportJob,
  KnowledgeImportSourceKind,
  KnowledgeSpace,
} from "../data/types";

type Step = "source" | "preview" | "progress";

const POLL_INTERVAL_MS = 2000;

export interface KnowledgeImportDrawerProps {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaces: readonly KnowledgeSpace[];
  defaultSpace?: string;
  /** Called once a job finishes, so the caller can refresh its page list. */
  onDone?: () => void;
}

export function KnowledgeImportDrawer({
  wsId,
  open,
  onOpenChange,
  spaces,
  defaultSpace,
  onDone,
}: KnowledgeImportDrawerProps) {
  const { t } = useT("knowledge");
  const [step, setStep] = useState<Step>("source");
  const [kind, setKind] = useState<KnowledgeImportSourceKind>("file");
  const [space, setSpace] = useState(defaultSpace ?? spaces[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [repo, setRepo] = useState("");
  const [issue, setIssue] = useState("");
  const [job, setJob] = useState<KnowledgeImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const source = useRef<EventSource | null>(null);

  useEffect(() => {
    if (open) return;
    source.current?.close();
    source.current = null;
    setStep("source");
    setJob(null);
    setError(null);
    setPolling(false);
  }, [open]);

  const applyJob = useCallback(
    (next: KnowledgeImportJob) => {
      setJob(next);
      if (next.status === "done") onDone?.();
    },
    [onDone],
  );

  // Progress: SSE first, polling as the stated fallback.
  useEffect(() => {
    if (!open || step !== "progress" || !job?.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (cancelled || timer) return;
      setPolling(true);
      timer = setInterval(() => {
        void knowledgeApi
          .getImportJob(wsId, job.id)
          .then((next) => {
            if (!cancelled) applyJob(next);
          })
          .catch(() => {
            /* keep polling: a blip is not a failed import */
          });
      }, POLL_INTERVAL_MS);
    };

    if (typeof EventSource === "undefined") {
      startPolling();
    } else {
      try {
        const events = new EventSource(knowledgeApi.importEventsUrl(wsId, job.id), {
          withCredentials: true,
        });
        source.current = events;
        events.onmessage = (event) => {
          try {
            const next = JSON.parse(event.data) as KnowledgeImportJob;
            if (!cancelled) applyJob(next);
            if (next.status === "done" || next.status === "failed") events.close();
          } catch {
            /* a malformed frame is not a reason to give up the stream */
          }
        };
        events.onerror = () => {
          events.close();
          source.current = null;
          startPolling();
        };
      } catch {
        startPolling();
      }
    }

    return () => {
      cancelled = true;
      source.current?.close();
      source.current = null;
      if (timer) clearInterval(timer);
    };
  }, [applyJob, job?.id, open, step, wsId]);

  const sourceReady =
    kind === "file" ? !!file : kind === "url" ? url.trim().length > 0 : kind === "repo" ? repo.trim().length > 0 : issue.trim().length > 0;

  const startPreview = async () => {
    if (!sourceReady) {
      setError(t(($) => $.import.needs_source));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let key: string | undefined;
      if (kind === "file" && file) {
        const upload = await knowledgeApi.requestUploadUrl(wsId, {
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          size: file.size,
        });
        key = upload.key;
      }
      const started = await knowledgeApi.startImport(wsId, {
        space_id: space || spaces[0]?.id || "",
        source_kind: kind,
        url: kind === "url" ? url.trim() : undefined,
        key,
        filename: file?.name,
        issue_id: kind === "issue" ? issue.trim() : undefined,
      });
      const preview: KnowledgeImportJob = {
        // The server's import task carries its own id; the create call answers
        // 202 with the task itself, not a bare `job_id`.
        id: started.id ?? "",
        status: "preview",
        progress: 0,
        chunks: [],
      };
      setJob(preview);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startImport = async () => {
    if (!job?.id) return;
    setStep("progress");
    setBusy(true);
    try {
      const next = await knowledgeApi.getImportJob(wsId, job.id);
      applyJob(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px] sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle>{t(($) => $.import.title)}</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-2 px-4 pb-3 text-caption">
          {(["source", "preview", "progress"] as Step[]).map((entry, index) => (
            <span key={entry} className="flex items-center gap-2">
              <span
                className={
                  entry === step
                    ? "rounded-full bg-brand px-2 py-0.5 text-brand-foreground"
                    : "rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
                }
              >
                {index + 1}.{" "}
                {entry === "source"
                  ? t(($) => $.import.step_source)
                  : entry === "preview"
                    ? t(($) => $.import.step_preview)
                    : t(($) => $.import.step_progress)}
              </span>
              {index < 2 ? <span className="text-faint-foreground">&rarr;</span> : null}
            </span>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
          {step === "source" ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: "file" as const, icon: <File className="size-3.5" aria-hidden />, label: t(($) => $.import.source_file) },
                    { id: "url" as const, icon: <Link2 className="size-3.5" aria-hidden />, label: t(($) => $.import.source_url) },
                    { id: "repo" as const, icon: <GitBranch className="size-3.5" aria-hidden />, label: t(($) => $.import.source_repo) },
                    { id: "issue" as const, icon: <Paperclip className="size-3.5" aria-hidden />, label: t(($) => $.import.source_issue) },
                  ]
                ).map((option) => (
                  <Button
                    key={option.id}
                    size="sm"
                    variant={kind === option.id ? "default" : "outline"}
                    className="gap-1.5"
                    onClick={() => setKind(option.id)}
                  >
                    {option.icon}
                    {option.label}
                  </Button>
                ))}
              </div>

              {spaces.length > 0 ? (
                <label className="text-caption text-muted-foreground">
                  {t(($) => $.import.space)}
                  <select
                    value={space}
                    onChange={(event) => setSpace(event.target.value)}
                    className="mt-1 block h-8 w-full rounded-lg border border-input bg-transparent px-2 text-body outline-none focus-visible:border-ring"
                  >
                    {spaces.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {kind === "file" ? (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-surface-border p-3 text-caption text-muted-foreground">
                  <Upload className="size-4" aria-hidden />
                  {file
                    ? t(($) => $.import.file_chosen, { name: file.name, size: `${Math.round(file.size / 1024)} KB` })
                    : t(($) => $.import.choose_file)}
                  <input
                    type="file"
                    className="sr-only"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              ) : kind === "url" ? (
                <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={t(($) => $.import.url_placeholder)} />
              ) : kind === "repo" ? (
                <Input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder={t(($) => $.import.repo_placeholder)} />
              ) : (
                <Input value={issue} onChange={(event) => setIssue(event.target.value)} placeholder={t(($) => $.import.issue_placeholder)} />
              )}

              {error ? <p className="text-caption text-destructive">{error}</p> : null}

              <div className="flex justify-end gap-2">
                <Button size="sm" onClick={() => void startPreview()} disabled={busy || !sourceReady}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                  {t(($) => $.import.next)}
                </Button>
              </div>
            </>
          ) : null}

          {step === "preview" ? (
            <>
              <p className="text-caption text-muted-foreground">
                {t(($) => $.import.chunks, { n: job?.chunks.length ?? 0 })}
              </p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {(job?.chunks ?? []).map((chunk) => (
                  <li key={chunk.index} className="rounded-lg border border-surface-border p-2">
                    <div className="mb-1 flex items-center gap-2 text-caption text-muted-foreground">
                      <Badge variant="outline">{t(($) => $.import.chunk, { n: chunk.index })}</Badge>
                      <span className="truncate">{chunk.heading ?? ""}</span>
                    </div>
                    <p className="line-clamp-3 text-caption">{chunk.text}</p>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between gap-2">
                <Button size="sm" variant="ghost" onClick={() => setStep("source")}>
                  {t(($) => $.import.back)}
                </Button>
                <Button size="sm" onClick={() => void startImport()} disabled={busy}>
                  {t(($) => $.import.start)}
                </Button>
              </div>
            </>
          ) : null}

          {step === "progress" ? (
            <>
              <Progress value={job?.progress ?? 0} />
              <p className="text-caption text-muted-foreground">
                {job?.status === "failed"
                  ? t(($) => $.import.failed)
                  : job?.status === "done"
                    ? t(($) => $.import.done)
                    : t(($) => $.import.progress, { n: job?.progress ?? 0 })}
              </p>
              {polling ? <p className="text-caption text-faint-foreground">{t(($) => $.import.polling)}</p> : null}
              {job?.error ? <p className="text-caption text-destructive">{job.error}</p> : null}
              <div className="flex justify-end gap-2">
                {job?.status === "failed" ? (
                  <Button size="sm" variant="outline" onClick={() => setStep("preview")}>
                    {t(($) => $.import.retry)}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                  {t(($) => $.import.close)}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
