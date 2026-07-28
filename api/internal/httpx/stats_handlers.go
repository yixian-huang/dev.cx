package httpx

import (
	"net/http"
)

// projectHeatSQL 是 heat 的唯一真源定义（B2 计划决策 4；周刊 T5 复用）。
// projectIDExpr 为求值成 projects.id 的 SQL 表达式，例如 "p.id" 或 "$1"。
// heat = 近 7 天内、该项目关联的未合并帖子收到的回复数。
func projectHeatSQL(projectIDExpr string) string {
	return `(select count(*)::int from replies r
		join posts p_heat on r.post_id = p_heat.id
		where p_heat.project_id = ` + projectIDExpr + `
		  and p_heat.merged_into is null
		  and p_heat.hidden_at is null
		  and r.hidden_at is null
		  and r.created_at > now() - interval '7 days')`
}

// projectListFrom 带 lateral 最新帖的 FROM 子句（projects 别名 p）。
func projectListFrom() string {
	return `from projects p
left join lateral (
	select po.slug, po.title,
	       (select count(*)::int from replies r where r.post_id = po.id and r.hidden_at is null) as reply_count
	from posts po
	where po.project_id = p.id and po.merged_into is null and po.hidden_at is null
	order by po.created_at desc
	limit 1
) lp on true`
}

// projectListSelect 返回列表 select 列：project 行 + heat / feedback / latest_post 聚合。
func projectListSelect() string {
	return `p.id, p.slug, p.owner_id, p.name, p.tagline, p.description_md, p.stage, p.audience,
	p.screenshots, p.tags, p.links, p.created_at, p.updated_at,
	` + projectHeatSQL("p.id") + ` as reply_count_7d,
	exists(
		select 1 from posts fp
		where fp.project_id = p.id and fp.merged_into is null and fp.hidden_at is null
		  and array_length(fp.feedback_wanted, 1) > 0
		  and fp.created_at > now() - interval '7 days'
	) as has_feedback_request,
	lp.slug as latest_slug, lp.title as latest_title, lp.reply_count as latest_reply_count`
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var builders, products, discussions int
	if err := s.deps.Pool.QueryRow(ctx, `
		select
		  (select count(*)::int from users),
		  (select count(*)::int from projects),
		  (select count(*)::int from posts where merged_into is null and hidden_at is null)`).
		Scan(&builders, &products, &discussions); err != nil {
		Err(w, 500, "internal")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]int{
		"builders": builders, "products": products, "discussions": discussions,
	})
}
