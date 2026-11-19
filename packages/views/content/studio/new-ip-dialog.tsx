"use client";

import { useState, type FormEvent } from "react";
import { useCreateMediaIP } from "@morechat/core/media/mutations";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import { useStudioCopy } from "./copy";

/**
 * Create one IP.
 *
 * There is no `RecordForm` for this: that component is driven by the commerce
 * and HR record domains, and an IP is neither, so the five fields are written
 * once here. Only the name is required — a persona with no track yet is a normal
 * first day, and the server stores the empty fields as null.
 *
 * The dialog closes on success and stays open with its input on failure, because
 * the server is the one that decides whether the row exists (§12: `owner_member_id`
 * and the audit columns are its own).
 */
export function NewIpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const copy = useStudioCopy();
  const create = useCreateMediaIP();
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [track, setTrack] = useState("");
  const [audience, setAudience] = useState("");
  const [weekGoal, setWeekGoal] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setPersona("");
    setTrack("");
    setAudience("");
    setWeekGoal("");
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(copy("form_name_required"));
      return;
    }
    setError(null);
    const goal = Number.parseInt(weekGoal, 10);
    try {
      await create.mutateAsync({
        name: trimmed,
        persona: persona.trim() || undefined,
        track: track.trim() || undefined,
        audience: audience.trim() || undefined,
        week_goal: Number.isFinite(goal) && goal > 0 ? goal : undefined,
      });
      reset();
      onOpenChange(false);
    } catch {
      setError(copy("form_failed"));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy("form_title")}</DialogTitle>
          <DialogDescription>{copy("form_description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="studio-ip-name">{copy("form_name")}</Label>
            <Input
              id="studio-ip-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="studio-ip-persona">{copy("form_persona")}</Label>
            <Input
              id="studio-ip-persona"
              value={persona}
              onChange={(event) => setPersona(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="studio-ip-track">{copy("form_track")}</Label>
              <Input
                id="studio-ip-track"
                value={track}
                onChange={(event) => setTrack(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="studio-ip-audience">{copy("form_audience")}</Label>
              <Input
                id="studio-ip-audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="studio-ip-goal">{copy("form_week_goal")}</Label>
            <Input
              id="studio-ip-goal"
              type="number"
              min={0}
              inputMode="numeric"
              value={weekGoal}
              onChange={(event) => setWeekGoal(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-caption text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {copy("form_cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={create.isPending}>
              {copy("form_save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
