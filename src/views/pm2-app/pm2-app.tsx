import { defineComponent, onMounted, reactive, ref } from 'vue';
import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElRadioButton,
  ElRadioGroup,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import {
  addPm2App,
  deletePm2App,
  ensurePm2,
  pm2Apps,
  pm2BootEnabled,
  pm2BootSet,
  pm2Installed,
  pm2List,
  pm2Logs,
  restartPm2App,
  stopPm2App,
} from '@/api/pm2-api';
import type { Pm2App, Pm2Process } from '@/types/api-type';

export default defineComponent({
  name: 'Pm2AppView',
  setup() {
    const installed = ref(false);
    const procs = ref<Pm2Process[]>([]);
    const apps = ref<Pm2App[]>([]);
    const bootOn = ref(false);
    const form = reactive({ name: '', script: '', cwd: '', nodeVersion: '', autostart: false });
    const logs = reactive({ visible: false, name: '', kind: 'out' as 'out' | 'error', text: '' });

    const refresh = async () => {
      installed.value = await pm2Installed();
      if (installed.value) {
        try {
          procs.value = await pm2List();
        } catch {
          procs.value = [];
        }
      }
      apps.value = await pm2Apps();
      bootOn.value = await pm2BootEnabled();
    };
    onMounted(refresh);

    const doEnsure = async () => {
      await ensurePm2();
      await refresh();
      ElMessage.success('pm2 已就绪');
    };
    const doAdd = async () => {
      if (!form.name || !form.script) {
        ElMessage.warning('请填写名称与脚本');
        return;
      }
      await addPm2App({
        name: form.name,
        script: form.script,
        cwd: form.cwd,
        nodeVersion: form.nodeVersion,
        envJson: '',
        autostart: form.autostart,
      });
      ElMessage.success('已添加并启动');
      form.name = '';
      form.script = '';
      form.cwd = '';
      form.autostart = false;
      await refresh();
    };
    const onBoot = async (v: boolean) => {
      await pm2BootSet(v);
      bootOn.value = await pm2BootEnabled();
    };

    const openLogs = async (name: string) => {
      logs.name = name;
      logs.visible = true;
      logs.kind = 'out';
      await refreshLogs();
    };
    const refreshLogs = async () => {
      try {
        logs.text = await pm2Logs(logs.name, logs.kind, 500);
      } catch (e) {
        logs.text = String(e);
      }
    };
    const onKind = async (v: 'out' | 'error') => {
      logs.kind = v;
      await refreshLogs();
    };

    return () => (
      <div>
        <div style={{ marginBottom: '8px' }}>
          <ElButton type="primary" size="small" onClick={doEnsure} disabled={installed.value}>
            {installed.value ? 'pm2 已安装' : '置备 pm2'}
          </ElButton>
          <span style={{ marginLeft: '16px' }}>开机自启</span>
          <ElSwitch
            modelValue={bootOn.value}
            onChange={(v: unknown) => onBoot(Boolean(v))}
            style={{ marginLeft: '8px' }}
          />
        </div>

        <ElForm labelWidth="90" style={{ maxWidth: '640px' }}>
          <ElFormItem label="名称">
            <ElInput modelValue={form.name} onInput={(v: string) => { form.name = v; }} />
          </ElFormItem>
          <ElFormItem label="脚本">
            <ElInput
              modelValue={form.script}
              onInput={(v: string) => { form.script = v; }}
              placeholder="如 app.js / dist/index.js"
            />
          </ElFormItem>
          <ElFormItem label="工作目录">
            <ElInput modelValue={form.cwd} onInput={(v: string) => { form.cwd = v; }} />
          </ElFormItem>
          <ElFormItem label="开机自启">
            <ElSwitch
              modelValue={form.autostart}
              onChange={(v: unknown) => { form.autostart = Boolean(v); }}
            />
          </ElFormItem>
          <ElFormItem>
            <ElButton type="primary" onClick={doAdd}>添加并启动</ElButton>
          </ElFormItem>
        </ElForm>

        <h3 style={{ marginTop: '12px' }}>运行进程</h3>
        <ElTable data={procs.value}>
          <ElTableColumn prop="name" label="名称" />
          <ElTableColumn prop="status" label="状态" width={120} />
          <ElTableColumn prop="pid" label="PID" width={90} />
          <ElTableColumn label="操作" width={340}>
            {{
              default: (scope: { row: Pm2Process }) => (
                <span>
                  <ElButton size="small" onClick={() => restartPm2App(scope.row.name)}>重启</ElButton>
                  <ElButton size="small" onClick={() => stopPm2App(scope.row.name)}>停止</ElButton>
                  <ElButton size="small" onClick={() => openLogs(scope.row.name)}>日志</ElButton>
                </span>
              ),
            }}
          </ElTableColumn>
        </ElTable>

        <h3 style={{ marginTop: '12px' }}>已登记应用</h3>
        <ElTable data={apps.value}>
          <ElTableColumn prop="name" label="名称" />
          <ElTableColumn prop="script" label="脚本" />
          <ElTableColumn prop="cwd" label="工作目录" />
          <ElTableColumn label="自启" width={90}>
            {{
              default: (scope: { row: Pm2App }) =>
                scope.row.autostart ? <ElTag type="success">是</ElTag> : <ElTag>否</ElTag>,
            }}
          </ElTableColumn>
          <ElTableColumn label="操作" width={120}>
            {{
              default: (scope: { row: Pm2App }) => (
                <ElButton
                  type="danger"
                  size="small"
                  onClick={() => deletePm2App(scope.row.id, scope.row.name)}
                >
                  删除
                </ElButton>
              ),
            }}
          </ElTableColumn>
        </ElTable>

        <ElDialog
          title={`日志 - ${logs.name}`}
          modelValue={logs.visible}
          onUpdate:modelValue={(v: boolean) => { logs.visible = v; }}
          width="780px"
        >
          <div style={{ marginBottom: '8px' }}>
            <ElRadioGroup modelValue={logs.kind} onChange={(v: unknown) => onKind(v as 'out' | 'error')}>
              <ElRadioButton value="out">stdout</ElRadioButton>
              <ElRadioButton value="error">stderr</ElRadioButton>
            </ElRadioGroup>
            <ElButton size="small" style={{ marginLeft: '8px' }} onClick={refreshLogs}>刷新</ElButton>
          </div>
          <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '8px', maxHeight: '420px', overflow: 'auto' }}>
            {logs.text}
          </pre>
        </ElDialog>
      </div>
    );
  },
});
