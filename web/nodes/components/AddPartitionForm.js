/**
 * 添加分区表单组件
 */
import { h } from '../../lib/preact.mjs';
import { useState } from '../../lib/hooks.mjs';

export function AddPartitionForm({ onConfirm, onCancel, maxPartitions, currentPartitionCount }) {
    const [newPartitionName, setNewPartitionName] = useState('');

    const handleSubmit = () => {
        if (newPartitionName.trim()) {
            onConfirm(newPartitionName.trim());
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    return h('div', { class: 'add-partition-form' }, [
        h('input', {
            type: 'text',
            class: 'add-partition-input',
            placeholder: '分区名称',
            value: newPartitionName,
            onInput: (e) => setNewPartitionName(e.target.value),
            onKeyPress: handleKeyPress,
            autoFocus: true,
        }),
        h('button', {
            class: 'add-partition-confirm',
            onClick: handleSubmit,
            disabled: currentPartitionCount >= maxPartitions,
        }, '确认'),
        h('button', {
            class: 'add-partition-cancel',
            onClick: () => {
                setNewPartitionName('');
                onCancel();
            },
        }, '取消'),
    ]);
}
