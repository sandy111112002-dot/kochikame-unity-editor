# 圖像素材目錄

所有編輯器使用的圖檔統一放在這個目錄，不再將 Base64 圖片直接塞入 `editor.html`。

## 資料夾分類

```text
assets/
├─ characters/                 角色模型與動作
│  ├─ ryotsu/                  阿兩
│  ├─ reiko/                   麗子
│  ├─ nakagawa/                中川
│  └─ doctor/                  博士
│     ├─ idle/idle.png         待機或角色縮圖
│     └─ animations/
│        └─ 動作名稱/
│           ├─ sheet.png       水平合併序列圖
│           └─ frames/         獨立影格
│              ├─ frame-01.png
│              └─ ...
├─ effects/                    特效素材
│  ├─ blue-energy/             藍色能量系列
│  ├─ elemental/               火、冰、雷
│  ├─ footwear/geta/           木屐系列
│  ├─ spinning-top/            陀螺系列
│  └─ hit/                     命中特效
└─ ui/icons/                   網站與介面圖示
```

## 命名規則

- 動作合併圖固定命名為 `sheet.png`。
- 動作獨立格固定命名為 `frame-01.png`、`frame-02.png`，依播放順序排列。
- 待機圖固定放在角色的 `idle/idle.png`。
- 特效保留既有素材 ID 作為檔名，例如 `fx_geta_01.png`，避免破壞專案與 JSON 相容性。
- 新增角色動作時，建立 `characters/角色ID/animations/動作ID/`。
- 新增特效時，依視覺系列放入 `effects/` 對應分類，並同步更新 `public/editor.html` 的素材路徑。
