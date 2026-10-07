# 女生导师 v2：独立服装设计

制作日期：2026-09-22。用户否定了 v1 照搬男生运动外套和长裤的服装。本次只重做女生穿搭，不把“同画风”当成“同一套服装”，人物脸型、发型、二次元渲染、页面位置、男女切换和下缘渐变保持原有设定。

## 本次修改

- 新服装：奶油白细针织开衫、浅蓝圆领衬衫、高腰灰蓝 A 字裙、白袜与棕色乐福鞋；网页半身图只展示到裙身上部。
- 删除服装中的绿色插肩拼块、拉链、运动条纹及长裤，不再沿用男生的运动外套轮廓。
- 先以女生 v1 三视图为编辑目标换装，再以新三视图为服装依据编辑原女生半身图。使用 Codex 内置 imagegen，未使用 CLI、TokenDance 或课堂视频生成。
- 这是对用户不满意服装的一版修订，不代表已经获得用户视觉验收。

## 保存路径

- `docs/youth/characters/mentor-female-turnaround-v2.png`：全身正/左侧/背三视图，不随网页加载。
- `public/youth/characters/mentor-female-halfbody-v2.png`：真实 RGBA 的页面透明半身图；保留生成原件，不裁切或覆盖旧图。
- 当前女生资源映射改为 v2，独立文件名避免浏览器继续使用被否定的 v1 缓存。v1 作为历史文件保留，不再由形象切换引用。
- 男生原图、课堂 3D 场景、CSS 渐变、切换逻辑、脚本模型及配音不改。

## 本地验证

- 半身 PNG：1024×1536，1,640,992 字节，RGBA；SHA-256：`101be81916edbe456cc2046a8a900918780dd9e72e60f155446c249cad405fa4`。
- 三视图 PNG：1536×1024，1,680,521 字节；SHA-256：`491fc6900e00a3e4767172e3202f400e7d54f5635b5eedf93ea492ee725d5064`。
- 实际 Next Image 输出：256×384 WebP 为 18,646 字节，640×960 WebP 为 64,344 字节，两者保留 alpha。
- TypeScript、ESLint、102 项单元测试、生产构建及 29 项免付费接口检查通过。
- 后台 Chromium 桌面/手机实测加载 v2，不再引用 v1；男女切换、草稿保留、下缘遮罩和本地模拟课程返回后保留女生均通过；浏览器错误为 0。
- 已查看新版桌面和手机实际截图，衣领、针织开衫、裙腰与三视图一致，下缘渐变保留。截图为 `output/youth-qa/desktop-female.png`、`mobile-female.png`，报告为 `browser-check.json`，该输出目录不提交 Git。
- 场景仍为 27 次绘制、40,072 个三角面，静止新增渲染帧为 0，切换 API 写请求数为 0。测试没有生成真实课堂脚本或视频。
- 男生原图 SHA-256 仍为 `cc62a056358750e59dccd7688229387b2963571860c33292d36cf1d3328d7723`。当前只更新本地预览，未发布线上。

## 最终生成提示词（内置 imagegen）

### 1. 三视图换装

编辑目标：`mentor-female-turnaround-v1.png`。

```text
Use case: identity-preserve.
Asset type: revised original anime female learning companion turnaround, wardrobe revision v2.
Input image 1: EDIT TARGET, the existing female three-view sheet. Preserve this same young-adult woman in her early twenties: face, amber-brown eyes, chestnut layered shoulder-length hair with small half-up ponytail and sage tie, height, body proportions, warm personality and refined anime illustration finish.
Primary change: completely replace the old sporty zip jacket and navy trousers with an independently designed, graceful modern casual outfit. The previous clothing merely copied the male companion and is rejected. Do not retain green raglan shoulder panels, track-jacket trim, zipper, striped sports cuffs, oversized bomber silhouette or trousers.
New outfit across all three views: a cream-white fine-knit cardigan ending at the natural waist (no exposed midriff), softly shaped shoulders and sleeves, delicate ribbed hems, small ivory buttons, worn open; beneath it a powder-blue opaque blouse with a small neat rounded collar, tucked into a high-waisted slate-blue A-line skirt, softly structured broad pleats, hem just below the knee; white ankle socks and simple low-heeled warm-brown loafers. The cardigan is a real knit with restrained stitch cues, not a sporty coat. Contemporary friendly young-woman styling, youthful and sunny, tasteful and practical for a classroom companion, not formal office wear and not costume. Realistic tasteful fabric proportions, not bodycon. Hands relaxed naturally at sides, do not push hands into imaginary trouser pockets. No bags or held props.
Preserve THREE aligned full-body orthographic views: front, true left-side profile facing image-left, back. Same identity and garment construction in all views. Wide landscape white sheet 1536x1024, all hair and shoes fully inside frame. Only small view labels below the figures: 正面 / 侧面 / 背面.
Style unchanged: refined hand-drawn 2D campus anime, clean variable-width charcoal lines, dimensional hair highlights and carefully modeled cloth folds, 2-3-tone cel shadows with subtle reflected light. Not photorealism, not 3D, not chibi, not flat corporate vector. No logos, mascot, text other than view labels, accessories, watermark or environment.
```

### 2. 半身图换装

编辑目标：`mentor-female-halfbody-v1.png`。
服装依据：`mentor-female-turnaround-v2.png`。

```text
undefined
```
