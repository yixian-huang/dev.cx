package httpx

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

type projectRow struct {
	ID, Slug, OwnerID, Name, Tagline, DescriptionMD, Stage string
	// 0013 起 audience 是 text[](多选受众,空数组=未设置)
	Audience, Screenshots, Tags []string
	Links                       []map[string]string
	CreatedAt, UpdatedAt        time.Time
}

type postRow struct {
	ID, Slug, AuthorID, Type, Title, BodyMD string
	Status                                  string
	ProjectID                               *string
	FeedbackWanted, Uncertainties           []string
	Links                                   []map[string]string
	MergedInto                              *string
	MergedAt                                *time.Time
	CreatedAt, UpdatedAt                    time.Time
	HiddenAt                                *time.Time
	HiddenReason                            string
}

type replyRow struct {
	ID, PostID, AuthorID, BodyMD string
	ParentID                     *string
	Floor                        int
	CreatedAt                    time.Time
	HiddenAt                     *time.Time
	HiddenReason                 string
}

const projectCols = `id, slug, owner_id, name, tagline, description_md, stage, audience,
	screenshots, tags, links, created_at, updated_at`

const postCols = `id, slug, author_id, project_id, type, title, body_md, status,
	feedback_wanted, uncertainties, links, merged_into, created_at, updated_at, merged_at, hidden_at, hidden_reason`

// publishedOnlySQL 公开列表/计数/时间线共用：仅已发布帖。
const publishedOnlySQL = `status = 'published'`

const replyCols = `id, post_id, author_id, body_md, parent_id, floor, created_at, hidden_at, hidden_reason`

func scanProject(row pgx.Row) (projectRow, error) {
	var p projectRow
	var raw []byte
	err := row.Scan(&p.ID, &p.Slug, &p.OwnerID, &p.Name, &p.Tagline, &p.DescriptionMD,
		&p.Stage, &p.Audience, &p.Screenshots, &p.Tags, &raw, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return p, err
	}
	p.Links = decodeLinks(raw)
	return p, nil
}

// projectListAgg 是列表查询一次取出的聚合列（heat / feedback / latest_post）。
type projectListAgg struct {
	ReplyCount7d       int
	HasFeedbackRequest bool
	LatestSlug         *string
	LatestTitle        *string
	LatestReplyCount   *int
}

// scanProjectList 扫描 projectCols + 三个聚合列（见 projectListSelect）。
func scanProjectList(row pgx.Row) (projectRow, projectListAgg, error) {
	var p projectRow
	var a projectListAgg
	var raw []byte
	err := row.Scan(&p.ID, &p.Slug, &p.OwnerID, &p.Name, &p.Tagline, &p.DescriptionMD,
		&p.Stage, &p.Audience, &p.Screenshots, &p.Tags, &raw, &p.CreatedAt, &p.UpdatedAt,
		&a.ReplyCount7d, &a.HasFeedbackRequest,
		&a.LatestSlug, &a.LatestTitle, &a.LatestReplyCount)
	if err != nil {
		return p, a, err
	}
	p.Links = decodeLinks(raw)
	return p, a, nil
}

// attachProjectListAgg 把列表聚合键写入 projectJSON map（详情端点不调用）。
func attachProjectListAgg(m map[string]any, a projectListAgg) {
	m["reply_count_7d"] = a.ReplyCount7d
	m["has_feedback_request"] = a.HasFeedbackRequest
	if a.LatestSlug != nil {
		rc := 0
		if a.LatestReplyCount != nil {
			rc = *a.LatestReplyCount
		}
		title := ""
		if a.LatestTitle != nil {
			title = *a.LatestTitle
		}
		m["latest_post"] = map[string]any{
			"slug": *a.LatestSlug, "title": title, "reply_count": rc,
		}
	} else {
		m["latest_post"] = nil
	}
}

func scanPost(row pgx.Row) (postRow, error) {
	var p postRow
	var raw []byte
	err := row.Scan(&p.ID, &p.Slug, &p.AuthorID, &p.ProjectID, &p.Type, &p.Title,
		&p.BodyMD, &p.Status, &p.FeedbackWanted, &p.Uncertainties, &raw, &p.MergedInto,
		&p.CreatedAt, &p.UpdatedAt, &p.MergedAt, &p.HiddenAt, &p.HiddenReason)
	if err != nil {
		return p, err
	}
	p.Links = decodeLinks(raw)
	if p.Status == "" {
		p.Status = "published"
	}
	return p, nil
}

func scanReply(row pgx.Row) (replyRow, error) {
	var v replyRow
	err := row.Scan(&v.ID, &v.PostID, &v.AuthorID, &v.BodyMD, &v.ParentID, &v.Floor, &v.CreatedAt,
		&v.HiddenAt, &v.HiddenReason)
	return v, err
}

func decodeLinks(raw []byte) []map[string]string {
	out := []map[string]string{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	if out == nil {
		out = []map[string]string{}
	}
	return out
}

// authorJSON 查询作者的公开字段；查不到返回 nil（调用方原样放进响应，前端按 null 处理）。
func (s *Server) authorJSON(ctx context.Context, userID string) map[string]any {
	if s.deps.Pool == nil || userID == "" {
		return nil
	}
	var id, handle, name, avatar string
	err := s.deps.Pool.QueryRow(ctx,
		`select id, handle, display_name, avatar_url from users where id=$1`, userID).
		Scan(&id, &handle, &name, &avatar)
	if err != nil {
		return nil
	}
	return map[string]any{"id": id, "handle": handle, "display_name": name, "avatar_url": avatar}
}

func strOrNil(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func emptyIfNil(v []string) []string {
	if v == nil {
		return []string{}
	}
	return v
}

func (s *Server) projectJSON(ctx context.Context, p projectRow, withStats bool, viewerID string) map[string]any {
	out := map[string]any{
		"id": p.ID, "slug": p.Slug, "name": p.Name, "tagline": p.Tagline,
		"description_md": p.DescriptionMD, "stage": p.Stage, "audience": emptyIfNil(p.Audience),
		"screenshots": emptyIfNil(p.Screenshots), "tags": emptyIfNil(p.Tags),
		"links": p.Links, "author": s.authorJSON(ctx, p.OwnerID),
		"created_at": p.CreatedAt, "updated_at": p.UpdatedAt,
	}
	if withStats && s.deps.Pool != nil {
		var timeline, discuss, feedback int
		s.deps.Pool.QueryRow(ctx,
			`select
			   count(*) filter (where type in ('show','build')),
			   count(*) filter (where type in ('ask','discuss')),
			   count(*) filter (where array_length(feedback_wanted,1) > 0)
			 from posts where project_id=$1 and merged_into is null and hidden_at is null
			   and `+publishedOnlySQL, p.ID).
			Scan(&timeline, &discuss, &feedback)
		out["stats"] = map[string]int{
			"timeline_count": timeline, "discuss_count": discuss, "feedback_count": feedback,
		}
	}
	// follower_count 恒带；viewer_following 仅登录态。
	followerCount := 0
	if s.deps.Pool != nil {
		s.deps.Pool.QueryRow(ctx,
			`select count(*) from follows where target_kind='project' and target_id=$1`, p.ID).
			Scan(&followerCount)
		if viewerID != "" {
			var following bool
			s.deps.Pool.QueryRow(ctx,
				`select exists(select 1 from follows
				 where follower_id=$1 and target_kind='project' and target_id=$2)`,
				viewerID, p.ID).Scan(&following)
			out["viewer_following"] = following
		}
	}
	out["follower_count"] = followerCount
	return out
}

// postJSON 序列化一条帖子。withProject 控制是否内联项目摘要；withMergedFrom 控制是否附带
// merged_from（哪些帖子被合并进了它）——列表/时间线场景关掉它，否则一个热门贴的 merged_from
// 会把已被合并、理应从列表消失的帖子标题重新带回响应体。单帖详情（GET /api/posts/{slug}）
// 始终需要它，前端据此渲染「重复讨论已合并至此」的提示。
func (s *Server) postJSON(ctx context.Context, p postRow, withProject, withMergedFrom bool) map[string]any {
	status := p.Status
	if status == "" {
		status = "published"
	}
	out := map[string]any{
		"id": p.ID, "slug": p.Slug, "type": p.Type, "title": p.Title, "body_md": p.BodyMD,
		"status": status,
		"feedback_wanted": emptyIfNil(p.FeedbackWanted),
		"uncertainties":   emptyIfNil(p.Uncertainties),
		"links":           p.Links, "author": s.authorJSON(ctx, p.AuthorID),
		"created_at": p.CreatedAt, "updated_at": p.UpdatedAt, "merged_into": strOrNil(p.MergedInto),
	}
	// merged_into_post/merged_at 只在这条帖子确实被合并时才附带:merged_into 本身只是目标帖的
	// id,没有 GET-by-id 端点,前端渲染"已合并至"横幅需要目标帖的 slug(拼链接)和 title(显示文案)。
	// 目标行理论上不会缺失(merged_into 是外键),但仍按 nil-safe 处理,防御性地兜底成 null 而不是
	// 让整个响应 500。故意不带 merged_by——那是个裸 user id,前端目前没有据此渲染任何东西(YAGNI)。
	if p.MergedInto != nil && s.deps.Pool != nil {
		var targetSlug, targetTitle string
		if err := s.deps.Pool.QueryRow(ctx,
			`select slug, title from posts where id=$1`, *p.MergedInto).
			Scan(&targetSlug, &targetTitle); err != nil {
			out["merged_into_post"] = nil
		} else {
			out["merged_into_post"] = map[string]any{"slug": targetSlug, "title": targetTitle}
		}
		if p.MergedAt != nil {
			out["merged_at"] = p.MergedAt.UTC().Format(time.RFC3339)
		} else {
			out["merged_at"] = nil
		}
	}
	if s.deps.Pool != nil {
		var n int
		s.deps.Pool.QueryRow(ctx, `select count(*) from replies where post_id=$1 and hidden_at is null`, p.ID).Scan(&n)
		out["reply_count"] = n
	}
	if withMergedFrom && s.deps.Pool != nil {
		merged := []map[string]any{}
		rows, err := s.deps.Pool.Query(ctx,
			`select id, slug, title, author_id from posts where merged_into=$1 and hidden_at is null order by created_at`, p.ID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var id, slug, title, author string
				if err := rows.Scan(&id, &slug, &title, &author); err != nil {
					break
				}
				merged = append(merged, map[string]any{
					"id": id, "slug": slug, "title": title, "author": s.authorJSON(ctx, author),
				})
			}
		}
		out["merged_from"] = merged
	}
	if withProject && p.ProjectID != nil && s.deps.Pool != nil {
		var id, slug, name string
		if err := s.deps.Pool.QueryRow(ctx,
			`select id, slug, name from projects where id=$1`, *p.ProjectID).
			Scan(&id, &slug, &name); err == nil {
			out["project"] = map[string]any{"id": id, "slug": slug, "name": name}
		}
	}
	return out
}

func (s *Server) replyJSON(ctx context.Context, v replyRow) map[string]any {
	return map[string]any{
		"id": v.ID, "floor": v.Floor, "parent_id": strOrNil(v.ParentID),
		"body_md": v.BodyMD, "author": s.authorJSON(ctx, v.AuthorID),
		"created_at": v.CreatedAt,
	}
}
