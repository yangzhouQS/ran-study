import { defineComponent, onMounted, ref } from 'vue';
import {
  ElAlert,
  ElButton,
  ElMessage,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import {
  installNode,
  knownNodeVersions,
  nodeProvisioned,
  nodeVersionsLocal,
  provisionNvm,
  uninstallNode,
  useNode,
} from '@/api/node-api';
import type { NodeVersion } from '@/types/api-type';

export default defineComponent({
  name: 'NodeVersion',
  setup() {
    const provisioned = ref(false);
    const known = ref<string[]>([]);
    const local = ref<NodeVersion[]>([]);

    const refresh = async () => {
      provisioned.value = await nodeProvisioned();
      known.value = await knownNodeVersions();
      if (provisioned.value) {
        try {
          local.value = await nodeVersionsLocal();
        } catch {
          local.value = [];
        }
      }
    };
    onMounted(refresh);

    const doProvision = async () => {
      await provisionNvm();
      await refresh();
      ElMessage.success('nvm 置备完成');
    };
    const doInstall = async (v: string) => {
      await installNode(v);
      await refresh();
    };
    const doUse = async (v: string) => {
      await useNode(v);
      await refresh();
    };
    const doUninstall = async (v: string) => {
      await uninstallNode(v);
      await refresh();
    };

    return () => (
      <div>
        {provisioned.value ? (
          <ElAlert title="nvm-windows 已就绪" type="success" showIcon closable={false} />
        ) : (
          <div>
            <ElAlert title="尚未置备 nvm-windows（绿色版）" type="warning" showIcon closable={false} />
            <ElButton type="primary" size="small" style={{ marginTop: '8px' }} onClick={doProvision}>
              置备 nvm
            </ElButton>
          </div>
        )}

        <h3 style={{ marginTop: '12px' }}>本地版本</h3>
        <ElTable data={local.value}>
          <ElTableColumn prop="version" label="版本" width={160} />
          <ElTableColumn label="状态" width={140}>
            {{
              default: (scope: { row: NodeVersion }) =>
                scope.row.active ? (
                  <ElTag type="success">激活</ElTag>
                ) : (
                  <ElTag>未激活</ElTag>
                ),
            }}
          </ElTableColumn>
          <ElTableColumn label="操作" width={220}>
            {{
              default: (scope: { row: NodeVersion }) => (
                <span>
                  <ElButton
                    size="small"
                    disabled={scope.row.active}
                    onClick={() => doUse(scope.row.version)}
                  >
                    切换
                  </ElButton>
                  <ElButton
                    type="danger"
                    size="small"
                    onClick={() => doUninstall(scope.row.version)}
                  >
                    卸载
                  </ElButton>
                </span>
              ),
            }}
          </ElTableColumn>
        </ElTable>

        <h3 style={{ marginTop: '12px' }}>可安装（LTS）</h3>
        <ElTable data={known.value.map((v) => ({ version: v }))}>
          <ElTableColumn prop="version" label="版本" width={160} />
          <ElTableColumn label="操作" width={140}>
            {{
              default: (scope: { row: { version: string } }) => (
                <ElButton type="primary" size="small" onClick={() => doInstall(scope.row.version)}>
                  安装
                </ElButton>
              ),
            }}
          </ElTableColumn>
        </ElTable>
      </div>
    );
  },
});
