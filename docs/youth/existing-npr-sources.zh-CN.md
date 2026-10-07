# 现成三渲二来源筛选（2026-09-22）

用户要求：不要从零自写着色器，先找真实 GitHub 实现或 Blender 教程 / 工程。自写柔边 Cel 实验已撤回，未部署到预览。当前只恢复输入页黑色渐变遮罩，材质仍为上一轮版本，不宣称已达到三渲二验收。

## 最相关的来源

| 来源 | 已核对的交付 / 许可 | 适合本项目的部分 | 未验证或不适用边界 |
| --- | --- | --- | --- |
| [ALLO / Anime Classroom](https://blenderartists.org/t/anime-classroom-environment/1370707)，[作者制作拆解](https://www.blendernation.com/2022/05/04/behind-the-scenes-anime-classroom-environment/)，[视频](https://youtu.be/ovudHkgMSUc) | 实际 Blender 3.0 / Eevee 教室作品、截图、视频及材质流程；没有核实到完整工程的公开下载和再分发许可 | 直接针对教室、木材、玻璃、阴影色的制作范例；作者说明模型简单、重点为材质和光影，适合作为用户确认的视觉基准 | 是制作拆解，不冒充逐步完整课程或可直接复制的开源场景。含 SSR、AO、反射、反壳描边和后期，不能全搬到 Air 网页；人物和海报也不是可随意复用素材 |
| [argonius / Anime Classroom](https://blendswap.com/blend/19436) | 页面标注 CC0，完整 `.blend`，Blender 2.7x / Blender Internal，8.73 MB；作者说明模型及照片纹理由自己制作 | 现成教室、桌椅、门窗，可作为“不从零造模型”的候选 | [下载页](https://blendswap.com/blend/19436/download)需要登录。本轮未下载、未转换 GLB、未测面数；8.73 MB 不是网页体积或性能证据。旧渲染器材质不能当成现代网页即插即用 |
| [Call Me Sensei / ToonLab](https://github.com/call-me-sensei-app/toonlab)，[环境模块](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/environment.md) | 核对根 [MIT LICENSE](https://github.com/call-me-sensei-app/toonlab/blob/main/LICENSE)，npm 名称 `@call-me-sensei/toonlab`，版本 0.4.24；现成动漫环境材质和场景预设 | 和网页技术栈相关，不只是人物 shader；可保留现有模型，按材质角色套用现成环境模块 | [后端说明](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/tsl-conventions.md)明确改为 TSL / WebGPURenderer，WebGL2 fallback 也不是项目现有 WebGLRenderer；需隔离迁移试验。反射、环境探针、AO、灯光、天空等不能全开；本轮没有安装、没有集成或性能承诺。MIT 代码不代表第三方演示资产同许可 |
| [taro8 / blender-90s-anime-shader](https://github.com/taro8/blender-90s-anime-shader) | GitHub 内有现成 `.blend` 材质和合成工程，根 LICENSE 为 GPL-3.0；作者表示去除了不适合再分发的资产 | 想要复古动画质感时，可直接检查现成节点组和阴影配色，不必从零造 | 作者明确主要效果来自合成。不是课堂模型，也不是 WebGL 材质；未下载测试。不能把节点 / 合成直接导出后声称网页原样保留 |

## 其他筛选结果

- [Kristof Dedene / 建筑程序材质](https://kdedene.gumroad.com/l/UAwFB)：作者商店列出 `$0+` 教程文件，内容相关于木材、墙面。具体商品页本轮抓取无正文，未核对完整资源及再分发许可；免费价格不等于开源，不作为已经取得的生产资产。
- [bnpr/Malt](https://github.com/bnpr/Malt)：成熟 NPR 框架，README 标注 MIT，但当前官方需求为 Windows / Linux + OpenGL 4.5，建议独显；不适合作为这台 MacBook Air 网页的直接运行方案。
- 上一轮的 sakura-city、ZaneAtega shader 未核对到正式开源许可，本轮仍不复制代码。Lightning Boy 的收费版本不是已授权素材。

## 下一步决策

先以 ALLO 作者实景核对“要的质感”，而不是再用自己生成的概念图代替来源。再从现成模型 / 现成渲染模块选择实施路径。若严格优先保持网页成本，可评估把静态表面和遮蔽离线存入贴图；但视角相关的反射、描边和后期不能都无损烘焙，必须在实际镜头中检验，不保证一张贴图完全复刻成片。

glTF 支持的材质与 Blender 任意节点组不同，来源：[Khronos 官方导出器文档](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/docs/blender_docs/scene_gltf2.rst)。上述候选目前只完成来源筛选，没有声称下载 / 兼容转换 / 网页功耗验证已完成。

## 本轮已交付的窄范围修复

`.youth-lobby::after` 恢复黑色渐变：桌面右侧、手机底部；`pointer-events: none`，无 blur/filter/动画，不添加 WebGL 绘制通道。课程 active 时没有遮罩，视频不压暗。生产构建、67 项单测、TypeScript、ESLint、15 项空密钥 API 与完整后台浏览器回归通过。常规帧仍为 27 calls / 40,072 triangles；静止和视频播放抽样背景新帧仍为 0。这不是功耗零变化的证明。
