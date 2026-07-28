package slugs_test

import (
	"regexp"
	"strings"
	"testing"

	"devcx/internal/slugs"
)

func TestValidate(t *testing.T) {
	ok := []string{"meal-split", "a1", "x0-y9", "go-rust-tool"}
	bad := []string{"", "a", "-abc", "abc-", "ab--cd", "Meal-Split", "中文项目", "a_b", "a.b",
		"this-slug-is-definitely-longer-than-32-chars"}
	for _, s := range ok {
		if err := slugs.Validate(s); err != nil {
			t.Errorf("%q should be valid: %v", s, err)
		}
	}
	for _, s := range bad {
		if err := slugs.Validate(s); err == nil {
			t.Errorf("%q should be invalid", s)
		}
	}
}

var shape = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`)

func TestGenerate(t *testing.T) {
	cases := []struct {
		title      string
		wantPrefix string // "" 表示不检查前缀（纯随机）
	}{
		{"Raft election timeout tuning", "raft-election-timeout"},
		{"AA 分账的最优解", ""},    // 纯中文 → 纯随机
		{"WASM 的惊喜", "wasm"}, // 混合 → 取 ASCII 片段
		{"   ", ""},
	}
	for _, c := range cases {
		got := slugs.Generate(c.title)
		if err := slugs.Validate(got); err != nil {
			t.Errorf("Generate(%q) = %q, not a valid slug: %v", c.title, got, err)
		}
		if !shape.MatchString(got) {
			t.Errorf("Generate(%q) = %q, bad shape", c.title, got)
		}
		if c.wantPrefix != "" && !strings.HasPrefix(got, c.wantPrefix+"-") {
			t.Errorf("Generate(%q) = %q, want prefix %q-", c.title, got, c.wantPrefix)
		}
	}
	// 唯一性：同一标题两次生成应不同（随机后缀）
	if slugs.Generate("same title") == slugs.Generate("same title") {
		t.Error("Generate is not random")
	}
}
