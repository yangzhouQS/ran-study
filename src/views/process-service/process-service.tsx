import { defineComponent, onMounted, ref } from 'vue';
import {
  ElButton,
  ElCard,
  ElInput,
  ElRadioButton,
  ElRadioGroup,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import {
  controlService,
  killProcess,
  listPorts,
  listProcesses,
  listServices,
} from '@/api/sysproc-api';
import type { PortInfo, ProcInfo, SvcInfo } from '@/types/api-type';

const PROTECTED_PROC = new Set([
  'ran-study', 'ran_study', 'ran-sidecar', 'csrss', 'lsass', 'smss',
  'wininit', 'winlogon', 'services', 'system', 'registry', 'fontdrvhost', 'dwm',
]);
const PROTECTED_SVC = new Set([
  'audiosrv', 'audioendpointbuilder', 'bits', 'cryptsvc', 'dcomlaunch', 'dhcp',
  'dnscache', 'eventlog', 'eventsystem', 'lsm', 'lanmanserver', 'lanmanworkstation',
  'netman', 'plugplay', 'power', 'profsvc', 'rpceptmapper', 'rpcss', 'samss',
  'schedule', 'sens', 'spooler', 'systemeventsbroker', 'usermanager', 'winmgmt', 'wuauserv',
]);
const procProtected = (n: string) => PROTECTED_PROC.has(n.replace(/\.exe$/i, '').toLowerCase());
const svcProtected = (n: string) => PROTECTED_SVC.has(n.toLowerCase());

type Tab = 'processes' | 'services' | 'ports';

export default defineComponent({
  name: 'ProcessService',
  setup() {
    const tab = ref<Tab>('processes');
    const procs = ref<ProcInfo[]>([]);
    const svcs = ref<SvcInfo[]>([]);
    const ports = ref<PortInfo[]>([]);
    const kw = ref('');

    const refresh = async () => {
      if (tab.value === 'processes') procs.value = await listProcesses();
      else if (tab.value === 'services') svcs.value = await listServices();
      else ports.value = await listPorts();
    };
    onMounted(refresh);

    const onTab = async (v: Tab) => {
      tab.value = v;
      await refresh();
    };
    const kill = async (p: { pid: number; name: string }) => {
      await killProcess(p.pid, p.name);
      await refresh();
    };
    const svc = async (name: string, action: 'start' | 'stop') => {
      await controlService(name, action);
      await refresh();
    };

    const filteredProcs = () =>
      procs.value.filter(
        (p) => !kw.value || p.name.includes(kw.value) || String(p.pid).includes(kw.value),
      );
    const filteredSvcs = () =>
      svcs.value.filter(
        (s) => !kw.value || s.name.includes(kw.value) || s.display.includes(kw.value),
      );
    const filteredPorts = () =>
      ports.value.filter(
        (p) =>
          !kw.value ||
          String(p.port).includes(kw.value) ||
          p.name.includes(kw.value) ||
          String(p.pid).includes(kw.value),
      );

    return () => (
      <div>
        <ElCard shadow="never" bodyStyle={{ padding: '12px' }} style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ElRadioGroup
              modelValue={tab.value}
              onUpdate:modelValue={(v: string | number | boolean | undefined) =>
                onTab(v as Tab)
              }
              size="small"
            >
              <ElRadioButton value="processes">进程</ElRadioButton>
              <ElRadioButton value="services">服务</ElRadioButton>
              <ElRadioButton value="ports">端口</ElRadioButton>
            </ElRadioGroup>
            <ElInput
              modelValue={kw.value}
              onInput={(v: string) => {
                kw.value = v;
              }}
              placeholder="搜索 名称 / PID / 端口"
              size="small"
              clearable
              style={{ width: '260px' }}
            />
            <ElButton size="small" onClick={refresh}>
              刷新
            </ElButton>
          </div>
        </ElCard>

        <ElCard shadow="never" bodyStyle={{ padding: '0' }}>
          {tab.value === 'processes' ? (
            <ElTable data={filteredProcs()} height="600" emptyText="无进程">
              <ElTableColumn prop="pid" label="PID" width={90} />
              <ElTableColumn label="名称" width={200}>
                {{
                  default: (scope: { row: ProcInfo }) => (
                    <span>
                      {scope.row.name}
                      {procProtected(scope.row.name) ? (
                        <ElTag type="danger" size="small" style={{ marginLeft: '6px' }}>
                          保护
                        </ElTag>
                      ) : null}
                    </span>
                  ),
                }}
              </ElTableColumn>
              <ElTableColumn prop="cpu" label="CPU%" width={90} sortable />
              <ElTableColumn prop="memory" label="内存(KB)" width={120} sortable />
              <ElTableColumn prop="user" label="用户" width={140} />
              <ElTableColumn prop="command" label="命令" showOverflowTooltip />
              <ElTableColumn label="操作" width={100} fixed="right">
                {{
                  default: (scope: { row: ProcInfo }) => (
                    <ElButton
                      type="danger"
                      size="small"
                      disabled={procProtected(scope.row.name)}
                      onClick={() => kill(scope.row)}
                    >
                      结束
                    </ElButton>
                  ),
                }}
              </ElTableColumn>
            </ElTable>
          ) : null}

          {tab.value === 'services' ? (
            <ElTable data={filteredSvcs()} height="600" emptyText="无服务">
              <ElTableColumn label="服务名" width={220}>
                {{
                  default: (scope: { row: SvcInfo }) => (
                    <span>
                      {scope.row.name}
                      {svcProtected(scope.row.name) ? (
                        <ElTag type="danger" size="small" style={{ marginLeft: '6px' }}>
                          保护
                        </ElTag>
                      ) : null}
                    </span>
                  ),
                }}
              </ElTableColumn>
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
              <ElTableColumn prop="display" label="显示名" showOverflowTooltip />
              <ElTableColumn label="操作" width={180} fixed="right">
                {{
                  default: (scope: { row: SvcInfo }) => (
                    <span>
                      <ElButton
                        size="small"
                        disabled={svcProtected(scope.row.name)}
                        onClick={() => svc(scope.row.name, 'start')}
                      >
                        启动
                      </ElButton>
                      <ElButton
                        size="small"
                        disabled={svcProtected(scope.row.name)}
                        onClick={() => svc(scope.row.name, 'stop')}
                      >
                        停止
                      </ElButton>
                    </span>
                  ),
                }}
              </ElTableColumn>
            </ElTable>
          ) : null}

          {tab.value === 'ports' ? (
            <ElTable data={filteredPorts()} height="600" emptyText="无监听端口">
              <ElTableColumn prop="port" label="端口" width={110} sortable />
              <ElTableColumn prop="address" label="监听地址" width={180} />
              <ElTableColumn label="进程">
                {{
                  default: (scope: { row: PortInfo }) => (
                    <span>
                      {scope.row.name || '(未知)'}
                      {procProtected(scope.row.name) ? (
                        <ElTag type="danger" size="small" style={{ marginLeft: '6px' }}>
                          保护
                        </ElTag>
                      ) : null}
                    </span>
                  ),
                }}
              </ElTableColumn>
              <ElTableColumn prop="pid" label="PID" width={100} />
              <ElTableColumn label="操作" width={100} fixed="right">
                {{
                  default: (scope: { row: PortInfo }) => (
                    <ElButton
                      type="danger"
                      size="small"
                      disabled={procProtected(scope.row.name)}
                      onClick={() => kill(scope.row)}
                    >
                      杀掉
                    </ElButton>
                  ),
                }}
              </ElTableColumn>
            </ElTable>
          ) : null}
        </ElCard>
      </div>
    );
  },
});
