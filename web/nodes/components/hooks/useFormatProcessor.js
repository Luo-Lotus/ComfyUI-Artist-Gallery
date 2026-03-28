/**
 * 格式处理 Hook
 * 处理画师名称格式化，支持变量替换和随机数生成
 */

/**
 * 解析格式字符串
 * @param {string} format - 格式字符串，如 "({content}:{random(1,1.5,0.1)})"
 * @returns {Array} - 解析后的token数组
 */
function parseFormat(format) {
    if (!format) {
        return [{ type: 'text', value: '{content}' }];
    }

    const tokens = [];
    let currentPos = 0;

    // 正则匹配 {content} 和 {random(...)}
    const pattern = /\{(content|random)\(([^)]*)\)\}/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(format)) !== null) {
        // 添加前面的文本
        if (match.index > lastIndex) {
            const text = format.slice(lastIndex, match.index);
            if (text) {
                tokens.push({ type: 'text', value: text });
            }
        }

        // 添加匹配到的token
        if (match[1] === 'content') {
            tokens.push({ type: 'variable', value: 'content' });
        } else if (match[1] === 'random') {
            // 解析 random 参数: min,max,step
            const params = match[2].split(',').map(p => p.trim());
            const min = parseFloat(params[0]) || 0;
            const max = parseFloat(params[1]) || 1;
            const step = parseFloat(params[2]) || 0.1;

            tokens.push({
                type: 'random',
                min,
                max,
                step
            });
        }

        lastIndex = pattern.lastIndex;
    }

    // 添加剩余文本
    if (lastIndex < format.length) {
        const text = format.slice(lastIndex);
        if (text) {
            tokens.push({ type: 'text', value: text });
        }
    }

    // 如果没有匹配到任何token，返回原始格式作为文本
    if (tokens.length === 0) {
        tokens.push({ type: 'text', value: format });
    }

    return tokens;
}

/**
 * 生成指定范围的随机数
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @param {number} step - 步长
 * @returns {number} - 随机数
 */
function generateRandom(min, max, step) {
    const steps = Math.floor((max - min) / step);
    const randomStep = Math.floor(Math.random() * (steps + 1));
    const value = min + (randomStep * step);

    // 处理浮点数精度问题
    return parseFloat(value.toFixed(10));
}

/**
 * 应用格式到画师名称
 * @param {string} format - 格式字符串
 * @param {string} artistName - 画师名称
 * @returns {string} - 格式化后的字符串
 */
function applyFormat(format, artistName) {
    const tokens = parseFormat(format);

    return tokens.map(token => {
        if (token.type === 'text') {
            return token.value;
        } else if (token.type === 'variable') {
            return artistName;
        } else if (token.type === 'random') {
            return generateRandom(token.min, token.max, token.step).toString();
        }
        return '';
    }).join('');
}

/**
 * 生成预览（使用固定的随机种子，便于预览）
 * @param {string} format - 格式字符串
 * @param {string} artistName - 画师名称
 * @returns {string} - 预览字符串
 */
function previewFormat(format, artistName) {
    const tokens = parseFormat(format);

    return tokens.map(token => {
        if (token.type === 'text') {
            return token.value;
        } else if (token.type === 'variable') {
            return artistName || 'artist_name';
        } else if (token.type === 'random') {
            // 预览时使用中值
            const midValue = (token.min + token.max) / 2;
            // 找到最接近步长的值
            const steps = Math.floor((midValue - token.min) / token.step);
            const previewValue = token.min + (steps * token.step);
            return parseFloat(previewValue.toFixed(10)).toString();
        }
        return '';
    }).join('');
}

/**
 * 验证格式字符串
 * @param {string} format - 格式字符串
 * @returns {Object} - { valid: boolean, error: string }
 */
function validateFormat(format) {
    if (!format || format.trim() === '') {
        return { valid: false, error: '格式不能为空' };
    }

    try {
        const tokens = parseFormat(format);

        // 检查随机数参数是否有效
        for (const token of tokens) {
            if (token.type === 'random') {
                if (token.min >= token.max) {
                    return { valid: false, error: '随机数最小值必须小于最大值' };
                }
                if (token.step <= 0) {
                    return { valid: false, error: '随机数步长必须大于0' };
                }
                if ((token.max - token.min) < token.step) {
                    return { valid: false, error: '随机数范围必须大于步长' };
                }
            }
        }

        return { valid: true, error: null };
    } catch (error) {
        return { valid: false, error: error.message };
    }
}

/**
 * 格式处理 Hook
 * @returns {Object} - 格式处理函数集合
 */
export function useFormatProcessor() {
    return {
        parseFormat,
        applyFormat,
        previewFormat,
        validateFormat,
        generateRandom,
    };
}
