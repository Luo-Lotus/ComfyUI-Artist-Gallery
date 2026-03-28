/**
 * 画师输出处理 Hook
 * 处理画师输出生成、随机选择、循环模式等逻辑
 */
import { useFormatProcessor } from './useFormatProcessor.js';
import { saveCycleState, getCycleState, resetCycleState } from '../../../services/artistApi.js';

/**
 * 从分类中递归获取所有画师
 * @param {Set} categoryIds - 分类ID集合
 * @param {Array} categories - 所有分类
 * @param {Array} allArtists - 所有画师
 * @returns {Array} - 画师数组
 */
function getArtistsFromCategories(categoryIds, categories, allArtists) {
    const artists = [];

    categoryIds.forEach((catId) => {
        // 递归获取子分类
        const childCategories = categories.filter((c) => c.parentId === catId);
        const childCatIds = new Set(childCategories.map((c) => c.id));
        artists.push(...getArtistsFromCategories(childCatIds, categories, allArtists));

        // 获取当前分类下的画师
        const catArtists = allArtists.filter((a) => a.categoryId === catId);
        artists.push(...catArtists);
    });

    return artists;
}

/**
 * 随机选择N个画师
 * @param {Array} artists - 画师数组
 * @param {number} count - 选择数量
 * @returns {Array} - 随机选中的画师
 */
function selectRandomArtists(artists, count) {
    if (count >= artists.length) {
        return [...artists];
    }

    const shuffled = [...artists].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/**
 * 画师输出处理 Hook
 * @param {Object} params - 参数对象
 * @returns {Object} - 输出处理函数集合
 */
export function useArtistOutput({
    nodeInstance,
    selectedArtists,
    selectedCategories,
    categories,
    allArtists,
    categoryConfigs,
    globalConfig,
}) {
    const { applyFormat } = useFormatProcessor();

    /**
     * 生成最终输出
     * @returns {Promise<string>} - 格式化后的输出字符串
     */
    const generateOutput = async () => {
        try {
            // 1. 收集所有画师（包括从分类中递归获取的）
            const categoryArtists = getArtistsFromCategories(
                selectedCategories,
                categories,
                allArtists
            );

            // 合并直接选择的画师和从分类获取的画师，去重
            const allArtistsSet = new Map();
            [...selectedArtists, ...categoryArtists].forEach((artist) => {
                const key = `${artist.categoryId}:${artist.name}`;
                if (!allArtistsSet.has(key)) {
                    allArtistsSet.set(key, artist);
                }
            });

            const allArtistsList = Array.from(allArtistsSet.values());

            if (allArtistsList.length === 0) {
                return '';
            }

            // 2. 应用分类配置（如果有覆盖）
            const artistsWithConfig = allArtistsList.map((artist) => {
                const catConfig = categoryConfigs[artist.categoryId];
                let config = globalConfig;

                // 如果分类有独立配置且启用，使用分类配置
                if (catConfig && catConfig.enabled) {
                    config = {
                        format: catConfig.format || globalConfig.format,
                        randomMode: catConfig.randomMode !== undefined ? catConfig.randomMode : globalConfig.randomMode,
                        randomCount: catConfig.randomCount !== undefined ? catConfig.randomCount : globalConfig.randomCount,
                    };
                }

                return {
                    ...artist,
                    config,
                };
            });

            // 3. 处理多画师随机规则（全局）
            if (globalConfig.randomMode && globalConfig.randomCount > 0) {
                const selected = selectRandomArtists(
                    artistsWithConfig,
                    globalConfig.randomCount
                );
                // 格式化选中的画师
                const formatted = selected.map((artist) => {
                    return applyFormat(artist.config.format, artist.name);
                });
                return formatted.join(',');
            }

            // 4. 处理循环模式
            if (globalConfig.cycleMode) {
                const nodeId = nodeInstance?.id || 'default';
                const cycleData = await getCycleState(nodeId);
                const currentIndex = cycleData.cycle_index || 0;

                // 获取当前循环位置的画师
                const artist = artistsWithConfig[currentIndex % artistsWithConfig.length];

                // 更新循环状态
                const nextIndex = (currentIndex + 1) % artistsWithConfig.length;
                await saveCycleState(nodeId, nextIndex);

                // 格式化并返回
                return applyFormat(artist.config.format, artist.name);
            }

            // 5. 默认：应用格式到所有画师
            const formatted = artistsWithConfig.map((artist) => {
                return applyFormat(artist.config.format, artist.name);
            });
            return formatted.join(',');
        } catch (error) {
            console.error('[useArtistOutput] Failed to generate output:', error);
            // 出错时返回简单格式
            return allArtistsList.map((a) => a.name).join(',');
        }
    };

    /**
     * 重置循环状态
     */
    const resetCycle = async () => {
        try {
            const nodeId = nodeInstance?.id || 'default';
            await resetCycleState(nodeId);
            console.log('[useArtistOutput] Cycle state reset for node:', nodeId);
        } catch (error) {
            console.error('[useArtistOutput] Failed to reset cycle state:', error);
        }
    };

    /**
     * 获取当前循环位置
     * @returns {Promise<number>} - 当前循环索引
     */
    const getCurrentCycleIndex = async () => {
        try {
            const nodeId = nodeInstance?.id || 'default';
            const cycleData = await getCycleState(nodeId);
            return cycleData.cycle_index || 0;
        } catch (error) {
            console.error('[useArtistOutput] Failed to get cycle index:', error);
            return 0;
        }
    };

    /**
     * 获取循环总数
     * @returns {Promise<number>} - 循环总数
     */
    const getCycleTotal = async () => {
        try {
            const categoryArtists = getArtistsFromCategories(
                selectedCategories,
                categories,
                allArtists
            );

            const allArtistsSet = new Map();
            [...selectedArtists, ...categoryArtists].forEach((artist) => {
                const key = `${artist.categoryId}:${artist.name}`;
                if (!allArtistsSet.has(key)) {
                    allArtistsSet.set(key, artist);
                }
            });

            return Array.from(allArtistsSet.values()).length;
        } catch (error) {
            console.error('[useArtistOutput] Failed to get cycle total:', error);
            return 0;
        }
    };

    return {
        generateOutput,
        resetCycle,
        getCurrentCycleIndex,
        getCycleTotal,
    };
}
