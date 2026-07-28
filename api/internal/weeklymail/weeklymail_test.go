package weeklymail_test

import (
	"context"
	"strings"
	"testing"

	"devcx/internal/httpx"
	"devcx/internal/ids"
	"devcx/internal/testutil"
	"devcx/internal/weeklymail"
)

func TestRecipientsAndCompose(t *testing.T) {
	pool := testutil.TestPool(t)
	ctx := context.Background()

	mk := func(handle string, verified, weekly bool) {
		id := ids.New()
		if _, err := pool.Exec(ctx,
			`insert into users (id, email, display_name, handle, email_weekly) values ($1,$2,'U',$1,$3)`,
			id, handle+"@dev.cx", weekly); err != nil {
			t.Fatal(err)
		}
		if verified {
			pool.Exec(ctx, `update users set email_verified_at=now() where id=$1`, id)
		}
	}
	mk("w-yes", true, true)         // 收
	mk("w-unverified", false, true) // 不收:未验证
	mk("w-off", true, false)        // 不收:已关

	rs, err := weeklymail.Recipients(ctx, pool)
	if err != nil {
		t.Fatalf("Recipients: %v", err)
	}
	if len(rs) != 1 || rs[0].Email != "w-yes@dev.cx" {
		t.Errorf("recipients = %+v, want only w-yes", rs)
	}

	subject, body := weeklymail.Compose(2026, 31, "第一期", "编辑注",
		[]httpx.Highlight{{Kind: "post", Slug: "s1", Title: "帖一", AuthorHandle: "w-yes", ReplyCount: 3}},
		"https://dev.cx")
	if !strings.Contains(subject, "W31") {
		t.Errorf("subject = %q", subject)
	}
	for _, want := range []string{"第一期", "编辑注", "帖一", "https://dev.cx/weekly/2026/31", "退订"} {
		if !strings.Contains(body, want) {
			t.Errorf("body missing %q:\n%s", want, body)
		}
	}
}
