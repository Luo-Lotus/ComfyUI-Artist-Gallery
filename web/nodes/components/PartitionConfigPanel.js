/**
 * 分区配置面板组件
 * 用于配置分区的输出格式、随机模式等
 */
import { h } from '../../lib/preact.mjs';
import { useState, useMemo, useRef, useEffect, useCallback } from '../../lib/hooks.mjs';
import { Icon } from '../../lib/icons.mjs';

// 构建分类完整路径名
function buildCategoryPathName(categoryId, categories) {
  if (!categoryId || categoryId === 'root') return '根目录';
  const path = [];
  let current = categories.find((c) => c.id === categoryId);
  while (current) {
    path.unshift(current.name);
    current = current.parentId ? categories.find((c) => c.id === current.parentId) : null;
  }
  return path.join(' / ');
}

export function PartitionConfigPanel({ partition, globalConfig, categories = [], onChange, onClose }) {
  const [name, setName] = useState(partition.name);
  const [format, setFormat] = useState(partition.config.format);
  const [randomMode, setRandomMode] = useState(partition.config.randomMode);
  const [randomCount, setRandomCount] = useState(partition.config.randomCount);
  const [cycleMode, setCycleMode] = useState(partition.config.cycleMode);
  const [autoCreateCombination, setAutoCreateCombination] = useState(partition.config.autoCreateCombination === true);
  const [autoSaveCategoryId, setAutoSaveCategoryId] = useState(partition.config.autoSaveCombinationCategoryId || '');

  // 分类选择器状态
  const [catFilter, setCatFilter] = useState('');
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const catDropdownRef = useRef(null);

  // 预处理分类列表（带路径名）
  const categoryOptions = useMemo(() => {
    return categories
      .filter((c) => c.id !== 'root')
      .map((c) => ({
        id: c.id,
        pathName: buildCategoryPathName(c.id, categories),
      }))
      .sort((a, b) => a.pathName.localeCompare(b.pathName));
  }, [categories]);

  // 过滤分类
  const filteredCategories = useMemo(() => {
    if (!catFilter.trim()) return categoryOptions;
    const q = catFilter.toLowerCase();
    return categoryOptions.filter((c) => c.pathName.toLowerCase().includes(q));
  }, [categoryOptions, catFilter]);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!showCatDropdown) return;
    const handleClick = (e) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target)) {
        setShowCatDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCatDropdown]);

  // 预览格式效果
  const previewFormat = format.replace('{content}', 'prompt_name').replace(/\{random\([^)]+\)\}/g, '1.3');

  const handleSave = () => {
    onChange({
      name,
      config: {
        ...partition.config,
        format,
        randomMode,
        randomCount,
        cycleMode,
        autoCreateCombination,
        autoSaveCombinationCategoryId: autoCreateCombination ? autoSaveCategoryId : '',
      },
    });
    onClose();
  };

  // 渲染格式提示
  const renderFormatHint = () => {
    return h('div', { class: 'config-hint' }, [
      h('div', { class: 'config-hint-title' }, [h(Icon, { name: 'lightbulb', size: 14 }), ' 提示：']),
      h('ul', {}, [
        h('li', null, '{content} - Prompt名称'),
        h('li', null, '{random(min,max,step)} - 随机数'),
        h('li', null, '示例: ({content}:{random(1,1.5,0.1)}) → (prompt_name:1.3)'),
      ]),
    ]);
  };

  return h('div', { class: 'node-config-panel' }, [
    // 头部
    h('div', { class: 'node-config-header' }, [
      h('span', { class: 'node-config-header-title' }, [
        h(Icon, { name: 'settings', size: 14 }),
        ` ${partition.isDefault ? '默认分区' : partition.name} - 配置`,
      ]),
      h(
        'button',
        {
          class: 'node-config-close',
          onClick: onClose,
        },
        h(Icon, { name: 'x', size: 14 }),
      ),
    ]),

    // 内容
    h('div', { class: 'node-config-body' }, [
      // 分区名称（非默认分区可编辑）
      !partition.isDefault &&
        h('div', { class: 'node-config-section' }, [
          h('label', { class: 'node-config-label' }, '分区名称'),
          h('input', {
            type: 'text',
            class: 'node-config-input',
            value: name,
            onInput: (e) => setName(e.target.value),
          }),
        ]),

      // 单Prompt格式
      h('div', { class: 'node-config-section' }, [
        h('label', { class: 'node-config-label' }, '单Prompt格式'),
        h('input', {
          type: 'text',
          class: 'node-config-input',
          value: format,
          onInput: (e) => setFormat(e.target.value),
          placeholder: globalConfig?.format || '{content}',
        }),
        h('div', { class: 'config-preview' }, `预览: ${previewFormat}`),
        renderFormatHint(),
      ]),

      // 多Prompt随机规则
      h('div', { class: 'node-config-section' }, [
        h('label', { class: 'node-config-label' }, '多Prompt随机规则'),
        h('div', { class: 'config-radio-group' }, [
          h('label', { class: 'config-radio-item' }, [
            h('input', {
              type: 'radio',
              name: `random-mode-${partition.id}`,
              checked: !randomMode,
              onChange: () => setRandomMode(false),
            }),
            h('span', null, '禁用（使用所有已选Prompt）'),
          ]),
          h('label', { class: 'config-radio-item' }, [
            h('input', {
              type: 'radio',
              name: `random-mode-${partition.id}`,
              checked: randomMode,
              onChange: () => setRandomMode(true),
            }),
            h('span', null, '启用随机选择'),
          ]),
        ]),
        randomMode &&
          h('div', { class: 'config-number-input-group' }, [
            h('label', null, '随机选择数量：'),
            h('input', {
              type: 'number',
              class: 'config-number-input',
              min: 1,
              value: randomCount,
              onInput: (e) => setRandomCount(parseInt(e.target.value) || 1),
            }),
            h('span', null, '个Prompt'),
          ]),
      ]),

      // 循环模式
      h('div', { class: 'node-config-section' }, [
        h('label', { class: 'node-config-label' }, '循环模式'),
        h('div', { class: 'config-radio-group' }, [
          h('label', { class: 'config-radio-item' }, [
            h('input', {
              type: 'radio',
              name: `cycle-mode-${partition.id}`,
              checked: !cycleMode,
              onChange: () => setCycleMode(false),
            }),
            h('span', null, '禁用'),
          ]),
          h('label', { class: 'config-radio-item' }, [
            h('input', {
              type: 'radio',
              name: `cycle-mode-${partition.id}`,
              checked: cycleMode,
              onChange: () => setCycleMode(true),
            }),
            h('span', null, '启用循环（每次执行只输出一个Prompt）'),
          ]),
        ]),
      ]),

      // 自动创建组合
      h('div', { class: 'node-config-section' }, [
        h('label', { class: 'node-config-label' }, '自动创建组合'),
        h('div', { class: 'config-radio-group' }, [
          h('label', { class: 'config-radio-item' }, [
            h('input', {
              type: 'radio',
              name: `auto-create-combination-${partition.id}`,
              checked: autoCreateCombination,
              onChange: () => setAutoCreateCombination(true),
            }),
            h('span', null, '启用（执行时自动创建组合）'),
          ]),
          h('label', { class: 'config-radio-item' }, [
            h('input', {
              type: 'radio',
              name: `auto-create-combination-${partition.id}`,
              checked: !autoCreateCombination,
              onChange: () => setAutoCreateCombination(false),
            }),
            h('span', null, '禁用'),
          ]),
        ]),

        // 保存到分类选择器（仅在自动创建组合开启时显示）
        autoCreateCombination &&
          h('div', { class: 'node-config-section', style: { marginTop: '8px' } }, [
              h('label', { class: 'node-config-label' }, '保存到分类'),
              h('div', {
                class: 'cat-selector-wrapper',
                ref: catDropdownRef,
              }, [
                // 输入框 + 当前选中显示
                h('div', { class: 'cat-selector-input-row' }, [
                  h('input', {
                    type: 'text',
                    class: 'node-config-input cat-selector-input',
                    placeholder: '留空则保存到根目录，输入筛选分类...',
                    value: showCatDropdown ? catFilter : (autoSaveCategoryId ? buildCategoryPathName(autoSaveCategoryId, categories) : ''),
                    onFocus: () => {
                      setCatFilter('');
                      setShowCatDropdown(true);
                    },
                    onInput: (e) => {
                      setCatFilter(e.target.value);
                      setShowCatDropdown(true);
                    },
                  }),
                  autoSaveCategoryId &&
                    h('button', {
                      class: 'cat-selector-clear',
                      onClick: () => {
                        setAutoSaveCategoryId('');
                        setCatFilter('');
                        setShowCatDropdown(false);
                      },
                      title: '清除（使用根目录）',
                    }, h(Icon, { name: 'x', size: 12 })),
                ]),
                // 下拉列表
                showCatDropdown &&
                  h('div', { class: 'cat-selector-dropdown' }, [
                    // 根目录选项
                    h('div', {
                      class: `cat-selector-item ${autoSaveCategoryId === '' ? 'active' : ''}`,
                      onClick: () => {
                        setAutoSaveCategoryId('');
                        setShowCatDropdown(false);
                      },
                    }, [
                      h(Icon, { name: 'folder', size: 12 }),
                      ' 根目录',
                    ]),
                    // 分类列表
                    ...filteredCategories.map((c) =>
                      h('div', {
                        key: c.id,
                        class: `cat-selector-item ${autoSaveCategoryId === c.id ? 'active' : ''}`,
                        onClick: () => {
                          setAutoSaveCategoryId(c.id);
                          setShowCatDropdown(false);
                        },
                      }, [
                        h(Icon, { name: 'folder', size: 12 }),
                        ' ' + c.pathName,
                      ]),
                    ),
                    filteredCategories.length === 0 &&
                      h('div', { class: 'cat-selector-empty' }, '无匹配分类'),
                  ]),
              ]),
              h('div', { class: 'config-hint' },
                h('span', null, '在浏览区右键分类可复制ID，自动创建的组合将保存到此分类'),
              ),
          ]),
      ]),
    ]),

    // 底部按钮
    h('div', { class: 'node-config-footer' }, [
      h(
        'button',
        {
          class: 'node-config-btn',
          onClick: onClose,
        },
        '取消',
      ),
      h(
        'button',
        {
          class: 'node-config-btn primary',
          onClick: handleSave,
        },
        '保存',
      ),
    ]),
  ]);
}
