import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithI18n } from "../test/i18n";
import { AffiliateForm } from "./affiliate-form";
import type { AffiliateLedgerDomain } from "./data";

// The four B2 forms (`docs/engineering/WORKBENCH-API.md` §11) share one dialog,
// so this suite checks the rules that are not visible from the field list: the
// ownership/client pair, the percent-to-rate conversion, the period check, and
// that a day is written through the upsert with the numbers as typed.

const WS = "ws-1";

const api = vi.hoisted(() => ({
  createAffiliateProduct: vi.fn(async () => ({})),
  createAffiliatePick: vi.fn(async () => ({})),
  upsertAffiliateDaily: vi.fn(async () => ({})),
  createAffiliateSettlement: vi.fn(async () => ({})),
  listCrmClients: vi.fn(async () => ({
    clients: [{ id: "client-1", name: "青柚品牌" }],
    total: 1,
  })),
  listAffiliateProducts: vi.fn(async () => ({
    products: [{ id: "prod-1", title: "便携榨汁杯" }],
    total: 1,
  })),
  listAffiliatePicks: vi.fn(async () => ({
    picks: [{ id: "pick-1", product_id: "prod-1", creator_id: "creator-1" }],
    total: 1,
  })),
  listCreators: vi.fn(async () => ({
    creators: [{ id: "creator-1", display_name: "林小满" }],
    total: 1,
  })),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockClear();
});

afterEach(cleanup);

function renderForm(domain: AffiliateLedgerDomain) {
  const onOpenChange = vi.fn();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  renderWithI18n(
    <QueryClientProvider client={qc}>
      <AffiliateForm domain={domain} wsId={WS} open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

/** Fill the three product fields every product write needs.
 *
 *  The two "Platform…" labels differ only by a suffix, and the required marker
 *  (`*`) is part of the label's text, so the patterns below are anchored. */
function fillProductBasics() {
  fireEvent.change(screen.getByLabelText(/^Product title/), {
    target: { value: "便携榨汁杯" },
  });
  fireEvent.change(screen.getByLabelText(/^Platform\*$/), { target: { value: "douyin" } });
  fireEvent.change(screen.getByLabelText(/Platform product id/), {
    target: { value: "3801234567890" },
  });
}

async function chooseOwnership(label: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "Ownership" }));
  await userEvent.click(await screen.findByRole("option", { name: label }));
}

describe("AffiliateForm · ownership and client", () => {
  it("refuses a client-brand product with no client and says which field is missing", async () => {
    renderForm("products");
    fillProductBasics();
    await chooseOwnership("Client brand");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Fill in: Client");
    await waitFor(() => expect(api.createAffiliateProduct).not.toHaveBeenCalled());
  });

  it("disables the client picker for an own-brand product and sends no client_id", async () => {
    const { onOpenChange } = renderForm("products");
    fillProductBasics();
    await chooseOwnership("Own brand");

    // A 自营 SKU has no seller: the picker is off, not merely empty.
    expect(screen.getByRole("combobox", { name: "Client" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createAffiliateProduct).toHaveBeenCalled());
    // `client_id` is omitted, not nulled: an own-brand SKU has no seller, and
    // the server reads an absent field as exactly that.
    expect(api.createAffiliateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ ownership: "own_brand" }),
    );
    expect(api.createAffiliateProduct).toHaveBeenCalledWith(
      expect.not.objectContaining({ client_id: expect.anything() }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe("AffiliateForm · percentages", () => {
  it("converts a typed 15 % into the 0.15 rate storage keeps", async () => {
    renderForm("picks");

    await userEvent.click(screen.getByRole("combobox", { name: "Product" }));
    await userEvent.click(await screen.findByRole("option", { name: "便携榨汁杯" }));
    await userEvent.click(screen.getByRole("combobox", { name: "Creator" }));
    await userEvent.click(await screen.findByRole("option", { name: "林小满" }));
    fireEvent.change(screen.getByLabelText(/Commission rate/), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText(/Agency share/), { target: { value: "20" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.createAffiliatePick).toHaveBeenCalledWith({
        product_id: "prod-1",
        creator_id: "creator-1",
        commission_rate: 0.15,
        agency_share_rate: 0.2,
        service_fee_amount: null,
        status: "active",
      }),
    );
  });
});

describe("AffiliateForm · a statement's period", () => {
  it("refuses a period that ends before it starts, before anything is sent", async () => {
    renderForm("affiliate_settlements");

    fireEvent.change(screen.getByLabelText(/Period start/), {
      target: { value: "2026-03-31" },
    });
    fireEvent.change(screen.getByLabelText(/Period end/), {
      target: { value: "2026-03-01" },
    });
    fireEvent.change(screen.getByLabelText(/Gross commission/), {
      target: { value: "1000" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("The period ends before it starts");
    await waitFor(() => expect(api.createAffiliateSettlement).not.toHaveBeenCalled());
  });

  it("fills the net from the three components when it is left blank", async () => {
    renderForm("affiliate_settlements");

    fireEvent.change(screen.getByLabelText(/Period start/), {
      target: { value: "2026-03-01" },
    });
    fireEvent.change(screen.getByLabelText(/Period end/), {
      target: { value: "2026-03-31" },
    });
    fireEvent.change(screen.getByLabelText(/Gross commission/), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText(/Tech service fee/), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/Refund deduction/), { target: { value: "50" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.createAffiliateSettlement).toHaveBeenCalledWith({
        period_start: "2026-03-01",
        period_end: "2026-03-31",
        gross_commission: 1000,
        tech_service_fee: 100,
        refund_deduction: 50,
        net_amount: 850,
        settled_to: "agency",
        status: "pending",
        external_no: null,
      }),
    );
  });
});

describe("AffiliateForm · a day of a pick", () => {
  it("upserts the day with the numbers as typed", async () => {
    const { onOpenChange } = renderForm("daily");

    await userEvent.click(screen.getByRole("combobox", { name: "Pick" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "便携榨汁杯 × 林小满" }),
    );
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText(/^GMV/), { target: { value: "12800" } });
    fireEvent.change(screen.getByLabelText(/^Orders/), { target: { value: "64" } });
    fireEvent.change(screen.getByLabelText(/^Refund/), { target: { value: "320" } });
    fireEvent.change(screen.getByLabelText(/Estimated commission/), {
      target: { value: "1536" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.upsertAffiliateDaily).toHaveBeenCalledWith({
        pick_id: "pick-1",
        stat_date: "2026-03-01",
        gmv_amount: 12800,
        order_count: 64,
        refund_amount: 320,
        est_commission: 1536,
        settled_commission: undefined,
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
