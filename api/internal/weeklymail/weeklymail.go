// Package weeklymail 周报邮件:收件人筛选(已验证邮箱 + email_weekly 开)、正文拼装、群发。
// CLI(mkweekly)是唯一触发方;发送失败逐个记录不中断(尽力送达,站内 /weekly 恒为权威)。
package weeklymail

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"devcx/internal/db"
	"devcx/internal/httpx"
	"devcx/internal/mailer"
	"devcx/internal/settings"
)

type Recipient struct {
	Email, Handle string
}

func Recipients(ctx context.Context, q db.Querier) ([]Recipient, error) {
	rows, err := q.Query(ctx,
		`select email, handle from users
		 where email_verified_at is not null and email_weekly
		 order by created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Recipient
	for rows.Next() {
		var r Recipient
		if err := rows.Scan(&r.Email, &r.Handle); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func Compose(year, week int, title, note string, hs []httpx.Highlight, baseURL string) (string, string) {
	subject := fmt.Sprintf("dev.cx 周报 %d-W%02d · %s", year, week, title)
	var b strings.Builder
	fmt.Fprintf(&b, "%s\n\n", title)
	if strings.TrimSpace(note) != "" {
		fmt.Fprintf(&b, "%s\n\n", strings.TrimSpace(note))
	}
	fmt.Fprintf(&b, "本期看点:\n")
	for _, h := range hs {
		kind := "帖"
		path := "/t/"
		if h.Kind == "project" {
			kind = "项目"
			path = "/p/"
		}
		fmt.Fprintf(&b, "· [%s] %s — @%s(%d 回复)%s%s%s\n", kind, h.Title, h.AuthorHandle, h.ReplyCount, baseURL, path, h.Slug)
	}
	fmt.Fprintf(&b, "\n完整周报:%s/weekly/%d/%d\n\n", baseURL, year, week)
	fmt.Fprintf(&b, "——\n不想收周报?到 %s/me 设置里关闭(退订)。\n", baseURL)
	return subject, b.String()
}

// SendIssue 读取该期 weekly_issues 与 settings SMTP,逐个发送;返回成功数。
func SendIssue(ctx context.Context, pool *pgxpool.Pool, year, week int, baseURL string) (int, error) {
	var title, note string
	if err := pool.QueryRow(ctx,
		`select title, editor_note_md from weekly_issues where year=$1 and week=$2 and published_at is not null`,
		year, week).Scan(&title, &note); err != nil {
		return 0, fmt.Errorf("issue not published: %w", err)
	}
	hs, err := httpx.AssembleHighlights(ctx, pool, year, week)
	if err != nil {
		return 0, err
	}
	host := settings.Resolve(ctx, pool, "smtp_host")
	port := settings.Resolve(ctx, pool, "smtp_port")
	from := settings.Resolve(ctx, pool, "smtp_from")
	if host == "" || port == "" || from == "" {
		return 0, fmt.Errorf("smtp unconfigured")
	}
	user := settings.Resolve(ctx, pool, "smtp_username")
	pw := settings.Resolve(ctx, pool, "smtp_password")
	rs, err := Recipients(ctx, pool)
	if err != nil {
		return 0, err
	}
	subject, body := Compose(year, week, title, note, hs, baseURL)
	sent := 0
	for _, r := range rs {
		if err := mailer.Send(host, port, user, pw, from, r.Email, subject, body); err != nil {
			log.Printf("weeklymail: send to %s failed: %v", r.Handle, err)
			continue
		}
		sent++
	}
	return sent, nil
}
