# TokenDance 合作接入信息

视频生成已改为仅走 TokenDance 网关，并移除了旧视频 SDK 和调试调用入口。已实现钱包授权、按浏览器隔离并加密保存 Key，教案也走 TokenDance。分润、真实授权与扣费端到端联调尚未验证。

## 可复制的申请信息

- 应用名称：AI 在线课堂（AI Live Classroom）
- App URL：https://github.com/LerSent001/ai-live-classroom
- Icon URL：https://raw.githubusercontent.com/LerSent001/ai-live-classroom/main/public/icon.png
- 开源仓库：https://github.com/LerSent001/ai-live-classroom
- TokenDance 用户 Id：填写项目负责人在 TokenDance 账户中的真实用户 Id，不是 GitHub 用户名，也不是 API Key。
- 授权回调地址：待确认实际部署域名后配置。已实现 `/api/tokenpay/callback`，不能将仓库 URL 当作回调地址。

## 应用介绍与模型使用场景

AI 在线课堂是一款开源 AI 视频教学产品。用户输入学习主题，文本模型生成教学脚本和分镜，视频模型逐段生成讲解视频，并在可交互的 3D 教室内播放。支持中文输入、教师形象选择、30 秒初始课程和最多两次 10 秒续讲。

通过 TokenPay 钱包授权获取每位用户的专属 TokenDance API Key，由用户自己的账户余额支付教案和视频生成费用。未授权或额度不足时不提交新的生成请求，不回退到项目方私人模型 Key；已有视频回放不产生新的模型消费。

## 实施清单

- 钱包授权：`https://tokendance.space/auth`，使用 S256 PKCE 和绑定会话的一次性流程标识。
- 授权码交换：`POST https://tokendance.space/portal/api/v1/auth/keys`。
- Key 按用户安全存储；课程、异步任务和资源接口验证归属。
- 授权的 `app_url` 与请求头 `X-App-URL` 固定使用上述 App URL。
- 文本模型：使用 TokenDance OpenAI 兼容接口的 `deepseek-v3.2`，请求 JSON 输出；尚未做真实付费验证。
- 视频模型：已适配 `minimax-h3-max` 与 `minimax:video_generation_v2` 的提交、轮询和结果读取，通过注入响应测试；尚未做真实生成验证。
- 处理余额不足、授权取消、Key 失效、限额和任务失败；不自动重复付费提交。
- 与平台确认合作后台、分润、正式回调配置及测试额度；通过真实用户扣费和后台归因验证后再标记完成。

## 官方资料

- https://tokendance.space/docs/api-key-oauth.md
- https://tokendance.space/docs/app-attribution.md
- https://tokendance.space/docs/protocol-minimax-video-generation-v2.md
- https://tokendance.space/gateway/v1/models

官方托管服务可以限制生成入口只走 TokenDance。开源修改版可替换模型供应商，App URL 不构成访问控制。钱包授权也不自动提供观猹用户资料登录。
