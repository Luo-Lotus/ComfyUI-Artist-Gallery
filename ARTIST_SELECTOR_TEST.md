# ArtistSelector 节点测试指南

## 🐛 修复的 Bug

### Bug 1: 选择画师后没有输出
**原因**:
- 代码中使用了 `artist.id`（新架构不存在）
- 只加载了当前分类的画师，没有加载所有画师

**修复**:
- ✅ 移除了 `artist_ids` 字段
- ✅ 添加了 `allArtists` 状态
- ✅ 修复了 `updateNodeValue` 函数
- ✅ 修复了 `getArtistNamesFromCategories` 函数

### Bug 2: 分类选择功能不明显
**修复**:
- ✅ 添加了操作提示："💡 点击分类卡片选择分类，点击 > 进入分类"
- ✅ 添加了 title 提示
- ✅ 已选择的分类显示在"已选择"区域
- ✅ 优化了交互逻辑：点击卡片选择，点击 > 进入分类

---

## 🧪 测试步骤

### 测试 1: 选择单个画师

1. 在 ComfyUI 中添加工作流
2. 添加 **ArtistSelector** 节点
3. 点击画师项进行选择
4. 查看节点输出

**预期输出**:
```
字符串输出: @sy4,22

元数据输出:
{
  "artist_names": ["@sy4", "22"],
  "display_names": ["@sy4", "22"],
  "selected_categories": [],
  "selected_artists": [
    {"categoryId": "root", "name": "@sy4"},
    {"categoryId": "root", "name": "22"}
  ]
}
```

### 测试 2: 选择分类（递归）

**前提条件**:
- 有分类结构：`全部` → `风景` → `写实`
- `写实` 分类下有画师 `artist1`
- `风景` 分类下有画师 `artist2`

**操作**:
1. **点击** `风景` 分类卡片（选择分类）
2. 查看"已选择"区域

**预期结果**:
- ✅ "已选择"显示：`已选择 (0 + 1)` （0 个画师，1 个分类）
- ✅ 显示 📁 标签：`📁 风景 ×`
- ✅ 节点输出包含 `风景` 及其所有子分类下的画师

**预期输出**:
```
字符串输出: artist1,artist2

元数据:
{
  "artist_names": ["artist1", "artist2"],
  "selected_categories": ["风景的分类ID"],
  "selected_artists": []
}
```

### 测试 3: 混合选择

**操作**:
1. 选择一些画师（点击画师项）
2. **点击** 一些分类卡片（选择分类）
3. 查看"已选择"区域，应该显示：`已选择 (画师数 + 分类数)`

**预期结果**:
- ✅ "已选择"显示：`已选择 (2 + 1)` （2 个画师，1 个分类）
- ✅ 既有画师标签，也有分类标签
- ✅ 节点输出包含所有选中的画师名称

---

## 🔍 调试方法

### 在浏览器控制台检查状态

1. 打开 ComfyUI 界面
2. 按 F12 打开开发者工具
3. 在 Console 中执行：

```javascript
// 检查 localStorage 中的选择数据
JSON.parse(localStorage.getItem('artist_selector_selection'))

// 预期输出格式：
// {
//   "keys": ["root:artist1", "root:artist2"],
//   "categories": ["cat_id", "cat_id2"]
// }
```

### 检查节点输出

1. 在 ComfyUI 中连接 ArtistSelector 节点到其他节点（如文本输出）
2. 执行工作流
3. 查看输出值

**预期**:
- 字符串输出：画师名称用逗号分隔
- 元数据输出：JSON 格式，包含 `artist_names` 等字段

---

## ⚠️ 常见问题

### 问题：点击分类卡片没有反应

**可能原因**:
- 浏览器缓存了旧代码
- ComfyUI 没有重新加载前端文件

**解决方案**:
- 强制刷新浏览器：Ctrl+Shift+R (Windows) 或 Cmd+Shift+R (Mac)
- 重启 ComfyUI

### 问题：分类选择后输出为空

**检查**:
1. 控制台是否有错误
2. `allArtists` 是否正确加载
3. 分类 ID 是否正确

**调试命令**:
```javascript
// 在控制台检查
fetch('/artist_gallery/artists')
  .then(r => r.json())
  .then(data => console.log(data.artists.length))
```

---

## ✅ 验证清单

- [ ] 选择单个画师正常输出
- [ ] 点击分类卡片可以选择分类
- [ ] 点击 > 按钮进入分类
- [ ] 已选择的分类显示在"已选择"区域（带 📁 图标）
- [ ] 点击 × 可以取消选择
- [ ] 节点输出包含所有画师名称（包括分类中的画师）
- [ ] 元数据格式正确
- [ ] 操作提示显示正常

---

## 📝 输出格式说明

### 字符串输出
```
artist1,artist2,artist3
```
- 所有画师名称用逗号分隔
- 包括直接选择的画师和从分类中获取的画师
- 自动去重

### 元数据输出
```json
{
  "artist_names": ["artist1", "artist2", "artist3"],
  "display_names": ["艺术家1", "艺术家2", "艺术家3"],
  "selected_categories": ["cat_id_1", "cat_id_2"],
  "selected_artists": [
    {"categoryId": "root", "name": "artist1"}
  ]
}
```

**字段说明**:
- `artist_names`: 所有画师名称（用于后续处理）
- `display_names`: 显示名称（可选）
- `selected_categories`: 选中的分类 ID 列表
- `selected_artists`: 直接选择的画师（不含分类中的画师）

---

## 🎯 使用建议

### 工作流中使用

1. **选择特定画师**: 直接点击画师项
2. **选择整个风格分类**: 点击分类卡片
3. **进入分类**: 点击分类卡片右侧的 > 按钮
4. **组合使用**: 选择一些画师 + 选择一些分类

### 最佳实践

- **明确命名**: 分类名称要清晰，便于理解
- **合理分层**: 不要嵌套太深
- **测试输出**: 执行工作流后检查输出是否符合预期

---

## 🚨 如果仍有问题

1. **重启 ComfyUI**（必需！）
2. **清除缓存**: Ctrl+Shift+Delete
3. **检查控制台**: F12 → Console
4. **查看日志**: ComfyUI 终端输出

---

修复完成！🎉 现在应该可以正常使用了。
