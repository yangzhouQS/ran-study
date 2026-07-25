import { defineComponent, onMounted, ref } from 'vue';
import { ElButton, ElInput, ElTable, ElTableColumn, ElTag } from 'element-plus';
import {
  controlService,
  killProcess,
  listProcesses,
  listServices,
} from '@/api/sysproc-api';
import type { ProcInfo, SvcInfo } from '@/types/api-type';

export default defineComponent({
  name: 'ProcessService',
  setup() {
    const tab = ref<'processes' | 'services'>('processes');
    const procs = ref<ProcInfo[]>([]);
    const svcs = ref<SvcInfo[]>([]);
    const kw = ref('');

    const refresh = async () => {
      if (tab.value === 'processes') procs.value = await listProcesses();
      else svcs.value = await listServices();
    };
    onMounted(refresh);

    const switchTab = async (t: 'processes' | 'services') => {
      tab.value = t;
      await refresh();
    };
    const kill = async (pid: number) => {
      await killProcess(pid);
      await refresh();
    };
    const svc = async (name: string, action: 'start' | 'stop') => {
      await controlService(name, action);
      await refresh();
    };

    const filteredProcs = () =>
      procs.value.filter(
        (p) =>
          !kw.value ||
          p.name.includes(kw.value) ||
          String(p.pid).includes(kw.value),
      );
    const filteredSvcs = () =>
      svcs.value.filter(
        (s) => !kw.value || s.name.includes(kw.value) || s.display.includes(kw.value),
      );

    return () => (
      <div>
        <div style={{ marginBottom: '8px' }}>
          <ElButton
            size="small"
            type={tab.value === 'processes' ? 'primary' : 'default'}
            onClick={() => switchTab('processes')}
          >
            进程
          </ElButton>
          <ElButton
            size="small"
            type={tab.value === 'services' ? 'primary' : 'default'}
            onClick={() => switchTab('services')}
          >
            服务
          </ElButton>
          <ElButton size="small" onClick={refresh}>
            刷新
          </ElButton>
          <ElInput
            modelValue={kw.value}
            onInput={(v: string) => {
              kw.value = v;
            }}
            placeholder="筛选"
            size="small"
            style={{ width: '200px', marginLeft: '8px' }}
          />
        </div>
        {tab.value === 'processes' ? (
          <ElTable data={filteredProcs()} height="600">
            <ElTableColumn prop="pid" label="PID" width={90} />
            <ElTableColumn prop="name" label="名称" width={180} />
            <ElTableColumn prop="cpu" label="CPU%" width={90} />
            <ElTableColumn prop="memory" label="内存(KB)" width={120} />
            <ElTableColumn prop="user" label="用户" width={140} />
            <ElTableColumn prop="command" label="命令" />
            <ElTableColumn label="操作" width={100}>
              {{
                default: (scope: { row: ProcInfo }) => (
                  <ElButton type="danger" size="small" onClick={() => kill(scope.row.pid)}>
                    结束
                  </ElButton>
                ),
              }}
            </ElTableColumn>
          </ElTable>
        ) : (
          <ElTable data={filteredSvcs()} height="600">
            <ElTableColumn prop="name" label="服务名" width={220} />
            <ElTableColumn label="状态" width={120}>
              {{
                default: (scope: { row: SvcInfo }) =>
                  scope.row.state === 'running' ? (
                    <ElTag type="success">运行</ElTag>
                  ) : (
                    <ElTag>停止</ElTag>
                  ),
              }}
            </ElTableColumn>
            <ElTableColumn prop="display" label="显示名" />
            <ElTableColumn label="操作" width={180}>
              {{
                default: (scope: { row: SvcInfo }) => (
                  <span>
                    <ElButton size="small" onClick={() => svc(scope.row.name, 'start')}>
                      启动
                    </ElButton>
                    <ElButton size="small" onClick={() => svc(scope.row.name, 'stop')}>
                      停止
                    </ElButton>
                  </span>
                ),
              }}
            </ElTableColumn>
          </ElTable>
        )}
      </div>
    );
  },
});
