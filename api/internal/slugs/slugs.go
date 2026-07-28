package slugs

import (
	"crypto/rand"
	"errors"
	"math/big"
	"regexp"
	"strings"
)

var ErrInvalid = errors.New("invalid slug")

var shape = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`)

// Validate 与 handle 同规则：2–32 位小写字母数字与中划线，首尾必须字母数字，禁止连续中划线。
func Validate(s string) error {
	if len(s) < 2 || len(s) > 32 {
		return ErrInvalid
	}
	if !shape.MatchString(s) {
		return ErrInvalid
	}
	if strings.Contains(s, "--") {
		return ErrInvalid
	}
	return nil
}

const alphabet = "abcdefghjkmnpqrstvwxyz23456789" // 无易混淆字符，与 invite 包一致

func randomPart(n int) string {
	b := make([]byte, n)
	for i := range b {
		k, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			// crypto/rand 失败时退回固定字符，调用方仍会得到合法 slug；
			// 唯一性由数据库唯一约束 + 调用方重试兜底。
			b[i] = alphabet[0]
			continue
		}
		b[i] = alphabet[k.Int64()]
	}
	return string(b)
}

// Generate 从标题生成帖子 slug：抽出 ASCII 词干（最长 24 字符）加 4 位随机后缀；
// 标题无可用 ASCII（如纯中文）时返回 6 位纯随机。永远返回通过 Validate 的值。
func Generate(title string) string {
	var b strings.Builder
	lastDash := true
	for _, r := range strings.ToLower(title) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		default:
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		}
		if b.Len() >= 24 {
			break
		}
	}
	stem := strings.Trim(b.String(), "-")
	for strings.Contains(stem, "--") {
		stem = strings.ReplaceAll(stem, "--", "-")
	}
	if len(stem) < 2 {
		return randomPart(6)
	}
	if len(stem) > 24 {
		stem = strings.Trim(stem[:24], "-")
	}
	return stem + "-" + randomPart(4)
}
