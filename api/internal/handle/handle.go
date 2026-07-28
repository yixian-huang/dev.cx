package handle

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"devcx/internal/db"
)

var ErrInvalid = errors.New("invalid handle")

var re = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`)

// Validate：小写字母/数字/中划线，2–32 位，首尾必须字母数字，禁止连续中划线。
func Validate(h string) error {
	if len(h) < 2 || len(h) > 32 {
		return ErrInvalid
	}
	if !re.MatchString(h) {
		return ErrInvalid
	}
	if strings.Contains(h, "--") {
		return ErrInvalid
	}
	return nil
}

// Available 返回 "" 表示可注册；否则返回错误码 invalid|reserved|taken。
func Available(ctx context.Context, q db.Querier, h string) (string, error) {
	if Validate(h) != nil {
		return "invalid", nil
	}
	var n int
	if err := q.QueryRow(ctx, `select count(*) from reserved_handles where handle=$1`, h).Scan(&n); err != nil {
		return "", err
	}
	if n > 0 {
		return "reserved", nil
	}
	err := q.QueryRow(ctx,
		`select count(*) from (
		   select 1 from users where handle=$1
		   union all
		   select 1 from handle_history where old_handle=$1) s`, h).Scan(&n)
	if err != nil {
		return "", err
	}
	if n > 0 {
		return "taken", nil
	}
	return "", nil
}
