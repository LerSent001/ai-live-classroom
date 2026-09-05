# AI Live Classroom · AI 在线课堂

输入主题，由文本模型编写教案，再逐段生成讲解视频，在可交互的 3D 教室中播放。支持中文交互、教师形象选择、30 秒开场和最多两次 10 秒续讲。

![课堂界面](docs/lobby-danganronpa.jpg)

## 接口与当前状态

| 能力 | 当前实现 |
| --- | --- |
| 视频生成 | **仅 TokenPay / TokenDance 网关**，模型 `minimax-h3-max` |
| 教案生成 | Google Gemini 直连，`gemini-3.1-flash-lite` |
| 离线海报与立绘工具 | OpenAI Images，仅手动运行脚本时调用，不参与课程生成 |
| 用户钱包授权 | 尚未实现；当前为单用户自行部署、配置自己的 TokenDance Key |

视频提交和任务查询的域名固定为 `tokendance.space`，不提供备用视频服务或自定义网关地址。视频创建 POST 只发送一次；提交结果未知、余额不足、Key 失效或任务失败时停止，不自动重新创建任务。视频结果文件可能由平台返回的其他 CDN 域名提供。

**这次已完成网关适配及模拟测试，尚未进行真实 TokenDance 付费生成和账单验证。** 当前版本不具备多用户钱包隔离和登录鉴权，不应把自行部署的共享 Key 实例作为公开付费服务。

应用归因固定为 `https://github.com/LerSent001/ai-live-classroom`。详见 [合作申请与接入状态](docs/tokendance-integration.md)。

## 本地运行

使用 Node 22.6+：

```bash
npm ci
cp .env.example .env.local
# 填写自己的 TOKENDANCE_API_KEY 和 GEMINI_API_KEY
npm run dev
```

在 `http://localhost:3000` 打开教室。Key 仅保存在服务器配置中，禁止提交到 Git。缺少任何必要 Key 时，不发起课程规划或视频请求。修改配置后重启服务。

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
- `src/server/gemini-planner.ts`：当前独立的教案模型调用。
- `src/components/set/`：Three.js / React Three Fiber 教室。

## 来源与许可

基于 [internetphysics/live-classroom](https://github.com/internetphysics/live-classroom)，基础提交 `5a07110fa4e0b3dc4db0eab842bc6e0cf4169de4`。由 LerSent001 整理发布中文交互与课堂视觉修改版，保留原作者 MIT 许可和署名。

代码采用 MIT 许可。Monokuma、Monomi 与 Danganronpa 角色属于 Spike Chunsoft；第三方角色素材不受本项目 MIT 许可覆盖，发布仓库不代表取得商业使用许可。各素材来源与限制见 `public/characters/*/SOURCE.md` 和 `public/models/monokuma/SOURCE.md`。
