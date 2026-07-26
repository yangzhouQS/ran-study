import { defineComponent, ref } from 'vue';
import { ElButton, ElCheckbox, ElInput, ElMessage, ElTag } from 'element-plus';

interface Match {
  match: string;
  index: number;
  groups: string[];
}

export default defineComponent({
  name: 'RegexTool',
  setup() {
    const pattern = ref('');
    const flags = ref({ g: true, i: false, m: false });
    const testStr = ref('');
    const matches = ref<Match[]>([]);
    const error = ref('');
    const highlighted = ref('');

    const run = () => {
      matches.value = [];
      error.value = '';
      highlighted.value = '';

      if (!pattern.value) {
        error.value = '请输入正则表达式';
        return;
      }
      const flagStr = (flags.value.g ? 'g' : '') + (flags.value.i ? 'i' : '') + (flags.value.m ? 'm' : '');
      try {
        new RegExp(pattern.value, flagStr);
      } catch (e) {
        error.value = '正则语法错误：' + String(e);
        return;
      }

      const re = new RegExp(pattern.value, flagStr);
      const text = testStr.value;

      // 收集匹配
      if (flags.value.g) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          matches.value.push({
            match: m[0],
            index: m.index,
            groups: m.slice(1),
          });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      } else {
        const m = re.exec(text);
        if (m) {
          matches.value.push({
            match: m[0],
            index: m.index,
            groups: m.slice(1),
          });
        }
      }

      // 高亮
      highlighted.value = buildHighlight(text, re, flags.value.g);
    };

    const buildHighlight = (text: string, re: RegExp, global: boolean): string => {
      const re2 = new RegExp(re.source, global ? 'g' : '');
      return text.replace(re2, (match) => `【${match}】`);
    };

    const copy = (text: string) => {
      navigator.clipboard.writeText(text);
      ElMessage.success('已复制');
    };

    return () => (
      <div>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ marginRight: '8px' }}>正则：</span>
          <ElInput
            v-model={pattern.value}
            placeholder="如 \\d+ 或 [a-z]+@\\w+\\.\\w+"
            style={{ width: '400px', fontFamily: 'Consolas, monospace' }}
          />
          <span style={{ margin: '0 8px 0 16px' }}>标志：</span>
          <ElCheckbox v-model={flags.value.g}>g 全局</ElCheckbox>
          <ElCheckbox v-model={flags.value.i}>i 忽略大小写</ElCheckbox>
          <ElCheckbox v-model={flags.value.m}>m 多行</ElCheckbox>
          <ElButton type="primary" size="small" onClick={run} style={{ marginLeft: '12px' }}>
            测试
          </ElButton>
        </div>

        {error.value ? (
          <div style={{ color: '#f56c6c', marginBottom: '8px' }}>{error.value}</div>
        ) : null}

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: '#909399', marginBottom: '4px' }}>测试文本</div>
            <ElInput
              type="textarea"
              v-model={testStr.value}
              rows={8}
              style={{ fontFamily: 'Consolas, monospace', fontSize: '13px' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: '#909399', marginBottom: '4px' }}>
              高亮预览（【】包裹匹配项）
            </div>
            <pre style={preStyle}>{highlighted.value || '（点击测试后显示）'}</pre>
          </div>
        </div>

        {matches.value.length > 0 ? (
          <div style={{ marginTop: '12px' }}>
            <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600 }}>
                匹配结果（{matches.value.length} 个）
              </span>
              <ElTag type="success" size="small">{matches.value.length} matches</ElTag>
            </div>
            <div style={{ maxHeight: '200px', overflow: 'auto' }}>
              {matches.value.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '4px 8px',
                    borderBottom: '1px solid #f5f5f5',
                    alignItems: 'center',
                  }}
                >
                  <ElTag size="small">#{i + 1}</ElTag>
                  <code style={{ fontFamily: 'Consolas, monospace', color: '#1f6feb' }}>
                    {m.match || '(空匹配)'}
                  </code>
                  <span style={{ fontSize: '12px', color: '#909399' }}>@{m.index}</span>
                  {m.groups.length > 0 && (
                    <span style={{ fontSize: '12px', color: '#e6a23c' }}>
                      组: [{m.groups.join(', ')}]
                    </span>
                  )}
                  <ElButton text size="small" onClick={() => copy(m.match)}>复制</ElButton>
                </div>
              ))}
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
  fontSize: '13px',
  fontFamily: 'Consolas, monospace',
  minHeight: '160px',
  maxHeight: '200px',
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  margin: '0',
};
