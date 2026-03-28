# ArtistSelector 高级配置功能 - 最终实现总结

## ✅ 已完成的功能

### 1. 格式化系统
- **前端**：配置对话框和实时预览
- **后端**：应用格式到画师名称
- 支持 `{content}` 变量替换
- 支持 `{random(min,max,step)}` 随机数生成

### 2. 多画师随机规则
- 从已选画师中随机选择 N 个
- 后端处理随机选择逻辑

### 3. 循环模式
- 循环使用已选画师，每次输出一个
- 后端内存存储循环状态
- 支持重置循环位置

### 4. 分类配置覆盖
- 每个分类可独立配置
- 配置指示器显示独立配置
- 后端根据分类应用不同配置

## 📁 文件修改清单

### 后端修改（1个文件）
**nodes.py**
- 添加 `import re` 和 `import random`
- 修改 `select_artists()` 方法，添加配置处理逻辑
- 添加 `_apply_format()` 方法处理格式字符串
- 添加 `_get_artist_info()` 方法获取画师信息
- 添加全局循环状态存储 `_cycle_states`

### 前端修改（4个文件）
**useArtistSelector.js**
- 在 `updateNodeValue()` 中加载配置并保存到 metadata
- 导出 `updateNodeValue` 函数供 Widget 使用

**ArtistSelectorWidget.js**
- 添加配置状态管理
- 添加全局配置按钮
- 添加分类配置按钮和指示器
- 在配置保存后调用 `updateNodeValue()`

**GlobalConfigDialog.js**
- 全局配置对话框（已创建）

**CategoryConfigDialog.js**
- 分类配置对话框（已创建）

### 新增文件（2个）
- `web/nodes/components/hooks/useFormatProcessor.js` - 前端格式预览
- `web/services/artistApi.js` - 循环状态API（未使用，保留备用）

### 样式修改（1个文件）
**gallery.css**
- 添加配置相关样式

## 🔄 数据流

### 配置保存流程
```
用户操作 → 配置对话框 → localStorage
         ↓
    updateNodeValue()
         ↓
    metadata = {
      globalConfig: {...},
      categoryConfigs: {...},
      ...
    }
         ↓
    节点值更新 → 触发工作流执行
```

### 输出生成流程
```
工作流执行 → select_artists(selected_artists, metadata)
         ↓
    解析 metadata 中的配置
         ↓
    应用配置逻辑：
      1. 循环模式 → 返回单个画师
      2. 随机模式 → 随机选择N个画师
      3. 格式化 → 应用格式字符串
         ↓
    返回处理后的 artists_string
```

## 🎯 使用示例

### 示例1：简单格式化
**配置**：`({content}:1.2)`
**输入**：`artist1,artist2,artist3`
**输出**：`(artist1:1.2),(artist2:1.2),(artist3:1.2)`

### 示例2：随机权重
**配置**：`({content}:{random(1,1.5,0.1)})`
**输入**：`artist1,artist2`
**输出**：`(artist1:1.3),(artist2:1.1)`

### 示例3：多画师随机
**配置**：
- 格式：`{content}`
- 随机模式：启用
- 随机数量：3

**输入**：`artist1,artist2,artist3,artist4,artist5,artist6,artist7,artist8,artist9,artist10`
**输出**：`artist2,artist5,artist9`（随机3个）

### 示例4：循环模式
**配置**：
- 格式：`{content}`
- 循环模式：启用

**输入**：`artist1,artist2,artist3`
**第1次执行输出**：`artist1`
**第2次执行输出**：`artist2`
**第3次执行输出**：`artist3`
**第4次执行输出**：`artist1`（循环）

### 示例5：分类配置覆盖
**全局配置**：`{content}`
**分类A配置**：`[{content}]`（启用独立配置）
**分类B配置**：使用全局配置

**输入**：
- 分类A的画师：artist1, artist2
- 分类B的画师：artist3
- 独立画师：artist4

**输出**：`[artist1],[artist2],artist3,artist4`

## 🚀 如何测试

1. **重启 ComfyUI**（必须！后端代码修改）
2. **刷新浏览器**（前端代码修改）
3. **创建测试工作流**：
   - 添加 ArtistSelector 节点
   - 添加 Print 节点查看输出
4. **按照 TESTING_GUIDE.md 中的步骤测试**

## 🐛 调试技巧

### 查看后端处理日志
在 ComfyUI 控制台中查看输出，或添加调试日志：
```python
print(f"[ArtistSelector] Input: {selected_artists}")
print(f"[ArtistSelector] Config: {global_config}")
print(f"[ArtistSelector] Output: {result}")
```

### 查看前端配置
```javascript
// 浏览器控制台
localStorage.getItem('artist_selector_global_config')
localStorage.getItem('artist_selector_category_configs')
```

### 检查 metadata
在 Print 节点的第二个输出中查看完整的 metadata JSON

## ⚠️ 重要注意事项

1. **必须重启 ComfyUI**：后端代码修改后必须重启
2. **必须刷新浏览器**：前端代码修改后必须硬刷新（Ctrl+Shift+R）
3. **循环状态不持久化**：服务器重启后循环位置会重置
4. **配置保存在 localStorage**：清除浏览器数据会丢失配置

## 📊 性能考虑

- **格式化**：O(n) 其中 n 是画师数量
- **随机选择**：O(n) 使用 random.sample()
- **循环模式**：O(1) 使用取模运算
- **推荐最大画师数**：1000个以内

## 🔧 故障排除

### 问题1：配置保存但没有生效
**解决**：
1. 确认重启了 ComfyUI
2. 确认刷新了浏览器
3. 检查 metadata 中是否包含配置
4. 查看后端日志是否有错误

### 问题2：格式化不工作
**解决**：
1. 检查格式字符串语法
2. 确认使用的是 `{content}` 而不是其他变量名
3. 查看后端日志中的错误信息

### 问题3：循环模式输出错误
**解决**：
1. 确认只选择了一个分类或多个画师
2. 检查循环状态是否正确存储
3. 查看后端日志中的循环索引

### 问题4：分类配置不生效
**解决**：
1. 确认勾选了"使用独立配置"
2. 检查 metadata 中的 selected_artists 是否包含 categoryId
3. 确认 categoryConfigs 中的 key 与 categoryId 匹配

## 📝 代码示例

### 添加新的内置格式
在 `GlobalConfigDialog.js` 中添加预设按钮：
```javascript
const presets = [
    { name: '默认', format: '{content}' },
    { name: 'SD权重', format: '({content}:{random(0.5,1.5,0.1)})' },
    { name: '编号', format: '{content}_{random(1,1000,1)}' },
];
```

### 添加后端日志
在 `nodes.py` 的 `select_artists()` 方法中添加：
```python
print(f"[DEBUG] Input artists: {artists}")
print(f"[DEBUG] Global config: {global_config}")
print(f"[DEBUG] Category configs: {category_configs}")
print(f"[DEBUG] Output: {result}")
```

## 🎉 完成状态

- ✅ 后端逻辑实现
- ✅ 前端UI实现
- ✅ 配置持久化
- ✅ 格式化功能
- ✅ 随机选择功能
- ✅ 循环模式功能
- ✅ 分类配置覆盖功能
- ✅ 样式美化
- ✅ 文档编写

**状态**：已完成，等待测试
**版本**：2.0.0（后端处理架构）
**日期**：2026-03-28
