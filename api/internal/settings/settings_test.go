package settings_test

import (
	"context"
	"os"
	"testing"

	"devcx/internal/ids"
	"devcx/internal/settings"
	"devcx/internal/testutil"
)

func TestSettingsResolve(t *testing.T) {
	pool := testutil.TestPool(t)
	ctx := context.Background()

	uid := ids.New()
	if _, err := pool.Exec(ctx,
		`insert into users (id, email, display_name, handle) values ($1,'s@dev.cx','U','sadmin')`,
		uid); err != nil {
		t.Fatal(err)
	}

	// 白名单外的 key 拒绝
	if _, ok := settings.Lookup("nope"); ok {
		t.Error("Lookup(nope) should be false")
	}
	if err := settings.Set(ctx, pool, "nope", "x", uid); err == nil {
		t.Error("Set(nope) should fail")
	}

	// 未配置:Get false;Resolve 走 env 兜底
	if _, ok := settings.Get(ctx, pool, "smtp_host"); ok {
		t.Error("Get(smtp_host) before set should be false")
	}
	os.Setenv("SMTP_HOST", "env.example.com")
	defer os.Unsetenv("SMTP_HOST")
	if v := settings.Resolve(ctx, pool, "smtp_host"); v != "env.example.com" {
		t.Errorf("Resolve env fallback = %q", v)
	}

	// Set 后 DB 优先;可覆盖更新
	if err := settings.Set(ctx, pool, "smtp_host", "db.example.com", uid); err != nil {
		t.Fatalf("Set: %v", err)
	}
	if v := settings.Resolve(ctx, pool, "smtp_host"); v != "db.example.com" {
		t.Errorf("Resolve db-first = %q", v)
	}
	if err := settings.Set(ctx, pool, "smtp_host", "db2.example.com", uid); err != nil {
		t.Fatalf("Set upsert: %v", err)
	}
	if v, _ := settings.Get(ctx, pool, "smtp_host"); v != "db2.example.com" {
		t.Errorf("Get after upsert = %q", v)
	}

	// Unset 回退 env
	if err := settings.Unset(ctx, pool, "smtp_host"); err != nil {
		t.Fatalf("Unset: %v", err)
	}
	if v := settings.Resolve(ctx, pool, "smtp_host"); v != "env.example.com" {
		t.Errorf("Resolve after unset = %q", v)
	}
}
