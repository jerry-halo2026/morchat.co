package orange

// cooperationIntents mirrors the CHECK from migration 811 so a value the
// constraint would reject becomes a recorded warning instead of a failed batch.
//
// Migration 811 narrowed the column to machine values and translated the one row
// that carried 「已签约」. The upstream still sends Chinese labels, so this table
// carries the label → machine-value map rather than rejecting them: the label is
// what the upstream has, and refusing it would silently drop real intent data.
var cooperationIntentValues = map[string]string{
	"未接触": "not_contacted",
	"待发送": "pending_send",
	"已发送": "sent",
	"已回复": "replied",
	"已报价": "quoted",
	"寄样中": "sampling",
	"已签约": "signed",
	"已成单": "deal",
	"排除":  "excluded",
}

// cooperationIntentMachine accepts a value that is already a machine value and
// translates one that is still an upstream label. The empty second return means
// the value is neither, and the caller records a warning.
func cooperationIntentMachine(raw string) (string, bool) {
	if raw == "" {
		return "", true
	}
	if machine, ok := cooperationIntentValues[raw]; ok {
		return machine, true
	}
	switch raw {
	case "not_contacted", "pending_send", "sent", "replied", "quoted",
		"sampling", "signed", "deal", "excluded":
		return raw, true
	}
	return "", false
}
