package handler

// Pure-function tests for the capability resolution order (docs/engineering/
// WORKBENCH-API.md §24.2). No database, no HTTP: they pin `resolveWorkbenchCapabilities`
// itself, which is what the request path runs.
//
// The case that motivated them: a member in 商务 had five capabilities, renaming the
// department to a name the built-in table did not recognise made the API answer with the
// ten-capability legacy fallback, and `POST /api/workbench/creators` still returned 201.
// An unrecognised department must be narrower than a recognised one, never broader.

import (
	"reflect"
	"strings"
	"testing"
)

// capabilityNames turns a resolved set into catalog-ordered names for assertions.
func capabilityNames(set capabilitySet) []string {
	return set.list()
}

// listEqual compares two capability sets by value.
func listEqual(t *testing.T, label string, got capabilitySet, want capabilitySet) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%s = %v, want %v", label, capabilityNames(got), capabilityNames(want))
	}
}

// TestResolveCapabilitiesRecognisedDepartment pins step 3: a department whose name
// matches a built-in fragment answers with that fragment's narrow default set.
func TestResolveCapabilitiesRecognisedDepartment(t *testing.T) {
	name := "商务拓展部"
	set, source := resolveWorkbenchCapabilities(workbenchCapabilityFacts{
		Role:           "member",
		HasDepartment:  true,
		DepartmentName: &name,
	})
	if source != capabilitySourceDepartment {
		t.Fatalf("source = %q, want %q", source, capabilitySourceDepartment)
	}
	listEqual(t, "商务拓展部", set, newCapabilitySet(
		capCRMRead, capCRMWrite, capCRMAmount, capMediaRead, capBossRead,
	))
}

// TestResolveCapabilitiesUnknownDepartmentIsReadOnly pins step 3b: a department that
// exists but matches no fragment gets reads only — never the broad legacy fallback, and
// not a single capability that lets the member write.
func TestResolveCapabilitiesUnknownDepartmentIsReadOnly(t *testing.T) {
	name := "增长中台"
	set, source := resolveWorkbenchCapabilities(workbenchCapabilityFacts{
		Role:           "member",
		HasDepartment:  true,
		DepartmentName: &name,
	})
	if source != capabilitySourceDepartmentUnknown {
		t.Fatalf("source = %q, want %q", source, capabilitySourceDepartmentUnknown)
	}

	// The floor is explicit: read-only across the domains the catalog already has.
	listEqual(t, "unknown department", set, newCapabilitySet(
		capCRMRead, capMediaRead, capBossRead, capHRRead, capAdsRead,
	))

	// And it is genuinely read-only, checked against the catalog rather than the list
	// above so a future write capability cannot slip in through a superset.
	for _, capability := range set.list() {
		if !strings.HasSuffix(capability, ".read") {
			t.Fatalf("unknown department grants %q, which is not a read capability", capability)
		}
	}

	// The regression that started this: the legacy fallback is strictly broader, so
	// "unrecognised department" must never resolve to it.
	legacy := fallbackCapabilities()
	for capability := range legacy {
		if capability == capCRMWrite || capability == capCRMSettle || capability == capMediaPublish {
			if set.has(capability) {
				t.Fatalf("unknown department granted %q from the legacy fallback", capability)
			}
		}
	}
}

// TestResolveCapabilitiesUnreadableDepartmentIsUnknown is the same fail-closed rule for a
// dangling `department_id`: the member has a department, the row could not be read, and
// the answer must still be the read-only floor rather than the broad fallback.
func TestResolveCapabilitiesUnreadableDepartmentIsUnknown(t *testing.T) {
	set, source := resolveWorkbenchCapabilities(workbenchCapabilityFacts{
		Role:          "member",
		HasDepartment: true,
	})
	if source != capabilitySourceDepartmentUnknown {
		t.Fatalf("source = %q, want %q", source, capabilitySourceDepartmentUnknown)
	}
	listEqual(t, "unreadable department", set, unknownDepartmentCapabilities())
}

// TestResolveCapabilitiesNoDepartmentKeepsFallback pins step 4: only a member with no
// department at all keeps the pre-capability set.
func TestResolveCapabilitiesNoDepartmentKeepsFallback(t *testing.T) {
	set, source := resolveWorkbenchCapabilities(workbenchCapabilityFacts{Role: "member"})
	if source != capabilitySourceFallback {
		t.Fatalf("source = %q, want %q", source, capabilitySourceFallback)
	}
	listEqual(t, "no department", set, fallbackCapabilities())

	// The legacy set is the point of this branch: it still writes.
	for _, capability := range []string{capCRMWrite, capCRMSettle, capMediaWrite, capMediaPublish} {
		if !set.has(capability) {
			t.Fatalf("fallback is missing %q, the pre-capability behaviour must not shrink", capability)
		}
	}
}

// TestResolveCapabilitiesOwnerAndAdminGetEverything pins step 1 (and that it ignores
// every other fact, including a narrow department).
func TestResolveCapabilitiesOwnerAndAdminGetEverything(t *testing.T) {
	unknownDepartment := "增长中台"
	narrow := []string{capCRMRead}
	for _, role := range []string{"owner", "admin"} {
		set, source := resolveWorkbenchCapabilities(workbenchCapabilityFacts{
			Role:                 role,
			HasTemplate:          true,
			TemplateCapabilities: narrow,
			HasDepartment:        true,
			DepartmentName:       &unknownDepartment,
		})
		if source != capabilitySourceRole {
			t.Fatalf("%s source = %q, want %q", role, source, capabilitySourceRole)
		}
		listEqual(t, role, set, newCapabilitySet(workbenchCapabilityCatalog...))
	}
}

// TestResolveCapabilitiesTemplateWinsOverDepartment pins the order between steps 2 and 3,
// including a template saved with no capabilities: it still answers, and answers with
// nothing, rather than falling through to the department default.
func TestResolveCapabilitiesTemplateWinsOverDepartment(t *testing.T) {
	name := "销售部"
	set, source := resolveWorkbenchCapabilities(workbenchCapabilityFacts{
		Role:                 "member",
		HasTemplate:          true,
		TemplateCapabilities: []string{capCRMRead},
		HasDepartment:        true,
		DepartmentName:       &name,
	})
	if source != capabilitySourceTemplate {
		t.Fatalf("source = %q, want %q", source, capabilitySourceTemplate)
	}
	listEqual(t, "template", set, newCapabilitySet(capCRMRead))

	empty, source := resolveWorkbenchCapabilities(workbenchCapabilityFacts{
		Role:           "member",
		HasTemplate:    true,
		HasDepartment:  true,
		DepartmentName: &name,
	})
	if source != capabilitySourceTemplate {
		t.Fatalf("empty template source = %q, want %q", source, capabilitySourceTemplate)
	}
	listEqual(t, "empty template", empty, newCapabilitySet())
}

// TestDepartmentDefaultCapabilitiesMatching checks the matcher the resolver delegates to:
// case-insensitive substring, and no match is reported as such rather than as an empty
// department.
func TestDepartmentDefaultCapabilitiesMatching(t *testing.T) {
	set, ok := departmentDefaultCapabilities("HR 部门")
	if !ok || !set.has(capHRWrite) {
		t.Fatalf("HR 部门 = %v (ok=%v), want the hr default", capabilityNames(set), ok)
	}

	if _, ok := departmentDefaultCapabilities("增长中台"); ok {
		t.Fatalf("增长中台 matched a fragment, want no match")
	}
}
