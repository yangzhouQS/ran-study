import { defineComponent, ref } from 'vue';
import { ElButton, ElInput, ElMessage } from 'element-plus';

export default defineComponent({
  name: 'CronTool',
  setup() {
    const minute = ref('*');
    const hour = ref('*');
    const day = ref('*');
    const month = ref('*');
    const weekday = ref('*');

    const cronExpr = ref('* * * * *');
    const description = ref('每分钟执行');

    const presets = [
      { label: '每分钟', vals: ['*', '*', '*', '*', '*'], desc: '每分钟执行' },
      { label: '每 5 分钟', vals: ['*/5', '*', '*', '*', '*'], desc: '每 5 分钟执行' },
      { label: '每小时', vals: ['0', '*', '*', '*', '*'], desc: '每小时整点执行' },
      { label: '每天 0:00', vals: ['0', '0', '*', '*', '*'], desc: '每天凌晨 0:00 执行' },
      { label: '每天 9:00', vals: ['0', '9', '*', '*', '*'], desc: '每天上午 9:00 执行' },
      { label: '每周一 9:00', vals: ['0', '9', '*', '*', '1'], desc: '每周一上午 9:00 执行' },
      { label: '每月 1 日 0:00', vals: ['0', '0', '1', '*', '*'], desc: '每月 1 日凌晨执行' },
      { label: '工作日 9:00', vals: ['0', '9', '*', '*', '1-5'], desc: '周一至周五 9:00 执行' },
    ];

    const applyPreset = (vals: string[], _desc: string) => {
      minute.value = vals[0];
      hour.value = vals[1];
      day.value = vals[2];
      month.value = vals[3];
      weekday.value = vals[4];
      build();
    };

    const build = () => {
      cronExpr.value = [minute.value, hour.value, day.value, month.value, weekday.value].join(' ');
      description.value = describe(minute.value, hour.value, day.value, month.value, weekday.value);
    };

    const describe = (mi: string, h: string, d: string, mo: string, w: string): string => {
      if (mi === '*' && h === '*' && d === '*' && mo === '*' && w === '*') return '每分钟执行';
      if (mi.startsWith('*/')) return `每 ${mi.slice(2)} 分钟执行`;
      if (mi !== '*' && h === '*' && d === '*' && mo === '*' && w === '*') return `每小时的第 ${mi} 分钟执行`;
      if (mi !== '*' && h !== '*' && d === '*' && mo === '*' && w === '*') return `每天 ${h}:${mi.padStart(2, '0')} 执行`;
      if (mi !== '*' && h !== '*' && d === '*' && mo === '*' && w === '1-5') return `工作日 ${h}:${mi.padStart(2, '0')} 执行`;
      if (mi !== '*' && h !== '*' && d === '*' && mo === '*' && w !== '*') return `每周${weekdayName(w)} ${h}:${mi.padStart(2, '0')} 执行`;
      if (mi !== '*' && h !== '*' && d !== '*' && mo === '*' && w === '*') return `每月 ${d} 日 ${h}:${mi.padStart(2, '0')} 执行`;
      return `自定义：${mi} ${h} ${d} ${mo} ${w}`;
    };

    const weekdayName = (w: string): string => {
      const names: Record<string, string> = { '0': '日', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '日' };
      if (w.includes('-')) {
        const [a, b] = w.split('-');
        return `周${names[a]}至周${names[b]}`;
      }
      return `周${names[w] || w}`;
    };

    const copy = () => {
      navigator.clipboard.writeText(cronExpr.value);
      ElMessage.success('已复制：' + cronExpr.value);
    };

    build();

    const Field = ({ label, model, onUpdate }: { label: string; model: string; onUpdate: (v: string) => void }) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ width: '70px', fontSize: '13px', color: '#606266' }}>{label}</span>
        <ElInput modelValue={model} onInput={onUpdate} style={{ width: '120px', fontFamily: 'Consolas, monospace' }} onBlur={build} />
      </div>
    );

    return () => (
      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1 }}>
          <h4>字段编辑</h4>
          <Field label="分钟 (0-59)" model={minute.value} onUpdate={(v) => { minute.value = v; }} />
          <Field label="小时 (0-23)" model={hour.value} onUpdate={(v) => { hour.value = v; }} />
          <Field label="日 (1-31)" model={day.value} onUpdate={(v) => { day.value = v; }} />
          <Field label="月 (1-12)" model={month.value} onUpdate={(v) => { month.value = v; }} />
          <Field label="周 (0-6)" model={weekday.value} onUpdate={(v) => { weekday.value = v; }} />
          <ElButton type="primary" size="small" onClick={build} style={{ marginTop: '8px' }}>生成</ElButton>
        </div>
        <div style={{ flex: 1 }}>
          <h4>常用预设</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
            {presets.map((p) => (
              <ElButton key={p.label} size="small" onClick={() => applyPreset(p.vals, p.desc)}>
                {p.label}
              </ElButton>
            ))}
          </div>

          <div style={{
            background: '#f5f7fa', padding: '16px', borderRadius: '8px',
          }}>
            <div style={{ fontSize: '12px', color: '#909399', marginBottom: '4px' }}>Cron 表达式</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <code style={{
                fontSize: '20px', fontWeight: 700, color: '#1f6feb',
                fontFamily: 'Consolas, monospace',
              }}>
                {cronExpr.value}
              </code>
              <ElButton text size="small" onClick={copy}>复制</ElButton>
            </div>
            <div style={{ marginTop: '8px', fontSize: '13px', color: '#67c23a' }}>
              {description.value}
            </div>
          </div>

          <div style={{ marginTop: '12px', fontSize: '12px', color: '#909399' }}>
            <div>格式：<code style={{ color: '#e6a23c' }}>分 时 日 月 周</code></div>
            <div style={{ marginTop: '4px' }}>
              <code>*</code> 任意 ｜ <code>*/5</code> 每 5 ｜ <code>1,3,5</code> 列表 ｜ <code>1-5</code> 范围
            </div>
          </div>
        </div>
      </div>
    );
  },
});
