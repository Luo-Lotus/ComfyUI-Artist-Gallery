/**
 * 导入预览组件
 * 显示文件名解析结果和统计信息
 */

import { h } from '../lib/preact.mjs';

export function ImportPreview({ preview, categories }) {
    if (!preview || preview.length === 0) return null;

    const matched = preview.filter(p => p.parsedArtist);
    const unmatched = preview.filter(p => !p.parsedArtist);

    const getCategoryName = (categoryId) => {
        const category = categories.find(c => c.id === categoryId);
        return category ? category.name : categoryId;
    };

    return h('div', { class: 'import-preview' }, [
        h('h4', {}, '导入预览'),

        // 统计信息
        h('div', { class: 'preview-stats' }, [
            h('span', { class: 'stat-item' }, `总计: ${preview.length}`),
            h('span', { class: 'stat-item success' }, `匹配: ${matched.length}`),
            unmatched.length > 0 && h('span', { class: 'stat-item warning' }, `未匹配: ${unmatched.length}`)
        ]),

        // 预览列表
        h('div', { class: 'preview-list' },
            preview.slice(0, 15).map((item, index) => {
                const isMatched = !!item.parsedArtist;

                return h('div', {
                    class: `preview-item ${isMatched ? 'matched' : 'unmatched'}`,
                    key: index
                }, [
                    h('span', { class: 'preview-filename' }, item.filename),

                    isMatched
                        ? h('span', { class: 'preview-artist success' },
                            `→ ${item.parsedArtist} (${getCategoryName(item.categoryId)})`
                          )
                        : h('span', { class: 'preview-artist warning' }, '→ 未匹配'),

                    item.willCreate && h('span', { class: 'preview-badge' }, '新建')
                ]);
            })
        ),

        // 更多提示
        preview.length > 15 &&
            h('div', { class: 'preview-more' },
                `还有 ${preview.length - 15} 个文件未显示...`
            )
    ]);
}
