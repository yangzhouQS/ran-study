import { defineComponent, ref } from 'vue';
import { ElButton, ElInput, ElMessage } from 'element-plus';

export default defineComponent({
  name: 'HashTool',
  setup() {
    const input = ref('');
    const sha256 = ref('');
    const sha1 = ref('');
    const sha512 = ref('');
    const loading = ref(false);

    const toHex = (buf: ArrayBuffer): string => {
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    };

    const compute = async () => {
      if (!input.value) {
        ElMessage.warning('请输入文本');
        return;
      }
      loading.value = true;
      sha256.value = '';
      sha1.value = '';
      sha512.value = '';
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(input.value);
        const [s256, s1, s512] = await Promise.all([
          crypto.subtle.digest('SHA-256', data),
          crypto.subtle.digest('SHA-1', data),
          crypto.subtle.digest('SHA-512', data),
        ]);
        sha256.value = toHex(s256);
        sha1.value = toHex(s1);
        sha512.value = toHex(s512);
      } catch (e) {
        ElMessage.error('计算失败：' + String(e));
      }
      loading.value = false;
    };

    const copy = (text: string) => {
      navigator.clipboard.writeText(text);
      ElMessage.success('已复制');
    };

    const HashRow = ({ label, value }: { label: string; value: string }) => (
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>{label}</span>
          {value && <ElButton text size="small" onClick={() => copy(value)}>复制</ElButton>}
        </div>
        <div
          style={{
            background: '#1e1e1e',
            color: '#4ec9b0',
            padding: '8px 12px',
            borderRadius: '6px',
            fontFamily: 'Consolas, monospace',
            fontSize: '13px',
            wordBreak: 'break-all',
            minHeight: '36px',
          }}
        >
          {value || '—'}
        </div>
      </div>
    );

    return () => (
      <div>
        <div style={{ marginBottom: '8px' }}>
          <ElInput
            type="textarea"
            modelValue={input.value}
            onInput={(v: string) => { input.value = v; }}
            rows={4}
            placeholder="输入要计算哈希的文本"
            style={{ fontFamily: 'Consolas, monospace', fontSize: '13px' }}
          />
        </div>
        <ElButton type="primary" size="small" onClick={compute} loading={loading.value} style={{ marginBottom: '16px' }}>
          计算 Hash
        </ElButton>
        <HashRow label="SHA-256" value={sha256.value} />
        <HashRow label="SHA-1" value={sha1.value} />
        <HashRow label="SHA-512" value={sha512.value} />
      </div>
    );
  },
});
