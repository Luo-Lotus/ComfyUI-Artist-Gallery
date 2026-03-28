# ArtistSelector 高级配置功能 - 测试指南

## 功能说明

现在配置逻辑在后端处理，前端只负责：
1. 保存配置到 localStorage
2. 将配置保存到 metadata 中
3. 后端读取 metadata 中的配置并处理输出

## 架构变更

### 之前（错误架构）
- 前端处理所有逻辑（格式化、随机、循环）
- 后端只返回原始画师名称

### 现在（正确架构）
- 前端只保存配置到 metadata
- 后端读取 metadata 中的配置
- 后端根据配置处理画师名称并返回

## 测试步骤

### 1. 重启 ComfyUI
```bash
# 完全关闭 ComfyUI
# 重新启动
```

### 2. 创建测试工作流
1. 添加 ArtistSelector 节点
2. 添加 Print 节点（查看输出）
3. 连接 ArtistSelector 的输出到 Print

### 3. 测试格式化功能

#### 测试简单格式
1. 在 ArtistSelector 中选择几个画师
2. 点击 "⚙️ 全局配置"
3. 设置格式为：`({content}:1.2)`
4. 保存配置
5. 运行工作流
6. **预期输出**：`(artist1:1.2),(artist2:1.2),(artist3:1.2)`

#### 测试随机数格式
1. 设置格式为：`({content}:{random(1,1.5,0.1)})`
2. 保存配置
3. 多次运行工作流
4. **预期输出**：每次运行的随机数值不同，如：
   - 第1次：`(artist1:1.2),(artist2:1.4)`
   - 第2次：`(artist1:1.3),(artist2:1.1)`

#### 测试复杂格式
1. 设置格式为：`{content}_{random(1,100,1)}`
2. 保存配置
3. 运行工作流
4. **预期输出**：`artist1_57,artist2_23,artist3_89`

### 4. 测试多画师随机功能

1. 选择 10 个画师
2. 点击 "⚙️ 全局配置"
3. 启用 "随机选择"
4. 设置数量为 3
5. 保存配置
6. 多次运行工作流
7. **预期输出**：每次只输出 3 个画师，且每次的组合不同

### 5. 测试循环模式

1. 选择 5 个画师
2. 点击 "⚙️ 全局配置"
3. 启用 "循环模式"
4. 保存配置
5. 连续运行工作流 5 次
6. **预期输出**：
   - 第1次：`artist1`
   - 第2次：`artist2`
   - 第3次：`artist3`
   - 第4次：`artist4`
   - 第5次：`artist5`
   - 第6次：`artist1`（循环回来）

### 6. 测试分类配置覆盖

1. 选择多个画师和至少 1 个分类
2. 点击分类标签旁的 "⚙️" 按钮
3. 勾选 "使用独立配置"
4. 设置不同的格式，如：`[{content}]`
5. 保存配置
6. 运行工作流
7. **预期输出**：
   - 该分类的画师：`[artist1],[artist2]`
   - 其他画师：`artist3,artist4`

### 7. 测试边界情况

#### 无画师选择
1. 不选择任何画师
2. 运行工作流
3. **预期输出**：空字符串

#### 空格式
1. 设置格式为空字符串
2. 保存配置
3. **预期输出**：应该使用默认格式 `{content}`

#### 随机数错误范围
1. 设置格式为：`{random(5,1,0.1)}`（min > max）
2. 保存配置
3. **预期输出**：应该被前端验证拦截

#### 配置持久化
1. 配置并保存
2. 刷新浏览器页面
3. 检查配置是否保留
4. **预期结果**：配置应该保留

## 调试方法

### 查看后端日志
```bash
# 在 ComfyUI 控制台中查看
[ArtistSelector] 相关日志
```

### 查看 metadata 内容
在 Print 节点中查看第二个输出（metadata_json）：
```json
{
  "globalConfig": {
    "format": "({content}:{random(1,1.5,0.1)})",
    "randomMode": false,
    "randomCount": 3,
    "cycleMode": false
  },
  "categoryConfigs": {
    "category_id_1": {
      "enabled": true,
      "format": "[{content}]",
      "randomMode": false,
      "randomCount": 3
    }
  },
  "artist_names": ["artist1", "artist2"],
  ...
}
```

### 前端调试
打开浏览器 DevTools（F12）：
```javascript
// 查看保存的配置
localStorage.getItem('artist_selector_global_config')
localStorage.getItem('artist_selector_category_configs')

// 查看节点值
app.graph._nodes_by_id[node_id].widgets[0].value
```

## 常见问题

### Q: 配置保存了但没有生效？
**A**: 检查以下几点：
1. 是否重启了 ComfyUI？（后端代码修改需要重启）
2. 是否刷新了浏览器？（前端代码修改需要刷新）
3. 查看后端日志是否有错误
4. 检查 metadata 中是否包含配置信息

### Q: 循环模式在重启 ComfyUI 后重置了？
**A**: 这是正常的，循环状态存储在内存中，不是持久化的。如需持久化，需要修改代码使用文件存储。

### Q: 随机数每次都一样？
**A**: 检查格式字符串是否正确，确保使用 `{random(min,max,step)}` 而不是固定值。

### Q: 分类配置不生效？
**A**: 检查：
1. 是否勾选了 "使用独立配置"
2. metadata 中的 selected_artists 是否包含正确的 categoryId
3. categoryConfigs 中的 key 是否与 categoryId 匹配

## 性能测试

### 大量画师测试
1. 选择 100+ 个画师
2. 应用复杂格式（包含随机数）
3. 运行工作流
4. **预期**：处理时间应该 < 1秒

### 循环模式性能测试
1. 选择 1000 个画师
2. 启用循环模式
3. 连续运行 100 次
4. **预期**：每次运行时间应该稳定，无内存泄漏

## 代码结构

### 后端（nodes.py）
- `select_artists()` - 主处理函数
- `_apply_format()` - 应用格式字符串
- `_get_artist_info()` - 获取画师信息
- `_cycle_states` - 全局循环状态存储

### 前端
- `useArtistSelector.js` - 管理选择状态和配置
- `GlobalConfigDialog.js` - 全局配置对话框
- `CategoryConfigDialog.js` - 分类配置对话框
- `useFormatProcessor.js` - 前端格式预览（仅用于UI）

## 已知限制

1. **循环状态不持久化**：服务器重启后循环位置会重置
2. **随机数范围验证**：目前只在前端验证，后端没有验证
3. **并发执行**：如果同时执行多个工作流，循环状态可能混乱

## 未来改进

1. 添加后端格式验证
2. 将循环状态保存到文件
3. 支持配置导入导出
4. 添加更多内置格式模板
5. 支持权重随机（某些画师出现概率更高）
