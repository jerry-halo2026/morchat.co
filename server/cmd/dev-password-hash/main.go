// Sets a password on an existing account so the password sign-in path can be
// exercised locally. Dev helper only: prints the PHC hash, writes nothing.
package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/jerry-halo2026/morchat.co/server/internal/auth"
)

func main() {
	password := flag.String("password", "", "plaintext password to hash")
	flag.Parse()
	if *password == "" {
		fmt.Fprintln(os.Stderr, "usage: go run ./cmd/dev-password-hash -password <plaintext>")
		os.Exit(2)
	}
	hash, err := auth.Hash(*password)
	if err != nil {
		fmt.Fprintf(os.Stderr, "hash: %v\n", err)
		os.Exit(1)
	}
	if err := auth.Verify(*password, hash); err != nil {
		fmt.Fprintf(os.Stderr, "self-check failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(hash)
}
