"use client";

import { useId, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import {
  useCreateAffiliatePick,
  useCreateAffiliateProduct,
  useCreateAffiliateSettlement,
  useUpsertAffiliateDaily,
} from "@morechat/core/affiliate/mutations";
import {
  affiliatePickListOptions,
  affiliateProductListOptions,
} from "@morechat/core/affiliate/queries";
import { creatorListOptions } from "@morechat/core/creator/queries";
import { crmClientListOptions } from "@morechat/core/crm/queries";
import type {
  AffiliateOwnership,
  AffiliatePickStatus,
  AffiliateProductStatus,
  AffiliateSettlementRecipient,
  AffiliateSettlementStatus,
} from "@morechat/core/types";
import { useT } from "../i18n";
import type { AffiliateLedgerDomain } from "./data";

/** Select value for "nothing picked". A real pick is the entity's id or enum. */
const NONE = "__none";

const OWNERSHIPS: readonly AffiliateOwnership[] = ["own_brand", "client_brand"];

const PRODUCT_STATUSES: readonly AffiliateProductStatus[] = ["on_shelf", "off_shelf", "ended"];

const PICK_STATUSES: readonly AffiliatePickStatus[] = ["active", "paused", "ended"];

const RECIPIENTS: readonly AffiliateSettlementRecipient[] = ["agency", "creator"];

const SETTLEMENT_STATUSES: readonly AffiliateSettlementStatus[] = ["pending", "paid", "failed"];

/**
 * The fields the four B2 forms ask for (`docs/engineering/WORKBENCH-API.md`
 * §11). These names are the keys of `blocks.affiliate.form.field.*`, so a field
 * label and a validation message name the same thing.
 */
export type AffiliateField =
  | "title"
  | "ownership"
  | "client"
  | "platform"
  | "platform_product_id"
  | "category"
  | "price"
  | "commission_rate"
  | "activity"
  | "status"
  | "product"
  | "creator"
  | "agency_share_rate"
  | "service_fee"
  | "pick"
  | "stat_date"
  | "gmv"
  | "orders"
  | "refund"
  | "est_commission"
  | "settled_commission"
  | "period_start"
  | "period_end"
  | "gross_commission"
  | "tech_service_fee"
  | "refund_deduction"
  | "net_amount"
  | "settled_to"
  | "external_no";

const EMPTY_PRODUCT: {
  title: string;
  ownership: AffiliateOwnership | typeof NONE;
  client_id: string;
  platform: string;
  platform_product_id: string;
  category: string;
  price: string;
  commission_rate: string;
  activity: string;
  status: AffiliateProductStatus;
} = {
  title: "",
  ownership: NONE,
  client_id: NONE,
  platform: "",
  platform_product_id: "",
  category: "",
  price: "",
  commission_rate: "",
  activity: "",
  status: "on_shelf",
};

const EMPTY_PICK: {
  product_id: string;
  creator_id: string;
  commission_rate: string;
  agency_share_rate: string;
  service_fee_amount: string;
  status: AffiliatePickStatus;
} = {
  product_id: NONE,
  creator_id: NONE,
  commission_rate: "",
  agency_share_rate: "",
  service_fee_amount: "",
  status: "active",
};

const EMPTY_DAILY: {
  pick_id: string;
  stat_date: string;
  gmv_amount: string;
  order_count: string;
  refund_amount: string;
  est_commission: string;
  settled_commission: string;
} = {
  pick_id: NONE,
  stat_date: "",
  gmv_amount: "",
  order_count: "",
  refund_amount: "",
  est_commission: "",
  settled_commission: "",
};

const EMPTY_SETTLEMENT: {
  period_start: string;
  period_end: string;
  gross_commission: string;
  tech_service_fee: string;
  refund_deduction: string;
  net_amount: string;
  settled_to: AffiliateSettlementRecipient;
  status: AffiliateSettlementStatus;
  external_no: string;
} = {
  period_start: "",
  period_end: "",
  gross_commission: "",
  tech_service_fee: "",
  refund_deduction: "",
  net_amount: "",
  settled_to: "agency",
  status: "pending",
  external_no: "",
};

export interface AffiliateFormProps {
  domain: AffiliateLedgerDomain;
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One new row of a 精选联盟 ledger, written through that ledger's own mutation.
 *
 * The four forms share a dialog because they share the contract (`§11`): one
 * record is a product, a pick binds a creator to it, a daily row is one pick's
 * day, and a statement is a period's money. Their fields do not overlap enough
 * to share an input list, so each domain draws its own block and only the
 * references it needs are read — a product form never fetches picks.
 *
 * Three rules show on screen:
 *
 * - **Rates are typed as percentages and stored as rates.** The input is 0–100
 *   and the request divides by 100, because `commission_rate` is 0–1 in storage
 *   (C3) while every operator speaks in percents.
 * - **Ownership and client are one decision.** A 自营 SKU has no seller, so
 *   switching to `own_brand` clears and disables the client picker and the
 *   request omits `client_id`; a 代卖 row cannot be written without one.
 * - **A statement's net is the platform's arithmetic.** Left blank it is
 *   `gross − tech_service_fee − refund_deduction`, which is what the platform
 *   itself reports; typed, it is sent as typed. The server has no formula of its
 *   own, so the form does the sum rather than sending a statement with no net.
 */
export function AffiliateForm({ domain, wsId, open, onOpenChange }: AffiliateFormProps) {
  const { t } = useT("blocks");
  const id = useId();

  const [product, setProduct] = useState(EMPTY_PRODUCT);
  const [pick, setPick] = useState(EMPTY_PICK);
  const [daily, setDaily] = useState(EMPTY_DAILY);
  const [settlement, setSettlement] = useState(EMPTY_SETTLEMENT);
  const [missing, setMissing] = useState<AffiliateField[]>([]);
  const [periodInvalid, setPeriodInvalid] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // One dialog, one attempt: a reopen starts from an empty draft, because the
  // row it described has been written (or abandoned) meanwhile. Resetting while
  // rendering keeps the first frame of the reopened dialog from flashing the
  // previous draft.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setProduct(EMPTY_PRODUCT);
      setPick(EMPTY_PICK);
      setDaily({ ...EMPTY_DAILY, stat_date: today() });
      setSettlement(EMPTY_SETTLEMENT);
      setMissing([]);
      setPeriodInvalid(false);
      setFailure(null);
    }
  }

  const clients = useQuery({
    ...crmClientListOptions(wsId),
    enabled: open && !!wsId && domain === "products",
  });
  const products = useQuery({
    ...affiliateProductListOptions(wsId),
    enabled: open && !!wsId && (domain === "picks" || domain === "daily"),
  });
  const creators = useQuery({
    ...creatorListOptions(wsId),
    enabled: open && !!wsId && (domain === "picks" || domain === "daily"),
  });
  const picks = useQuery({
    ...affiliatePickListOptions(wsId),
    enabled: open && !!wsId && domain === "daily",
  });

  const createProduct = useCreateAffiliateProduct();
  const createPick = useCreateAffiliatePick();
  const upsertDaily = useUpsertAffiliateDaily();
  const createSettlement = useCreateAffiliateSettlement();
  const pending =
    createProduct.isPending ||
    createPick.isPending ||
    upsertDaily.isPending ||
    createSettlement.isPending;

  const label = (field: AffiliateField) => t(($) => $.affiliate.form.field[field]);

  const chooseOption = { value: NONE, label: t(($) => $.affiliate.form.option.choose) } as const;

  const clientOptions = [
    chooseOption,
    ...(clients.data?.clients ?? []).map((row) => ({ value: row.id, label: row.name })),
  ];
  const productOptions = [
    chooseOption,
    ...(products.data?.products ?? []).map((row) => ({ value: row.id, label: row.title })),
  ];
  const creatorOptions = [
    chooseOption,
    ...(creators.data?.creators ?? []).map((row) => ({ value: row.id, label: row.display_name })),
  ];
  const productTitles = new Map(
    (products.data?.products ?? []).map((row) => [row.id, row.title] as const),
  );
  const creatorNames = new Map(
    (creators.data?.creators ?? []).map((row) => [row.id, row.display_name] as const),
  );
  // A pick is a product × creator pair, so the daily form names both halves.
  const pickOptions = [
    chooseOption,
    ...(picks.data?.picks ?? []).map((row) => ({
      value: row.id,
      label: pickLabel(row.product_id, row.creator_id, productTitles, creatorNames),
    })),
  ];
  const ownershipOptions: { value: AffiliateOwnership | typeof NONE; label: string }[] = [
    chooseOption,
    ...OWNERSHIPS.map((ownership) => ({
      value: ownership,
      label: t(($) => $.affiliate.ownership[ownership]),
    })),
  ];
  const productStatusOptions = PRODUCT_STATUSES.map((status) => ({
    value: status,
    label: t(($) => $.affiliate.product_status[status]),
  }));
  const pickStatusOptions = PICK_STATUSES.map((status) => ({
    value: status,
    label: t(($) => $.affiliate.pick_status[status]),
  }));
  const recipientOptions = RECIPIENTS.map((recipient) => ({
    value: recipient,
    label: t(($) => $.affiliate.recipient[recipient]),
  }));
  const settlementStatusOptions = SETTLEMENT_STATUSES.map((status) => ({
    value: status,
    label: t(($) => $.affiliate.settlement_status[status]),
  }));

  const isOwnBrand = product.ownership === "own_brand";

  const requiredNow = (): AffiliateField[] => {
    switch (domain) {
      case "products": {
        const fields: AffiliateField[] = [];
        if (!product.title.trim()) fields.push("title");
        if (product.ownership === NONE) fields.push("ownership");
        // A 代卖 SKU belongs to a client; a 自营 one has nobody to charge.
        if (product.ownership === "client_brand" && product.client_id === NONE) {
          fields.push("client");
        }
        if (!product.platform.trim()) fields.push("platform");
        if (!product.platform_product_id.trim()) fields.push("platform_product_id");
        return fields;
      }
      case "picks": {
        const fields: AffiliateField[] = [];
        if (pick.product_id === NONE) fields.push("product");
        if (pick.creator_id === NONE) fields.push("creator");
        return fields;
      }
      case "daily": {
        const fields: AffiliateField[] = [];
        if (daily.pick_id === NONE) fields.push("pick");
        if (!daily.stat_date) fields.push("stat_date");
        return fields;
      }
      case "affiliate_settlements": {
        const fields: AffiliateField[] = [];
        if (!settlement.period_start) fields.push("period_start");
        if (!settlement.period_end) fields.push("period_end");
        if (!settlement.gross_commission.trim()) fields.push("gross_commission");
        return fields;
      }
    }
  };

  const send = () => {
    switch (domain) {
      case "products":
        return createProduct.mutateAsync({
          title: product.title.trim(),
          ownership: product.ownership === NONE ? undefined : product.ownership,
          // Omitted, not null: an own-brand SKU has no seller, and the server
          // reads an absent `client_id` as exactly that.
          ...(product.ownership === "client_brand" && product.client_id !== NONE
            ? { client_id: product.client_id }
            : {}),
          platform: product.platform.trim(),
          platform_product_id: product.platform_product_id.trim(),
          category: product.category.trim() || null,
          price: amount(product.price),
          commission_rate: rate(product.commission_rate),
          activity: product.activity.trim() || null,
          status: product.status,
        });
      case "picks":
        return createPick.mutateAsync({
          product_id: pick.product_id,
          creator_id: pick.creator_id,
          commission_rate: rate(pick.commission_rate),
          // A null share is "not an internal split", which is a different
          // statement from a zero share — so an empty field stays null.
          agency_share_rate: rate(pick.agency_share_rate),
          service_fee_amount: amount(pick.service_fee_amount),
          status: pick.status,
        });
      case "daily":
        return upsertDaily.mutateAsync({
          pick_id: daily.pick_id,
          stat_date: daily.stat_date,
          // The write replaces the day: an omitted measure is the server's zero,
          // which is the same thing a blank field means here.
          gmv_amount: amount(daily.gmv_amount) ?? undefined,
          order_count: amount(daily.order_count) ?? undefined,
          refund_amount: amount(daily.refund_amount) ?? undefined,
          est_commission: amount(daily.est_commission) ?? undefined,
          settled_commission: amount(daily.settled_commission) ?? undefined,
        });
      case "affiliate_settlements":
        return createSettlement.mutateAsync({
          period_start: settlement.period_start,
          period_end: settlement.period_end,
          gross_commission: amount(settlement.gross_commission) ?? 0,
          tech_service_fee: amount(settlement.tech_service_fee) ?? 0,
          refund_deduction: amount(settlement.refund_deduction) ?? 0,
          // The server stores `net_amount` as sent and never recomputes it, so a
          // blank field is summed here, the way the platform's own statement is.
          net_amount: amount(settlement.net_amount) ?? netOf(settlement),
          settled_to: settlement.settled_to,
          status: settlement.status,
          external_no: settlement.external_no.trim() || null,
        });
    }
  };

  const submit = async () => {
    if (pending) return;
    const required = requiredNow();
    setMissing(required);
    // The period check is its own message: "fill in" would be wrong for two
    // dates that are both filled in and the wrong way round.
    const invalidPeriod =
      domain === "affiliate_settlements" &&
      !!settlement.period_start &&
      !!settlement.period_end &&
      settlement.period_end < settlement.period_start;
    setPeriodInvalid(invalidPeriod);
    if (required.length > 0 || invalidPeriod) return;
    setFailure(null);
    try {
      await send();
      onOpenChange(false);
    } catch (error) {
      // The dialog stays open with its input: the row was not written, and the
      // reader needs to see it to fix it.
      setFailure(error instanceof Error ? error.message : "");
    }
  };

  const field = (key: AffiliateField, control: ReactNode, required = false) => (
    <Field id={`${id}-${key}`} label={label(key)} required={required}>
      {control}
    </Field>
  );

  const invalid = (key: AffiliateField) => (missing.includes(key) ? true : undefined);

  const controls = () => {
    switch (domain) {
      case "products":
        return (
          <>
            {field(
              "title",
              <Input
                id={`${id}-title`}
                value={product.title}
                aria-invalid={invalid("title")}
                onChange={(event) => setProduct({ ...product, title: event.target.value })}
              />,
              true,
            )}
            {field(
              "ownership",
              <Picker
                id={`${id}-ownership`}
                value={product.ownership}
                options={ownershipOptions}
                invalid={invalid("ownership")}
                onChange={(next) =>
                  setProduct({
                    ...product,
                    ownership: next,
                    // Switching to 自营 clears the seller: the pair is one
                    // decision, and a stale client id would be sent with it.
                    client_id: next === "own_brand" ? NONE : product.client_id,
                  })
                }
              />,
              true,
            )}
            {field(
              "client",
              <Picker
                id={`${id}-client`}
                value={product.client_id}
                options={clientOptions}
                invalid={invalid("client")}
                disabled={isOwnBrand}
                onChange={(next) => setProduct({ ...product, client_id: next })}
              />,
              !isOwnBrand,
            )}
            {field(
              "platform",
              <Input
                id={`${id}-platform`}
                value={product.platform}
                aria-invalid={invalid("platform")}
                onChange={(event) => setProduct({ ...product, platform: event.target.value })}
              />,
              true,
            )}
            {field(
              "platform_product_id",
              <Input
                id={`${id}-platform_product_id`}
                value={product.platform_product_id}
                aria-invalid={invalid("platform_product_id")}
                onChange={(event) =>
                  setProduct({ ...product, platform_product_id: event.target.value })
                }
              />,
              true,
            )}
            {field(
              "category",
              <Input
                id={`${id}-category`}
                value={product.category}
                onChange={(event) => setProduct({ ...product, category: event.target.value })}
              />,
            )}
            {field(
              "price",
              <Input
                id={`${id}-price`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={product.price}
                onChange={(event) => setProduct({ ...product, price: event.target.value })}
              />,
            )}
            {field(
              "commission_rate",
              <Input
                id={`${id}-commission_rate`}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.1"
                value={product.commission_rate}
                onChange={(event) =>
                  setProduct({ ...product, commission_rate: event.target.value })
                }
              />,
            )}
            {field(
              "activity",
              <Input
                id={`${id}-activity`}
                value={product.activity}
                onChange={(event) => setProduct({ ...product, activity: event.target.value })}
              />,
            )}
            {field(
              "status",
              <Picker
                id={`${id}-status`}
                value={product.status}
                options={productStatusOptions}
                onChange={(next) => setProduct({ ...product, status: next })}
              />,
            )}
          </>
        );
      case "picks":
        return (
          <>
            {field(
              "product",
              <Picker
                id={`${id}-product`}
                value={pick.product_id}
                options={productOptions}
                invalid={invalid("product")}
                onChange={(next) => setPick({ ...pick, product_id: next })}
              />,
              true,
            )}
            {field(
              "creator",
              <Picker
                id={`${id}-creator`}
                value={pick.creator_id}
                options={creatorOptions}
                invalid={invalid("creator")}
                onChange={(next) => setPick({ ...pick, creator_id: next })}
              />,
              true,
            )}
            {field(
              "commission_rate",
              <Input
                id={`${id}-commission_rate`}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.1"
                value={pick.commission_rate}
                onChange={(event) => setPick({ ...pick, commission_rate: event.target.value })}
              />,
            )}
            {field(
              "agency_share_rate",
              <Input
                id={`${id}-agency_share_rate`}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.1"
                value={pick.agency_share_rate}
                onChange={(event) => setPick({ ...pick, agency_share_rate: event.target.value })}
              />,
            )}
            {field(
              "service_fee",
              <Input
                id={`${id}-service_fee`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={pick.service_fee_amount}
                onChange={(event) =>
                  setPick({ ...pick, service_fee_amount: event.target.value })
                }
              />,
            )}
            {field(
              "status",
              <Picker
                id={`${id}-status`}
                value={pick.status}
                options={pickStatusOptions}
                onChange={(next) => setPick({ ...pick, status: next })}
              />,
            )}
          </>
        );
      case "daily":
        return (
          <>
            {field(
              "pick",
              <Picker
                id={`${id}-pick`}
                value={daily.pick_id}
                options={pickOptions}
                invalid={invalid("pick")}
                onChange={(next) => setDaily({ ...daily, pick_id: next })}
              />,
              true,
            )}
            {field(
              "stat_date",
              <Input
                id={`${id}-stat_date`}
                type="date"
                value={daily.stat_date}
                aria-invalid={invalid("stat_date")}
                onChange={(event) => setDaily({ ...daily, stat_date: event.target.value })}
              />,
              true,
            )}
            {field(
              "gmv",
              <Input
                id={`${id}-gmv`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={daily.gmv_amount}
                onChange={(event) => setDaily({ ...daily, gmv_amount: event.target.value })}
              />,
            )}
            {field(
              "orders",
              <Input
                id={`${id}-orders`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={daily.order_count}
                onChange={(event) => setDaily({ ...daily, order_count: event.target.value })}
              />,
            )}
            {field(
              "refund",
              <Input
                id={`${id}-refund`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={daily.refund_amount}
                onChange={(event) => setDaily({ ...daily, refund_amount: event.target.value })}
              />,
            )}
            {field(
              "est_commission",
              <Input
                id={`${id}-est_commission`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={daily.est_commission}
                onChange={(event) =>
                  setDaily({ ...daily, est_commission: event.target.value })
                }
              />,
            )}
            {field(
              "settled_commission",
              <Input
                id={`${id}-settled_commission`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={daily.settled_commission}
                onChange={(event) =>
                  setDaily({ ...daily, settled_commission: event.target.value })
                }
              />,
            )}
          </>
        );
      case "affiliate_settlements":
        return (
          <>
            {field(
              "period_start",
              <Input
                id={`${id}-period_start`}
                type="date"
                value={settlement.period_start}
                aria-invalid={invalid("period_start")}
                onChange={(event) =>
                  setSettlement({ ...settlement, period_start: event.target.value })
                }
              />,
              true,
            )}
            {field(
              "period_end",
              <Input
                id={`${id}-period_end`}
                type="date"
                value={settlement.period_end}
                aria-invalid={invalid("period_end") || (periodInvalid ? true : undefined)}
                onChange={(event) =>
                  setSettlement({ ...settlement, period_end: event.target.value })
                }
              />,
              true,
            )}
            {field(
              "gross_commission",
              <Input
                id={`${id}-gross_commission`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={settlement.gross_commission}
                aria-invalid={invalid("gross_commission")}
                onChange={(event) =>
                  setSettlement({ ...settlement, gross_commission: event.target.value })
                }
              />,
              true,
            )}
            {field(
              "tech_service_fee",
              <Input
                id={`${id}-tech_service_fee`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={settlement.tech_service_fee}
                onChange={(event) =>
                  setSettlement({ ...settlement, tech_service_fee: event.target.value })
                }
              />,
            )}
            {field(
              "refund_deduction",
              <Input
                id={`${id}-refund_deduction`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={settlement.refund_deduction}
                onChange={(event) =>
                  setSettlement({ ...settlement, refund_deduction: event.target.value })
                }
              />,
            )}
            {field(
              "net_amount",
              <Input
                id={`${id}-net_amount`}
                type="number"
                inputMode="decimal"
                step="0.01"
                value={settlement.net_amount}
                onChange={(event) =>
                  setSettlement({ ...settlement, net_amount: event.target.value })
                }
              />,
            )}
            {field(
              "settled_to",
              <Picker
                id={`${id}-settled_to`}
                value={settlement.settled_to}
                options={recipientOptions}
                onChange={(next) => setSettlement({ ...settlement, settled_to: next })}
              />,
            )}
            {field(
              "status",
              <Picker
                id={`${id}-status`}
                value={settlement.status}
                options={settlementStatusOptions}
                onChange={(next) => setSettlement({ ...settlement, status: next })}
              />,
            )}
            {field(
              "external_no",
              <Input
                id={`${id}-external_no`}
                value={settlement.external_no}
                onChange={(event) =>
                  setSettlement({ ...settlement, external_no: event.target.value })
                }
              />,
            )}
          </>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(($) => $.affiliate.form.title[domain])}</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3">{controls()}</div>
          {missing.length > 0 || periodInvalid || failure !== null ? (
            <p role="alert" className="text-caption text-destructive">
              {missing.length > 0
                ? t(($) => $.affiliate.form.error.required, {
                    fields: missing.map(label).join(", "),
                  })
                : periodInvalid
                  ? t(($) => $.affiliate.form.error.period)
                  : t(($) => $.affiliate.form.error.submit)}
              {failure ? (
                <span className="block break-words text-muted-foreground">{failure}</span>
              ) : null}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t(($) => $.affiliate.form.action.close)}
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {t(($) => $.affiliate.form.action.save)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  required = false,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}

/**
 * A select over ids and enums. `items` is required by the primitive (it renders
 * the raw value otherwise), so the option list is the single source of both the
 * menu and the trigger's label.
 */
function Picker<T extends string>({
  id,
  value,
  options,
  invalid,
  disabled = false,
  onChange,
}: {
  id: string;
  value: T;
  options: { value: T; label: string }[];
  invalid?: true;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Select
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next === null) return;
        onChange(next as T);
      }}
    >
      <SelectTrigger id={id} aria-invalid={invalid} disabled={disabled} className="w-full">
        <SelectValue>
          {() => options.find((option) => option.value === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Today as a `YYYY-MM-DD` calendar day, read in the viewer's own zone: a
 *  daily report is filed for the day it belongs to, not for UTC's. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** A form amount is a string until it is sent; an empty or unreadable one is
 *  the same "not given" the request type spells as `null`. */
function amount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A percentage typed 0–100 as the 0–1 rate storage keeps (C3).
 *
 * Rounded to four decimals so `33.33` becomes exactly `0.3333` rather than the
 * binary-float neighbour of it — the column is NUMERIC(6,4) on the server.
 */
function rate(value: string): number | null {
  const parsed = amount(value);
  if (parsed === null) return null;
  return Number((parsed / 100).toFixed(4));
}

/** A statement's net when the reader did not type the platform's own number. */
function netOf(draft: {
  gross_commission: string;
  tech_service_fee: string;
  refund_deduction: string;
}): number {
  const gross = amount(draft.gross_commission) ?? 0;
  const fee = amount(draft.tech_service_fee) ?? 0;
  const refund = amount(draft.refund_deduction) ?? 0;
  return Number((gross - fee - refund).toFixed(2));
}

/** `商品 × 达人`, with the id's short form for a half the cache does not hold. */
function pickLabel(
  productId: string,
  creatorId: string,
  productTitles: ReadonlyMap<string, string>,
  creatorNames: ReadonlyMap<string, string>,
): string {
  const product = productTitles.get(productId) ?? shortId(productId);
  const creator = creatorNames.get(creatorId) ?? shortId(creatorId);
  return `${product} × ${creator}`;
}

/** Ids are UUIDs; the first segment is what people read out loud. */
function shortId(id: string): string {
  if (!id) return "—";
  return id.length > 8 ? id.slice(0, 8) : id;
}
