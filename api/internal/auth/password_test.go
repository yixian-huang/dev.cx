package auth_test

import (
	"testing"

	"devcx/internal/auth"
)

func TestPasswordHashRoundtrip(t *testing.T) {
	h, err := auth.HashPassword("s3cret-pw")
	if err != nil {
		t.Fatal(err)
	}
	if h == "s3cret-pw" {
		t.Fatal("hash equals plaintext")
	}
	if !auth.CheckPassword(h, "s3cret-pw") {
		t.Fatal("valid password rejected")
	}
	if auth.CheckPassword(h, "wrong") {
		t.Fatal("wrong password accepted")
	}
}
