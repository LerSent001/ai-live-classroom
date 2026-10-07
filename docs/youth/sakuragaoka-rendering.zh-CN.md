# Sakuragaoka 参考风格的静态教室实现

参考项目：https://github.com/Kenton-GMI/sakuragaoka-station

固定来源版本：`4112f57208b7e29998344ca71fef74202c2b2bdd`，MIT。
保留的许可全文：`public/youth/licenses/sakuragaoka-station-MIT.txt`。

实际复用的是 `src/core/renderer.js` 的 softClip、暖高光／蓝紫暗部调色运算，以及 `src/core/materials.js` 的非纯黑描边配色原则。调色移到离线烘焙阶段；不引入它的整座小镇、连续动画循环、HDR 渲染目标、法线／深度预通道、屏幕空间描边、Bloom 或实时阴影。

## 网页运行方式

- 保留原有低面数教室、六套桌椅、4:3 悬挂显示器、进入与播放运镜和右侧 UI。窗户现为真实开洞与低透明度玻璃，见下方门窗更新。
- 使用 Blender Cycles 为同一份几何离线烘焙固定光照、家具投影与接触暗部，再用离线 OpenImageDenoise 清理采样噪点。
- 1536 × 1536 静态光照图使用 WebP，第二套 UV 使用归一化 Uint16；模型点位和法线的摘要校验防止几何修改后误用旧烘焙。
- 墙面、地板、家具采用无实时灯光计算的 `MeshBasicMaterial` 加光照图。原有小体积墙面／木纹／黑板图集继续共用。
- 窗框和屏幕外壳保留轻量 Phong 高光；窗玻璃改为参考项目的解析反光与透明混合，不使用环境贴图、透射或镜面实时反射。
- 选定的建筑与家具边缘合并成一个 `LineSegments` 绘制。线条淡、细，深度测试遮挡，不给整屏做边缘滤镜。
- 浏览器不创建任何阴影贴图，不运行 ContactShadows。静止时按需绘帧，视频仍由原 DOM 播放层处理。
- 保留 `preserveDrawingBuffer`，避免已有的静止画布／视频转换黑帧问题。

## 重建烘焙

在项目根目录，用已有 Node、Blender 和 sharp：

```sh
node --import tsx scripts/export-youth-bake.mjs
blender --factory-startup -b -t 2 --python scripts/bake-youth-lighting.py -- output/youth-bake/source.json output/youth-bake
node scripts/pack-youth-lighting.mjs
```

这些命令不调用大模型或视频生成接口。修改家具位置、灯光方向或模型拓扑后需要重新烘焙；摄像机移动、左右查看和播放切换不需要。

本方案使用参考项目的画面语言，教室构图与小镇构图不同，不代表完整复刻原项目或在所有镜头下像素一致。运行验证与截图以 `output/youth-bake` 和 `output/youth-qa` 为准；没有做不同方案的 A/B。

## 2026-09-26 首轮离线光照验证（门窗更新前）

- 光照 WebP：188,284 bytes；UV：486,168 bytes。新增离线资源合计 674,452 bytes，约 659 KiB。全部固定资产在进入场景时并行请求，没有运行时烘焙。
- 生产版 Chrome / Apple M4 Metal，1672 × 941 CSS 像素、Retina 环境、画布 DPR 上限 1.25：28 次绘制，40,514 个三角形，3 张 GPU 纹理，阴影图关闭，实际离屏绘制为 0。Three r185 自身预留的 3 个空 copy/scratch framebuffer 句柄不参与场景绘制。
- 入场与真实左右拖动的 146 个暖机后样本：RAF 回调加 `gl.finish` 的耗时中位数约 0.8 ms，p95 约 1.3 ms。它包含 CPU 提交和 GPU 同步等待，不是纯 GPU 计时，不代表功率／温度或长期帧率。
- 静止采样期间新增 3D 帧数为 0；本地测试视频稳定播放的一秒内，背景新增 3D 帧数为 0。
- 左右边界视角、桌面／移动端画面、电视运镜、4:3 播放区域、右侧标题／进度／分支、下一段与选中续讲检查通过。测试视频为本地编码的占位片段，付费生成调用 0。
- TypeScript、ESLint、107 项单测、生产构建和空 Key 验证通过。

证据：`output/youth-bake/verification.json`、`verification-pan.json`、`baked-desktop.png`、`baked-left.png`、`baked-right.png`、`baked-mobile.png`、`screen-playback-laptop.png`。

## 2026-09-26 门窗与现成道具更新

窗墙、门墙真实开洞，护墙板不再穿过门扇。黑板左移，植物和书本替换为 CC0 作者模型，详见 `public/youth/SOURCE.md` 和 `docs/youth/window-glass-adaptation.zh-CN.md`。

- 总三角形 44,658，较上一版增加 4,144（约 10.2%），主要用于真实植物叶形和门窗凹槽；仍限定在 45,000 以内。不能把模型替换说成“零几何成本”。
- 合并后的场景为 25 个网格材质批次，加 1 个细线批次，共 26 次绘制，少于旧版 28 次。GPU 纹理仍为 3 张，没有新增植物／书本纹理、实时阴影或离屏绘制。
- 两种植物及书本 GLB 合计 202,472 bytes；UV 增至 535,896 bytes。用少量下载和静态几何换取轮廓与结构，不引入逐帧物理、摆动或重型材质。
- 射线单测核对窗洞无实体墙背板、门扇确实内凹、黑板与时钟分离。最终生产截图和性能以 `output/youth-bake/verification.json` 为准，之前统计保留为历史，不代表另一套可切换方案。
- `room-detail.png` 直接读取当前网页 WebGL 画布，去除 HTML UI 遮挡便于查看门窗，不是效果图或离线渲染替代品。

最终复验：110 项单测、TypeScript、ESLint、生产构建、空 Key 边界验证通过。生产 Chrome / Metal 暖机后回调加 GPU 等待中位数约 0.9 ms，p95 约 1.5 ms（不是整机发热或纯 GPU 测量）；静止和稳定视频播放采样均新增 0 个背景 3D 帧，实际离屏绘制 0。最终光照图 189,062 bytes，UV 535,896 bytes。本地视频夹具确认原来的 4:3 屏幕、右侧标题／进度／分支及续讲仍正常，付费 API 调用为 0。
