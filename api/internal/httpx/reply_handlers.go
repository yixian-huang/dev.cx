package httpx

import (
	"context"
	"net/http"
	"strings"
	"unicode/utf8"

	"devcx/internal/ids"
)

const maxReplyBodyLen = 10000

// maxRepliesListed 给回复列表设一个硬上限：本分支其他列表（帖子、项目、时间线）都有
// 上限，唯独回复列表此前不设限——既让单个热贴响应体无界增长，又给刷回复攻击留了
// 可乘之机（写端点没有限流，见 middleware.go 里只覆盖 /api/auth/* 的限流器）。回复数
// 通常远小于这个值，所以用一个简单的 limit 而不是游标分页；超出部分是极端场景。
const maxRepliesListed = 200

// maxChildRepliesPerParent 给每个顶层回复的子回复也设上限，理由和 maxRepliesListed
// 一样（响应体无界增长 + 无限流的写端点可被刷）。不能用一个笼统的 limit 套在整个子
// 回复查询上：子回复按 created_at 全局排序，一个顶层下堆的子回复一样会把其它顶层的
// 子回复挤没，形状和刚修的顶层被挤没问题一模一样。所以按 parent_id 分别限量——见
// handleListReplies 里的 row_number() over (partition by parent_id ...) 查询。
const maxChildRepliesPerParent = 100

func (s *Server) handleCreateReply(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	if !s.writeGate(w, r, uid) {
		return
	}
	var in struct {
		BodyMD   string  `json:"body_md"`
		ParentID *string `json:"parent_id"`
	}
	if err := ReadJSON(r, &in); err != nil {
		Err(w, 400, "bad_json")
		return
	}
	if strings.TrimSpace(in.BodyMD) == "" {
		Err(w, 400, "bad_input")
		return
	}
	if utf8.RuneCountInString(in.BodyMD) > maxReplyBodyLen {
		Err(w, 400, "too_long")
		return
	}
	ctx := r.Context()

	tx, err := s.deps.Pool.Begin(ctx)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	defer tx.Rollback(ctx)

	// 锁住本帖行本身来串行化同一帖的并发回复创建：Postgres 不允许 FOR UPDATE
	// 直接配合聚合函数（select max(floor)... for update 会报
	// "FOR UPDATE is not allowed with aggregate functions"），且顶层回复不存在
	// 时 for update 也锁不到任何行、起不到互斥作用。posts 行本身总是存在，
	// 锁它可以让同帖的并发请求真正排队，楼层号聚合查询在锁内单独执行即可。
	var postID, postStatus string
	if err := tx.QueryRow(ctx,
		`select id, status from posts where slug=$1 and hidden_at is null for update`,
		strings.ToLower(r.PathValue("slug"))).Scan(&postID, &postStatus); err != nil {
		Err(w, 404, "not_found")
		return
	}
	if postStatus != "published" {
		Err(w, 404, "not_found")
		return
	}

	floor := 0
	if in.ParentID == nil {
		if err := tx.QueryRow(ctx,
			`select coalesce(max(floor), 0) + 1 from replies
			 where post_id=$1 and parent_id is null`, postID).Scan(&floor); err != nil {
			Err(w, 500, "internal")
			return
		}
	} else {
		var parentPost string
		var parentParent *string
		if err := tx.QueryRow(ctx,
			`select post_id, parent_id from replies where id=$1`, *in.ParentID).
			Scan(&parentPost, &parentParent); err != nil {
			Err(w, 400, "parent_not_found")
			return
		}
		if parentPost != postID {
			Err(w, 400, "parent_not_found")
			return
		}
		if parentParent != nil {
			Err(w, 400, "nesting_too_deep")
			return
		}
	}

	id := ids.New()
	if _, err := tx.Exec(ctx,
		`insert into replies (id, post_id, author_id, body_md, parent_id, floor)
		 values ($1,$2,$3,$4,$5,$6)`,
		id, postID, uid, in.BodyMD, in.ParentID, floor); err != nil {
		Err(w, 500, "internal")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		Err(w, 500, "internal")
		return
	}

	// best-effort 通知：失败不回滚主写入。
	s.notifyOnReply(ctx, uid, postID, id, in.BodyMD, in.ParentID)

	v, err := scanReply(s.deps.Pool.QueryRow(ctx,
		`select `+replyCols+` from replies where id=$1`, id))
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]any{"reply": s.replyJSON(ctx, v)})
}

func (s *Server) handleListReplies(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	viewer := currentUserID(r)
	admin := s.isAdmin(ctx, viewer)
	var postID, postStatus, postAuthor string
	if err := s.deps.Pool.QueryRow(ctx,
		`select id, status, author_id from posts where slug=$1`,
		strings.ToLower(r.PathValue("slug"))).Scan(&postID, &postStatus, &postAuthor); err != nil {
		Err(w, 404, "not_found")
		return
	}
	if postStatus == "draft" && viewer != postAuthor && !admin {
		Err(w, 404, "not_found")
		return
	}
	// 顶层和子回复分两次查询，不能合成一条 order by floor, created_at limit N：
	// 子回复的 floor 恒为 0（见 handleCreateReply），只有顶层回复才取
	// max(floor)+1，所以合并排序会把全部子回复排在全部顶层之前。热贴下随手
	// 回复几百条子回复就能让 limit 被子回复吃满，顶层（以及它们各自的子树）
	// 反而被挤出结果——回复区在 API 上直接消失。先按 floor 取顶层，再用顶层
	// id 集合去查它们的子回复，两次查询各自互不挤占，总往返数不变（仍是
	// 1 次回复 + 1 次作者，只是回复那一次拆成了两次）。
	topRows, err := s.deps.Pool.Query(ctx,
		`select `+replyCols+` from replies where post_id=$1 and parent_id is null
		 order by floor limit $2`, postID, maxRepliesListed)
	if err != nil {
		Err(w, 500, "internal")
		return
	}
	var tops []replyRow
	authorIDs := map[string]bool{}
	for topRows.Next() {
		v, err := scanReply(topRows)
		if err != nil {
			topRows.Close()
			Err(w, 500, "internal")
			return
		}
		authorIDs[v.AuthorID] = true
		tops = append(tops, v)
	}
	topErr := topRows.Err()
	topRows.Close()
	if topErr != nil {
		Err(w, 500, "internal")
		return
	}

	children := map[string][]replyRow{}
	if len(tops) > 0 {
		topIDs := make([]string, len(tops))
		for i, t := range tops {
			topIDs[i] = t.ID
		}
		// 按 parent_id 分区，各自只取前 maxChildRepliesPerParent 条（created_at 升序）：
		// 一个整体 limit 会让排在 created_at 前面的某个 parent 的子回复独占配额，
		// 挤掉其它 parent 的子回复——和顶层被挤没是同一种缺陷，只是维度换成了子回复。
		// row_number() 按 parent 分别编号，外层再按编号截断，天然不跨 parent 抢名额。
		childRows, err := s.deps.Pool.Query(ctx,
			`select `+replyCols+` from (
				select `+replyCols+`,
				       row_number() over (partition by parent_id order by created_at) as rn
				from replies where parent_id = any($1)
			 ) t where t.rn <= $2`,
			topIDs, maxChildRepliesPerParent)
		if err != nil {
			Err(w, 500, "internal")
			return
		}
		for childRows.Next() {
			v, err := scanReply(childRows)
			if err != nil {
				childRows.Close()
				Err(w, 500, "internal")
				return
			}
			authorIDs[v.AuthorID] = true
			children[*v.ParentID] = append(children[*v.ParentID], v)
		}
		childErr := childRows.Err()
		childRows.Close()
		if childErr != nil {
			Err(w, 500, "internal")
			return
		}
	}
	// 批量取本页涉及的全部作者，替代逐条 authorJSON 查询：一页 N 条回复此前是
	// 1（帖子）+ N（每条回复各查一次作者）次往返，这里收成 1 + 1。
	authors := s.repliesAuthors(ctx, authorIDs)
	out := []map[string]any{}
	for _, top := range tops {
		item := redactHiddenReply(top, replyJSONWithAuthor(top, authors[top.AuthorID]), viewer, admin)
		kids := []map[string]any{}
		for _, c := range children[top.ID] {
			kids = append(kids, redactHiddenReply(c, replyJSONWithAuthor(c, authors[c.AuthorID]), viewer, admin))
		}
		item["children"] = kids
		out = append(out, item)
	}
	WriteJSON(w, 200, map[string]any{"replies": out})
}

// repliesAuthors 一次性查出一组用户 ID 的公开字段，供 handleListReplies 组装作者信息，
// 避免对页面上每一条回复各发一次 authorJSON 查询。查不到的 ID 在返回的 map 里没有条目，
// 调用方按 nil 处理（与 authorJSON 单条查不到时的行为一致）。
func (s *Server) repliesAuthors(ctx context.Context, ids map[string]bool) map[string]map[string]any {
	out := map[string]map[string]any{}
	if s.deps.Pool == nil || len(ids) == 0 {
		return out
	}
	idList := make([]string, 0, len(ids))
	for id := range ids {
		idList = append(idList, id)
	}
	rows, err := s.deps.Pool.Query(ctx,
		`select id, handle, display_name, avatar_url from users where id = any($1)`, idList)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, handle, name, avatar string
		if err := rows.Scan(&id, &handle, &name, &avatar); err != nil {
			continue
		}
		out[id] = map[string]any{"id": id, "handle": handle, "display_name": name, "avatar_url": avatar}
	}
	return out
}

// replyJSONWithAuthor 和 replyJSON（content_json.go）组装同样的字段，但作者信息由调用方
// 从预取的批量结果里传入，而不是这里再查一次数据库。author 为 nil 时序列化为 JSON null，
// 与 authorJSON 查不到用户时的行为一致。
func replyJSONWithAuthor(v replyRow, author map[string]any) map[string]any {
	var a any
	if author != nil {
		a = author
	}
	return map[string]any{
		"id": v.ID, "floor": v.Floor, "parent_id": strOrNil(v.ParentID),
		"body_md": v.BodyMD, "author": a,
		"created_at": v.CreatedAt,
	}
}

// redactHiddenReply:隐藏回复保留楼层与归属(楼层号不重排的既有原则),正文对
// 作者本人与 admin 以外的人清空;hidden/hidden_reason 供前端渲染墓碑行。
func redactHiddenReply(v replyRow, m map[string]any, viewer string, admin bool) map[string]any {
	if v.HiddenAt == nil {
		return m
	}
	m["hidden"] = true
	m["hidden_reason"] = v.HiddenReason
	if viewer != v.AuthorID && !admin {
		m["body_md"] = ""
	}
	return m
}

func (s *Server) handleDeleteReply(w http.ResponseWriter, r *http.Request) {
	uid := currentUserID(r)
	if uid == "" {
		Err(w, 401, "auth_required")
		return
	}
	ctx := r.Context()
	var author string
	if err := s.deps.Pool.QueryRow(ctx,
		`select author_id from replies where id=$1`, r.PathValue("id")).Scan(&author); err != nil {
		Err(w, 404, "not_found")
		return
	}
	if author != uid {
		Err(w, 403, "forbidden")
		return
	}
	// 子回复随 parent 级联删除（schema on delete cascade）；楼层号不重排，保持已有引用稳定
	if _, err := s.deps.Pool.Exec(ctx, `delete from replies where id=$1`, r.PathValue("id")); err != nil {
		Err(w, 500, "internal")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
