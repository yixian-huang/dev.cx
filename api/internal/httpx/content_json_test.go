package httpx

import (
	"context"
	"testing"
	"time"
)

func TestReplyJSONShape(t *testing.T) {
	s := &Server{}
	parent := "01abc"
	row := replyRow{
		ID: "01r", PostID: "01p", AuthorID: "01u", BodyMD: "hi",
		ParentID: &parent, Floor: 0, CreatedAt: time.Unix(0, 0).UTC(),
	}
	got := s.replyJSON(context.Background(), row)
	for _, k := range []string{"id", "floor", "parent_id", "body_md", "author", "created_at"} {
		if _, ok := got[k]; !ok {
			t.Errorf("replyJSON missing key %q", k)
		}
	}
	if got["parent_id"] != "01abc" {
		t.Errorf("parent_id = %v", got["parent_id"])
	}
}

func TestReplyJSONNilParent(t *testing.T) {
	s := &Server{}
	got := s.replyJSON(context.Background(), replyRow{ID: "01r", Floor: 3})
	if got["parent_id"] != nil {
		t.Errorf("parent_id = %v, want nil", got["parent_id"])
	}
	if got["floor"] != 3 {
		t.Errorf("floor = %v, want 3", got["floor"])
	}
}
