"use client";

import { useState } from "react";
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
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@morechat/ui/components/ui/dropdown-menu";
import { useDeleteBdCampaign } from "@morechat/core/bd/mutations";
import type { BdCampaign } from "@morechat/core/types";
import { useT } from "../../i18n";
import { CollectionRowMenu } from "../../layout/collection-list";
import { useCampaignsCopy } from "./copy";

/**
 * A batch row's two writes: edit, and delete.
 *
 * 删除 is a soft delete on the server (§20.2) but irreversible from this screen —
 * the row leaves every list and the name becomes free again — so it asks first.
 * The list is not changed until the server has answered: a row that vanished on a
 * failed request is a lie the reader only finds out about on reload. A failure
 * stays in the dialog with its message, next to the button that retried.
 */
export function CampaignRowActions({
  campaign,
  canWrite,
  onEdit,
}: {
  campaign: BdCampaign;
  canWrite: boolean;
  onEdit: () => void;
}) {
  const copy = useCampaignsCopy();
  const { t } = copy;
  const { t: tCommon } = useT("common");
  const remove = useDeleteBdCampaign();
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!canWrite) return null;

  const destroy = async () => {
    setFailure(null);
    try {
      await remove.mutateAsync(campaign.id);
      setConfirming(false);
    } catch (error) {
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : t(($) => $.campaigns.write_failed),
      );
    }
  };

  return (
    <>
      <CollectionRowMenu label={t(($) => $.campaigns.row_actions)}>
        <DropdownMenuItem onClick={onEdit}>{t(($) => $.campaigns.action_edit)}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
          {tCommon(($) => $.delete)}
        </DropdownMenuItem>
      </CollectionRowMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.campaigns.delete_title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.campaigns.delete_description)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {failure}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {tCommon(($) => $.cancel)}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              aria-busy={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void destroy();
              }}
            >
              {tCommon(($) => $.delete)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
