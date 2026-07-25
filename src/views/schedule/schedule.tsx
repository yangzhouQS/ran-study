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
  listScheduled,
  runScheduled,
  toggleScheduled,
} from '@/api/schedule-api';
import type { ScheduledTask } from '@/types/api-type';

export default defineComponent({
  name: 'Schedule',
  setup() {
    const list = ref<ScheduledTask[]>([]);
    const form = reactive({ name: '', command: '', trigger: 'daily' });

    const refresh = async () => {
      list.value = await listScheduled();
    };
    onMounted(refresh);

    const add = async () => {
      if (!form.name || !form.command) {
        ElMessage.warning('请填写名称与命令');
        return;
      }
      await createScheduled({
        name: form.name,
        command: form.command,
        trigger: form.trigger,
      });
      ElMessage.success('已创建');
      form.name = '';
      form.command = '';
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

    return () => (
      <div>
        <ElForm labelWidth="70" inline style={{ marginBottom: '8px' }}>
          <ElFormItem label="名称">
            <ElInput
              modelValue={form.name}
              onInput={(v: string) => {
                form.name = v;
              }}
            />
          </ElFormItem>
          <ElFormItem label="命令">
            <ElInput
              modelValue={form.command}
              onInput={(v: string) => {
                form.command = v;
              }}
              placeholder='如 "D:\ran\tools\run.bat"'
            />
          </ElFormItem>
          <ElFormItem label="周期">
            <ElSelect
              modelValue={form.trigger}
              onChange={(v: string) => {
                form.trigger = v;
              }}
              size="small"
            >
              <ElOption label="登录时" value="onlogon" />
              <ElOption label="每天" value="daily" />
              <ElOption label="每周" value="weekly" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem>
            <ElButton type="primary" onClick={add}>
              创建
            </ElButton>
          </ElFormItem>
        </ElForm>

        <ElTable data={list.value}>
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
                  <ElButton size="small" onClick={() => run(scope.row.name)}>
                    运行
                  </ElButton>
                  <ElButton
                    type="danger"
                    size="small"
                    onClick={() => del(scope.row.id, scope.row.name)}
                  >
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
