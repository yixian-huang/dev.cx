package testutil

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"devcx/internal/db"
)

// testDBLockKey 是一个任意固定的 Postgres advisory lock key。所有测试包共用同一个
// devcx_test 库；`go test ./...` 默认会把各包的测试二进制并行跑起来，若不加以协调，
// 一个包的 truncate 会在另一个包的测试运行到一半时把它的数据冲掉。用这个 session 级
// advisory lock 把「一次完整测试」的持续时间（从 TestPool 拿锁到 t.Cleanup 释放锁）
// 串行化，从而不再需要 `go test ./... -p 1`。
const testDBLockKey = 727501001

func TestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)

	// advisory lock 是 session（连接）级别的：必须在同一条连接上 lock/unlock，
	// 所以这里从池里单独 Acquire 一条连接并一直持有到测试结束，而不是用 pool.Exec
	// （pool.Exec 每次可能借用不同的底层连接，unlock 会失败）。
	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire lock conn: %v", err)
	}
	if _, err := conn.Exec(ctx, "select pg_advisory_lock($1)", int64(testDBLockKey)); err != nil {
		conn.Release()
		t.Fatalf("advisory lock: %v", err)
	}
	t.Cleanup(func() {
		_, _ = conn.Exec(ctx, "select pg_advisory_unlock($1)", int64(testDBLockKey))
		conn.Release()
	})

	if err := db.MigrateUp(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	_, err = pool.Exec(ctx,
		`truncate users, sessions, invite_codes, invite_redemptions, handle_history, user_links, projects, posts, replies, follows, notifications, weekly_issues, mod_actions, settings, waitlist cascade`)
	if err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return pool
}
