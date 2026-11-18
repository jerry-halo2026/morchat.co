"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { useCreateBdActivity } from "@morechat/core/bd/mutations";
import type { BdActivityOutcome } from "@morechat/core/types";
import { SegmentedToggle } from "../../common/segmented-toggle";
import { OUTCOME_OPTIONS, useActivityLabels } from "../dashboard/copy";
import { useFollowupsCopy } from "./copy";
import { localDayToIso } from "./model";

/** One creator the page-level composer can log against. */
export interface FollowupCreatorOption {
  id: string;
  name: string;
}

export interface LogFollowupFormProps {
  /** 行内的「记一笔」：达人由那一行定死。 */
  creatorId?: string;
  /** 页头「记一条」：达人由这个下拉选（与 `creatorId` 二选一）。 */
  creators?: readonly FollowupCreatorOption[];
  onSaved: () => void;
  onCancel?: () => void;
}

/**
 * 记一条跟进：结果、一句话、下次跟进日期。
 *
 * 和驾驶舱的快捷弹窗是同一件事，只是长在页面里——商务在这页看的是队列，点一行
 * 就地把电话的结果记完，不跳、不弹窗、不丢列表位置。所以字段也照旧只有三项：
 * 达人已经由那一行（或页头的下拉）定了，owner 和时间戳是服务端的。
 *
 * **`kind` 是 `note`。** 这条记录回答"上一次联系的结果是什么"；联系用的是私信还是
 * 电话属于开始那次联系的那条行，这里替读者猜一个就是把猜测存成事实（弹窗里的
 * `QuickFollowupDialog` 同一个理由）。
 *
 * **结果必填。** 这一页的每一条都是"该跟的人"，跟完总有一个结果；`outcome: null`
 * （"还没结果"）属于随手记的备注，走达人页的弹窗。四项里没有"还没结果"，也就
 * 不必在队列里留一个假装记完的状态。
 *
 * **日期写当天本地零点。** `type="date"` 不带钟点，`localDayToIso` 把这一天翻成
 * `next_follow_at`；留空 = 不排期（`null`），不是空字符串——服务端把空串当 400。
 */
export function LogFollowupForm({
  creatorId,
  creators,
  onSaved,
  onCancel,
}: LogFollowupFormProps) {
  const copy = useFollowupsCopy();
  const labels = useActivityLabels();
  const fieldId = useId();

  const [picked, setPicked] = useState<string>(
    creatorId ?? creators?.[0]?.id ?? "",
  );
  const [outcome, setOutcome] = useState<BdActivityOutcome | null>(null);
  const [summary, setSummary] = useState("");
  const [nextDay, setNextDay] = useState("");
  const [failed, setFailed] = useState(false);

  const create = useCreateBdActivity();
  const pending = create.isPending;
  const target = creatorId ?? picked;
  const canSubmit = target !== "" && outcome !== null && summary.trim() !== "" && !pending;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setFailed(false);
    try {
      await create.mutateAsync({
        creator_id: target,
        kind: "note",
        happened_at: new Date().toISOString(),
        summary: summary.trim(),
        outcome,
        next_follow_at: localDayToIso(nextDay),
      });
      onSaved();
    } catch {
      // 表单留着读者打的字：要改的是提交，不是内容。
      setFailed(true);
    }
  };

  const outcomeOptions = OUTCOME_OPTIONS.map(
    (value) => [value, labels.outcome[value]] as const,
  );

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
      aria-label={copy("composer_title")}
    >
      {creators ? (
        creators.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-creator`}>{copy("composer_creator")}</Label>
            <Select
              items={creators.map((creator) => ({
                value: creator.id,
                label: creator.name,
              }))}
              value={picked}
              onValueChange={(next) => setPicked(String(next))}
            >
              <SelectTrigger id={`${fieldId}-creator`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {creators.map((creator) => (
                  <SelectItem key={creator.id} value={creator.id}>
                    {creator.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-caption text-muted-foreground">
            {copy("composer_creator_empty")}
          </p>
        )
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-caption font-medium text-muted-foreground">
          {copy("form_outcome")}
        </span>
        <div role="group" aria-label={copy("form_outcome")}>
          <SegmentedToggle
            value={outcome ?? ""}
            options={outcomeOptions}
            onChange={(next) => setOutcome(next as BdActivityOutcome)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-summary`}>{copy("form_summary")}</Label>
        <Textarea
          id={`${fieldId}-summary`}
          value={summary}
          required
          rows={2}
          disabled={pending}
          onChange={(event) => setSummary(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-next`}>{copy("form_next")}</Label>
        <Input
          id={`${fieldId}-next`}
          type="date"
          value={nextDay}
          disabled={pending}
          className="w-fit"
          onChange={(event) => setNextDay(event.target.value)}
        />
      </div>

      {failed ? (
        <p role="alert" className="text-caption text-destructive">
          {copy("form_failed")}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit} aria-busy={pending}>
          {pending ? <Spinner aria-hidden className="size-3.5" /> : null}
          {copy("form_submit")}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={onCancel}
          >
            {copy("form_cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
