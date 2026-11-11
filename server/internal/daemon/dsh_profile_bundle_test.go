package daemon

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// stubNoAgentCLIs makes discovery find nothing, which is the only situation the
// zero-CLI gate is about. The discovery function is a var precisely so a test
// can answer this without depending on what is installed on the machine running
// it.
func stubNoAgentCLIs(t *testing.T) {
	t.Helper()
	previous := probeAgentCLIs
	probeAgentCLIs = func() map[string]AgentEntry { return map[string]AgentEntry{} }
	t.Cleanup(func() { probeAgentCLIs = previous })
}

// writeDshBundleFixture stages a bundle directory shaped like the one
// scripts/bundle-dsh.mjs produces: a manifest naming the runtime, plus files in
// a subdirectory so a non-recursive copy cannot pass.
func writeDshBundleFixture(t *testing.T, name string) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "package.json"),
		[]byte(fmt.Sprintf("{\"name\":%q,\"version\":\"9.9.9\"}\n", name)), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "index.js"), []byte("module.exports = {};\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "lib"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "lib", "runtime.js"), []byte("module.exports = {};\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

// dshProbeFixtureExecutable returns this test binary as the fake `dsh` the probe
// spawns. TestMain answers `--probe` (see dshProbeFixtureEnv). A shell fixture
// cannot stand in on Windows, and a test-created executable keeps the rule that
// default tests never resolve a user-installed agent CLI.
func dshProbeFixtureExecutable(t *testing.T) string {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve the test binary: %v", err)
	}
	t.Setenv(dshProbeFixtureEnv, "1")
	return exe
}

func loadConfigWithoutAgents(t *testing.T) (Config, error) {
	t.Helper()
	return LoadConfig(Overrides{
		ServerURL:      "http://localhost:0",
		WorkspacesRoot: t.TempDir(),
		DaemonID:       "11111111-1111-1111-1111-111111111111",
	})
}

// The gate keeps its default answer. A bundle variable that is unset, or set to
// something that is not an installable bundle directory, is not a reason to
// start: only a directory the daemon can actually install justifies it, and the
// refusal has to say which of the two situations the operator is in.
func TestLoadConfig_ZeroCLIWithoutABundleStillRefuses(t *testing.T) {
	t.Run("variable unset", func(t *testing.T) {
		stubNoAgentCLIs(t)
		t.Setenv(dshProfileBundleEnv, "")
		_, err := loadConfigWithoutAgents(t)
		if err == nil {
			t.Fatal("a daemon with no agent CLI started with no bundle configured")
		}
		if !strings.Contains(err.Error(), "no agent CLI found") {
			t.Fatalf("error = %q, want the no-CLI refusal", err)
		}
	})

	t.Run("variable points at something that is not a bundle", func(t *testing.T) {
		stubNoAgentCLIs(t)
		notABundle := t.TempDir()
		if err := os.WriteFile(filepath.Join(notABundle, "readme.txt"), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Setenv(dshProfileBundleEnv, notABundle)
		_, err := loadConfigWithoutAgents(t)
		if err == nil {
			t.Fatal("a directory with no bundle manifest was accepted as an installable bundle")
		}
		// Both facts, because either one alone sends the reader to the wrong place.
		if !strings.Contains(err.Error(), "no agent CLI found") || !strings.Contains(err.Error(), dshProfileBundleEnv) {
			t.Fatalf("error = %q, want the refusal plus the bundle variable named", err)
		}
	})

	t.Run("variable names another package", func(t *testing.T) {
		stubNoAgentCLIs(t)
		t.Setenv(dshProfileBundleEnv, writeDshBundleFixture(t, "@acme/some-plugin"))
		_, err := loadConfigWithoutAgents(t)
		if err == nil {
			t.Fatal("a bundle whose manifest names another package was accepted")
		}
		if !strings.Contains(err.Error(), dshMulticaRuntimePackage) {
			t.Fatalf("error = %q, want it to name the package a multica profile has to load", err)
		}
	})

	t.Run("read-only probe override still starts", func(t *testing.T) {
		stubNoAgentCLIs(t)
		t.Setenv(dshProfileBundleEnv, "")
		if _, err := LoadConfig(Overrides{
			ServerURL:      "http://localhost:0",
			WorkspacesRoot: t.TempDir(),
			DaemonID:       "11111111-1111-1111-1111-111111111111",
			AllowNoAgents:  true,
		}); err != nil {
			t.Fatalf("AllowNoAgents was ignored: %v", err)
		}
	})
}

// The one exception, stated as the pair of facts the startup path needs: the
// daemon starts with no runtime, and it carries the bundle directory it is
// supposed to install. Nothing else about the config changes.
func TestLoadConfig_ZeroCLIWithAValidBundleStartsAndRecordsTheBundle(t *testing.T) {
	stubNoAgentCLIs(t)
	bundleDir := writeDshBundleFixture(t, dshMulticaRuntimePackage)
	t.Setenv(dshProfileBundleEnv, bundleDir)

	cfg, err := loadConfigWithoutAgents(t)
	if err != nil {
		t.Fatalf("LoadConfig refused a valid bundle directory: %v", err)
	}
	if len(cfg.Agents) != 0 {
		t.Fatalf("Agents = %d entries, want the empty set this case is about", len(cfg.Agents))
	}
	if cfg.DshProfileBundleDir != bundleDir {
		t.Fatalf("DshProfileBundleDir = %q, want %q", cfg.DshProfileBundleDir, bundleDir)
	}
	// The startup exception is the gate's, not an ordinary daemon's: without it
	// an ordinary zero-CLI start would still have to fail.
	d := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if !d.dshStartupInstallOnly {
		t.Fatal("the daemon did not record the startup install exception")
	}
}

// The whole chain, in the order the daemon runs it: install the profile with no
// CLI at all, then let the probe that decides registration answer online.
func TestDshProfileBundleInstallRegistersDshOnline(t *testing.T) {
	home := pinnedDshHome(t)
	bundleDir := writeDshBundleFixture(t, dshMulticaRuntimePackage)
	t.Setenv(dshProfileBundleEnv, bundleDir)
	t.Setenv(dshPluginPathEnv, "")

	d := &Daemon{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	if err := d.installDshProfileForStartup(context.Background()); err != nil {
		t.Fatalf("installDshProfileForStartup: %v", err)
	}
	if d.dshInstallInFlight.Load() {
		t.Error("the install flag stayed set after the install finished")
	}

	// The profile every later round judges by.
	if !dshMulticaProfilePresent() {
		t.Fatal("the profile was not installed")
	}
	// The files, including the nested one: a bundle copied flat would load
	// nothing at boot.
	for _, rel := range []string{"package.json", "index.js", filepath.Join("lib", "runtime.js")} {
		path := filepath.Join(home, "profiles", dshMulticaProfileName, "node_modules",
			filepath.FromSlash(dshMulticaRuntimePackage), rel)
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("bundle file %q was not copied into the profile: %v", rel, err)
		}
	}
	manifest, err := os.ReadFile(filepath.Join(home, "profiles", dshMulticaProfileName, "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{dshMulticaRuntimePackage, "9.9.9", dshBaseProfileBundle} {
		if !strings.Contains(string(manifest), want) {
			t.Fatalf("profile manifest = %s, want it to contain %q", manifest, want)
		}
	}

	// And the fact registration turns on.
	if got := probeDshMulticaProfile(context.Background(), dshProbeFixtureExecutable(t)); got != dshProbeOK {
		t.Fatalf("probe verdict = %v, want dshProbeOK after an install", got)
	}
}

// A second startup must not reinstall over a profile that is already there: the
// operator may have added plugins to it, and the install rewrites node_modules.
func TestInstallDshProfileForStartup_LeavesAnInstalledProfileAlone(t *testing.T) {
	home := pinnedDshHome(t)
	installMulticaProfile(t, home)
	t.Setenv(dshProfileBundleEnv, "")

	d := &Daemon{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	if err := d.installDshProfileForStartup(context.Background()); err != nil {
		t.Fatalf("installDshProfileForStartup: %v", err)
	}
	manifest, err := os.ReadFile(dshMulticaProfileManifestPath())
	if err != nil {
		t.Fatal(err)
	}
	if string(manifest) != installedDshProfileManifest() {
		t.Fatalf("manifest = %q, want the existing one untouched", manifest)
	}
}

// A configured bundle that cannot be installed must fail startup with its own
// reason. Silence is the failure mode this replaces: the daemon would go on to
// fail with "no runtimes registered", which names neither the bundle nor the
// reason it was not installed.
func TestInstallDshProfileForStartup_ReportsAnUnusableBundle(t *testing.T) {
	pinnedDshHome(t)
	notABundle := t.TempDir()
	t.Setenv(dshProfileBundleEnv, notABundle)

	d := &Daemon{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	err := d.installDshProfileForStartup(context.Background())
	if err == nil {
		t.Fatal("an unusable bundle installed a profile")
	}
	if !strings.Contains(err.Error(), "candidate 1 of 1") || !strings.Contains(err.Error(), "package.json") {
		t.Fatalf("error = %q, want the candidate position and the manifest problem", err)
	}
	if d.dshInstallInFlight.Load() {
		t.Error("the install flag stayed set after a failed install")
	}
}

// The local install path must refuse to overwrite a bridge configuration the
// daemon would have to migrate by hand: installing over it would replace a
// deliberate setup with one this daemon still cannot drive.
func TestInstallDshProfileFromBundleDir_RefusesToMigrateOverAnExistingBridge(t *testing.T) {
	home := pinnedDshHome(t)
	writeDshProfileManifest(t, home, `{"dependencies":{"dsh-profile-multica":"1.0.0"},"dsh":{"profile":{"bundles":["dsh-profile-multica"]}}}`+"\n")
	bundleDir := writeDshBundleFixture(t, dshMulticaRuntimePackage)
	t.Setenv(dshProfileBundleEnv, bundleDir)

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	err := provisionDshMulticaProfile(context.Background(), "", logger)
	if err == nil {
		t.Fatal("provision installed over an existing bridge configuration")
	}
	if !strings.Contains(err.Error(), dshLegacyRuntimePackage) {
		t.Fatalf("error = %q, want the migration reason", err)
	}
	if _, statErr := os.Stat(filepath.Join(home, "profiles", dshMulticaProfileName, "node_modules")); !os.IsNotExist(statErr) {
		t.Fatalf("node_modules was written into a profile that needs manual migration: %v", statErr)
	}
}
