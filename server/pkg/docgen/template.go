// Package docgen generates the HR documents this product delivers: a Word file
// (.docx) and a PDF, both produced from a plain-text template with
// {{placeholder}} slots.
//
// The customer confirmed that stamping stays offline, so nothing here knows about
// approval, signing or stamps: the output is a file somebody downloads, prints and
// stamps by hand. That is the whole contract, and it is why the package keeps two
// narrow entry points -- Docx(text) and PDF(text) -- over the rendered text:
//
//	template body ──Render──▶ text ──Docx──▶ .docx bytes
//	                                └─PDF───▶ .pdf bytes
//
// No third-party dependency: the .docx is the OOXML package the format actually
// is (a zip of a handful of XML parts) and the PDF is written by hand. The reason
// is in AGENTS.md -- a document generator is not worth a library that drags a
// rendering engine, fonts and a transitive tree behind it.
//
// Rendering rules the tests pin down:
//
//   - `{{key}}` is replaced by `values[key]`, including an empty value, which
//     renders as blank (a missing hire date is a blank on the paper, not the
//     literal word "null").
//   - An unknown placeholder is kept verbatim and reported as a warning. Silence
//     would put "{{部门}}" on a stamped certificate, and blanking it would hide the
//     typo just as effectively; keeping it means the mistake is visible in the
//     generated file and in the response.
//   - A newline separates paragraphs (docx) / lines (pdf). Nothing else is
//     interpreted: this is not a markup language.
package docgen

import (
	"fmt"
	"sort"
	"strings"
)

// Template kinds. A closed set, mirroring the CHECK in migration 780: it is the
// template list's filter and the segment a generated file is filed under.
const (
	KindEmployment  = "employment"
	KindResignation = "resignation"
	KindContract    = "contract"
	KindOffer       = "offer"
	KindOther       = "other"
)

// Kinds is the closed enum, in the order the picker shows.
var Kinds = []string{KindEmployment, KindResignation, KindContract, KindOffer, KindOther}

// ValidKind reports whether kind is one of Kinds.
func ValidKind(kind string) bool {
	for _, candidate := range Kinds {
		if candidate == kind {
			return true
		}
	}
	return false
}

// Template is one stored document body, as much of it as the renderer needs.
type Template struct {
	Name string
	Kind string
	Body string
}

// Rendered is the output of Render: the text a generator consumes, the values
// that produced it, and whatever the template asked for and did not get.
//
// Values is the *input* map, copied, not a re-derivation: it is what the
// generation ledger stores, and what a later re-render would need to reproduce
// this exact text.
type Rendered struct {
	Text     string
	Values   map[string]string
	Warnings []string
}

// HasWarnings reports whether the template named any placeholder that no value
// was supplied for.
func (r Rendered) HasWarnings() bool { return len(r.Warnings) > 0 }

// Render substitutes `{{key}}` slots in body from values.
//
// Values are used exactly as given -- trimming, formatting and defaults belong to
// the caller, because "which date format does a stamped certificate use" is a
// product decision, not a text-substitution one.
func Render(body string, values map[string]string) Rendered {
	var out strings.Builder
	out.Grow(len(body))

	used := make(map[string]string, len(values))
	// Unknown keys are reported once each, in first-appearance order: a body that
	// names {{部门}} in three places has one typo, not three.
	var warnings []string
	warned := make(map[string]bool, 2)

	for i := 0; i < len(body); {
		open := strings.Index(body[i:], "{{")
		if open < 0 {
			out.WriteString(body[i:])
			break
		}
		open += i
		out.WriteString(body[i:open])

		closing := strings.Index(body[open+2:], "}}")
		if closing < 0 {
			// An unclosed "{{" is literal text; there is no slot to report.
			out.WriteString(body[open:])
			break
		}
		closing += open + 2
		slot := body[open : closing+2]
		key := strings.TrimSpace(body[open+2 : closing])

		if key == "" {
			if !warned[slot] {
				warned[slot] = true
				warnings = append(warnings, fmt.Sprintf("empty placeholder %s kept verbatim", slot))
			}
			out.WriteString(slot)
			i = closing + 2
			continue
		}

		value, ok := values[key]
		if !ok {
			if !warned[key] {
				warned[key] = true
				warnings = append(warnings, fmt.Sprintf("unknown placeholder %s kept verbatim", slot))
			}
			out.WriteString(slot)
			i = closing + 2
			continue
		}
		out.WriteString(value)
		used[key] = value
		i = closing + 2
	}

	return Rendered{Text: out.String(), Values: used, Warnings: warnings}
}

// Placeholders lists the distinct slot names a body names, sorted. It answers
// "what can I fill in for this template" without rendering it, which is what a
// client building the values form needs.
func Placeholders(body string) []string {
	seen := make(map[string]bool)
	var keys []string
	for i := 0; i < len(body); {
		open := strings.Index(body[i:], "{{")
		if open < 0 {
			break
		}
		open += i
		closing := strings.Index(body[open+2:], "}}")
		if closing < 0 {
			break
		}
		closing += open + 2
		key := strings.TrimSpace(body[open+2 : closing])
		if key != "" && !seen[key] {
			seen[key] = true
			keys = append(keys, key)
		}
		i = closing + 2
	}
	sort.Strings(keys)
	return keys
}

// Builtin returns the three templates every workspace starts with: the two
// certificates the customer asked for first, and the contract addendum that goes
// with a renewal.
//
// The bodies name the slots the handler fills from the employee's file. They are
// deliberately plain prose -- no letterhead, no numbering, no page footer --
// because the printed page is stamped and filed by hand.
func Builtin() []Template {
	return []Template{
		{
			Name: "在职证明",
			Kind: KindEmployment,
			Body: "在职证明\n\n" +
				"兹证明 {{员工姓名}} 先生/女士，自 {{入职日期}} 起在我公司 {{部门}} 部门担任 {{职位}} 一职，现仍在职。\n\n" +
				"特此证明。\n\n" +
				"{{公司名称}}\n" +
				"{{今天}}",
		},
		{
			Name: "离职证明",
			Kind: KindResignation,
			Body: "离职证明\n\n" +
				"兹证明 {{员工姓名}} 先生/女士，自 {{入职日期}} 起在我公司 {{部门}} 部门担任 {{职位}} 一职，已于 {{离职日期}} 与我公司解除劳动关系，双方已办理完毕工作交接，无未了结事项。\n\n" +
				"特此证明。\n\n" +
				"{{公司名称}}\n" +
				"{{今天}}",
		},
		{
			Name: "劳动合同补充协议",
			Kind: KindContract,
			Body: "劳动合同补充协议\n\n" +
				"甲方：{{公司名称}}\n" +
				"乙方：{{员工姓名}}\n\n" +
				"鉴于乙方自 {{入职日期}} 起在甲方 {{部门}} 部门担任 {{职位}}，经双方协商一致，就原劳动合同达成如下补充约定：\n\n" +
				"一、乙方的工作部门与职位以本协议载明者为准，甲方因经营需要调整的，应提前书面通知乙方。\n" +
				"二、本协议作为原劳动合同的组成部分，与原合同具有同等效力；本协议未尽事宜，仍按原合同执行。\n" +
				"三、本协议自双方签字（盖章）之日起生效。\n\n" +
				"甲方（盖章）：{{公司名称}}\n" +
				"乙方（签字）：{{员工姓名}}\n" +
				"签订日期：{{今天}}",
		},
	}
}

// BuiltinNames returns the builtin template names in order. The handler uses it to
// keep the seeded rows and the code in step.
func BuiltinNames() []string {
	templates := Builtin()
	names := make([]string, len(templates))
	for i, template := range templates {
		names[i] = template.Name
	}
	return names
}
