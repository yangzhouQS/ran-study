import { defineComponent, onMounted, ref } from 'vue';
import {
  ElAlert,
  ElButton,
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
  listCatalog,
  uninstallSoftware,
} from '@/api/software-api';
import { getSystemInfo } from '@/api/system-api';
import { useInstalled } from '@/composables/use-installed';
import { useTaskStream } from '@/composables/use-task-stream';
import { useAppStore } from '@/store/app-store';
import type { RunMode, SoftwareCatalog } from '@/types/api-type';

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

        <h3 style={{ marginTop: '12px' }}>已安装</h3>
        <ElTable data={installed.value}>
          <ElTableColumn prop="provider" label="软件" width={120} />
          <ElTableColumn prop="version" label="版本" width={140} />
          <ElTableColumn prop="runMode" label="模式" width={100} />
          <ElTableColumn prop="port" label="端口" width={90} />
          <ElTableColumn label="操作" width={260}>
            {{
              default: (scope: { row: { id: number } }) => (
                <span>
                  <ElButton size="small" onClick={() => act(scope.row.id, 'start')}>
                    启动
                  </ElButton>
                  <ElButton size="small" onClick={() => act(scope.row.id, 'stop')}>
                    停止
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
      </div>
    );
  },
});
