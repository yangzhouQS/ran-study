import { defineComponent, onMounted, ref } from 'vue';
import {
  ElButton,
  ElCard,
  ElCheckbox,
  ElEmpty,
  ElInput,
  ElMessage,
} from 'element-plus';
import { listLogFiles, readMergedLogs } from '@/api/logs-api';
import type { LogFile } from '@/types/api-type';

interface MergedLine {
  source: string;
  line: string;
}

const fmtSize = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const isError = (line: string): boolean =>
  /error|exception|failed|fatal|traceback|拒绝访问|失败|错误/i.test(line);

const isWarn = (line: string): boolean =>
  /warn|warning|deprecated|timeout|慢查询/i.test(line);

export default defineComponent({
  name: 'Logs',
  setup() {
    const files = ref<LogFile[]>([]);
    const selectedPaths = ref<string[]>([]);
    const merged = ref<MergedLine[]>([]);
    const keyword = ref('');
    const onlyErrors = ref(false);
    const linesPerFile = ref(200);

    const refresh = async () => {
      files.value = await listLogFiles();
    };
    onMounted(refresh);

    const loadMerged = async () => {
      try {
        merged.value = await readMergedLogs(
          selectedPaths.value,
          linesPerFile.value,
        );
      } catch (e) {
        ElMessage.error(String(e));
      }
    };

    const loadAll = async () => {
      selectedPaths.value = files.value.map((f) => f.path);
      await loadMerged();
    };

    const filtered = () => {
      let result = merged.value;
      if (onlyErrors.value) {
        result = result.filter((m) => isError(m.line) || isWarn(m.line));
      }
      if (keyword.value) {
        const kw = keyword.value.toLowerCase();
        result = result.filter(
          (m) =>
            m.line.toLowerCase().includes(kw) ||
            m.source.toLowerCase().includes(kw),
        );
      }
      return result;
    };

    const lineColor = (line: string): string => {
      if (isError(line)) return '#f56c6c';
      if (isWarn(line)) return '#e6a23c';
      return '#d4d4d4';
    };

    const sourceColor = (source: string): string => {
      if (source.includes('error')) return '#f56c6c';
      if (source.includes('out')) return '#67c23a';
      if (source.includes('audit')) return '#909399';
      return '#409eff';
    };

    return () => (
      <div style={{ display: 'flex', gap: '12px', height: 'calc(100vh - 130px)' }}>
        <ElCard
          header="日志文件"
          shadow="never"
          bodyStyle={{ padding: '0', overflow: 'auto', flex: '1' }}
          style={{ width: '260px', display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
            <ElButton size="small" type="primary" onClick={loadAll} style={{ marginRight: '4px' }}>
              全选合并
            </ElButton>
            <ElButton size="small" onClick={loadMerged}>加载选中</ElButton>
          </div>
          {files.value.length === 0 ? (
            <div style={{ padding: '16px' }}>
              <ElEmpty description="暂无日志" />
            </div>
          ) : (
            <div>
              {files.value.map((f) => (
                <div
                  key={f.path}
                  style={{ padding: '6px 10px', borderBottom: '1px solid #f5f5f5' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ElCheckbox
                      modelValue={selectedPaths.value.includes(f.path)}
                      onChange={(v: unknown) => {
                        if (v) selectedPaths.value.push(f.path);
                        else
                          selectedPaths.value = selectedPaths.value.filter(
                            (p) => p !== f.path,
                          );
                      }}
                    />
                    <span
                      style={{
                        fontSize: '13px',
                        color: '#303133',
                        fontWeight: sourceColor(f.name) === '#f56c6c' ? 600 : 400,
                      }}
                    >
                      {f.name}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#909399', paddingLeft: '24px' }}>
                    {fmtSize(f.size)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ElCard>

        <div
          style={{
            flex: '1',
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #e6e8eb',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 12px',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <ElInput
              modelValue={keyword.value}
              onInput={(v: string) => { keyword.value = v; }}
              placeholder="搜索关键词"
              size="small"
              clearable
              style={{ width: '200px' }}
            />
            <ElCheckbox
              modelValue={onlyErrors.value}
              onChange={(v: unknown) => { onlyErrors.value = Boolean(v); }}
            >
              仅错误/警告
            </ElCheckbox>
            <span style={{ fontSize: '12px', color: '#909399' }}>
              {filtered().length} 行（共 {merged.value.length}）
            </span>
            <span style={{ flex: '1' }} />
            <ElButton size="small" onClick={loadMerged}>刷新</ElButton>
          </div>

          <div
            style={{
              flex: '1',
              overflow: 'auto',
              background: '#1e1e1e',
              padding: '8px 0',
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: '12px',
              lineHeight: '1.7',
            }}
          >
            {filtered().length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                {merged.value.length === 0
                  ? '选择左侧日志文件并点击「加载」'
                  : '无匹配行'}
              </div>
            ) : (
              filtered().slice(-500).map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    padding: '1px 12px',
                    background: isError(m.line)
                      ? 'rgba(244,67,54,0.08)'
                      : isWarn(m.line)
                        ? 'rgba(230,162,60,0.06)'
                        : 'transparent',
                  }}
                >
                  <span
                    style={{
                      color: sourceColor(m.source),
                      flexShrink: 0,
                      width: '100px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    [{m.source}]
                  </span>
                  <span style={{ color: lineColor(m.line), wordBreak: 'break-all' }}>
                    {m.line}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  },
});
