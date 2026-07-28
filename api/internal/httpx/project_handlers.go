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
	maxProjectNameLen = 64
	maxTaglineLen     = 140
	maxDescriptionLen = 20000
	maxTagLen         = 24
	maxTags           = 8
	maxScreenshots    = 8
	maxProjectLinks   = 6
	// maxURLLen 是所有 URL 字段（项目截图/链接、帖子链接、头像、联系方式）的单一长度
	// 上限来源；profile_handlers.go 引用它，不再自定义同值的 maxAvatarURLLen/maxLinkURLLen。
	maxURLLen = 512
	// maxLinkLabelLen 是「链接」类字段（项目 links、帖子 links）label 的字符数上限。
	maxLinkLabelLen = 24
)

var validStage = map[string]bool{"idea": true, "wip": true, "shipped": true, "paused": true}

// validAudience:受众是可选叙事字段(空数组 = 未设置),多选(0013 起数组化)。
var validAudience = map[string]bool{"end_users": true, "developers": true, "teams": true}

type projectInput struct {
	Slug          string              `json:"slug"`
	Name          string              `json:"name"`
	Tagline       string              `json:"tagline"`
	DescriptionMD string              `json:"description_md"`
	Stage         string              `json:"stage"`
	Audience      []string            `json:"audience"`
	Tags          []string            `json:"tags"`
	Screenshots   []string            `json:"screenshots"`
	Links         []map[string]string `json:"links"`
}

// dedupAudience 保序去重——重复项静默合并,不算错(客户端 UI 本身不会产生重复,
// 这里兜其它调用方)。
func dedupAudience(audience []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, a := range audience {
		if !seen[a] {
			seen[a] = true
			out = append(out, a)
		}
	}
	return out
}

// validateProjectInput 返回错误码；"" 表示通过。
func validateProjectInput(name, tagline, desc, stage string, audience []string, tags, shots []string, links []map[string]string) string {
	if strings.TrimSpace(name) == "" {
		return "bad_input"
	}
	if !validStage[stage] {
		return "bad_stage"
	}
	if len(audience) > len(validAudience) {
		return "bad_audience"
	}
	for _, a := range audience {
		if !validAudience[a] {
			return "bad_audience"
		}
	}
	if utf8.RuneCountInString(name) > maxProjectNameLen ||
		utf8.RuneCountInString(tagline) > maxTaglineLen ||
		utf8.RuneCountInString(desc) > maxDescriptionLen {
		return "too_long"
	}
	if len(tags) > maxTags || len(shots) > maxScreenshots || len(links) > maxProjectLinks {
		return "too_many"
	}
	for _, t := range tags {
		if strings.TrimSpace(t) == "" || utf8.RuneCountInString(t) > maxTagLen {
			return "bad_tag"
		}
	}
	for _, u := range shots {
		if !allowedURL(u, false) || utf8.RuneCountInString(u) > maxURLLen {
			return "bad_screenshot"
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

func (s *Server) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	if !s.writeGate(w, r, uid) {
		return
	}
	var in projectInput
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	in.Slug = strings.ToLower(strings.TrimSpace(in.Slug))
	if err := slugs.Validate(in.Slug); err != nil {
		Err(w, 400, "slug_invalid")
		return
	}
	in.Audience = dedupAudience(nonNilStrings(in.Audience))
	if code := validateProjectInput(in.Name, in.Tagline, in.DescriptionMD, in.Stage,
		in.Audience, in.Tags, in.Screenshots, in.Links); code != "" {
		Err(w, 400, code)
		return
	}
	linksJSON, _ := json.Marshal(nonNilLinks(in.Links))
	id := ids.New()
	ctx := r.Context()
	_, err := s.deps.Pool.Exec(ctx,
		`insert into projects (id, slug, owner_id, name, tagline, description_md, stage,
		                       audience, tags, screenshots, links)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		id, in.Slug, uid, strings.TrimSpace(in.Name), in.Tagline, in.DescriptionMD, in.Stage,
		in.Audience, nonNilStrings(in.Tags), nonNilStrings(in.Screenshots), linksJSON)
	if err != nil {
		if isUniqueViolation(err) {
			Err(w, 400, "slug_taken")
			return
		}
		Err(w, 500, "internal")
		return
	}
	s.writeProjectBySlug(w, r, in.Slug, http.StatusCreated)
}

func (s *Server) handleGetProject(w http.ResponseWriter, r *http.Request) {
	s.writeProjectBySlug(w, r, strings.ToLower(r.PathValue("slug")), http.StatusOK)
}

func (s *Server) writeProjectBySlug(w http.ResponseWriter, r *http.Request, slug string, code int) {
	ctx := r.Context()
	p, err := scanProject(s.deps.Pool.QueryRow(ctx,
		`select `+projectCols+` from projects where slug=$1`, slug))
	if err != nil {
		Err(w, 404, "not_found")
		return
	}
	viewer := currentUserID(r)
	// 软隐藏:访客/非主人当 404;主人与创建成功响应仍可读。
	if p.HiddenAt != nil && viewer != p.OwnerID && code != http.StatusCreated {
		Err(w, 404, "not_found")
		return
	}
	WriteJSON(w, code, map[string]any{"project": s.projectJSON(ctx, p, true, viewer)})
}

// handleHideProject 主人下架产品(软隐藏):探索/他人主页/统计不可见;本人仍可见可恢复。
func (s *Server) handleHideProject(w http.ResponseWriter, r *http.Request) {
	s.setProjectHidden(w, r, true)
}

// handleUnhideProject 主人恢复公开展示。
func (s *Server) handleUnhideProject(w http.ResponseWriter, r *http.Request) {
	s.setProjectHidden(w, r, false)
}

func (s *Server) setProjectHidden(w http.ResponseWriter, r *http.Request, hide bool) {
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
	p, err := scanProject(s.deps.Pool.QueryRow(ctx,
		`select `+projectCols+` from projects where slug=$1`, slug))
	if err != nil {
		Err(w, 404, "not_found")
		return
	}
	if p.OwnerID != uid {
		Err(w, 403, "forbidden")
		return
	}
	var execErr error
	if hide {
		if p.HiddenAt != nil {
			// 幂等:已隐藏直接返回当前状态
			WriteJSON(w, 200, map[string]any{"project": s.projectJSON(ctx, p, true, uid)})
			return
		}
		_, execErr = s.deps.Pool.Exec(ctx,
			`update projects set hidden_at=now(), updated_at=now() where id=$1`, p.ID)
	} else {
		if p.HiddenAt == nil {
			WriteJSON(w, 200, map[string]any{"project": s.projectJSON(ctx, p, true, uid)})
			return
		}
		_, execErr = s.deps.Pool.Exec(ctx,
			`update projects set hidden_at=null, updated_at=now() where id=$1`, p.ID)
	}
	if execErr != nil {
		Err(w, 500, "internal")
		return
	}
	s.writeProjectBySlug(w, r, slug, http.StatusOK)
}

func (s *Server) handlePatchProject(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	slug := strings.ToLower(r.PathValue("slug"))
	ctx := r.Context()
	var owner string
	if err := s.deps.Pool.QueryRow(ctx,
		`select owner_id from projects where slug=$1`, slug).Scan(&owner); err != nil {
		Err(w, 404, "not_found")
		return
	}
	if owner != uid {
		Err(w, 403, "forbidden")
		return
	}
	// 与创建同门:封禁/禁言/邮箱未验证的用户不可改写既有项目内容。
	if !s.writeGate(w, r, uid) {
		return
	}
	var in struct {
		Name          *string              `json:"name"`
		Tagline       *string              `json:"tagline"`
		DescriptionMD *string              `json:"description_md"`
		Stage         *string              `json:"stage"`
		Audience      *[]string            `json:"audience"`
		Tags          *[]string            `json:"tags"`
		Screenshots   *[]string            `json:"screenshots"`
		Links         *[]map[string]string `json:"links"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	// 用当前值补齐未传字段后统一校验
	cur, err := scanProject(s.deps.Pool.QueryRow(ctx,
		`select `+projectCols+` from projects where slug=$1`, slug))
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	name, tagline, desc, stage, audience := cur.Name, cur.Tagline, cur.DescriptionMD, cur.Stage, cur.Audience
	tags, shots, links := cur.Tags, cur.Screenshots, cur.Links
	if in.Name != nil {
		name = strings.TrimSpace(*in.Name)
	}
	if in.Tagline != nil {
		tagline = *in.Tagline
	}
	if in.DescriptionMD != nil {
		desc = *in.DescriptionMD
	}
	if in.Stage != nil {
		stage = *in.Stage
	}
	if in.Audience != nil {
		audience = dedupAudience(nonNilStrings(*in.Audience))
	}
	if in.Tags != nil {
		tags = *in.Tags
	}
	if in.Screenshots != nil {
		shots = *in.Screenshots
	}
	if in.Links != nil {
		links = *in.Links
	}
	if code := validateProjectInput(name, tagline, desc, stage, audience, tags, shots, links); code != "" {
		Err(w, 400, code)
		return
	}
	linksJSON, _ := json.Marshal(nonNilLinks(links))
	if _, err := s.deps.Pool.Exec(ctx,
		`update projects set name=$1, tagline=$2, description_md=$3, stage=$4, audience=$5,
		 tags=$6, screenshots=$7, links=$8, updated_at=now() where slug=$9`,
		name, tagline, desc, stage, nonNilStrings(audience), nonNilStrings(tags), nonNilStrings(shots), linksJSON, slug); err != nil {
		Err(w, 500, "internal")
		return
	}
	s.writeProjectBySlug(w, r, slug, http.StatusOK)
}

// handleListProjects 全站项目列表(GET /api/projects):默认 (created_at, id) 降序 keyset
// 分页; sort=trending 时按 heat desc, updated_at desc, next_cursor 恒 null。
// 列表单条 SQL 附带 reply_count_7d / has_feedback_request / latest_post。
func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()
	limit := 20
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}
	trending := q.Get("sort") == "trending"
	// 公开探索/首页焦点:不下架产品不进列表。
	where := []string{"p.hidden_at is null"}
	args := []any{}
	// trending 无 keyset 语义，忽略 cursor。
	if !trending {
		if c := q.Get("cursor"); c != "" {
			ts, id, ok := parseCursor(c)
			if !ok {
				Err(w, 400, "bad_cursor")
				return
			}
			args = append(args, ts, id)
			where = append(where,
				fmt.Sprintf("(p.created_at, p.id) < ($%d, $%d)", len(args)-1, len(args)))
		}
	}
	args = append(args, limit)
	order := ` order by p.created_at desc, p.id desc`
	if trending {
		order = ` order by ` + projectHeatSQL("p.id") + ` desc, p.updated_at desc`
	}
	sql := `select ` + projectListSelect() + ` ` + projectListFrom() +
		` where ` + strings.Join(where, " and ") +
		order + fmt.Sprintf(` limit $%d`, len(args))
	rows, err := s.deps.Pool.Query(ctx, sql, args...)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	var last projectRow
	viewer := currentUserID(r)
	for rows.Next() {
		p, agg, err := scanProjectList(rows)
		if err != nil {
			Err(w, 500, "internal")
			return
		}
		last = p
		m := s.projectJSON(ctx, p, false, viewer)
		attachProjectListAgg(m, agg)
		out = append(out, m)
	}
	if rows.Err() != nil {
		Err(w, 500, "internal")
		return
	}
	var next any
	if !trending && len(out) == limit {
		next = last.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID
	}
	WriteJSON(w, 200, map[string]any{"projects": out, "next_cursor": next})
}

func (s *Server) handleListUserProjects(w http.ResponseWriter, r *http.Request) {
	handleName := strings.ToLower(r.PathValue("handle"))
	ctx := r.Context()
	var uid string
	if err := s.deps.Pool.QueryRow(ctx,
		`select id from users where handle=$1`, handleName).Scan(&uid); err != nil {
		Err(w, 404, "not_found")
		return
	}
	// 本人看自己主页/「我的产品」:含下架项;访客只看公开产品。
	viewer := currentUserID(r)
	whereOwner := `p.owner_id=$1`
	if viewer != uid {
		whereOwner += ` and p.hidden_at is null`
	}
	sql := `select ` + projectListSelect() + ` ` + projectListFrom() +
		` where ` + whereOwner + ` order by p.updated_at desc limit 50`
	rows, err := s.deps.Pool.Query(ctx, sql, uid)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		p, agg, err := scanProjectList(rows)
		if err != nil {
			Err(w, 500, "internal")
			return
		}
		m := s.projectJSON(ctx, p, false, viewer)
		attachProjectListAgg(m, agg)
		out = append(out, m)
	}
	if rows.Err() != nil {
		Err(w, 500, "internal")
		return
	}
	WriteJSON(w, 200, map[string]any{"projects": out})
}

func (s *Server) handleProjectTimeline(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var pid, owner string
	var hiddenAt *time.Time
	if err := s.deps.Pool.QueryRow(ctx,
		`select id, owner_id, hidden_at from projects where slug=$1`,
		strings.ToLower(r.PathValue("slug"))).Scan(&pid, &owner, &hiddenAt); err != nil {
		Err(w, 404, "not_found")
		return
	}
	if hiddenAt != nil && currentUserID(r) != owner {
		Err(w, 404, "not_found")
		return
	}
	load := func(types []string) ([]map[string]any, error) {
		rows, err := s.deps.Pool.Query(ctx,
			`select `+postCols+` from posts
			 where project_id=$1 and merged_into is null and hidden_at is null
			   and status = 'published' and type = any($2)
			 order by created_at desc limit 50`, pid, types)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			p, err := scanPost(rows)
			if err != nil {
				return nil, err
			}
			out = append(out, s.postJSON(ctx, p, false, false))
		}
		return out, rows.Err()
	}
	timeline, err := load([]string{"show", "build"})
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	discussions, err := load([]string{"ask", "discuss"})
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	WriteJSON(w, 200, map[string]any{"timeline": timeline, "discussions": discussions})
}

// handleProjectFeedback：任何登录用户可对任意项目提交反馈，生成一条关联该项目的 discuss 帖。
// 这是唯一允许非 owner 创建关联该项目帖子的路径（KB dev-cx/user-flows）。
func (s *Server) handleProjectFeedback(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	if !s.writeGate(w, r, uid) {
		return
	}
	var in struct {
		Title  string `json:"title"`
		BodyMD string `json:"body_md"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	if code := validatePostInput("discuss", in.Title, in.BodyMD, nil, nil, nil); code != "" {
		Err(w, 400, code)
		return
	}
	ctx := r.Context()
	var pid, owner string
	var hiddenAt *time.Time
	if err := s.deps.Pool.QueryRow(ctx,
		`select id, owner_id, hidden_at from projects where slug=$1`,
		strings.ToLower(r.PathValue("slug"))).Scan(&pid, &owner, &hiddenAt); err != nil {
		Err(w, 404, "not_found")
		return
	}
	// 下架产品:访客不可投反馈(与详情/时间线一致);主人仍可自测路径。
	if hiddenAt != nil && uid != owner {
		Err(w, 404, "not_found")
		return
	}
	id := ids.New()
	var slug string
	for attempt := 0; attempt < 3; attempt++ {
		slug = slugs.Generate(in.Title)
		_, err := s.deps.Pool.Exec(ctx,
			`insert into posts (id, slug, author_id, project_id, type, title, body_md)
			 values ($1,$2,$3,$4,'discuss',$5,$6)`,
			id, slug, uid, pid, strings.TrimSpace(in.Title), in.BodyMD)
		if err == nil {
			// best-effort：反馈帖仅生成正文 mention 通知。
			s.notifyMentionsOnly(ctx, uid, id, in.BodyMD)
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

func nonNilStrings(v []string) []string {
	if v == nil {
		return []string{}
	}
	return v
}

func nonNilLinks(v []map[string]string) []map[string]string {
	if v == nil {
		return []map[string]string{}
	}
	return v
}
