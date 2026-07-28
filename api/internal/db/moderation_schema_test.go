package db_test

import (
	"context"
	"testing"

	"devcx/internal/testutil"
)

func TestModerationSchema(t *testing.T) {
	pool := testutil.TestPool(t)
	ctx := context.Background()
	for _, c := range [][2]string{
		{"users", "role"}, {"users", "muted_until"}, {"users", "suspended_at"},
		{"posts", "hidden_at"}, {"posts", "hidden_reason"},
		{"replies", "hidden_at"}, {"replies", "hidden_reason"},
		{"notifications", "message"},
		{"mod_actions", "action"},
	} {
		var ok bool
		if err := pool.QueryRow(ctx,
			`select exists(select 1 from information_schema.columns
			 where table_name=$1 and column_name=$2)`, c[0], c[1]).Scan(&ok); err != nil {
			t.Fatalf("query %v: %v", c, err)
		}
		if !ok {
			t.Errorf("missing column %s.%s", c[0], c[1])
		}
	}
}
