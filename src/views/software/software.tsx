import { defineComponent, onMounted, reactive, ref } from 'vue';
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import {
  controlSoftware,
  installSoftware,
  linkSoftware,
  listCatalog,
  readSoftwareConfig,
  uninstallSoftware,
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
    const act = async (id: number, a: 'start' | 'stop') => {
      await controlSoftware(id, a);
      await refresh();
    };
    const rm = async (id: number) => {
      await uninstallSoftware(id);
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
          <ElTableColumn label="操作" width={320}>
            {{
              default: (scope: { row: InstalledSoftware }) => (
                <span>
                  <ElButton size="small" onClick={() => act(scope.row.id, 'start')}>
                    启动
                  </ElButton>
                  <ElButton size="small" onClick={() => act(scope.row.id, 'stop')}>
                    停止
                  </ElButton>
                  <ElButton size="small" onClick={() => openConfig(scope.row)}>
                    配置
                  </ElButton>
                  <ElButton type="danger" size="small" onClick={() => rm(scope.row.id)}>
                    卸载
                  </ElButton>
                </span>
              ),
            }}
          </ElTableColumn>
        </ElTable>

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
              <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                <ElInput
                  modelValue={linkForm.installPath}
                  onInput={(v: string) => {
                    linkForm.installPath = v;
                  }}
                  placeholder="点击右侧选择文件夹，或手动输入"
                />
                <ElButton size="small" onClick={pickInstall}>
                  选择
                </ElButton>
              </div>
            </ElFormItem>
            {linkForm.provider === 'postgres' ? (
              <ElFormItem label="数据目录">
                <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                  <ElInput
                    modelValue={linkForm.dataPath}
                    onInput={(v: string) => {
                      linkForm.dataPath = v;
                    }}
                    placeholder="PG data 目录，点击右侧选择"
                  />
                  <ElButton size="small" onClick={pickData}>
                    选择
                  </ElButton>
                </div>
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
              <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                <ElInput
                  modelValue={linkForm.binPath}
                  onInput={(v: string) => {
                    linkForm.binPath = v;
                  }}
                  placeholder="留空按默认推导（mysql: bin/mysqld.exe；redis: redis-server.exe；pg: bin/pg_ctl.exe）"
                />
                <ElButton size="small" onClick={pickBin}>
                  选择
                </ElButton>
              </div>
            </ElFormItem>
            <ElFormItem label="配置文件">
              <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                <ElInput
                  modelValue={linkForm.configPath}
                  onInput={(v: string) => {
                    linkForm.configPath = v;
                  }}
                  placeholder="留空按默认推导（my.ini / redis.conf / postgresql.conf）"
                />
                <ElButton size="small" onClick={pickConfig}>
                  选择
                </ElButton>
              </div>
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
      </div>
    );
  },
});
