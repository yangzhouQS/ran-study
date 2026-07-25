import { defineComponent } from 'vue';
import { ElButton, ElTable, ElTableColumn, ElProgress } from 'element-plus';
import { useTaskStream } from '@/composables/use-task-stream';
import { createDemoTask } from '@/api/task-api';
import type { Task } from '@/types/api-type';

export default defineComponent({
  name: 'TaskQueue',
  setup() {
    const { tasks } = useTaskStream();
    const runDemo = () => createDemoTask('demo-target');

    return () => (
      <div>
        <ElButton type="primary" onClick={runDemo}>
          创建演示任务
        </ElButton>
        <ElTable data={tasks.value} style={{ marginTop: '12px' }}>
          <ElTableColumn prop="target" label="目标" />
          <ElTableColumn prop="status" label="状态" width={120} />
          <ElTableColumn label="进度" width={220}>
            {{
              default: (scope: { row: Task }) => (
                <ElProgress percentage={scope.row.progress} />
              ),
            }}
          </ElTableColumn>
          <ElTableColumn prop="message" label="消息" />
        </ElTable>
      </div>
    );
  },
});
