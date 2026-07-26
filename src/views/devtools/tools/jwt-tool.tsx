import { defineComponent, ref } from 'vue';
import { ElButton, ElInput, ElMessage } from 'element-plus';

interface JwtPayload {
  header: string;
  payload: string;
  error: string;
}

export default defineComponent({
  name: 'JwtTool',
  setup() {
    const token = ref('');
    const result = ref<JwtPayload>({ header: '', payload: '', error: '' });

    const decode = () => {
      result.value = { header: '', payload: '', error: '' };
      const parts = token.value.trim().split('.');
      if (parts.length < 2) {
        result.value.error = '无效 JWT：至少需要 header.payload 两段';
        return;
      }
      try {
        const header = JSON.parse(b64urlDecode(parts[0]));
        result.value.header = JSON.stringify(header, null, 2);
      } catch (e) {
        result.value.error = 'Header 解码失败：' + String(e);
        return;
      }
      try {
        const payload = JSON.parse(b64urlDecode(parts[1]));
        result.value.payload = JSON.stringify(payload, null, 2);
      } catch (e) {
        result.value.error = 'Payload 解码失败：' + String(e);
        return;
      }
      // 显示过期信息
      try {
        const payload = JSON.parse(b64urlDecode(parts[1]));
        if (payload.exp) {
          const expDate = new Date(payload.exp * 1000);
          const expired = Date.now() > expDate.getTime();
          result.value.payload += `\n\n// 过期时间: ${expDate.toLocaleString('zh-CN')}`;
          result.value.payload += expired ? '\n// 状态: ⚠️ 已过期' : '\n// 状态: ✓ 有效';
        }
      } catch {
        /* ignore */
      }
    };

    const b64urlDecode = (s: string): string => {
      let str = s.replace(/-/g, '+').replace(/_/g, '/');
      while (str.length % 4) str += '=';
      return decodeURIComponent(escape(atob(str)));
    };

    const copy = (text: string) => {
      navigator.clipboard.writeText(text);
      ElMessage.success('已复制');
    };

    return () => (
      <div>
        <ElInput
          type="textarea"
          v-model={token.value}
          rows={3}
          placeholder="粘贴 JWT Token (eyJhbG...)"
          style={{ fontFamily: 'Consolas, monospace', fontSize: '12px', marginBottom: '8px' }}
        />
        <ElButton type="primary" size="small" onClick={decode} style={{ marginBottom: '12px' }}>
          解码
        </ElButton>

        {result.value.error ? (
          <div style={{ color: '#f56c6c', fontSize: '13px' }}>{result.value.error}</div>
        ) : null}

        {result.value.header ? (
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600 }}>Header</span>
                <ElButton text size="small" onClick={() => copy(result.value.header)}>复制</ElButton>
              </div>
              <pre style={preStyle}>{result.value.header}</pre>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600 }}>Payload</span>
                <ElButton text size="small" onClick={() => copy(result.value.payload)}>复制</ElButton>
              </div>
              <pre style={preStyle}>{result.value.payload}</pre>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
});

const preStyle = {
  background: '#1e1e1e',
  color: '#d4d4d4',
  padding: '10px',
  borderRadius: '6px',
  fontSize: '12px',
  fontFamily: 'Consolas, monospace',
  minHeight: '120px',
  maxHeight: '300px',
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  margin: '0',
};
