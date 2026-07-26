import { defineComponent, onMounted, reactive, ref } from 'vue';
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import { Document, FolderOpened } from '@element-plus/icons-vue';
import {
  controlSoftware,
  installSoftware,
  linkSoftware,
  listCatalog,
  readSoftwareConfig,
  uninstallSoftware,
  updateSoftware,
  writeSoftwareConfig,
} from '@/api/software-api';
import { getSystemInfo } from '@/api/system-api';
import { open } from '@tauri-apps/plugin-dialog';
import { useInstalled } from '@/composables/use-installed';
import { useTaskStream } from '@/composables/use-task-stream';
import { useAppStore } from '@/store/app-store';
import type { InstalledSoftware, RunMode, SoftwareCatalog } from '@/types/api-type';

interface Sel {
  version: string;
  mode: RunMode;
}

export default defineComponent({
  name: 'Software',
  setup() {
    const catalog = ref<SoftwareCatalog[]>([]);
    const initialized = ref(false);
    const rootDir = ref('');
    const store = useAppStore();
    const { list: installed, refresh } = useInstalled();
    const { tasks } = useTaskStream();
    const sel = ref<Record<string, Sel>>({});
    const cfg = reactive({ visible: false, id: 0, name: '', content: '' });
    const linkVisible = ref(false);
    const editVisible = ref(false);
    const editForm = reactive({
      id: 0,
      provider: '',
      version: '',
      installPath: '',
      binPath: '',
      configPath: '',
      dataPath: '',
      port: '',
      serviceName: '',
      mode: 'Portable' as RunMode,
    });

    // 操作日志
    const opLogs = ref<string[]>([]);
    const actionLabel = (a: string) =>
      ({ start: '启动', stop: '停止', restart: '重启', uninstall: '卸载' }[a] || a);
    const logOp = (action: string, row: InstalledSoftware | undefined, result: string, ok: boolean) => {
      if (!row) return;
      const ts = new Date().toLocaleTimeString();
      const mode = row.runMode === 'Service' ? '服务' : '便携';
      const svc = row.serviceName ? ` 服务名:${row.serviceName}` : '';
      const icon = ok ? '✓' : '✗';
      const head = `[${ts}] ${actionLabel(action)} ${row.provider}@${row.version} (端口:${row.port} 模式:${mode}${svc})`;
      const bin = row.binPath ? `  bin: ${row.binPath}` : '';
      opLogs.value.unshift(`${head}${bin}\n  ${icon} ${result}`);
      if (opLogs.value.length > 80) opLogs.value.pop();
    };
    const linkForm = reactive({
      provider: 'mysql',
      installPath: '',
      version: '',
      binPath: '',
      configPath: '',
      port: '',
      dataPath: '',
      serviceName: '',
      mode: 'Service' as RunMode,
    });

    const selOf = (c: SoftwareCatalog): Sel => {
      if (!sel.value[c.id]) {
        sel.value[c.id] = {
          version: c.versions[0]?.version ?? '',
          mode: 'Portable',
        };
      }
      return sel.value[c.id];
    };

    onMounted(async () => {
      const [info, cat] = await Promise.all([getSystemInfo(), listCatalog()]);
      rootDir.value = info.rootDir;
      initialized.value = info.initialized;
      store.setRootDir(info.rootDir);
      catalog.value = cat;
    });

    const doInstall = async (c: SoftwareCatalog) => {
      const s = selOf(c);
      await installSoftware(c.id, s.version, s.mode);
      ElMessage.success(`已提交安装 ${c.id}@${s.version}`);
    };
    const act = async (id: number, a: 'start' | 'stop' | 'restart') => {
      const row = installed.value.find((s) => s.id === id);
      try {
        const result = await controlSoftware(id, a);
        logOp(a, row, `${result.command} → 状态: ${result.status}`, true);
      } catch (e) {
        logOp(a, row, String(e), false);
      }
      await refresh();
    };
    const rm = async (id: number) => {
      const row = installed.value.find((s) => s.id === id);
      try {
        await uninstallSoftware(id);
        logOp('uninstall', row, '已卸载', true);
      } catch (e) {
        logOp('uninstall', row, String(e), false);
      }
      await refresh();
    };
    const openConfig = async (row: InstalledSoftware) => {
      cfg.id = row.id;
      cfg.name = `${row.provider} ${row.version}`;
      cfg.visible = true;
      try {
        cfg.content = await readSoftwareConfig(row.id);
      } catch (e) {
        cfg.content = String(e);
      }
    };
    const saveConfig = async () => {
      await writeSoftwareConfig(cfg.id, cfg.content);
      ElMessage.success('配置已保存（需重启该软件生效）');
      cfg.visible = false;
    };
    const onLink = async () => {
      if (!linkForm.installPath) {
        ElMessage.warning('请填写安装目录');
        return;
      }
      await linkSoftware({
        provider: linkForm.provider,
        installPath: linkForm.installPath,
        version: linkForm.version || undefined,
        binPath: linkForm.binPath || undefined,
        configPath: linkForm.configPath || undefined,
        port: linkForm.port ? Number(linkForm.port) : undefined,
        dataPath: linkForm.dataPath || undefined,
        serviceName: linkForm.serviceName || undefined,
        runMode: linkForm.mode,
      });
      ElMessage.success('已接入');
      linkVisible.value = false;
      linkForm.installPath = '';
      linkForm.serviceName = '';
      linkForm.dataPath = '';
      await refresh();
    };
    const pickInstall = async () => {
      const d = await open({ directory: true, multiple: false });
      if (typeof d === 'string') linkForm.installPath = d;
    };
    const pickData = async () => {
      const d = await open({ directory: true, multiple: false });
      if (typeof d === 'string') linkForm.dataPath = d;
    };
    const pickBin = async () => {
      const f = await open({ directory: false, multiple: false });
      if (typeof f === 'string') linkForm.binPath = f;
    };
    const pickConfig = async () => {
      const f = await open({ directory: false, multiple: false });
      if (typeof f === 'string') linkForm.configPath = f;
    };

    const openEdit = (row: InstalledSoftware) => {
      editForm.id = row.id;
      editForm.provider = row.provider;
      editForm.version = row.version;
      editForm.installPath = row.installPath;
      editForm.binPath = row.binPath;
      editForm.configPath = row.configPath;
      editForm.dataPath = row.dataPath;
      editForm.port = String(row.port);
      editForm.serviceName = row.serviceName ?? '';
      editForm.mode = row.runMode;
      editVisible.value = true;
    };
    const onEdit = async () => {
      await updateSoftware({
        id: editForm.id,
        version: editForm.version,
        installPath: editForm.installPath,
        binPath: editForm.binPath,
        configPath: editForm.configPath,
        dataPath: editForm.dataPath,
        port: editForm.port ? Number(editForm.port) : 0,
        serviceName: editForm.serviceName || null,
        runMode: editForm.mode,
      });
      ElMessage.success('已更新');
      editVisible.value = false;
      await refresh();
    };
    const pickEditInstall = async () => {
      const d = await open({ directory: true, multiple: false });
      if (typeof d === 'string') editForm.installPath = d;
    };
    const pickEditData = async () => {
      const d = await open({ directory: true, multiple: false });
      if (typeof d === 'string') editForm.dataPath = d;
    };
    const pickEditBin = async () => {
      const f = await open({ directory: false, multiple: false });
      if (typeof f === 'string') editForm.binPath = f;
    };
    const pickEditConfig = async () => {
      const f = await open({ directory: false, multiple: false });
      if (typeof f === 'string') editForm.configPath = f;
    };

    // 输入框后置插槽图标（dir=true 文件夹，false 文件）
    const suffixSlot = (onClick: () => void, dir: boolean) => () => (
      <span
        onClick={onClick}
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: '#909399' }}
      >
        <ElIcon>{dir ? <FolderOpened /> : <Document />}</ElIcon>
      </span>
    );

    return () => (
      <div>
        <ElAlert
          title={`软件商店（P1） · 根目录 ${rootDir.value} · 初始化 ${initialized.value ? '是' : '否'}`}
          type="info"
          showIcon
          closable={false}
        />

        <h3 style={{ marginTop: '12px' }}>可安装</h3>
        <ElTable data={catalog.value}>
          <ElTableColumn prop="id" label="软件" width={120} />
          <ElTableColumn label="版本" width={180}>
            {{
              default: (scope: { row: SoftwareCatalog }) => (
                <ElSelect
                  modelValue={selOf(scope.row).version}
                  onChange={(v: string) => {
                    selOf(scope.row).version = v;
                  }}
                  size="small"
                >
                  {scope.row.versions.map((x) => (
                    <ElOption key={x.version} label={x.version} value={x.version} />
                  ))}
                </ElSelect>
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="模式" width={150}>
            {{
              default: (scope: { row: SoftwareCatalog }) => (
                <ElSelect
                  modelValue={selOf(scope.row).mode}
                  onChange={(m: RunMode) => {
                    selOf(scope.row).mode = m;
                  }}
                  size="small"
                >
                  <ElOption label="便携" value="Portable" />
                  <ElOption label="服务" value="Service" />
                </ElSelect>
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="操作" width={120}>
            {{
              default: (scope: { row: SoftwareCatalog }) => (
                <ElButton type="primary" size="small" onClick={() => doInstall(scope.row)}>
                  安装
                </ElButton>
              ),
            }}
          </ElTableColumn>
        </ElTable>

        <h3 style={{ marginTop: '12px' }}>
          已安装{' '}
          <ElButton size="small" type="success" onClick={() => (linkVisible.value = true)}>
            接入已安装
          </ElButton>
        </h3>
        <ElTable data={installed.value}>
          <ElTableColumn prop="provider" label="软件" width={120}>
            {{
              default: (scope: { row: InstalledSoftware }) => (
                <span>
                  {scope.row.provider}
                  {scope.row.linked ? (
                    <ElTag type="warning" size="small" style={{ marginLeft: '6px' }}>
                      接入
                    </ElTag>
                  ) : null}
                </span>
              ),
            }}
          </ElTableColumn>
          <ElTableColumn prop="version" label="版本" width={140} />
          <ElTableColumn prop="runMode" label="模式" width={100} />
          <ElTableColumn prop="port" label="端口" width={90} />
          <ElTableColumn label="操作" width={460}>
            {{
              default: (scope: { row: InstalledSoftware }) => (
                <span>
                  <ElButton size="small" onClick={() => act(scope.row.id, 'start')}>
                    启动
                  </ElButton>
                  <ElButton size="small" onClick={() => act(scope.row.id, 'restart')}>
                    重启
                  </ElButton>
                  <ElButton size="small" onClick={() => act(scope.row.id, 'stop')}>
                    停止
                  </ElButton>
                  <ElButton size="small" onClick={() => openConfig(scope.row)}>
                    配置
                  </ElButton>
                  <ElButton size="small" type="warning" onClick={() => openEdit(scope.row)}>
                    编辑
                  </ElButton>
                  <ElButton type="danger" size="small" onClick={() => rm(scope.row.id)}>
                    卸载
                  </ElButton>
                </span>
              ),
            }}
          </ElTableColumn>
        </ElTable>

        <div style={{ marginTop: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '14px' }}>操作日志</span>
            <ElButton
              size="small"
              text
              onClick={() => {
                opLogs.value = [];
              }}
            >
              清空
            </ElButton>
          </div>
          <pre
            style={{
              background: '#1e1e1e',
              color: '#d4d4d4',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontFamily: 'Consolas, Monaco, monospace',
              lineHeight: '1.8',
              maxHeight: '220px',
              overflow: 'auto',
              margin: '0',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {opLogs.value.join('\n') || '（暂无操作记录，点击 启动/重启/停止/卸载 后此处显示执行详情）'}
          </pre>
        </div>

        <h3 style={{ marginTop: '12px' }}>任务进度</h3>
        <ElTable data={tasks.value}>
          <ElTableColumn prop="target" label="目标" />
          <ElTableColumn prop="status" label="状态" width={120} />
          <ElTableColumn label="进度" width={220}>
            {{
              default: (scope: { row: { progress: number } }) => (
                <ElTag>{scope.row.progress}%</ElTag>
              ),
            }}
          </ElTableColumn>
          <ElTableColumn prop="message" label="消息" />
        </ElTable>

        <ElDialog
          title={`编辑配置 - ${cfg.name}`}
          modelValue={cfg.visible}
          onUpdate:modelValue={(v: boolean) => {
            cfg.visible = v;
          }}
          width="720px"
        >
          <ElInput
            type="textarea"
            modelValue={cfg.content}
            onInput={(v: string) => {
              cfg.content = v;
            }}
            rows={18}
            style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: '12px' }}
          />
          <div style={{ marginTop: '8px', textAlign: 'right' }}>
            <ElButton
              size="small"
              onClick={() =>
                readSoftwareConfig(cfg.id)
                  .then((c) => (cfg.content = c))
                  .catch((e) => (cfg.content = String(e)))
              }
            >
              重新载入
            </ElButton>
            <ElButton size="small" type="primary" onClick={saveConfig}>
              保存
            </ElButton>
          </div>
        </ElDialog>

        <ElDialog
          title="接入已安装"
          modelValue={linkVisible.value}
          onUpdate:modelValue={(v: boolean) => {
            linkVisible.value = v;
          }}
          width="640px"
        >
          <ElForm labelWidth="100">
            <ElFormItem label="类型">
              <ElSelect
                modelValue={linkForm.provider}
                onChange={(v: string) => {
                  linkForm.provider = v;
                }}
                size="small"
                style={{ width: '160px' }}
              >
                <ElOption label="MySQL" value="mysql" />
                <ElOption label="Redis" value="redis" />
                <ElOption label="PostgreSQL" value="postgres" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="安装目录">
              <ElInput
                modelValue={linkForm.installPath}
                onInput={(v: string) => {
                  linkForm.installPath = v;
                }}
                placeholder="点击右侧图标选择文件夹，或手动输入"
              >
                {{ suffix: suffixSlot(pickInstall, true) }}
              </ElInput>
            </ElFormItem>
            {linkForm.provider === 'postgres' ? (
              <ElFormItem label="数据目录">
                <ElInput
                  modelValue={linkForm.dataPath}
                  onInput={(v: string) => {
                    linkForm.dataPath = v;
                  }}
                  placeholder="PG data 目录，点击右侧图标选择"
                >
                  {{ suffix: suffixSlot(pickData, true) }}
                </ElInput>
              </ElFormItem>
            ) : null}
            <ElFormItem label="版本(可选)">
              <ElInput
                modelValue={linkForm.version}
                onInput={(v: string) => {
                  linkForm.version = v;
                }}
                placeholder="留空则记为 linked"
              />
            </ElFormItem>
            <ElFormItem label="可执行文件">
              <ElInput
                modelValue={linkForm.binPath}
                onInput={(v: string) => {
                  linkForm.binPath = v;
                }}
                placeholder="留空按默认推导（mysql: bin/mysqld.exe；redis: redis-server.exe；pg: bin/pg_ctl.exe）"
              >
                {{ suffix: suffixSlot(pickBin, false) }}
              </ElInput>
            </ElFormItem>
            <ElFormItem label="配置文件">
              <ElInput
                modelValue={linkForm.configPath}
                onInput={(v: string) => {
                  linkForm.configPath = v;
                }}
                placeholder="留空按默认推导（my.ini / redis.conf / postgresql.conf）"
              >
                {{ suffix: suffixSlot(pickConfig, false) }}
              </ElInput>
            </ElFormItem>
            <ElFormItem label="端口">
              <ElInput
                modelValue={linkForm.port}
                onInput={(v: string) => {
                  linkForm.port = v;
                }}
                placeholder="留空用默认（3306 / 6379）"
              />
            </ElFormItem>
            <ElFormItem label="模式">
              <ElSelect
                modelValue={linkForm.mode}
                onChange={(v: RunMode) => {
                  linkForm.mode = v;
                }}
                size="small"
                style={{ width: '140px' }}
              >
                <ElOption label="服务（推荐外部实例）" value="Service" />
                <ElOption label="便携进程" value="Portable" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="服务名">
              <ElInput
                modelValue={linkForm.serviceName}
                onInput={(v: string) => {
                  linkForm.serviceName = v;
                }}
                placeholder="服务模式必填，如 MySQL80 / Redis"
              />
            </ElFormItem>
          </ElForm>
          <div style={{ textAlign: 'right' }}>
            <ElButton size="small" type="primary" onClick={onLink}>
              接入
            </ElButton>
          </div>
        </ElDialog>

        <ElDialog
          title={`编辑 - ${editForm.provider}`}
          modelValue={editVisible.value}
          onUpdate:modelValue={(v: boolean) => {
            editVisible.value = v;
          }}
          width="640px"
        >
          <ElForm labelWidth="100">
            <ElFormItem label="版本">
              <ElInput
                modelValue={editForm.version}
                onInput={(v: string) => {
                  editForm.version = v;
                }}
              />
            </ElFormItem>
            <ElFormItem label="安装目录">
              <ElInput
                modelValue={editForm.installPath}
                onInput={(v: string) => {
                  editForm.installPath = v;
                }}
              >
                {{ suffix: suffixSlot(pickEditInstall, true) }}
              </ElInput>
            </ElFormItem>
            <ElFormItem label="可执行文件">
              <ElInput
                modelValue={editForm.binPath}
                onInput={(v: string) => {
                  editForm.binPath = v;
                }}
              >
                {{ suffix: suffixSlot(pickEditBin, false) }}
              </ElInput>
            </ElFormItem>
            <ElFormItem label="配置文件">
              <ElInput
                modelValue={editForm.configPath}
                onInput={(v: string) => {
                  editForm.configPath = v;
                }}
              >
                {{ suffix: suffixSlot(pickEditConfig, false) }}
              </ElInput>
            </ElFormItem>
            <ElFormItem label="数据目录">
              <ElInput
                modelValue={editForm.dataPath}
                onInput={(v: string) => {
                  editForm.dataPath = v;
                }}
                placeholder="PG data 目录等"
              >
                {{ suffix: suffixSlot(pickEditData, true) }}
              </ElInput>
            </ElFormItem>
            <ElFormItem label="端口">
              <ElInput
                modelValue={editForm.port}
                onInput={(v: string) => {
                  editForm.port = v;
                }}
              />
            </ElFormItem>
            <ElFormItem label="模式">
              <ElSelect
                modelValue={editForm.mode}
                onChange={(v: RunMode) => {
                  editForm.mode = v;
                }}
                size="small"
                style={{ width: '160px' }}
              >
                <ElOption label="服务" value="Service" />
                <ElOption label="便携进程" value="Portable" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="服务名">
              <ElInput
                modelValue={editForm.serviceName}
                onInput={(v: string) => {
                  editForm.serviceName = v;
                }}
                placeholder="服务模式必填"
              />
            </ElFormItem>
          </ElForm>
          <div style={{ textAlign: 'right' }}>
            <ElButton size="small" type="primary" onClick={onEdit}>
              保存
            </ElButton>
          </div>
        </ElDialog>
      </div>
    );
  },
});
