import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import { ElButton, ElInput, ElMessage } from 'element-plus';

export default defineComponent({
  name: 'TimestampTool',
  setup() {
    const now = ref(Math.floor(Date.now() / 1000));
    const nowMs = ref(Date.now());
    const tsInput = ref('');
    const tsResult = ref('');
    const dateInput = ref('');
    const dateResult = ref('');
    let timer: number | null = null;

    onMounted(() => {
      timer = window.setInterval(() => {
        now.value = Math.floor(Date.now() / 1000);
        nowMs.value = Date.now();
      }, 1000);
    });
    onUnmounted(() => timer && clearInterval(timer));

    const tsToDate = () => {
      const n = Number(tsInput.value.trim());
      if (isNaN(n)) {
        ElMessage.error('请输入数字');
        return;
      }
      const ms = n < 1e12 ? n * 1000 : n;
      const d = new Date(ms);
      tsResult.value = [
        `ISO: ${d.toISOString()}`,
        `本地: ${d.toLocaleString('zh-CN')}`,
        `UTC: ${d.toUTCString()}`,
        `相对: ${timeAgo(d)}`,
      ].join('\n');
    };

    const dateToTs = () => {
      const d = new Date(dateInput.value.trim());
      if (isNaN(d.getTime())) {
        ElMessage.error('无效日期，如 2026-01-15 10:30:00');
        return;
      }
      dateResult.value = [
        `秒: ${Math.floor(d.getTime() / 1000)}`,
        `毫秒: ${d.getTime()}`,
      ].join('\n');
    };

    const timeAgo = (d: Date) => {
      const diff = Date.now() - d.getTime();
      const abs = Math.abs(diff);
      const dir = diff > 0 ? '前' : '后';
      if (abs < 60000) return `${Math.floor(abs / 1000)} 秒${dir}`;
      if (abs < 3600000) return `${Math.floor(abs / 60000)} 分钟${dir}`;
      if (abs < 86400000) return `${Math.floor(abs / 3600000)} 小时${dir}`;
      return `${Math.floor(abs / 86400000)} 天${dir}`;
    };

    const copy = (text: string) => {
      navigator.clipboard.writeText(text);
      ElMessage.success('已复制');
    };

    return () => (
      <div>
        <div
          style={{
            background: '#f5f7fa',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            gap: '24px',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: '#909399' }}>当前时间戳（秒）</div>
            <div
              style={{ fontSize: '22px', fontWeight: 700, color: '#1f6feb', cursor: 'pointer' }}
              onClick={() => copy(String(now.value))}
            >
              {now.value}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#909399' }}>当前时间戳（毫秒）</div>
            <div
              style={{ fontSize: '22px', fontWeight: 700, color: '#1f6feb', cursor: 'pointer' }}
              onClick={() => copy(String(nowMs.value))}
            >
              {nowMs.value}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <h4>时间戳 → 日期</h4>
            <ElInput
              v-model={tsInput.value}
              placeholder="输入秒或毫秒时间戳"
              style={{ marginBottom: '8px' }}
            />
            <ElButton type="primary" size="small" onClick={tsToDate}>转换</ElButton>
            <pre
              style={{
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '13px',
                marginTop: '8px',
                minHeight: '80px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {tsResult.value}
            </pre>
          </div>
          <div style={{ flex: 1 }}>
            <h4>日期 → 时间戳</h4>
            <ElInput
              v-model={dateInput.value}
              placeholder="如 2026-01-15 10:30:00"
              style={{ marginBottom: '8px' }}
            />
            <ElButton type="primary" size="small" onClick={dateToTs}>转换</ElButton>
            <pre
              style={{
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '13px',
                marginTop: '8px',
                minHeight: '80px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {dateResult.value}
            </pre>
          </div>
        </div>
      </div>
    );
  },
});
