package daemon

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Runtime tools the desktop ships with, so an agent can run a task on a machine
// that has neither python nor git installed. The desktop passes the directories it
// unpacked; the daemon only puts them in front of the task's PATH.
//
// Nothing here touches the user's own setup: no system PATH is rewritten, no
// registry, no ~/.dsh, ~/.codex or ~/.claude. The values live in the environment
// of the agent subprocess this daemon is about to start, which dies with the task.
const (
	pythonHomeEnv = "MULTICA_PYTHON_HOME"
	gitHomeEnv    = "MULTICA_GIT_HOME"
)

func configureTaskCLIEnvironment(env map[string]string) error {
	selfBin, err := resolveSelfExecutable()
	if err != nil {
		return fmt.Errorf("resolve task Multica CLI: %w", err)
	}
	// Login shell startup files can reorder PATH after the provider starts.
	// Keep an explicit executable for the commands in the runtime brief.
	env["MULTICA_CLI_PATH"] = selfBin

	// Directories are prepended in the order they are declared, so a bundled tool
	// wins over a system one with the same name. A missing directory is skipped
	// rather than injected: an empty PATH entry means "." on some shells.
	dirs := []string{filepath.Dir(selfBin)}
	for _, home := range []string{pythonHomeEnv, gitHomeEnv} {
		value := strings.TrimSpace(os.Getenv(home))
		if value == "" {
			continue
		}
		if info, statErr := os.Stat(value); statErr != nil || !info.IsDir() {
			continue
		}
		// The variable travels to the task too: a skill that shells out to python
		// or git can name the interpreter explicitly instead of trusting PATH.
		env[home] = value
		dirs = append(dirs, value)
	}
	if gitDir := filepath.Join(strings.TrimSpace(os.Getenv(gitHomeEnv)), "cmd"); gitDir != "cmd" {
		if info, statErr := os.Stat(gitDir); statErr == nil && info.IsDir() {
			dirs = append(dirs, gitDir)
		}
	}

	parts := make([]string, 0, len(dirs)+1)
	parts = append(parts, dirs...)
	if inherited := os.Getenv("PATH"); inherited != "" {
		parts = append(parts, inherited)
	}
	env["PATH"] = strings.Join(parts, string(os.PathListSeparator))
	return nil
}
