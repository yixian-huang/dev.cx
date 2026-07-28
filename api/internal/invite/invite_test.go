package invite_test

import (
	"context"
	"errors"
	"testing"

	"devcx/internal/ids"
	"devcx/internal/invite"
	"devcx/internal/testutil"
)

func TestMintAndRedeem(t *testing.T) {
	pool := testutil.TestPool(t)
	ctx := context.Background()
	codes, err := invite.Mint(ctx, pool, 2, 1, "batch-1")
	if err != nil || len(codes) != 2 {
		t.Fatalf("mint: %v %v", codes, err)
	}

	uid := ids.New()
	pool.Exec(ctx, `insert into users (id,email,display_name,handle) values ($1,'i@b.c','I','inv1')`, uid)

	tx, _ := pool.Begin(ctx)
	if err := invite.Redeem(ctx, tx, codes[0], uid); err != nil {
		t.Fatal(err)
	}
	tx.Commit(ctx)

	uid2 := ids.New()
	pool.Exec(ctx, `insert into users (id,email,display_name,handle) values ($1,'j@b.c','J','inv2')`, uid2)
	tx2, _ := pool.Begin(ctx)
	err = invite.Redeem(ctx, tx2, codes[0], uid2) // max_uses=1 已用完
	tx2.Rollback(ctx)
	if !errors.Is(err, invite.ErrInviteInvalid) {
		t.Fatalf("want ErrInviteInvalid, got %v", err)
	}

	tx3, _ := pool.Begin(ctx)
	if err := invite.Redeem(ctx, tx3, "no-such-code", uid2); !errors.Is(err, invite.ErrInviteInvalid) {
		t.Fatalf("want ErrInviteInvalid, got %v", err)
	}
	tx3.Rollback(ctx)
}
