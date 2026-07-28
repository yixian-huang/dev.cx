package db_test

import (
	"context"
	"testing"

	"devcx/internal/testutil"
)

func TestMigrationsCreateIdentityTables(t *testing.T) {
	pool := testutil.TestPool(t)
	for _, table := range []string{"users", "sessions", "invite_codes", "invite_redemptions", "reserved_handles", "handle_history", "user_links"} {
		var n int
		err := pool.QueryRow(context.Background(),
			"select count(*) from information_schema.tables where table_name=$1", table).Scan(&n)
		if err != nil || n != 1 {
			t.Fatalf("table %s missing (n=%d err=%v)", table, n, err)
		}
	}
}
