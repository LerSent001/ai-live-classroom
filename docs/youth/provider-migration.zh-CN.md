# 统一 TokenDance 脚本接口，退役 Gemini（2026-09-22）

用户确认关闭思考后的脚本速度合格，要求使用 TokenDance DeepSeek 4.1 Flash 并移除原 Gemini 接口。

## 当前行为

- 主课堂继续通过每位使用者自己的 TokenDance 钱包请求 `deepseek-v4.1-flash`，固定 `thinking.type=disabled`。没有额外配置步骤，也不读取服务器共享模型 Key。
- 该请求与之前[三题快速脚本实测](deepseek-fast-planner.zh-CN.md)一致：5.825 / 6.446 / 6.762 秒、平均 6.344 秒。本轮没有为了接口迁移重复付费测试；三题数据不是任意时段的延迟保证。
- 本工作区的黑白熊兼容路由也复用相同的 TokenDance 脚本适配器，但保留独立凭证、角色提示及原 fal 视频接口。若要私下启用旧 Demo 的新生成，操作员需自行提供 `TOKENDANCE_API_KEY` 和 `FAL_KEY`，并处理原有价格保护；不会自动复制或借用主课堂访客钱包。浏览旧风格和播放已有完整记录不需要这些 Key。
- 两个风格的视觉、主课堂 TokenDance 视频模型、30/10/10 课程结构及钱包隔离不变；没有自动回退到其他脚本模型。

## 清理与保留

- 删除活动源码中的 Gemini 适配器及专属测试、模型配置、运行环境读取、请求地址和旧提示文案；旧测试覆盖迁移到 TokenDance。
- `.env.local` 中唯一一条 `GEMINI_API_KEY` 配置已删除，其他配置原样保留。未输出 Key，也未制作 Key 备份。这是移除项目配置，不是在 Google 控制台撤销密钥。
- 早期批量模型 benchmark 已移除；`compare-classroom-planners.mjs` 改成只读历史 summary，拒绝付费运行参数；`probe-planner-narration.mjs` 改成只读已保存脚本，不再调用模型。
- 被移除或替换的五份旧代码已保存为 `output/retired-gemini/2026-09-22/` 下的 `.txt` 备份，可手动恢复。它们不参与编译、不由网站提供，也被 Git 忽略。
- 历史对比报告、原始测试证据、录制与已生成视频保持原样；历史文档加了当前状态说明，没有把旧模型结果改写成新模型结果。
- 此次只改当前 `live-classroom` 工作区，不改其他 Git 分支、相邻旧项目或 Google 账户。

## 验证

- TypeScript、ESLint、100 项自动测试、生产构建、29 项免付费接口检查和 diff 检查通过。
- 新测试防止活动源码和工具重新引入 Gemini 请求地址、Key 配置及旧适配器；校验两个风格共用脚本接口但不共用访客凭证。
- 检查构建后的 79 个服务端 JavaScript 文件，Gemini 请求地址和环境 Key 引用均为 0。
- 旧报告读取、离线旁白检查、快速脚本工具 dry-run 验证通过；本轮真实模型/视频请求为 0。
- 本地 3029 服务已换成新构建，共享 Key 留空，不影响主课堂独立钱包使用。尚未推送 GitHub或部署公网。
