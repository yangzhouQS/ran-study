import { listen } from '@tauri-apps/api/event';
import { onMounted, onUnmounted, ref } from 'vue';
import { listInstalled } from '@/api/software-api';
import type { InstalledSoftware } from '@/types/api-type';

export function useInstalled() {
  const list = ref<InstalledSoftware[]>([]);
  let un: (() => void) | null = null;

  const refresh = async () => {
    list.value = await listInstalled();
  };

  onMounted(async () => {
    await refresh();
    un = await listen('software://changed', refresh);
  });

  onUnmounted(() => un?.());

  return { list, refresh };
}
