package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/util"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// 千川投放的只读接口（WORKBENCH-API §25）。
//
// 六条端点，全部只读：写入口只有 `cmd/qianchuan-sync`（§25.5），本文件里没有
// 一条 INSERT / UPDATE / DELETE，也没有可以变成写入口的开关。
//
// SQL 在 `server/pkg/db/queries/qianchuan.sql`（sqlc 生成），本文件只做参数校验、
// 形状拼装和三态。查询里的 `AdsWindowTotals` 用一条 `CASE` 只挑一个结算窗口列，
// 所以「跨窗口求和」在 SQL 与 Go 两层都写不出来；Go 这侧的同一份映射是
// `adsSettleExpression`，两侧由 `TestAdsEachBasisReadsOneWindow` 对齐。
//
// # 结算口径不许相加
//
// `settle_1h | settle_7d | settle_14d | settle_30d | settle_90d` 是**五个不同的
// 结算窗口**，不是五个精度的同一个数。平台在 T+1 之后会陆续改写已结算口径，把
// 1h 和 7d 加在一起得到的既不是 1h 也不是 7d，而是一个没有任何业务含义的数。
//
// 所以：
//
//   - 每个金额都必须带 `basis`，`summary` 没有 `basis` 时默认 `settle_7d`（§25.2）；
//   - 一条 SQL 只表达**一个** basis —— `adsSettleExpression` 是唯一的映射，它由
//     五个常量组成，任何输入只能选中其中之一，所以「两个窗口相加」在本层就写不
//     出来，而不是靠调用方自觉；
//   - 没有「总花费」「总成交」这种跨窗口字段，也没有一条端点返回两个 basis。
//
// # 三态
//
// 金额是 `{amount, currency, sample_count, empty}`：没有行可加时 `amount: null` +
// `empty: "insufficient_data"`，不是 0 元。计数器是 `{value, sample_count, empty}`。
// 窗口自身还有一层 `empty`：窗口内一条事实都没有时，页面画空态而不是一排 0。
//
// # 单位
//
// 报表里的花费/成交/退款/结算额是**元**（`NUMERIC(14,2)`，平台原样）。余额是**分**
// （平台 `AccountBalanceGet` 的口径），本文件不做换算，`unit` 字段把它说出来。

// 五个结算窗口。常量而不是字符串拼接：见 adsSettleExpression。
const (
	adsBasis1h  = "settle_1h"
	adsBasis7d  = "settle_7d"
	adsBasis14d = "settle_14d"
	adsBasis30d = "settle_30d"
	adsBasis90d = "settle_90d"
)

// adsBasisDefault 是 §25.2 的默认展示口径。
const adsBasisDefault = adsBasis7d

// adsSettleExpression 把 basis 翻成一个**列表达式**：这就是「一个 basis = 一个窗口」
// 的契约本身，也是 `AdsWindowTotals` 里那条 `CASE` 的评审依据。
//
// 只有这五条常量能出去：1h / 7d 是结构化列（sync 把它们从 CSV 拍进 `settle_amount_*`），
// 14d / 30d / 90d 留在 `metrics` 里（官方列名原样）。任何其它输入在调用点就被
// `adsParseBasis` 拒掉，这个函数拿不到它们，因此**不存在**「把两个窗口拼进一条
// SUM」的写法。
//
// sqlc 不能把列名当下发参数，所以 SQL 侧用一条 `CASE`（分支与这里一一对应）挑列；
// 两侧是否还一致由 `TestAdsEachBasisReadsOneWindow` 用真行比对，改了一边而忘了
// 另一边会先红。
func adsSettleExpression(basis string) (string, bool) {
	switch basis {
	case adsBasis1h:
		return "settle_amount_1h", true
	case adsBasis7d:
		return "settle_amount_7d", true
	case adsBasis14d:
		return "(metrics->>'total_order_settle_amount_for_roi2_14d')::numeric", true
	case adsBasis30d:
		return "(metrics->>'total_order_settle_amount_for_roi2_30d')::numeric", true
	case adsBasis90d:
		return "(metrics->>'total_order_settle_amount_for_roi2_90d')::numeric", true
	default:
		return "", false
	}
}

// adsParseBasis 读 `?basis=`：空 = 默认 7d，其它值必须是五个之一，否则 400。
//
// 400 而不是「猜一个」：一个拼错的 basis 静默变成 7d，会让两份报表看起来一致却
// 真的不一致。
func adsParseBasis(w http.ResponseWriter, raw string) (string, bool) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return adsBasisDefault, true
	}
	if _, ok := adsSettleExpression(value); !ok {
		writeError(w, http.StatusBadRequest,
			"invalid basis: expected settle_1h, settle_7d, settle_14d, settle_30d or settle_90d")
		return "", false
	}
	return value, true
}

// --- response shapes --------------------------------------------------------

// adsMoney 与驾驶舱的 BdPipelineMoney 同形（§20.3），多一个 `currency` 之外的
// `unit`：报表金额是元，余额是分，读方不该靠字段名猜。
type adsMoney struct {
	Amount      *float64 `json:"amount"`
	Currency    string   `json:"currency"`
	SampleCount int64    `json:"sample_count"`
	Empty       string   `json:"empty"`
}

// adsNumber 是三态计数器：`value` 永远是数字，`empty` 只有 zero /
// insufficient_data 两态。比率（如 ROI）用 `*float64` 表达「算不出来」。
type adsNumber struct {
	Value       *float64 `json:"value"`
	SampleCount int64    `json:"sample_count"`
	Empty       string   `json:"empty"`
}

// adsTotals 是一个窗口的五组数字。**没有跨 basis 的字段**：`settle` 里的数字
// 只属于响应顶层的 `basis`。
type adsTotals struct {
	Spend  adsMoney  `json:"spend"`
	GMV    adsMoney  `json:"gmv"`
	Refund adsMoney  `json:"refund"`
	Settle adsMoney  `json:"settle"`
	Orders adsNumber `json:"orders"`
}

type adsSummaryResponse struct {
	// From / To 是实际使用的闭区间，服务端回显；页面据此标注，不自己重算。
	From string `json:"from"`
	To   string `json:"to"`
	// Basis 是这次汇总用的结算窗口。同一份数据换 basis 是另一个数，不是另一个精度。
	Basis    string `json:"basis"`
	Currency string `json:"currency"`
	// Empty 是窗口自身的状态：窗口内一条事实都没有 → insufficient_data。
	Empty string `json:"empty"`
	// Totals 与 Previous 是同一组字段：Previous 是紧邻在 from 之前的等长窗口。
	// 环比只能同 basis 相比 —— 两个字段都在同一个响应里，因为它们共享 basis。
	Totals   adsTotals `json:"totals"`
	Previous adsTotals `json:"previous"`
	// BasisOptions 把可选的五个窗口原样列出来，页面不需要内置一份常量。
	BasisOptions []string `json:"basis_options"`
}

type adsAccountResponse struct {
	AccountID   string   `json:"account_id"`
	AccountName string   `json:"account_name"`
	Currency    string   `json:"currency"`
	// 余额相关字段的单位是**分**（平台口径），见 unit。
	Unit        string   `json:"unit"`
	Balance     *float64 `json:"balance"`
	Cash        *float64 `json:"cash"`
	ValidGrant  *float64 `json:"valid_grant"`
	CapturedAt  *string  `json:"captured_at"`
	SpendToDate *float64 `json:"spend_to_date"`
}

type adsAccountListResponse struct {
	Accounts []adsAccountResponse `json:"accounts"`
	Total    int                  `json:"total"`
}

type adsPlanResponse struct {
	PlanID        string   `json:"plan_id"`
	AccountID     string   `json:"account_id"`
	AccountName   string   `json:"account_name"`
	Name          string   `json:"name"`
	MarketingGoal *string  `json:"marketing_goal"`
	Status        *string  `json:"status"`
	OptStatus     *string  `json:"opt_status"`
	Budget        *float64 `json:"budget"`
	BudgetMode    *string  `json:"budget_mode"`
	ROI2Goal      *float64 `json:"roi2_goal"`
	SmartBidType  *string  `json:"smart_bid_type"`
	UpdatedAt     string   `json:"updated_at"`
}

type adsPlanListResponse struct {
	Plans []adsPlanResponse `json:"plans"`
	Total int               `json:"total"`
}

type adsMaterialResponse struct {
	Kind          string   `json:"kind"`
	MaterialID    string   `json:"material_id"`
	AccountID     string   `json:"account_id"`
	AccountName   string   `json:"account_name"`
	Filename      *string  `json:"filename"`
	VideoID       *string  `json:"video_id"`
	ImageID       *string  `json:"image_id"`
	Duration      *int32   `json:"duration"`
	SizeBytes     *int64   `json:"size_bytes"`
	IsAICreate    *bool    `json:"is_ai_create"`
	IsInefficient *bool    `json:"is_inefficient"`
	IsOriginal    *bool    `json:"is_original"`
	MediaScriptID *string  `json:"media_script_id"`
	CapturedAt    string   `json:"captured_at"`
}

type adsMaterialListResponse struct {
	Materials []adsMaterialResponse `json:"materials"`
	Total     int                   `json:"total"`
}

type adsViolationResponse struct {
	EventID      string  `json:"event_id"`
	AccountID    string  `json:"account_id"`
	AccountName  string  `json:"account_name"`
	AdID         *string `json:"ad_id"`
	CreateTime   *string `json:"create_time"`
	IllegalType  *string `json:"illegal_type"`
	Score        *int32  `json:"score"`
	Status       *string `json:"status"`
	RejectReason *string `json:"reject_reason"`
}

type adsViolationListResponse struct {
	Violations []adsViolationResponse `json:"violations"`
	Total      int                    `json:"total"`
}

// adsReconResponse 是「账面 vs 平台」一行：平台侧来自快照，台账侧由日报现算。
//
// 两侧覆盖的**不是同一段时间**：快照是拉取那一刻的账户累计，台账是快照当天的
// 日报合计。差额因此是「这一天的日报和平台累计差多少」，不是资产层面的应收应付；
// `basis` 字段说明台账侧用的是哪个结算窗口（平台 `acct_*` 是支付口径，不是结算
// 口径，所以这里不给 basis —— 给了会暗示两边可以相减）。
type adsReconResponse struct {
	AccountID   string   `json:"account_id"`
	Goal        string   `json:"goal"`
	AccountName string   `json:"account_name"`
	Currency    string   `json:"currency"`
	Platform    adsTotals `json:"platform"`
	Ledger      adsTotals `json:"ledger"`
	// Diff 是 platform − ledger，正数=平台多。
	DiffCost   *float64 `json:"diff_cost"`
	DiffGMV    *float64 `json:"diff_gmv"`
	DiffOrders *float64 `json:"diff_orders"`
	CapturedAt *string  `json:"captured_at"`
}

type adsReconListResponse struct {
	Recon []adsReconResponse `json:"recon"`
	Total int                `json:"total"`
}

// --- helpers ----------------------------------------------------------------

const adsCurrency = "CNY"

// adsMoneyOf 把「和 + 有值的行数」翻成三态金额。0 行可加 → null +
// insufficient_data，绝不是 0 元。
func adsMoneyOf(sum *float64, samples int64) adsMoney {
	if sum == nil || samples == 0 {
		return adsMoney{Amount: nil, Currency: adsCurrency, SampleCount: 0, Empty: "insufficient_data"}
	}
	return adsMoney{Amount: sum, Currency: adsCurrency, SampleCount: samples, Empty: "zero"}
}

// adsCountOf 把计数器翻成三态：计数没有「算不出来」，0 就是 0。
func adsCountOf(value int64) adsNumber {
	number := float64(value)
	return adsNumber{Value: &number, SampleCount: value, Empty: "zero"}
}

// adsWindowState 是窗口自身的状态：一条事实都没有 → insufficient_data。
func adsWindowState(rows int64) string {
	if rows == 0 {
		return "insufficient_data"
	}
	return "zero"
}

func adsTimestampText(value pgtype.Timestamptz) *string {
	if !value.Valid {
		return nil
	}
	text := value.Time.UTC().Format(time.RFC3339)
	return &text
}

// adsDay 解析 `YYYY-MM-DD`（也接受 RFC 3339 取其日期），并给出闭区间。
func adsDayRange(w http.ResponseWriter, rawFrom, rawTo string) (pgtype.Date, pgtype.Date, bool) {
	to, ok := workbenchDateValue(w, optionalString(rawTo), "to")
	if !ok {
		return pgtype.Date{}, pgtype.Date{}, false
	}
	if !to.Valid {
		to = pgtypeDateToday()
	}
	from, ok := workbenchDateValue(w, optionalString(rawFrom), "from")
	if !ok {
		return pgtype.Date{}, pgtype.Date{}, false
	}
	if !from.Valid {
		// 默认窗口：to 所在自然月的 1 号。与 §22 的业绩窗口同一口径。
		from = pgtype.Date{Time: time.Date(to.Time.Year(), to.Time.Month(), 1, 0, 0, 0, 0, time.UTC), Valid: true}
	}
	if from.Time.After(to.Time) {
		writeError(w, http.StatusBadRequest, "invalid window: from is after to")
		return pgtype.Date{}, pgtype.Date{}, false
	}
	return from, to, true
}

// --- GET /api/workbench/ads/summary ---------------------------------------

// AdsSummary — GET /api/workbench/ads/summary?from=&to=&basis=
//
// One window, one basis, five figures, plus the window immediately before it for the
// 环比. The settle figure comes from exactly one CASE branch (adsSettleExpression
// names the same five branches), so this endpoint cannot answer a sum across
// settlement windows — there is no parameter and no field that would carry one.
func (h *Handler) AdsSummary(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capAdsRead) {
		return
	}
	query := r.URL.Query()
	basis, ok := adsParseBasis(w, query.Get("basis"))
	if !ok {
		return
	}
	from, to, ok := adsDayRange(w, query.Get("from"), query.Get("to"))
	if !ok {
		return
	}

	totals, rows, err := h.adsWindowTotals(r, scope.WorkspaceUUID, from, to, basis)
	if err != nil {
		workbenchInternalError(w, r, "failed to sum qianchuan window", err)
		return
	}
	previous, _, err := h.adsWindowTotals(r, scope.WorkspaceUUID, adsPreviousWindow(from, to), to, basis)
	if err != nil {
		workbenchInternalError(w, r, "failed to sum the previous qianchuan window", err)
		return
	}

	writeJSON(w, http.StatusOK, adsSummaryResponse{
		From:         dateToString(from),
		To:           dateToString(to),
		Basis:        basis,
		Currency:     adsCurrency,
		Empty:        adsWindowState(rows),
		Totals:       totals,
		Previous:     previous,
		BasisOptions: []string{adsBasis1h, adsBasis7d, adsBasis14d, adsBasis30d, adsBasis90d},
	})
}

// adsPreviousWindow 返回与 [from, to] 等长的前一个窗口（含首尾）。
func adsPreviousWindow(from, to pgtype.Date) pgtype.Date {
	days := int(to.Time.Sub(from.Time).Hours()/24) + 1
	return pgtype.Date{Time: from.Time.AddDate(0, 0, -days), Valid: true}
}

// adsWindowTotals 是 summary 的唯一一次读：一个窗口、一个 basis。
//
// 空值处理是这里的重点：`sum()` 在没有行时返回 NULL，`count(col)` 说这一格有
// 多少行真的带了数。两者一起才能区分「这窗口没有花费」和「这窗口根本没有行」。
// 只有 basis 这个已校验过的枚举会进 SQL；列名由查询里的 CASE 决定。
func (h *Handler) adsWindowTotals(
	r *http.Request,
	workspace pgtype.UUID,
	from, to pgtype.Date,
	basis string,
) (adsTotals, int64, error) {
	row, err := h.Queries.AdsWindowTotals(r.Context(), db.AdsWindowTotalsParams{
		WorkspaceID: workspace,
		FromDate:    from,
		ToDate:      to,
		Basis:       basis,
	})
	if err != nil {
		return adsTotals{}, 0, err
	}
	return adsTotals{
		Spend:  adsMoneyOf(numericToFloatPtr(row.SpendSum), row.SpendSamples),
		GMV:    adsMoneyOf(numericToFloatPtr(row.GmvSum), row.GmvSamples),
		Refund: adsMoneyOf(numericToFloatPtr(row.RefundSum), row.RefundSamples),
		Settle: adsMoneyOf(numericToFloatPtr(row.SettleSum), row.SettleSamples),
		Orders: adsCountOf(row.OrderCount),
	}, row.RowCount, nil
}

// --- GET /api/workbench/ads/accounts --------------------------------------

// AdsAccounts — GET /api/workbench/ads/accounts
//
// Every account with its newest balance snapshot and its spend to date. Balance is a
// snapshot, not a ledger, so the newest row is the answer and `captured_at` says how
// old it is.
func (h *Handler) AdsAccounts(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capAdsRead) {
		return
	}
	rows, err := h.Queries.AdsAccounts(r.Context(), scope.WorkspaceUUID)
	if err != nil {
		workbenchInternalError(w, r, "failed to list qianchuan accounts", err)
		return
	}

	resp := make([]adsAccountResponse, 0, len(rows))
	for _, row := range rows {
		resp = append(resp, adsAccountResponse{
			AccountID:   row.AccountID,
			AccountName: row.AccountName.String,
			Currency:    adsCurrency,
			Unit:        "fen",
			Balance:     numericToFloatPtr(row.Balance),
			Cash:        numericToFloatPtr(row.Cash),
			ValidGrant:  numericToFloatPtr(row.ValidGrant),
			CapturedAt:  adsTimestampText(row.CapturedAt),
			SpendToDate: numericToFloatPtr(row.SpendToDate),
		})
	}
	writeJSON(w, http.StatusOK, adsAccountListResponse{Accounts: resp, Total: len(resp)})
}

// --- GET /api/workbench/ads/plans -----------------------------------------

func (h *Handler) AdsPlans(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capAdsRead) {
		return
	}
	query := r.URL.Query()
	rows, err := h.Queries.AdsPlans(r.Context(), db.AdsPlansParams{
		WorkspaceID: scope.WorkspaceUUID,
		AccountID:   strings.TrimSpace(query.Get("account_id")),
		Status:      strings.TrimSpace(query.Get("status")),
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list qianchuan plans", err)
		return
	}

	resp := make([]adsPlanResponse, 0, len(rows))
	for _, row := range rows {
		item := adsPlanResponse{
			PlanID:        row.PlanID,
			AccountID:     row.AccountID,
			AccountName:   row.AccountName.String,
			Name:          row.Name.String,
			MarketingGoal: util.TextToPtr(row.MarketingGoal),
			Status:        util.TextToPtr(row.Status),
			OptStatus:     util.TextToPtr(row.OptStatus),
			Budget:        numericToFloatPtr(row.Budget),
			BudgetMode:    util.TextToPtr(row.BudgetMode),
			ROI2Goal:      numericToFloatPtr(row.Roi2Goal),
			SmartBidType:  util.TextToPtr(row.SmartBidType),
		}
		if text := adsTimestampText(row.UpdatedAt); text != nil {
			item.UpdatedAt = *text
		}
		resp = append(resp, item)
	}
	writeJSON(w, http.StatusOK, adsPlanListResponse{Plans: resp, Total: len(resp)})
}

// --- GET /api/workbench/ads/materials -------------------------------------

func (h *Handler) AdsMaterials(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capAdsRead) {
		return
	}
	query := r.URL.Query()
	kind, ok := bdEnum(w, optionalString(query.Get("type")),
		map[string]bool{"video": true, "image": true, "carousel": true}, "type")
	if !ok {
		return
	}
	rows, err := h.Queries.AdsMaterials(r.Context(), db.AdsMaterialsParams{
		WorkspaceID: scope.WorkspaceUUID,
		AccountID:   strings.TrimSpace(query.Get("account_id")),
		Kind:        kind,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list qianchuan materials", err)
		return
	}

	resp := make([]adsMaterialResponse, 0, len(rows))
	for _, row := range rows {
		item := adsMaterialResponse{
			Kind:          row.Kind,
			MaterialID:    row.MaterialID,
			AccountID:     row.AccountID.String,
			AccountName:   row.AccountName.String,
			Filename:      util.TextToPtr(row.Filename),
			VideoID:       util.TextToPtr(row.VideoID),
			ImageID:       util.TextToPtr(row.ImageID),
			Duration:      util.Int4ToPtr(row.Duration),
			SizeBytes:     util.Int8ToPtr(row.SizeBytes),
			IsAICreate:    util.BoolToPtr(row.IsAiCreate),
			IsInefficient: util.BoolToPtr(row.IsInefficient),
			IsOriginal:    util.BoolToPtr(row.IsOriginal),
			MediaScriptID: util.UUIDToPtr(row.MediaScriptID),
		}
		if text := adsTimestampText(row.CapturedAt); text != nil {
			item.CapturedAt = *text
		}
		resp = append(resp, item)
	}
	writeJSON(w, http.StatusOK, adsMaterialListResponse{Materials: resp, Total: len(resp)})
}

// --- GET /api/workbench/ads/violations ------------------------------------

func (h *Handler) AdsViolations(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capAdsRead) {
		return
	}
	query := r.URL.Query()
	rows, err := h.Queries.AdsViolations(r.Context(), db.AdsViolationsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Status:      strings.TrimSpace(query.Get("status")),
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list qianchuan violations", err)
		return
	}

	resp := make([]adsViolationResponse, 0, len(rows))
	for _, row := range rows {
		resp = append(resp, adsViolationResponse{
			EventID:      row.EventID,
			AccountID:    row.AccountID.String,
			AccountName:  row.AccountName.String,
			AdID:         util.TextToPtr(row.AdID),
			CreateTime:   adsTimestampText(row.CreateTime),
			IllegalType:  util.TextToPtr(row.IllegalType),
			Score:        util.Int4ToPtr(row.Score),
			Status:       util.TextToPtr(row.Status),
			RejectReason: util.TextToPtr(row.RejectReason),
		})
	}
	writeJSON(w, http.StatusOK, adsViolationListResponse{Violations: resp, Total: len(resp)})
}

// --- GET /api/workbench/ads/recon -----------------------------------------

// AdsRecon — GET /api/workbench/ads/recon?account_id=
//
// 账面 vs 平台：平台侧是最近一次对账快照，台账侧是**快照当天**的日报合计。
// 两侧刻意不做 basis 换算 —— 平台的 `acct_*` 是支付口径，日报的 settle 是结算口径，
// 把它们相减只会得到第三个窗口。
func (h *Handler) AdsRecon(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capAdsRead) {
		return
	}
	query := r.URL.Query()
	rows, err := h.Queries.AdsRecon(r.Context(), db.AdsReconParams{
		WorkspaceID: scope.WorkspaceUUID,
		AccountID:   strings.TrimSpace(query.Get("account_id")),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to read qianchuan recon", err)
		return
	}

	resp := make([]adsReconResponse, 0, len(rows))
	for _, row := range rows {
		item := adsReconResponse{
			AccountID:   row.AccountID,
			Goal:        row.Goal,
			AccountName: row.AccountName.String,
			Currency:    adsCurrency,
			CapturedAt:  adsTimestampText(row.CapturedAt),
		}
		platformCost := numericToFloatPtr(row.AcctCost)
		platformGMV := numericToFloatPtr(row.AcctGmv)
		ledgerCost := numericToFloatPtr(row.LedgerCost)
		ledgerGMV := numericToFloatPtr(row.LedgerGmv)
		// 平台侧的行数用 1（一行快照就是一份合计），台账侧用当日有花费的日报行数。
		item.Platform = adsTotals{
			Spend:  adsMoneyOf(platformCost, countOf(platformCost)),
			GMV:    adsMoneyOf(platformGMV, countOf(platformGMV)),
			Orders: adsCountOf(row.AcctOrders),
		}
		item.Ledger = adsTotals{
			Spend:  adsMoneyOf(ledgerCost, countOf(ledgerCost)),
			GMV:    adsMoneyOf(ledgerGMV, countOf(ledgerGMV)),
			Orders: adsCountOf(row.LedgerOrders),
		}
		item.DiffCost = adsDiff(platformCost, ledgerCost)
		item.DiffGMV = adsDiff(platformGMV, ledgerGMV)
		orders := float64(row.AcctOrders - row.LedgerOrders)
		item.DiffOrders = &orders
		resp = append(resp, item)
	}
	writeJSON(w, http.StatusOK, adsReconListResponse{Recon: resp, Total: len(resp)})
}

// countOf 是 adsMoneyOf 第二参数的来源：一个值存在就是 1 行样本。
func countOf(value *float64) int64 {
	if value == nil {
		return 0
	}
	return 1
}

// adsDiff 只在两侧都有数时给差额；一侧缺数时差额未知，不是 0。
func adsDiff(platform, ledger *float64) *float64 {
	if platform == nil || ledger == nil {
		return nil
	}
	diff := *platform - *ledger
	return &diff
}
