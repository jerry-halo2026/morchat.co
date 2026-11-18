package service

import (
	"encoding/json"

	"github.com/jackc/pgx/v5/pgtype"
)

// Helpers for the jsonb parameters whose sqlc Go type is text, not []byte.
//
// Every `jsonb` parameter in `server/pkg/db/queries/*.sql` is cast `::text::jsonb`
// so pgx binds it as a text value. Under the connection modes a pooler like
// Supabase's offers (`default_query_exec_mode=simple_protocol`, which is the only
// one that survives transaction pooling), a Go `[]byte` parameter is encoded as
// bytea hex (`\x7b7d`) and PostgreSQL then rejects it with
// "invalid input syntax for type json" — a `string` parameter is the only form
// that works in both the extended and the simple protocol. See
// docs/engineering/DB.md, "为什么 jsonb 参数必须是 string".

// jsonbText binds one marshalled JSON document to a nullable jsonb column. An
// absent document (nil slice) stays SQL NULL rather than the two-byte literal
// "null", which is a different JSON value.
func jsonbText(raw []byte) pgtype.Text {
	return pgtype.Text{String: string(raw), Valid: raw != nil}
}

// jsonbRaw is jsonbText for a json.RawMessage, which is the same []byte underneath
// but conventionally empty rather than nil when unset.
func jsonbRaw(raw json.RawMessage) pgtype.Text {
	return pgtype.Text{String: string(raw), Valid: len(raw) > 0}
}
