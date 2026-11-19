package orange

import (
	"math"
	"strconv"
	"strings"
)

// Unit conversion between orange's storage conventions and morechat's.
//
// The two systems do not agree on two things, and both disagreements produced
// silent 100x errors in the systems this replaces:
//
//   - Percentages. orange stores a commission rate or an engagement rate as a
//     percent (20 means 20 %); morechat stores every rate at the 0–1 scale
//     (docs/METRICS.md C3) and multiplies by 100 only for display.
//   - Empty. orange returns NULL when a rate has no rows behind it
//     (sql/018_metric_null_semantics.sql); a zero is a real zero. morechat's
//     three-state metric value carries that distinction to the UI instead of
//     rendering an invented 0 %.
//
// Everything in this file is a pure function so the conversions can be tested
// without a database.

// EmptyInsufficientData is the empty rule morechat uses for a metric that has
// no rows to compute from (packages/core/metrics/contracts.ts
// `MetricEmptyRule`).
const EmptyInsufficientData = "insufficient_data"

// MetricValue mirrors the server's three-state metric entry
// (`handler.WorkbenchMetricValue`): value + sample size, or an empty rule that
// says why there is no value.
type MetricValue struct {
	Value       *float64 `json:"value"`
	SampleCount int64    `json:"sample_count"`
	Empty       string   `json:"empty"`
}

// PercentToRatio converts orange's percent (20 = 20 %) to the 0–1 storage
// scale.
func PercentToRatio(p *float64) *float64 {
	if p == nil {
		return nil
	}
	ratio := *p / 100
	return &ratio
}

// RatioToPercent converts a 0–1 ratio back to orange's percent, for publishing
// or side-by-side comparison.
func RatioToPercent(r *float64) *float64 {
	if r == nil {
		return nil
	}
	percent := *r * 100
	return &percent
}

// followerSuffixes are the Chinese magnitude suffixes Douyin renders in a
// follower count. The value is a display string, so "2.6万" and "666000" both
// appear in the same column.
var followerSuffixes = []struct {
	suffix     string
	multiplier float64
}{
	{"亿", 1e8},
	{"万", 1e4},
}

// ParseFollowerDisplay parses a display follower count ("2.6万", "1.2亿",
// "666000") into an integer. It returns nil for anything it cannot parse, so an
// unparseable display never becomes the number 0.
func ParseFollowerDisplay(s string) *int64 {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return nil
	}

	multiplier := 1.0
	for _, candidate := range followerSuffixes {
		stripped, found := strings.CutSuffix(trimmed, candidate.suffix)
		if !found {
			continue
		}
		multiplier = candidate.multiplier
		trimmed = strings.TrimSpace(stripped)
		break
	}
	if trimmed == "" {
		return nil
	}

	parsed, err := strconv.ParseFloat(trimmed, 64)
	if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) || parsed < 0 {
		return nil
	}
	value := int64(math.Round(parsed * multiplier))
	return &value
}

// CoupledFollowers picks the trustworthy follower count out of the pair orange
// keeps: `follower_value` is the integer used for filtering and sorting,
// `follower_count` is the display string (which may be the only one present,
// and may read "2.6万").
//
// A negative value is a scraper sentinel rather than a count, so it falls
// through to the display form. When neither source holds a number the result is
// nil, never 0.
func CoupledFollowers(value *int64, display string) *int64 {
	if value != nil && *value >= 0 {
		return value
	}
	return ParseFollowerDisplay(display)
}

// MetricFromSample builds a three-state metric from a value and the number of
// rows behind it.
//
// The result is `insufficient_data` — with a nil value — when the value is
// missing, when no rows were sampled at all, or when the sample is below
// minSample. It never substitutes 0: orange's null means "no statistics", and a
// rendered 0 % would claim the creator performs badly instead of saying nobody
// has measured them yet.
func MetricFromSample(value *float64, sample int64, minSample int64) MetricValue {
	if value == nil || sample <= 0 || sample < minSample {
		return MetricValue{SampleCount: sample, Empty: EmptyInsufficientData}
	}
	return MetricValue{Value: value, SampleCount: sample, Empty: ""}
}

// RatioFromPercentSample is MetricFromSample for a percent-valued upstream
// column: the value is converted to the 0–1 scale before the empty rule is
// applied.
func RatioFromPercentSample(percent *float64, sample int64, minSample int64) MetricValue {
	return MetricFromSample(PercentToRatio(percent), sample, minSample)
}
