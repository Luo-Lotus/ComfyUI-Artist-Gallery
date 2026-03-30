/**
 * Artist Selector Widget
 * 画师选择节点的自定义控件
 *
 * 主文件：负责扩展注册和节点初始化
 * UI 组件：ArtistSelectorWidget.js
 * 业务逻辑：hooks/useArtistSelector.js
 */
import { app } from '../../../scripts/app.js';
import { $el } from '../../../scripts/ui.js';
import { h, render } from '../lib/preact.mjs';
import { useState, useEffect, useMemo } from '../lib/hooks.mjs';

// 确保全局对象可用（用于向后兼容）
if (!self.preactCore) self.preactCore = { h, render, createElement: h };
if (!self.preactHooks) self.preactHooks = { useState, useEffect, useMemo };

app.registerExtension({
    name: 'ArtistGallery.ArtistSelector',

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === 'ArtistSelector') {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);

                // 设置节点大小
                this.setSize([400, 500]);

                const nodeInstance = this;

                // 获取由 INPUT_TYPES 自动创建的隐藏 widgets
                const selectedInput = this.widgets.find(
                    (w) => w.name === 'selected_artists',
                );
                const metadataInput = this.widgets.find(
                    (w) => w.name === 'metadata',
                );

                // 配置隐藏显示
                if (selectedInput) {
                    selectedInput.computeSize = () => [0, -4];
                    selectedInput.draw = () => {};
                    selectedInput.type = 'hidden';
                }

                if (metadataInput) {
                    metadataInput.computeSize = () => [0, -4];
                    metadataInput.draw = () => {};
                    metadataInput.type = 'hidden';
                }
                console.log(nodeInstance, 'initialized');

                // 创建容器
                const container = $el('div.artist-selector-widget', {
                    style: {
                        width: '100%',
                        minHeight: '260px',
                        height: '100%',
                        background: '#1e1e1e',
                        borderRadius: '8px',
                        padding: '12px',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        overflow: 'hidden',
                    },
                });

                // 添加初始加载提示
                container.innerHTML =
                    '<div class="artist-selector-loading">Loading artist selector...</div>';

                // 添加DOM widget
                this.addDOMWidget('artist_selector_widget', 'div', container, {
                    onDraw: () => {},
                });

                // 延迟加载并渲染组件
                setTimeout(async () => {
                    try {
                        // 动态导入组件
                        const { ArtistSelectorWidget } =
                            await import('./components/ArtistSelectorWidget.js');

                        // 渲染组件
                        const vnode = h(ArtistSelectorWidget, {
                            nodeInstance,
                            selectedInput,
                            metadataInput,
                        });

                        render(vnode, container);
                    } catch (error) {
                        console.error(
                            '[ArtistSelector] Failed to load widget:',
                            error,
                        );
                        container.innerHTML =
                            '<div class="artist-selector-loading" style="color: #ff4444;">加载失败，请刷新页面重试</div>';
                    }
                }, 100);
            };
        }
    },
});
