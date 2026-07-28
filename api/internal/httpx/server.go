package httpx

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"devcx/internal/config"
)

type Deps struct {
	Pool *pgxpool.Pool
	Cfg  config.Config
}

type Server struct {
	mux  *http.ServeMux
	deps Deps
}

func NewServer(deps Deps) http.Handler {
	s := &Server{mux: http.NewServeMux(), deps: deps}
	s.routes()
	return s.protect(s.withUser(s.mux))
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	s.mux.HandleFunc("POST /api/auth/register", s.handleRegister)
	s.mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	s.mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	s.mux.HandleFunc("POST /api/auth/verify-email", s.handleVerifyEmail)
	s.mux.HandleFunc("POST /api/auth/forgot-password", s.handleForgotPassword)
	s.mux.HandleFunc("POST /api/auth/reset-password", s.handleResetPassword)
	s.mux.HandleFunc("POST /api/me/resend-verification", s.handleResendVerification)
	s.mux.HandleFunc("GET /api/me", s.handleMe)
	s.mux.HandleFunc("GET /api/me/export", s.handleExport)
	s.mux.HandleFunc("GET /api/auth/github", s.handleGitHubStart)
	s.mux.HandleFunc("GET /api/auth/github/callback", s.handleGitHubCallback)
	s.mux.HandleFunc("POST /api/me/handle", s.handleRename)
	s.mux.HandleFunc("GET /api/resolve/{handle}", s.handleResolve)
	s.mux.HandleFunc("GET /api/users/{handle}", s.handlePublicUser)
	s.mux.HandleFunc("PATCH /api/me", s.handlePatchMe)
	s.mux.HandleFunc("PUT /api/me/links", s.handlePutLinks)
	s.mux.HandleFunc("POST /api/projects", s.handleCreateProject)
	s.mux.HandleFunc("GET /api/projects", s.handleListProjects)
	s.mux.HandleFunc("GET /api/projects/{slug}", s.handleGetProject)
	s.mux.HandleFunc("PATCH /api/projects/{slug}", s.handlePatchProject)
	s.mux.HandleFunc("GET /api/users/{handle}/projects", s.handleListUserProjects)
	s.mux.HandleFunc("GET /api/projects/{slug}/timeline", s.handleProjectTimeline)
	s.mux.HandleFunc("POST /api/projects/{slug}/feedback", s.handleProjectFeedback)
	s.mux.HandleFunc("POST /api/posts", s.handleCreatePost)
	s.mux.HandleFunc("GET /api/me/drafts", s.handleListMyDrafts)
	s.mux.HandleFunc("GET /api/posts/{slug}", s.handleGetPost)
	s.mux.HandleFunc("PATCH /api/posts/{slug}", s.handlePatchPost)
	s.mux.HandleFunc("DELETE /api/posts/{slug}", s.handleDeletePost)
	s.mux.HandleFunc("GET /api/posts", s.handleListPosts)
	s.mux.HandleFunc("POST /api/posts/{slug}/replies", s.handleCreateReply)
	s.mux.HandleFunc("GET /api/posts/{slug}/replies", s.handleListReplies)
	s.mux.HandleFunc("DELETE /api/replies/{id}", s.handleDeleteReply)
	s.mux.HandleFunc("POST /api/posts/{slug}/merge", s.handleMergePost)
	s.mux.HandleFunc("DELETE /api/posts/{slug}/merge", s.handleUnmergePost)
	s.mux.HandleFunc("POST /api/upload", s.handleUpload)
	s.mux.HandleFunc("DELETE /api/upload", s.handleDeleteUpload)
	s.mux.HandleFunc("PUT /api/follows/{kind}/{id}", s.handleFollow)
	s.mux.HandleFunc("DELETE /api/follows/{kind}/{id}", s.handleUnfollow)
	s.mux.HandleFunc("GET /api/notifications", s.handleListNotifications)
	s.mux.HandleFunc("POST /api/notifications/read", s.handleMarkNotificationsRead)
	s.mux.HandleFunc("GET /api/stats", s.handleStats)
	s.mux.HandleFunc("GET /api/weekly/latest", s.handleWeeklyLatest)
	s.mux.HandleFunc("GET /api/weekly/{year}/{week}", s.handleWeeklyIssue)
	s.mux.HandleFunc("POST /api/admin/posts/{slug}/hide", s.handleAdminHidePost)
	s.mux.HandleFunc("DELETE /api/admin/posts/{slug}/hide", s.handleAdminUnhidePost)
	s.mux.HandleFunc("DELETE /api/admin/posts/{slug}", s.handleAdminDeletePost)
	s.mux.HandleFunc("POST /api/admin/replies/{id}/hide", s.handleAdminHideReply)
	s.mux.HandleFunc("DELETE /api/admin/replies/{id}/hide", s.handleAdminUnhideReply)
	s.mux.HandleFunc("DELETE /api/admin/replies/{id}", s.handleAdminDeleteReply)
	s.mux.HandleFunc("GET /api/admin/users/{handle}", s.handleAdminGetUser)
	s.mux.HandleFunc("POST /api/admin/users/{handle}/warn", s.handleAdminWarn)
	s.mux.HandleFunc("POST /api/admin/users/{handle}/mute", s.handleAdminMute)
	s.mux.HandleFunc("DELETE /api/admin/users/{handle}/mute", s.handleAdminUnmute)
	s.mux.HandleFunc("POST /api/admin/users/{handle}/suspend", s.handleAdminSuspend)
	s.mux.HandleFunc("DELETE /api/admin/users/{handle}/suspend", s.handleAdminUnsuspend)
	s.mux.HandleFunc("GET /api/admin/actions", s.handleAdminActions)
	s.mux.HandleFunc("GET /api/admin/settings", s.handleAdminListSettings)
	s.mux.HandleFunc("PUT /api/admin/settings/{key}", s.handleAdminPutSetting)
	s.mux.HandleFunc("DELETE /api/admin/settings/{key}", s.handleAdminDeleteSetting)
	s.mux.HandleFunc("POST /api/admin/settings/smtp-test", s.handleAdminSMTPTest)
	s.mux.HandleFunc("POST /api/waitlist", s.handleJoinWaitlist)
	s.mux.HandleFunc("GET /api/admin/waitlist", s.handleAdminWaitlist)
	s.mux.HandleFunc("GET /api/admin/invites", s.handleAdminListInvites)
	s.mux.HandleFunc("POST /api/admin/invites", s.handleAdminMintInvites)
	s.mux.HandleFunc("DELETE /api/admin/invites/{code}", s.handleAdminVoidInvite)
}
