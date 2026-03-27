/**
 * 画廊数据获取 Hook
 */
import { useState, useEffect } from '../../lib/hooks.mjs';
import { fetchGalleryData } from '../../utils.js';

export function useGalleryData(categoryId = 'root') {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchGalleryData(categoryId);
            // 预计算最大时间用于排序优化
            result.artists = result.artists.map((artist) => ({
                ...artist,
                maxTime:
                    artist.images.length > 0
                        ? Math.max(...artist.images.map((img) => img.mtime))
                        : 0,
            }));
            setData(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return {
        data,
        loading,
        error,
        loadData,
        setData,
    };
}
