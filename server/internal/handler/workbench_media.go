package handler

// Content workbench: IP 鈫?topic 鈫?script 鈫?shoot, and the same chain read
// backwards from a published post (docs/engineering/WORKBENCH-API.md 搂12).
//
// Four tables and one link column, in pipeline order:
//
//	media_ip      a persona (浜鸿 / 璧涢亾 / 鍙椾紬 / 鍛ㄦ洿鐩爣)
//	media_topic   a candidate topic for one IP, with its five-dimension score card
//	media_script  one version of one topic's copy (hook / body / CTA / cover / tags)
//	media_shoot   one shooting run for one script (date, shot list, checklist)
//
// and `creator.media_ip_id` (729) plus `creator_post.media_script_id` (733), which
// attach the existing platform accounts and published posts to that chain.
//
// Ownership follows the chain: an IP is owned by `media_ip.owner_member_id`, a
// topic by its own column, and a script or a shoot by the *topic* it came
// through. Scripts and shoots still carry an `owner_member_id` 鈥?the ledgers
// filter and display it 鈥?but it is a copy of the topic's, written on insert and
// never used as the write gate: a reviewer reassigning a topic must not leave its
// scripts owned by someone else.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// Workbench event types for the content domain. Registered alongside the other
// workbench events (`workbench_types.go`) so the client can invalidate one
// domain prefix instead of guessing which list a write touched.
const (
	eventMediaIPChanged     = "media_ip:changed"
	eventMediaTopicChanged  = "media_topic:changed"
	eventMediaScriptChanged = "media_script:changed"
	eventMediaShootChanged  = "media_shoot:changed"
)

// Enum vocabularies. The database CHECK constraints are the authority; these
// lists exist so a bad value is a 400 with a readable message instead of a 500
// from the driver.
var (
	mediaIPStatuses     = []string{"active", "paused", "ended"}
	mediaTopicSources   = []string{"hot", "manual", "bench", "ai"}
	mediaTopicStatuses  = []string{"pool", "scripting", "shooting", "publishing", "done", "dropped"}
	mediaScriptStatuses = []string{"draft", "review", "approved", "archived"}
	mediaShootStatuses  = []string{"planned", "shooting", "editing", "done", "cancelled"}
)

// The defaults a create body falls back to, which are also the values the
// columns default to (728鈥?32).
const (
	mediaIPStatusActive     = "active"
	mediaTopicStatusPool    = "pool"
	mediaTopicSourceManual  = "manual"
	mediaScriptStatusDraft  = "draft"
	mediaShootStatusPlanned = "planned"
)

// mediaScoreDimensions is the five-dimension decision card, in display order.
// `scores` is stored as a JSON object keyed by these names (730).
var mediaScoreDimensions = []string{"pain", "save", "debate", "susp", "fit"}

// mediaScores is one topic's score card: every dimension present, 0鈥?00.
type mediaScores map[string]int32

func emptyMediaScores() mediaScores {
	scores := make(mediaScores, len(mediaScoreDimensions))
	for _, dimension := range mediaScoreDimensions {
		scores[dimension] = 0
	}
	return scores
}

// ---- requests --------------------------------------------------------------

// MediaIPRequest is both the create and the PATCH body.
type MediaIPRequest struct {
	Name          *string `json:"name"`
	Persona       *string `json:"persona"`
	Track         *string `json:"track"`
	Audience      *string `json:"audience"`
	Color         *string `json:"color"`
	WeekGoal      *int32  `json:"week_goal"`
	Status        *string `json:"status"`
	OwnerMemberID *string `json:"owner_member_id"`
}

// MediaAccountRequest attaches a platform account to an IP. The account itself is
// a `creator` row (660); this body only names it.
type MediaAccountRequest struct {
	CreatorID *string `json:"creator_id"`
}

// MediaTopicRequest is both the create and the PATCH body. `Scores` is raw so the
// handler can tell "not sent" (keep the stored card) from "sent" (merge the five
// dimensions) 鈥?a `map` cannot express that difference.
type MediaTopicRequest struct {
	IPID          *string         `json:"ip_id"`
	Title         *string         `json:"title"`
	Source        *string         `json:"source"`
	Scores        json.RawMessage `json:"scores"`
	Status        *string         `json:"status"`
	HotID         *string         `json:"hot_id"`
	Note          *string         `json:"note"`
	OwnerMemberID *string         `json:"owner_member_id"`
}

// MediaScriptRequest is both the create and the PATCH body. `Tags` is a pointer so
// an empty array means "clear the tags" rather than "not sent".
type MediaScriptRequest struct {
	TopicID       *string   `json:"topic_id"`
	IPID          *string   `json:"ip_id"`
	Hook          *string   `json:"hook"`
	Body          *string   `json:"body"`
	CTA           *string   `json:"cta"`
	CoverNote     *string   `json:"cover_note"`
	Tags          *[]string `json:"tags"`
	Status        *string   `json:"status"`
	PublishAt     *string   `json:"publish_at"`
	OwnerMemberID *string   `json:"owner_member_id"`
}

// MediaShootRequest is both the create and the PATCH body. `Shots` is raw because
// the column holds a `shotlist.v1` artifact (see mediaShotsValue); `Checklist` is
// merged over the stored tick state, so a PATCH that ticks one box cannot clear
// the rest.
type MediaShootRequest struct {
	ScriptID      *string         `json:"script_id"`
	ShootDate     *string         `json:"shoot_date"`
	Location      *string         `json:"location"`
	Shots         json.RawMessage `json:"shots"`
	Checklist     map[string]bool `json:"checklist"`
	Status        *string         `json:"status"`
	OwnerMemberID *string         `json:"owner_member_id"`
}

// ---- responses -------------------------------------------------------------

type MediaIPResponse struct {
	ID            string  `json:"id"`
	WorkspaceID   string  `json:"workspace_id"`
	Name          string  `json:"name"`
	Persona       *string `json:"persona"`
	Track         *string `json:"track"`
	Audience      *string `json:"audience"`
	Color         *string `json:"color"`
	WeekGoal      int32   `json:"week_goal"`
	Status        string  `json:"status"`
	OwnerMemberID *string `json:"owner_member_id"`
	CreatedBy     *string `json:"created_by"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
	ArchivedAt    *string `json:"archived_at"`
}

// MediaIPAccountResponse is one platform account under an IP. It is a projection
// of the `creator` row rather than the whole creator ledger: an IP detail screen
// needs the account's identity (which platform, which handle) and its reach, not
// the commercial columns.
type MediaIPAccountResponse struct {
	ID            string  `json:"id"`
	MediaIPID     string  `json:"media_ip_id"`
	Kind          string  `json:"kind"`
	DisplayName   string  `json:"display_name"`
	Platform      string  `json:"platform"`
	Handle        string  `json:"handle"`
	URL           *string `json:"url"`
	Fans          int64   `json:"fans"`
	AvgPlay       int64   `json:"avg_play"`
	OwnerMemberID *string `json:"owner_member_id"`
	CreatedAt     string  `json:"created_at"`
}

// MediaIPDetailResponse is `GET /ips/{id}`: the IP plus the accounts attached to
// it. The embedded struct flattens, so the JSON is the IP's own fields with
// `accounts` alongside them.
type MediaIPDetailResponse struct {
	MediaIPResponse
	Accounts []MediaIPAccountResponse `json:"accounts"`
}

type MediaTopicResponse struct {
	ID            string      `json:"id"`
	WorkspaceID   string      `json:"workspace_id"`
	IPID          string      `json:"ip_id"`
	Title         string      `json:"title"`
	Source        string      `json:"source"`
	Scores        mediaScores `json:"scores"`
	Status        string      `json:"status"`
	HotID         *string     `json:"hot_id"`
	Note          *string     `json:"note"`
	OwnerMemberID *string     `json:"owner_member_id"`
	CreatedBy     *string     `json:"created_by"`
	CreatedAt     string      `json:"created_at"`
	UpdatedAt     string      `json:"updated_at"`
	ArchivedAt    *string     `json:"archived_at"`
}

type MediaScriptResponse struct {
	ID            string   `json:"id"`
	WorkspaceID   string   `json:"workspace_id"`
	TopicID       string   `json:"topic_id"`
	IPID          *string  `json:"ip_id"`
	Version       int32    `json:"version"`
	Hook          *string  `json:"hook"`
	Body          *string  `json:"body"`
	CTA           *string  `json:"cta"`
	CoverNote     *string  `json:"cover_note"`
	Tags          []string `json:"tags"`
	Status        string   `json:"status"`
	PublishAt     *string  `json:"publish_at"`
	OwnerMemberID *string  `json:"owner_member_id"`
	CreatedBy     *string  `json:"created_by"`
	CreatedAt     string   `json:"created_at"`
	UpdatedAt     string   `json:"updated_at"`
	ArchivedAt    *string  `json:"archived_at"`
}

type MediaShootResponse struct {
	ID            string          `json:"id"`
	WorkspaceID   string          `json:"workspace_id"`
	ScriptID      string          `json:"script_id"`
	ShootDate     string          `json:"shoot_date"`
	Location      *string         `json:"location"`
	Shots         json.RawMessage `json:"shots"`
	Checklist     map[string]bool `json:"checklist"`
	Status        string          `json:"status"`
	OwnerMemberID *string         `json:"owner_member_id"`
	CreatedBy     *string         `json:"created_by"`
	CreatedAt     string          `json:"created_at"`
	UpdatedAt     string          `json:"updated_at"`
	ArchivedAt    *string         `json:"archived_at"`
}

func mediaIPToResponse(ip db.MediaIp) MediaIPResponse {
	return MediaIPResponse{
		ID:            uuidToString(ip.ID),
		WorkspaceID:   uuidToString(ip.WorkspaceID),
		Name:          ip.Name,
		Persona:       textToPtr(ip.Persona),
		Track:         textToPtr(ip.Track),
		Audience:      textToPtr(ip.Audience),
		Color:         textToPtr(ip.Color),
		WeekGoal:      ip.WeekGoal,
		Status:        ip.Status,
		OwnerMemberID: uuidToPtr(ip.OwnerMemberID),
		CreatedBy:     uuidToPtr(ip.CreatedBy),
		CreatedAt:     timestampToString(ip.CreatedAt),
		UpdatedAt:     timestampToString(ip.UpdatedAt),
		ArchivedAt:    timestampToPtr(ip.ArchivedAt),
	}
}

func mediaIPAccountToResponse(c db.Creator) MediaIPAccountResponse {
	return MediaIPAccountResponse{
		ID:            uuidToString(c.ID),
		MediaIPID:     uuidToString(c.MediaIpID),
		Kind:          c.Kind,
		DisplayName:   c.DisplayName,
		Platform:      c.Platform,
		Handle:        c.Handle,
		URL:           textToPtr(c.Url),
		Fans:          c.Fans,
		AvgPlay:       c.AvgPlay,
		OwnerMemberID: uuidToPtr(c.OwnerMemberID),
		CreatedAt:     timestampToString(c.CreatedAt),
	}
}

func mediaTopicToResponse(topic db.MediaTopic) MediaTopicResponse {
	return MediaTopicResponse{
		ID:            uuidToString(topic.ID),
		WorkspaceID:   uuidToString(topic.WorkspaceID),
		IPID:          uuidToString(topic.IpID),
		Title:         topic.Title,
		Source:        topic.Source,
		Scores:        mediaScoresFromJSON(topic.Scores),
		Status:        topic.Status,
		HotID:         uuidToPtr(topic.HotID),
		Note:          textToPtr(topic.Note),
		OwnerMemberID: uuidToPtr(topic.OwnerMemberID),
		CreatedBy:     uuidToPtr(topic.CreatedBy),
		CreatedAt:     timestampToString(topic.CreatedAt),
		UpdatedAt:     timestampToString(topic.UpdatedAt),
		ArchivedAt:    timestampToPtr(topic.ArchivedAt),
	}
}

func mediaScriptToResponse(script db.MediaScript) MediaScriptResponse {
	return MediaScriptResponse{
		ID:            uuidToString(script.ID),
		WorkspaceID:   uuidToString(script.WorkspaceID),
		TopicID:       uuidToString(script.TopicID),
		IPID:          uuidToPtr(script.IpID),
		Version:       script.Version,
		Hook:          textToPtr(script.Hook),
		Body:          textToPtr(script.Body),
		CTA:           textToPtr(script.Cta),
		CoverNote:     textToPtr(script.CoverNote),
		Tags:          append([]string{}, script.Tags...),
		Status:        script.Status,
		PublishAt:     timestampToPtr(script.PublishAt),
		OwnerMemberID: uuidToPtr(script.OwnerMemberID),
		CreatedBy:     uuidToPtr(script.CreatedBy),
		CreatedAt:     timestampToString(script.CreatedAt),
		UpdatedAt:     timestampToString(script.UpdatedAt),
		ArchivedAt:    timestampToPtr(script.ArchivedAt),
	}
}

func mediaShootToResponse(shoot db.MediaShoot) MediaShootResponse {
	return MediaShootResponse{
		ID:            uuidToString(shoot.ID),
		WorkspaceID:   uuidToString(shoot.WorkspaceID),
		ScriptID:      uuidToString(shoot.ScriptID),
		ShootDate:     dateToString(shoot.ShootDate),
		Location:      textToPtr(shoot.Location),
		Shots:         mediaRawJSON(shoot.Shots),
		Checklist:     mediaChecklistFromJSON(shoot.Checklist),
		Status:        shoot.Status,
		OwnerMemberID: uuidToPtr(shoot.OwnerMemberID),
		CreatedBy:     uuidToPtr(shoot.CreatedBy),
		CreatedAt:     timestampToString(shoot.CreatedAt),
		UpdatedAt:     timestampToString(shoot.UpdatedAt),
		ArchivedAt:    timestampToPtr(shoot.ArchivedAt),
	}
}

// ---- value helpers ---------------------------------------------------------

// mediaEnumInvalid reports whether value is outside allowed; the caller turns
// that into a 400 naming the field.
func mediaEnumInvalid(value string, allowed []string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return false
		}
	}
	return true
}

// mediaScoresFromJSON decodes a stored score card leniently: unknown keys are
// dropped and anything that is not an integer is read as 0. Stored rows are
// already validated on write, and a read must not fail over a value a future
// migration may have added.
func mediaScoresFromJSON(raw []byte) mediaScores {
	scores := emptyMediaScores()
	if len(raw) == 0 {
		return scores
	}
	var stored map[string]json.Number
	if err := json.Unmarshal(raw, &stored); err != nil {
		return scores
	}
	for _, dimension := range mediaScoreDimensions {
		value, ok := stored[dimension]
		if !ok {
			continue
		}
		parsed, err := value.Int64()
		if err != nil || parsed < 0 || parsed > 100 {
			continue
		}
		scores[dimension] = int32(parsed)
	}
	return scores
}

// mediaScoresValue turns a request's `scores` into the column value: the request
// merged over the stored card, so a PATCH that sends one dimension keeps the
// other four. A value outside 0鈥?00, a non-integer, or a key that is not one of
// the five dimensions is a 400 鈥?a score card with a dimension nobody reads is
// a typo, not a feature.
func mediaScoresValue(w http.ResponseWriter, raw json.RawMessage, current mediaScores) ([]byte, bool) {
	if len(bytes.TrimSpace(raw)) == 0 || string(bytes.TrimSpace(raw)) == "null" {
		return mediaScoresJSON(current)
	}
	var sent map[string]json.Number
	if err := json.Unmarshal(raw, &sent); err != nil {
		writeError(w, http.StatusBadRequest, "scores must be an object of five 0-100 integers")
		return nil, false
	}
	merged := make(mediaScores, len(current)+len(sent))
	for dimension, value := range current {
		merged[dimension] = value
	}
	for dimension, value := range sent {
		if mediaEnumInvalid(dimension, mediaScoreDimensions) {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("scores.%s is not a known dimension", dimension))
			return nil, false
		}
		parsed, err := value.Int64()
		if err != nil || parsed < 0 || parsed > 100 {
			writeError(w, http.StatusBadRequest,
				fmt.Sprintf("scores.%s must be an integer between 0 and 100", dimension))
			return nil, false
		}
		merged[dimension] = int32(parsed)
	}
	return mediaScoresJSON(merged)
}

func mediaScoresJSON(scores mediaScores) ([]byte, bool) {
	encoded, err := json.Marshal(scores)
	if err != nil {
		// Unreachable: the map only ever holds int32 values.
		return []byte("{}"), false
	}
	return encoded, true
}

// mediaRawJSON normalises a stored jsonb column for the wire: the empty object
// when the column is NULL, the stored bytes otherwise.
func mediaRawJSON(raw []byte) json.RawMessage {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return json.RawMessage("{}")
	}
	return json.RawMessage(trimmed)
}

func mediaChecklistFromJSON(raw []byte) map[string]bool {
	checklist := map[string]bool{}
	if len(raw) == 0 {
		return checklist
	}
	if err := json.Unmarshal(raw, &checklist); err != nil {
		return map[string]bool{}
	}
	if checklist == nil {
		return map[string]bool{}
	}
	return checklist
}

// mediaChecklistValue merges a request's checklist over the stored tick state.
// A key sent as false is kept (an unticked box is a state, not an absence); a key
// the request does not mention keeps whatever it had.
func mediaChecklistValue(sent map[string]bool, current []byte) ([]byte, bool) {
	merged := mediaChecklistFromJSON(current)
	for item, ticked := range sent {
		name := strings.TrimSpace(item)
		if name == "" {
			continue
		}
		merged[name] = ticked
	}
	encoded, err := json.Marshal(merged)
	if err != nil {
		return []byte("{}"), false
	}
	return encoded, true
}

// mediaShotListDoc mirrors `contracts/library/domains/video/shotlist.v1.json`
// (docs/engineering/LIBRARY.md 搂4). Field names, enums and required-ness are the
// contract's, not ours; the doc comment on each function below says which rule it
// enforces. `additionalProperties: false` is enforced by decoding with
// DisallowUnknownFields.
type mediaShotListDoc struct {
	SchemaVersion string           `json:"schema_version"`
	Title         string           `json:"title"`
	DurationMs    *int64           `json:"duration_ms"`
	AspectRatio   string           `json:"aspect_ratio"`
	Shots         *[]mediaShotItem `json:"shots"`
}

type mediaShotItem struct {
	Index         *int64   `json:"index"`
	StartMs       *int64   `json:"start_ms"`
	EndMs         *int64   `json:"end_ms"`
	ShotSize      *string  `json:"shot_size"`
	Scene         *string  `json:"scene"`
	Rhythm        *string  `json:"rhythm"`
	SellingPoints []string `json:"selling_points"`
	Text          *string  `json:"text"`
	ProductRef    *string  `json:"product_ref"`
}

var (
	mediaShotListAspectRatios = []string{"9:16", "16:9", "1:1"}
	mediaShotSizes            = []string{"close-up", "medium", "wide"}
	mediaShotScenes           = []string{"indoor", "outdoor", "shelf", "studio"}
	mediaShotRhythms          = []string{"fast-cut", "steady", "slow"}
	mediaShotSellingPoints    = []string{"price", "gift", "ingredient", "effect", "proof", "pain-point"}
)

// mediaShotsValue validates a `shots` payload against shotlist.v1 and returns the
// column value. The empty object `{}` is the one exception: it is the column's
// default and means "闀滃ご娓呭崟杩樻病鎺?, a state the contract does not describe
// (it requires at least one shot), so it must be storable without a document.
func mediaShotsValue(w http.ResponseWriter, raw json.RawMessage, current []byte) ([]byte, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return mediaRawJSON(current), true
	}
	if string(trimmed) == "{}" {
		return []byte("{}"), true
	}
	if message := mediaShotListViolation(trimmed); message != "" {
		writeError(w, http.StatusBadRequest, message)
		return nil, false
	}
	return trimmed, true
}

// mediaShotListViolation returns the first way the payload breaks shotlist.v1, or
// the empty string when it satisfies the schema. Only the constraints a caller
// can plausibly hit are spelled out individually; everything else (unknown keys,
// wrong JSON types) is the decode error.
func mediaShotListViolation(raw []byte) string {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var doc mediaShotListDoc
	if err := decoder.Decode(&doc); err != nil {
		return "shots does not match shotlist.v1: " + err.Error()
	}
	if doc.SchemaVersion != "shotlist.v1" {
		return `shots.schema_version must be "shotlist.v1"`
	}
	title := strings.TrimSpace(doc.Title)
	if title == "" || utf8.RuneCountInString(doc.Title) > 120 {
		return "shots.title must be 1-120 characters"
	}
	if doc.DurationMs == nil || *doc.DurationMs < 1000 || *doc.DurationMs > 600000 {
		return "shots.duration_ms must be between 1000 and 600000"
	}
	if mediaEnumInvalid(doc.AspectRatio, mediaShotListAspectRatios) {
		return "shots.aspect_ratio must be 9:16, 16:9 or 1:1"
	}
	if doc.Shots == nil || len(*doc.Shots) < 1 || len(*doc.Shots) > 200 {
		return "shots.shots must hold between 1 and 200 items"
	}
	for position, shot := range *doc.Shots {
		if message := mediaShotViolation(position, shot); message != "" {
			return message
		}
	}
	return ""
}

func mediaShotViolation(position int, shot mediaShotItem) string {
	where := fmt.Sprintf("shots.shots[%d]", position)
	if shot.Index == nil || *shot.Index < 0 {
		return where + ".index must be a non-negative integer"
	}
	if shot.StartMs == nil || *shot.StartMs < 0 {
		return where + ".start_ms must be a non-negative integer"
	}
	if shot.EndMs == nil || *shot.EndMs < 1 {
		return where + ".end_ms must be a positive integer"
	}
	if shot.ShotSize == nil || mediaEnumInvalid(*shot.ShotSize, mediaShotSizes) {
		return where + ".shot_size must be close-up, medium or wide"
	}
	if shot.Scene == nil || mediaEnumInvalid(*shot.Scene, mediaShotScenes) {
		return where + ".scene must be indoor, outdoor, shelf or studio"
	}
	if shot.Rhythm == nil || mediaEnumInvalid(*shot.Rhythm, mediaShotRhythms) {
		return where + ".rhythm must be fast-cut, steady or slow"
	}
	for _, point := range shot.SellingPoints {
		if mediaEnumInvalid(point, mediaShotSellingPoints) {
			return where + ".selling_points holds an unknown value: " + point
		}
	}
	if shot.Text != nil && utf8.RuneCountInString(*shot.Text) > 200 {
		return where + ".text must be at most 200 characters"
	}
	if shot.ProductRef != nil && utf8.RuneCountInString(*shot.ProductRef) > 80 {
		return where + ".product_ref must be at most 80 characters"
	}
	return ""
}

// mediaTagsValue normalises the hashtag line: trimmed, empty entries dropped,
// order kept (it is part of what the operator composed).
func mediaTagsValue(tags []string) []string {
	normalised := make([]string, 0, len(tags))
	for _, tag := range tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" {
			continue
		}
		normalised = append(normalised, trimmed)
	}
	return normalised
}

// mediaTagsPatch normalises a PATCH's tags, treating an omitted field as "keep
// the stored line" and an empty array as "clear it".
func mediaTagsPatch(patched *[]string, current []string) []string {
	if patched == nil {
		return append([]string{}, current...)
	}
	return mediaTagsValue(*patched)
}

// derefStringSlice reads an optional array field as a slice, with "absent" and
// "empty" both meaning no entries.
func derefStringSlice(value *[]string) []string {
	if value == nil {
		return nil
	}
	return *value
}

// mediaTextPatch is applyTextPatch for the content columns: same rule (absent
// keeps, empty clears), named separately because the "body" of a script is not a
// label and the intent is worth spelling out at each call site.
func mediaTextPatch(patched *string, current pgtype.Text) pgtype.Text {
	return applyTextPatch(patched, current)
}

// ---- loaders ---------------------------------------------------------------

func (h *Handler) loadMediaIPForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.MediaIp, bool) {
	ipID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "ipId"), "ip id")
	if !ok {
		return db.MediaIp{}, false
	}
	ip, err := h.Queries.GetMediaIP(r.Context(), db.GetMediaIPParams{ID: ipID, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "ip not found")
		return db.MediaIp{}, false
	}
	if !workbenchCanWrite(scope.Member, ip.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change IPs you own")
		return db.MediaIp{}, false
	}
	return ip, true
}

// requireMediaIP resolves an IP pointer sent in a body (a topic's `ip_id`) and
// returns it, which is also what decides the new row's owner.
func (h *Handler) requireMediaIP(ctx context.Context, w http.ResponseWriter, scope workbenchScope, raw *string, required bool) (db.MediaIp, bool) {
	ipID, ok := workbenchOptionalUUID(w, raw, "ip_id")
	if !ok {
		return db.MediaIp{}, false
	}
	if !ipID.Valid {
		if required {
			writeError(w, http.StatusBadRequest, "ip_id is required")
		}
		return db.MediaIp{}, !required
	}
	ip, err := h.Queries.GetMediaIP(ctx, db.GetMediaIPParams{ID: ipID, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusBadRequest, "ip_id is not a content IP in this workspace")
		return db.MediaIp{}, false
	}
	return ip, true
}

func (h *Handler) loadMediaTopicForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.MediaTopic, bool) {
	topicID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "topicId"), "topic id")
	if !ok {
		return db.MediaTopic{}, false
	}
	topic, err := h.Queries.GetMediaTopic(r.Context(), db.GetMediaTopicParams{ID: topicID, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "topic not found")
		return db.MediaTopic{}, false
	}
	if !workbenchCanWrite(scope.Member, topic.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change topics you own")
		return db.MediaTopic{}, false
	}
	return topic, true
}

// loadMediaScriptForWrite resolves a script and the topic it belongs to, and gates
// on the *topic's* owner 鈥?see the file comment for why a script's own
// `owner_member_id` is not the gate.
func (h *Handler) loadMediaScriptForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.MediaScript, db.MediaTopic, bool) {
	scriptID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "scriptId"), "script id")
	if !ok {
		return db.MediaScript{}, db.MediaTopic{}, false
	}
	script, err := h.Queries.GetMediaScript(r.Context(), db.GetMediaScriptParams{ID: scriptID, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "script not found")
		return db.MediaScript{}, db.MediaTopic{}, false
	}
	topic, err := h.Queries.GetMediaTopic(r.Context(), db.GetMediaTopicParams{
		ID: script.TopicID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		// The topic was deleted under the script: nobody can claim ownership of a
		// script whose chain is broken, so it is not writable either.
		writeError(w, http.StatusNotFound, "script not found")
		return db.MediaScript{}, db.MediaTopic{}, false
	}
	if !workbenchCanWrite(scope.Member, topic.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change scripts of topics you own")
		return db.MediaScript{}, db.MediaTopic{}, false
	}
	return script, topic, true
}

// loadMediaShootForWrite resolves a shoot plus its script and topic, and gates on
// the topic's owner: a shoot is the third link of the same chain.
func (h *Handler) loadMediaShootForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.MediaShoot, db.MediaScript, db.MediaTopic, bool) {
	shootID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "shootId"), "shoot id")
	if !ok {
		return db.MediaShoot{}, db.MediaScript{}, db.MediaTopic{}, false
	}
	shoot, err := h.Queries.GetMediaShoot(r.Context(), db.GetMediaShootParams{ID: shootID, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "shoot not found")
		return db.MediaShoot{}, db.MediaScript{}, db.MediaTopic{}, false
	}
	script, err := h.Queries.GetMediaScript(r.Context(), db.GetMediaScriptParams{
		ID: shoot.ScriptID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		// A shoot whose script is gone has no owner to walk: it is not writable.
		writeError(w, http.StatusNotFound, "shoot not found")
		return db.MediaShoot{}, db.MediaScript{}, db.MediaTopic{}, false
	}
	topic, err := h.Queries.GetMediaTopic(r.Context(), db.GetMediaTopicParams{
		ID: script.TopicID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "shoot not found")
		return db.MediaShoot{}, db.MediaScript{}, db.MediaTopic{}, false
	}
	if !workbenchCanWrite(scope.Member, topic.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change shoots of topics you own")
		return db.MediaShoot{}, db.MediaScript{}, db.MediaTopic{}, false
	}
	return shoot, script, topic, true
}

// requireMediaScriptChain loads a script by id and its topic, writing the
// response itself on failure. Used by the shoot paths, which never see the
// script in the URL.
func (h *Handler) requireMediaScriptChain(w http.ResponseWriter, r *http.Request, scope workbenchScope, scriptID pgtype.UUID) (db.MediaScript, db.MediaTopic, bool) {
	script, err := h.Queries.GetMediaScript(r.Context(), db.GetMediaScriptParams{
		ID: scriptID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "script_id is not a script in this workspace")
		return db.MediaScript{}, db.MediaTopic{}, false
	}
	topic, err := h.Queries.GetMediaTopic(r.Context(), db.GetMediaTopicParams{
		ID: script.TopicID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "script_id is not a script in this workspace")
		return db.MediaScript{}, db.MediaTopic{}, false
	}
	return script, topic, true
}

// ---- IPs -------------------------------------------------------------------

// ListMediaIPs 鈥?GET /api/workbench/media/ips
func (h *Handler) ListMediaIPs(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && mediaEnumInvalid(status, mediaIPStatuses) {
		writeError(w, http.StatusBadRequest, "status must be active, paused or ended")
		return
	}
	rows, err := h.Queries.ListMediaIPs(r.Context(), db.ListMediaIPsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Status:      strToText(status),
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list content IPs", err)
		return
	}
	resp := make([]MediaIPResponse, len(rows))
	for i, row := range rows {
		resp[i] = mediaIPToResponse(row)
	}
	// `total` is this page's row count, like every other workbench list; the
	// authoritative workspace-wide numbers do not exist for the content side yet.
	writeJSON(w, http.StatusOK, map[string]any{"ips": resp, "total": len(resp)})
}

// CreateMediaIP 鈥?POST /api/workbench/media/ips
func (h *Handler) CreateMediaIP(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req MediaIPRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	name := strings.TrimSpace(valueOrEmpty(req.Name))
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	status := mediaIPStatusActive
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
	}
	if mediaEnumInvalid(status, mediaIPStatuses) {
		writeError(w, http.StatusBadRequest, "status must be active, paused or ended")
		return
	}
	weekGoal := int32(0)
	if req.WeekGoal != nil {
		weekGoal = *req.WeekGoal
	}
	if weekGoal < 0 {
		writeError(w, http.StatusBadRequest, "week_goal must be zero or positive")
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}

	ip, err := h.Queries.CreateMediaIP(r.Context(), db.CreateMediaIPParams{
		WorkspaceID:   scope.WorkspaceUUID,
		Name:          name,
		Persona:       optionalTrimmedText(req.Persona),
		Track:         optionalTrimmedText(req.Track),
		Audience:      optionalTrimmedText(req.Audience),
		Color:         optionalTrimmedText(req.Color),
		WeekGoal:      weekGoal,
		Status:        status,
		OwnerMemberID: owner,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a content IP with this name already exists")
			return
		}
		workbenchInternalError(w, r, "failed to create content IP", err)
		return
	}

	h.publishMediaIPChanged(scope, uuidToString(ip.ID))
	writeJSON(w, http.StatusCreated, mediaIPToResponse(ip))
}

// GetMediaIP 鈥?GET /api/workbench/media/ips/{ipId}
func (h *Handler) GetMediaIP(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	ipID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "ipId"), "ip id")
	if !ok {
		return
	}
	ip, err := h.Queries.GetMediaIP(r.Context(), db.GetMediaIPParams{ID: ipID, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "ip not found")
		return
	}
	accounts, err := h.Queries.ListMediaIPAccounts(r.Context(), db.ListMediaIPAccountsParams{
		WorkspaceID: scope.WorkspaceUUID,
		MediaIpID:   ip.ID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list IP accounts", err)
		return
	}
	resp := MediaIPDetailResponse{
		MediaIPResponse: mediaIPToResponse(ip),
		Accounts:        make([]MediaIPAccountResponse, len(accounts)),
	}
	for i, account := range accounts {
		resp.Accounts[i] = mediaIPAccountToResponse(account)
	}
	writeJSON(w, http.StatusOK, resp)
}

// UpdateMediaIP 鈥?PATCH /api/workbench/media/ips/{ipId}
func (h *Handler) UpdateMediaIP(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadMediaIPForWrite(w, r, scope)
	if !ok {
		return
	}
	var req MediaIPRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	name := current.Name
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
	}
	status := current.Status
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
		if mediaEnumInvalid(status, mediaIPStatuses) {
			writeError(w, http.StatusBadRequest, "status must be active, paused or ended")
			return
		}
	}
	weekGoal := current.WeekGoal
	if req.WeekGoal != nil {
		weekGoal = *req.WeekGoal
		if weekGoal < 0 {
			writeError(w, http.StatusBadRequest, "week_goal must be zero or positive")
			return
		}
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateMediaIP(r.Context(), db.UpdateMediaIPParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		Name:          name,
		Persona:       mediaTextPatch(req.Persona, current.Persona),
		Track:         mediaTextPatch(req.Track, current.Track),
		Audience:      mediaTextPatch(req.Audience, current.Audience),
		Color:         mediaTextPatch(req.Color, current.Color),
		WeekGoal:      weekGoal,
		Status:        status,
		OwnerMemberID: owner,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a content IP with this name already exists")
			return
		}
		workbenchInternalError(w, r, "failed to update content IP", err)
		return
	}

	h.publishMediaIPChanged(scope, uuidToString(updated.ID))
	writeJSON(w, http.StatusOK, mediaIPToResponse(updated))
}

// DeleteMediaIP 鈥?DELETE /api/workbench/media/ips/{ipId} (soft delete)
func (h *Handler) DeleteMediaIP(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadMediaIPForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveMediaIP(r.Context(), db.ArchiveMediaIPParams{
		ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete content IP", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "ip not found")
		return
	}
	h.publishMediaIPChanged(scope, uuidToString(current.ID))
	w.WriteHeader(http.StatusNoContent)
}

// AttachMediaIPAccount 鈥?POST /api/workbench/media/ips/{ipId}/accounts
//
// Writes `creator.media_ip_id` (729). An account belongs to at most one IP, so a
// creator that already carries a pointer is a 409 in both directions: the same IP
// (already attached) and another IP (detach first). Re-pointing in place would
// silently move an account's whole publishing history between personas.
func (h *Handler) AttachMediaIPAccount(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	ip, ok := h.loadMediaIPForWrite(w, r, scope)
	if !ok {
		return
	}
	var req MediaAccountRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	creatorID, ok := parseUUIDOrBadRequest(w, strings.TrimSpace(valueOrEmpty(req.CreatorID)), "creator_id")
	if !ok {
		return
	}
	creator, err := h.Queries.GetCreator(r.Context(), db.GetCreatorParams{
		ID: creatorID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "creator_id is not a creator in this workspace")
		return
	}
	if creator.MediaIpID.Valid {
		if uuidToString(creator.MediaIpID) == uuidToString(ip.ID) {
			writeError(w, http.StatusConflict, "this account is already attached to the IP")
			return
		}
		writeError(w, http.StatusConflict, "this account already belongs to another IP; detach it first")
		return
	}

	attached, err := h.Queries.SetCreatorMediaIP(r.Context(), db.SetCreatorMediaIPParams{
		ID:          creator.ID,
		WorkspaceID: scope.WorkspaceUUID,
		MediaIpID:   ip.ID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to attach the account to the IP", err)
		return
	}

	h.publishMediaIPChanged(scope, uuidToString(ip.ID))
	h.publishCreatorChanged(scope.WorkspaceID, uuidToString(attached.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, mediaIPAccountToResponse(attached))
}

// DetachMediaIPAccount 鈥?DELETE /api/workbench/media/ips/{ipId}/accounts/{creatorId}
//
// Clears `creator.media_ip_id`. The account is not deleted: an external 杈句汉 stays
// in the creator ledger after leaving a persona.
func (h *Handler) DetachMediaIPAccount(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	ip, ok := h.loadMediaIPForWrite(w, r, scope)
	if !ok {
		return
	}
	creatorID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "creatorId"), "creator id")
	if !ok {
		return
	}
	creator, err := h.Queries.GetCreator(r.Context(), db.GetCreatorParams{
		ID: creatorID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "account not found")
		return
	}
	if !creator.MediaIpID.Valid || uuidToString(creator.MediaIpID) != uuidToString(ip.ID) {
		writeError(w, http.StatusNotFound, "this account is not attached to the IP")
		return
	}

	if _, err := h.Queries.SetCreatorMediaIP(r.Context(), db.SetCreatorMediaIPParams{
		ID:          creator.ID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		workbenchInternalError(w, r, "failed to detach the account from the IP", err)
		return
	}

	h.publishMediaIPChanged(scope, uuidToString(ip.ID))
	h.publishCreatorChanged(scope.WorkspaceID, uuidToString(creator.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- topics ----------------------------------------------------------------

// ListMediaTopics 鈥?GET /api/workbench/media/topics
func (h *Handler) ListMediaTopics(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	ipID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("ip_id"))), "ip_id")
	if !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && mediaEnumInvalid(status, mediaTopicStatuses) {
		writeError(w, http.StatusBadRequest,
			"status must be pool, scripting, shooting, publishing, done or dropped")
		return
	}
	rows, err := h.Queries.ListMediaTopics(r.Context(), db.ListMediaTopicsParams{
		WorkspaceID: scope.WorkspaceUUID,
		IpID:        ipID,
		Status:      strToText(status),
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list topics", err)
		return
	}
	resp := make([]MediaTopicResponse, len(rows))
	for i, row := range rows {
		resp[i] = mediaTopicToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"topics": resp, "total": len(resp)})
}

// CreateMediaTopic 鈥?POST /api/workbench/media/topics
func (h *Handler) CreateMediaTopic(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req MediaTopicRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	ip, ok := h.requireMediaIP(r.Context(), w, scope, req.IPID, true)
	if !ok {
		return
	}
	title := strings.TrimSpace(valueOrEmpty(req.Title))
	if title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	source := mediaTopicSourceManual
	if req.Source != nil {
		source = strings.TrimSpace(*req.Source)
	}
	if mediaEnumInvalid(source, mediaTopicSources) {
		writeError(w, http.StatusBadRequest, "source must be hot, manual, bench or ai")
		return
	}
	status := mediaTopicStatusPool
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
	}
	if mediaEnumInvalid(status, mediaTopicStatuses) {
		writeError(w, http.StatusBadRequest,
			"status must be pool, scripting, shooting, publishing, done or dropped")
		return
	}
	scores, ok := mediaScoresValue(w, req.Scores, emptyMediaScores())
	if !ok {
		return
	}
	// A member may only create topics it owns; owners and admins may name any
	// member. The IP's owner is *not* used as a default: a 缂栧 creating a topic on
	// someone else's persona still owns the topic it wrote.
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	hotID, ok := workbenchOptionalUUID(w, req.HotID, "hot_id")
	if !ok {
		return
	}

	topic, err := h.Queries.CreateMediaTopic(r.Context(), db.CreateMediaTopicParams{
		WorkspaceID:   scope.WorkspaceUUID,
		IpID:          ip.ID,
		Title:         title,
		Source:        source,
		Scores:        scores,
		Status:        status,
		HotID:         hotID,
		Note:          optionalTrimmedText(req.Note),
		OwnerMemberID: owner,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create topic", err)
		return
	}

	h.publishMediaTopicChanged(scope, uuidToString(topic.ID))
	writeJSON(w, http.StatusCreated, mediaTopicToResponse(topic))
}

// GetMediaTopic 鈥?GET /api/workbench/media/topics/{topicId}
func (h *Handler) GetMediaTopic(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	topicID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "topicId"), "topic id")
	if !ok {
		return
	}
	topic, err := h.Queries.GetMediaTopic(r.Context(), db.GetMediaTopicParams{
		ID: topicID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "topic not found")
		return
	}
	writeJSON(w, http.StatusOK, mediaTopicToResponse(topic))
}

// UpdateMediaTopic 鈥?PATCH /api/workbench/media/topics/{topicId}
func (h *Handler) UpdateMediaTopic(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadMediaTopicForWrite(w, r, scope)
	if !ok {
		return
	}
	var req MediaTopicRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	ipID := current.IpID
	if req.IPID != nil {
		ip, ok := h.requireMediaIP(r.Context(), w, scope, req.IPID, true)
		if !ok {
			return
		}
		ipID = ip.ID
	}
	title := current.Title
	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
		if title == "" {
			writeError(w, http.StatusBadRequest, "title is required")
			return
		}
	}
	source := current.Source
	if req.Source != nil {
		source = strings.TrimSpace(*req.Source)
		if mediaEnumInvalid(source, mediaTopicSources) {
			writeError(w, http.StatusBadRequest, "source must be hot, manual, bench or ai")
			return
		}
	}
	status := current.Status
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
		if mediaEnumInvalid(status, mediaTopicStatuses) {
			writeError(w, http.StatusBadRequest,
				"status must be pool, scripting, shooting, publishing, done or dropped")
			return
		}
	}
	scores, ok := mediaScoresValue(w, req.Scores, mediaScoresFromJSON(current.Scores))
	if !ok {
		return
	}
	hotID := current.HotID
	if req.HotID != nil {
		hotID, ok = workbenchOptionalUUID(w, req.HotID, "hot_id")
		if !ok {
			return
		}
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateMediaTopic(r.Context(), db.UpdateMediaTopicParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		IpID:          ipID,
		Title:         title,
		Source:        source,
		Scores:        scores,
		Status:        status,
		HotID:         hotID,
		Note:          mediaTextPatch(req.Note, current.Note),
		OwnerMemberID: owner,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update topic", err)
		return
	}

	h.publishMediaTopicChanged(scope, uuidToString(updated.ID))
	writeJSON(w, http.StatusOK, mediaTopicToResponse(updated))
}

// DeleteMediaTopic 鈥?DELETE /api/workbench/media/topics/{topicId} (soft delete)
func (h *Handler) DeleteMediaTopic(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadMediaTopicForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveMediaTopic(r.Context(), db.ArchiveMediaTopicParams{
		ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete topic", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "topic not found")
		return
	}
	h.publishMediaTopicChanged(scope, uuidToString(current.ID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- scripts ---------------------------------------------------------------

// ListMediaScripts 鈥?GET /api/workbench/media/scripts
//
// `topic_id` returns every version of that topic, newest first: the review screen
// needs v1 next to v2 and there is no per-version endpoint to ask for it.
func (h *Handler) ListMediaScripts(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	topicID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("topic_id"))), "topic_id")
	if !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && mediaEnumInvalid(status, mediaScriptStatuses) {
		writeError(w, http.StatusBadRequest, "status must be draft, review, approved or archived")
		return
	}
	rows, err := h.Queries.ListMediaScripts(r.Context(), db.ListMediaScriptsParams{
		WorkspaceID: scope.WorkspaceUUID,
		TopicID:     topicID,
		Status:      strToText(status),
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list scripts", err)
		return
	}
	resp := make([]MediaScriptResponse, len(rows))
	for i, row := range rows {
		resp[i] = mediaScriptToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"scripts": resp, "total": len(resp)})
}

// CreateMediaScript 鈥?POST /api/workbench/media/scripts
//
// Always version 1 of a topic's script鈥?unless the topic already has versions, in
// which case the INSERT numbers it after the highest (see CreateMediaScript). A
// topic's copy is expected to start from the topic's owner, so the script
// inherits it rather than letting the caller name one.
func (h *Handler) CreateMediaScript(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req MediaScriptRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	topicID, ok := workbenchOptionalUUID(w, req.TopicID, "topic_id")
	if !ok {
		return
	}
	if !topicID.Valid {
		writeError(w, http.StatusBadRequest, "topic_id is required")
		return
	}
	topic, err := h.Queries.GetMediaTopic(r.Context(), db.GetMediaTopicParams{
		ID: topicID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "topic_id is not a topic in this workspace")
		return
	}
	if !workbenchCanWrite(scope.Member, topic.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only write scripts for topics you own")
		return
	}
	status := mediaScriptStatusDraft
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
	}
	if mediaEnumInvalid(status, mediaScriptStatuses) {
		writeError(w, http.StatusBadRequest, "status must be draft, review, approved or archived")
		return
	}
	ipID := topic.IpID
	if req.IPID != nil {
		ip, ok := h.requireMediaIP(r.Context(), w, scope, req.IPID, false)
		if !ok {
			return
		}
		if ip.ID.Valid {
			ipID = ip.ID
		}
	}
	if req.OwnerMemberID != nil {
		if requested, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id"); !ok {
			return
		} else if uuidToString(requested) != uuidToString(topic.OwnerMemberID) {
			writeError(w, http.StatusBadRequest, "a script is owned by its topic's owner")
			return
		}
	}
	publishAt, ok := workbenchTimestampValue(w, req.PublishAt, "publish_at")
	if !ok {
		return
	}

	script, err := h.Queries.CreateMediaScript(r.Context(), db.CreateMediaScriptParams{
		WorkspaceID:   scope.WorkspaceUUID,
		TopicID:       topic.ID,
		IpID:          ipID,
		Hook:          optionalTrimmedText(req.Hook),
		Body:          optionalTrimmedText(req.Body),
		Cta:           optionalTrimmedText(req.CTA),
		CoverNote:     optionalTrimmedText(req.CoverNote),
		Tags:          mediaTagsValue(derefStringSlice(req.Tags)),
		Status:        status,
		PublishAt:     publishAt,
		OwnerMemberID: topic.OwnerMemberID,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "another edit already created that script version")
			return
		}
		workbenchInternalError(w, r, "failed to create script", err)
		return
	}

	h.publishMediaScriptChanged(scope, uuidToString(script.ID))
	writeJSON(w, http.StatusCreated, mediaScriptToResponse(script))
}

// GetMediaScript 鈥?GET /api/workbench/media/scripts/{scriptId}
func (h *Handler) GetMediaScript(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	scriptID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "scriptId"), "script id")
	if !ok {
		return
	}
	script, err := h.Queries.GetMediaScript(r.Context(), db.GetMediaScriptParams{
		ID: scriptID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "script not found")
		return
	}
	writeJSON(w, http.StatusOK, mediaScriptToResponse(script))
}

// UpdateMediaScript 鈥?PATCH /api/workbench/media/scripts/{scriptId}
//
// Two behaviours, chosen by what the request touches:
//
//   - any *copy* field (hook / body / cta / cover_note / tags) and no
//     `?inPlace=1` 鈫?insert the next version and answer with it. v1 stays
//     readable; the response is vN;
//   - anything else 鈥?only status, publish_at, or an explicit `?inPlace=1` 鈥?//     updates the row. A review decision is not a rewrite, and minting a version
//     every time a script moves to `approved` would bury the text history.
func (h *Handler) UpdateMediaScript(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, _, ok := h.loadMediaScriptForWrite(w, r, scope)
	if !ok {
		return
	}
	var req MediaScriptRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	if req.TopicID != nil {
		requested, ok := workbenchOptionalUUID(w, req.TopicID, "topic_id")
		if !ok {
			return
		}
		if uuidToString(requested) != uuidToString(current.TopicID) {
			writeError(w, http.StatusBadRequest, "a script cannot be moved to another topic")
			return
		}
	}
	status := current.Status
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
		if mediaEnumInvalid(status, mediaScriptStatuses) {
			writeError(w, http.StatusBadRequest, "status must be draft, review, approved or archived")
			return
		}
	}
	publishAt := current.PublishAt
	if req.PublishAt != nil {
		publishAt, ok = workbenchTimestampValue(w, req.PublishAt, "publish_at")
		if !ok {
			return
		}
	}
	ipID := current.IpID
	if req.IPID != nil {
		ip, ok := h.requireMediaIP(r.Context(), w, scope, req.IPID, false)
		if !ok {
			return
		}
		ipID = ip.ID
	}
	if req.OwnerMemberID != nil {
		requested, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
		if !ok {
			return
		}
		if uuidToString(requested) != uuidToString(current.OwnerMemberID) {
			if !roleAllowed(scope.Member.Role, "owner", "admin") {
				writeError(w, http.StatusForbidden, "members cannot reassign ownership")
				return
			}
			// Even an owner/admin cannot move a script off its topic's owner: the
			// ownership is derived, and letting it drift would make the two gates
			// disagree.
			writeError(w, http.StatusBadRequest, "a script is owned by its topic's owner")
			return
		}
	}

	hook := mediaTextPatch(req.Hook, current.Hook)
	body := mediaTextPatch(req.Body, current.Body)
	cta := mediaTextPatch(req.CTA, current.Cta)
	coverNote := mediaTextPatch(req.CoverNote, current.CoverNote)
	tags := mediaTagsPatch(req.Tags, current.Tags)
	contentChanged := req.Hook != nil || req.Body != nil || req.CTA != nil ||
		req.CoverNote != nil || req.Tags != nil
	inPlace := r.URL.Query().Get("inPlace") == "1"

	if contentChanged && !inPlace {
		// A new version keeps the chain's identity: same topic, same IP, same
		// owner, and the status/publish_at the PATCH sent (or the stored ones).
		script, err := h.Queries.CreateMediaScript(r.Context(), db.CreateMediaScriptParams{
			WorkspaceID:   scope.WorkspaceUUID,
			TopicID:       current.TopicID,
			IpID:          ipID,
			Hook:          hook,
			Body:          body,
			Cta:           cta,
			CoverNote:     coverNote,
			Tags:          tags,
			Status:        status,
			PublishAt:     publishAt,
			OwnerMemberID: current.OwnerMemberID,
			CreatedBy:     scope.Member.UserID,
		})
		if err != nil {
			if isUniqueViolation(err) {
				writeError(w, http.StatusConflict, "another edit already created that script version")
				return
			}
			workbenchInternalError(w, r, "failed to write the new script version", err)
			return
		}
		h.publishMediaScriptChanged(scope, uuidToString(script.ID))
		writeJSON(w, http.StatusOK, mediaScriptToResponse(script))
		return
	}

	updated, err := h.Queries.UpdateMediaScript(r.Context(), db.UpdateMediaScriptParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		IpID:          ipID,
		Hook:          hook,
		Body:          body,
		Cta:           cta,
		CoverNote:     coverNote,
		Tags:          tags,
		Status:        status,
		PublishAt:     publishAt,
		OwnerMemberID: current.OwnerMemberID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update script", err)
		return
	}

	h.publishMediaScriptChanged(scope, uuidToString(updated.ID))
	writeJSON(w, http.StatusOK, mediaScriptToResponse(updated))
}

// DeleteMediaScript 鈥?DELETE /api/workbench/media/scripts/{scriptId} (soft delete)
func (h *Handler) DeleteMediaScript(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, _, ok := h.loadMediaScriptForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveMediaScript(r.Context(), db.ArchiveMediaScriptParams{
		ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete script", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "script not found")
		return
	}
	h.publishMediaScriptChanged(scope, uuidToString(current.ID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- shoots ----------------------------------------------------------------

// ListMediaShoots 鈥?GET /api/workbench/media/shoots
//
// `from`/`to` are inclusive calendar days on `shoot_date`; `script_id` narrows it
// to one script's runs. Ordered by date, because a shoot list is a calendar.
func (h *Handler) ListMediaShoots(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	scriptID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("script_id"))), "script_id")
	if !ok {
		return
	}
	from, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("from"))), "from")
	if !ok {
		return
	}
	to, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("to"))), "to")
	if !ok {
		return
	}
	if from.Valid && to.Valid && to.Time.Before(from.Time) {
		writeError(w, http.StatusBadRequest, "to must not be before from")
		return
	}
	rows, err := h.Queries.ListMediaShoots(r.Context(), db.ListMediaShootsParams{
		WorkspaceID: scope.WorkspaceUUID,
		ScriptID:    scriptID,
		FromDate:    from,
		ToDate:      to,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list shoots", err)
		return
	}
	resp := make([]MediaShootResponse, len(rows))
	for i, row := range rows {
		resp[i] = mediaShootToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"shoots": resp, "total": len(resp)})
}

// CreateMediaShoot 鈥?POST /api/workbench/media/shoots
func (h *Handler) CreateMediaShoot(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req MediaShootRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	scriptID, ok := workbenchOptionalUUID(w, req.ScriptID, "script_id")
	if !ok {
		return
	}
	if !scriptID.Valid {
		writeError(w, http.StatusBadRequest, "script_id is required")
		return
	}
	_, topic, ok := h.requireMediaScriptChain(w, r, scope, scriptID)
	if !ok {
		return
	}
	if !workbenchCanWrite(scope.Member, topic.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only schedule shoots for topics you own")
		return
	}
	shootDate, ok := workbenchDateValue(w, req.ShootDate, "shoot_date")
	if !ok {
		return
	}
	if !shootDate.Valid {
		writeError(w, http.StatusBadRequest, "shoot_date is required")
		return
	}
	status := mediaShootStatusPlanned
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
	}
	if mediaEnumInvalid(status, mediaShootStatuses) {
		writeError(w, http.StatusBadRequest,
			"status must be planned, shooting, editing, done or cancelled")
		return
	}
	shots, ok := mediaShotsValue(w, req.Shots, nil)
	if !ok {
		return
	}
	checklist, ok := mediaChecklistValue(req.Checklist, nil)
	if !ok {
		return
	}
	if req.OwnerMemberID != nil {
		requested, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
		if !ok {
			return
		}
		if uuidToString(requested) != uuidToString(topic.OwnerMemberID) {
			writeError(w, http.StatusBadRequest, "a shoot is owned by its topic's owner")
			return
		}
	}

	shoot, err := h.Queries.CreateMediaShoot(r.Context(), db.CreateMediaShootParams{
		WorkspaceID:   scope.WorkspaceUUID,
		ScriptID:      scriptID,
		ShootDate:     shootDate,
		Location:      optionalTrimmedText(req.Location),
		Shots:         shots,
		Checklist:     checklist,
		Status:        status,
		OwnerMemberID: topic.OwnerMemberID,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create shoot", err)
		return
	}

	h.publishMediaShootChanged(scope, uuidToString(shoot.ID))
	writeJSON(w, http.StatusCreated, mediaShootToResponse(shoot))
}

// GetMediaShoot 鈥?GET /api/workbench/media/shoots/{shootId}
func (h *Handler) GetMediaShoot(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	shootID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "shootId"), "shoot id")
	if !ok {
		return
	}
	shoot, err := h.Queries.GetMediaShoot(r.Context(), db.GetMediaShootParams{
		ID: shootID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "shoot not found")
		return
	}
	writeJSON(w, http.StatusOK, mediaShootToResponse(shoot))
}

// UpdateMediaShoot 鈥?PATCH /api/workbench/media/shoots/{shootId}
//
// `checklist` merges over the stored tick state (mediaChecklistValue); `shots` is
// replaced whole, because a shot list is one artifact and a partial edit of one
// is a different document, not a patch.
func (h *Handler) UpdateMediaShoot(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, _, topic, ok := h.loadMediaShootForWrite(w, r, scope)
	if !ok {
		return
	}
	var req MediaShootRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	scriptID := current.ScriptID
	if req.ScriptID != nil {
		requested, ok := workbenchOptionalUUID(w, req.ScriptID, "script_id")
		if !ok {
			return
		}
		if !requested.Valid {
			writeError(w, http.StatusBadRequest, "script_id is required")
			return
		}
		if _, requestedTopic, ok := h.requireMediaScriptChain(w, r, scope, requested); !ok {
			return
		} else if uuidToString(requestedTopic.ID) != uuidToString(topic.ID) {
			writeError(w, http.StatusBadRequest, "a shoot cannot be moved to another topic's script")
			return
		}
		scriptID = requested
	}
	shootDate := current.ShootDate
	if req.ShootDate != nil {
		shootDate, ok = workbenchDateValue(w, req.ShootDate, "shoot_date")
		if !ok {
			return
		}
		if !shootDate.Valid {
			writeError(w, http.StatusBadRequest, "shoot_date is required")
			return
		}
	}
	status := current.Status
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
		if mediaEnumInvalid(status, mediaShootStatuses) {
			writeError(w, http.StatusBadRequest,
				"status must be planned, shooting, editing, done or cancelled")
			return
		}
	}
	shots, ok := mediaShotsValue(w, req.Shots, current.Shots)
	if !ok {
		return
	}
	checklist, ok := mediaChecklistValue(req.Checklist, current.Checklist)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateMediaShoot(r.Context(), db.UpdateMediaShootParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		ScriptID:      scriptID,
		ShootDate:     shootDate,
		Location:      mediaTextPatch(req.Location, current.Location),
		Shots:         shots,
		Checklist:     checklist,
		Status:        status,
		OwnerMemberID: current.OwnerMemberID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update shoot", err)
		return
	}

	h.publishMediaShootChanged(scope, uuidToString(updated.ID))
	writeJSON(w, http.StatusOK, mediaShootToResponse(updated))
}

// DeleteMediaShoot 鈥?DELETE /api/workbench/media/shoots/{shootId} (soft delete)
func (h *Handler) DeleteMediaShoot(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, _, _, ok := h.loadMediaShootForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveMediaShoot(r.Context(), db.ArchiveMediaShootParams{
		ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete shoot", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "shoot not found")
		return
	}
	h.publishMediaShootChanged(scope, uuidToString(current.ID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- events ----------------------------------------------------------------

func (h *Handler) publishMediaIPChanged(scope workbenchScope, ipID string) {
	h.publish(eventMediaIPChanged, scope.WorkspaceID, "member", uuidToString(scope.Member.UserID),
		map[string]any{"id": ipID})
}

func (h *Handler) publishMediaTopicChanged(scope workbenchScope, topicID string) {
	h.publish(eventMediaTopicChanged, scope.WorkspaceID, "member", uuidToString(scope.Member.UserID),
		map[string]any{"id": topicID})
}

func (h *Handler) publishMediaScriptChanged(scope workbenchScope, scriptID string) {
	h.publish(eventMediaScriptChanged, scope.WorkspaceID, "member", uuidToString(scope.Member.UserID),
		map[string]any{"id": scriptID})
}

func (h *Handler) publishMediaShootChanged(scope workbenchScope, shootID string) {
	h.publish(eventMediaShootChanged, scope.WorkspaceID, "member", uuidToString(scope.Member.UserID),
		map[string]any{"id": shootID})
}
