package auth_test

import (
	"context"
	"testing"

	"devcx/internal/auth"
	"devcx/internal/ids"
	"devcx/internal/testutil"
)

func TestSessionLifecycle(t *testing.T) {
	pool := testutil.TestPool(t)
	ctx := context.Background()
	uid := ids.New()
	pool.Exec(ctx, `insert into users (id,email,display_name,handle) values ($1,'s@b.c','S','sess1')`, uid)

	token, err := auth.CreateSession(ctx, pool, uid)
	if err != nil {
		t.Fatal(err)
	}
	got, err := auth.UserIDBySession(ctx, pool, token)
	if err != nil || got != uid {
		t.Fatalf("lookup = %q, %v", got, err)
	}
	if err := auth.DestroySession(ctx, pool, token); err != nil {
		t.Fatal(err)
	}
	if got, _ := auth.UserIDBySession(ctx, pool, token); got != "" {
		t.Fatal("destroyed session still resolves")
	}
	if got, _ := auth.UserIDBySession(ctx, pool, "bogus"); got != "" {
		t.Fatal("bogus token resolves")
	}
}
