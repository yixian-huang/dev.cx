package db_test

import (
	"context"
	"testing"

	"devcx/internal/ids"
	"devcx/internal/testutil"
)

func TestContentSchemaAcceptsMinimalRows(t *testing.T) {
	pool := testutil.TestPool(t)
	ctx := context.Background()
	uid := ids.New()
	_, err := pool.Exec(ctx, `insert into users (id,email,display_name,handle) values ($1,'a@b.c','A','tester')`, uid)
	if err != nil {
		t.Fatal(err)
	}
	pid := ids.New()
	if _, err = pool.Exec(ctx, `insert into projects (id,slug,owner_id,name,tagline,stage) values ($1,'demo-proj',$2,'Demo','one line','wip')`, pid, uid); err != nil {
		t.Fatal(err)
	}
	tid := ids.New()
	if _, err = pool.Exec(ctx, `insert into posts (id,slug,author_id,project_id,type,title,body_md) values ($1,'demo-post',$2,$3,'show','T','B')`, tid, uid, pid); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `insert into replies (id,post_id,author_id,body_md) values ($1,$2,$3,'re')`, ids.New(), tid, uid); err != nil {
		t.Fatal(err)
	}
}
