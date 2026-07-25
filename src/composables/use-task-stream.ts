import { listen } from '@tauri-apps/api/event';
import { onMounted, onUnmounted, ref } from 'vue';
import { listTasks } from '@/api/task-api';
import type { Task } from '@/types/api-type';

export function useTaskStream() {
  const tasks = ref<Task[]>([]);
  let unlisten: (() => void) | null = null;

  const refresh = async () => {
    tasks.value = await listTasks();
  };

  onMounted(async () => {
    await refresh();
    unlisten = await listen<Task | null>('task://progress', (e) => {
      const payload = e.payload;
      if (!payload) return;
      const idx = tasks.value.findIndex((t) => t.id === payload.id);
      if (idx >= 0) tasks.value[idx] = payload;
      else tasks.value.push(payload);
    });
  });

  onUnmounted(() => unlisten?.());

  return { tasks, refresh };
}
