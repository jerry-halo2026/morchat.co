package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jerry-halo2026/morchat.co/server/internal/daemon/processtree"
	"github.com/jerry-halo2026/morchat.co/server/pkg/agent"
	"github.com/jerry-halo2026/morchat.co/server/pkg/redact"
)

// The DSH backend drives `dsh --profile multica --stdio`, and that profile is
// what supplies the protocol: DSH ships no machine-drivable mode of its own.
// `--profile headless` answers one task and exits, and ACP — the one protocol
// DSH does implement — is itself a profile rather than a built-in. Every other
// built-in drives a protocol its CLI already has (`claude -p --output-format
// stream-json`, `codex app-server`, `kimi acp`), which is why dsh is the only
// provider whose integration depends on the user installing something into the
// agent's own home first.
//
// These knobs let the daemon close that gap instead of only reporting it.
const (
	// dshProfileBundleEnv names the DSH-side bundle to install into the
	// `multica` profile when a dsh CLI resolves without one. It takes a
	// comma-separated list of candidates tried in order, each of which may be
	// anything `dsh plugin --profile multica add` accepts: an npm spec, a
	// directory, or a packed tarball.
	//
	// Unset is the default and means "do not touch the user's DSH
	// installation". Installing a bundle into another product's home is a
	// side effect the operator has to ask for — and there is nothing to point
	// it at by default either, because Multica's own DSH bridge is not
	// published to npm yet (multica#6936). Setting this is what turns the
	// reported drop into a self-healing one.
	dshProfileBundleEnv = "MULTICA_DSH_PROFILE_BUNDLE"

	// dshPluginPathEnv overrides where `dsh plugin` finds pnpm. It exists
	// because DSH Desktop ships pnpm inside its own runtime-commands
	// directory and injects that directory into the PATH of the processes it
	// spawns itself. A daemon started by Multica's desktop app, by launchd or
	// from a terminal is not one of them, so the install fails with "pnpm not
	// found on PATH" on exactly the machines this feature is for.
	dshPluginPathEnv = "MULTICA_DSH_PLUGIN_PATH"

	// dshMulticaProfileName is the profile the backend launches. Kept beside
	// the install command so the two cannot drift.
	dshMulticaProfileName = "multica"

	// dshMulticaRuntimePackage is the bridge a multica profile has to load
	// before this daemon will treat the profile as installed. `dsh plugin add`
	// records that name in dependencies and, when the package is a bundle, in
	// dsh.profile.bundles — including installs from git, a directory, or a tarball.
	dshMulticaRuntimePackage = "@multica-ai/dsh-runtime"
	dshLegacyRuntimePackage  = "dsh-profile-multica"
	dshBaseProfileBundle     = "@deepseek-ai/dsh-base"
)

// dshProfileManifest is the slice of a profile package.json this daemon reads.
// Dependency values are left raw; only their presence matters when separating
// an existing configuration from an empty install skeleton.
type dshProfileManifest struct {
	Dependencies map[string]json.RawMessage `json:"dependencies"`
	DSH          struct {
		Profile struct {
			Bundles []string `json:"bundles"`
		} `json:"profile"`
	} `json:"dsh"`
}

// dshProvisionTimeout bounds the whole install. It is a package manager
// talking to a registry, so it is generous next to the CLI probes.
const dshProvisionTimeout = 3 * time.Minute

// dshMulticaProfilePresent reports whether the `multica` profile is installed.
//
// Installed means the manifest loads the Multica runtime bundle, not that the file
// exists. A refused `dsh plugin add` leaves package.json behind with empty
// dependencies and only DSH's template bundle; a stat of that file made every
// later probe look transient and blocked the automatic install.
//
// A file that cannot be read or parsed still counts as installed. The daemon
// cannot tell a broken manifest from one it should not overwrite, and guessing
// "missing" is what starts an install.
//
// The authoritative question — "does --probe actually succeed?" — costs booting
// a whole DSH process, so it stays in the probe round this signal forces. This
// read is the cheap check the discovery loop runs on every tick.
func dshMulticaProfilePresent() bool {
	path := dshMulticaProfileManifestPath()
	if path == "" {
		return false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		// Missing is the only negative answer. A permission error or a file
		// that is not a regular file stays "installed": this daemon will not
		// treat something it cannot read as absent.
		return !os.IsNotExist(err)
	}
	var manifest dshProfileManifest
	if json.Unmarshal(data, &manifest) != nil {
		return true
	}
	return dshProfileNamesRuntime(manifest)
}

// dshMulticaProfileManifestPath is <DSH_HOME>/profiles/multica/package.json.
// An empty result means the home directory could not be resolved.
func dshMulticaProfileManifestPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	// DSH_HOME is DSH's own override, and the profile store lives under it
	// either way. Same resolution local_skills.go uses to find ~/.dsh/skills.
	dshHome := strings.TrimSpace(os.Getenv("DSH_HOME"))
	if dshHome == "" {
		dshHome = filepath.Join(home, ".dsh")
	}
	return filepath.Join(dshHome, "profiles", dshMulticaProfileName, "package.json")
}

// dshProfileNamesRuntime reports whether the manifest lists the Multica runtime
// as a loaded profile bundle, without the legacy bridge.
func dshProfileNamesRuntime(manifest dshProfileManifest) bool {
	for _, bundle := range manifest.DSH.Profile.Bundles {
		if bundle == dshLegacyRuntimePackage {
			return false
		}
	}
	for _, bundle := range manifest.DSH.Profile.Bundles {
		if bundle == dshMulticaRuntimePackage {
			return true
		}
	}
	return false
}

// dshMulticaProfileNeedsMigration separates an existing bridge configuration
// from a missing profile or the empty template left by a refused install.
// Never provision over an existing bridge just because it is not usable.
func dshMulticaProfileNeedsMigration() bool {
	data, err := os.ReadFile(dshMulticaProfileManifestPath())
	if err != nil {
		return false
	}
	var manifest dshProfileManifest
	if json.Unmarshal(data, &manifest) != nil || dshProfileNamesRuntime(manifest) {
		return false
	}
	if len(manifest.Dependencies) > 0 {
		return true
	}
	for _, bundle := range manifest.DSH.Profile.Bundles {
		if bundle != dshBaseProfileBundle {
			return true
		}
	}
	return false
}

// dshProfileBundleSpecs returns the configured install candidates, in order,
// or nil when the operator has not opted in.
func dshProfileBundleSpecs() []string {
	raw := strings.TrimSpace(os.Getenv(dshProfileBundleEnv))
	if raw == "" {
		return nil
	}
	var specs []string
	for _, spec := range strings.Split(raw, ",") {
		if spec = strings.TrimSpace(spec); spec != "" {
			specs = append(specs, spec)
		}
	}
	return specs
}

// dshProfileBundleManifest is the slice of a candidate bundle's own package.json
// this daemon reads before installing a directory itself.
type dshProfileBundleManifest struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// dshProfileBundleDirForSpec validates one configured candidate as a local
// bundle directory.
//
// A directory is the only shape this daemon can install on its own, and that is
// the shape the shipped installer produces: it bundles the runtime, so the
// machine it runs on may have no pnpm, no registry access and no `dsh` to
// forward `dsh plugin` to. Everything else — an npm spec, a tarball — still goes
// through `dsh plugin add`, because fetching is the part only that command knows
// how to do.
//
// The name check is not cosmetic. dshProfileNamesRuntime judges the profile by
// exactly this package name, so a directory whose manifest names anything else
// would be copied in and then reported missing on every later round. The reason
// is returned rather than logged so the caller can put the exact repair in one
// log line.
func dshProfileBundleDirForSpec(spec string) (string, dshProfileBundleManifest, error) {
	info, err := os.Stat(spec)
	if err != nil {
		return "", dshProfileBundleManifest{}, fmt.Errorf("is not a directory the daemon can read")
	}
	if !info.IsDir() {
		return "", dshProfileBundleManifest{}, fmt.Errorf("is a file, not a bundle directory")
	}
	data, err := os.ReadFile(filepath.Join(spec, "package.json"))
	if err != nil {
		return "", dshProfileBundleManifest{}, fmt.Errorf("has no readable package.json")
	}
	var manifest dshProfileBundleManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return "", dshProfileBundleManifest{}, fmt.Errorf("has a package.json that is not valid JSON")
	}
	if manifest.Name != dshMulticaRuntimePackage {
		return "", manifest, fmt.Errorf("its package.json names %q, want %q", manifest.Name, dshMulticaRuntimePackage)
	}
	return spec, manifest, nil
}

// dshProfileBundleDir returns the first configured candidate that is an
// installable local bundle directory, or an error naming why the configured
// candidates are not.
//
// Both halves matter to the startup gate: "a bundle directory is configured" is
// what lets a daemon with no agent CLI start, and a candidate that merely looks
// configured (a typo, a file, the wrong package) must not.
func dshProfileBundleDir() (string, dshProfileBundleManifest, error) {
	specs := dshProfileBundleSpecs()
	var lastErr error
	for i, spec := range specs {
		dir, manifest, err := dshProfileBundleDirForSpec(spec)
		if err == nil {
			return dir, manifest, nil
		}
		// Named by position, never by content: a spec can be an absolute path
		// carrying a username or an npm URL carrying credentials, and this
		// error reaches a log line.
		lastErr = fmt.Errorf("candidate %d of %d %w", i+1, len(specs), err)
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("%s is not set", dshProfileBundleEnv)
	}
	return "", dshProfileBundleManifest{}, lastErr
}

// dshProfileInstallDir is <DSH_HOME>/profiles/multica, or "" when the DSH home
// cannot be resolved.
func dshProfileInstallDir() string {
	path := dshMulticaProfileManifestPath()
	if path == "" {
		return ""
	}
	return filepath.Dir(path)
}

// dshBundleInstallPath is where a bundle named @multica-ai/dsh-runtime lands
// inside the profile: the profile's own node_modules, which is what DSH's
// loadProfile resolves a bundle name against.
func dshBundleInstallPath(profileDir string) string {
	return filepath.Join(profileDir, "node_modules", filepath.FromSlash(dshMulticaRuntimePackage))
}

// newDshProfileObject is the profile DSH itself leaves behind for a profile with
// no plugins installed. An install extends this rather than inventing a shape,
// so a profile written here is one DSH could have written.
func newDshProfileObject() map[string]any {
	return map[string]any{
		"name":         "dsh-profile-multica",
		"private":      true,
		"dependencies": map[string]any{},
		"dsh": map[string]any{
			"profile": map[string]any{"bundles": []any{dshBaseProfileBundle}},
		},
	}
}

// readDshProfileObject returns the existing profile manifest as a generic object
// so unknown fields survive the rewrite, or DSH's template when there is no
// manifest yet. A manifest that cannot be parsed is an error, not a template:
// overwriting one would discard a configuration this daemon was told not to
// touch.
func readDshProfileObject() (map[string]any, error) {
	path := dshMulticaProfileManifestPath()
	if path == "" {
		return nil, fmt.Errorf("cannot resolve the DSH profile path")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return newDshProfileObject(), nil
		}
		return nil, fmt.Errorf("read the existing DSH profile manifest: %w", err)
	}
	var current map[string]any
	if err := json.Unmarshal(data, &current); err != nil {
		return nil, fmt.Errorf("the existing DSH profile manifest is not valid JSON: %w", err)
	}
	if current == nil {
		return nil, fmt.Errorf("the existing DSH profile manifest is not a JSON object")
	}
	return current, nil
}

// dshProfileInstallManifest folds the runtime into a profile manifest: the
// dependency records what was installed, and the bundles list is what DSH
// actually loads. The legacy bridge is dropped from that list, because
// dshProfileNamesRuntime treats the two together as a configuration this daemon
// must not touch.
func dshProfileInstallManifest(current map[string]any, version string) map[string]any {
	dependencies, _ := current["dependencies"].(map[string]any)
	if dependencies == nil {
		dependencies = map[string]any{}
	}
	dependencies[dshMulticaRuntimePackage] = version
	current["dependencies"] = dependencies

	dsh, _ := current["dsh"].(map[string]any)
	if dsh == nil {
		dsh = map[string]any{}
	}
	profile, _ := dsh["profile"].(map[string]any)
	if profile == nil {
		profile = map[string]any{}
	}
	raw, _ := profile["bundles"].([]any)
	bundles := make([]any, 0, len(raw)+2)
	for _, entry := range raw {
		name, _ := entry.(string)
		if name == dshLegacyRuntimePackage || name == dshMulticaRuntimePackage {
			continue
		}
		bundles = append(bundles, name)
	}
	if len(bundles) == 0 {
		bundles = append(bundles, dshBaseProfileBundle)
	}
	bundles = append(bundles, dshMulticaRuntimePackage)
	profile["bundles"] = bundles
	dsh["profile"] = profile
	current["dsh"] = dsh
	return current
}

// saveDshProfileManifest replaces the profile manifest atomically. A half
// written manifest is the difference between "installed" and "missing" for
// every later round, and the readers here only ever see one or the other.
func saveDshProfileManifest(current map[string]any) error {
	path := dshMulticaProfileManifestPath()
	if path == "" {
		return fmt.Errorf("cannot resolve the DSH profile path")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create the profile directory: %w", err)
	}
	data, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		return fmt.Errorf("encode the profile manifest: %w", err)
	}
	temp := path + ".multica-tmp"
	if err := os.WriteFile(temp, append(data, '\n'), 0o600); err != nil {
		return fmt.Errorf("write the profile manifest: %w", err)
	}
	if err := os.Rename(temp, path); err != nil {
		_ = os.Remove(temp)
		return fmt.Errorf("replace the profile manifest: %w", err)
	}
	return nil
}

// installDshProfileFromBundleDir materializes the `multica` profile from a local
// bundle directory: the bundle's files go into the profile's node_modules and
// the manifest is extended to load it.
//
// Ordering is the contract. The files land first and the manifest last, because
// dshMulticaProfilePresent judges the manifest — a copy interrupted half way
// must never leave a profile that looks installed.
func installDshProfileFromBundleDir(dir string, manifest dshProfileBundleManifest) error {
	profileDir := dshProfileInstallDir()
	if profileDir == "" {
		return fmt.Errorf("cannot resolve the DSH home directory")
	}
	target := dshBundleInstallPath(profileDir)
	if err := os.RemoveAll(target); err != nil {
		return fmt.Errorf("clear the installed %s: %w", dshMulticaRuntimePackage, err)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return fmt.Errorf("create the profile node_modules: %w", err)
	}
	if err := os.CopyFS(target, os.DirFS(dir)); err != nil {
		return fmt.Errorf("copy the bundle into the profile: %w", err)
	}
	current, err := readDshProfileObject()
	if err != nil {
		return err
	}
	version := strings.TrimSpace(manifest.Version)
	if version == "" {
		version = "0.0.0"
	}
	return saveDshProfileManifest(dshProfileInstallManifest(current, version))
}

// installDshProfileCandidate installs one configured local bundle directory and
// reports success only once the profile every later round judges by is on disk.
// A copy that produced files but no loadable manifest is a failed candidate, not
// a quiet success.
func installDshProfileCandidate(spec, position string, logger *slog.Logger) error {
	dir, manifest, err := dshProfileBundleDirForSpec(spec)
	if err != nil {
		return fmt.Errorf("%s %w", position, err)
	}
	if err := installDshProfileFromBundleDir(dir, manifest); err != nil {
		return fmt.Errorf("%s: %w", position, err)
	}
	if !dshMulticaProfilePresent() {
		return fmt.Errorf("%s: wrote the profile but its manifest does not load %s", position, dshMulticaRuntimePackage)
	}
	logger.Info("installed the DSH runtime profile from a local bundle",
		"bundle_candidate", position, "path", dir, "profile", dshMulticaProfileName)
	return nil
}

// dshPluginPathDirs returns the directories that may hold the pnpm `dsh plugin`
// forwards to, newest first. Only directories that exist are returned:
// prepending a miss to PATH buys nothing and makes the environment harder to
// read in a failure report.
//
// DSH Desktop keeps its private pnpm shim under runtime-commands in its own
// per-user data directory, on both platforms — the daemon inherits no path to
// it, and without this the install fails with "pnpm not found on PATH" on
// exactly the machines the automatic install is for.
//
// The layout is not the same on both, which is why this shares the enumerator
// with CLI-shim discovery rather than composing a path: macOS 2.0.5 keeps a
// flat runtime-commands/bin, while a Windows install keeps
// runtime-commands/generations/<id>/bin. Both shapes, and both levels, are
// searched, so neither is a version this daemon silently stops supporting.
func dshPluginPathDirs() []string {
	// An explicit override is the whole answer: an operator who pinned a
	// directory that does not exist should get "pnpm not found", not a silent
	// fallback to a bundled one they were trying to bypass.
	if override := strings.TrimSpace(os.Getenv(dshPluginPathEnv)); override != "" {
		if isExistingDir(override) {
			return []string{override}
		}
		return nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = ""
	}
	appData := dshDesktopAppDataDir(runtime.GOOS, os.Getenv, home)
	if appData == "" {
		return nil
	}
	root := filepath.Join(appData, "runtime-commands")
	return append(dshDesktopBinDirs(filepath.Join(root, "generations")), dshDesktopBinDirs(root)...)
}

// dshPluginEnv copies the daemon's environment with dshPluginPathDirs prepended
// to PATH, so `dsh plugin` resolves the pnpm DSH ships when the operator has no
// pnpm of their own.
//
// The PATH entry is matched case-insensitively, which is not cosmetic on
// Windows: the variable is conventionally spelled `Path`, so an exact `PATH=`
// match misses it, and the appended entry then wins under Go's
// case-insensitive de-duplication of the child environment — leaving the
// package manager with only the plugin directory and none of the system path.
// The original spelling is preserved rather than normalized so the merge cannot
// itself introduce a second entry.
func dshPluginEnv() []string {
	return mergeDshPluginPath(os.Environ(), dshPluginPathDirs())
}

// mergeDshPluginPath prepends dirs to whichever PATH-like entry env already has,
// preserving that entry's own spelling, or appends one when there is none.
//
// Split out from the environment read so the merge is testable with the exact
// shape Windows hands the daemon: matching is case-insensitive because the
// variable is conventionally spelled `Path` there, and an exact `PATH=` match
// misses it — after which the appended entry wins under Go's case-insensitive
// de-duplication of the child environment, leaving the package manager with only
// the plugin directory and none of the system path.
func mergeDshPluginPath(env, dirs []string) []string {
	if len(dirs) == 0 {
		return env
	}
	prefix := strings.Join(dirs, string(os.PathListSeparator))
	for i, kv := range env {
		eq := strings.IndexByte(kv, '=')
		if eq <= 0 || !strings.EqualFold(kv[:eq], "PATH") {
			continue
		}
		env[i] = kv[:eq+1] + prefix + string(os.PathListSeparator) + kv[eq+1:]
		return env
	}
	return append(env, "PATH="+prefix)
}

// dshProvisionOutputBytes bounds the package-manager output kept in a log line.
// pnpm prints a tree plus a summary and the useful part is the tail, so the tail
// is what survives.
const dshProvisionOutputBytes = 2048

// dshProvisionURLCredentials matches a URL carrying credentials in its
// userinfo. The scheme and host survive — which registry refused the request is
// what an operator reads, and is not the secret — and userinfo requires BOTH a
// colon and an @ before the next path separator, so "https://host:8443/p" and
// "ssh://git@host/p" are left alone.
//
// Local to provisioning rather than added to pkg/redact's shared pattern list.
// redact.Text runs over every agent's task messages, comments and error text, so
// a rule added there changes output for every provider; the case that needs it
// here is one package manager's error text, and widening a shared filter is its
// own change with its own blast radius.
var dshProvisionURLCredentials = regexp.MustCompile(`(?i)\b([a-z][a-z0-9+.\-]*)://[^/?#\s:@]+:[^/?#\s@]+@`)

// dshProvisionOutput renders captured output for a log line. Registry errors
// routinely echo the request URL back, so URL credentials are scrubbed and the
// shared redactor still runs for the token shapes it knows, before the text is
// bounded.
func dshProvisionOutput(raw []byte) string {
	text := dshProvisionURLCredentials.ReplaceAllString(
		strings.TrimSpace(string(raw)), "$1://[REDACTED URL CREDENTIALS]@")
	text = redact.Text(text)
	if len(text) <= dshProvisionOutputBytes {
		return text
	}
	// Cut on a rune boundary. Package-manager output is full of box drawing and
	// check marks, and non-ASCII paths are ordinary on the machines this runs
	// on, so a byte cut lands mid-rune often enough to matter — and what it
	// produces is an invalid-UTF-8 log line, which downstream JSON encoders
	// rewrite into replacement characters.
	tail := text[len(text)-dshProvisionOutputBytes:]
	for len(tail) > 0 && !utf8.ValidString(tail[:1]) {
		tail = tail[1:]
	}
	return "…" + tail
}

// dshProfileRepair names what is missing, and deliberately carries NO command.
//
// The install is `dsh plugin --profile multica add <bundle>`, and <bundle> is
// the operator's own choice of npm spec, directory or tarball — Multica's own
// bridge is not on a public registry yet (multica#6936). A Repair.Command is
// rendered to the user inside a shell code fence as the thing to run on that
// machine, so shipping the placeholder there hands out a line that fails when
// pasted. Package alone still tells the server which repair to explain; the
// prose that explains it lives in the server's notice, where it can name both
// ways to supply a real bundle.
func dshProfileRepair() agent.ExecFormatRepair {
	return agent.ExecFormatRepair{Package: "DeepSeek Harness runtime profile"}
}

// dshProvisionCommand builds one install invocation. Split out from the run so
// the argv and the environment it executes under are assertable on every
// platform, including the Windows ones where a shell fixture cannot stand in
// for a package manager.
func dshProvisionCommand(dshPath, spec string) *exec.Cmd {
	cmd := exec.Command(dshPath, "plugin", "--profile", dshMulticaProfileName, "add", spec)
	cmd.Env = dshPluginEnv()
	return cmd
}

// provisionDshMulticaProfile installs the configured runtime bundle into the
// `multica` profile, so a later discovery round finds a usable dsh. Candidates
// are tried in order and the first success wins.
//
// dshPath may be empty: a candidate that is a local bundle directory is
// installed by this daemon directly and needs no CLI, while every other
// candidate needs `dsh plugin` and is reported as a failed candidate when there
// is no dsh to run it with.
//
// Runs the package manager through processtree: `dsh plugin` forwards to pnpm,
// which spawns node, which spawns whatever the bundle's install script needs.
// Killing only the direct child would leave that tree writing into the operator's
// DSH home after the daemon has stopped, and a daemon rollback cannot undo a
// write that already landed.
//
// Neither the spec nor the raw output is logged: a spec can be an npm URL with
// credentials in its userinfo or a path carrying a username, so the log names
// the candidate by position instead, and the output is redacted and bounded.
//
// A nil return means the profile is on disk, not merely that the package
// manager exited 0 — see the loop for why those are not the same thing.
//
// Returns nil when nothing is configured — the caller treats provisioning as
// best-effort either way, and the missing-profile verdict stands until a probe
// succeeds.
func provisionDshMulticaProfile(ctx context.Context, dshPath string, logger *slog.Logger) error {
	if dshMulticaProfileNeedsMigration() {
		return fmt.Errorf("%s", dshProfileMigrationReason)
	}
	specs := dshProfileBundleSpecs()
	if len(specs) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, dshProvisionTimeout)
	defer cancel()

	var lastErr error
	for i, spec := range specs {
		// A local bundle directory is installed here instead of through the
		// CLI: copying a bundle into the profile's node_modules needs no
		// package manager, no registry and no `dsh` — the three things the
		// machine this feature exists for is likeliest to be missing.
		if info, statErr := os.Stat(spec); statErr == nil && info.IsDir() {
			if lastErr = installDshProfileCandidate(spec, fmt.Sprintf("candidate %d of %d", i+1, len(specs)), logger); lastErr == nil {
				return nil
			}
			logger.Warn("DSH runtime profile install failed",
				"bundle_candidate", i+1, "candidates", len(specs), "error", lastErr)
			continue
		}
		if dshPath == "" {
			// Nothing to run `dsh plugin` with. Its own failure rather than
			// silence: a machine that was told a bundle is configured and has
			// no CLI gets a line saying exactly that.
			lastErr = fmt.Errorf("candidate %d of %d needs `dsh plugin --profile %s add`, but no dsh executable is visible",
				i+1, len(specs), dshMulticaProfileName)
			logger.Warn("DSH runtime profile install failed",
				"bundle_candidate", i+1, "candidates", len(specs), "error", lastErr)
			continue
		}
		output, err := processtree.CombinedOutput(ctx, dshProvisionCommand(dshPath, spec), 5*time.Second)
		switch {
		case err == nil && dshMulticaProfilePresent():
			logger.Info("installed the DSH runtime profile",
				"bundle_candidate", i+1, "candidates", len(specs),
				"path", dshPath, "profile", dshMulticaProfileName)
			return nil
		case err == nil:
			// Exit 0 with no manifest behind it. The exit status is the package
			// manager's opinion about its own run; dshMulticaProfilePresent is
			// the fact the REST of the daemon judges by — the probe
			// classification and the discovery loop's mismatch check both read
			// it — so an install allowed to report success while disagreeing
			// with it would log "installed the DSH runtime profile" and leave
			// every later round reporting that same profile as missing.
			//
			// Treating it as a failed candidate rather than as done is what
			// gives the remaining candidates their turn: a spec that resolves
			// and installs dependencies without producing a profile has not
			// done the job, and stopping on it would hide a later spec that
			// would have.
			lastErr = fmt.Errorf("dsh plugin --profile %s add (candidate %d of %d): reported success without creating the profile: %s",
				dshMulticaProfileName, i+1, len(specs), dshProvisionOutput(output))
		default:
			lastErr = fmt.Errorf("dsh plugin --profile %s add (candidate %d of %d): %w: %s",
				dshMulticaProfileName, i+1, len(specs), err, dshProvisionOutput(output))
		}
		// Leave the directory. A refused add can write a skeleton, and a failure
		// can also land on a profile the user already had. dshMulticaProfilePresent
		// treats a manifest that does not name the runtime as missing, so the
		// next restart retries over it and --probe is not started.
		logger.Warn("DSH runtime profile install failed",
			"bundle_candidate", i+1, "candidates", len(specs), "error", lastErr)
	}
	return lastErr
}

// startDshProfileProvision kicks off the one-time automatic install of the DSH
// runtime profile. It reports whether this call was the one that started it, so
// the caller can say so in the drop reason.
//
// Once per daemon lifetime, not once per round: the work is a network install
// that mutates the user's DSH home, and a registry or network failure would
// otherwise be retried every discovery interval forever. A restart is the
// retry.
func (d *Daemon) startDshProfileProvision(dshPath string) bool {
	if len(dshProfileBundleSpecs()) == 0 {
		return false
	}
	// The daemon's own context, not the caller's: a probe round is scoped to one
	// round, and an install killed with it would leave the operator with a
	// half-written profile and no explanation.
	ctx := d.daemonLifecycleCtx()
	started := false
	d.dshProvisionOnce.Do(func() {
		started = true
		// Set before the goroutine rather than inside it: the verdict that
		// starts the install is built in the same round, and an offline reason
		// that says "wait" has to be true from the first deregistration.
		d.dshInstallInFlight.Store(true)
		go func() {
			defer d.dshInstallInFlight.Store(false)
			// provisionDshMulticaProfile returns nil only once the profile is
			// actually on disk, so nil here means there is something new to
			// find. The exit status alone would not have meant that.
			err := provisionDshMulticaProfile(ctx, dshPath, d.logger)
			if err == nil {
				d.logger.Info("DSH runtime profile installed; re-probing to bring dsh online")
				// Re-probe now rather than at the next scheduled round. The
				// discovery loop backs off while a provider cannot register, and
				// dsh counts as "missing a runtime" for as long as the profile is
				// absent — so the attempt this replaces can be
				// agentConvergeMaxBackoff away, which is indistinguishable from
				// "it does not work" to anyone watching the runtime list. On a
				// daemon that started with nothing registered this also has to
				// pick the workspace up first; see registerAfterDshProfileInstall.
				d.registerAfterDshProfileInstall(ctx)
				return
			}
			d.logger.Warn("automatic DSH runtime profile install did not produce a profile; dsh stays unregistered until one exists",
				"path", dshPath, "error", err)
			// Withdraw the claim before returning. Any runtime taken offline
			// while this install was running says "installing" on its row, and
			// the server reads that as a wait worth queueing behind. Nothing
			// else will ever rewrite it: the demotion already removed the
			// runtime from the index, so no later round has a runtime to
			// condemn and no later deregistration is sent. Left alone, that row
			// queues work forever behind an install that has already given up.
			d.withdrawDshInstallWait(ctx)
		}()
	})
	return started
}

// installDshProfileForStartup installs the configured profile before the first
// registration round, and is the half of the startup exception that makes it
// more than a promise.
//
// The exception exists because a daemon whose only runtime is a DSH that needs
// this profile would otherwise exit before the install it just started could
// finish, taking the install's process tree with it. So a daemon that started
// with no agent CLI because a bundle directory is configured installs that
// bundle here — synchronously, with no CLI, no package manager and no network —
// and fails startup with the installer's own error if it cannot. A failure is
// never silent: the error is returned to the caller, which exits with it.
//
// A profile that is already present is left alone: reinstalling over it would
// overwrite a working installation on every restart.
func (d *Daemon) installDshProfileForStartup(ctx context.Context) error {
	if dshMulticaProfilePresent() {
		d.logger.Info("DSH runtime profile is already installed; nothing to prepare before startup",
			"profile", dshMulticaProfileName)
		return nil
	}
	dir, _, err := dshProfileBundleDir()
	if err != nil {
		d.logger.Warn("cannot install the DSH runtime profile before startup", "error", err)
		return err
	}
	d.logger.Info("installing the DSH runtime profile before startup",
		"bundle", dir, "profile", dshMulticaProfileName)
	// Set for the duration of the install and cleared by the normal path: the
	// startup exception is carried by dshStartupInstallOnly, not by stretching
	// this flag past the work it describes.
	d.dshInstallInFlight.Store(true)
	err = provisionDshMulticaProfile(ctx, "", d.logger)
	d.dshInstallInFlight.Store(false)
	if err != nil {
		d.logger.Warn("the DSH runtime profile install failed before startup; "+
			"dsh stays unregistered until a profile is installed", "error", err)
		return err
	}
	d.logger.Info("installed the DSH runtime profile before startup; dsh registers as soon as its CLI is visible",
		"profile", dshMulticaProfileName)
	return nil
}
