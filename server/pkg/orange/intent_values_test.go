package orange

import (
	"testing"
)

// The upstream still labels intent in Chinese; migration 811 stores machine
// values. This is the whole point of the translation: a label that carries real
// business state must not be dropped just because the column changed shape.
func TestCooperationIntentMachine(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		raw   string
		want  string
		valid bool
	}{
		{name: "upstream label", raw: "已签约", want: "signed", valid: true},
		{name: "label deal", raw: "已成单", want: "deal", valid: true},
		{name: "label not contacted", raw: "未接触", want: "not_contacted", valid: true},
		{name: "already machine", raw: "signed", want: "signed", valid: true},
		{name: "empty means unset", raw: "", want: "", valid: true},
		{name: "unknown is rejected", raw: "谈崩了", want: "", valid: false},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, ok := cooperationIntentMachine(tc.raw)
			if ok != tc.valid {
				t.Fatalf("valid = %v, want %v", ok, tc.valid)
			}
			if got != tc.want {
				t.Fatalf("value = %q, want %q", got, tc.want)
			}
		})
	}
}
