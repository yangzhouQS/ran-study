import { defineComponent, onMounted, onUnmounted, reactive, ref } from 'vue';
import {
  ElAlert,
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import { listen } from '@tauri-apps/api/event';
import {
  addCustomApp,
  deleteCustomApp,
  listCustomApps,
  startCustomApp,
  stopCustomApp,
} from '@/api/apps-api';
import type { CustomApp } from '@/types/api-type';

export default defineComponent({
  name: 'CustomApps',
  setup() {
    const list = ref<CustomApp[]>([]);
    const form = reactive({
      name: '',
      exe: '',
      args: '',
      cwd: '',
      serviceMode: false,
    });
    let un: (() => void) | null = null;

    const refresh = async () => {
      list.value = await listCustomApps();
    };
    onMounted(async () => {
      await refresh();
      un = await listen('apps://changed', refresh);
    });
    onUnmounted(() => un?.());

    const onAdd = async () => {
      if (!form.name || !form.exe) {
        ElMessage.warning('请填写名称与可执行文件路径');
        return;
      }
      await addCustomApp(form.name, form.exe, form.args, form.cwd, form.serviceMode);
      ElMessage.success('已添加');
      form.name = '';
      form.exe = '';
      form.args = '';
      form.cwd = '';
      form.serviceMode = false;
      await refresh();
    };
    const onStart = async (id: number) => {
      await startCustomApp(id);
      await refresh();
    };
    const onStop = async (id: number) => {
      await stopCustomApp(id);
      await refresh();
    };
    const onDelete = async (id: number) => {
      await deleteCustomApp(id);
      await refresh();
    };

    // OpenClaw 预填（Java 应用示例）
    const fillOpenclaw = () => {
      form.name = 'openclaw';
      form.exe = 'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe';
      form.args = '-jar D:\\ran\\apps\\openclaw\\openclaw.jar';
      form.cwd = 'D:\\ran\\apps\\openclaw';
      form.serviceMode = true;
    };

    return () => (
      <div>
        <ElAlert
          title="第三方应用 / 自定义应用"
          type="info"
          showIcon
          closable={false}
          description="通过指定可执行文件/参数/工作目录接入任意 Windows 原生程序（便携或服务模式）。OpenClaw 为 Java 应用，需先安装 JDK，再以 java -jar 方式登记。"
        />

        <h3 style={{ marginTop: '12px' }}>添加自定义应用</h3>
        <ElForm labelWidth="100" inline>
          <ElFormItem label="名称">
            <ElInput
              modelValue={form.name}
              onInput={(v: string) => {
                form.name = v;
              }}
              size="small"
              style={{ width: '130px' }}
            />
          </ElFormItem>
          <ElFormItem label="可执行文件">
            <ElInput
              modelValue={form.exe}
              onInput={(v: string) => {
                form.exe = v;
              }}
              size="small"
              style={{ width: '260px' }}
              placeholder="如 C:\...\java.exe"
            />
          </ElFormItem>
          <ElFormItem label="参数">
            <ElInput
              modelValue={form.args}
              onInput={(v: string) => {
                form.args = v;
              }}
              size="small"
              style={{ width: '220px' }}
              placeholder="-jar app.jar"
            />
          </ElFormItem>
          <ElFormItem label="工作目录">
            <ElInput
              modelValue={form.cwd}
              onInput={(v: string) => {
                form.cwd = v;
              }}
              size="small"
              style={{ width: '200px' }}
            />
          </ElFormItem>
          <ElFormItem label="服务模式">
            <ElSwitch
              modelValue={form.serviceMode}
              onChange={(v: unknown) => {
                form.serviceMode = Boolean(v);
              }}
            />
          </ElFormItem>
          <ElFormItem>
            <ElButton size="small" type="primary" onClick={onAdd}>
              添加
            </ElButton>
            <ElButton size="small" onClick={fillOpenclaw}>
              预填 OpenClaw
            </ElButton>
          </ElFormItem>
        </ElForm>

        <h3 style={{ marginTop: '12px' }}>已登记应用</h3>
        <ElTable data={list.value} emptyText="暂无自定义应用">
          <ElTableColumn prop="name" label="名称" width={140} />
          <ElTableColumn prop="exe" label="可执行文件" showOverflowTooltip />
          <ElTableColumn prop="args" label="参数" showOverflowTooltip />
          <ElTableColumn label="模式" width={100}>
            {{
              default: (scope: { row: CustomApp }) =>
                scope.row.serviceName ? <ElTag type="warning">服务</ElTag> : <ElTag>便携</ElTag>,
            }}
          </ElTableColumn>
          <ElTableColumn prop="status" label="状态" width={100} />
          <ElTableColumn label="操作" width={240}>
            {{
              default: (scope: { row: CustomApp }) => (
                <span>
                  <ElButton size="small" onClick={() => onStart(scope.row.id)}>
                    启动
                  </ElButton>
                  <ElButton size="small" onClick={() => onStop(scope.row.id)}>
                    停止
                  </ElButton>
                  <ElButton type="danger" size="small" onClick={() => onDelete(scope.row.id)}>
                    删除
                  </ElButton>
                </span>
              ),
            }}
          </ElTableColumn>
        </ElTable>
      </div>
    );
  },
});
