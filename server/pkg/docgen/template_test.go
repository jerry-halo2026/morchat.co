package docgen

import (
	"reflect"
	"strings"
	"testing"
)

// TestRenderReplacesPlaceholders is the base case: a known slot becomes its value,
// and everything around it is untouched.
func TestRenderReplacesPlaceholders(t *testing.T) {
	rendered := Render("兹证明 {{员工姓名}} 在 {{部门}} 工作。", map[string]string{
		"员工姓名": "张三",
		"部门":   "研发部",
	})

	if want := "兹证明 张三 在 研发部 工作。"; rendered.Text != want {
		t.Fatalf("text = %q, want %q", rendered.Text, want)
	}
	if len(rendered.Warnings) != 0 {
		t.Fatalf("warnings = %v, want none", rendered.Warnings)
	}
	// The values map is the *input* snapshot the generation ledger stores.
	if want := map[string]string{"员工姓名": "张三", "部门": "研发部"}; !reflect.DeepEqual(rendered.Values, want) {
		t.Fatalf("values = %v, want %v", rendered.Values, want)
	}
	if rendered.HasWarnings() {
		t.Fatal("HasWarnings = true, want false")
	}
}

// TestRenderKeepsUnknownPlaceholders covers the rule the contract states: a slot
// nobody supplied is kept verbatim and reported, never silently blanked. Without
// the warning an editor cannot tell a typo from an intentionally empty field;
// without the verbatim text the typo disappears from the generated file too.
func TestRenderKeepsUnknownPlaceholders(t *testing.T) {
	rendered := Render("{{员工姓名}} / {{部门}} / {{TEAM}}", map[string]string{"员工姓名": "李四"})

	if want := "李四 / {{部门}} / {{TEAM}}"; rendered.Text != want {
		t.Fatalf("text = %q, want %q (unknown slots verbatim)", rendered.Text, want)
	}
	if len(rendered.Warnings) != 2 {
		t.Fatalf("warnings = %v, want one per unknown slot", rendered.Warnings)
	}
	if !strings.Contains(rendered.Warnings[0], "{{部门}}") ||
		!strings.Contains(rendered.Warnings[1], "{{TEAM}}") {
		t.Fatalf("warnings = %v, want them to name the slots", rendered.Warnings)
	}
	// The values snapshot holds only what was actually used: re-rendering from it
	// would reproduce this text, warnings included.
	if _, ok := rendered.Values["部门"]; ok {
		t.Fatalf("values = %v, want the unknown slot absent", rendered.Values)
	}

	// Repeating one unknown slot is one typo, not three.
	repeated := Render("{{部门}}{{部门}}{{部门}}", nil)
	if len(repeated.Warnings) != 1 {
		t.Fatalf("warnings = %v, want the repeated slot reported once", repeated.Warnings)
	}
	if repeated.Text != "{{部门}}{{部门}}{{部门}}" {
		t.Fatalf("text = %q, want every occurrence kept", repeated.Text)
	}
}

// TestRenderEmptyValueIsBlank: a known slot with an empty value renders as blank,
// not as "null", "0" or the key. A person with no leave date has a blank line on
// the certificate.
func TestRenderEmptyValueIsBlank(t *testing.T) {
	rendered := Render("离职日期：{{离职日期}}；职位：{{职位}}", map[string]string{
		"离职日期": "",
		"职位":   "工程师",
	})

	if want := "离职日期：；职位：工程师"; rendered.Text != want {
		t.Fatalf("text = %q, want %q", rendered.Text, want)
	}
	if len(rendered.Warnings) != 0 {
		t.Fatalf("warnings = %v, want none for a supplied-but-empty value", rendered.Warnings)
	}
	if value, ok := rendered.Values["离职日期"]; !ok || value != "" {
		t.Fatalf("values = %v, want the empty value recorded", rendered.Values)
	}
}

// TestRenderPreservesNewlines: a newline is a paragraph break, and nothing else in
// the body is interpreted. Both generators consume exactly the same text.
func TestRenderPreservesNewlines(t *testing.T) {
	body := "在职证明\n\n兹证明 {{员工姓名}}。\n\n{{公司名称}}\n{{今天}}"
	rendered := Render(body, map[string]string{
		"员工姓名": "王五",
		"公司名称": "示例科技",
		"今天":   "2026-11-18",
	})

	want := "在职证明\n\n兹证明 王五。\n\n示例科技\n2026-11-18"
	if rendered.Text != want {
		t.Fatalf("text = %q, want %q", rendered.Text, want)
	}
	if got := len(splitParagraphs(rendered.Text)); got != 6 {
		t.Fatalf("paragraphs = %d, want 6 (blank lines included)", got)
	}
	// Markdown-ish syntax is not a feature: stars stay stars.
	starred := Render("**{{员工姓名}}**", map[string]string{"员工姓名": "赵六"})
	if starred.Text != "**赵六**" {
		t.Fatalf("text = %q, want the markup left alone", starred.Text)
	}
}

// TestRenderToleratesMalformedSlots: an unclosed "{{" and an empty "{{}}" are the
// two ways a hand-edited body breaks, and neither may panic or eat the rest of
// the text.
func TestRenderToleratesMalformedSlots(t *testing.T) {
	unclosed := Render("前半 {{员工姓名", map[string]string{"员工姓名": "张三"})
	if unclosed.Text != "前半 {{员工姓名" {
		t.Fatalf("text = %q, want the unclosed slot kept verbatim", unclosed.Text)
	}
	if len(unclosed.Warnings) != 0 {
		t.Fatalf("warnings = %v, want none (there is no slot to report)", unclosed.Warnings)
	}

	empty := Render("a {{}} b", map[string]string{"": "ignored"})
	if empty.Text != "a {{}} b" {
		t.Fatalf("text = %q, want the empty slot kept verbatim", empty.Text)
	}
	if len(empty.Warnings) != 1 {
		t.Fatalf("warnings = %v, want the empty slot reported", empty.Warnings)
	}

	// A key padded with spaces is the same key: templates are edited by hand.
	padded := Render("{{ 员工姓名 }}", map[string]string{"员工姓名": "张三"})
	if padded.Text != "张三" {
		t.Fatalf("text = %q, want the trimmed key resolved", padded.Text)
	}
}

// TestPlaceholdersListsSlots answers "what can I fill in" without rendering, which
// is what a client building the values form needs.
func TestPlaceholdersListsSlots(t *testing.T) {
	body := "{{员工姓名}} {{部门}} {{员工姓名}} {{入职日期}}"
	want := []string{"入职日期", "员工姓名", "部门"}
	if got := Placeholders(body); !reflect.DeepEqual(got, want) {
		t.Fatalf("Placeholders = %v, want %v (distinct, sorted)", got, want)
	}
	if got := Placeholders("no slots here"); len(got) != 0 {
		t.Fatalf("Placeholders = %v, want none", got)
	}
}

// TestBuiltinTemplates pins the three seeded documents: their kinds are valid, the
// bodies name the slots the handler fills from the employee's file, and every slot
// a body names is one of them -- a builtin template that references a placeholder
// nothing supplies would render a visible "{{...}}" on a stamped certificate.
func TestBuiltinTemplates(t *testing.T) {
	templates := Builtin()
	if len(templates) != 3 {
		t.Fatalf("builtin templates = %d, want 3", len(templates))
	}

	supplied := map[string]bool{
		"员工姓名": true, "部门": true, "职位": true,
		"入职日期": true, "离职日期": true, "公司名称": true, "今天": true,
	}
	wantKinds := []string{KindEmployment, KindResignation, KindContract}
	wantNames := []string{"在职证明", "离职证明", "劳动合同补充协议"}

	for i, template := range templates {
		if template.Name != wantNames[i] {
			t.Fatalf("templates[%d].Name = %q, want %q", i, template.Name, wantNames[i])
		}
		if template.Kind != wantKinds[i] {
			t.Fatalf("templates[%d].Kind = %q, want %q", i, template.Kind, wantKinds[i])
		}
		if !ValidKind(template.Kind) {
			t.Fatalf("templates[%d].Kind = %q, not in Kinds", i, template.Kind)
		}
		for _, key := range Placeholders(template.Body) {
			if !supplied[key] {
				t.Fatalf("templates[%d] names %q, which the handler does not supply", i, key)
			}
		}
		// Every builtin names the person it is about.
		if !strings.Contains(template.Body, "{{员工姓名}}") {
			t.Fatalf("templates[%d] does not name {{员工姓名}}", i)
		}
	}

	if !reflect.DeepEqual(BuiltinNames(), wantNames) {
		t.Fatalf("BuiltinNames = %v, want %v", BuiltinNames(), wantNames)
	}

	for _, kind := range []string{"", "Employment", "certificate"} {
		if ValidKind(kind) {
			t.Fatalf("ValidKind(%q) = true, want false", kind)
		}
	}
}
