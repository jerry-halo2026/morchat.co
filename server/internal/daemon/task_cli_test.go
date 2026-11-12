package daemon

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func stubTaskCLI(t *testing.T, path string) {
	t.Helper()
	original := resolveSelfExecutable
	t.Cleanup(func() { resolveSelfExecutable = original })
	resolveSelfExecutable = func() (string, error) { return path, nil }
}

func TestConfigureTaskCLIEnvironment(t *testing.T) {
	cliPath := filepath.Join(t.TempDir(), "Desktop App", "multica")
	stubTaskCLI(t, cliPath)
	inheritedPath := filepath.Join(t.TempDir(), "old-cli")
	t.Setenv("PATH", inheritedPath)
	env := map[string]string{"MULTICA_TOKEN": "mat_fixture"}
	if err := configureTaskCLIEnvironment(env); err != nil {
		t.Fatal(err)
	}
	if env["MULTICA_CLI_PATH"] != cliPath {
		t.Fatalf("CLI path = %q, want daemon executable %q", env["MULTICA_CLI_PATH"], cliPath)
	}
	wantPath := filepath.Dir(cliPath) + string(os.PathListSeparator) + inheritedPath
	if env["PATH"] != wantPath {
		t.Fatalf("PATH = %q, want %q", env["PATH"], wantPath)
	}
	layerCustomEnvAndHermesHome(env, map[string]string{
		"MULTICA_CLI_PATH": "other-cli",
		"multica_cli_path": "other-cli",
		"PATH":             "other-path",
	}, "", nil)
	if env["MULTICA_CLI_PATH"] != cliPath || env["PATH"] != wantPath || env["MULTICA_TOKEN"] != "mat_fixture" {
		t.Fatal("custom environment replaced the daemon CLI or task credential")
	}
	if _, ok := env["multica_cli_path"]; ok {
		t.Fatal("custom environment introduced a case alias for the daemon CLI")
	}
}

// TestConfigureTaskCLIEnvironmentPrependsBundledTools covers the toolchain the
// desktop ships: a python or git directory it unpacked goes in front of PATH so a
// skill running `python x.py` finds the bundled interpreter, and the variable
// travels with the task so a skill can name it explicitly.
func TestConfigureTaskCLIEnvironmentPrependsBundledTools(t *testing.T) {
	cliPath := filepath.Join(t.TempDir(), "Desktop App", "multica")
	stubTaskCLI(t, cliPath)

	pythonHome := t.TempDir()
	if err := os.MkdirAll(filepath.Join(pythonHome, "Scripts"), 0o755); err != nil {
		t.Fatal(err)
	}
	gitHome := t.TempDir()
	if err := os.MkdirAll(filepath.Join(gitHome, "cmd"), 0o755); err != nil {
		t.Fatal(err)
	}
	inheritedPath := filepath.Join(t.TempDir(), "system")
	t.Setenv("PATH", inheritedPath)
	t.Setenv(pythonHomeEnv, pythonHome)
	t.Setenv(gitHomeEnv, gitHome)

	env := map[string]string{}
	if err := configureTaskCLIEnvironment(env); err != nil {
		t.Fatal(err)
	}

	if env[pythonHomeEnv] != pythonHome || env[gitHomeEnv] != gitHome {
		t.Fatalf("tool homes not carried into the task: %#v", env)
	}
	want := []string{
		filepath.Dir(cliPath),
		pythonHome,
		gitHome,
		filepath.Join(gitHome, "cmd"),
		inheritedPath,
	}
	if got := env["PATH"]; got != strings.Join(want, string(os.PathListSeparator)) {
		t.Fatalf("PATH = %q, want %q", got, strings.Join(want, string(os.PathListSeparator)))
	}
}

// TestConfigureTaskCLIEnvironmentSkipsMissingTools keeps a stale pointer from
// emptying PATH: an unset or nonexistent directory contributes nothing.
func TestConfigureTaskCLIEnvironmentSkipsMissingTools(t *testing.T) {
	cliPath := filepath.Join(t.TempDir(), "multica")
	stubTaskCLI(t, cliPath)
	inheritedPath := filepath.Join(t.TempDir(), "system")
	t.Setenv("PATH", inheritedPath)
	t.Setenv(pythonHomeEnv, filepath.Join(t.TempDir(), "gone"))
	t.Setenv(gitHomeEnv, "")

	env := map[string]string{}
	if err := configureTaskCLIEnvironment(env); err != nil {
		t.Fatal(err)
	}
	want := filepath.Dir(cliPath) + string(os.PathListSeparator) + inheritedPath
	if got := env["PATH"]; got != want {
		t.Fatalf("PATH = %q, want %q", got, want)
	}
	if _, ok := env[pythonHomeEnv]; ok {
		t.Fatal("a missing tool directory was injected into the task")
	}
}
func TestConfigureTaskCLIEnvironmentResolutionFailure(t *testing.T) {
	original := resolveSelfExecutable
	t.Cleanup(func() { resolveSelfExecutable = original })
	wantErr := errors.New("executable unavailable")
	resolveSelfExecutable = func() (string, error) { return "", wantErr }
	env := map[string]string{}
	if err := configureTaskCLIEnvironment(env); !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want executable resolution failure", err)
	}
	if len(env) != 0 {
		t.Fatalf("failed resolution changed the environment: %v", env)
	}
}

func TestTaskCLICommandSurvivesShellPathOverride(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX shell regression; PowerShell command syntax is covered by runtime brief tests")
	}
	root := t.TempDir()
	binDir := filepath.Join(root, "Desktop App ' $ ` ;")
	staleDir := filepath.Join(root, "homebrew")
	for _, dir := range []string{binDir, staleDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	cliPath := filepath.Join(binDir, "multica")
	writeTestExecutable(t, cliPath, []byte("#!/bin/sh\nprintf '%s\\n' \"$@\"\n"))
	writeTestExecutable(t, filepath.Join(staleDir, "multica"), []byte("#!/bin/sh\nprintf '%s\\n' 'unknown flag: --assignee-picker' >&2\nexit 2\n"))
	stubTaskCLI(t, cliPath)
	env := map[string]string{}
	if err := configureTaskCLIEnvironment(env); err != nil {
		t.Fatal(err)
	}
	// A shell startup file can put a stale installation ahead of the PATH
	// that the daemon supplied to the provider process.
	profile := filepath.Join(root, "profile")
	if err := os.WriteFile(profile, []byte("PATH=\"$TASK_TEST_STALE_BIN\"\nexport PATH\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, command, want string
		wantErr             bool
	}{
		{"PATH lookup uses stale CLI", `multica`, "unknown flag: --assignee-picker\n", true},
		{"explicit CLI supports picker", `"$MULTICA_CLI_PATH"`, "issue\ncreate\n--title\nA quoted title\n--assignee-picker\n", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, "/bin/sh", "-c", ". \"$TASK_TEST_PROFILE\"\n"+tc.command+` issue create --title "A quoted title" --assignee-picker`)
			cmd.Env = append(os.Environ(), "TASK_TEST_PROFILE="+profile, "TASK_TEST_STALE_BIN="+staleDir)
			for key, value := range env {
				cmd.Env = append(cmd.Env, key+"="+value)
			}
			out, err := cmd.CombinedOutput()
			if (err != nil) != tc.wantErr || string(out) != tc.want {
				t.Fatalf("command error = %v, output = %q; want error=%v, output=%q", err, out, tc.wantErr, tc.want)
			}
		})
	}
}
