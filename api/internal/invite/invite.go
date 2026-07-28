package invite

import (
	"context"
	"crypto/rand"
	"errors"
	"math/big"

	"github.com/jackc/pgx/v5"

	"devcx/internal/db"
)

var ErrInviteInvalid = errors.New("invite invalid")

const codeAlphabet = "abcdefghjkmnpqrstvwxyz23456789" // 无易混淆字符

func generateCode() (string, error) {
	b := make([]byte, 10)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(codeAlphabet))))
		if err != nil {
			return "", err
		}
		b[i] = codeAlphabet[n.Int64()]
	}
	return string(b), nil
}

func Mint(ctx context.Context, q db.Querier, n, maxUses int, note string) ([]string, error) {
	codes := make([]string, 0, n)
	for i := 0; i < n; i++ {
		code, err := generateCode()
		if err != nil {
			return nil, err
		}
		if _, err := q.Exec(ctx,
			`insert into invite_codes (code, max_uses, note) values ($1,$2,$3)`,
			code, maxUses, note); err != nil {
			return nil, err
		}
		codes = append(codes, code)
	}
	return codes, nil
}

// Redeem 在事务内核销：行锁防并发超用。
func Redeem(ctx context.Context, tx pgx.Tx, code, userID string) error {
	var maxUses, used int
	err := tx.QueryRow(ctx,
		`select max_uses, used_count from invite_codes
		 where code=$1 and (expires_at is null or expires_at > now()) for update`,
		code).Scan(&maxUses, &used)
	if err != nil || used >= maxUses {
		return ErrInviteInvalid
	}
	if _, err := tx.Exec(ctx,
		`update invite_codes set used_count = used_count+1 where code=$1`, code); err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`insert into invite_redemptions (code, user_id) values ($1,$2)`, code, userID)
	return err
}
