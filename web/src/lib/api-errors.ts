// API 错误码 → 中文文案集中映射表。
// 码表来源:`grep -rn 'Err(w,' api/internal/httpx/*.go | grep -v _test` 的全部不同码
// (含 handleRegister/handleRename 里 "handle_"+code 拼接族:handle_invalid/handle_reserved/handle_taken),
// 外加 img.li 上游透传码(ext_not_allowed/quota_exceeded 不是本仓字面量,是上游动态码,按 spec §3 列出)
// 与 unauthorized/invite_used 两个防御性别名。未知码一律走通用兜底文案。

export interface ApiErrorLike {
  status: number
  code: string
}

const MESSAGES: Record<string, string> = {
  // 鉴权
  auth_required: '请先登录',
  bad_credentials: '邮箱或密码不对',
  unauthorized: '邮箱或密码不对',
  bad_state: '登录状态已失效,请重试',
  github_error: 'GitHub 授权失败,请重试',
  github_already_linked: '该 GitHub 账号已绑定其他用户',

  // 注册/邀请
  invite_invalid: '邀请码无效或已用完',
  invite_used: '邀请码已被使用',
  email_taken: '该邮箱已被注册',
  email_required: '请填写邮箱',
  password_too_short: '密码至少需要 8 个字符',
  display_name_required: '请填写显示名',

  // handle
  handle_taken: '该 handle 已被占用',
  handle_reserved: '该 handle 是保留字，换一个吧',
  handle_invalid: 'handle 需 2–32 位：小写字母/数字/中划线，首尾为字母或数字',
  rename_too_soon: '改名太频繁，请稍后再试',

  // 通用输入校验
  bad_json: '请求格式有误',
  bad_input: '请检查填写是否完整（密码至少 8 位）',
  too_long: '内容太长了',
  too_many: '数量超出限制',
  not_found: '未找到',
  bad_cursor: '分页参数有误',
  bad_status: '状态值不对',
  bad_avatar_url: '头像链接不合法',
  bad_link: '链接格式不对',
  bad_type: '类型不对',
  bad_stage: '阶段值不对',
  bad_tag: '标签格式不对',
  bad_screenshot: '截图格式不对',
  forbidden: '没有权限执行此操作',
  rate_limited: '操作太频繁,稍后再试',

  // 项目
  slug_invalid: '短链格式不对',
  slug_taken: '该短链已被占用',
  project_not_found: '项目不存在',
  project_required: '请先选择所属项目',

  // 帖子/回复/合并
  self_merge: '不能合并到自身',
  already_merged: '该帖子已被合并',
  not_merged: '该帖子未被合并',
  target_not_found: '目标帖子不存在',
  target_merged: '目标帖子已被合并,无法再合并',
  parent_not_found: '父回复不存在',
  nesting_too_deep: '回复层级太深',

  // 红线执行(0008 moderation):muted 响应带 muted_until,但这里只接触 code——
  // 期限展示放宽为通用文案,不为一行提示改错误处理管道。
  muted: '你当前处于禁言状态,暂时不能发布内容',
  suspended: '账号已停用',
  email_unverified: '请先验证邮箱——查收验证邮件,或在页面顶部横幅重发',

  // 上传
  file_too_large: '文件太大',
  ext_not_allowed: '不支持该文件格式',
  quota_exceeded: '存储空间已满',
  upload_unconfigured: '上传暂不可用',
  upload_failed: '上传失败,请重试',
  delete_failed: '删除失败,请重试',
  invalid_url: '无效的图片地址',
  invalid_key: '无效的图片标识',

  edit_window_closed: '已超过 30 分钟编辑时限',
  edit_has_replies: '已有他人回复，不能再编辑',

  internal: '出错了,请稍后重试',
}

const FALLBACK = '出错了,请稍后重试'

export function apiErrorMessage(e: ApiErrorLike): string {
  return MESSAGES[e.code] ?? FALLBACK
}
