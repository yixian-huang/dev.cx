package handle_test

import (
	"context"
	"testing"

	"devcx/internal/handle"
	"devcx/internal/ids"
	"devcx/internal/testutil"
)

func TestValidate(t *testing.T) {
	ok := []string{"chip", "a1", "dev-tools", "x0-y9"}
	bad := []string{"", "a", "-abc", "abc-", "ab--cd", "Chip", "有中文", "a_b", "a.b",
		"this-handle-is-way-too-long-over-32-chars"}
	for _, h := range ok {
		if err := handle.Validate(h); err != nil {
			t.Errorf("%q should be valid: %v", h, err)
		}
	}
	for _, h := range bad {
		if err := handle.Validate(h); err == nil {
			t.Errorf("%q should be invalid", h)
		}
	}
}

func TestAvailable(t *testing.T) {
	pool := testutil.TestPool(t)
	ctx := context.Background()
	uid := ids.New()
	pool.Exec(ctx, `insert into users (id,email,display_name,handle) values ($1,'a@b.c','A','taken1')`, uid)
	pool.Exec(ctx, `insert into handle_history (old_handle,user_id) values ('oldname',$1)`, uid)

	cases := map[string]string{
		"freshname": "", "taken1": "taken", "oldname": "taken",
		"about": "reserved", "devcx": "reserved", "Bad name": "invalid",
	}
	for h, want := range cases {
		got, err := handle.Available(ctx, pool, h)
		if err != nil {
			t.Fatalf("%q: %v", h, err)
		}
		if got != want {
			t.Errorf("Available(%q) = %q, want %q", h, got, want)
		}
	}
}
