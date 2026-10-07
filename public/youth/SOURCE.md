# 中文课堂材质来源

- `oak.webp`：内置 OpenAI ImageGen 生成的浅橡木无板缝基础色贴图，1024 × 1024，84,750 bytes。
- `chalkboard.webp`：内置 OpenAI ImageGen 生成的正视黑板表面，2048 × 732，90,790 bytes。内容仅为数学、物理公式及图示；没有主题名称或海报标语。
- `plaster.webp`：内置 OpenAI ImageGen 生成的暖白灰泥基础色贴图，512 × 512，10,662 bytes。

以上均为 2026-09-21 根据用户选定的效果图制作，并用 Sharp 压缩。生成原图保留在 Codex generated_images，项目内只使用以上 WebP。

## 2026-09-21 动漫低模版

桌椅现在使用真实第三方 CC0 模型，不是旧版拼装占位几何：

| 输出 | 原作 / 作者 | 授权 | 原始 → 网页三角面 | 网页体积 |
| --- | --- | --- | --- | --- |
| `models/school-desk.glb` | [School Desk 01](https://polyhaven.com/a/SchoolDesk_01) / Ethan Place | CC0-1.0 | 4,162 → 2,020 | 87,424 bytes |
| `models/school-chair.glb` | [School Chair 01](https://polyhaven.com/a/SchoolChair_01) / Ethan Place | CC0-1.0 | 5,072 → 2,683 | 89,352 bytes |

来源与再分发条款：[Poly Haven Asset License](https://polyhaven.com/license)、[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。已核对可修改、商用、再分发。仅使用模型本体，不包含网站标识或预览图。项目不宣称这些模型为自制。

转换：原生 glTF → Blender 4.2 后台整理共面三角形及减面 → 根据原始 UV 色彩分类为浅木 / 青绿塑料 / 金属 / 脚垫，以顶点颜色保留轻量凹陷层次 → 输出无纹理、骨骼、动画的 GLB。未付费生成。原始体积、下载 URL 与 MD5 由 `scripts/fetch-youth-furniture.mjs` 保存到 `output/youth-source`；转换脚本为 `scripts/prepare-youth-furniture.py`，统计在 `models/manifest.json`。

运行时只载入两份模型并合并六套桌椅，一次几何批次绘制；不重复下载。两份 GLB 合计 176,776 bytes。此阶段曾使用四阶明暗查找表；用户已否定其卡通 / 平涂观感，该材质方案在下面的 09-22 修正中移除。

建筑、讲台、书柜、门窗、悬挂臂和电视机身仍是项目自制静态低模，位于 `src/components/youth/room-model.ts`，不能称为下载的整套开源教室。此轮增加门板层次、窗框双轨与把手、支臂矩形外壳和独立关节。窗户仍为不透明表面，没有窗外模型。钟面固定，不逐秒更新。

视觉基准存档：`docs/youth/selected-reference.png`。该图只用于设计核对，不是网页背景，也不参与运行时加载。

## 2026-09-22 连续明暗与表面质感修正

- `surfaces.webp` / `surfaces.json`：由上面的已有公式、灰泥、木纹离线缩放并打包，没有本轮新增 AI 生成或第三方图片。1536 × 768，80,316 bytes；复现脚本 `scripts/pack-youth-surfaces.cjs`。
- 运行时只下载该图集，不再单独请求 `oak.webp`、`plaster.webp`、`chalkboard.webp`。基础纹理像素比原独立黑板少约 21.3%；钟面仍是原有 256 × 256 CanvasTexture。
- 家具 GLB 本体仍不带纹理。运行时为木质区域添加图集 UV，其他区域保留离线顶点配色；六套仍合为一个绘制批次。
- 四阶 Toon / 轮廓线已删除。墙面和家具使用连续 Lambert 明暗与静态顶点层次，玻璃 / 窗框使用不透明 Phong 局部高光。最终不保留试验性的墙面凹凸采样，也没有新增法线、粗糙度贴图、后处理或逐帧 AO。
- GitHub 项目仅做技术与许可调研，未复制来源不明代码、未引入新依赖。详见 `docs/youth/anime-rendering-research.zh-CN.md`。不要将图集或自制建筑误标为来自 GitHub 的整套开源教室。

## 2026-09-26 Sakuragaoka 风格与离线光照

- 参考并改编 [Sakuragaoka Station](https://github.com/Kenton-GMI/sakuragaoka-station) 的冷暖调色运算与紫灰描边配色，来源固定为 `4112f57208b7e29998344ca71fef74202c2b2bdd`。MIT 许可保存在 `licenses/sakuragaoka-station-MIT.txt`。
- `lighting.webp` 为当前教室真实几何经 Blender Cycles 烘焙、OpenImageDenoise 离线去噪、调色后生成的静态光照图；`lighting-uv.bin` 为对应的第二套 UV。它们不是该 GitHub 项目的贴图，也不是 AI 生成图片。复现步骤与边界见 `docs/youth/sakuragaoka-rendering.zh-CN.md`。
- 运行时不再建立阴影图或 ContactShadows。墙面／家具用 Basic 材质读取烘焙光照，少量玻璃与电视机壳保留轻量高光；选定真实边缘合并成一个细描边批次。没有采用参考项目的全屏描边、Bloom 或实时程序噪声。

## 2026-09-26 门窗、植物与书本修正（当前版本）

- 窗玻璃已替换上文历史版本的不透明材质。`window-glass.ts` 改编同一 MIT 参考项目 `src/core/materials.js` 的世界空间 Fresnel 与解析天空反光公式，透明度 0.14、无斜线高光、无折射 / 环境贴图 / 离屏通道。sRGB 转换由当前 Three 主通道处理，未复制小镇的后处理管线。窗洞后只有 2 个三角形的淡天空渐变，不建设户外场景。
- 窗墙真实分段开洞，玻璃放入有厚度的窗框内。右侧墙也真实开门洞，加入内凹门扇、通厚门套、门止口、铰链和门槛；护墙板、踢脚线在门洞处断开。门玻璃后只有静态浅走廊背板。
- 黑板整体左移 0.65 场景单位，黑板面右缘与钟面左缘的水平间隔为 0.845 单位；没有改变公式贴图。

| 运行时模型 | 作者与原作 | 三角形 | 字节 |
| --- | --- | --- | --- |
| `monstera-plant.glb` | Isa Lousberg / [Monstera Plant](https://poly.pizza/m/s9Nocqk1Ge) | 2,892 | 103,904 |
| `pothos.glb` | Isa Lousberg / [Pothos Plant Small](https://poly.pizza/m/QqbCvErL93) | 1,624 | 70,944 |
| `books.glb` | CreativeTrio / [Books](https://poly.pizza/m/dxt7dETAy9) | 360 | 27,624 |

均为 CC0 1.0，可修改、再分发；完整资源集授权页：[House Plants set](https://poly.pizza/bundle/House-Plants-set-Kpj32c7VmF)、[Household Props 001](https://poly.pizza/bundle/Household-Props-001-KsNBhP96PT)。归档见 `licenses/props-CC0.txt`。

叶片为作者模型的真实轮廓；不再使用原先 18 片重复三角叶。嵌入纹理的配色离线转换为顶点色，龟背竹由偏蓝绿调为叶绿。书本保留原模型的封面、书脊、书页和倾斜书册；书架两层不同朝向、高度，讲台横放。三份 GLB 合计 202,472 bytes，合并成一个场景材质批次，无新增 GPU 纹理。

复现：`node scripts/fetch-youth-props.mjs` → `blender --factory-startup -b -t 2 --python scripts/prepare-youth-props.py` → 按上文重新烘焙光照。未调用任何图片、脚本或视频生成接口。
