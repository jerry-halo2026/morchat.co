// Copyright 2026 Multica. All rights reserved.

package daemon

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
	"github.com/jerry-halo2026/morchat.co/server/pkg/agent"
)

// dshProbeFixtureEnv turns this test binary into the fake `dsh` the DSH profile
// install test spawns. It is dispatched here rather than from a helper test
// because the probe runs the executable as `dsh --profile multica --probe`,
// with no `-test.run` argument, so a helper test would never be selected.
const dshProbeFixtureEnv = "MULTICA_TEST_DSH_PROBE_FIXTURE"

// dshProbeFixtureFrame is what a usable `multica` profile prints for `--probe`:
// the protocol version the backend drives, on the runtime it drives it for.
var dshProbeFixtureFrame = fmt.Sprintf(
	"{\"v\":1,\"type\":\"probe\",\"runtime\":\"dsh\",\"plugin_version\":\"test\",\"protocol_version\":%d}\n",
	agent.DshProtocolVersion,
)

// TestMain redirects the home environment variables to one scratch directory
// for the whole binary before any test runs. Config paths resolve through
// os.UserHomeDir — USERPROFILE on Windows, HOME elsewhere — while Hermes uses
// LOCALAPPDATA on Windows. Process-wide redirection isolates tests that forget
// their own redirect; per-test t.Setenv overrides still take precedence.
func TestMain(m *testing.M) {
	if testutil.RunPiCleanupFixture() {
		os.Exit(0)
	}
	if os.Getenv(dshProbeFixtureEnv) != "" {
		fmt.Print(dshProbeFixtureFrame)
		os.Exit(0)
	}
	for _, key := range []string{
		"MULTICA_AGENT_ID",
		"MULTICA_TASK_ID",
		"MULTICA_TOKEN",
		"MULTICA_DAEMON_PORT",
		"MULTICA_WORKSPACE_ID",
		"MULTICA_SERVER_URL",
		"MULTICA_TASK_CONFIG_ROOT",
	} {
		os.Unsetenv(key)
	}

	scratchHome, err := testutil.IsolateUserHome("multica-daemon-tests-home-")
	if err != nil {
		fmt.Fprintf(os.Stderr, "isolate internal/daemon test home: %v\n", err)
		os.Exit(1)
	}
	if err := os.Setenv("LOCALAPPDATA", filepath.Join(scratchHome, "AppData", "Local")); err != nil {
		fmt.Fprintf(os.Stderr, "isolate internal/daemon LOCALAPPDATA: %v\n", err)
		_ = os.RemoveAll(scratchHome)
		os.Exit(1)
	}

	code := m.Run()
	_ = os.RemoveAll(scratchHome)
	os.Exit(code)
}

var redirectTestHome = testutil.RedirectUserHome
