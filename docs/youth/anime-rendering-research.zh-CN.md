# 二次元背景渲染：来源、取舍与性能边界

核对时间：2026-09-21 至 09-22。用户明确否定四阶 Toon / 平涂卡通方向，目标是有材质和空间层次的动画场景，而不是给所有物体套人物卡通着色器。

## GitHub 核对

| 项目 | 已核对内容与授权 | 结论 |
| --- | --- | --- |
| [pixiv/three-vrm / MToon](https://github.com/pixiv/three-vrm/tree/dev/packages/three-vrm-materials-mtoon) | 根仓库 [MIT](https://github.com/pixiv/three-vrm/blob/dev/LICENSE)；着色器有 shadeColor、shadingToony、rim、matcap、outline 等可选项，明暗分界可调，并非二次元一定等于硬平涂 | 是可合法使用的成熟人物材质实现，但本教室不引入 VRM 角色框架或整套材质功能。未安装新依赖、未复制其代码。 |
| [Isk5434/sakura-city](https://github.com/Isk5434/sakura-city) | 动漫街景、程序几何与材质；README 明确每帧做 shadow / beauty / normal-ink 三遍并带 Bloom / 调色。API 未找到正式 LICENSE | 只能作为视觉/技术研究来源，不能按正式开源授权直接复制；更不搬其三遍渲染管线。 |
| [ZaneAtega/Three-js-Anime-Shader](https://github.com/ZaneAtega/Three-js-Anime-Shader) | README 为 Three r152，偏人物；列出 Bloom / SMAA，授权仅为口头式说明，没有标准 LICENSE 文件 | 不直接并入当前 r185 项目。代码许可、模型、音乐等权利也不能混为一谈。 |
| [conswang/webgpu-impact](https://github.com/conswang/webgpu-impact) | WebGPU 原神风格实验，API 未找到 LICENSE | 不为一个材质修正迁移渲染后端，不引入授权不明代码 / IP 角色资产。 |

本轮实际依然使用项目已安装的 Three.js：连续漫反射用于墙面、家具，轻量 Phong 用于不透明玻璃和窗框。不是声称接入了一个完整的 GitHub 动漫引擎，也不借“二次元”名义增加描边 / Bloom / SSR / 实时反射。

## 黑白熊版墙面为什么有质感

核对 `src/components/set/textures.ts` 的 `makePlaster()` / `repeatSurface()` 及 `src/components/classroom-set.tsx`：

- 基础纹理为 512 × 512 的颜色、凹凸、粗糙度数据；带固定种子的多尺度纹理。
- 创建后主要是 GPU 纹理采样，不是每帧重生成整张图片；但原版在浏览器首次创建像素数据也有一次 CPU 开销。
- 原版墙面使用 MeshStandardMaterial + bumpScale + roughness，再叠加整场光照 / 阴影 / 后处理，不能把最终质感全归功于一张贴图。
- **贴图不是零成本。** 颜色贴图需要显存、带宽和采样；凹凸还有导数计算与额外采样；粗糙度图还服务于更复杂的高光模型。本地 Three r185 的 bump shader 有三次高度采样。
- 本轮没有修改这些原 Demo 文件。

## 新版的有限预算方案

- 删除硬四阶梯度纹理与几何描边；连续明暗保留曲面厚度，墙角层次在静态顶点颜色中初始化，不逐帧运行 AO。
- 墙面、木纹与公式复用原项目已存在的图片，只做离线缩放和图集打包；没有生成新概念图。
- 原黑板独立纹理为 2048 × 732，1,499,136 基础像素；新图集 1536 × 768，1,179,648 基础像素，比原黑板小约 21.3%。板面内容宽度降为 1536，实景重新检查公式可读性。
- 图集 80,316 bytes，比原黑板 WebP 的 90,790 bytes 小；不是在原图之上再下载三张纹理。
- UV 在初始化按墙面的细分网格分块重复；木纹方向随竖向门板调整；没有每帧程序噪声或逐像素多层混合。
- 窗户去掉平面反光色块与描边，玻璃向框内后退；用不透明蓝灰玻璃、连续顶点明暗和局部高光表现厚度。没有室外场景、透明折射、环境捕获、SSR。
- 保留既有缓存阴影、按需渲染、DPR 1.25、六套桌椅以及原黑屏 / 媒体就绪 / 运镜 / 播放流程。
- 候选版全场 40,072 三角面、27 次常规绘制，低于被否定的平涂版 40,528 / 29。

## 对照方法

`scripts/measure-youth-materials.cjs` 使用一个隔离、无头 Chromium，3 次独立页面加载。固定 CSS 1672 × 941、DPR 1、正式构建；只测有限入场帧，排除前 12 帧纹理上传 / 着色器编译 / 阴影捕获。所有供应商入口被阻止，不打开用户浏览器。

计时为 RAF 回调加 `gl.finish()` 的同步耗时，含 CPU 提交与 GPU 等待，**不是独立 GPU 时间、FPS 上限或机身功耗**。不同运行受调度、系统其他工作和时钟精度影响，不能因为某次少 0.1ms 就声称普遍性能提升。原始逐帧结果保存在 `output/youth-material-study/`。

## 实测与最终取舍

| 版本 / 原始记录 | 三次中位数 ms | 三次 P95 ms | 常规提交 / 三角面 |
| --- | --- | --- | --- |
| 被否定的硬 Toon，`flat-before.json` | 1.0 / 1.4 / 1.4 | 1.5 / 1.8 / 1.6 | 29 / 40,528 |
| 连续材质 + 微凹凸候选，`textured-bump.json` | 0.7 / 0.6 / 0.6 | 1.0 / 0.9 / 1.0 | 27 / 40,072 |
| 最终颜色纹理、无凹凸，`textured-final.json` | 1.1 / 0.6 / 1.3 | 1.8 / 1.7 / 1.9 | 27 / 40,072 |

每次约 58–59 个暖机后入场帧。候选带凹凸反而测得更短，说明这么短的样本受系统调度、GPU 状态与测量扰动影响，不能据此推断“加凹凸会更快”，也不能挑最快的候选结果冒充最终结果。最终 P95 比基线个别样本高 0.1–0.3ms；没有足够证据归因于材质，也不声称精确 FPS 或功耗改善。

最终采用**无凹凸**：全景可见差别很小，没必要保留明确增加额外高度采样和导数计算的功能。保留静态颜色细纹理、连续明暗和窗框结构。只可得出：几何、常规提交和纹理尺寸预算更低，有限同机测试耗时处于同一量级；不能证明所有 MacBook Air 上性能 / 功耗绝对无变化。若要精确证明电池功耗或机身温度，需另一轮可控环境长时测试，本轮没有后台持续压测用户电脑。

最终实景为 `textured-final.png`。`comparison.png`、`comparison-window.png`、`comparison-wall-wood.png` 左侧是用户否定的实际旧页面，右侧是修正后的实际页面，不使用概念图替代交付截图。生成对照的脚本为 `scripts/compare-youth-materials.cjs`。
