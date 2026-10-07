# 女生导师 v1 与男女切换

历史版本：用户否定了这版照搬男生的服装；当前改用 [v2 独立服装设计](./female-v2.md)。本页的制作和测试记录仅对应 v1，不代表用户视觉验收。

制作日期：2026-09-22。使用 Codex 内置 imagegen，先以已有男生三视图为画风及服装系列参考，生成原创女生的正/侧/背三视图，再以女生三视图作为身份参考、男生半身图作为构图参考生成页面立绘。没有使用 CLI、TokenDance 或课程生成接口。

## 资产

- `mentor-female-turnaround-v1.png`：1536×1024，白底三视图；仅保存在文档目录，不随网页加载。
- `../../../public/youth/characters/mentor-female-halfbody-v1.png`：1024×1536，1,665,968 字节，原生 RGBA；约 53.05% 像素全透明。保留原始生成文件，不裁切、不重新绘制、不将背景填成实色。
- 男生原图不变，SHA-256 仍为 `cc62a056358750e59dccd7688229387b2963571860c33292d36cf1d3328d7723`。
- 女生三视图 SHA-256：`665a52bf51013a1b3d873f050df2fec7164c7ac55f5a756f0da9e90cba1f8554`。
- 女生半身图 SHA-256：`0b94c6710393320098753b85a1ede080929d4b6261b13bc424b67b438f19fe34`。

## 页面行为与性能边界

- 复用原黑白熊主题的单按钮“⇄ 切换形象”交互，默认男生，点击在男生和女生间循环；按钮支持鼠标、触摸、Enter 和空格。
- 选择状态由课堂页面持有，不清空问题草稿，不改变标题/输入框布局；进入课程时隐藏，返回“新课程”时恢复所选形象。刷新页面仍默认男生，与原有内存状态方式一致。
- 切换仅影响大厅 UI。课程的 `youth-question` 身份、DeepSeek 脚本配置、视频和配音均不改变；不以性别作为课程分类。
- 两个原始 PNG 共用静态 CSS alpha mask：上部 68% 保持不透明，78% 处遮罩不透明度 85%，最底部为 0%。遮罩只作用于图片，不影响按钮、标题、输入框及 TokenDance 钱包。
- 同时仅挂载当前一张图片，Next Image 继续按显示尺寸输出优化格式。无新 3D 模型、骨骼、实时阴影、滤镜或持续动画。切换首次载入女生图会产生一次普通图片下载/解码，不能理解为浏览器内存或瞬时开销完全为零。

## 本地验证结果

- TypeScript、ESLint、102 项单元测试、生产构建和 29 项免付费接口检查通过。
- 一个后台 headless Chromium 进程完成桌面 1672×941、手机 390×844、Retina 1440×900 检查，没有切换用户的前台窗口。
- 鼠标点击、Enter、空格均能在男女间循环；切换时所有 API 写请求计数为 0，问题草稿与标题/表单坐标不变，按钮 110×44 像素并保持可读、可点。
- 已连接钱包的本地模拟测试确认：切换不提交课程；开始课程后立绘和按钮隐藏，点击“新课程”后仍恢复所选女生。视频是浏览器本地编码的测试片段，不是实际生成课程；真实课堂脚本/视频调用数为 0。
- 场景仍为 27 次绘制、40,072 个三角面，桌面静止和切换后静止新增渲染帧均为 0；Retina 静止也没有持续渲染。
- 已视觉检查男生下缘渐变、桌面女生及手机女生实际截图。TokenDance 钱包和原黑白熊独立主题回归通过，浏览器错误为 0。
- 女生图优化输出：256×384 WebP 为 18,816 字节，640×960 WebP 为 67,396 字节，都保留 alpha。三视图不在运行时资源中。
- 截图及机器检查报告：被 Git 忽略的 `output/youth-qa/desktop.png`、`desktop-female.png`、`mobile-female.png`、`browser-check.json`。仅本地预览，尚未发布线上。

## 最终生成提示词（内置 imagegen）

### 1. 女生三视图

参考图：`mentor-turnaround-v1.png`，只作风格与服装系列参考。

```text
Use case: stylized-concept. Asset type: production anime character turnaround sheet for the FEMALE counterpart to the original male classroom learning companion in the supplied image. The supplied male turnaround is a STYLE AND WARDROBE-FAMILY reference only, not the person to preserve. Create a distinct original young-adult WOMAN, early twenties, with the same refined campus-anime rendering quality and coordinated outfit. This is not a gender edit of a real person.
Exactly THREE full-body orthographic views of ONE consistent female character: FRONT, true LEFT SIDE PROFILE facing image-left, and BACK. Identical scale and height, same level baseline, neutral relaxed standing poses, heads and shoes fully within the canvas, evenly spaced across a landscape white model sheet. Small tidy labels below the figures only: 正面 / 侧面 / 背面. No additional text or extra figures.
Character: friendly intelligent and sunny young-adult female learning companion, natural approximately 7-head anime proportions, healthy everyday figure. Dark chestnut brown shoulder-length layered hair, a small restrained half-up ponytail tied with a plain sage band, side-swept fringe with two soft face-framing strands, warm amber-brown eyes and a gentle confident smile. Hair must be visually distinct from the male's short tousled silhouette while looking designed by the same artist. Modest casual contemporary outfit: ivory lightweight zip jacket with exactly the same muted sage-green raglan shoulder and arm panels, sage/ivory striped ribbed cuffs and hem as the reference male; pale blue crew-neck shirt, dark navy straight-leg trousers, ivory sneakers with small sage accents. No skirt, tie, jewelry, weapons, magic, school badge, logo, mascot, props, backpack or added accessories. Jacket is comfortably loose, not tight, no exposed midriff or cleavage.
Style: refined hand-drawn 2D anime, clean variable-width charcoal linework, controlled 2-to-3-tone cel shadows, subtle reflected light, dimensional soft face planes, shaped hair highlights and believable fabric folds, precisely matching the illustration finish and color family of the male reference. Warm approachable personality, not chibi, not western cartoon, not flat corporate vector, not photorealistic, not a 3D render. Strong consistency of face, hairstyle, jacket seams and panels in all three views. Clean white background, no environment, no ground shadow, no watermark. Landscape canvas.
```

### 2. 女生侧身半身图

参考图 1：`mentor-female-turnaround-v1.png`，唯一人物身份参考。
参考图 2：男生 `mentor-halfbody-v1.png`，只作构图、姿态和画风参考。

```text
Use case: identity-preserve. Asset type: ONE isolated half-body anime FEMALE learning-companion portrait for the RIGHT SIDE of a Chinese classroom website.
Input 1 (female three-view sheet) is the sole identity anchor: preserve this EXACT SAME original young-adult woman, her face, warm amber-brown eyes, shoulder-length dark chestnut layered hair with small half-up ponytail and sage hair tie, side fringe and face-framing strands, ivory zip jacket with sage-green raglan shoulder/arm panels and striped cuffs/hem, pale blue crew-neck shirt, navy trousers.
Input 2 (male portrait) is ONLY a reference for framing, compact welcoming pose, render finish, outfit family and canvas proportions. Do NOT draw a man or both characters. Draw only the woman from input 1, with precisely the polished 2D anime style of both inputs: clean variable-weight charcoal lines, carefully shaped hair highlights, controlled 2-to-3-tone cel shadows, subtle reflected light on fabric and a dimensional gentle face, not flat vector.
Pose: torso turned approximately 55 degrees toward IMAGE LEFT, head returned slightly toward viewer so both eyes and her warm confident smile are visible. Natural relaxed shoulders. One hand in the trouser pocket; the other forearm makes a compact relaxed open-palm welcoming gesture toward image-left, all five fingers anatomically natural and within frame. Pose and hand silhouette comparable to the male portrait. Same adult human proportions, comfortably loose modest jacket, no sexualization, no new accessories. Keep the complete head, all hair, elbows and open hand inside frame. Crop below the jacket hem at upper hip/upper thigh level; no full legs. Fill a 1024 by 1536 portrait canvas similarly to the male, with about 5 percent transparent breathing room on the top and sides. Do not generate a model sheet or another pose.
CRITICAL OUTPUT: genuine transparent ALPHA background, a cutout PNG containing ONLY the female character. No opaque background, no white/black/gray fill, no painted checkerboard, no halo, no glow, no shadows outside her silhouette, no floor, no scenery, no typography, no view labels, no frame, no logos, no watermark. Keep crisp character edges and opaque clothing; do not paint an alpha fade into the art because the webpage applies its own bottom mask. Original refined campus-anime illustration, not a 3D render, not chibi, not a western cartoon, not Material Design illustration.
```
