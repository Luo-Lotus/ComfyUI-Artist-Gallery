# 画师重命名功能 - 使用说明

## ✅ 功能说明

现在可以通过编辑画师来修改画师名称，系统会自动更新所有相关的图片映射。

## 🎯 使用方法

### 方法1：通过画师卡片编辑
1. 打开画廊（点击右下角 🎨 按钮）
2. 找到要重命名的画师卡片
3. 右键点击画师卡片
4. 选择"✏️ 编辑"
5. 在编辑对话框中修改"画师名称"字段
6. 点击"保存"

### 方法2：通过画师详情页
1. 点击画师卡片进入详情页
2. 点击编辑按钮
3. 修改画师名称
4. 点击"保存"

## 🔄 自动更新内容

当重命名画师时，系统会自动：

1. ✅ 更新当前画师的 name 字段
2. ✅ **全局重命名**：更新所有分类下同名的画师
3. ✅ 更新所有使用该画师的图片映射
4. ✅ 保持画师的其他属性不变（displayName, imageCount等）

### 🌍 全局重命名说明

如果画师 "artist1" 同时存在于多个分类中：
- 📁 分类A：artist1
- 📁 分类B：artist1
- 📁 分类C：artist1

当你在任意分类中重命名 "artist1" 为 "artist_new" 时，所有分类下的 "artist1" 都会被重命名为 "artist_new"。这确保了画师身份的全局一致性。

## 📊 示例

### 重命名前
```
📁 分类A: akakura
📁 分类B: akakura
📁 分类C: akakura

相关图片: 10 张
映射关系: image1.png -> [akakura], image2.png -> [akakura], ...
```

### 重命名后（akakura -> 赤坂）
```
📁 分类A: 赤坂 ✅
📁 分类B: 赤坂 ✅
📁 分类C: 赤坂 ✅

相关图片: 10 张（保持不变）
映射关系: image1.png -> [赤坂], image2.png -> [赤坂], ...
```

**说明**：虽然在分类A中编辑，但所有分类下的 "akakura" 都被重命名为 "赤坂"

## ⚠️ 注意事项

1. **同名检查**：新名称不能与任意分类下的其他画师重复
2. **全局重命名**：重命名会影响所有分类下同名的画师
3. **映射更新**：默认会自动更新所有相关映射
4. **刷新数据**：重命名后需要刷新数据以查看更新

## 🔧 技术实现

### 后端 API
- **端点**: `POST /artist_gallery/artists/{category_id}/{name}/rename`
- **参数**:
  ```json
  {
    "newName": "new_name",
    "updateMappings": true
  }
  ```
- **返回**:
  ```json
  {
    "success": true,
    "artist": {...},
    "updatedMappings": 10,
    "affectedMappings": [...]
  }
  ```

### 存储层
- **ArtistStorage.rename_artist()**: 重命名画师
- **ImageMappingStorage.rename_artist_in_mappings()**: 更新映射表
- **ArtistStorage.get_artist()**: 获取更新后的画师信息

### 前端逻辑
- **AddArtistDialog**: 检测 name 字段变化，调用重命名 API
- **自动提示**: 显示更新了多少个映射

## 🧪 测试步骤

1. **准备测试数据**
   - 创建一个画师，名称为 `test_artist`
   - 上传几张图片并关联到该画师

2. **执行重命名**
   - 打开编辑对话框
   - 修改名称为 `test_artist_v2`
   - 点击保存

3. **验证结果**
   - 检查画师名称是否更新
   - 检查 image_artists.json 中的映射是否更新
   - 刷新画廊，查看图片是否仍然关联到画师

4. **边界测试**
   - 尝试重命名为已存在的名称（应该被拒绝）
   - 重命名没有图片的画师
   - 重命名有大量图片（100+）的画师

## 🐛 常见问题

### Q: 重命名后图片显示不正确？
**A**: 刷新浏览器缓存，重新加载画廊数据

### Q: 提示"画师名称已存在"？
**A**: 该名称在同分类下已被使用，请选择其他名称

### Q: 映射没有更新？
**A**:
1. 检查后端日志是否有错误
2. 确认 `updateMappings` 参数为 `true`
3. 检查 image_artists.json 文件

### Q: 如何撤销重命名？
**A**:
1. 再次编辑画师
2. 改回原来的名称
3. 保存（会再次更新映射）

## 📝 数据结构

### artists.json
```json
{
  "artists": [
    {
      "name": "new_name",
      "displayName": "Display Name",
      "categoryId": "category_id",
      ...
    }
  ]
}
```

### image_artists.json
```json
{
  "mappings": [
    {
      "imagePath": "artist_gallery/image1.png",
      "artistNames": ["new_name"],  // 自动更新
      "savedAt": 1234567890,
      "metadata": {}
    }
  ]
}
```

## 🎉 优势

相比之前的实现：
- ✅ 集成到现有的编辑功能中
- ✅ 无需额外的UI组件
- ✅ 自动更新映射，无需手动操作
- ✅ 保持数据一致性
- ✅ 支持批量操作前的预览

## 📚 相关文件

**后端**:
- `storage.py`: ArtistStorage.rename_artist(), ImageMappingStorage.rename_artist_in_mappings()
- `api_routes.py`: 重命名 API 端点

**前端**:
- `AddArtistDialog.js`: 编辑保存逻辑
- `artistApi.js`: renameArtist API 调用

**文档**:
- `RENAME_ARTIST_GUIDE.md`: 本文档
