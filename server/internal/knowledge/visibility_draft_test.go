package knowledge

// The unapproved-draft half of the item rule, as a pure matrix.
//
// Search was fixed first (visCondIndexable in search.go): a draft reached no
// result but its author's and the people who may approve it. Reading the same
// item by id still answered the old ACL-only rule, so anyone in the workspace
// could open a draft whose id they had. These cases pin the by-id answer to the
// same four readers the approve route admits, and pin `active` to today's
// behaviour, which this file must not change.
//
// No database: the rule is a pure function, and the space facts it needs
// (SpaceOwnerID, DepartmentLeadID) are fields on ViewableItem, filled from the
// space row by Service.itemsVisibleToViewer before the rule runs.

import (
	"strings"
	"testing"
)

const (
	// visSpaceOwner owns the space the draft is filed in.
	visSpaceOwner = "aaaaaaaa-0000-0000-0000-000000000003"
	// visDeptLead leads the department that space is filed under.
	visDeptLead = "aaaaaaaa-0000-0000-0000-000000000004"
	// visStranger owns nothing and leads nothing: a plain member.
	visStranger = "aaaaaaaa-0000-0000-0000-000000000005"
	// visOtherSpaceOwner owns a different space, which must not help here.
	visOtherSpaceOwner = "aaaaaaaa-0000-0000-0000-000000000006"
)

// visViewerAs is a viewer of the fixture workspace with the given identity and
// workspace role. "" means "no membership row", which must behave like a plain
// member.
func visViewerAs(userID, role string) Viewer {
	return Viewer{WorkspaceID: visWS, UserID: userID, Role: role}
}

// draftFixture is the row every case starts from: an unapproved draft of
// visOwner in a space owned by visSpaceOwner, filed under a department led by
// visDeptLead.
func draftFixture() ViewableItem {
	return ViewableItem{
		ID:               "draft-item",
		WorkspaceID:      visWS,
		SpaceID:          "space",
		Title:            "A proposal nobody approved yet",
		Kind:             KindNote,
		ACLMode:          ACLModeWorkspace,
		Status:           StatusDraft,
		OwnerID:          visOwner,
		SpaceOwnerID:     visSpaceOwner,
		DepartmentLeadID: visDeptLead,
	}
}

// TestItemVisibleToUnapprovedDraft is the who-may-read-a-draft table.
func TestItemVisibleToUnapprovedDraft(t *testing.T) {
	base := draftFixture()

	approved := base
	approved.Status = StatusActive

	deprecated := base
	deprecated.Status = StatusDeprecated

	privateDraft := base
	privateDraft.ACLMode = ACLModePrivate

	projectDraft := base
	projectDraft.ACLMode = ACLModeProject
	projectDraft.ProjectID = visProject

	spaceWithoutOwner := base
	spaceWithoutOwner.SpaceOwnerID = ""
	spaceWithoutOwner.DepartmentLeadID = ""

	anotherWorkspace := base
	anotherWorkspace.WorkspaceID = visOtherWS

	cases := []struct {
		name   string
		item   ViewableItem
		viewer Viewer
		flags  VisibilityFlags
		want   bool
	}{
		// (a) the item's owner.
		{
			name:   "the author reads their own draft",
			item:   base,
			viewer: visViewerAs(visOwner, "member"),
			want:   true,
		},
		// (b) the space's owner.
		{
			name:   "the space owner reads a draft they did not write",
			item:   base,
			viewer: visViewerAs(visSpaceOwner, "member"),
			want:   true,
		},
		// (c) the lead of the department the space is filed under.
		{
			name:   "the department lead reads a draft they did not write",
			item:   base,
			viewer: visViewerAs(visDeptLead, "member"),
			want:   true,
		},
		// (d) a workspace owner/admin.
		{
			name:   "a workspace owner reads any draft",
			item:   base,
			viewer: visViewerAs(visStranger, "owner"),
			want:   true,
		},
		{
			name:   "a workspace admin reads any draft",
			item:   base,
			viewer: visViewerAs(visStranger, "admin"),
			want:   true,
		},
		// Everyone else: the leak this change closes.
		{
			name:   "a plain member does not read someone else's draft",
			item:   base,
			viewer: visViewerAs(visStranger, "member"),
			want:   false,
		},
		{
			name:   "a viewer with no membership row does not either",
			item:   base,
			viewer: visViewerAs(visStranger, ""),
			want:   false,
		},
		{
			name:   "another space's owner does not read it",
			item:   base,
			viewer: visViewerAs(visOtherSpaceOwner, "member"),
			want:   false,
		},
		{
			name: "a project member who may not approve does not read it",
			item: projectDraft,
			viewer: Viewer{WorkspaceID: visWS, UserID: visStranger, Role: "member",
				ProjectIDs: map[string]struct{}{visProject: {}}},
			want: false,
		},
		// The acl_mode branches still apply on top of the draft rule, exactly as
		// the retrieval predicate ANDs draftApproverCond with visCond.
		{
			name:   "a private draft stays its author's even for the space owner",
			item:   privateDraft,
			viewer: visViewerAs(visSpaceOwner, "member"),
			want:   false,
		},
		{
			name:   "a private draft's author still reads it",
			item:   privateDraft,
			viewer: visViewerAs(visOwner, "member"),
			want:   true,
		},
		{
			name:   "a draft in a space that names nobody fails closed",
			item:   spaceWithoutOwner,
			viewer: visViewerAs(visSpaceOwner, "member"),
			want:   false,
		},
		{
			name:   "the draft rule crosses no workspace boundary, not even for an owner",
			item:   anotherWorkspace,
			viewer: visViewerAs(visOwner, "owner"),
			want:   false,
		},
		{
			name:   "a deprecated draft is refused before anything else",
			item:   deprecated,
			viewer: visViewerAs(visSpaceOwner, "member"),
			flags:  VisibilityFlags{AdminVisibility: true},
			want:   false,
		},
		// `active` keeps today's answer, which is the whole compatibility
		// requirement of this change.
		{
			name:   "an approved item is readable by any member",
			item:   approved,
			viewer: visViewerAs(visStranger, "member"),
			want:   true,
		},
		{
			name:   "an approved item is readable by its author",
			item:   approved,
			viewer: visViewerAs(visOwner, "member"),
			want:   true,
		},
		{
			name:   "an approved item is readable by the space owner",
			item:   approved,
			viewer: visViewerAs(visSpaceOwner, "member"),
			want:   true,
		},
		{
			name:   "an approved item is readable by the department lead",
			item:   approved,
			viewer: visViewerAs(visDeptLead, "member"),
			want:   true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ItemVisibleTo(tc.item, tc.viewer, tc.flags); got != tc.want {
				t.Fatalf("ItemVisibleTo(status=%s acl=%s) = %v, want %v",
					tc.item.Status, tc.item.ACLMode, got, tc.want)
			}
		})
	}
}

// TestItemVisibleToActiveUnaffectedByTheDraftRule is the compatibility matrix for
// requirement 2: the same item, the same viewers, only the lifecycle state moves.
// An `active` item answers the acl_mode matrix above unchanged — every member,
// under every switch combination — which is what "the draft rule is a lifecycle
// upper bound, not an ACL change" has to mean.
func TestItemVisibleToActiveUnaffectedByTheDraftRule(t *testing.T) {
	item := draftFixture()
	item.Status = StatusActive
	item.ACLMode = ACLModeWorkspace

	// The four draft readers and the plain members they must not differ for.
	viewers := []struct {
		name   string
		viewer Viewer
	}{
		{"author", visViewerAs(visOwner, "member")},
		{"space owner", visViewerAs(visSpaceOwner, "member")},
		{"department lead", visViewerAs(visDeptLead, "member")},
		{"plain member", visViewerAs(visStranger, "member")},
		{"viewer with no membership row", visViewerAs(visStranger, "")},
		{"workspace owner", visViewerAs(visStranger, "owner")},
		{"workspace admin", visViewerAs(visStranger, "admin")},
	}
	for _, combo := range visFlags {
		t.Run(combo.name, func(t *testing.T) {
			for _, viewer := range viewers {
				if !ItemVisibleTo(item, viewer.viewer, combo.flags) {
					t.Errorf("active workspace item hidden from %s with flags %+v",
						viewer.name, combo.flags)
				}
			}
		})
	}
}

// TestDraftRuleMatchesTheRetrievalPredicate is the consistency guard between the
// two spellings of the same rule: the Go predicate above and the SQL predicate
// the retrieval index applies (draftApproverCond in search.go). Neither can drift
// without this failing, and the SQL half is read, not executed.
func TestDraftRuleMatchesTheRetrievalPredicate(t *testing.T) {
	for _, needed := range []string{
		"knowledge_spaces sp",
		"department d",
		"coalesce(sp.owner_id::text = $2, false)",
		"coalesce(d.lead_user_id::text = $2, false)",
		"m.role IN ('owner', 'admin')",
	} {
		if !strings.Contains(draftApproverCond, needed) {
			t.Errorf("draftApproverCond does not mention %q", needed)
		}
	}
	// And the rule itself has to admit exactly those four, so the test above
	// cannot pass against a predicate the Go side stopped matching.
	draft := draftFixture()
	for name, viewer := range map[string]Viewer{
		"owner":           visViewerAs(visOwner, "member"),
		"space owner":     visViewerAs(visSpaceOwner, "member"),
		"department lead": visViewerAs(visDeptLead, "member"),
		"workspace admin": visViewerAs(visStranger, "admin"),
	} {
		if !ItemVisibleTo(draft, viewer, VisibilityFlags{}) {
			t.Errorf("the draft rule does not admit the %s that the retrieval predicate names", name)
		}
	}
}
