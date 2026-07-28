// Package settings 是运营可写配置的唯一读写层(spec 增补):键白名单固定,
// 读取 DB 优先、env 兜底;secret 键的「只写不回显」由 API 层负责,这里不区分。
package settings

import (
	"context"
	"errors"
	"os"

	"devcx/internal/db"
)

type Key struct {
	Name   string
	Secret bool
	Env    string // env 兜底变量名;空=无兜底
}

var Known = []Key{
	{"smtp_host", false, "SMTP_HOST"},
	{"smtp_port", false, "SMTP_PORT"},
	{"smtp_username", false, "SMTP_USERNAME"},
	{"smtp_password", true, "SMTP_PASSWORD"},
	{"smtp_from", false, "SMTP_FROM"},
	{"github_client_id", false, "GITHUB_CLIENT_ID"},
	{"github_client_secret", true, "GITHUB_CLIENT_SECRET"},
}

var ErrUnknownKey = errors.New("settings: unknown key")

func Lookup(name string) (Key, bool) {
	for _, k := range Known {
		if k.Name == name {
			return k, true
		}
	}
	return Key{}, false
}

func Get(ctx context.Context, q db.Querier, name string) (string, bool) {
	var v string
	if err := q.QueryRow(ctx, `select value from settings where key=$1`, name).Scan(&v); err != nil {
		return "", false
	}
	return v, true
}

func Resolve(ctx context.Context, q db.Querier, name string) string {
	if v, ok := Get(ctx, q, name); ok {
		return v
	}
	if k, ok := Lookup(name); ok && k.Env != "" {
		return os.Getenv(k.Env)
	}
	return ""
}

func Set(ctx context.Context, q db.Querier, name, value, actorID string) error {
	if _, ok := Lookup(name); !ok {
		return ErrUnknownKey
	}
	_, err := q.Exec(ctx,
		`insert into settings (key, value, updated_by) values ($1,$2,$3)
		 on conflict (key) do update set value=$2, updated_by=$3, updated_at=now()`,
		name, value, actorID)
	return err
}

func Unset(ctx context.Context, q db.Querier, name string) error {
	if _, ok := Lookup(name); !ok {
		return ErrUnknownKey
	}
	_, err := q.Exec(ctx, `delete from settings where key=$1`, name)
	return err
}
