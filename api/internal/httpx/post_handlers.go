package httpx

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"devcx/internal/ids"
	"devcx/internal/slugs"
)

const (
	maxPostTitleLen   = 140
	maxPostBodyLen    = 50000
	maxFeedbackWanted = 6
	maxUncertainties  = 6
	maxUncertaintyLen = 500
	maxPostLinks      = 6
)

var validPostType = map[string]bool{"show": true, "build": true, "ask": true, "discuss": true}

// mergeablePostType：合并端点的语义是「合并重复讨论」，不是通用的帖子隐藏机制。
// 只有 ask/discuss 这类讨论贴可以被合并；show/build 这类项目正文一律不许，
// 否则任何人都能借「合并」把别人挂在项目上的展示贴打包藏进自己的帖子里。
var mergeablePostType = map[string]bool{"ask": true, "discuss": true}

func validatePostInput(typ, title, body string, fw, unc []string, links []map[string]string) string {
	return validatePostInputOpts(typ, title, body, fw, unc, links, false)
}

// draft=true 时 title 允许空（存草稿过程中可能尚未起标题）。
func validatePostInputOpts(typ, title, body string, fw, unc []string, links []map[string]string, draft bool) string {
	if !validPostType[typ] {
		return "bad_type"
	}
	if !draft && strings.TrimSpace(title) == "" {
		return "bad_input"
	}
	if utf8.RuneCountInString(title) > maxPostTitleLen || utf8.RuneCountInString(body) > maxPostBodyLen {
		return "too_long"
	}
	if len(fw) > maxFeedbackWanted || len(unc) > maxUncertainties || len(links) > maxPostLinks {
		return "too_many"
	}
	for _, u := range unc {
		if utf8.RuneCountInString(u) > maxUncertaintyLen {
			return "too_long"
		}
	}
	for _, l := range links {
		if strings.TrimSpace(l["label"]) == "" || utf8.RuneCountInString(l["label"]) > maxLinkLabelLen {
			return "bad_link"
		}
		if !allowedURL(l["url"], false) || utf8.RuneCountInString(l["url"]) > maxURLLen {
			return "bad_link"
		}
	}
	return ""
}

func (s *Server) handleCreatePost(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	if !s.writeGate(w, r, uid) {
		return
	}
	var in struct {
		Type           string              `json:"type"`
		ProjectSlug    string              `json:"project_slug"`
		Title          string              `json:"title"`
		BodyMD         string              `json:"body_md"`
		FeedbackWanted []string            `json:"feedback_wanted"`
		Uncertainties  []string            `json:"uncertainties"`
		Links          []map[string]string `json:"links"`
		Status         string              `json:"status"`     // draft | published；默认 published
		DraftSlug      string              `json:"draft_slug"` // 有则 upsert 该草稿
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	in.Type = strings.ToLower(strings.TrimSpace(in.Type))
	status := strings.ToLower(strings.TrimSpace(in.Status))
	if status == "" {
		status = "published"
	}
	if status != "draft" && status != "published" {
		Err(w, 400, "bad_status")
		return
	}
	isDraft := status == "draft"
	title := strings.TrimSpace(in.Title)
	if code := validatePostInputOpts(in.Type, title, in.BodyMD,
		in.FeedbackWanted, in.Uncertainties, in.Links, isDraft); code != "" {
		Err(w, 400, code)
		return
	}
	ctx := r.Context()
	var projectID *string
	if in.ProjectSlug != "" {
		var pid, owner string
		if err := s.deps.Pool.QueryRow(ctx,
			`select id, owner_id from projects where slug=$1`,
			strings.ToLower(in.ProjectSlug)).Scan(&pid, &owner); err != nil {
			Err(w, 400, "project_not_found")
			return
		}
		if owner != uid {
			Err(w, 403, "forbidden")
			return
		}
		projectID = &pid
	} else if in.Type == "show" || in.Type == "build" {
		// KB dev-cx/content-and-posting：Show/Build 需关联项目实体
		Err(w, 400, "project_required")
		return
	}

	linksJSON, _ := json.Marshal(nonNilLinks(in.Links))
	draftSlug := strings.ToLower(strings.TrimSpace(in.DraftSlug))

	// upsert 既有草稿：仅作者 + status=draft；可保留 draft 或发布 published。
	if draftSlug != "" {
		cur, err := scanPost(s.deps.Pool.QueryRow(ctx,
			`select `+postCols+` from posts where slug=$1`, draftSlug))
		if err != nil {
			Err(w, 404, "not_found")
			return
		}
		if cur.AuthorID != uid {
			Err(w, 403, "forbidden")
			return
		}
		if cur.Status != "draft" {
			Err(w, 409, "not_draft")
			return
		}
		if cur.HiddenAt != nil {
			Err(w, 403, "hidden")
			return
		}
		// 类型以 body 为准（compose 可改类型）；slug 不随标题变。
		if _, err := s.deps.Pool.Exec(ctx,
			`update posts set type=$1, project_id=$2, title=$3, body_md=$4, status=$5,
			 feedback_wanted=$6, uncertainties=$7, links=$8, updated_at=now()
			 where id=$9`,
			in.Type, projectID, title, in.BodyMD, status,
			nonNilStrings(in.FeedbackWanted), nonNilStrings(in.Uncertainties), linksJSON, cur.ID); err != nil {
			Err(w, 500, "internal")
			return
		}
		if status == "published" {
			s.notifyOnCreatePost(ctx, uid, cur.ID, in.Type, in.BodyMD, projectID)
		}
		code := http.StatusOK
		if status == "published" {
			// 发布视为「创建」语义对前端仍可读 slug
			code = http.StatusOK
		}
		s.writePostBySlug(w, r, draftSlug, code)
		return
	}

	id := ids.New()
	var slug string
	// slug 唯一性靠数据库约束；随机后缀碰撞时重试三次
	for attempt := 0; attempt < 3; attempt++ {
		seed := title
		if seed == "" {
			seed = "draft"
		}
		slug = slugs.Generate(seed)
		_, err := s.deps.Pool.Exec(ctx,
			`insert into posts (id, slug, author_id, project_id, type, title, body_md, status,
			                    feedback_wanted, uncertainties, links)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			id, slug, uid, projectID, in.Type, title, in.BodyMD, status,
			nonNilStrings(in.FeedbackWanted), nonNilStrings(in.Uncertainties), linksJSON)
		if err == nil {
			if status == "published" {
				// best-effort 通知：失败不阻塞发帖响应。
				s.notifyOnCreatePost(ctx, uid, id, in.Type, in.BodyMD, projectID)
			}
			s.writePostBySlug(w, r, slug, http.StatusCreated)
			return
		}
		if !isUniqueViolation(err) {
			Err(w, 500, "internal")
			return
		}
	}
	Err(w, 500, "internal")
}

func (s *Server) handleGetPost(w http.ResponseWriter, r *http.Request) {
	s.writePostBySlug(w, r, strings.ToLower(r.PathValue("slug")), http.StatusOK)
}

func (s *Server) writePostBySlug(w http.ResponseWriter, r *http.Request, slug string, code int) {
	ctx := r.Context()
	p, err := scanPost(s.deps.Pool.QueryRow(ctx,
		`select `+postCols+` from posts where slug=$1`, slug))
	if err != nil {
		Err(w, 404, "not_found")
		return
	}
	// 草稿仅作者 / admin 可见
	if p.Status == "draft" {
		viewer := currentUserID(r)
		if viewer != p.AuthorID && !s.isAdmin(ctx, viewer) {
			Err(w, 404, "not_found")
			return
		}
	}
	WriteJSON(w, code, map[string]any{"post": s.applyHidden(r, p, s.postJSON(ctx, p, true, true))})
}

// applyHidden 只用于详情路径(列表 SQL 已过滤隐藏帖):作者与 admin 拿到原文 + hidden
// 标记(前端渲染横幅);其他人拿到墓碑——正文/标题/附件清空,保留归属与时间(spec:
// 软隐藏保留「来源与归属清晰」,不装作帖子不存在)。
func (s *Server) applyHidden(r *http.Request, p postRow, m map[string]any) map[string]any {
	if p.HiddenAt == nil {
		return m
	}
	m["hidden"] = true
	m["hidden_reason"] = p.HiddenReason
	m["hidden_at"] = p.HiddenAt
	viewer := currentUserID(r)
	if viewer == p.AuthorID || s.isAdmin(r.Context(), viewer) {
		return m
	}
	m["title"], m["body_md"] = "", ""
	m["links"], m["feedback_wanted"], m["uncertainties"] = []any{}, []string{}, []string{}
	return m
}

func (s *Server) handlePatchPost(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	if !s.writeGate(w, r, uid) {
		return
	}
	slug := strings.ToLower(r.PathValue("slug"))
	ctx := r.Context()
	cur, err := scanPost(s.deps.Pool.QueryRow(ctx,
		`select `+postCols+` from posts where slug=$1`, slug))
	if err != nil {
		Err(w, 404, "not_found")
		return
	}
	if cur.AuthorID != uid {
		Err(w, 403, "forbidden")
		return
	}
	if cur.HiddenAt != nil {
		Err(w, 403, "hidden")
		return
	}
	var in struct {
		Title          *string              `json:"title"`
		BodyMD         *string              `json:"body_md"`
		FeedbackWanted *[]string            `json:"feedback_wanted"`
		Uncertainties  *[]string            `json:"uncertainties"`
		Links          *[]map[string]string `json:"links"`
		Status         *string              `json:"status"` // draft 可 → published
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	title, body := cur.Title, cur.BodyMD
	fw, unc, links := cur.FeedbackWanted, cur.Uncertainties, cur.Links
	status := cur.Status
	if status == "" {
		status = "published"
	}
	if in.Title != nil {
		title = strings.TrimSpace(*in.Title)
	}
	if in.BodyMD != nil {
		body = *in.BodyMD
	}
	if in.FeedbackWanted != nil {
		fw = *in.FeedbackWanted
	}
	if in.Uncertainties != nil {
		unc = *in.Uncertainties
	}
	if in.Links != nil {
		links = *in.Links
	}
	if in.Status != nil {
		st := strings.ToLower(strings.TrimSpace(*in.Status))
		if st != "draft" && st != "published" {
			Err(w, 400, "bad_status")
			return
		}
		// 已发布不可回退为草稿（最小契约）
		if status == "published" && st == "draft" {
			Err(w, 409, "not_draft")
			return
		}
		status = st
	}
	isDraft := status == "draft"
	if code := validatePostInputOpts(cur.Type, title, body, fw, unc, links, isDraft); code != "" {
		Err(w, 400, code)
		return
	}
	linksJSON, _ := json.Marshal(nonNilLinks(links))
	// slug 不随标题变化——它是已经被外部引用的地址
	if _, err := s.deps.Pool.Exec(ctx,
		`update posts set title=$1, body_md=$2, feedback_wanted=$3, uncertainties=$4,
		 links=$5, status=$6, updated_at=now() where id=$7`,
		title, body, nonNilStrings(fw), nonNilStrings(unc), linksJSON, status, cur.ID); err != nil {
		Err(w, 500, "internal")
		return
	}
	if cur.Status == "draft" && status == "published" {
		s.notifyOnCreatePost(ctx, uid, cur.ID, cur.Type, body, cur.ProjectID)
	}
	s.writePostBySlug(w, r, slug, http.StatusOK)
}

func (s *Server) handleListMyDrafts(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	ctx := r.Context()
	q := r.URL.Query()
	limit := 20
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}
	where := []string{"author_id = $1", "status = 'draft'", "merged_into is null"}
	args := []any{uid}
	if c := q.Get("cursor"); c != "" {
		ts, id, ok := parseCursor(c)
		if !ok {
			Err(w, 400, "bad_cursor")
			return
		}
		args = append(args, ts, id)
		where = append(where,
			fmt.Sprintf("(updated_at, id) < ($%d, $%d)", len(args)-1, len(args)))
	}
	args = append(args, limit)
	sql := `select ` + postCols + ` from posts where ` + strings.Join(where, " and ") +
		fmt.Sprintf(` order by updated_at desc, id desc limit $%d`, len(args))
	rows, err := s.deps.Pool.Query(ctx, sql, args...)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	var last postRow
	for rows.Next() {
		p, err := scanPost(rows)
		if err != nil {
			Err(w, 500, "internal")
			return
		}
		last = p
		out = append(out, s.postJSON(ctx, p, true, false))
	}
	if rows.Err() != nil {
		Err(w, 500, "internal")
		return
	}
	var next any
	if len(out) == limit {
		next = last.UpdatedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID
	}
	WriteJSON(w, 200, map[string]any{"posts": out, "next_cursor": next})
}

func (s *Server) handleDeletePost(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	if !s.writeGate(w, r, uid) {
		return
	}
	slug := strings.ToLower(r.PathValue("slug"))
	ctx := r.Context()
	cur, err := scanPost(s.deps.Pool.QueryRow(ctx,
		`select `+postCols+` from posts where slug=$1`, slug))
	if err != nil {
		Err(w, 404, "not_found")
		return
	}
	if cur.AuthorID != uid {
		Err(w, 403, "forbidden")
		return
	}
	// 最小：仅允许删草稿；已发布走 admin 路径
	if cur.Status != "draft" {
		Err(w, 409, "not_draft")
		return
	}
	if _, err := s.deps.Pool.Exec(ctx, `delete from posts where id=$1`, cur.ID); err != nil {
		Err(w, 500, "internal")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListPosts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()
	limit := 20
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}
	where := []string{"merged_into is null", "hidden_at is null", publishedOnlySQL}
	args := []any{}
	add := func(clause string, val any) {
		args = append(args, val)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if t := q.Get("type"); t != "" {
		if !validPostType[t] {
			Err(w, 400, "bad_type")
			return
		}
		add("type = $%d", t)
	}
	if p := q.Get("project"); p != "" {
		add("project_id = (select id from projects where slug = $%d)", strings.ToLower(p))
	}
	if a := q.Get("author"); a != "" {
		add("author_id = (select id from users where handle = $%d)", strings.ToLower(a))
	}
	if c := q.Get("cursor"); c != "" {
		ts, id, ok := parseCursor(c)
		if !ok {
			Err(w, 400, "bad_cursor")
			return
		}
		args = append(args, ts, id)
		where = append(where,
			fmt.Sprintf("(created_at, id) < ($%d, $%d)", len(args)-1, len(args)))
	}
	args = append(args, limit)
	sql := `select ` + postCols + ` from posts where ` + strings.Join(where, " and ") +
		fmt.Sprintf(` order by created_at desc, id desc limit $%d`, len(args))
	rows, err := s.deps.Pool.Query(ctx, sql, args...)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	var last postRow
	for rows.Next() {
		p, err := scanPost(rows)
		if err != nil {
			Err(w, 500, "internal")
			return
		}
		last = p
		// 列表关闭 merged_from：否则被合并帖的标题会经由目标帖的 merged_from 重新出现在
		// 「已从列表消失」的列表响应里。
		out = append(out, s.postJSON(ctx, p, true, false))
	}
	if rows.Err() != nil {
		Err(w, 500, "internal")
		return
	}
	var next any
	if len(out) == limit {
		next = last.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID
	}
	WriteJSON(w, 200, map[string]any{"posts": out, "next_cursor": next})
}

func (s *Server) handleMergePost(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	var in struct {
		Into string `json:"into"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	srcSlug := strings.ToLower(r.PathValue("slug"))
	dstSlug := strings.ToLower(strings.TrimSpace(in.Into))
	if srcSlug == dstSlug {
		Err(w, 400, "self_merge")
		return
	}
	ctx := r.Context()

	// 两次 SELECT 和最终 UPDATE 放进同一事务并对两行加 for update：否则两个并发的
	// merge 请求可能都读到「未合并」的旧状态，然后互相静默覆盖对方刚写下的
	// merged_into（后写的赢，先写的那次合并凭空消失且不报错）。
	tx, err := s.deps.Pool.Begin(ctx)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer tx.Rollback(ctx)

	var srcID, srcAuthor, srcType, srcStatus string
	var srcMerged *string
	if err := tx.QueryRow(ctx,
		`select id, author_id, type, status, merged_into from posts where slug=$1 and hidden_at is null for update`, srcSlug).
		Scan(&srcID, &srcAuthor, &srcType, &srcStatus, &srcMerged); err != nil {
		Err(w, 404, "not_found")
		return
	}
	if srcStatus != "published" {
		Err(w, 404, "not_found")
		return
	}
	if srcMerged != nil {
		Err(w, 400, "already_merged")
		return
	}
	var dstID, dstAuthor, dstType, dstStatus string
	var dstMerged *string
	if err := tx.QueryRow(ctx,
		`select id, author_id, type, status, merged_into from posts where slug=$1 and hidden_at is null for update`, dstSlug).
		Scan(&dstID, &dstAuthor, &dstType, &dstStatus, &dstMerged); err != nil {
		Err(w, 400, "target_not_found")
		return
	}
	if dstStatus != "published" {
		Err(w, 400, "target_not_found")
		return
	}
	if dstMerged != nil {
		Err(w, 400, "target_merged")
		return
	}
	// 合并端点的功能语义是「合并重复讨论」：show/build 这类项目正文不属于
	// 这个语义，不许经由合并被打包藏起来。
	if !mergeablePostType[srcType] || !mergeablePostType[dstType] {
		Err(w, 400, "bad_type")
		return
	}
	// KB dev-cx/content-and-posting：作者可合并重复讨论——两端作者均有正当权限
	if uid != srcAuthor && uid != dstAuthor {
		Err(w, 403, "forbidden")
		return
	}
	if _, err := tx.Exec(ctx,
		`update posts set merged_into=$1, merged_at=now(), merged_by=$2, updated_at=now()
		 where id=$3`, dstID, uid, srcID); err != nil {
		Err(w, 500, "internal")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		Err(w, 500, "internal")
		return
	}
	s.writePostBySlug(w, r, dstSlug, http.StatusOK)
}

// handleUnmergePost 撤销一次合并，把帖子重新变回独立可见：清空 merged_into/merged_at/
// merged_by。这是 Critical 修复的另一半——合并本身允许目标帖作者单方面操作源帖，所以
// 源帖作者必须有办法单方面撤销，不依赖对方配合（再 merge 一次只会撞上 already_merged，
// PATCH 改不了 merged_into）。授权给源帖作者本人，或当初执行这次合并的人（merged_by）——
// 后者覆盖「目标帖作者误合并，自己撤销」的场景。
func (s *Server) handleUnmergePost(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	slug := strings.ToLower(r.PathValue("slug"))
	ctx := r.Context()
	var id, author string
	var mergedInto, mergedBy *string
	if err := s.deps.Pool.QueryRow(ctx,
		`select id, author_id, merged_into, merged_by from posts where slug=$1`, slug).
		Scan(&id, &author, &mergedInto, &mergedBy); err != nil {
		Err(w, 404, "not_found")
		return
	}
	if mergedInto == nil {
		Err(w, 400, "not_merged")
		return
	}
	if uid != author && (mergedBy == nil || uid != *mergedBy) {
		Err(w, 403, "forbidden")
		return
	}
	if _, err := s.deps.Pool.Exec(ctx,
		`update posts set merged_into=null, merged_at=null, merged_by=null, updated_at=now()
		 where id=$1`, id); err != nil {
		Err(w, 500, "internal")
		return
	}
	s.writePostBySlug(w, r, slug, http.StatusOK)
}

func parseCursor(c string) (time.Time, string, bool) {
	parts := strings.SplitN(c, "|", 2)
	if len(parts) != 2 {
		return time.Time{}, "", false
	}
	ts, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, "", false
	}
	return ts, parts[1], true
}
