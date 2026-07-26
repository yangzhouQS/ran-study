import { defineComponent, onMounted, reactive, ref } from 'vue';
import {
  ElButton,
  ElCard,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
} from 'element-plus';
import { getSettings, getSystemInfo, setRootDir, updateSettings } from '@/api/system-api';

export default defineComponent({
  name: 'Settings',
  setup() {
    const rootDir = ref('');
    const initialized = ref(false);
    const form = reactive({ mirror: '', proxy: '' });
    const rootInput = ref('');

    const refresh = async () => {
      const info = await getSystemInfo();
      rootDir.value = info.rootDir;
      initialized.value = info.initialized;
      rootInput.value = info.rootDir;
      const s = await getSettings();
      form.mirror = s.mirror;
      form.proxy = s.proxy;
    };
    onMounted(refresh);

    const onSaveRoot = async () => {
      if (!rootInput.value) {
        ElMessage.warning('请填写根目录');
        return;
      }
      await setRootDir(rootInput.value);
      ElMessage.success('根目录已设置（重启应用后生效）');
    };
    const onSave = async () => {
      await updateSettings(form.mirror, form.proxy);
      ElMessage.success('设置已保存');
    };

    return () => (
      <div style={{ maxWidth: '640px' }}>
        <ElCard header="根目录" shadow="never" style={{ marginBottom: '12px' }}>
          <ElForm labelWidth="100">
            <ElFormItem label="当前根目录">
              <span>{rootDir.value} {initialized.value ? '' : '（未初始化）'}</span>
            </ElFormItem>
            <ElFormItem label="切换根目录">
              <ElInput
                modelValue={rootInput.value}
                onInput={(v: string) => {
                  rootInput.value = v;
                }}
                placeholder="如 D:\ran"
              />
            </ElFormItem>
            <ElFormItem>
              <ElButton type="primary" onClick={onSaveRoot}>
                保存（重启生效）
              </ElButton>
            </ElFormItem>
          </ElForm>
        </ElCard>

        <ElCard header="下载与网络" shadow="never">
          <ElForm labelWidth="100">
            <ElFormItem label="镜像源">
              <ElSelect
                modelValue={form.mirror}
                onChange={(v: string) => {
                  form.mirror = v;
                }}
                size="small"
                style={{ width: '220px' }}
              >
                <ElOption label="官方源（默认）" value="" />
                <ElOption label="清华 TUNA（MySQL）" value="tuna" />
                <ElOption label="华为云（MySQL）" value="huawei" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="HTTP 代理">
              <ElInput
                modelValue={form.proxy}
                onInput={(v: string) => {
                  form.proxy = v;
                }}
                placeholder="如 http://127.0.0.1:7890（留空则不使用）"
              />
            </ElFormItem>
            <ElFormItem>
              <ElButton type="primary" onClick={onSave}>
                保存设置
              </ElButton>
            </ElFormItem>
          </ElForm>
        </ElCard>
      </div>
    );
  },
});
