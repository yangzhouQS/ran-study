import { defineComponent, onMounted, reactive, ref, watch } from 'vue';
import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
} from 'element-plus';
import { listInstalled } from '@/api/software-api';
import {
  backupMysql,
  changeRootPassword,
  createMysqlDatabase,
  importMysql,
  listMysqlDatabases,
  runMysqlQuery,
} from '@/api/dbadmin-api';
import type { InstalledSoftware } from '@/types/api-type';

export default defineComponent({
  name: 'Database',
  setup() {
    const instances = ref<InstalledSoftware[]>([]);
    const selectedId = ref<number | null>(null);
    const databases = ref<string[]>([]);
    const importSrc: Record<string, string> = {};
    const sqlForm = reactive({ sql: 'SHOW DATABASES;', output: '' });
    const rootPw = reactive({ value: '' });
    const createForm = reactive({ name: '', password: '' });

    const loadDatabases = async () => {
      if (selectedId.value == null) {
        databases.value = [];
        return;
      }
      try {
        databases.value = await listMysqlDatabases(selectedId.value);
      } catch {
        databases.value = [];
      }
    };

    onMounted(async () => {
      const all = await listInstalled();
      instances.value = all.filter((s) => s.provider === 'mysql');
      if (instances.value.length > 0) {
        selectedId.value = instances.value[0].id;
        await loadDatabases();
      }
    });

    watch(selectedId, loadDatabases);

    const onChangePw = async () => {
      if (selectedId.value == null || !rootPw.value) {
        ElMessage.warning('请输入新密码并选择实例');
        return;
      }
      await changeRootPassword(selectedId.value, rootPw.value);
      ElMessage.success('root 密码已修改');
      rootPw.value = '';
      await loadDatabases();
    };

    const onCreate = async () => {
      if (selectedId.value == null || !createForm.name) {
        ElMessage.warning('请填写库名并选择实例');
        return;
      }
      await createMysqlDatabase(
        selectedId.value,
        createForm.name,
        createForm.password || null,
      );
      ElMessage.success(`已创建库 ${createForm.name}`);
      createForm.name = '';
      createForm.password = '';
      await loadDatabases();
    };

    const onBackup = async (db: string) => {
      if (selectedId.value == null) return;
      const path = await backupMysql(selectedId.value, db);
      ElMessage.success(`已备份到：${path}`);
    };

    const onImport = async (db: string) => {
      if (selectedId.value == null) return;
      const src = importSrc[db];
      if (!src) {
        ElMessage.warning('请填写 .sql 路径');
        return;
      }
      await importMysql(selectedId.value, db, src);
      ElMessage.success(`已导入 ${src}`);
    };

    const onRunSql = async () => {
      if (selectedId.value == null) return;
      try {
        sqlForm.output = await runMysqlQuery(selectedId.value, sqlForm.sql);
      } catch (e) {
        sqlForm.output = String(e);
      }
    };

    return () => (
      <div>
        <ElForm labelWidth="80" inline style={{ marginBottom: '8px' }}>
          <ElFormItem label="实例">
            <ElSelect
              modelValue={selectedId.value}
              onChange={(v: number) => {
                selectedId.value = v;
              }}
              placeholder="选择 MySQL 实例"
              size="small"
              style={{ width: '220px' }}
            >
              {instances.value.map((i) => (
                <ElOption key={i.id} label={`${i.version} (#${i.id})`} value={i.id} />
              ))}
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="新root密码">
            <ElInput
              modelValue={rootPw.value}
              onInput={(v: string) => {
                rootPw.value = v;
              }}
              size="small"
              style={{ width: '180px' }}
            />
          </ElFormItem>
          <ElFormItem>
            <ElButton size="small" type="primary" onClick={onChangePw}>
              改密码
            </ElButton>
          </ElFormItem>
        </ElForm>

        <ElForm labelWidth="70" inline style={{ marginBottom: '8px' }}>
          <ElFormItem label="库名">
            <ElInput
              modelValue={createForm.name}
              onInput={(v: string) => {
                createForm.name = v;
              }}
              size="small"
              style={{ width: '160px' }}
            />
          </ElFormItem>
          <ElFormItem label="库密码">
            <ElInput
              modelValue={createForm.password}
              onInput={(v: string) => {
                createForm.password = v;
              }}
              placeholder="留空=不建用户"
              size="small"
              style={{ width: '160px' }}
            />
          </ElFormItem>
          <ElFormItem>
            <ElButton size="small" type="primary" onClick={onCreate}>
              建库
            </ElButton>
          </ElFormItem>
        </ElForm>

        <h3>数据库</h3>
        <ElTable data={databases.value.map((d) => ({ name: d }))}>
          <ElTableColumn prop="name" label="库名" />
          <ElTableColumn label="备份" width={120}>
            {{
              default: (scope: { row: { name: string } }) => (
                <ElButton size="small" onClick={() => onBackup(scope.row.name)}>
                  备份
                </ElButton>
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="导入 .sql" width={320}>
            {{
              default: (scope: { row: { name: string } }) => (
                <span>
                  <ElInput
                    modelValue={importSrc[scope.row.name] || ''}
                    onInput={(v: string) => {
                      importSrc[scope.row.name] = v;
                    }}
                    placeholder="D:\path\to\file.sql"
                    size="small"
                    style={{ width: '200px' }}
                  />
                  <ElButton size="small" style={{ marginLeft: '4px' }} onClick={() => onImport(scope.row.name)}>
                    导入
                  </ElButton>
                </span>
              ),
            }}
          </ElTableColumn>
        </ElTable>

        <h3 style={{ marginTop: '12px' }}>执行 SQL</h3>
        <ElInput
          type="textarea"
          modelValue={sqlForm.sql}
          onInput={(v: string) => {
            sqlForm.sql = v;
          }}
          rows={3}
        />
        <ElButton size="small" type="primary" style={{ marginTop: '8px' }} onClick={onRunSql}>
          运行
        </ElButton>
        <pre
          style={{
            marginTop: '8px',
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: '8px',
            maxHeight: '300px',
            overflow: 'auto',
          }}
        >
          {sqlForm.output}
        </pre>
      </div>
    );
  },
});
