"use client";

import { MEDIA_SCORE_DIMENSIONS } from "@morechat/core/types/media";
import type { MediaScoreDimension } from "@morechat/core/types";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import { useT } from "../../i18n";
import { scoreEntries } from "./model";

/**
 * The five-dimension score card, as an editable key/value grid.
 *
 * Each row names the dimension in the reader's language *and* in its stored key
 * (`痛点 · pain`), because the key is what every other surface of the workbench —
 * the radar, the scripts, an export — matches on. The value is a 0–100 input; an
 * empty field reads as 0 in {@link draftScores}, which is what "not scored yet"
 * means in the contract.
 *
 * A row the row already carries under a dimension this build does not know is
 * listed underneath and left out of the editor: the server merges a patch into
 * the stored card, so an untouched key survives — and sending one would be a 400.
 */
export function ScoreFields({
  draft,
  stored,
  onChange,
}: {
  /** The five known dimensions, as typed. Missing keys mean "0". */
  draft: Readonly<Record<string, string>>;
  /** What the row stores, for the dimensions this build cannot edit. */
  stored: unknown;
  onChange: (key: MediaScoreDimension, value: string) => void;
}) {
  const { t } = useT("content");
  const kept = scoreEntries(stored).filter((entry) => !entry.known);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {MEDIA_SCORE_DIMENSIONS.map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <Label htmlFor={`score-${key}`} className="flex min-w-0 items-baseline gap-1">
              <span className="min-w-0 truncate">{t(($) => $.topics.dim[key])}</span>
              <span className="shrink-0 font-mono text-micro text-muted-foreground">{key}</span>
            </Label>
            <Input
              id={`score-${key}`}
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              value={draft[key] ?? ""}
              onChange={(event) => onChange(key, event.target.value)}
              className="tabular-nums"
            />
          </div>
        ))}
      </div>
      {kept.length > 0 ? (
        <p className="text-caption text-muted-foreground">
          {t(($) => $.topics.kept_scores, {
            keys: kept.map((entry) => `${entry.key} ${entry.value}`).join(" · "),
          })}
        </p>
      ) : null}
    </div>
  );
}
