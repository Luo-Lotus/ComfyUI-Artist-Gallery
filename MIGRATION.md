# 数据迁移指南

## ⚠️ 重要提示

**迁移前请务必备份整个 ComfyUI 目录！**

```bash
# 备份整个 ComfyUI
cp -r e:/sd/ComfyUI_windows_portable e:/sd/ComfyUI_windows_portable_backup
```

---

## 🔄 迁移步骤

### 方法 1: 通过 API 迁移（推荐）

1. **启动 ComfyUI**

2. **打开浏览器开发者工具**
   - 按 `F12` 或右键 → "检查"

3. **在控制台执行迁移命令**
   ```javascript
   fetch('/artist_gallery/migrate', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' }
   }).then(r => r.json()).then(data => {
       if (data.success) {
           console.log('✅ 迁移成功！');
           console.log('备份目录:', data.backup_dir);
           console.log('验证结果:', data.validation);
       } else {
           console.error('❌ 迁移失败:', data.error);
       }
   });
   ```

4. **查看结果**
   - 控制台会显示迁移结果
   - 备份目录会自动创建在插件目录下

### 方法 2: 手动迁移（高级用户）

如果你熟悉 JSON 格式，可以手动编辑文件：

#### 1. 修改 `artists.json`

**删除所有 `id` 字段**:
```json
// 之前
{
  "artists": [
    {
      "id": "abc123",
      "name": "@sy4",
      "categoryId": "root",
      ...
    }
  ]
}

// 之后
{
  "artists": [
    {
      "name": "@sy4",
      "categoryId": "root",
      ...
    }
  ]
}
```

#### 2. 修改 `image_artists.json`

**将 `artistIds` 改为 `artistNames`**:
```json
// 之前
{
  "mappings": [
    {
      "imagePath": "artist_gallery/AG_xxx.png",
      "artistIds": ["abc123", "def456"],
      ...
    }
  ]
}

// 之后
{
  "mappings": [
    {
      "imagePath": "artist_gallery/AG_xxx.png",
      "artistNames": ["@sy4", "22"],
      ...
    }
  ]
}
```

**注意**: 你需要根据 UUID 找到对应的画师名称。

---

## 📋 迁移前后对比

| 特性 | 之前 (UUID) | 之后 (组合键) |
|------|------------|--------------|
| 唯一标识 | `artistId` (UUID) | `(categoryId, name)` |
| 重名限制 | 全局不能重名 | 同分类下不能重名 |
| 图片映射 | `artistIds: [UUID, ...]` | `artistNames: ["name", ...]` |
| 数据共享 | 每个画师独立 | 同名画师自动共享图片 |

---

## ✅ 验证迁移成功

迁移完成后，验证以下几点：

1. **检查文件格式**
   ```bash
   # 不应该有 id 字段
   grep -c "\"id\"" artists.json
   # 应该返回 0

   # 应该有 artistNames 字段
   grep -c "\"artistNames\"" image_artists.json
   # 应该 > 0
   ```

2. **测试图库功能**
   - 打开图库 UI
   - 查看画师列表是否正常显示
   - 点击画师卡片查看图片

3. **测试重名限制**
   - 在"全部"分类下添加画师 `test`
   - 在"全部"分类下再次添加 `test`
   - 应该提示"画师名称已存在"

4. **测试跨分类重名**
   - 创建新分类"测试"
   - 在"测试"分类下添加画师 `test`
   - 应该添加成功
   - 两个 `test` 画师应该共享图片

---

## 🔙 回滚方案

如果迁移后出现问题：

### 从备份恢复

```bash
cd e:/sd/ComfyUI_windows_portable/ComfyUI/custom_nodes/artist_gallery

# 找到最新的备份目录
ls -la backup_*

# 恢复文件
cp backup_YYYYMMDD_HHMMSS/artists.json artists.json
cp backup_YYYYMMDD_HHMMSS/image_artists.json image_artists.json
```

### 重启 ComfyUI

```bash
# 关闭 ComfyUI
# 重新启动
python ComfyUI_windows_portable/run_nvidia_gpu.bat
```

---

## 📞 遇到问题？

1. **查看日志**: ComfyUI 终端输出
2. **浏览器控制台**: F12 → Console 标签
3. **检查备份**: 确保 `backup_*` 目录存在

---

## 🎯 迁移完成后

你将拥有：

- ✅ 更灵活的画师组织方式
- ✅ 同名画师自动共享图片
- ✅ "复制到"功能
- ✅ 选择器支持分类选择
- ✅ 优化的 UI 布局

享受新功能吧！🎉
