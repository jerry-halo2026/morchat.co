package handler

// HR ledger tests (docs/engineering/WORKBENCH-API.md §10). Each domain proves the
// two properties every workbench ledger shares — a member writes only its own
// rows, and a successful write publishes the domain event — plus the rules that
// are specific to HR:
//
//   - "one person, one job" answers 409;
//   - "one interviewer, one slot" answers 409, and a moved slot counts as a
//     reschedule;
//   - `POST /candidates/{id}/hire` writes `hired_at` and the employee profile in
//     one transaction;
//   - `/overview` answers all four `hr.*` metrics with the contract's empty rule.

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

func createHrJobFixture(t *testing.T, ownerUserID, title string) HrJobResponse {
	t.Helper()
	body := map[string]any{"title": title, "headcount": 2}
	if ownerUserID != "" {
		body["owner_member_id"] = ownerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/hr/jobs", body, ownerUserID)
	created := testutil.Decode[HrJobResponse](t, testHandler.CreateHrJob, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_job WHERE id = $1`, created.ID) })
	return created
}

func createHrCandidateFixture(t *testing.T, jobID, name, phone string) HrCandidateResponse {
	t.Helper()
	req := workbenchRequest(t, "POST", "/api/workbench/hr/candidates", map[string]any{
		"job_id": jobID,
		"name":   name,
		"phone":  phone,
		"source": "referral",
	}, testUserID)
	created := testutil.Decode[HrCandidateResponse](t, testHandler.CreateHrCandidate, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_candidate WHERE id = $1`, created.ID) })
	return created
}

func createHrInterviewFixture(t *testing.T, candidateID, interviewerUserID, scheduledAt string, want int) HrInterviewResponse {
	t.Helper()
	body := map[string]any{
		"candidate_id": candidateID,
		"scheduled_at": scheduledAt,
		"mode":         "video",
		// Migration 702: the interviewer is recorded by name, because that person
		// is usually not a workspace member.
		"interviewer_name": "外部专家 王工",
	}
	if interviewerUserID != "" {
		body["interviewer_member_id"] = interviewerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/hr/interviews", body, testUserID)
	created := testutil.Decode[HrInterviewResponse](t, testHandler.CreateHrInterview, req, want)
	if want == http.StatusCreated {
		t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_interview WHERE id = $1`, created.ID) })
	}
	return created
}

// TestHrJobPermissionsAndEvent covers the requisition ledger: the defaults a
// create fills in, member-wide read, member-scoped write and the event.
func TestHrJobPermissionsAndEvent(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	job := createHrJobFixture(t, testUserID, "Backend engineer")

	if job.Status == nil || *job.Status != "draft" {
		t.Fatalf("new job status = %v, want draft", job.Status)
	}
	if job.Headcount != 2 {
		t.Fatalf("headcount = %d, want the sent value 2", job.Headcount)
	}
	if job.Currency == nil || *job.Currency != "CNY" {
		t.Fatalf("currency = %v, want CNY", job.Currency)
	}

	// Read: a plain member sees the owner's requisition.
	req := workbenchRequest(t, "GET", "/api/workbench/hr/jobs/"+job.ID, nil, memberUserID)
	req = withURLParam(req, "jobId", job.ID)
	got := testutil.Decode[HrJobResponse](t, testHandler.GetHrJob, req, http.StatusOK)
	if got.ID != job.ID {
		t.Fatalf("GetHrJob as member returned %s, want %s", got.ID, job.ID)
	}

	// Write: rejected for a row the member does not own.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/jobs/"+job.ID, map[string]any{
		"status": "open",
	}, memberUserID)
	req = withURLParam(req, "jobId", job.ID)
	testutil.Call(t, testHandler.UpdateHrJob, req).Want(http.StatusForbidden)

	events := collectWorkbenchEvents(t, eventHrJobChanged)
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/jobs/"+job.ID, map[string]any{
		"status":    "open",
		"headcount": 3,
	}, testUserID)
	req = withURLParam(req, "jobId", job.ID)
	updated := testutil.Decode[HrJobResponse](t, testHandler.UpdateHrJob, req, http.StatusOK)
	if updated.Status == nil || *updated.Status != "open" {
		t.Fatalf("status = %v, want open", updated.Status)
	}
	if updated.Headcount != 3 {
		t.Fatalf("headcount = %d, want 3", updated.Headcount)
	}
	if events.count(eventHrJobChanged) != 1 {
		t.Fatalf("hr_job:changed published %d times, want 1", events.count(eventHrJobChanged))
	}
	if payload := events.last(eventHrJobChanged); payload == nil || payload["id"] != job.ID {
		t.Fatalf("hr_job:changed payload = %v, want id %s", payload, job.ID)
	}

	// Delete: still gated, and a soft delete.
	req = workbenchRequest(t, "DELETE", "/api/workbench/hr/jobs/"+job.ID, nil, memberUserID)
	req = withURLParam(req, "jobId", job.ID)
	testutil.Call(t, testHandler.DeleteHrJob, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "DELETE", "/api/workbench/hr/jobs/"+job.ID, nil, testUserID)
	req = withURLParam(req, "jobId", job.ID)
	testutil.Call(t, testHandler.DeleteHrJob, req).Want(http.StatusNoContent)
}

// TestHrCandidateOnePerJob proves the "one person, one job" rule: the same name
// (case-insensitive) with the same phone is the same applicant in the same
// requisition, while the same person may apply to a different requisition.
func TestHrCandidateOnePerJob(t *testing.T) {
	job := createHrJobFixture(t, testUserID, "Funnel job")
	otherJob := createHrJobFixture(t, testUserID, "Another funnel job")
	candidate := createHrCandidateFixture(t, job.ID, "Alice Zhang", "+8613800000001")

	if candidate.Stage != "screening" {
		t.Fatalf("new candidate stage = %q, want screening", candidate.Stage)
	}
	if candidate.HiredAt != nil {
		t.Fatalf("new candidate hired_at = %v, want nil", candidate.HiredAt)
	}

	// Same job, same person with a different spelling of the name → 409.
	req := workbenchRequest(t, "POST", "/api/workbench/hr/candidates", map[string]any{
		"job_id": job.ID,
		"name":   "alice zhang",
		"phone":  "+8613800000001",
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrCandidate, req).Want(http.StatusConflict)

	// Same person, different requisition → allowed.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/candidates", map[string]any{
		"job_id": otherJob.ID,
		"name":   "Alice Zhang",
		"phone":  "+8613800000001",
	}, testUserID)
	second := testutil.Decode[HrCandidateResponse](t, testHandler.CreateHrCandidate, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_candidate WHERE id = $1`, second.ID) })

	// A member cannot move a candidate it does not own.
	memberUserID := workbenchTestMember(t)
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/candidates/"+candidate.ID, map[string]any{
		"stage": "interview",
	}, memberUserID)
	req = withURLParam(req, "candidateId", candidate.ID)
	testutil.Call(t, testHandler.UpdateHrCandidate, req).Want(http.StatusForbidden)

	// The owner's stage change publishes both the generic and the stage event.
	events := collectWorkbenchEvents(t, eventHrCandidateChanged, eventHrCandidateStageChanged)
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/candidates/"+candidate.ID, map[string]any{
		"stage": "interview",
	}, testUserID)
	req = withURLParam(req, "candidateId", candidate.ID)
	updated := testutil.Decode[HrCandidateResponse](t, testHandler.UpdateHrCandidate, req, http.StatusOK)
	if updated.Stage != "interview" {
		t.Fatalf("stage = %q, want interview", updated.Stage)
	}
	if events.count(eventHrCandidateStageChanged) != 1 {
		t.Fatalf("hr_candidate:stage_changed published %d times, want 1",
			events.count(eventHrCandidateStageChanged))
	}
	payload := events.last(eventHrCandidateStageChanged)
	if payload == nil || payload["from"] != "screening" || payload["to"] != "interview" {
		t.Fatalf("stage_changed payload = %v, want screening -> interview", payload)
	}
	if events.count(eventHrCandidateChanged) != 1 {
		t.Fatalf("hr_candidate:changed published %d times, want 1", events.count(eventHrCandidateChanged))
	}
}

// TestHrInterviewSlotIsExclusive covers the interviewer×slot rule and the
// reschedule counter it feeds.
func TestHrInterviewSlotIsExclusive(t *testing.T) {
	interviewerUserID := workbenchTestMember(t)
	job := createHrJobFixture(t, testUserID, "Interview slot job")
	first := createHrCandidateFixture(t, job.ID, "Candidate One", "+8613800000002")
	second := createHrCandidateFixture(t, job.ID, "Candidate Two", "+8613800000003")

	const slot = "2027-03-01T09:00:00Z"
	interview := createHrInterviewFixture(t, first.ID, interviewerUserID, slot, http.StatusCreated)
	if interview.RescheduledCount != 0 {
		t.Fatalf("new interview rescheduled_count = %d, want 0", interview.RescheduledCount)
	}

	// The same interviewer at the same instant is a double booking.
	req := workbenchRequest(t, "POST", "/api/workbench/hr/interviews", map[string]any{
		"candidate_id":          second.ID,
		"scheduled_at":          slot,
		"interviewer_member_id": interviewerUserID,
		"interviewer_name":      "Workbench Member",
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrInterview, req).Want(http.StatusConflict)

	// A different slot on the same interviewer is fine.
	moved := createHrInterviewFixture(t, second.ID, interviewerUserID, "2027-03-01T10:00:00Z", http.StatusCreated)

	// Moving onto the taken slot is a 409.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/interviews/"+moved.ID, map[string]any{
		"scheduled_at": slot,
	}, testUserID)
	req = withURLParam(req, "interviewId", moved.ID)
	testutil.Call(t, testHandler.UpdateHrInterview, req).Want(http.StatusConflict)

	// Moving to a free slot is a reschedule and counts as one.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/interviews/"+moved.ID, map[string]any{
		"scheduled_at": "2027-03-02T10:00:00Z",
	}, testUserID)
	req = withURLParam(req, "interviewId", moved.ID)
	rescheduled := testutil.Decode[HrInterviewResponse](t, testHandler.UpdateHrInterview, req, http.StatusOK)
	if rescheduled.RescheduledCount != 1 {
		t.Fatalf("rescheduled_count = %d, want 1", rescheduled.RescheduledCount)
	}

	// Patching anything else must not count as a reschedule.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/interviews/"+moved.ID, map[string]any{
		"status": "done",
	}, testUserID)
	req = withURLParam(req, "interviewId", moved.ID)
	sameSlot := testutil.Decode[HrInterviewResponse](t, testHandler.UpdateHrInterview, req, http.StatusOK)
	if sameSlot.RescheduledCount != 1 {
		t.Fatalf("rescheduled_count = %d after a status-only patch, want 1", sameSlot.RescheduledCount)
	}
}

// TestHrHireWritesEmployeeProfile is the transaction test: `hired_at` and the
// employee profile land together, and a second hire of the same member updates
// that profile instead of creating a second one.
func TestHrHireWritesEmployeeProfile(t *testing.T) {
	employeeUserID := workbenchTestMember(t)
	job := createHrJobFixture(t, testUserID, "Hire job")
	candidate := createHrCandidateFixture(t, job.ID, "Hire Candidate", "+8613800000004")

	events := collectWorkbenchEvents(t, eventHrCandidateChanged, eventHrCandidateStageChanged, eventHrEmployeeProfileChanged)

	req := workbenchRequest(t, "POST", "/api/workbench/hr/candidates/"+candidate.ID+"/hire", map[string]any{
		"member_id": employeeUserID,
		"job_title": "Backend engineer",
		"hire_date": "2026-11-01",
		"ability":   map[string]any{"skill": 8},
	}, testUserID)
	req = withURLParam(req, "candidateId", candidate.ID)
	hired := testutil.Decode[HrHireResponse](t, testHandler.HireHrCandidate, req, http.StatusOK)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_employee_profile WHERE id = $1`, hired.EmployeeProfile.ID) })

	if hired.Candidate.Stage != "hired" {
		t.Fatalf("stage = %q, want hired", hired.Candidate.Stage)
	}
	if hired.Candidate.HiredAt == nil {
		t.Fatal("hired_at is nil, want the hire timestamp")
	}
	if hired.EmployeeProfile.MemberID != employeeUserID {
		t.Fatalf("profile member_id = %s, want %s", hired.EmployeeProfile.MemberID, employeeUserID)
	}
	if hired.EmployeeProfile.HireDate == nil || *hired.EmployeeProfile.HireDate != "2026-11-01" {
		t.Fatalf("profile hire_date = %v, want 2026-11-01", hired.EmployeeProfile.HireDate)
	}
	var ability map[string]float64
	if err := json.Unmarshal(hired.EmployeeProfile.Ability, &ability); err != nil {
		t.Fatalf("decode ability: %v", err)
	}
	if ability["skill"] != 8 {
		t.Fatalf("ability = %v, want skill 8", ability)
	}

	if events.count(eventHrCandidateStageChanged) != 1 {
		t.Fatalf("hr_candidate:stage_changed published %d times, want 1",
			events.count(eventHrCandidateStageChanged))
	}
	if payload := events.last(eventHrCandidateStageChanged); payload == nil || payload["to"] != "hired" {
		t.Fatalf("stage_changed payload = %v, want to hired", payload)
	}
	if events.count(eventHrEmployeeProfileChanged) != 1 {
		t.Fatalf("hr_employee_profile:changed published %d times, want 1",
			events.count(eventHrEmployeeProfileChanged))
	}
	if payload := events.last(eventHrEmployeeProfileChanged); payload == nil ||
		payload["id"] != hired.EmployeeProfile.ID {
		t.Fatalf("hr_employee_profile:changed payload = %v, want id %s",
			payload, hired.EmployeeProfile.ID)
	}

	// Hiring again updates the same profile: one member, one profile.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/candidates/"+candidate.ID+"/hire", map[string]any{
		"member_id":    employeeUserID,
		"regular_date": "2027-02-01",
	}, testUserID)
	req = withURLParam(req, "candidateId", candidate.ID)
	again := testutil.Decode[HrHireResponse](t, testHandler.HireHrCandidate, req, http.StatusOK)
	if again.EmployeeProfile.ID != hired.EmployeeProfile.ID {
		t.Fatalf("second hire created profile %s, want the existing %s",
			again.EmployeeProfile.ID, hired.EmployeeProfile.ID)
	}
	if again.EmployeeProfile.RegularDate == nil || *again.EmployeeProfile.RegularDate != "2027-02-01" {
		t.Fatalf("regular_date = %v, want 2027-02-01", again.EmployeeProfile.RegularDate)
	}
	if again.EmployeeProfile.HireDate == nil || *again.EmployeeProfile.HireDate != "2026-11-01" {
		t.Fatalf("hire_date = %v after a re-hire, want the stored 2026-11-01", again.EmployeeProfile.HireDate)
	}
	if count := dbfx.Count(t, `SELECT count(*) FROM hr_employee_profile WHERE workspace_id = $1 AND member_id = $2`,
		testWorkspaceID, employeeUserID); count != 1 {
		t.Fatalf("employee profiles for the member = %d, want 1", count)
	}

	// The hire route needs a real member.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/candidates/"+candidate.ID+"/hire", map[string]any{
		"member_id": "00000000-0000-0000-0000-000000000000",
	}, testUserID)
	req = withURLParam(req, "candidateId", candidate.ID)
	testutil.Call(t, testHandler.HireHrCandidate, req).Want(http.StatusBadRequest)
}

// TestHrScorecardGateAndDuplicate covers the scorecard ledger: one card per
// reviewer per interview, the candidate-owner write gate, and the event.
func TestHrScorecardGateAndDuplicate(t *testing.T) {
	reviewerUserID := workbenchTestMember(t)
	job := createHrJobFixture(t, testUserID, "Scorecard job")
	candidate := createHrCandidateFixture(t, job.ID, "Scorecard Candidate", "+8613800000005")
	interview := createHrInterviewFixture(t, candidate.ID, reviewerUserID, "2027-04-01T09:00:00Z", http.StatusCreated)

	req := workbenchRequest(t, "POST", "/api/workbench/hr/scorecards", map[string]any{
		"interview_id":       interview.ID,
		"reviewer_member_id": reviewerUserID,
		"score_skill":        4,
		"score_experience":   5,
		"verdict":            "yes",
		"comment":            "Solid systems knowledge",
	}, testUserID)
	created := testutil.Decode[HrScorecardResponse](t, testHandler.CreateHrScorecard, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_scorecard WHERE id = $1`, created.ID) })
	if created.WeightedScore != nil {
		t.Fatalf("weighted_score = %v, want nil when the form did not send one", created.WeightedScore)
	}
	if created.Verdict == nil || *created.Verdict != "yes" {
		t.Fatalf("verdict = %v, want yes", created.Verdict)
	}

	// One card per reviewer per interview.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/scorecards", map[string]any{
		"interview_id":       interview.ID,
		"reviewer_member_id": reviewerUserID,
		"verdict":            "no",
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrScorecard, req).Want(http.StatusConflict)

	// A member cannot edit a card that hangs off someone else's candidate.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/scorecards/"+created.ID, map[string]any{
		"verdict": "strong_no",
	}, reviewerUserID)
	req = withURLParam(req, "scorecardId", created.ID)
	testutil.Call(t, testHandler.UpdateHrScorecard, req).Want(http.StatusForbidden)

	events := collectWorkbenchEvents(t, eventHrScorecardChanged)
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/scorecards/"+created.ID, map[string]any{
		"verdict":        "strong_yes",
		"weighted_score": 4.5,
	}, testUserID)
	req = withURLParam(req, "scorecardId", created.ID)
	updated := testutil.Decode[HrScorecardResponse](t, testHandler.UpdateHrScorecard, req, http.StatusOK)
	if updated.Verdict == nil || *updated.Verdict != "strong_yes" {
		t.Fatalf("verdict = %v, want strong_yes", updated.Verdict)
	}
	if updated.WeightedScore == nil || *updated.WeightedScore != 4.5 {
		t.Fatalf("weighted_score = %v, want 4.5", updated.WeightedScore)
	}
	if events.count(eventHrScorecardChanged) != 1 {
		t.Fatalf("hr_scorecard:changed published %d times, want 1", events.count(eventHrScorecardChanged))
	}

	// The list is interview-scoped and answers the page shape.
	req = workbenchRequest(t, "GET", "/api/workbench/hr/scorecards?interview_id="+interview.ID, nil, reviewerUserID)
	list := testutil.Decode[struct {
		Scorecards []HrScorecardResponse `json:"scorecards"`
		Total      int                   `json:"total"`
	}](t, testHandler.ListHrScorecards, req, http.StatusOK)
	if list.Total != 1 || len(list.Scorecards) != 1 {
		t.Fatalf("scorecards = %d (total %d), want 1", len(list.Scorecards), list.Total)
	}
}

// TestHrEmployeeProfilePermissionsAndEvent covers the profile ledger on its own
// route, without going through a hire.
func TestHrEmployeeProfilePermissionsAndEvent(t *testing.T) {
	// A plain member with no capability fixture: this case creates the profile that
	// fixture would otherwise have created, and the ledger allows one per member.
	employeeUserID := capabilityMember(t, "hr-profile", "", "")

	req := workbenchRequest(t, "POST", "/api/workbench/hr/employees", map[string]any{
		"member_id": employeeUserID,
		"job_title": "Designer",
		"grade":     "P5",
		"disc":      map[string]any{"d": 6, "i": 4},
	}, testUserID)
	profile := testutil.Decode[HrEmployeeProfileResponse](t, testHandler.CreateHrEmployee, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_employee_profile WHERE id = $1`, profile.ID) })
	if profile.MemberID != employeeUserID {
		t.Fatalf("member_id = %s, want %s", profile.MemberID, employeeUserID)
	}
	var disc map[string]float64
	if err := json.Unmarshal(profile.Disc, &disc); err != nil {
		t.Fatalf("decode disc: %v", err)
	}
	if disc["d"] != 6 {
		t.Fatalf("disc = %v, want d 6", disc)
	}

	// One profile per member.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/employees", map[string]any{
		"member_id": employeeUserID,
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrEmployee, req).Want(http.StatusConflict)

	// Not the owner → 403; owner → 200 and the event.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/employees/"+profile.ID, map[string]any{
		"job_title": "Senior designer",
	}, employeeUserID)
	req = withURLParam(req, "employeeId", profile.ID)
	testutil.Call(t, testHandler.UpdateHrEmployee, req).Want(http.StatusForbidden)

	events := collectWorkbenchEvents(t, eventHrEmployeeProfileChanged)
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/employees/"+profile.ID, map[string]any{
		"job_title": "Senior designer",
	}, testUserID)
	req = withURLParam(req, "employeeId", profile.ID)
	updated := testutil.Decode[HrEmployeeProfileResponse](t, testHandler.UpdateHrEmployee, req, http.StatusOK)
	if updated.JobTitle == nil || *updated.JobTitle != "Senior designer" {
		t.Fatalf("job_title = %v, want Senior designer", updated.JobTitle)
	}
	// An omitted field keeps its stored value, including the JSONB column.
	if updated.Grade == nil || *updated.Grade != "P5" {
		t.Fatalf("grade = %v, want the stored P5", updated.Grade)
	}
	if events.count(eventHrEmployeeProfileChanged) != 1 {
		t.Fatalf("hr_employee_profile:changed published %d times, want 1",
			events.count(eventHrEmployeeProfileChanged))
	}
	if payload := events.last(eventHrEmployeeProfileChanged); payload == nil || payload["id"] != profile.ID {
		t.Fatalf("hr_employee_profile:changed payload = %v, want id %s", payload, profile.ID)
	}

	req = workbenchRequest(t, "DELETE", "/api/workbench/hr/employees/"+profile.ID, nil, testUserID)
	req = withURLParam(req, "employeeId", profile.ID)
	testutil.Call(t, testHandler.DeleteHrEmployee, req).Want(http.StatusNoContent)
}

// TestHrOverviewMetrics proves `/overview` answers all four `hr.*` metrics with
// the contract's empty rule, and that an active candidate moves the count.
func TestHrOverviewMetrics(t *testing.T) {
	job := createHrJobFixture(t, testUserID, "Metrics job")
	createHrCandidateFixture(t, job.ID, "Metrics Candidate", "+8613800000006")

	req := workbenchRequest(t, "GET", "/api/workbench/overview", nil, testUserID)
	overview := testutil.Decode[WorkbenchOverviewResponse](t, testHandler.GetWorkbenchOverview, req, http.StatusOK)

	active, ok := overview.Metrics["hr.candidates.active"]
	if !ok {
		t.Fatal("hr.candidates.active missing from the overview")
	}
	if active.Value == nil || *active.Value < 1 {
		t.Fatalf("hr.candidates.active = %v, want at least the fixture candidate", active.Value)
	}
	if active.Empty != metricEmptyZero {
		t.Fatalf("hr.candidates.active empty = %q, want zero", active.Empty)
	}

	backlog, ok := overview.Metrics["hr.scorecard.backlog"]
	if !ok {
		t.Fatal("hr.scorecard.backlog missing from the overview")
	}
	if backlog.Value == nil {
		t.Fatal("hr.scorecard.backlog value is nil, want a count (zero is a real answer)")
	}
	if backlog.Empty != metricEmptyZero {
		t.Fatalf("hr.scorecard.backlog empty = %q, want zero", backlog.Empty)
	}

	for _, id := range []string{"hr.time_to_hire.median", "hr.interview.on_time_rate"} {
		entry, ok := overview.Metrics[id]
		if !ok {
			t.Fatalf("%s missing from the overview", id)
		}
		if entry.Empty != metricEmptyInsufficientData {
			t.Fatalf("%s empty = %q, want insufficient_data", id, entry.Empty)
		}
	}
}

// TestHrOverviewTimeToHireMedian proves the median is computed from a hire and
// round-trips as days, and that the scorecard backlog counts a past slot with no
// card.
func TestHrOverviewTimeToHireMedian(t *testing.T) {
	employeeUserID := workbenchTestMember(t)
	job := createHrJobFixture(t, testUserID, "Median job")
	candidate := createHrCandidateFixture(t, job.ID, "Median Candidate", "+8613800000007")

	// A held interview in the past with no scorecard is the backlog fixture.
	pastInterview := createHrInterviewFixture(t, candidate.ID, employeeUserID, "2026-01-05T09:00:00Z", http.StatusCreated)

	req := workbenchRequest(t, "POST", "/api/workbench/hr/candidates/"+candidate.ID+"/hire", map[string]any{
		"member_id": employeeUserID,
	}, testUserID)
	req = withURLParam(req, "candidateId", candidate.ID)
	hired := testutil.Decode[HrHireResponse](t, testHandler.HireHrCandidate, req, http.StatusOK)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_employee_profile WHERE id = $1`, hired.EmployeeProfile.ID) })

	req = workbenchRequest(t, "GET", "/api/workbench/overview", nil, testUserID)
	overview := testutil.Decode[WorkbenchOverviewResponse](t, testHandler.GetWorkbenchOverview, req, http.StatusOK)

	median, ok := overview.Metrics["hr.time_to_hire.median"]
	if !ok {
		t.Fatal("hr.time_to_hire.median missing from the overview")
	}
	if median.SampleCount < 1 {
		t.Fatalf("hr.time_to_hire.median sample_count = %d, want the hire we just made",
			median.SampleCount)
	}
	if median.Value == nil || *median.Value < 0 {
		t.Fatalf("hr.time_to_hire.median = %v, want a non-negative number of days", median.Value)
	}

	backlog := overview.Metrics["hr.scorecard.backlog"]
	if backlog.Value == nil || *backlog.Value < 1 {
		t.Fatalf("hr.scorecard.backlog = %v, want at least the past interview %s",
			backlog.Value, pastInterview.ID)
	}
}

// TestHrInterviewStatusVocabulary pins the two vocabularies the handlers validate
// so a typo answers 400 instead of reaching the CHECK constraint as a 500.
func TestHrInterviewStatusVocabulary(t *testing.T) {
	job := createHrJobFixture(t, testUserID, "Vocabulary job")
	candidate := createHrCandidateFixture(t, job.ID, "Vocabulary Candidate", "+8613800000008")

	req := workbenchRequest(t, "POST", "/api/workbench/hr/interviews", map[string]any{
		"candidate_id": candidate.ID,
		"scheduled_at": "2027-05-01T09:00:00Z",
		"status":       "rescheduled",
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrInterview, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "POST", "/api/workbench/hr/candidates", map[string]any{
		"job_id": job.ID,
		"name":   "Vocabulary Candidate Two",
		"stage":  "hired_elsewhere",
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrCandidate, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "POST", "/api/workbench/hr/candidates/"+candidate.ID+"/hire", nil, testUserID)
	req = withURLParam(req, "candidateId", candidate.ID)
	testutil.Call(t, testHandler.HireHrCandidate, req).Want(http.StatusBadRequest)
}

// TestHrInterviewerNameRequired covers migration 702: the interviewer is usually
// someone outside the workspace, so the round records their name. A create with
// neither a name nor a member is a 400, the name comes back on reads, and a body
// that carries only the member id has the name filled in from that member.
func TestHrInterviewerNameRequired(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	job := createHrJobFixture(t, testUserID, "Interviewer name job")
	candidate := createHrCandidateFixture(t, job.ID, "Interviewer Name Candidate", "+8613800000010")

	// Nothing says who runs the round: `interviewer_name` is NOT NULL, so this is
	// the one field a scheduled interview cannot leave empty.
	req := workbenchRequest(t, "POST", "/api/workbench/hr/interviews", map[string]any{
		"candidate_id": candidate.ID,
		"scheduled_at": "2027-06-01T09:00:00Z",
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrInterview, req).Want(http.StatusBadRequest)

	// An external interviewer, recorded by name.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/interviews", map[string]any{
		"candidate_id":     candidate.ID,
		"scheduled_at":     "2027-06-01T10:00:00Z",
		"interviewer_name": "  外部专家 李工  ",
	}, testUserID)
	external := testutil.Decode[HrInterviewResponse](t, testHandler.CreateHrInterview, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_interview WHERE id = $1`, external.ID) })
	if external.InterviewerName != "外部专家 李工" {
		t.Fatalf("interviewer_name = %q, want the trimmed external name", external.InterviewerName)
	}
	if external.InterviewerMemberID != nil {
		t.Fatalf("interviewer_member_id = %v, want nil for an external interviewer", external.InterviewerMemberID)
	}

	// The list answers the same name, which is what the board renders.
	req = workbenchRequest(t, "GET", "/api/workbench/hr/interviews?candidate_id="+candidate.ID, nil, testUserID)
	var page struct {
		Interviews []HrInterviewResponse `json:"interviews"`
		Total      int                   `json:"total"`
	}
	testutil.Call(t, testHandler.ListHrInterviews, req).Want(http.StatusOK).JSON(&page)
	found := false
	for _, row := range page.Interviews {
		if row.ID == external.ID {
			found = true
			if row.InterviewerName != "外部专家 李工" {
				t.Fatalf("listed interviewer_name = %q, want 外部专家 李工", row.InterviewerName)
			}
		}
	}
	if !found {
		t.Fatalf("interview %s missing from the candidate's list", external.ID)
	}

	// A body with only the member id: the name falls back to that member's name.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/interviews", map[string]any{
		"candidate_id":          candidate.ID,
		"scheduled_at":          "2027-06-02T10:00:00Z",
		"interviewer_member_id": memberUserID,
	}, testUserID)
	internal := testutil.Decode[HrInterviewResponse](t, testHandler.CreateHrInterview, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_interview WHERE id = $1`, internal.ID) })
	if internal.InterviewerMemberID == nil || *internal.InterviewerMemberID != memberUserID {
		t.Fatalf("interviewer_member_id = %v, want %s", internal.InterviewerMemberID, memberUserID)
	}
	if internal.InterviewerName != "Workbench Member" {
		t.Fatalf("interviewer_name = %q, want the member's user name", internal.InterviewerName)
	}

	// A status-only PATCH keeps the recorded name instead of blanking it.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/interviews/"+external.ID, map[string]any{
		"status": "done",
	}, testUserID)
	req = withURLParam(req, "interviewId", external.ID)
	patched := testutil.Decode[HrInterviewResponse](t, testHandler.UpdateHrInterview, req, http.StatusOK)
	if patched.InterviewerName != "外部专家 李工" {
		t.Fatalf("interviewer_name = %q after a status-only patch, want the stored name",
			patched.InterviewerName)
	}
}

// TestHrScorecardDimensions covers migration 703: `dimensions` round-trips, the
// server fills `weighted_score` with the dimension mean when the client sends
// only the map, and a score outside the 0-5 scale is a 400.
func TestHrScorecardDimensions(t *testing.T) {
	reviewerUserID := workbenchTestMember(t)
	job := createHrJobFixture(t, testUserID, "Dimensions job")
	candidate := createHrCandidateFixture(t, job.ID, "Dimensions Candidate", "+8613800000011")
	interview := createHrInterviewFixture(t, candidate.ID, reviewerUserID, "2027-07-01T09:00:00Z", http.StatusCreated)

	req := workbenchRequest(t, "POST", "/api/workbench/hr/scorecards", map[string]any{
		"interview_id":       interview.ID,
		"reviewer_member_id": reviewerUserID,
		"dimensions":         map[string]any{"system_design": 4, "communication": 5},
		"verdict":            "yes",
	}, testUserID)
	created := testutil.Decode[HrScorecardResponse](t, testHandler.CreateHrScorecard, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_scorecard WHERE id = $1`, created.ID) })

	if len(created.Dimensions) != 2 ||
		created.Dimensions["system_design"] != 4 ||
		created.Dimensions["communication"] != 5 {
		t.Fatalf("dimensions = %v, want the two scores the body sent", created.Dimensions)
	}
	// No total sent: the server fills the mean of 4 and 5.
	if created.WeightedScore == nil || *created.WeightedScore != 4.5 {
		t.Fatalf("weighted_score = %v, want the dimension mean 4.5", created.WeightedScore)
	}
	// The legacy columns stay empty: the map is the current shape.
	if created.ScoreSkill != nil {
		t.Fatalf("score_skill = %v, want nil when only dimensions were sent", created.ScoreSkill)
	}

	// A PATCH that replaces the map recomputes the mean, and an explicit total wins.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/scorecards/"+created.ID, map[string]any{
		"dimensions": map[string]any{"system_design": 3, "communication": 3, "culture": 3},
	}, testUserID)
	req = withURLParam(req, "scorecardId", created.ID)
	patched := testutil.Decode[HrScorecardResponse](t, testHandler.UpdateHrScorecard, req, http.StatusOK)
	if len(patched.Dimensions) != 3 || patched.Dimensions["culture"] != 3 {
		t.Fatalf("dimensions = %v after the patch, want the replaced map", patched.Dimensions)
	}
	if patched.WeightedScore == nil || *patched.WeightedScore != 3 {
		t.Fatalf("weighted_score = %v, want the new mean 3", patched.WeightedScore)
	}

	// The 0-5 scale is the contract; a 7 would render off the end of the bar.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/scorecards/"+created.ID, map[string]any{
		"dimensions": map[string]any{"system_design": 7},
	}, testUserID)
	req = withURLParam(req, "scorecardId", created.ID)
	testutil.Call(t, testHandler.UpdateHrScorecard, req).Want(http.StatusBadRequest)

	// An empty key cannot be labelled in the UI either.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/scorecards/"+created.ID, map[string]any{
		"dimensions": map[string]any{"  ": 3},
	}, testUserID)
	req = withURLParam(req, "scorecardId", created.ID)
	testutil.Call(t, testHandler.UpdateHrScorecard, req).Want(http.StatusBadRequest)
}

// TestHrJobScoringFields covers migration 704: the requisition keeps the
// scoring inputs, the long description and the urgent flag, and a PATCH that
// omits them keeps the stored values.
func TestHrJobScoringFields(t *testing.T) {
	req := workbenchRequest(t, "POST", "/api/workbench/hr/jobs", map[string]any{
		"title":    "Scoring job",
		"edu":      "本科",
		"years":    "3-5 年",
		"city":     "上海",
		"jd":       "负责招聘链路的后端设计与交付",
		"urgent":   true,
		"keywords": []string{"Go", " 分布式 ", ""},
	}, testUserID)
	job := testutil.Decode[HrJobResponse](t, testHandler.CreateHrJob, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_job WHERE id = $1`, job.ID) })

	if job.Edu == nil || *job.Edu != "本科" {
		t.Fatalf("edu = %v, want 本科", job.Edu)
	}
	if job.Years == nil || *job.Years != "3-5 年" {
		t.Fatalf("years = %v, want 3-5 年", job.Years)
	}
	if job.City == nil || *job.City != "上海" {
		t.Fatalf("city = %v, want 上海", job.City)
	}
	if job.Jd == nil || *job.Jd != "负责招聘链路的后端设计与交付" {
		t.Fatalf("jd = %v, want the sent description", job.Jd)
	}
	if !job.Urgent {
		t.Fatal("urgent = false, want true")
	}
	// Keywords are trimmed and blanks dropped: an empty tag would filter nothing.
	if len(job.Keywords) != 2 || job.Keywords[0] != "Go" || job.Keywords[1] != "分布式" {
		t.Fatalf("keywords = %v, want [Go 分布式]", job.Keywords)
	}

	// Omitting the new fields keeps them; an empty list is a deliberate clear.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/jobs/"+job.ID, map[string]any{
		"status": "open",
	}, testUserID)
	req = withURLParam(req, "jobId", job.ID)
	patched := testutil.Decode[HrJobResponse](t, testHandler.UpdateHrJob, req, http.StatusOK)
	if patched.Urgent != true || patched.Edu == nil || *patched.Edu != "本科" {
		t.Fatalf("patched job = %+v, want the stored edu and urgent", patched)
	}
	if len(patched.Keywords) != 2 {
		t.Fatalf("keywords = %v after a status-only patch, want the stored list", patched.Keywords)
	}

	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/jobs/"+job.ID, map[string]any{
		"keywords": []string{},
		"urgent":   false,
	}, testUserID)
	req = withURLParam(req, "jobId", job.ID)
	cleared := testutil.Decode[HrJobResponse](t, testHandler.UpdateHrJob, req, http.StatusOK)
	if len(cleared.Keywords) != 0 {
		t.Fatalf("keywords = %v, want the cleared list", cleared.Keywords)
	}
	if cleared.Urgent {
		t.Fatal("urgent = true, want the cleared false")
	}
	// The list endpoint returns the same fields, since the board renders them.
	req = workbenchRequest(t, "GET", "/api/workbench/hr/jobs", nil, testUserID)
	var page struct {
		Jobs  []HrJobResponse `json:"jobs"`
		Total int             `json:"total"`
	}
	testutil.Call(t, testHandler.ListHrJobs, req).Want(http.StatusOK).JSON(&page)
	found := false
	for _, row := range page.Jobs {
		if row.ID == job.ID {
			found = true
			if row.Jd == nil || *row.Jd != "负责招聘链路的后端设计与交付" {
				t.Fatalf("listed jd = %v, want the stored description", row.Jd)
			}
		}
	}
	if !found {
		t.Fatalf("job %s missing from the list", job.ID)
	}
}

// TestHrCandidateProfileFields covers migration 705: the three columns the match
// score reads on the candidate side survive a create, a read and a PATCH, and a
// PATCH that omits them keeps the stored values.
func TestHrCandidateProfileFields(t *testing.T) {
	job := createHrJobFixture(t, testUserID, "Profile fields job")
	req := workbenchRequest(t, "POST", "/api/workbench/hr/candidates", map[string]any{
		"job_id":           job.ID,
		"name":             "林伟",
		"edu":              "本科",
		"years_experience": 3.5,
		"resume_text":      "三年短视频剪辑经验，熟悉 Premiere 与达芬奇调色。",
	}, testUserID)
	created := testutil.Decode[HrCandidateResponse](t, testHandler.CreateHrCandidate, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_candidate WHERE id = $1`, created.ID) })

	if created.Edu == nil || *created.Edu != "本科" {
		t.Fatalf("edu = %v, want 本科", created.Edu)
	}
	// NUMERIC(4,1): one decimal survives, so "3.5 年" is not rounded to 4.
	if created.YearsExperience == nil || *created.YearsExperience != 3.5 {
		t.Fatalf("years_experience = %v, want 3.5", created.YearsExperience)
	}
	if created.ResumeText == nil || *created.ResumeText != "三年短视频剪辑经验，熟悉 Premiere 与达芬奇调色。" {
		t.Fatalf("resume_text = %v, want the sent body", created.ResumeText)
	}

	// The single-row read returns the same three values, not the create's echo.
	req = workbenchRequest(t, "GET", "/api/workbench/hr/candidates/"+created.ID, nil, testUserID)
	req = withURLParam(req, "candidateId", created.ID)
	got := testutil.Decode[HrCandidateResponse](t, testHandler.GetHrCandidate, req, http.StatusOK)
	if got.Edu == nil || *got.Edu != "本科" ||
		got.YearsExperience == nil || *got.YearsExperience != 3.5 ||
		got.ResumeText == nil || *got.ResumeText != *created.ResumeText {
		t.Fatalf("GetHrCandidate profile = %+v, want the stored trio", got)
	}

	// A PATCH that names only the stage must not blank the profile.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/candidates/"+created.ID, map[string]any{
		"stage": "interview",
	}, testUserID)
	req = withURLParam(req, "candidateId", created.ID)
	patched := testutil.Decode[HrCandidateResponse](t, testHandler.UpdateHrCandidate, req, http.StatusOK)
	if patched.Edu == nil || *patched.Edu != "本科" ||
		patched.YearsExperience == nil || *patched.YearsExperience != 3.5 ||
		patched.ResumeText == nil || *patched.ResumeText != *created.ResumeText {
		t.Fatalf("patched candidate = %+v, want the stored trio kept", patched)
	}

	// A PATCH that names them replaces them.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/candidates/"+created.ID, map[string]any{
		"edu":              "硕士",
		"years_experience": 5,
		"resume_text":      "五年经验，带过三人小组。",
	}, testUserID)
	req = withURLParam(req, "candidateId", created.ID)
	replaced := testutil.Decode[HrCandidateResponse](t, testHandler.UpdateHrCandidate, req, http.StatusOK)
	if replaced.Edu == nil || *replaced.Edu != "硕士" ||
		replaced.YearsExperience == nil || *replaced.YearsExperience != 5 ||
		replaced.ResumeText == nil || *replaced.ResumeText != "五年经验，带过三人小组。" {
		t.Fatalf("replaced candidate = %+v, want the new trio", replaced)
	}

	// An empty body value clears the field to NULL, so "no résumé" stays
	// distinguishable from a résumé that is empty.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/candidates/"+created.ID, map[string]any{
		"resume_text": "",
	}, testUserID)
	req = withURLParam(req, "candidateId", created.ID)
	cleared := testutil.Decode[HrCandidateResponse](t, testHandler.UpdateHrCandidate, req, http.StatusOK)
	if cleared.ResumeText != nil {
		t.Fatalf("resume_text = %v after clearing, want nil", cleared.ResumeText)
	}
}

// TestHrCandidateProfileBounds proves the two bounds: an experience outside a
// working lifetime is a 400, and so is a résumé body past the column's limit.
func TestHrCandidateProfileBounds(t *testing.T) {
	job := createHrJobFixture(t, testUserID, "Profile bounds job")
	base := map[string]any{"job_id": job.ID, "name": "张某"}

	for _, years := range []float64{-1, 60.5, 200} {
		body := map[string]any{"years_experience": years}
		for key, value := range base {
			body[key] = value
		}
		req := workbenchRequest(t, "POST", "/api/workbench/hr/candidates", body, testUserID)
		testutil.Call(t, testHandler.CreateHrCandidate, req).Want(http.StatusBadRequest)
	}

	// The bounds themselves are inclusive: 0 years is a fresh graduate and 60 is
	// a lifetime, and both are facts the score can use.
	for _, years := range []float64{0, 60} {
		body := map[string]any{"years_experience": years}
		for key, value := range base {
			body[key] = value
		}
		req := workbenchRequest(t, "POST", "/api/workbench/hr/candidates", body, testUserID)
		created := testutil.Decode[HrCandidateResponse](t, testHandler.CreateHrCandidate, req, http.StatusCreated)
		dbfx.Exec(t, `DELETE FROM hr_candidate WHERE id = $1`, created.ID)
		if created.YearsExperience == nil || *created.YearsExperience != years {
			t.Fatalf("years_experience = %v, want the sent %v", created.YearsExperience, years)
		}
	}

	// 20000 characters is one long document; 20001 is a mis-targeted paste.
	overlong := map[string]any{"resume_text": strings.Repeat("简", 20001)}
	for key, value := range base {
		overlong[key] = value
	}
	req := workbenchRequest(t, "POST", "/api/workbench/hr/candidates", overlong, testUserID)
	testutil.Call(t, testHandler.CreateHrCandidate, req).Want(http.StatusBadRequest)

	atLimit := map[string]any{"resume_text": strings.Repeat("简", 20000)}
	for key, value := range base {
		atLimit[key] = value
	}
	req = workbenchRequest(t, "POST", "/api/workbench/hr/candidates", atLimit, testUserID)
	created := testutil.Decode[HrCandidateResponse](t, testHandler.CreateHrCandidate, req, http.StatusCreated)
	dbfx.Exec(t, `DELETE FROM hr_candidate WHERE id = $1`, created.ID)

	// The same bounds gate an update, not only a create.
	existing := createHrCandidateFixture(t, job.ID, "李某", "+8613800000009")
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/candidates/"+existing.ID, map[string]any{
		"years_experience": 75,
	}, testUserID)
	req = withURLParam(req, "candidateId", existing.ID)
	testutil.Call(t, testHandler.UpdateHrCandidate, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/candidates/"+existing.ID, map[string]any{
		"resume_text": strings.Repeat("简", 20001),
	}, testUserID)
	req = withURLParam(req, "candidateId", existing.ID)
	testutil.Call(t, testHandler.UpdateHrCandidate, req).Want(http.StatusBadRequest)
}
