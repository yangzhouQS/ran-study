import { defineComponent, ref } from 'vue';
import { ElButton, ElInput, ElMessage } from 'element-plus';

export default defineComponent({
  name: 'JsonTool',
  setup() {
    const input = ref('');
    const output = ref('');

    const doFormat = () => {
      try {
        const obj = JSON.parse(input.value);
        output.value = JSON.stringify(obj, null, 2);
      } catch (e) {
        ElMessage.error('JSON 解析失败：' + String(e));
      }
    };
    const doMinify = () => {
      try {
        const obj = JSON.parse(input.value);
        output.value = JSON.stringify(obj);
      } catch (e) {
        ElMessage.error('JSON 解析失败：' + String(e));
      }
    };
    const doValidate = () => {
      try {
        JSON.parse(input.value);
        ElMessage.success('JSON 格式正确');
      } catch (e) {
        ElMessage.error('JSON 无效：' + String(e));
      }
    };
    const copy = () => {
      navigator.clipboard.writeText(output.value);
      ElMessage.success('已复制');
    };
    const swap = () => {
      input.value = output.value;
      output.value = '';
    };

    return () => (
      <div>
        <div style={{ marginBottom: '8px' }}>
          <ElButton type="primary" size="small" onClick={doFormat}>格式化</ElButton>
          <ElButton size="small" onClick={doMinify}>压缩</ElButton>
          <ElButton size="small" onClick={doValidate}>校验</ElButton>
          <ElButton size="small" onClick={swap}>↑ 输出转输入</ElButton>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: '#909399', marginBottom: '4px' }}>输入</div>
            <ElInput
              type="textarea"
              v-model={input.value}
              rows={14}
              placeholder='粘贴 JSON，如 {"name":"ran","age":3}'
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
              rows={14}
              style={{ fontFamily: 'Consolas, monospace', fontSize: '12px' }}
            />
          </div>
        </div>
      </div>
    );
  },
});
