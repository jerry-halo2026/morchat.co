package orange

import (
	"math"
	"testing"
)

func ptrFloat(v float64) *float64 { return &v }
func ptrInt(v int64) *int64       { return &v }

func wantValue(t *testing.T, got *float64, want float64, label string) {
	t.Helper()
	if got == nil {
		t.Fatalf("%s: value is nil, want %v", label, want)
	}
	if math.Abs(*got-want) > 1e-9 {
		t.Fatalf("%s: value = %v, want %v", label, *got, want)
	}
}

// orange stores a rate as a percent; morechat stores it 0–1. Getting this
// direction wrong renders 20 % as 2000 %.
func TestPercentToRatio(t *testing.T) {
	cases := []struct {
		name  string
		input *float64
		want  *float64
	}{
		{"whole percent", ptrFloat(20), ptrFloat(0.2)},
		{"fractional percent", ptrFloat(20.5), ptrFloat(0.205)},
		{"zero stays zero", ptrFloat(0), ptrFloat(0)},
		{"nil in nil out", nil, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := PercentToRatio(tc.input)
			if tc.want == nil {
				if got != nil {
					t.Fatalf("PercentToRatio(nil) = %v, want nil", *got)
				}
				return
			}
			wantValue(t, got, *tc.want, "PercentToRatio")
		})
	}
}

func TestPercentToRatioDoesNotMutateInput(t *testing.T) {
	input := 42.0
	PercentToRatio(&input)
	if input != 42 {
		t.Fatalf("input mutated to %v, want 42", input)
	}
}

func TestRatioToPercent(t *testing.T) {
	wantValue(t, RatioToPercent(ptrFloat(0.2)), 20, "RatioToPercent(0.2)")
	wantValue(t, RatioToPercent(ptrFloat(0)), 0, "RatioToPercent(0)")
	if got := RatioToPercent(nil); got != nil {
		t.Fatalf("RatioToPercent(nil) = %v, want nil", *got)
	}
}

// A commission rate has to survive the round trip so a published offer reads
// back as the number orange stored.
func TestPercentRatioRoundTrip(t *testing.T) {
	for _, percent := range []float64{0, 1, 5, 20.5, 67} {
		back := RatioToPercent(PercentToRatio(ptrFloat(percent)))
		wantValue(t, back, percent, "round trip")
	}
}

func TestParseFollowerDisplay(t *testing.T) {
	cases := []struct {
		name  string
		input string
		want  *int64
	}{
		{"wan suffix", "2.6万", ptrInt(26000)},
		{"wan suffix, one decimal", "7.4万", ptrInt(74000)},
		{"yi suffix", "1.2亿", ptrInt(120000000)},
		{"plain integer", "666000", ptrInt(666000)},
		{"bare integer from real data", "7", ptrInt(7)},
		{"zero", "0", ptrInt(0)},
		{"surrounding space", " 1.5万 ", ptrInt(15000)},
		{"unparseable", "abc", nil},
		{"empty", "", nil},
		{"whitespace only", "   ", nil},
		{"suffix without number", "万", nil},
		{"negative", "-5", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ParseFollowerDisplay(tc.input)
			if tc.want == nil {
				if got != nil {
					t.Fatalf("ParseFollowerDisplay(%q) = %d, want nil", tc.input, *got)
				}
				return
			}
			if got == nil {
				t.Fatalf("ParseFollowerDisplay(%q) = nil, want %d", tc.input, *tc.want)
			}
			if *got != *tc.want {
				t.Fatalf("ParseFollowerDisplay(%q) = %d, want %d", tc.input, *got, *tc.want)
			}
		})
	}
}

func TestCoupledFollowers(t *testing.T) {
	cases := []struct {
		name    string
		value   *int64
		display string
		want    *int64
	}{
		{"display only", nil, "2.6万", ptrInt(26000)},
		{"integer value wins over display", ptrInt(1000), "2.6万", ptrInt(1000)},
		{"real zero is kept", ptrInt(0), "2.6万", ptrInt(0)},
		{"negative sentinel falls back to display", ptrInt(-1), "1.2万", ptrInt(12000)},
		{"neither source parses", nil, "abc", nil},
		{"both empty", nil, "", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CoupledFollowers(tc.value, tc.display)
			if tc.want == nil {
				if got != nil {
					t.Fatalf("CoupledFollowers = %d, want nil", *got)
				}
				return
			}
			if got == nil {
				t.Fatalf("CoupledFollowers = nil, want %d", *tc.want)
			}
			if *got != *tc.want {
				t.Fatalf("CoupledFollowers = %d, want %d", *got, *tc.want)
			}
		})
	}
}

// The regression this exists for: orange's NULL means "no statistics"; turning
// it into 0 makes a creator look like they perform at 0 %.
func TestMetricFromSample(t *testing.T) {
	cases := []struct {
		name    string
		value   *float64
		sample  int64
		min     int64
		wantVal *float64
	}{
		{"null value, no rows", nil, 0, 10, nil},
		{"null value, plenty of rows", nil, 50, 10, nil},
		{"sample below minimum", ptrFloat(4.2), 3, 10, nil},
		{"sample exactly at minimum", ptrFloat(4.2), 10, 10, ptrFloat(4.2)},
		{"sample above minimum", ptrFloat(4.2), 12, 10, ptrFloat(4.2)},
		{"zero rows is never a value", ptrFloat(4.2), 0, 0, nil},
		{"real zero value survives", ptrFloat(0), 12, 10, ptrFloat(0)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := MetricFromSample(tc.value, tc.sample, tc.min)
			if got.SampleCount != tc.sample {
				t.Fatalf("SampleCount = %d, want %d", got.SampleCount, tc.sample)
			}
			if tc.wantVal == nil {
				if got.Value != nil {
					t.Fatalf("Value = %v, want nil", *got.Value)
				}
				if got.Empty != EmptyInsufficientData {
					t.Fatalf("Empty = %q, want %q", got.Empty, EmptyInsufficientData)
				}
				return
			}
			wantValue(t, got.Value, *tc.wantVal, "MetricFromSample")
			if got.Empty != "" {
				t.Fatalf("Empty = %q, want empty for a computed value", got.Empty)
			}
		})
	}
}

func TestRatioFromPercentSample(t *testing.T) {
	got := RatioFromPercentSample(ptrFloat(3.5), 20, 10)
	wantValue(t, got.Value, 0.035, "RatioFromPercentSample(3.5)")
	if got.SampleCount != 20 {
		t.Fatalf("SampleCount = %d, want 20", got.SampleCount)
	}

	// A null upstream rate stays null even with a healthy sample: engagement_rate
	// is null when follower_value is zero, and there is no ratio to report.
	nullCase := RatioFromPercentSample(nil, 20, 10)
	if nullCase.Value != nil || nullCase.Empty != EmptyInsufficientData {
		t.Fatalf("null percent = %+v, want insufficient_data", nullCase)
	}

	// hit_rate needs 10 videos with stats; below that orange returns null and so
	// must we.
	thinCase := RatioFromPercentSample(ptrFloat(12), 4, 10)
	if thinCase.Value != nil || thinCase.Empty != EmptyInsufficientData {
		t.Fatalf("thin sample = %+v, want insufficient_data", thinCase)
	}
}

// Commission rates are the concrete percent → ratio case: 20 % is stored as 0.2
// and read back as 20.
func TestCommissionRateStorageScale(t *testing.T) {
	stored := PercentToRatio(ptrFloat(20))
	wantValue(t, stored, 0.2, "stored commission rate")
	wantValue(t, RatioToPercent(stored), 20, "published commission rate")

	if got := RatioFromPercentSample(ptrFloat(20), 100, 10); got.Value == nil || *got.Value != 0.2 {
		t.Fatalf("MetricValue for a 20 %% commission = %+v, want 0.2", got)
	}
}
