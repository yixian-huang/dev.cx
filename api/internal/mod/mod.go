// Package mod 是全部处置动作的唯一实现:每个动作 = 主写入 + mod_actions 审计行,
// 在同一事务内落库——处置与审计要么同时成立要么都不(/guidelines 违规处理透明度的落点)。
package mod

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"devcx/internal/ids"
)

var ErrNotFound = errors.New("mod: target not found")

func inTx(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func audit(ctx context.Context, tx pgx.Tx, actorID, action, targetKind, targetID, reason string) error {
	_, err := tx.Exec(ctx,
		`insert into mod_actions (id, actor_id, action, target_kind, target_id, reason)
		 values ($1,$2,$3,$4,$5,$6)`,
		ids.New(), actorID, action, targetKind, targetID, reason)
	return err
}

// setHidden 是 post/reply 隐藏与恢复的共同实现;重复 hide 只更新 reason(幂等)。
func setHidden(ctx context.Context, pool *pgxpool.Pool, actorID, table, kind, id string, hide bool, reason, action string) error {
	return inTx(ctx, pool, func(tx pgx.Tx) error {
		var sql string
		if hide {
			sql = `update ` + table + ` set hidden_at=now(), hidden_reason=$2 where id=$1`
		} else {
			sql = `update ` + table + ` set hidden_at=null, hidden_reason='' where id=$1`
			reason = ""
		}
		args := []any{id}
		if hide {
			args = append(args, reason)
		}
		tag, err := tx.Exec(ctx, sql, args...)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return audit(ctx, tx, actorID, action, kind, id, reason)
	})
}

func HidePost(ctx context.Context, pool *pgxpool.Pool, actorID, postID, reason string) error {
	return setHidden(ctx, pool, actorID, "posts", "post", postID, true, reason, "hide_post")
}

func UnhidePost(ctx context.Context, pool *pgxpool.Pool, actorID, postID string) error {
	return setHidden(ctx, pool, actorID, "posts", "post", postID, false, "", "unhide_post")
}

func HideReply(ctx context.Context, pool *pgxpool.Pool, actorID, replyID, reason string) error {
	return setHidden(ctx, pool, actorID, "replies", "reply", replyID, true, reason, "hide_reply")
}

func UnhideReply(ctx context.Context, pool *pgxpool.Pool, actorID, replyID string) error {
	return setHidden(ctx, pool, actorID, "replies", "reply", replyID, false, "", "unhide_reply")
}

// DeletePost 硬删——仅违法内容(法律要求彻底移除)使用;回复随 schema cascade 消失,审计行留存。
func DeletePost(ctx context.Context, pool *pgxpool.Pool, actorID, postID, reason string) error {
	return inTx(ctx, pool, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `delete from posts where id=$1`, postID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return audit(ctx, tx, actorID, "delete_post", "post", postID, reason)
	})
}

func DeleteReply(ctx context.Context, pool *pgxpool.Pool, actorID, replyID, reason string) error {
	return inTx(ctx, pool, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `delete from replies where id=$1`, replyID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return audit(ctx, tx, actorID, "delete_reply", "reply", replyID, reason)
	})
}

// Warn 写 moderation 站内通知(message 为警告正文)+ 审计;reason 与 message 同文。
func Warn(ctx context.Context, pool *pgxpool.Pool, actorID, userID, message string) error {
	return inTx(ctx, pool, func(tx pgx.Tx) error {
		var exists bool
		if err := tx.QueryRow(ctx,
			`select exists(select 1 from users where id=$1)`, userID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return ErrNotFound
		}
		if _, err := tx.Exec(ctx,
			`insert into notifications (id, user_id, kind, actor_id, message)
			 values ($1, $2, 'moderation', $3, $4)`,
			ids.New(), userID, actorID, message); err != nil {
			return err
		}
		return audit(ctx, tx, actorID, "warn", "user", userID, message)
	})
}

func setUserState(ctx context.Context, pool *pgxpool.Pool, actorID, userID, sql, action, reason string, args ...any) error {
	return inTx(ctx, pool, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, sql, append([]any{userID}, args...)...)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		if action == "suspend" {
			if _, err := tx.Exec(ctx, `delete from sessions where user_id=$1`, userID); err != nil {
				return err
			}
		}
		return audit(ctx, tx, actorID, action, "user", userID, reason)
	})
}

func Mute(ctx context.Context, pool *pgxpool.Pool, actorID, userID string, until time.Time, reason string) error {
	return setUserState(ctx, pool, actorID, userID,
		`update users set muted_until=$2 where id=$1`, "mute", reason, until)
}

func Unmute(ctx context.Context, pool *pgxpool.Pool, actorID, userID string) error {
	return setUserState(ctx, pool, actorID, userID,
		`update users set muted_until=null where id=$1`, "unmute", "")
}

func Suspend(ctx context.Context, pool *pgxpool.Pool, actorID, userID, reason string) error {
	return setUserState(ctx, pool, actorID, userID,
		`update users set suspended_at=now() where id=$1`, "suspend", reason)
}

func Unsuspend(ctx context.Context, pool *pgxpool.Pool, actorID, userID string) error {
	return setUserState(ctx, pool, actorID, userID,
		`update users set suspended_at=null where id=$1`, "unsuspend", "")
}
