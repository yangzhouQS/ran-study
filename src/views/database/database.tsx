import { defineComponent, onMounted, reactive, ref, watch } from 'vue';
import {
  ElButton,
  ElCard,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import { listInstalled } from '@/api/software-api';
import {
  backupMysql,
  changeRootPassword,
  createMysqlDatabase,
  importMysql,
  listMysqlDatabases,
  runMysqlQuery,
  testMysqlConnection,
} from '@/api/dbadmin-api';
import {
  backupPg,
  changePgPassword,
  createPgDatabase,
  importPg,
  listPgDatabases,
  runPgQuery,
  testPgConnection,
} from '@/api/pg-api';
import {
  redisAddKey,
  redisChangePassword,
  redisDelKey,
  redisGetKey,
  redisListKeys,
  redisRun,
} from '@/api/redis-api';
import type { InstalledSoftware } from '@/types/api-type';
import MonacoEditor from '@/components/monaco-editor/monaco-editor';

const SENSITIVE_HINT = '（已保存，输入新密码覆盖）';

export default defineComponent({
  name: 'Database',
  setup() {
    const instances = ref<InstalledSoftware[]>([]);
    const selectedId = ref<number | null>(null);
    const selected = ref<InstalledSoftware | null>(null);

    // Connection
    const password = ref('');
    const hasSavedPw = ref(false);
    const connStatus = ref<'idle' | 'testing' | 'ok' | 'fail'>('idle');

    // Data
    const databases = ref<string[]>([]);
    const keys = ref<string[]>([]);

    // SQL
    const sqlText = ref('SHOW DATABASES;');
    const sqlOutput = ref('');

    // Dialogs
    const createDbVisible = ref(false);
    const createDbForm = reactive({ name: '', user: '', userPw: '' });
    const changePwVisible = ref(false);
    const changePwForm = reactive({ newPassword: '' });
    const redisCli = reactive({ input: 'PING', output: '' });
    const getKey = reactive({ key: '', value: '' });
    const importSrc: Record<string, string> = {};

    const isMysql = () => selected.value?.provider === 'mysql';
    const isPostgres = () => selected.value?.provider === 'postgres';
    const isRedis = () => selected.value?.provider === 'redis';
    const isRelational = () => isMysql() || isPostgres();

    onMounted(async () => {
      const all = await listInstalled();
      instances.value = all.filter(
        (s) => ['mysql', 'redis', 'postgres'].includes(s.provider),
      );
      if (instances.value.length > 0) {
        selectedId.value = instances.value[0].id;
        selected.value = instances.value[0];
      }
    });

    watch(selectedId, (id) => {
      selected.value = instances.value.find((i) => i.id === id) ?? null;
      connStatus.value = 'idle';
      databases.value = [];
      keys.value = [];
      password.value = '';
      hasSavedPw.value = false;
    });

    const testConn = async () => {
      if (!selected.value) return;
      connStatus.value = 'testing';
      try {
        let ok: boolean;
        if (isMysql()) ok = await testMysqlConnection(selected.value.id, password.value);
        else if (isPostgres()) ok = await testPgConnection(selected.value.id, password.value);
        else if (isRedis()) {
          await redisRun(selected.value.id, password.value, ['PING']);
          ok = true;
        } else ok = false;

        connStatus.value = ok ? 'ok' : 'fail';
        if (ok) {
          ElMessage.success('连接成功');
          await loadData();
        } else {
          ElMessage.error('连接失败：密码错误或服务未运行');
        }
      } catch (e) {
        connStatus.value = 'fail';
        const msg = typeof e === 'object' && e ? JSON.stringify(e) : String(e);
        ElMessage.error('连接失败：' + msg);
      }
    };

    const loadData = async () => {
      if (!selected.value) return;
      try {
        if (isMysql()) databases.value = await listMysqlDatabases(selected.value.id);
        else if (isPostgres()) databases.value = await listPgDatabases(selected.value.id);
        else if (isRedis()) keys.value = await redisListKeys(selected.value.id, password.value);
      } catch {
        /* ignore */
      }
    };

    const runSql = async () => {
      if (!selected.value) return;
      try {
        if (isMysql()) sqlOutput.value = await runMysqlQuery(selected.value.id, sqlText.value);
        else if (isPostgres()) sqlOutput.value = await runPgQuery(selected.value.id, sqlText.value);
      } catch (e) {
        sqlOutput.value = String(e);
      }
    };

    const onCreateDb = async () => {
      if (!selected.value || !createDbForm.name) return;
      try {
        if (isMysql()) {
          await createMysqlDatabase(
            selected.value.id,
            createDbForm.name,
            createDbForm.userPw || null,
          );
        } else if (isPostgres()) {
          await createPgDatabase(
            selected.value.id,
            createDbForm.name,
            createDbForm.userPw || null,
          );
        }
        ElMessage.success(`数据库 ${createDbForm.name} 创建成功`);
        createDbVisible.value = false;
        createDbForm.name = '';
        createDbForm.user = '';
        createDbForm.userPw = '';
        await loadData();
      } catch (e) {
        ElMessage.error(String(e));
      }
    };

    const onChangePw = async () => {
      if (!selected.value || !changePwForm.newPassword) return;
      try {
        if (isMysql()) await changeRootPassword(selected.value.id, changePwForm.newPassword);
        else if (isPostgres()) await changePgPassword(selected.value.id, changePwForm.newPassword);
        else if (isRedis()) await redisChangePassword(selected.value.id, password.value, changePwForm.newPassword);
        ElMessage.success('密码修改成功');
        password.value = changePwForm.newPassword;
        changePwVisible.value = false;
        changePwForm.newPassword = '';
      } catch (e) {
        ElMessage.error(String(e));
      }
    };

    const onBackup = async (db: string) => {
      if (!selected.value) return;
      try {
        const path = isMysql()
          ? await backupMysql(selected.value.id, db)
          : await backupPg(selected.value.id, db);
        ElMessage.success(`已备份到：${path}`);
      } catch (e) {
        ElMessage.error(String(e));
      }
    };

    const onImport = async (db: string) => {
      if (!selected.value) return;
      const src = importSrc[db];
      if (!src) return;
      try {
        if (isMysql()) await importMysql(selected.value.id, db, src);
        else if (isPostgres()) await importPg(selected.value.id, db, src);
        ElMessage.success('导入成功');
      } catch (e) {
        ElMessage.error(String(e));
      }
    };

    const onRedisCli = async () => {
      if (!selected.value) return;
      try {
        const args = redisCli.input.split(/\s+/).filter(Boolean);
        redisCli.output = await redisRun(selected.value.id, password.value, args);
      } catch (e) {
        redisCli.output = String(e);
      }
    };

    const onGetKey = async () => {
      if (!selected.value) return;
      try {
        getKey.value = await redisGetKey(selected.value.id, password.value, getKey.key);
      } catch (e) {
        getKey.value = String(e);
      }
    };

    const onAddKey = async () => {
      if (!selected.value || !getKey.key) return;
      try {
        await redisAddKey(selected.value.id, password.value, getKey.key, getKey.value);
        ElMessage.success('已设置');
        await loadData();
      } catch (e) {
        ElMessage.error(String(e));
      }
    };

    const onDelKey = async (k: string) => {
      if (!selected.value) return;
      await redisDelKey(selected.value.id, password.value, k);
      await loadData();
    };

    const connStatusText = () =>
      ({ idle: '未测试', testing: '测试中...', ok: '已连接', fail: '连接失败' }[connStatus.value]);
    const connStatusType = () =>
      ({ idle: 'info', testing: 'warning', ok: 'success', fail: 'danger' }[connStatus.value] as any);

    return () => (
      <div style={{ maxWidth: '900px' }}>
        {/* Instance Selector */}
        <ElCard shadow="never" bodyStyle={{ padding: '12px' }} style={{ marginBottom: '12px' }}>
          <ElForm labelWidth="80" inline>
            <ElFormItem label="实例">
              <ElSelect
                modelValue={selectedId.value}
                onUpdate:modelValue={(v: number) => { selectedId.value = v; }}
                placeholder="选择数据库"
                size="default"
                style={{ width: '280px' }}
              >
                {instances.value.map((i) => (
                  <ElOption
                    key={i.id}
                    label={`${i.provider.toUpperCase()} ${i.version} :${i.port}`}
                    value={i.id}
                  />
                ))}
              </ElSelect>
            </ElFormItem>
          </ElForm>
        </ElCard>

        {/* Connection Panel */}
        {selected.value ? (
          <ElCard shadow="never" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <ElTag type="primary" size="large">
                {selected.value.provider.toUpperCase()}
              </ElTag>
              <span style={{ fontSize: '14px', color: '#606266' }}>
                {selected.value.version} · 端口 {selected.value.port} ·{' '}
                {selected.value.runMode === 'Service' ? '服务模式' : '便携模式'}
              </span>
              <span style={{ flex: '1' }} />
              <ElTag type={connStatusType()} size="default">
                {connStatusText()}
              </ElTag>
            </div>
            <ElForm labelWidth="80" inline>
              <ElFormItem label={isRedis() ? '密码' : 'Root 密码'}>
                <ElInput
                  modelValue={password.value}
                  onUpdate:modelValue={(v: string) => { password.value = v; }}
                  type="password"
                  showPassword
                  placeholder={hasSavedPw.value ? SENSITIVE_HINT : '输入密码'}
                  style={{ width: '240px' }}
                  onKeydown={(e: Event) => { if ((e as KeyboardEvent).key === 'Enter') testConn(); }}
                />
              </ElFormItem>
              <ElFormItem>
                <ElButton
                  type="primary"
                  loading={connStatus.value === 'testing'}
                  onClick={testConn}
                >
                  测试连接
                </ElButton>
                <ElButton onClick={() => changePwVisible.value = true}>修改密码</ElButton>
              </ElFormItem>
            </ElForm>
          </ElCard>
        ) : null}

        {/* Management Area (only when connected) */}
        {connStatus.value === 'ok' && selected.value ? (
          <div>
            {isRelational() ? (
              <div>
                {/* Database List */}
                <ElCard shadow="never" style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>数据库列表</span>
                    <ElButton type="primary" size="small" onClick={() => (createDbVisible.value = true)}>
                      + 创建数据库
                    </ElButton>
                  </div>
                  <ElTable data={databases.value.map((d) => ({ name: d }))} size="small">
                    <ElTableColumn prop="name" label="数据库名" />
                    <ElTableColumn label="备份" width={100}>
                      {{ default: (scope: { row: { name: string } }) => (
                        <ElButton text size="small" onClick={() => onBackup(scope.row.name)}>备份</ElButton>
                      ) }}
                    </ElTableColumn>
                    <ElTableColumn label="导入 SQL" width={300}>
                      {{ default: (scope: { row: { name: string } }) => (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <ElInput
                            modelValue={importSrc[scope.row.name] || ''}
                            onUpdate:modelValue={(v: string) => { importSrc[scope.row.name] = v; }}
                            placeholder=".sql 文件路径"
                            size="small"
                            style={{ width: '180px' }}
                          />
                          <ElButton text size="small" onClick={() => onImport(scope.row.name)}>导入</ElButton>
                        </div>
                      ) }}
                    </ElTableColumn>
                  </ElTable>
                </ElCard>

                {/* SQL Editor */}
                <ElCard shadow="never" header="执行 SQL">
                  <MonacoEditor
                    modelValue={sqlText.value}
                    onUpdate:modelValue={(v: string) => { sqlText.value = v; }}
                    language="sql"
                    height="120px"
                  />
                  <div style={{ marginTop: '8px' }}>
                    <ElButton type="primary" size="small" onClick={runSql}>运行</ElButton>
                  </div>
                  <pre style={{
                    background: '#1e1e1e', color: '#d4d4d4', padding: '10px',
                    borderRadius: '6px', fontSize: '12px', marginTop: '8px',
                    maxHeight: '240px', overflow: 'auto', whiteSpace: 'pre-wrap',
                  }}>
                    {sqlOutput.value || '（点击运行后显示结果）'}
                  </pre>
                </ElCard>
              </div>
            ) : null}

            {/* Redis Panel */}
            {isRedis() ? (
              <div style={{ display: 'flex', gap: '12px' }}>
                <ElCard shadow="never" style={{ flex: '1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600 }}>键值操作</span>
                  </div>
                  <ElForm labelWidth="60" size="small">
                    <ElFormItem label="键名">
                      <ElInput modelValue={getKey.key} onUpdate:modelValue={(v: string) => { getKey.key = v; }} />
                    </ElFormItem>
                    <ElFormItem label="值">
                      <ElInput modelValue={getKey.value} onUpdate:modelValue={(v: string) => { getKey.value = v; }} />
                    </ElFormItem>
                    <ElFormItem>
                      <ElButton type="primary" size="small" onClick={onAddKey}>SET</ElButton>
                      <ElButton size="small" onClick={onGetKey}>GET</ElButton>
                    </ElFormItem>
                  </ElForm>
                  <ElTable data={keys.value.map((k) => ({ key: k }))} size="small" maxHeight="300">
                    <ElTableColumn prop="key" label="Key" />
                    <ElTableColumn label="" width="60">
                      {{ default: (scope: { row: { key: string } }) => (
                        <ElButton type="danger" text size="small" onClick={() => onDelKey(scope.row.key)}>DEL</ElButton>
                      ) }}
                    </ElTableColumn>
                  </ElTable>
                </ElCard>
                <ElCard shadow="never" style={{ flex: '1' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px' }}>Redis CLI</div>
                  <ElInput
                    modelValue={redisCli.input}
                    onUpdate:modelValue={(v: string) => { redisCli.input = v; }}
                    placeholder="如 KEYS * 或 GET mykey"
                    size="small"
                    style={{ marginBottom: '8px' }}
                    onKeydown={(e: Event) => { if ((e as KeyboardEvent).key === 'Enter') onRedisCli(); }}
                  />
                  <ElButton type="primary" size="small" onClick={onRedisCli}>执行</ElButton>
                  <pre style={{
                    background: '#1e1e1e', color: '#d4d4d4', padding: '10px',
                    borderRadius: '6px', fontSize: '12px', marginTop: '8px',
                    maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap',
                  }}>
                    {redisCli.output}
                  </pre>
                </ElCard>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Create Database Dialog */}
        <ElDialog
          title="创建数据库"
          modelValue={createDbVisible.value}
          onUpdate:modelValue={(v: boolean) => { createDbVisible.value = v; }}
          width="480px"
        >
          <ElForm labelWidth="100">
            <ElFormItem label="数据库名">
              <ElInput modelValue={createDbForm.name} onUpdate:modelValue={(v: string) => { createDbForm.name = v; }} placeholder="如 my_app" />
            </ElFormItem>
            <ElFormItem label="创建用户">
              <ElInput modelValue={createDbForm.user} onUpdate:modelValue={(v: string) => { createDbForm.user = v; }} placeholder="留空则不创建用户" />
            </ElFormItem>
            <ElFormItem label="用户密码">
              <ElInput modelValue={createDbForm.userPw} onUpdate:modelValue={(v: string) => { createDbForm.userPw = v; }} type="password" showPassword placeholder="用户密码" />
            </ElFormItem>
          </ElForm>
          <div style={{ textAlign: 'right' }}>
            <ElButton size="small" onClick={() => (createDbVisible.value = false)}>取消</ElButton>
            <ElButton size="small" type="primary" onClick={onCreateDb}>创建</ElButton>
          </div>
        </ElDialog>

        {/* Change Password Dialog */}
        <ElDialog
          title="修改密码"
          modelValue={changePwVisible.value}
          onUpdate:modelValue={(v: boolean) => { changePwVisible.value = v; }}
          width="400px"
        >
          <ElForm labelWidth="80">
            <ElFormItem label="新密码">
              <ElInput modelValue={changePwForm.newPassword} onUpdate:modelValue={(v: string) => { changePwForm.newPassword = v; }} type="password" showPassword />
            </ElFormItem>
          </ElForm>
          <div style={{ textAlign: 'right' }}>
            <ElButton size="small" onClick={() => (changePwVisible.value = false)}>取消</ElButton>
            <ElButton size="small" type="primary" onClick={onChangePw}>确认修改</ElButton>
          </div>
        </ElDialog>
      </div>
    );
  },
});
