// API 错误码 → 中文文案集中映射表。
// 未知码走通用兜底;网络/网关类单独识别,避免再出现「出错了」却不知何因。

export interface ApiErrorLike {
  status?: number
  code?: string
  message?: string
  name?: string
}

const MESSAGES: Record<string, string> = {
  // 鉴权
  auth_required: '请先登录后再继续',
  bad_credentials: '邮箱或密码不对',
  unauthorized: '邮箱或密码不对',
  bad_state: '登录状态已失效，请重试',
  github_error: 'GitHub 授权失败，请重试',
  github_already_linked: '该 GitHub 账号已绑定其他用户',

  // 注册/邀请
  invite_invalid: '邀请码无效或已用完',
  invite_used: '邀请码已被使用',
  email_taken: '该邮箱已被注册',
  email_required: '请填写邮箱',
  password_too_short: '密码至少需要 8 个字符',
  display_name_required: '请填写显示名',
  already_verified: '邮箱已经验证过了',
  resend_cooldown: '验证邮件刚发过，请稍后再试',
  token_invalid: '链接无效或已过期，请重新获取',

  // handle
  handle_taken: '该用户名已被占用',
  handle_reserved: '该用户名是保留字，换一个吧',
  handle_invalid: '用户名需 2–32 位：小写字母/数字/中划线，首尾为字母或数字',
  rename_too_soon: '改名太频繁，请稍后再试',

  // 通用输入校验
  bad_json: '请求格式有误，请刷新后重试',
  bad_input: '请检查填写是否完整',
  too_long: '内容太长了，请缩短后再试',
  too_many: '数量超出限制',
  not_found: '内容不存在或已下架',
  bad_cursor: '分页参数有误，请刷新列表',
  bad_status: '状态值不对',
  bad_avatar_url: '头像链接不合法',
  bad_link: '链接需同时填写名称，并以 http:// 或 https:// 开头',
  bad_type: '类型不对',
  bad_stage: '阶段值不对',
  bad_tag: '标签格式不对',
  bad_screenshot: '截图地址需以 http:// 或 https:// 开头',
  bad_audience: '受众选项不合法',
  forbidden: '没有权限执行此操作',
  rate_limited: '操作太频繁，请稍后再试',

  // 项目
  slug_invalid: '产品地址只能用小写字母、数字和中划线（2–32 位）',
  slug_taken: '该产品地址已被占用，换一个试试',
  project_not_found: '产品不存在或已下架',
  project_required: '请先选择或创建一个关联产品',

  // 帖子/回复/合并
  self_merge: '不能合并到自身',
  already_merged: '该帖子已被合并',
  not_merged: '该帖子未被合并',
  not_draft: '这篇不是草稿，无法这样更新',
  target_not_found: '目标帖子不存在',
  target_merged: '目标帖子已被合并，无法再合并',
  parent_not_found: '父回复不存在',
  nesting_too_deep: '回复层级太深',
  edit_window_closed: '已超过 30 分钟编辑时限',
  edit_has_replies: '已有他人回复，不能再编辑',

  // 红线
  muted: '你当前处于禁言状态，暂时不能发布内容',
  suspended: '账号已停用',
  email_unverified: '请先验证邮箱——查收验证邮件，或在页面顶部横幅重发',

  // 上传
  file_too_large: '文件太大',
  ext_not_allowed: '不支持该文件格式',
  quota_exceeded: '存储空间已满',
  upload_unconfigured: '上传暂不可用',
  upload_failed: '上传失败，请重试',
  delete_failed: '删除失败，请重试',
  invalid_url: '无效的图片地址',
  invalid_key: '无效的图片标识',

  // 网关 / 运维
  bad_gateway: '服务暂时不可用，请稍后重试',
  gateway_timeout: '请求超时，请稍后重试',
  smtp_unconfigured: '邮件服务未配置',
  smtp_failed: '邮件发送失败，请稍后重试',
  unknown_key: '未知配置项',
  bad_until: '时间格式不对',
  self_target: '不能对自己执行此操作',

  internal: '出错了，请稍后重试',
  unknown: '出错了，请稍后重试',
}

const FALLBACK = '出错了，请稍后重试'

/** 将任意 thrown 值规范成可展示文案；网络错误单独提示。 */
export function apiErrorMessage(e: unknown): string {
  if (e == null) return FALLBACK
  if (typeof e === 'string' && e.trim()) return e

  const err = e as ApiErrorLike & { status?: number; code?: string }
  const code = (err.code || '').trim()
  if (code && MESSAGES[code]) return MESSAGES[code]

  // fetch 失败 / 中断
  const name = err.name || ''
  const msg = (err.message || '').toLowerCase()
  if (name === 'TypeError' || msg.includes('failed to fetch') || msg.includes('network')) {
    return '网络异常，请检查连接后重试'
  }
  if (name === 'AbortError' || msg.includes('aborted')) {
    return '请求已取消或超时，请重试'
  }

  if (err.status === 502 || code === 'bad_gateway') return MESSAGES.bad_gateway
  if (err.status === 504 || code === 'gateway_timeout') return MESSAGES.gateway_timeout
  if (err.status === 429) return MESSAGES.rate_limited
  if (err.status === 401) return MESSAGES.auth_required
  if (err.status === 403 && !code) return MESSAGES.forbidden
  if (err.status === 404 && !code) return MESSAGES.not_found

  return FALLBACK
}
