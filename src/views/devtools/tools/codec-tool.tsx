import { defineComponent, ref } from 'vue';
import { ElButton, ElInput, ElMessage } from 'element-plus';

export default defineComponent({
  name: 'CodecTool',
  setup() {
    const input = ref('');
    const output = ref('');

    const b64Encode = () => {
      try {
        output.value = btoa(unescape(encodeURIComponent(input.value)));
      } catch (e) {
        ElMessage.error('编码失败：' + String(e));
      }
    };
    const b64Decode = () => {
      try {
        output.value = decodeURIComponent(escape(atob(input.value.trim())));
      } catch (e) {
        ElMessage.error('解码失败：' + String(e));
      }
    };
    const urlEncode = () => {
      output.value = encodeURIComponent(input.value);
    };
    const urlDecode = () => {
      try {
        output.value = decodeURIComponent(input.value);
      } catch (e) {
        ElMessage.error('解码失败：' + String(e));
      }
    };
    const copy = () => {
      navigator.clipboard.writeText(output.value);
      ElMessage.success('已复制');
    };

    return () => (
      <div>
        <div style={{ marginBottom: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <ElButton size="small" onClick={b64Encode}>Base64 编码</ElButton>
          <ElButton size="small" onClick={b64Decode}>Base64 解码</ElButton>
          <ElButton size="small" onClick={urlEncode}>URL 编码</ElButton>
          <ElButton size="small" onClick={urlDecode}>URL 解码</ElButton>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: '#909399', marginBottom: '4px' }}>输入</div>
            <ElInput
              type="textarea"
              v-model={input.value}
              rows={10}
              style={{ fontFamily: 'Consolas, monospace', fontSize: '12px' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: '#909399' }}>输出</span>
              <ElButton text size="small" onClick={copy}>复制</ElButton>
            </div>
            <ElInput
              type="textarea"
              modelValue={output.value}
              readonly
              rows={10}
              style={{ fontFamily: 'Consolas, monospace', fontSize: '12px' }}
            />
          </div>
        </div>
      </div>
    );
  },
});
