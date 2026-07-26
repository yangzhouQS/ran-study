import { defineComponent, ref } from 'vue';
import { ElButton, ElCheckbox, ElInput, ElMessage } from 'element-plus';

export default defineComponent({
  name: 'UuidTool',
  setup() {
    const results = ref<string[]>([]);
    const upper = ref(false);
    const noHyphen = ref(false);
    const count = ref(5);

    const generate = () => {
      const list: string[] = [];
      for (let i = 0; i < count.value; i++) {
        let id: string = crypto.randomUUID();
        if (noHyphen.value) id = id.replace(/-/g, '');
        if (upper.value) id = id.toUpperCase();
        list.push(id);
      }
      results.value = list;
    };

    const copy = (text: string) => {
      navigator.clipboard.writeText(text);
      ElMessage.success('已复制');
    };

    const copyAll = () => {
      navigator.clipboard.writeText(results.value.join('\n'));
      ElMessage.success('已复制全部');
    };

    return () => (
      <div>
        <div style={{ marginBottom: '12px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span>数量：</span>
          <ElInput
            modelValue={String(count.value)}
            onInput={(v: string) => { count.value = Number(v) || 0; }}
            style={{ width: '80px' }}
          />
          <ElCheckbox
            modelValue={upper.value}
            onChange={(v: unknown) => { upper.value = Boolean(v); }}
          >
            大写
          </ElCheckbox>
          <ElCheckbox
            modelValue={noHyphen.value}
            onChange={(v: unknown) => { noHyphen.value = Boolean(v); }}
          >
            无连字符
          </ElCheckbox>
          <ElButton type="primary" size="small" onClick={generate}>生成</ElButton>
          {results.value.length > 0 && (
            <ElButton size="small" onClick={copyAll}>复制全部</ElButton>
          )}
        </div>
        <div>
          {results.value.map((id, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 0',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <code
                style={{
                  flex: 1,
                  fontFamily: 'Consolas, monospace',
                  fontSize: '14px',
                  color: '#1f6feb',
                  cursor: 'pointer',
                }}
                onClick={() => copy(id)}
              >
                {id}
              </code>
              <ElButton text size="small" onClick={() => copy(id)}>复制</ElButton>
            </div>
          ))}
        </div>
      </div>
    );
  },
});
