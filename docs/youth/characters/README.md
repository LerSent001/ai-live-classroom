# 青年导师立绘 v1

## 90 年代日式赛璐珞 Q 版候选（2026-09-29）

- [男生 Q 版样张](./mentor-male-90s-jp-chibi-v1.png)与[女生 Q 版样张](./mentor-female-90s-jp-chibi-v1.png)由原男女立绘作为身份参考，使用 Codex 内置 imagegen 分别重绘。约 2.7 头身、手绘墨线、硬边两档阴影、轻微模拟胶片颗粒；保留原发型和服装。完整生成提示词见 [Q 版试稿记录](./chibi-v1.md)。
- 目前只作风格确认，不替换网页现有透明立绘；图片为带浅色底的 RGB 样张，不伪称透明素材，也未作为 TokenDance 视频参考图输入。
- 中文课堂新视频提示词已从美式改为 90 年代日式 Q 版赛璐珞。TokenDance 现有适配器仍只发送文本，跨片段人物一致性尚未通过付费视频实测。

## 美式赛璐珞旧试稿（2026-09-28，已弃用）

- [男生画风样张](./mentor-male-american-cel-v1.png)与[女生画风样张](./mentor-female-american-cel-v1.png)由现有立绘分别作为身份参考，经 Codex 内置 imagegen 重绘。保留原服装、发型、眼睛颜色；强化手绘墨线、硬边赛璐珞阴影、纸张与胶片质感。
- 这两张是带场景背景的风格样张，不是透明 UI 立绘，也不是已经用于 TokenDance 的首帧/角色参考输入。网页仍使用下方原有透明立绘，不增加页面加载或 3D 渲染开销。
- 该方向已被用户否定，不再是中文课堂当前的生成画风；保留试稿供历史对照，不作为网页或视频输入。

当前女生使用 [v2 独立服装设计：针织开衫与 A 字裙](./female-v2.md)。[v1 制作及切换验证记录](./female-v1.md) 保留供追溯；其照搬男生的服装已被用户否定，不再作为当前立绘。男生原图保留，下方为男生首版的制作和验证记录。

制作日期：2026-09-22。按用户要求参考洋葱学园校园动漫人物的视觉方向，设计独立角色，先生成正/侧/背三视图，再将该图作为唯一身份参考生成侧身半身展示图。使用 Codex 内置 imagegen，未使用 CLI 或 TokenDance，不改课程脚本/视频人物设定。

## 文件与用途

- `mentor-turnaround-v1.png`：1536×1024，正面、朝左侧面、背面，全身设定图。只供设定参考，不随网页加载。
- `../../../public/youth/characters/mentor-halfbody-v1.png`：1024×1536，朝页面内侧的 3/4 侧身半身立绘，真实 RGBA 透明通道。原始生成文件未做抠图、裁切或重绘。
- 原生 PNG 中约 51.6% 像素全透明；人物主体接近不透明，保留发丝与轮廓的抗锯齿透明度。
- 页面通过 Next Image 按显示尺寸提供缓存的优化格式，不直接要求浏览器下载原始 1.64 MB PNG。静态 DOM，无人物骨骼、额外 3D 模型、持续动画或 Three.js 渲染帧。
- 仅首页待提问时显示于右侧输入区上方；进入课程后隐藏。原黑白熊主题及其素材不变。

## 本地验证

- 类型检查、ESLint、99 项单元测试、生产构建及 29 项免付费接口检查通过。
- 后台 Chromium 已检查桌面 1672×941、手机 390×844、Retina、钱包遮挡，以及本地模拟播放期间隐藏立绘、回到首页恢复立绘；没有调用课程大模型或视频生成接口。
- WebGL 仍为 27 次绘制、40,072 个三角面，桌面静止 3 秒及 Retina 静止 2 秒新增渲染帧均为 0。该结果不代表浏览器总内存或功耗完全不变。
- 实测优化输出保留透明通道：普通桌面请求的 256×384 WebP 为 17,836 字节；640×960 WebP 为 59,474 字节。源 PNG 为 1,639,147 字节，不随三视图一起加载。
- 截图和机器检查结果位于被 Git 忽略的 `output/youth-qa/`；当前只在本地预览，未发布线上。

SHA-256：

```text
c38e8155113b68e5ff3da65ef78005c6cfbebe2fa31cd5d7976693975012979d  mentor-turnaround-v1.png
cc62a056358750e59dccd7688229387b2963571860c33292d36cf1d3328d7723  mentor-halfbody-v1.png
```

## 参考来源和边界

只借鉴干净线稿、校园番人物比例、头发高光与布料明暗表现；不使用洋葱品牌标志、吉祥物或原角色作为网页资产。以下第三方图仅保留于被 Git 忽略的 `output/youth-character/references/`，不打包发布：

- [洋葱学园产品宣传人物参考](https://down.7po.com/downlist/24434.html)，使用该页面关联的宣传图。
- [洋葱学园杨麟舜角色宣传参考](https://www.bilibili.com/list/ml2036986150?bvid=BV1HF411k7pq&oid=275386023)，使用该视频关联的封面图。

生成的是原创设计方向的 AI 图片，不代表洋葱学园官方人物、合作或授权。

## 最终生成提示词

### 1. 三视图（两张上述图仅作风格参考）

```text
Use case: stylized-concept. Asset type: production anime character turnaround sheet for an original Chinese educational classroom IP. The two supplied images are STYLE REFERENCES ONLY, not edit targets: use the polished youthful campus-anime linework and carefully drawn hair, faces and cloth shadows. Invent a distinct original character, do not copy any existing character, onion mascot, logo, poster design, costume, or identifying accessories.
Create exactly THREE full-body orthographic views of ONE consistent original male young-adult learning companion (early twenties): FRONT, true LEFT SIDE PROFILE facing image-left, BACK. All three stand straight in neutral relaxed poses, same height and scale, aligned on one baseline, evenly spaced across a wide clean white sheet; head and shoes fully within frame. Small tidy view labels below each figure only: 正面 / 侧面 / 背面. No other text, no palette swatches, no extra heads or characters.
Character: warm intelligent approachable young man, natural 7-head anime proportions, lean healthy build, short subtly tousled charcoal hair with a recognizable asymmetric lifted forelock, layered neatly around ears, warm amber-brown eyes, gentle confident smile. Contemporary Chinese campus-adjacent outfit: ivory lightweight collared zip jacket with muted sage-green shoulder/side panels and ribbed cuffs, pale blue crew-neck shirt, dark navy straight-leg trousers, simple ivory sneakers with small sage accents. No tie, glasses, mascot, jewelry, weapons, magic, props, cape or backpack. Clothing reads as tasteful everyday youth mentor wear, not an official school uniform. Jacket design and seams must agree precisely across the three views.
Style: refined hand-drawn 2D anime character art, clean variable-weight charcoal outlines, controlled 2-to-3-tone cel shadows with subtle soft reflected light, crisp hair highlight shapes, carefully modeled face planes and believable fabric folds; luminous, friendly, sunny in personality, not photorealistic and not 3D rendered. Not chibi, not childish cartoon, not western cartoon, not corporate flat vector or Material Design illustration. Presentation is a usable professional character model sheet, with identical identity and outfit in all three views and no environment, props, cast floor shadows, logos or watermarks. Wide landscape canvas.
```

### 2. 侧身半身立绘（三视图为唯一身份参考）

```text
Use case: identity-preserve. Asset type: a SINGLE isolated half-body anime character portrait PNG for the RIGHT SIDE of a Chinese classroom website. Input image is the identity anchor / character model sheet. Generate a new pose of this EXACT SAME original young adult male character, NOT a new person and NOT another turnaround sheet.
Preserve precisely: soft friendly amber-brown eyes, short tousled charcoal hair with the same asymmetric lifted forelock, same face shape and youthful proportions, ivory zip jacket with the identical sage-green raglan shoulder/arm panels and sage-striped ribbing, pale blue crew-neck shirt. Same polished 2D anime linework, clean 2–3-tone cel shading, subtle reflected light, handsome approachable expression, believable cloth folds. No additional accessories or redesigned costume.
Pose/framing: one half-body portrait only, from the complete top of the hair through the hips, with the torso turned about 55 degrees toward IMAGE LEFT (inward toward the classroom), head also turned left but slightly returned toward the viewer so both eyes and a gentle encouraging smile remain readable. This must visibly be a side-turned / three-quarter portrait, not a front-facing pose and not a flat 90-degree silhouette. Relaxed shoulders. One hand rests naturally in the trouser pocket as in the reference; the other forearm makes a small relaxed open-palm welcoming gesture toward image-left, fingers natural and anatomically correct, within the canvas. The gesture must be compact enough for a narrow sidebar. Keep entire head, hair, elbows and visible hand inside the image; clean half-body crop just below the jacket hem, at hip level; no legs. Portrait vertical canvas, character fills most of it with approximately 5% transparent breathing room around top and sides.
CRITICAL OUTPUT: genuine transparent alpha background, a cutout PNG with ONLY the character. No white or gray background, no painted checkerboard, no floor, no ground shadow, no scenery, no halo, no glowing outline, no card, no frame, no typography, no labels, no logos, no watermark, no additional characters. Do not soften or fade the actual clothing or hair edges. Static professional anime key art for a web UI, not a 3D render, not chibi, not flat corporate cartoon. Retain the dimensional hair and fabric shading from the reference.
```
