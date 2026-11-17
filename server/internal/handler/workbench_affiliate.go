package handler

// Affiliate distribution (精选联盟 分销): products, picks, daily facts and the
// platform's settlement statements (docs/engineering/WORKBENCH-API.md §11).
//
// The shape of this domain is deliberately not the CRM one. A collaboration is a
// project with a fee and a schedule; affiliate business is 商品 × 达人 × 日期
// settled in cycles, so the four tables are:
//
//   - `affiliate_product` — a SKU a client of ours lists, with its commission;
//   - `affiliate_pick` — a creator promoting that SKU (the platform's 推广计划);
//   - `affiliate_daily` — the platform report's numbers for one pick on one day;
//   - `affiliate_settlement` — the periodic statement the platform issues.
//
// Ownership: `affiliate_product` and `affiliate_pick` carry `owner_member_id`
// and follow the B0 gate exactly (owner/admin write everything, a `member` only
// its own rows). `affiliate_daily` has no owner of its own — it belongs to its
// pick, so the gate reads the pick's owner rather than inventing a second source
// of truth. `affiliate_settlement` has no owner either, and unlike a daily row it
// cannot inherit one: a statement covers the whole workspace's picks for a
// period, so there is no single row to inherit from and the write gate is the
// role (same reasoning as the monthly finance entry in `workbench_finance.go`).

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

var (
	affiliateProductStatuses      = map[string]bool{"on_shelf": true, "off_shelf": true, "ended": true}
	affiliateProductOwnerships    = map[string]bool{"own_brand": true, "client_brand": true}
	affiliatePickStatuses         = map[string]bool{"active": true, "paused": true, "ended": true}
	affiliateSettlementStatuses   = map[string]bool{"pending": true, "paid": true, "failed": true}
	affiliateSettlementRecipients = map[string]bool{"agency": true, "creator": true}
)

// AffiliateProductRequest is the create/PATCH body for a 联盟商品.
//
// `client_id` and `ownership` are one decision, not two: an own-brand SKU has no
// seller and a client-brand SKU must name one. `ownership` defaults to
// `client_brand`, which is what every row created before 725 meant.
type AffiliateProductRequest struct {
	ClientID          *string  `json:"client_id"`
	Ownership         *string  `json:"ownership"`
	Platform          *string  `json:"platform"`
	PlatformProductID *string  `json:"platform_product_id"`
	Title             *string  `json:"title"`
	Category          *string  `json:"category"`
	Price             *float64 `json:"price"`
	Currency          *string  `json:"currency"`
	CommissionRate    *float64 `json:"commission_rate"`
	Activity          *string  `json:"activity"`
	Status            *string  `json:"status"`
	OwnerMemberID     *string  `json:"owner_member_id"`
}

// AffiliatePickRequest is the create/PATCH body for a 选品 (product × creator).
//
// `agency_share_rate` and `service_fee_amount` are the agency-side economics
// (726): the first is our cut of an internal creator's commission, the second is
// the 招商服务费 we invoice for placing an external one. Both are optional and
// nullable — an external creator with no fee has neither, and "absent" must not
// turn into 0.
type AffiliatePickRequest struct {
	ProductID        *string  `json:"product_id"`
	CreatorID        *string  `json:"creator_id"`
	CommissionRate   *float64 `json:"commission_rate"`
	AgencyShareRate  *float64 `json:"agency_share_rate"`
	ServiceFeeAmount *float64 `json:"service_fee_amount"`
	BoundAt          *string  `json:"bound_at"`
	Status           *string  `json:"status"`
	Note             *string  `json:"note"`
	OwnerMemberID    *string  `json:"owner_member_id"`
}

// AffiliateDailyRequest is the body of `PUT /api/workbench/affiliate/daily`: one
// pick, one day, the whole reported day. PUT replaces the row, so a measure the
// body omits is stored as 0 — "the report said nothing sold" — which is why the
// update path in the SQL overwrites every measure instead of merging.
type AffiliateDailyRequest struct {
	PickID            *string  `json:"pick_id"`
	StatDate          *string  `json:"stat_date"`
	GMVAmount         *float64 `json:"gmv_amount"`
	OrderCount        *int32   `json:"order_count"`
	RefundAmount      *float64 `json:"refund_amount"`
	EstCommission     *float64 `json:"est_commission"`
	SettledCommission *float64 `json:"settled_commission"`
	Currency          *string  `json:"currency"`
	OwnerMemberID     *string  `json:"owner_member_id"`
}

// AffiliateSettlementRequest is the create/PATCH body for a 平台结算单.
//
// `settled_to` says whose pocket the commission reached (727): `agency` is money
// we receive, `creator` is money the platform paid directly to the creator. It
// defaults to `agency`, the only case the ledger could express before 727.
type AffiliateSettlementRequest struct {
	PeriodStart     *string  `json:"period_start"`
	PeriodEnd       *string  `json:"period_end"`
	GrossCommission *float64 `json:"gross_commission"`
	TechServiceFee  *float64 `json:"tech_service_fee"`
	RefundDeduction *float64 `json:"refund_deduction"`
	NetAmount       *float64 `json:"net_amount"`
	Currency        *string  `json:"currency"`
	Status          *string  `json:"status"`
	SettledTo       *string  `json:"settled_to"`
	PaidAt          *string  `json:"paid_at"`
	ExternalNo      *string  `json:"external_no"`
	Note            *string  `json:"note"`
}

// ---- responses -------------------------------------------------------------

type AffiliateProductResponse struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	// Null for an own-brand SKU: we list it ourselves, so there is no seller.
	ClientID          *string  `json:"client_id"`
	Ownership         string   `json:"ownership"`
	Platform          string   `json:"platform"`
	PlatformProductID string   `json:"platform_product_id"`
	Title             string   `json:"title"`
	Category          *string  `json:"category"`
	Price             *float64 `json:"price"`
	Currency          string   `json:"currency"`
	CommissionRate    *float64 `json:"commission_rate"`
	Activity          *string  `json:"activity"`
	Status            string   `json:"status"`
	OwnerMemberID     *string  `json:"owner_member_id"`
	CreatedBy         *string  `json:"created_by"`
	CreatedAt         string   `json:"created_at"`
	UpdatedAt         string   `json:"updated_at"`
}

func affiliateProductToResponse(p db.AffiliateProduct) AffiliateProductResponse {
	return AffiliateProductResponse{
		ID:                uuidToString(p.ID),
		WorkspaceID:       uuidToString(p.WorkspaceID),
		ClientID:          uuidToPtr(p.ClientID),
		Ownership:         p.Ownership,
		Platform:          p.Platform,
		PlatformProductID: p.PlatformProductID,
		Title:             p.Title,
		Category:          textToPtr(p.Category),
		Price:             numericToFloatPtr(p.Price),
		Currency:          p.Currency,
		CommissionRate:    numericToFloatPtr(p.CommissionRate),
		Activity:          textToPtr(p.Activity),
		Status:            p.Status,
		OwnerMemberID:     uuidToPtr(p.OwnerMemberID),
		CreatedBy:         uuidToPtr(p.CreatedBy),
		CreatedAt:         timestampToString(p.CreatedAt),
		UpdatedAt:         timestampToString(p.UpdatedAt),
	}
}

type AffiliatePickResponse struct {
	ID               string   `json:"id"`
	WorkspaceID      string   `json:"workspace_id"`
	ProductID        string   `json:"product_id"`
	CreatorID        string   `json:"creator_id"`
	CommissionRate   *float64 `json:"commission_rate"`
	AgencyShareRate  *float64 `json:"agency_share_rate"`
	ServiceFeeAmount *float64 `json:"service_fee_amount"`
	BoundAt          string   `json:"bound_at"`
	Status           string   `json:"status"`
	Note             *string  `json:"note"`
	OwnerMemberID    *string  `json:"owner_member_id"`
	CreatedBy        *string  `json:"created_by"`
	CreatedAt        string   `json:"created_at"`
	UpdatedAt        string   `json:"updated_at"`
}

func affiliatePickToResponse(p db.AffiliatePick) AffiliatePickResponse {
	return AffiliatePickResponse{
		ID:               uuidToString(p.ID),
		WorkspaceID:      uuidToString(p.WorkspaceID),
		ProductID:        uuidToString(p.ProductID),
		CreatorID:        uuidToString(p.CreatorID),
		CommissionRate:   numericToFloatPtr(p.CommissionRate),
		AgencyShareRate:  numericToFloatPtr(p.AgencyShareRate),
		ServiceFeeAmount: numericToFloatPtr(p.ServiceFeeAmount),
		BoundAt:          timestampToString(p.BoundAt),
		Status:           p.Status,
		Note:             textToPtr(p.Note),
		OwnerMemberID:    uuidToPtr(p.OwnerMemberID),
		CreatedBy:        uuidToPtr(p.CreatedBy),
		CreatedAt:        timestampToString(p.CreatedAt),
		UpdatedAt:        timestampToString(p.UpdatedAt),
	}
}

type AffiliateDailyResponse struct {
	ID                string  `json:"id"`
	WorkspaceID       string  `json:"workspace_id"`
	PickID            string  `json:"pick_id"`
	StatDate          string  `json:"stat_date"`
	GMVAmount         float64 `json:"gmv_amount"`
	OrderCount        int32   `json:"order_count"`
	RefundAmount      float64 `json:"refund_amount"`
	EstCommission     float64 `json:"est_commission"`
	SettledCommission float64 `json:"settled_commission"`
	Currency          string  `json:"currency"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

func affiliateDailyToResponse(d db.AffiliateDaily) AffiliateDailyResponse {
	return AffiliateDailyResponse{
		ID:                uuidToString(d.ID),
		WorkspaceID:       uuidToString(d.WorkspaceID),
		PickID:            uuidToString(d.PickID),
		StatDate:          dateToString(d.StatDate),
		GMVAmount:         numericToFloat(d.GmvAmount),
		OrderCount:        d.OrderCount,
		RefundAmount:      numericToFloat(d.RefundAmount),
		EstCommission:     numericToFloat(d.EstCommission),
		SettledCommission: numericToFloat(d.SettledCommission),
		Currency:          d.Currency,
		CreatedAt:         timestampToString(d.CreatedAt),
		UpdatedAt:         timestampToString(d.UpdatedAt),
	}
}

type AffiliateSettlementResponse struct {
	ID              string  `json:"id"`
	WorkspaceID     string  `json:"workspace_id"`
	PeriodStart     string  `json:"period_start"`
	PeriodEnd       string  `json:"period_end"`
	GrossCommission float64 `json:"gross_commission"`
	TechServiceFee  float64 `json:"tech_service_fee"`
	RefundDeduction float64 `json:"refund_deduction"`
	NetAmount       float64 `json:"net_amount"`
	Currency        string  `json:"currency"`
	Status          string  `json:"status"`
	SettledTo       string  `json:"settled_to"`
	PaidAt          *string `json:"paid_at"`
	ExternalNo      *string `json:"external_no"`
	Note            *string `json:"note"`
	CreatedBy       *string `json:"created_by"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

func affiliateSettlementToResponse(s db.AffiliateSettlement) AffiliateSettlementResponse {
	return AffiliateSettlementResponse{
		ID:              uuidToString(s.ID),
		WorkspaceID:     uuidToString(s.WorkspaceID),
		PeriodStart:     dateToString(s.PeriodStart),
		PeriodEnd:       dateToString(s.PeriodEnd),
		GrossCommission: numericToFloat(s.GrossCommission),
		TechServiceFee:  numericToFloat(s.TechServiceFee),
		RefundDeduction: numericToFloat(s.RefundDeduction),
		NetAmount:       numericToFloat(s.NetAmount),
		Currency:        s.Currency,
		Status:          s.Status,
		SettledTo:       s.SettledTo,
		PaidAt:          dateToPtr(s.PaidAt),
		ExternalNo:      textToPtr(s.ExternalNo),
		Note:            textToPtr(s.Note),
		CreatedBy:       uuidToPtr(s.CreatedBy),
		CreatedAt:       timestampToString(s.CreatedAt),
		UpdatedAt:       timestampToString(s.UpdatedAt),
	}
}

// AffiliateSummaryWindow names the month the figures describe. The label comes
// from the SQL's own month bounds, so the label and the numbers can never
// disagree about which month they are.
type AffiliateSummaryWindow struct {
	Month string `json:"month"`
}

// AffiliateSummaryResponse is `GET /api/workbench/affiliate/summary`.
//
// Every entry is the contract's three-state block (`{value, sample_count,
// empty}`), including the two counts, so the client renders a gap on this strip
// the same way it does on `/overview` (docs/METRICS.md §1 rule 3). `refund_rate`
// travels at the 0–1 storage scale (C3); the client multiplies by 100.
//
// The income side is split three ways because one total would double-count the
// business (725–727):
//
//   - `gmv` is every pick's GMV, whatever pocket the commission ended in;
//   - `commission_agency` is the settled commission that reached our 机构号 plus
//     the 招商服务费 we invoiced — the money this month actually earned us;
//   - `commission_creator` is the settled commission the platform paid straight
//     to creators — GMV, not income;
//   - `agency_share_income` is our cut of the internal creators' cleared
//     commission (`settled_commission × agency_share_rate`).
type AffiliateSummaryResponse struct {
	Window             AffiliateSummaryWindow `json:"window"`
	GMV                WorkbenchMetricValue   `json:"gmv"`
	CommissionEst      WorkbenchMetricValue   `json:"commission_est"`
	CommissionSettled  WorkbenchMetricValue   `json:"commission_settled"`
	CommissionAgency   WorkbenchMetricValue   `json:"commission_agency"`
	CommissionCreator  WorkbenchMetricValue   `json:"commission_creator"`
	AgencyShareIncome  WorkbenchMetricValue   `json:"agency_share_income"`
	RefundRate         WorkbenchMetricValue   `json:"refund_rate"`
	TechFee            WorkbenchMetricValue   `json:"tech_fee"`
	PickCount          WorkbenchMetricValue   `json:"pick_count"`
	ActiveCreatorCount WorkbenchMetricValue   `json:"active_creator_count"`
}

// ---- value helpers ---------------------------------------------------------

// affiliateRate validates a 0–1 ratio (docs/METRICS.md §3 C3: stored 0–1,
// displayed ×100). 60 means 6000 %, so it is rejected rather than rescaled.
func affiliateRate(w http.ResponseWriter, raw *float64, fieldName string) (pgtype.Numeric, bool) {
	if raw == nil {
		return pgtype.Numeric{}, true
	}
	if *raw < 0 || *raw > 1 {
		writeError(w, http.StatusBadRequest, fieldName+" must be between 0 and 1")
		return pgtype.Numeric{}, false
	}
	return floatToNumeric(raw), true
}

// affiliateAmount validates one optional money field. Negative money is a typo,
// not a credit note, so it is refused before the constraint sees it.
func affiliateAmount(w http.ResponseWriter, raw *float64, fieldName string) (pgtype.Numeric, bool) {
	if raw == nil {
		return pgtype.Numeric{}, true
	}
	if *raw < 0 {
		writeError(w, http.StatusBadRequest, fieldName+" must not be negative")
		return pgtype.Numeric{}, false
	}
	return floatToNumeric(raw), true
}

// numericOrZero is the NOT NULL columns' default: an absent measure on a daily
// fact or a settlement means the report said zero, and the column cannot hold
// "unknown" anyway.
func numericOrZero(raw *float64) pgtype.Numeric {
	zero := 0.0
	if raw == nil {
		return floatToNumeric(&zero)
	}
	return floatToNumeric(raw)
}

// int4OrZero is the same default for `order_count`, whose column is NOT NULL.
func int4OrZero(raw *int32) int32 {
	if raw == nil {
		return 0
	}
	return *raw
}

// affiliatePlatform normalises a platform key. The column is free text (the
// affiliate programme covers douyin / kuaishou / others), but it is the first
// half of the product identity, so case and padding must not create a second
// identity for the same platform.
func affiliatePlatform(raw *string) string {
	return strings.ToLower(strings.TrimSpace(valueOrEmpty(raw)))
}

// affiliateOwnership normalises a product's ownership (725). An absent field is
// `client_brand`, which is what every product created before 725 was — reading
// a silent body as "own brand" would turn the whole existing ledger into our own
// revenue.
func affiliateOwnership(w http.ResponseWriter, raw *string) (string, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return "client_brand", true
	}
	ownership := strings.TrimSpace(*raw)
	if !affiliateProductOwnerships[ownership] {
		writeError(w, http.StatusBadRequest, "ownership must be own_brand or client_brand")
		return "", false
	}
	return ownership, true
}

// affiliateOwnershipClient checks the (ownership, client_id) pair the database
// also enforces (725 `affiliate_product_ownership_client_check`).
//
// Both layers exist for different reasons: the constraint is the guarantee — no
// write path, import script or future handler can leave the pair inconsistent —
// and this is the answer a caller can act on, naming the field that has to
// change. It returns the uuid to store, which is the invalid (NULL) one for an
// own-brand product.
func affiliateOwnershipClient(w http.ResponseWriter, ownership string, clientID pgtype.UUID) (pgtype.UUID, bool) {
	if ownership == "own_brand" {
		if clientID.Valid {
			writeError(w, http.StatusBadRequest, "client_id must be empty when ownership is own_brand")
			return pgtype.UUID{}, false
		}
		return pgtype.UUID{}, true
	}
	if !clientID.Valid {
		writeError(w, http.StatusBadRequest, "client_id is required when ownership is client_brand")
		return pgtype.UUID{}, false
	}
	return clientID, true
}

// affiliateSettledTo normalises a statement's recipient (727). An absent field
// is `agency`: every statement before 727 was one whose commission reached the
// agency account, and defaulting to `creator` would drop it out of our revenue.
func affiliateSettledTo(w http.ResponseWriter, raw *string) (string, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return "agency", true
	}
	settledTo := strings.TrimSpace(*raw)
	if !affiliateSettlementRecipients[settledTo] {
		writeError(w, http.StatusBadRequest, "settled_to must be agency or creator")
		return "", false
	}
	return settledTo, true
}

// ---- products --------------------------------------------------------------

// ListAffiliateProducts — GET /api/workbench/affiliate/products
func (h *Handler) ListAffiliateProducts(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	clientID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("client_id"))), "client_id")
	if !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !affiliateProductStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	platform := affiliatePlatform(stringPtr(r.URL.Query().Get("platform")))
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetAffiliateProduct(r.Context(), db.GetAffiliateProductParams{
			ID:          id,
			WorkspaceID: scope.WorkspaceUUID,
		})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListAffiliateProducts(r.Context(), db.ListAffiliateProductsParams{
		WorkspaceID: scope.WorkspaceUUID,
		ClientID:    clientID,
		Status:      strToText(status),
		Platform:    strToText(platform),
		CursorAt:    cursorAt,
		CursorID:    cursorID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list affiliate products", err)
		return
	}
	resp := make([]AffiliateProductResponse, len(rows))
	for i, row := range rows {
		resp[i] = affiliateProductToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"products": resp, "total": len(resp)})
}

// affiliateClientRef resolves a client pointer inside the workspace. No foreign
// key sits behind it, so a product that names a client of another workspace would
// be stored as an orphan unless it is checked here.
func (h *Handler) affiliateClientRef(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (pgtype.UUID, bool) {
	clientID, ok := workbenchOptionalUUID(w, raw, "client_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	if !clientID.Valid {
		writeError(w, http.StatusBadRequest, "client_id is required to name a seller")
		return pgtype.UUID{}, false
	}
	if _, err := h.Queries.GetCrmClient(r.Context(), db.GetCrmClientParams{
		ID:          clientID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "client_id is not a client in this workspace")
		return pgtype.UUID{}, false
	}
	return clientID, true
}

// affiliateProductRef resolves a required product pointer inside the workspace.
func (h *Handler) affiliateProductRef(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (db.AffiliateProduct, bool) {
	productID, ok := workbenchOptionalUUID(w, raw, "product_id")
	if !ok {
		return db.AffiliateProduct{}, false
	}
	if !productID.Valid {
		writeError(w, http.StatusBadRequest, "product_id is required")
		return db.AffiliateProduct{}, false
	}
	product, err := h.Queries.GetAffiliateProduct(r.Context(), db.GetAffiliateProductParams{
		ID:          productID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "product_id is not a product in this workspace")
		return db.AffiliateProduct{}, false
	}
	return product, true
}

// CreateAffiliateProduct — POST /api/workbench/affiliate/products
func (h *Handler) CreateAffiliateProduct(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req AffiliateProductRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	ownership, ok := affiliateOwnership(w, req.Ownership)
	if !ok {
		return
	}
	clientID := pgtype.UUID{}
	if req.ClientID != nil && strings.TrimSpace(*req.ClientID) != "" {
		clientID, ok = h.affiliateClientRef(w, r, scope, req.ClientID)
		if !ok {
			return
		}
	}
	clientID, ok = affiliateOwnershipClient(w, ownership, clientID)
	if !ok {
		return
	}
	platform := affiliatePlatform(req.Platform)
	platformProductID := strings.TrimSpace(valueOrEmpty(req.PlatformProductID))
	title := strings.TrimSpace(valueOrEmpty(req.Title))
	if platform == "" || platformProductID == "" || title == "" {
		writeError(w, http.StatusBadRequest, "platform, platform_product_id and title are required")
		return
	}
	status := "on_shelf"
	if req.Status != nil && strings.TrimSpace(*req.Status) != "" {
		status = strings.TrimSpace(*req.Status)
	}
	if !affiliateProductStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	currency, ok := workbenchCurrency(w, req.Currency)
	if !ok {
		return
	}
	price, ok := affiliateAmount(w, req.Price, "price")
	if !ok {
		return
	}
	rate, ok := affiliateRate(w, req.CommissionRate, "commission_rate")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}

	product, err := h.Queries.CreateAffiliateProduct(r.Context(), db.CreateAffiliateProductParams{WorkspaceID: scope.WorkspaceUUID,
		ClientID:          clientID,
		Ownership:         ownership,
		Platform:          platform,
		PlatformProductID: platformProductID,
		Title:             title,
		Category:          optionalTrimmedText(req.Category),
		Price:             price,
		Currency:          currency,
		CommissionRate:    rate,
		Activity:          optionalTrimmedText(req.Activity),
		Status:            status,
		OwnerMemberID:     owner,
		CreatedBy:         scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this platform product is already in the ledger")
			return
		}
		workbenchInternalError(w, r, "failed to create affiliate product", err)
		return
	}
	writeJSON(w, http.StatusCreated, affiliateProductToResponse(product))
}

// loadAffiliateProductForWrite resolves {productId} and checks the write gate.
func (h *Handler) loadAffiliateProductForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.AffiliateProduct, bool) {
	productID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "productId"), "product id")
	if !ok {
		return db.AffiliateProduct{}, false
	}
	product, err := h.Queries.GetAffiliateProduct(r.Context(), db.GetAffiliateProductParams{
		ID:          productID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "product not found")
		return db.AffiliateProduct{}, false
	}
	if !workbenchCanWrite(scope.Member, product.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change products you own")
		return db.AffiliateProduct{}, false
	}
	return product, true
}

// GetAffiliateProduct — GET /api/workbench/affiliate/products/{productId}
func (h *Handler) GetAffiliateProduct(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	productID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "productId"), "product id")
	if !ok {
		return
	}
	product, err := h.Queries.GetAffiliateProduct(r.Context(), db.GetAffiliateProductParams{
		ID:          productID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}
	writeJSON(w, http.StatusOK, affiliateProductToResponse(product))
}

// UpdateAffiliateProduct — PATCH /api/workbench/affiliate/products/{productId}
func (h *Handler) UpdateAffiliateProduct(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadAffiliateProductForWrite(w, r, scope)
	if !ok {
		return
	}
	var req AffiliateProductRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	// The seller and the ownership are one decision (725), so they are merged
	// before the pair is checked: a PATCH may move a product between the two
	// halves in a single body (`ownership: own_brand` + `client_id: ""`), and a
	// per-field check would refuse a legal transition.
	ownership := current.Ownership
	if req.Ownership != nil {
		parsed, ok := affiliateOwnership(w, req.Ownership)
		if !ok {
			return
		}
		ownership = parsed
	}
	clientID := current.ClientID
	if req.ClientID != nil {
		if strings.TrimSpace(*req.ClientID) == "" {
			// An explicit empty string is how a PATCH drops the seller — the same
			// spelling that moves a product to `own_brand`. It is applied here and
			// checked against the ownership below, not rejected as a missing field.
			clientID = pgtype.UUID{}
		} else {
			parsed, ok := h.affiliateClientRef(w, r, scope, req.ClientID)
			if !ok {
				return
			}
			clientID = parsed
		}
	}
	clientID, ok = affiliateOwnershipClient(w, ownership, clientID)
	if !ok {
		return
	}
	platform := current.Platform
	if req.Platform != nil {
		platform = affiliatePlatform(req.Platform)
		if platform == "" {
			writeError(w, http.StatusBadRequest, "platform is required")
			return
		}
	}
	platformProductID := current.PlatformProductID
	if req.PlatformProductID != nil {
		platformProductID = strings.TrimSpace(*req.PlatformProductID)
		if platformProductID == "" {
			writeError(w, http.StatusBadRequest, "platform_product_id is required")
			return
		}
	}
	title := current.Title
	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
		if title == "" {
			writeError(w, http.StatusBadRequest, "title is required")
			return
		}
	}
	status := current.Status
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
		if !affiliateProductStatuses[status] {
			writeError(w, http.StatusBadRequest, "invalid status")
			return
		}
	}
	currency := current.Currency
	if req.Currency != nil {
		parsed, ok := workbenchCurrency(w, req.Currency)
		if !ok {
			return
		}
		currency = parsed
	}
	// The amounts are validated here and applied by `applyNumericPatch` below, so
	// a PATCH that omits one keeps the stored value instead of writing a zero.
	if _, ok := affiliateAmount(w, req.Price, "price"); !ok {
		return
	}
	if _, ok := affiliateRate(w, req.CommissionRate, "commission_rate"); !ok {
		return
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateAffiliateProduct(r.Context(), db.UpdateAffiliateProductParams{
		ID:                current.ID,
		WorkspaceID:       scope.WorkspaceUUID,
		ClientID:          clientID,
		Ownership:         ownership,
		Platform:          platform,
		PlatformProductID: platformProductID,
		Title:             title,
		Category:          applyTextPatch(req.Category, current.Category),
		Price:             applyNumericPatch(req.Price, current.Price),
		Currency:          currency,
		CommissionRate:    applyNumericPatch(req.CommissionRate, current.CommissionRate),
		Activity:          applyTextPatch(req.Activity, current.Activity),
		Status:            status,
		OwnerMemberID:     owner,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this platform product is already in the ledger")
			return
		}
		workbenchInternalError(w, r, "failed to update affiliate product", err)
		return
	}
	writeJSON(w, http.StatusOK, affiliateProductToResponse(updated))
}

// DeleteAffiliateProduct — DELETE /api/workbench/affiliate/products/{productId}
//
// Soft delete. The picks and daily facts that named the product keep their rows:
// they are history, and the affected-rows count of a teardown is not a reason to
// make a month's GMV disappear.
func (h *Handler) DeleteAffiliateProduct(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadAffiliateProductForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveAffiliateProduct(r.Context(), db.ArchiveAffiliateProductParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete affiliate product", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- picks -----------------------------------------------------------------

// ListAffiliatePicks — GET /api/workbench/affiliate/picks
func (h *Handler) ListAffiliatePicks(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	productID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("product_id"))), "product_id")
	if !ok {
		return
	}
	creatorID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("creator_id"))), "creator_id")
	if !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !affiliatePickStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetAffiliatePick(r.Context(), db.GetAffiliatePickParams{
			ID:          id,
			WorkspaceID: scope.WorkspaceUUID,
		})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListAffiliatePicks(r.Context(), db.ListAffiliatePicksParams{
		WorkspaceID: scope.WorkspaceUUID,
		ProductID:   productID,
		CreatorID:   creatorID,
		Status:      strToText(status),
		CursorAt:    cursorAt,
		CursorID:    cursorID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list affiliate picks", err)
		return
	}
	resp := make([]AffiliatePickResponse, len(rows))
	for i, row := range rows {
		resp[i] = affiliatePickToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"picks": resp, "total": len(resp)})
}

// CreateAffiliatePick — POST /api/workbench/affiliate/picks
//
// A member may only bind a product it owns (the same rule that stops a member
// posting for someone else's creator): the pick is the row a member would later
// be allowed to edit, so letting it be created against a row it cannot write
// would produce a pick nobody below owner/admin could maintain.
func (h *Handler) CreateAffiliatePick(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req AffiliatePickRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	product, ok := h.affiliateProductRef(w, r, scope, req.ProductID)
	if !ok {
		return
	}
	if !workbenchCanWrite(scope.Member, product.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only pick products you own")
		return
	}
	creator, ok := h.requireCreatorInWorkspace(r.Context(), w, scope.WorkspaceID, req.CreatorID)
	if !ok {
		return
	}
	status := "active"
	if req.Status != nil && strings.TrimSpace(*req.Status) != "" {
		status = strings.TrimSpace(*req.Status)
	}
	if !affiliatePickStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	boundAt := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	if req.BoundAt != nil && strings.TrimSpace(*req.BoundAt) != "" {
		parsed, ok := workbenchTimestampValue(w, req.BoundAt, "bound_at")
		if !ok {
			return
		}
		boundAt = parsed
	}
	rate, ok := affiliateRate(w, req.CommissionRate, "commission_rate")
	if !ok {
		return
	}
	// 726: our cut of an internal creator's commission, and the 招商服务费 we
	// invoice for an external one. Both are optional; absent stays NULL, so
	// "not an internal split" and "we waived the fee" stay distinguishable.
	shareRate, ok := affiliateRate(w, req.AgencyShareRate, "agency_share_rate")
	if !ok {
		return
	}
	serviceFee, ok := affiliateAmount(w, req.ServiceFeeAmount, "service_fee_amount")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}

	pick, err := h.Queries.CreateAffiliatePick(r.Context(), db.CreateAffiliatePickParams{
		WorkspaceID:      scope.WorkspaceUUID,
		ProductID:        product.ID,
		CreatorID:        creator.ID,
		CommissionRate:   rate,
		AgencyShareRate:  shareRate,
		ServiceFeeAmount: serviceFee,
		BoundAt:          boundAt,
		Status:           status,
		Note:             optionalTrimmedText(req.Note),
		OwnerMemberID:    owner,
		CreatedBy:        scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this creator is already promoting this product")
			return
		}
		workbenchInternalError(w, r, "failed to create affiliate pick", err)
		return
	}
	writeJSON(w, http.StatusCreated, affiliatePickToResponse(pick))
}

// loadAffiliatePickForWrite resolves {pickId} and checks the write gate against
// the pick's own owner.
func (h *Handler) loadAffiliatePickForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.AffiliatePick, bool) {
	pickID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "pickId"), "pick id")
	if !ok {
		return db.AffiliatePick{}, false
	}
	pick, err := h.Queries.GetAffiliatePick(r.Context(), db.GetAffiliatePickParams{
		ID:          pickID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "pick not found")
		return db.AffiliatePick{}, false
	}
	if !workbenchCanWrite(scope.Member, pick.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change picks you own")
		return db.AffiliatePick{}, false
	}
	return pick, true
}

// GetAffiliatePick — GET /api/workbench/affiliate/picks/{pickId}
func (h *Handler) GetAffiliatePick(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	pickID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "pickId"), "pick id")
	if !ok {
		return
	}
	pick, err := h.Queries.GetAffiliatePick(r.Context(), db.GetAffiliatePickParams{
		ID:          pickID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "pick not found")
		return
	}
	writeJSON(w, http.StatusOK, affiliatePickToResponse(pick))
}

// UpdateAffiliatePick — PATCH /api/workbench/affiliate/picks/{pickId}
func (h *Handler) UpdateAffiliatePick(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadAffiliatePickForWrite(w, r, scope)
	if !ok {
		return
	}
	var req AffiliatePickRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	productID := current.ProductID
	if req.ProductID != nil && strings.TrimSpace(*req.ProductID) != "" {
		product, ok := h.affiliateProductRef(w, r, scope, req.ProductID)
		if !ok {
			return
		}
		if !workbenchCanWrite(scope.Member, product.OwnerMemberID) {
			writeError(w, http.StatusForbidden, "you can only pick products you own")
			return
		}
		productID = product.ID
	}
	creatorID := current.CreatorID
	if req.CreatorID != nil && strings.TrimSpace(*req.CreatorID) != "" {
		creator, ok := h.requireCreatorInWorkspace(r.Context(), w, scope.WorkspaceID, req.CreatorID)
		if !ok {
			return
		}
		creatorID = creator.ID
	}
	status := current.Status
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
		if !affiliatePickStatuses[status] {
			writeError(w, http.StatusBadRequest, "invalid status")
			return
		}
	}
	boundAt := current.BoundAt
	if req.BoundAt != nil {
		parsed, ok := workbenchTimestampValue(w, req.BoundAt, "bound_at")
		if !ok {
			return
		}
		boundAt = parsed
	}
	if _, ok := affiliateRate(w, req.CommissionRate, "commission_rate"); !ok {
		return
	}
	if _, ok := affiliateRate(w, req.AgencyShareRate, "agency_share_rate"); !ok {
		return
	}
	if _, ok := affiliateAmount(w, req.ServiceFeeAmount, "service_fee_amount"); !ok {
		return
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateAffiliatePick(r.Context(), db.UpdateAffiliatePickParams{
		ID:               current.ID,
		WorkspaceID:      scope.WorkspaceUUID,
		ProductID:        productID,
		CreatorID:        creatorID,
		CommissionRate:   applyNumericPatch(req.CommissionRate, current.CommissionRate),
		AgencyShareRate:  applyNumericPatch(req.AgencyShareRate, current.AgencyShareRate),
		ServiceFeeAmount: applyNumericPatch(req.ServiceFeeAmount, current.ServiceFeeAmount),
		BoundAt:          boundAt,
		Status:           status,
		Note:             applyTextPatch(req.Note, current.Note),
		OwnerMemberID:    owner,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this creator is already promoting this product")
			return
		}
		workbenchInternalError(w, r, "failed to update affiliate pick", err)
		return
	}
	writeJSON(w, http.StatusOK, affiliatePickToResponse(updated))
}

// DeleteAffiliatePick — DELETE /api/workbench/affiliate/picks/{pickId}
//
// Soft delete. The daily facts under it stay: ending a plan does not un-earn what
// it already sold, and the summary keeps summing those days.
func (h *Handler) DeleteAffiliatePick(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadAffiliatePickForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveAffiliatePick(r.Context(), db.ArchiveAffiliatePickParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete affiliate pick", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "pick not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- daily facts -----------------------------------------------------------

// ListAffiliateDaily — GET /api/workbench/affiliate/daily
func (h *Handler) ListAffiliateDaily(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	pickID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("pick_id"))), "pick_id")
	if !ok {
		return
	}
	statFrom, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("from"))), "from")
	if !ok {
		return
	}
	statTo, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("to"))), "to")
	if !ok {
		return
	}
	rows, err := h.Queries.ListAffiliateDaily(r.Context(), db.ListAffiliateDailyParams{
		WorkspaceID: scope.WorkspaceUUID,
		PickID:      pickID,
		StatFrom:    statFrom,
		StatTo:      statTo,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list affiliate daily facts", err)
		return
	}
	resp := make([]AffiliateDailyResponse, len(rows))
	for i, row := range rows {
		resp[i] = affiliateDailyToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"daily": resp, "total": len(resp)})
}

// UpsertAffiliateDaily — PUT /api/workbench/affiliate/daily
//
// One row per (pick, day): the body replaces that day, so a corrected report
// overwrites the previous value instead of merging into it. The write gate reads
// the pick's owner — a daily fact has no owner column of its own, and giving it
// one would let a row's owner disagree with the plan it belongs to.
func (h *Handler) UpsertAffiliateDaily(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req AffiliateDailyRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	pickID, ok := workbenchOptionalUUID(w, req.PickID, "pick_id")
	if !ok {
		return
	}
	if !pickID.Valid {
		writeError(w, http.StatusBadRequest, "pick_id is required")
		return
	}
	pick, err := h.Queries.GetAffiliatePick(r.Context(), db.GetAffiliatePickParams{
		ID:          pickID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "pick_id is not a pick in this workspace")
		return
	}
	if !workbenchCanWrite(scope.Member, pick.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only write daily facts of picks you own")
		return
	}
	if req.StatDate == nil || strings.TrimSpace(*req.StatDate) == "" {
		writeError(w, http.StatusBadRequest, "stat_date is required")
		return
	}
	statDate, ok := workbenchDateValue(w, req.StatDate, "stat_date")
	if !ok {
		return
	}
	currency, ok := workbenchCurrency(w, req.Currency)
	if !ok {
		return
	}
	if _, ok := affiliateAmount(w, req.GMVAmount, "gmv_amount"); !ok {
		return
	}
	if _, ok := affiliateAmount(w, req.RefundAmount, "refund_amount"); !ok {
		return
	}
	if _, ok := affiliateAmount(w, req.EstCommission, "est_commission"); !ok {
		return
	}
	if _, ok := affiliateAmount(w, req.SettledCommission, "settled_commission"); !ok {
		return
	}
	if req.OrderCount != nil && *req.OrderCount < 0 {
		writeError(w, http.StatusBadRequest, "order_count must not be negative")
		return
	}

	daily, err := h.Queries.UpsertAffiliateDaily(r.Context(), db.UpsertAffiliateDailyParams{
		WorkspaceID:       scope.WorkspaceUUID,
		PickID:            pick.ID,
		StatDate:          statDate,
		GmvAmount:         numericOrZero(req.GMVAmount),
		OrderCount:        int4OrZero(req.OrderCount),
		RefundAmount:      numericOrZero(req.RefundAmount),
		EstCommission:     numericOrZero(req.EstCommission),
		SettledCommission: numericOrZero(req.SettledCommission),
		Currency:          currency,
		CreatedBy:         scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to save affiliate daily fact", err)
		return
	}
	writeJSON(w, http.StatusCreated, affiliateDailyToResponse(daily))
}

// ---- settlements -----------------------------------------------------------

// ListAffiliateSettlements — GET /api/workbench/affiliate/settlements
func (h *Handler) ListAffiliateSettlements(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !affiliateSettlementStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	periodFrom, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("from"))), "from")
	if !ok {
		return
	}
	periodTo, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("to"))), "to")
	if !ok {
		return
	}
	rows, err := h.Queries.ListAffiliateSettlements(r.Context(), db.ListAffiliateSettlementsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Status:      strToText(status),
		PeriodFrom:  periodFrom,
		PeriodTo:    periodTo,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list affiliate settlements", err)
		return
	}
	resp := make([]AffiliateSettlementResponse, len(rows))
	for i, row := range rows {
		resp[i] = affiliateSettlementToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"settlements": resp, "total": len(resp)})
}

// affiliateSettlementWriteAllowed gates the settlement writes. A statement covers
// the whole workspace's picks for a period, so it has no owner a member could hold
// it by; the gate is the role, the same way the monthly finance entry is gated.
func affiliateSettlementWriteAllowed(member db.Member) bool {
	return roleAllowed(member.Role, "owner", "admin")
}

// CreateAffiliateSettlement — POST /api/workbench/affiliate/settlements
//
// `net_amount` is required even though it equals gross − fee − refund: it is the
// platform's number, and a server that derived it would be asserting an
// arithmetic the statement may not have followed. A row that cannot name its net
// is not a settlement.
func (h *Handler) CreateAffiliateSettlement(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !affiliateSettlementWriteAllowed(scope.Member) {
		writeError(w, http.StatusForbidden, "only workspace owners and admins can record settlement statements")
		return
	}
	var req AffiliateSettlementRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	if req.PeriodStart == nil || strings.TrimSpace(*req.PeriodStart) == "" {
		writeError(w, http.StatusBadRequest, "period_start is required")
		return
	}
	if req.PeriodEnd == nil || strings.TrimSpace(*req.PeriodEnd) == "" {
		writeError(w, http.StatusBadRequest, "period_end is required")
		return
	}
	periodStart, ok := workbenchDateValue(w, req.PeriodStart, "period_start")
	if !ok {
		return
	}
	periodEnd, ok := workbenchDateValue(w, req.PeriodEnd, "period_end")
	if !ok {
		return
	}
	if periodEnd.Time.Before(periodStart.Time) {
		writeError(w, http.StatusBadRequest, "period_end must not be before period_start")
		return
	}
	if req.NetAmount == nil {
		writeError(w, http.StatusBadRequest, "net_amount is required")
		return
	}
	if _, ok := affiliateAmount(w, req.GrossCommission, "gross_commission"); !ok {
		return
	}
	if _, ok := affiliateAmount(w, req.TechServiceFee, "tech_service_fee"); !ok {
		return
	}
	if _, ok := affiliateAmount(w, req.RefundDeduction, "refund_deduction"); !ok {
		return
	}
	if _, ok := affiliateAmount(w, req.NetAmount, "net_amount"); !ok {
		return
	}
	currency, ok := workbenchCurrency(w, req.Currency)
	if !ok {
		return
	}
	status := "pending"
	if req.Status != nil && strings.TrimSpace(*req.Status) != "" {
		status = strings.TrimSpace(*req.Status)
	}
	if !affiliateSettlementStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	// 727: whose pocket the commission reached. It decides whether the statement
	// counts as our revenue at all, so it is validated like a status rather than
	// passed through as free text.
	settledTo, ok := affiliateSettledTo(w, req.SettledTo)
	if !ok {
		return
	}
	paidAt, ok := workbenchDateValue(w, req.PaidAt, "paid_at")
	if !ok {
		return
	}

	settlement, err := h.Queries.CreateAffiliateSettlement(r.Context(), db.CreateAffiliateSettlementParams{
		WorkspaceID:     scope.WorkspaceUUID,
		PeriodStart:     periodStart,
		PeriodEnd:       periodEnd,
		GrossCommission: numericOrZero(req.GrossCommission),
		TechServiceFee:  numericOrZero(req.TechServiceFee),
		RefundDeduction: numericOrZero(req.RefundDeduction),
		NetAmount:       numericOrZero(req.NetAmount),
		Currency:        currency,
		Status:          status,
		SettledTo:       settledTo,
		PaidAt:          paidAt,
		ExternalNo:      optionalTrimmedText(req.ExternalNo),
		Note:            optionalTrimmedText(req.Note),
		CreatedBy:       scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create affiliate settlement", err)
		return
	}
	writeJSON(w, http.StatusCreated, affiliateSettlementToResponse(settlement))
}

// UpdateAffiliateSettlement — PATCH /api/workbench/affiliate/settlements/{settlementId}
//
// There is no DELETE: a settlement is a platform fact, and a wrong statement is
// corrected (status, amounts, note) rather than removed. `net_amount` is written
// as sent and never recomputed from the three components.
func (h *Handler) UpdateAffiliateSettlement(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !affiliateSettlementWriteAllowed(scope.Member) {
		writeError(w, http.StatusForbidden, "only workspace owners and admins can change settlement statements")
		return
	}
	settlementID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "settlementId"), "settlement id")
	if !ok {
		return
	}
	current, err := h.Queries.GetAffiliateSettlement(r.Context(), db.GetAffiliateSettlementParams{
		ID:          settlementID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "settlement not found")
		return
	}
	var req AffiliateSettlementRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	periodStart, ok := applyDatePatch(req.PeriodStart, w, "period_start", current.PeriodStart)
	if !ok {
		return
	}
	periodEnd, ok := applyDatePatch(req.PeriodEnd, w, "period_end", current.PeriodEnd)
	if !ok {
		return
	}
	if !periodStart.Valid || !periodEnd.Valid {
		writeError(w, http.StatusBadRequest, "period_start and period_end are required")
		return
	}
	if periodEnd.Time.Before(periodStart.Time) {
		writeError(w, http.StatusBadRequest, "period_end must not be before period_start")
		return
	}
	if _, ok := affiliateAmount(w, req.GrossCommission, "gross_commission"); !ok {
		return
	}
	if _, ok := affiliateAmount(w, req.TechServiceFee, "tech_service_fee"); !ok {
		return
	}
	if _, ok := affiliateAmount(w, req.RefundDeduction, "refund_deduction"); !ok {
		return
	}
	if _, ok := affiliateAmount(w, req.NetAmount, "net_amount"); !ok {
		return
	}
	currency := current.Currency
	if req.Currency != nil {
		parsed, ok := workbenchCurrency(w, req.Currency)
		if !ok {
			return
		}
		currency = parsed
	}
	status := current.Status
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
		if !affiliateSettlementStatuses[status] {
			writeError(w, http.StatusBadRequest, "invalid status")
			return
		}
	}
	settledTo := current.SettledTo
	if req.SettledTo != nil {
		parsed, ok := affiliateSettledTo(w, req.SettledTo)
		if !ok {
			return
		}
		settledTo = parsed
	}
	paidAt, ok := applyDatePatch(req.PaidAt, w, "paid_at", current.PaidAt)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateAffiliateSettlement(r.Context(), db.UpdateAffiliateSettlementParams{
		ID:              current.ID,
		WorkspaceID:     scope.WorkspaceUUID,
		PeriodStart:     periodStart,
		PeriodEnd:       periodEnd,
		GrossCommission: applyNumericPatch(req.GrossCommission, current.GrossCommission),
		TechServiceFee:  applyNumericPatch(req.TechServiceFee, current.TechServiceFee),
		RefundDeduction: applyNumericPatch(req.RefundDeduction, current.RefundDeduction),
		NetAmount:       applyNumericPatch(req.NetAmount, current.NetAmount),
		Currency:        currency,
		Status:          status,
		SettledTo:       settledTo,
		PaidAt:          paidAt,
		ExternalNo:      applyTextPatch(req.ExternalNo, current.ExternalNo),
		Note:            applyTextPatch(req.Note, current.Note),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update affiliate settlement", err)
		return
	}
	writeJSON(w, http.StatusOK, affiliateSettlementToResponse(updated))
}

// ---- summary ---------------------------------------------------------------

// GetAffiliateSummary — GET /api/workbench/affiliate/summary?month=YYYY-MM&department_id=
//
// Every block is the contract's three-state entry. The two counts answer a true
// zero from an empty month; the money blocks answer `insufficient_data`, because
// "no report was imported" and "the report said nothing sold" are different
// statements and only the second one is a zero.
func (h *Handler) GetAffiliateSummary(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	department, ok := workbenchDepartmentFilter(w, r)
	if !ok {
		return
	}
	month, ok := workbenchMonthValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("month"))), "month", true)
	if !ok {
		return
	}

	figure, err := h.Queries.AffiliateSummary(r.Context(), db.AffiliateSummaryParams{
		WorkspaceID:  scope.WorkspaceUUID,
		MonthStart:   month,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load the affiliate summary", err)
		return
	}

	// The refund rate is the one division in this domain; it goes through
	// `ratioValue` so the 0–1 scale is applied in exactly one place. Its sample
	// count is the number of days that actually sold something, which is the
	// denominator the ratio used.
	refundRate, refundOK := ratioValue(figure.RefundAmount, figure.GmvAmount)

	writeJSON(w, http.StatusOK, AffiliateSummaryResponse{
		Window:            AffiliateSummaryWindow{Month: figure.MonthLabel},
		GMV:               metricValue(figure.GmvAmount, figure.DailySamples > 0, figure.DailySamples, metricEmptyInsufficientData),
		CommissionEst:     metricValue(figure.EstCommission, figure.DailySamples > 0, figure.DailySamples, metricEmptyInsufficientData),
		CommissionSettled: metricValue(figure.SettledCommission, figure.SettledSamples > 0, figure.SettledSamples, metricEmptyInsufficientData),
		// The income side (725–727). `commission_agency` is the only block that
		// counts as money we received; its samples cover both halves it sums —
		// agency statements and picks invoicing a 招商服务费 — because either one
		// alone can be the month's whole answer.
		CommissionAgency:   metricValue(figure.CommissionAgency, figure.CommissionAgencySamples > 0, figure.CommissionAgencySamples, metricEmptyInsufficientData),
		CommissionCreator:  metricValue(figure.CommissionCreator, figure.CommissionCreatorSamples > 0, figure.CommissionCreatorSamples, metricEmptyInsufficientData),
		AgencyShareIncome:  metricValue(figure.AgencyShareIncome, figure.AgencyShareSamples > 0, figure.AgencyShareSamples, metricEmptyInsufficientData),
		RefundRate:         metricValue(refundRate, refundOK, figure.GmvSamples, metricEmptyInsufficientData),
		TechFee:            metricValue(figure.TechServiceFee, figure.SettlementSamples > 0, figure.SettlementSamples, metricEmptyInsufficientData),
		PickCount:          metricValue(float64(figure.PickCount), true, figure.PickCount, metricEmptyZero),
		ActiveCreatorCount: metricValue(float64(figure.ActiveCreatorCount), true, figure.ActiveCreatorCount, metricEmptyZero),
	})
}

// workbenchProductRef resolves an optional alliance product id for a post's
// attribution. Nullable by design: a brand spot or a plain post advertises no
// product, and forcing one would make the field a lie.
func (h *Handler) workbenchProductRef(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (pgtype.UUID, bool) {
	id, ok := workbenchOptionalUUID(w, raw, "product_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	if !id.Valid {
		return pgtype.UUID{}, true
	}
	if _, err := h.Queries.GetAffiliateProduct(r.Context(), db.GetAffiliateProductParams{
		ID:          id,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "product_id is not an alliance product in this workspace")
		return pgtype.UUID{}, false
	}
	return id, true
}

// workbenchPickRef resolves an optional pick id the same way.
func (h *Handler) workbenchPickRef(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (pgtype.UUID, bool) {
	id, ok := workbenchOptionalUUID(w, raw, "pick_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	if !id.Valid {
		return pgtype.UUID{}, true
	}
	if _, err := h.Queries.GetAffiliatePick(r.Context(), db.GetAffiliatePickParams{
		ID:          id,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "pick_id is not a pick in this workspace")
		return pgtype.UUID{}, false
	}
	return id, true
}
