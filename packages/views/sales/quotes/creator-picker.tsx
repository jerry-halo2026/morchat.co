"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@morechat/ui/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@morechat/ui/components/ui/popover";
import { creatorListOptions } from "@morechat/core/creator/queries";
import { useQuotesCopy } from "./copy";

/** How many creators the picker reads per keystroke: enough to pick from, few
 *  enough that the menu opens at once. The search runs on the server (`q`), so a
 *  workspace with thousands of creators still finds the one being named. */
const CREATOR_PICK_LIMIT = 50;

/**
 * 选达人 — a searchable picker over the creator ledger.
 *
 * It is a `Select` in behaviour (one value, one menu, the current choice shown on
 * the trigger) but not in implementation: the ledger holds hundreds of creators
 * and the list has to be narrowed by typing, which the shared `Select` primitive
 * does not offer. The composition is the one the project already uses for a
 * searchable picker (`projects/components/project-access.tsx`): a Popover, a
 * Command field and Command items.
 *
 * The query is enabled only while the menu is open — a closed picker costs no
 * request — and each keystroke replaces the previous result rather than adding to
 * it, because cmdk's own filter is off (`shouldFilter={false}`): the server is
 * the one doing the matching.
 */
export function CreatorPicker({
  wsId,
  value,
  selectedName,
  disabled,
  onChange,
}: {
  wsId: string;
  /** The chosen creator's id, or `""` while nothing is chosen. */
  value: string;
  /** The chosen creator's name, when the caller already knows it. */
  selectedName: string | null;
  disabled?: boolean;
  onChange: (creatorId: string, name: string) => void;
}) {
  const copy = useQuotesCopy();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const creators = useQuery({
    ...creatorListOptions(wsId, { q: search.trim() || undefined, limit: CREATOR_PICK_LIMIT }),
    enabled: open && !!wsId,
  });
  const rows = creators.data?.creators ?? [];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={copy("form_creator")}
            disabled={disabled}
            className="w-full justify-start font-normal"
          >
            <span
              className={`min-w-0 truncate ${selectedName ? "" : "text-muted-foreground"}`}
              title={selectedName ?? undefined}
            >
              {selectedName ?? copy("form_creator_pick")}
            </span>
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            aria-label={copy("form_creator_search")}
            placeholder={copy("form_creator_search")}
          />
          <CommandList>
            <CommandEmpty>{copy("form_creator_empty")}</CommandEmpty>
            {rows.map((creator) => (
              <CommandItem
                key={creator.id}
                value={creator.id}
                onSelect={() => {
                  onChange(creator.id, creator.display_name);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span className="min-w-0 truncate">{creator.display_name}</span>
                <span className="min-w-0 truncate text-caption text-muted-foreground">
                  @{creator.handle}
                </span>
                {creator.id === value ? <Check className="ml-auto size-4 shrink-0" /> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
