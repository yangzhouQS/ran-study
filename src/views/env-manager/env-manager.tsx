import { defineComponent, ref } from 'vue';
import {
  ElButton,
  ElCard,
  ElEmpty,
  ElIcon,
  ElInput,
  ElMessage,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import { Document, FolderOpened } from '@element-plus/icons-vue';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@/api/files-api';
import MonacoEditor from '@/components/monaco-editor/monaco-editor';

interface EnvVar {
  key: string;
  value: string;
  comment: string;
  sensitive: boolean;
}

const SENSITIVE_KEYS = /password|passwd|secret|token|api[_-]?key|private[_-]?key|credential/i;

const parseEnv = (text: string): EnvVar[] => {
  const result: EnvVar[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let rest = trimmed.substring(eqIdx + 1);
    // 处理行内注释（仅当值不含引号时）
    let comment = '';
    if (!rest.startsWith('"') && !rest.startsWith("'")) {
      const hashIdx = rest.indexOf(' #');
      if (hashIdx !== -1) {
        comment = rest.substring(hashIdx + 1).trim();
        rest = rest.substring(0, hashIdx);
      }
    }
    const value = rest.trim().replace(/^["']|["']$/g, '');
    result.push({
      key,
      value,
      comment,
      sensitive: SENSITIVE_KEYS.test(key),
    });
  }
  return result;
};

const serializeEnv = (vars: EnvVar[]): string => {
  const lines: string[] = [];
  for (const v of vars) {
    if (!v.key) continue;
    const comment = v.comment ? ` ${v.comment}` : '';
    const needsQuote = v.value.includes(' ') || v.value.includes('#');
    const val = needsQuote ? `"${v.value}"` : v.value;
    lines.push(`${v.key}=${val}${comment}`);
  }
  return lines.join('\n') + '\n';
};

export default defineComponent({
  name: 'EnvManager',
  setup() {
    const filePath = ref('');
    const vars = ref<EnvVar[]>([]);
    const loaded = ref(false);
    const showRaw = ref(false);
    const rawContent = ref('');
    const masked = ref(true);

    const pickFile = async () => {
      const f = await open({
        directory: false,
        multiple: false,
        filters: [{ name: 'Env Files', extensions: ['env', '*', 'txt'] }],
      });
      if (typeof f === 'string') {
        await loadFile(f);
      }
    };

    const loadFile = async (path: string) => {
      try {
        filePath.value = path;
        const text = await readTextFile(path);
        rawContent.value = text;
        vars.value = parseEnv(text);
        loaded.value = true;
        ElMessage.success(`已加载 ${vars.value.length} 个变量`);
      } catch (e) {
        ElMessage.error(String(e));
      }
    };

    const save = async () => {
      if (!filePath.value) return;
      try {
        const content = showRaw.value ? rawContent.value : serializeEnv(vars.value);
        await writeTextFile(filePath.value, content);
        ElMessage.success('已保存');
      } catch (e) {
        ElMessage.error(String(e));
      }
    };

    const addVar = () => {
      vars.value.push({ key: '', value: '', comment: '', sensitive: false });
    };

    const removeVar = (index: number) => {
      vars.value.splice(index, 1);
    };

    const switchToRaw = async () => {
      if (showRaw.value) {
        rawContent.value = serializeEnv(vars.value);
      } else {
        vars.value = parseEnv(rawContent.value);
      }
    };

    const displayValue = (v: EnvVar): string => {
      if (v.sensitive && masked.value) return '••••••••';
      return v.value;
    };

    return () => (
      <div>
        <ElCard shadow="never" bodyStyle={{ padding: '12px' }} style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ElButton type="primary" size="small" onClick={pickFile}>
              <ElIcon style={{ marginRight: '4px' }}>
                <FolderOpened />
              </ElIcon>
              选择 .env 文件
            </ElButton>
            {filePath.value ? (
              <span style={{ fontSize: '13px', color: '#606266' }}>
                <ElIcon style={{ verticalAlign: 'middle' }}>
                  <Document />
                </ElIcon>{' '}
                {filePath.value}
              </span>
            ) : (
              <span style={{ fontSize: '13px', color: '#909399' }}>未选择文件</span>
            )}
            <span style={{ flex: '1' }} />
            {loaded.value && (
              <>
                <ElSwitch
                  modelValue={showRaw.value}
                  onChange={(v: unknown) => {
                    showRaw.value = Boolean(v);
                    switchToRaw();
                  }}
                  active-text="源码模式"
                  inactive-text="表格模式"
                  style={{ marginRight: '8px' }}
                />
                {!showRaw.value && (
                  <ElSwitch
                    modelValue={masked.value}
                    onChange={(v: unknown) => { masked.value = Boolean(v); }}
                    active-text="脱敏"
                  />
                )}
                <ElButton type="success" size="small" onClick={save}>保存</ElButton>
              </>
            )}
          </div>
        </ElCard>

        {!loaded.value ? (
          <ElCard shadow="never">
            <ElEmpty description="选择一个 .env 文件以开始编辑" />
          </ElCard>
        ) : showRaw.value ? (
          <div>
            <MonacoEditor
              modelValue={rawContent.value}
              onUpdate:modelValue={(v: string) => { rawContent.value = v; }}
              language="ini"
              height="500px"
            />
            <div style={{ marginTop: '8px', textAlign: 'right' }}>
              <ElButton type="success" size="small" onClick={save}>保存</ElButton>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '8px' }}>
              <ElButton size="small" type="primary" onClick={addVar}>+ 添加变量</ElButton>
            </div>
            <ElTable data={vars.value} border size="small">
              <ElTableColumn label="KEY" width="220">
                {{
                  default: (scope: { row: EnvVar; $index: number }) => (
                    <ElInput
                      modelValue={scope.row.key}
                      onInput={(v: string) => {
                        vars.value[scope.$index].key = v;
                        vars.value[scope.$index].sensitive = SENSITIVE_KEYS.test(v);
                      }}
                      size="small"
                      style={{ fontFamily: 'Consolas, monospace' }}
                    />
                  ),
                }}
              </ElTableColumn>
              <ElTableColumn label="VALUE" min-width="280">
                {{
                  default: (scope: { row: EnvVar; $index: number }) => (
                    <ElInput
                      modelValue={displayValue(scope.row)}
                      onInput={(v: string) => {
                        vars.value[scope.$index].value = v;
                      }}
                      onFocus={() => {
                        if (scope.row.sensitive && masked.value) masked.value = false;
                      }}
                      size="small"
                      style={{ fontFamily: 'Consolas, monospace' }}
                      type={scope.row.sensitive && masked.value ? 'password' : 'text'}
                    />
                  ),
                }}
              </ElTableColumn>
              <ElTableColumn label="注释" width="160">
                {{
                  default: (scope: { row: EnvVar; $index: number }) => (
                    <ElInput
                      modelValue={scope.row.comment}
                      onInput={(v: string) => {
                        vars.value[scope.$index].comment = v;
                      }}
                      size="small"
                    />
                  ),
                }}
              </ElTableColumn>
              <ElTableColumn label="" width="60" align="center">
                {{
                  default: (scope: { row: EnvVar }) => (
                    <span>
                      {scope.row.sensitive ? (
                        <ElTag type="danger" size="small">敏感</ElTag>
                      ) : null}
                    </span>
                  ),
                }}
              </ElTableColumn>
              <ElTableColumn label="" width="60" align="center" fixed="right">
                {{
                  default: (scope: { $index: number }) => (
                    <ElButton
                      type="danger"
                      text
                      size="small"
                      onClick={() => removeVar(scope.$index)}
                    >
                      删除
                    </ElButton>
                  ),
                }}
              </ElTableColumn>
            </ElTable>
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#909399' }}>
                {vars.value.length} 个变量 · {vars.value.filter((v) => v.sensitive).length} 个敏感
              </span>
              <ElButton type="success" size="small" onClick={save}>保存到文件</ElButton>
            </div>
          </div>
        )}
      </div>
    );
  },
});
