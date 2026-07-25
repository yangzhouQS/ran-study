import { defineComponent, onMounted, ref } from 'vue';
import { ElAlert } from 'element-plus';
import { getSystemInfo } from '@/api/system-api';
import { useAppStore } from '@/store/app-store';

export default defineComponent({
  name: 'Software',
  setup() {
    const initialized = ref(false);
    const rootDir = ref('');
    const store = useAppStore();

    onMounted(async () => {
      const info = await getSystemInfo();
      rootDir.value = info.rootDir;
      initialized.value = info.initialized;
      store.setRootDir(info.rootDir);
    });

    return () => (
      <div>
        <ElAlert
          title="P0 基座：软件商店与 provider 将在 P1 接入"
          type="info"
          showIcon
          closable={false}
        />
        <p>根目录：{rootDir.value}</p>
        <p>已初始化：{initialized.value ? '是' : '否'}</p>
      </div>
    );
  },
});
