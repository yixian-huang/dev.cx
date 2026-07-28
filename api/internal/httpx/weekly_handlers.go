package httpx

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"devcx/internal/db"
)

// Highlight 是周刊 highlights jsonb 数组元素（发布时快照）。
type Highlight struct {
	Kind         string `json:"kind"` // project | post
	Slug         string `json:"slug"`
	Title        string `json:"title"`
	Deck         string `json:"deck"`
	AuthorHandle string `json:"author_handle"`
	ReplyCount   int    `json:"reply_count"`
}

// AssembleHighlights 拼装指定 ISO 年/周的 highlights：trending 前 4 项目 + 该周前 4 帖。
// 项目在前；CLI 与测试共用。
func AssembleHighlights(ctx context.Context, q db.Querier, year, week int) ([]Highlight, error) {
	out := make([]Highlight, 0, 8)

	// trending 前 4 项目（heat 全 0 也照取）
	projSQL := `select p.slug, p.name, p.tagline, u.handle,
		` + projectHeatSQL("p.id") + ` as heat
		from projects p
		join users u on u.id = p.owner_id
		order by heat desc, p.updated_at desc
		limit 4`
	prows, err := q.Query(ctx, projSQL)
	if err != nil {
		return nil, err
	}
	for prows.Next() {
		var slug, name, tagline, handle string
		var heat int
		if err := prows.Scan(&slug, &name, &tagline, &handle, &heat); err != nil {
			prows.Close()
			return nil, err
		}
		out = append(out, Highlight{
			Kind: "project", Slug: slug, Title: name, Deck: tagline,
			AuthorHandle: handle, ReplyCount: heat,
		})
	}
	if err := prows.Err(); err != nil {
		prows.Close()
		return nil, err
	}
	prows.Close()

	// 该 ISO 周内创建、未合并、按回复数 desc 前 4
	postSQL := `select po.slug, po.title, po.body_md, u.handle,
		(select count(*)::int from replies r where r.post_id = po.id and r.hidden_at is null) as reply_count
		from posts po
		join users u on u.id = po.author_id
		where po.merged_into is null
		  and po.hidden_at is null
		  and extract(isoyear from po.created_at)::int = $1
		  and extract(week from po.created_at)::int = $2
		order by reply_count desc, po.created_at desc
		limit 4`
	orows, err := q.Query(ctx, postSQL, year, week)
	if err != nil {
		return nil, err
	}
	for orows.Next() {
		var slug, title, body, handle string
		var rc int
		if err := orows.Scan(&slug, &title, &body, &handle, &rc); err != nil {
			orows.Close()
			return nil, err
		}
		out = append(out, Highlight{
			Kind: "post", Slug: slug, Title: title, Deck: truncRunes(body, 140),
			AuthorHandle: handle, ReplyCount: rc,
		})
	}
	if err := orows.Err(); err != nil {
		orows.Close()
		return nil, err
	}
	orows.Close()

	return out, nil
}

func (s *Server) handleWeeklyLatest(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var y, wk int
	var title, note string
	var raw []byte
	var pub time.Time
	err := s.deps.Pool.QueryRow(ctx,
		`select year, week, title, editor_note_md, highlights, published_at
		 from weekly_issues
		 where published_at is not null
		 order by year desc, week desc
		 limit 1`).
		Scan(&y, &wk, &title, &note, &raw, &pub)
	if err != nil {
		Err(w, 404, "not_found")
		return
	}
	s.writeWeekly(w, r, y, wk, title, note, raw, pub)
}

func (s *Server) handleWeeklyIssue(w http.ResponseWriter, r *http.Request) {
	y, err1 := strconv.Atoi(r.PathValue("year"))
	wk, err2 := strconv.Atoi(r.PathValue("week"))
	if err1 != nil || err2 != nil || y < 1 || wk < 1 || wk > 53 {
		Err(w, 404, "not_found")
		return
	}
	ctx := r.Context()
	var title, note string
	var raw []byte
	var pub time.Time
	err := s.deps.Pool.QueryRow(ctx,
		`select title, editor_note_md, highlights, published_at
		 from weekly_issues
		 where year=$1 and week=$2 and published_at is not null`, y, wk).
		Scan(&title, &note, &raw, &pub)
	if err != nil {
		Err(w, 404, "not_found")
		return
	}
	s.writeWeekly(w, r, y, wk, title, note, raw, pub)
}

func (s *Server) writeWeekly(w http.ResponseWriter, r *http.Request, y, wk int, title, note string, raw []byte, pub time.Time) {
	ctx := r.Context()
	highlights := []Highlight{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &highlights)
	}
	if highlights == nil {
		highlights = []Highlight{}
	}

	// 用 struct 固定 year/week 键序（map 会按字母序变成 week,year）。
	type weekRef struct {
		Year int `json:"year"`
		Week int `json:"week"`
	}
	var prev any
	var py, pw int
	if err := s.deps.Pool.QueryRow(ctx,
		`select year, week from weekly_issues
		 where published_at is not null and (year, week) < ($1, $2)
		 order by year desc, week desc limit 1`, y, wk).
		Scan(&py, &pw); err == nil {
		prev = weekRef{Year: py, Week: pw}
	}

	var next any
	var ny, nw int
	if err := s.deps.Pool.QueryRow(ctx,
		`select year, week from weekly_issues
		 where published_at is not null and (year, week) > ($1, $2)
		 order by year asc, week asc limit 1`, y, wk).
		Scan(&ny, &nw); err == nil {
		next = weekRef{Year: ny, Week: nw}
	}

	WriteJSON(w, 200, map[string]any{
		"year": y, "week": wk, "title": title, "editor_note_md": note,
		"highlights": highlights,
		"published_at": pub.UTC().Format(time.RFC3339),
		"prev": prev, "next": next,
	})
}
