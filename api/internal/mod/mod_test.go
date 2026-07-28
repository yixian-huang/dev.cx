package mod_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"devcx/internal/ids"
	"devcx/internal/mod"
	"devcx/internal/testutil"
)

func TestModActions(t *testing.T) {
	pool := testutil.TestPool(t)
	ctx := context.Background()

	mkUser := func(handle string) string {
		id := ids.New()
		if _, err := pool.Exec(ctx,
			`insert into users (id, email, display_name, handle) values ($1, $2, 'U', $1)`,
			id, handle+"@dev.cx"); err != nil {
			t.Fatal(err)
		}
		return id
	}
	admin := mkUser("op")
	victim := mkUser("target")

	postID := ids.New()
	if _, err := pool.Exec(ctx,
		`insert into posts (id, slug, author_id, type, title) values ($1,'t-post',$2,'discuss','T')`,
		postID, victim); err != nil {
		t.Fatal(err)
	}

	// hide post:置位 + 审计
	if err := mod.HidePost(ctx, pool, admin, postID, "红线:人身攻击"); err != nil {
		t.Fatalf("HidePost: %v", err)
	}
	var hiddenReason string
	var hiddenAt *time.Time
	pool.QueryRow(ctx, `select hidden_at, hidden_reason from posts where id=$1`, postID).
		Scan(&hiddenAt, &hiddenReason)
	if hiddenAt == nil || hiddenReason != "红线:人身攻击" {
		t.Errorf("post not hidden: %v %q", hiddenAt, hiddenReason)
	}
	var n int
	pool.QueryRow(ctx,
		`select count(*) from mod_actions where action='hide_post' and target_id=$1 and actor_id=$2`,
		postID, admin).Scan(&n)
	if n != 1 {
		t.Errorf("audit rows = %d, want 1", n)
	}

	// unhide 还原
	if err := mod.UnhidePost(ctx, pool, admin, postID); err != nil {
		t.Fatalf("UnhidePost: %v", err)
	}
	pool.QueryRow(ctx, `select hidden_at from posts where id=$1`, postID).Scan(&hiddenAt)
	if hiddenAt != nil {
		t.Error("post still hidden after unhide")
	}

	// warn:notification(kind=moderation, message)+审计
	if err := mod.Warn(ctx, pool, admin, victim, "首次警告:请阅读社区规范"); err != nil {
		t.Fatalf("Warn: %v", err)
	}
	var msg string
	if err := pool.QueryRow(ctx,
		`select message from notifications where user_id=$1 and kind='moderation'`, victim).
		Scan(&msg); err != nil || msg == "" {
		t.Errorf("warn notification missing: %v %q", err, msg)
	}

	// mute
	until := time.Now().Add(7 * 24 * time.Hour)
	if err := mod.Mute(ctx, pool, admin, victim, until, "灌水"); err != nil {
		t.Fatalf("Mute: %v", err)
	}
	var mu *time.Time
	pool.QueryRow(ctx, `select muted_until from users where id=$1`, victim).Scan(&mu)
	if mu == nil || !mu.After(time.Now()) {
		t.Errorf("muted_until = %v", mu)
	}
	if err := mod.Unmute(ctx, pool, admin, victim); err != nil {
		t.Fatalf("Unmute: %v", err)
	}

	// suspend 删 session
	if _, err := pool.Exec(ctx,
		`insert into sessions (token_hash, user_id, expires_at) values ('h1', $1, now() + interval '7 days')`,
		victim); err != nil {
		t.Fatal(err)
	}
	if err := mod.Suspend(ctx, pool, admin, victim, "冒充他人"); err != nil {
		t.Fatalf("Suspend: %v", err)
	}
	pool.QueryRow(ctx, `select count(*) from sessions where user_id=$1`, victim).Scan(&n)
	if n != 0 {
		t.Errorf("sessions after suspend = %d, want 0", n)
	}
	var sus *time.Time
	pool.QueryRow(ctx, `select suspended_at from users where id=$1`, victim).Scan(&sus)
	if sus == nil {
		t.Error("suspended_at not set")
	}
	if err := mod.Unsuspend(ctx, pool, admin, victim); err != nil {
		t.Fatalf("Unsuspend: %v", err)
	}

	// delete reply 硬删留审计
	rid := ids.New()
	if _, err := pool.Exec(ctx,
		`insert into replies (id, post_id, author_id, body_md) values ($1,$2,$3,'x')`,
		rid, postID, victim); err != nil {
		t.Fatal(err)
	}
	if err := mod.DeleteReply(ctx, pool, admin, rid, "违法内容"); err != nil {
		t.Fatalf("DeleteReply: %v", err)
	}
	pool.QueryRow(ctx, `select count(*) from replies where id=$1`, rid).Scan(&n)
	if n != 0 {
		t.Error("reply not deleted")
	}
	pool.QueryRow(ctx,
		`select count(*) from mod_actions where action='delete_reply' and target_id=$1`, rid).Scan(&n)
	if n != 1 {
		t.Error("delete_reply audit missing")
	}

	// 不存在的目标 → ErrNotFound
	if err := mod.HidePost(ctx, pool, admin, "nope", "x"); !errors.Is(err, mod.ErrNotFound) {
		t.Errorf("HidePost(nope) = %v, want ErrNotFound", err)
	}
}
