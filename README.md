# AI Live Classroom · AI 在线课堂

输入主题，由文本模型编写教案，再逐段生成讲解视频，在可交互的 3D 教室中播放。支持中文交互、教师形象选择、30 秒开场和最多两次 10 秒续讲。

![课堂界面](docs/lobby-danganronpa.jpg)

## 接口与当前状态

| 能力 | 当前实现 |
| --- | --- |
| 视频生成 | **仅 TokenPay / TokenDance 网关**，模型 `minimax-h3-max` |
| 教案生成 | TokenDance 网关，`deepseek-v3.2`，使用当前用户钱包 |
| 离线海报与立绘工具 | OpenAI Images，仅手动运行脚本时调用，不参与课程生成 |
| 用户钱包授权 | 已实现 S256 PKCE 授权及手动 Key 连接，按浏览器隔离钱包 |

视频提交和任务查询的域名固定为 `tokendance.space`，不提供备用视频服务或自定义网关地址。视频创建 POST 只发送一次；提交结果未知、余额不足、Key 失效或任务失败时停止，不自动重新创建任务。视频结果文件可能由平台返回的其他 CDN 域名提供。

**这次已完成网关适配及模拟测试，尚未进行真实 TokenDance 付费生成和账单验证。** 当前按浏览器 Cookie 隔离钱包，尚未提供跨设备账户登录。

应用归因固定为 `https://github.com/LerSent001/ai-live-classroom`。详见 [合作申请与接入状态](docs/tokendance-integration.md)。

## 本地运行

使用 Node 22.6+：

```bash
npm ci
cp .env.example .env.local
# 本地默认无需填写 Key；在页面授权连接 TokenPay 钱包
# 部署时将 TOKENPAY_PUBLIC_URL 改成实际 HTTPS 域名
npm run dev
```

在 `http://localhost:3000` 打开教室。Key 加密保存在服务器忽略目录中，禁止提交到 Git。未连接钱包时，不发起课程规划或视频请求。

只浏览教室或切换角色不收费；主动创建课程会调用付费服务。完整 30/10/10 路径最多提交 10 段五秒视频，同时最多生成两段。历史录制命中时直接播放已有视频，不产生新视频调用，也不再次计费。

当前保留了原型的本地价格复核截止时间 `2026-09-07T00:00:00Z`，超过该时间会拒绝新增生成。这不是 TokenDance 的价格有效期。运行时的 `estimatedSpendCents` 等旧字段是保留的本地调度预算计数，不代表 TokenDance 人民币价格或实际账单；新视频记录的费用估算和实际扣费均保持 `null`，待平台价格与账单联调后更新。

默认 `SAVE_RECORDINGS=1`，将脚本、任务 ID、结果元数据与下载的视频保存在 Git 忽略的 `recordings/`。日志不记录鉴权头或完整 Key。查询超时不代表远程任务被取消；使用已保存的任务 ID 核对状态，不应重复生成。

如需使用 shell 的网络代理，可运行 `npm run dev:proxy` / `npm run start:proxy`，需要 Node 22.21+ 或 24.5+。

## 部署与验证

课程状态保存在单个 Next.js Node 进程内，视频写入本地磁盘。使用常驻进程部署；当前不适合无状态、多实例或短时 Serverless 环境。服务重启不会恢复已提交的远程任务。

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify
```

测试通过注入 HTTP 响应验证 TokenDance 路由、鉴权、归因、轮询、失败停止和禁止重试。`verify` 使用空 Key 验证无消费路径，不创建真实付费任务。

## 代码入口

- `src/server/tokenpay-video.ts`：唯一的视频创建与轮询实现。
- `src/server/classroom-runtime-instance.ts`：课程规划与视频生成的服务端绑定。
- `src/lib/classroom-config.ts`：角色、提示词、固定模型、网关与 App URL。
- `src/server/tokenpay-planner.ts`：通过 TokenDance 生成教案。
- `src/components/set/`：Three.js / React Three Fiber 教室。

## 来源与许可

基于 [internetphysics/live-classroom](https://github.com/internetphysics/live-classroom)，基础提交 `5a07110fa4e0b3dc4db0eab842bc6e0cf4169de4`。由 LerSent001 整理发布中文交互与课堂视觉修改版，保留原作者 MIT 许可和署名。

代码采用 MIT 许可。Monokuma、Monomi 与 Danganronpa 角色属于 Spike Chunsoft；第三方角色素材不受本项目 MIT 许可覆盖，发布仓库不代表取得商业使用许可。各素材来源与限制见 `public/characters/*/SOURCE.md` 和 `public/models/monokuma/SOURCE.md`。

## TokenPay 钱包

页面右上角选择「授权连接」，在 TokenDance 确认 Key 的额度与有效期后自动返回。已有 Key 可选择「粘贴 Key」；保存前仅查询余额，不会生成课程。开始课程才会产生模型调用费用。

授权使用 S256 PKCE、10 分钟有效的一次性状态，并绑定发起授权的浏览器。无需 Watcha OAuth 客户端 ID。教案与视频使用该浏览器连接的 Key，服务端不回退到共享 Key。每个浏览器的会话与录像独立保存。断开后停止新的视频提交，已被平台接受的任务可能继续完成与计费。

Key 以 AES-256-GCM 加密保存在被 Git 忽略的 `.tokenpay/`，目录同时保存权限为 600 的本机加密密钥；部署应保护并持久化整个目录，磁盘管理员可读取其中的数据。浏览器只持有 HttpOnly 会话 Cookie。清除 Cookie 后需重新连接钱包；平台 Key 的撤销请到 TokenDance 控制台操作。

当前适用于单个 Node 服务实例与持久化磁盘；多实例部署前需将钱包、授权状态和课堂运行时迁移到共享存储。授权期间重启服务会使该次授权失效，需要重新发起。设置 `TOKENPAY_PUBLIC_URL` 为真实访问地址，否则跨域校验和回调会拒绝请求。
