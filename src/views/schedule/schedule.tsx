import { defineComponent, onMounted, reactive, ref } from 'vue';
import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
} from 'element-plus';
import {
  createScheduled,
  deleteScheduled,
  exportScheduled,
  importScheduled,
  listScheduled,
  runScheduled,
  toggleScheduled,
} from '@/api/schedule-api';
import type { ScheduledTask } from '@/types/api-type';

interface Preset {
  name: string;
  command: string;
  trigger: string;
}

const PRESETS: Preset[] = [
  { name: '清理临时文件', command: 'cmd /c del /q/f/s %TEMP%\\*', trigger: 'daily' },
  { name: '每日备份 MySQL', command: 'cmd /c D:\\ran\\tools\\backup-mysql.bat', trigger: 'daily' },
  { name: '登录启动 Redis', command: 'cmd /c sc start ran-redis-7.2.4', trigger: 'onlogon' },
];

export default defineComponent({
  name: 'Schedule',
  setup() {
    const list = ref<ScheduledTask[]>([]);
    const form = reactive({ name: '', command: '', trigger: 'daily' });
    const ioPath = reactive({ exportPath: '', importPath: '' });
    const preset = ref('');

    const refresh = async () => {
      list.value = await listScheduled();
    };
    onMounted(refresh);

    const onPreset = (v: string) => {
      preset.value = v;
      const p = PRESETS.find((x) => x.name === v);
      if (p) {
        form.name = p.name;
        form.command = p.command;
        form.trigger = p.trigger;
      }
    };

    const add = async () => {
      if (!form.name || !form.command) {
        ElMessage.warning('请填写名称与命令');
        return;
      }
      await createScheduled({ name: form.name, command: form.command, trigger: form.trigger });
      ElMessage.success('已创建');
      form.name = '';
      form.command = '';
      preset.value = '';
      await refresh();
    };
    const run = async (name: string) => {
      await runScheduled(name);
    };
    const toggle = async (name: string, enabled: boolean) => {
      await toggleScheduled(name, enabled);
      await refresh();
    };
    const del = async (id: number, name: string) => {
      await deleteScheduled(id, name);
      await refresh();
    };

    const selected = ref<number[]>([]);
    const onExport = async () => {
      if (selected.value.length === 0) {
        ElMessage.warning('请勾选要导出的任务');
        return;
      }
      const path = await exportScheduled(ioPath.exportPath, selected.value);
      ElMessage.success(`已导出到：${path}`);
      ioPath.exportPath = path;
    };
    const onImport = async () => {
      if (!ioPath.importPath) {
        ElMessage.warning('请填写 .ran 文件路径');
        return;
      }
      const n = await importScheduled(ioPath.importPath);
      ElMessage.success(`已导入 ${n} 个任务`);
      await refresh();
    };

    return () => (
      <div>
        <ElForm labelWidth="70" inline style={{ marginBottom: '8px' }}>
          <ElFormItem label="脚本库">
            <ElSelect
              modelValue={preset.value}
              onChange={(v: string) => onPreset(v)}
              placeholder="一键带入"
              size="small"
              style={{ width: '180px' }}
            >
              {PRESETS.map((p) => (
                <ElOption key={p.name} label={p.name} value={p.name} />
              ))}
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="名称">
            <ElInput
              modelValue={form.name}
              onInput={(v: string) => { form.name = v; }}
              size="small"
              style={{ width: '140px' }}
            />
          </ElFormItem>
          <ElFormItem label="命令">
            <ElInput
              modelValue={form.command}
              onInput={(v: string) => { form.command = v; }}
              size="small"
              style={{ width: '220px' }}
            />
          </ElFormItem>
          <ElFormItem label="周期">
            <ElSelect
              modelValue={form.trigger}
              onChange={(v: string) => { form.trigger = v; }}
              size="small"
              style={{ width: '100px' }}
            >
              <ElOption label="登录时" value="onlogon" />
              <ElOption label="每天" value="daily" />
              <ElOption label="每周" value="weekly" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem>
            <ElButton size="small" type="primary" onClick={add}>创建</ElButton>
          </ElFormItem>
        </ElForm>

        <ElTable data={list.value} onSelect={(rows: ScheduledTask[]) => { selected.value = rows.map((r) => r.id); }} rowKey="id">
          <ElTableColumn type="selection" width={45} />
          <ElTableColumn prop="name" label="名称" width={160} />
          <ElTableColumn prop="command" label="命令" />
          <ElTableColumn prop="trigger" label="周期" width={100} />
          <ElTableColumn label="启用" width={100}>
            {{
              default: (scope: { row: ScheduledTask }) => (
                <ElSwitch
                  modelValue={scope.row.enabled}
                  onChange={(v: unknown) => toggle(scope.row.name, Boolean(v))}
                />
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="操作" width={200}>
            {{
              default: (scope: { row: ScheduledTask }) => (
                <span>
                  <ElButton size="small" onClick={() => run(scope.row.name)}>运行</ElButton>
                  <ElButton type="danger" size="small" onClick={() => del(scope.row.id, scope.row.name)}>
                    删除
                  </ElButton>
                </span>
              ),
            }}
          </ElTableColumn>
        </ElTable>

        <h3 style={{ marginTop: '12px' }}>导入 / 导出（.ran）</h3>
        <ElForm labelWidth="70" inline>
          <ElFormItem label="导出">
            <ElInput
              modelValue={ioPath.exportPath}
              onInput={(v: string) => { ioPath.exportPath = v; }}
              placeholder="留空则写到 data/scheduled-export.ran"
              size="small"
              style={{ width: '300px' }}
            />
            <ElButton size="small" style={{ marginLeft: '4px' }} onClick={onExport}>导出勾选项</ElButton>
          </ElFormItem>
          <ElFormItem label="导入">
            <ElInput
              modelValue={ioPath.importPath}
              onInput={(v: string) => { ioPath.importPath = v; }}
              placeholder="D:\path\to\file.ran"
              size="small"
              style={{ width: '260px' }}
            />
            <ElButton size="small" style={{ marginLeft: '4px' }} onClick={onImport}>导入</ElButton>
          </ElFormItem>
        </ElForm>
      </div>
    );
  },
});
