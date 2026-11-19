"use client";

import { useQuery } from "@tanstack/react-query";
import { adsMaterialListOptions } from "@morechat/core/api/qianchuan-queries";
import { FileVideo } from "@morechat/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morechat/ui/components/ui/table";
import { useLocale, useT } from "../../i18n";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { AdsBlock } from "./block";
import { DashText } from "./figure";
import { materialScript } from "./model";

/**
 * 素材: what is running, and which content script it came from.
 *
 * `media_script_id` is the bridge between the paid side and the studio's scripts
 * (`WORKBENCH-API §25`): a material the sync has not matched yet has no script,
 * and the row says 未关联 rather than showing an empty cell that could be read as
 * "no script exists". The id is shortened to its first segment, which is what a
 * person reads out loud; the full id stays in the title attribute.
 */
export function AdsMaterialsBlock({ wsId }: { wsId: string }) {
  const { t } = useT("ads");
  const locales = useLocale();
  const materials = useQuery(adsMaterialListOptions(wsId));
  const rows = materials.data?.materials ?? [];

  return (
    <AdsBlock
      title={t(($) => $.materials.title)}
      count={rows.length > 0 ? rows.length : undefined}
      isLoading={materials.isPending}
      isError={materials.isError}
      onRetry={() => void materials.refetch()}
    >
      {rows.length === 0 ? (
        <ObjectSectionEmpty icon={FileVideo} description={t(($) => $.materials.empty)} />
      ) : (
        <ObjectSectionCard className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(($) => $.materials.kind)}</TableHead>
                <TableHead>{t(($) => $.materials.name)}</TableHead>
                <TableHead className="text-right">{t(($) => $.materials.duration)}</TableHead>
                <TableHead>{t(($) => $.materials.script)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const script = materialScript(row.media_script_id);
                return (
                  <TableRow key={`${row.kind}:${row.material_id}`} data-material={row.material_id}>
                    <TableCell className="text-muted-foreground">{row.kind || <DashText />}</TableCell>
                    <TableCell className="max-w-64 truncate" title={row.filename ?? row.material_id}>
                      {row.filename ?? row.video_id ?? row.image_id ?? row.material_id}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.duration === null ? (
                        <DashText />
                      ) : (
                        `${new Intl.NumberFormat(locales, { maximumFractionDigits: 1 }).format(row.duration)}s`
                      )}
                    </TableCell>
                    <TableCell>
                      {script ? (
                        <span
                          data-slot="ads-script"
                          className="truncate text-muted-foreground"
                          title={row.media_script_id ?? undefined}
                        >
                          {script}
                        </span>
                      ) : (
                        <span data-slot="ads-unlinked" className="text-muted-foreground">
                          {t(($) => $.materials.unlinked)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ObjectSectionCard>
      )}
    </AdsBlock>
  );
}
