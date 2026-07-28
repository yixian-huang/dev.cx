package db_test

import (
	"context"
	"testing"

	"devcx/internal/ids"
	"devcx/internal/testutil"
)

func TestContentShapeColumns(t *testing.T) {
	pool := testutil.TestPool(t)
	ctx := context.Background()
	want := map[string][]string{
		"projects": {"screenshots", "tags", "links"},
		"posts":    {"uncertainties", "links", "merged_at", "merged_by"},
		"replies":  {"parent_id", "floor"},
	}
	for table, cols := range want {
		for _, col := range cols {
			var n int
			err := pool.QueryRow(ctx,
				`select count(*) from information_schema.columns where table_name=$1 and column_name=$2`,
				table, col).Scan(&n)
			if err != nil || n != 1 {
				t.Errorf("%s.%s missing (n=%d err=%v)", table, col, n, err)
			}
		}
	}
}

func TestNestedReplyAndFloor(t *testing.T) {
	pool := testutil.TestPool(t)
	ctx := context.Background()
	uid, pid, tid := ids.New(), ids.New(), ids.New()
	if _, err := pool.Exec(ctx,
		`insert into users (id,email,display_name,handle) values ($1,'c@d.e','C','shaper')`, uid); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx,
		`insert into projects (id,slug,owner_id,name,tagline,stage,tags,screenshots,links)
		 values ($1,'shape-proj',$2,'P','t','wip',$3,$4,$5)`,
		pid, uid, []string{"go", "rust"}, []string{"https://img/1.png"},
		`[{"label":"演示","url":"https://demo"}]`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx,
		`insert into posts (id,slug,author_id,project_id,type,title,body_md,uncertainties,links)
		 values ($1,'shape-post',$2,$3,'show','T','B',$4,$5)`,
		tid, uid, pid, []string{"精度问题"}, `[{"label":"仓库","url":"https://repo"}]`); err != nil {
		t.Fatal(err)
	}
	top := ids.New()
	if _, err := pool.Exec(ctx,
		`insert into replies (id,post_id,author_id,body_md,floor) values ($1,$2,$3,'top',1)`,
		top, tid, uid); err != nil {
		t.Fatal(err)
	}
	// 子回复：parent_id 指向楼层回复，floor 为 0（子回复不占楼层）
	if _, err := pool.Exec(ctx,
		`insert into replies (id,post_id,author_id,body_md,parent_id,floor) values ($1,$2,$3,'child',$4,0)`,
		ids.New(), tid, uid, top); err != nil {
		t.Fatal(err)
	}
	// 二级嵌套必须被拒（parent 自身有 parent 时，DB 无法约束，由 handler 保证；此处仅验证列可用）
	var floor int
	var parent *string
	if err := pool.QueryRow(ctx,
		`select floor, parent_id from replies where id=$1`, top).Scan(&floor, &parent); err != nil {
		t.Fatal(err)
	}
	if floor != 1 || parent != nil {
		t.Fatalf("top reply floor=%d parent=%v, want 1/nil", floor, parent)
	}
}
