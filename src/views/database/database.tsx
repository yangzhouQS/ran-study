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
  createMysqlInstance,
  deleteMysqlInstance,
  importMysql,
  listMysqlDatabases,
  listMysqlInstances,
  runMysqlQuery,
  startMysqlInstance,
  stopMysqlInstance,
} from '@/api/dbadmin-api';
import {
  redisAddKey,
  redisChangePassword,
  redisDelKey,
  redisGetKey,
  redisListKeys,
  redisRun,
  redisRunRemote,
} from '@/api/redis-api';
import {
  backupPg,
  changePgPassword,
  createPgDatabase,
  importPg,
  listPgDatabases,
  runPgQuery,
} from '@/api/pg-api';
import type { InstalledSoftware, MysqlInstance } from '@/types/api-type';

export default defineComponent({
  name: 'Database',
  setup() {
    const instances = ref<InstalledSoftware[]>([]);
    const selected = ref<InstalledSoftware | null>(null);

    // MySQL
    const databases = ref<string[]>([]);
    const importSrc: Record<string, string> = {};
    const sqlForm = reactive({ sql: 'SHOW DATABASES;', output: '' });
    const rootPw = reactive({ value: '' });
    const createForm = reactive({ name: '', password: '' });
    const mysqlInstances = ref<MysqlInstance[]>([]);
    const instForm = reactive({ name: '', port: 3307 });

    // Redis
    const redisPw = reactive({ value: '', newVal: '' });
    const keys = ref<string[]>([]);
    const keyForm = reactive({ key: '', val: '' });
    const getKey = reactive({ key: '', out: '' });
    const cli = reactive({ args: 'PING', out: '' });
    const remote = reactive({ host: '127.0.0.1', port: 6379, pw: '', cmd: 'PING', out: '' });

    // PostgreSQL
    const pgDatabases = ref<string[]>([]);
    const pgImportSrc: Record<string, string> = {};
    const pgPw = reactive({ value: '', newVal: '' });
    const pgCreate = reactive({ name: '', password: '' });
    const pgSql = reactive({ sql: 'SELECT datname FROM pg_database;', output: '' });

    const isMysql = () => selected.value?.provider === 'mysql';
    const isRedis = () => selected.value?.provider === 'redis';
    const isPostgres = () => selected.value?.provider === 'postgres';

    const loadDetail = async () => {
      if (!selected.value) return;
      if (isMysql()) {
        try {
          databases.value = await listMysqlDatabases(selected.value.id);
        } catch {
          databases.value = [];
        }
        try {
          mysqlInstances.value = await listMysqlInstances(selected.value.id);
        } catch {
          mysqlInstances.value = [];
        }
      } else if (isRedis()) {
        try {
          keys.value = await redisListKeys(selected.value.id, redisPw.value);
        } catch {
          keys.value = [];
        }
      } else if (isPostgres()) {
        try {
          pgDatabases.value = await listPgDatabases(selected.value.id);
        } catch {
          pgDatabases.value = [];
        }
      }
    };

    onMounted(async () => {
      const all = await listInstalled();
      instances.value = all.filter(
        (s) => s.provider === 'mysql' || s.provider === 'redis' || s.provider === 'postgres',
      );
      if (instances.value.length > 0) {
        selected.value = instances.value[0];
        await loadDetail();
      }
    });
    watch(selected, loadDetail);

    // ---- MySQL ops ----
    const onChangePw = async () => {
      if (!selected.value || !rootPw.value) return;
      await changeRootPassword(selected.value.id, rootPw.value);
      ElMessage.success('root 密码已修改');
      rootPw.value = '';
      await loadDetail();
    };
    const onCreateDb = async () => {
      if (!selected.value || !createForm.name) return;
      await createMysqlDatabase(selected.value.id, createForm.name, createForm.password || null);
      ElMessage.success(`已创建库 ${createForm.name}`);
      createForm.name = '';
      createForm.password = '';
      await loadDetail();
    };
    const onBackup = async (db: string) => {
      if (!selected.value) return;
      const p = await backupMysql(selected.value.id, db);
      ElMessage.success(`已备份到：${p}`);
    };
    const onImport = async (db: string) => {
      if (!selected.value) return;
      const src = importSrc[db];
      if (!src) return;
      await importMysql(selected.value.id, db, src);
      ElMessage.success(`已导入 ${src}`);
    };
    const onRunSql = async () => {
      if (!selected.value) return;
      try {
        sqlForm.output = await runMysqlQuery(selected.value.id, sqlForm.sql);
      } catch (e) {
        sqlForm.output = String(e);
      }
    };
    const onCreateInst = async () => {
      if (!selected.value || !instForm.name) return;
      await createMysqlInstance(selected.value.id, instForm.name, instForm.port, 'Portable');
      ElMessage.success(`已创建实例 ${instForm.name}:${instForm.port}`);
      instForm.name = '';
      await loadDetail();
    };
    const onInst = async (inst: MysqlInstance, action: 'start' | 'stop' | 'delete') => {
      if (!selected.value) return;
      if (action === 'start') await startMysqlInstance(selected.value.id, inst.id);
      if (action === 'stop') await stopMysqlInstance(selected.value.id, inst.id);
      if (action === 'delete') await deleteMysqlInstance(selected.value.id, inst.id);
      await loadDetail();
    };

    // ---- Redis ops ----
    const onAddKey = async () => {
      if (!selected.value || !keyForm.key) return;
      await redisAddKey(selected.value.id, redisPw.value, keyForm.key, keyForm.val);
      keyForm.key = '';
      keyForm.val = '';
      await loadDetail();
    };
    const onGetKey = async () => {
      if (!selected.value) return;
      try {
        getKey.out = await redisGetKey(selected.value.id, redisPw.value, getKey.key);
      } catch (e) {
        getKey.out = String(e);
      }
    };
    const onDelKey = async (k: string) => {
      if (!selected.value) return;
      await redisDelKey(selected.value.id, redisPw.value, k);
      await loadDetail();
    };
    const onCli = async () => {
      if (!selected.value) return;
      try {
        const args = cli.args.split(/\s+/).filter(Boolean);
        cli.out = await redisRun(selected.value.id, redisPw.value, args);
      } catch (e) {
        cli.out = String(e);
      }
    };
    const onRemote = async () => {
      try {
        const args = remote.cmd.split(/\s+/).filter(Boolean);
        remote.out = await redisRunRemote(remote.host, remote.port, remote.pw, args);
      } catch (e) {
        remote.out = String(e);
      }
    };
    const onRedisPw = async () => {
      if (!selected.value || !redisPw.newVal) return;
      await redisChangePassword(selected.value.id, redisPw.value, redisPw.newVal);
      ElMessage.success('Redis 密码已修改并重启');
      redisPw.value = redisPw.newVal;
      redisPw.newVal = '';
    };

    // ---- PostgreSQL ops ----
    const onPgPw = async () => {
      if (!selected.value || !pgPw.newVal) return;
      await changePgPassword(selected.value.id, pgPw.newVal);
      ElMessage.success('postgres 密码已修改');
      pgPw.value = pgPw.newVal;
      pgPw.newVal = '';
    };
    const onCreatePgDb = async () => {
      if (!selected.value || !pgCreate.name) return;
      await createPgDatabase(selected.value.id, pgCreate.name, pgCreate.password || null);
      ElMessage.success(`已创建库 ${pgCreate.name}`);
      pgCreate.name = '';
      pgCreate.password = '';
      await loadDetail();
    };
    const onBackupPg = async (db: string) => {
      if (!selected.value) return;
      const p = await backupPg(selected.value.id, db);
      ElMessage.success(`已备份到：${p}`);
    };
    const onImportPg = async (db: string) => {
      if (!selected.value) return;
      const src = pgImportSrc[db];
      if (!src) return;
      await importPg(selected.value.id, db, src);
      ElMessage.success(`已导入 ${src}`);
    };
    const onRunPgSql = async () => {
      if (!selected.value) return;
      try {
        pgSql.output = await runPgQuery(selected.value.id, pgSql.sql);
      } catch (e) {
        pgSql.output = String(e);
      }
    };

    return () => (
      <div>
        <ElForm labelWidth="60" inline style={{ marginBottom: '8px' }}>
          <ElFormItem label="实例">
            <ElSelect
              modelValue={selected.value?.id ?? null}
              onChange={(v: number) => {
                selected.value = instances.value.find((i) => i.id === v) ?? null;
              }}
              placeholder="选择数据库实例"
              size="small"
              style={{ width: '240px' }}
            >
              {instances.value.map((i) => (
                <ElOption
                  key={i.id}
                  label={`${i.provider} ${i.version} (#${i.id})`}
                  value={i.id}
                />
              ))}
            </ElSelect>
          </ElFormItem>
        </ElForm>

        {isMysql() && selected.value ? (
          <div>
            <ElForm labelWidth="70" inline style={{ marginBottom: '8px' }}>
              <ElFormItem label="新root密码">
                <ElInput
                  modelValue={rootPw.value}
                  onInput={(v: string) => { rootPw.value = v; }}
                  size="small"
                  style={{ width: '160px' }}
                />
              </ElFormItem>
              <ElFormItem>
                <ElButton size="small" type="primary" onClick={onChangePw}>改密码</ElButton>
              </ElFormItem>
            </ElForm>
            <ElForm labelWidth="60" inline style={{ marginBottom: '8px' }}>
              <ElFormItem label="库名">
                <ElInput modelValue={createForm.name} onInput={(v: string) => { createForm.name = v; }} size="small" style={{ width: '140px' }} />
              </ElFormItem>
              <ElFormItem label="库密码">
                <ElInput modelValue={createForm.password} onInput={(v: string) => { createForm.password = v; }} size="small" style={{ width: '140px' }} placeholder="留空=不建用户" />
              </ElFormItem>
              <ElFormItem>
                <ElButton size="small" type="primary" onClick={onCreateDb}>建库</ElButton>
              </ElFormItem>
            </ElForm>

            <h3>数据库</h3>
            <ElTable data={databases.value.map((d) => ({ name: d }))}>
              <ElTableColumn prop="name" label="库名" />
              <ElTableColumn label="备份" width={120}>
                {{ default: (scope: { row: { name: string } }) => <ElButton size="small" onClick={() => onBackup(scope.row.name)}>备份</ElButton> }}
              </ElTableColumn>
              <ElTableColumn label="导入 .sql" width={320}>
                {{ default: (scope: { row: { name: string } }) => (
                  <span>
                    <ElInput modelValue={importSrc[scope.row.name] || ''} onInput={(v: string) => { importSrc[scope.row.name] = v; }} placeholder="D:\path\file.sql" size="small" style={{ width: '180px' }} />
                    <ElButton size="small" style={{ marginLeft: '4px' }} onClick={() => onImport(scope.row.name)}>导入</ElButton>
                  </span>
                ) }}
              </ElTableColumn>
            </ElTable>

            <h3 style={{ marginTop: '12px' }}>实例（多端口）</h3>
            <ElForm labelWidth="60" inline style={{ marginBottom: '8px' }}>
              <ElFormItem label="名称">
                <ElInput modelValue={instForm.name} onInput={(v: string) => { instForm.name = v; }} size="small" style={{ width: '120px' }} />
              </ElFormItem>
              <ElFormItem label="端口">
                <ElInput modelValue={String(instForm.port)} onInput={(v: string) => { instForm.port = Number(v) || 0; }} size="small" style={{ width: '90px' }} />
              </ElFormItem>
              <ElFormItem>
                <ElButton size="small" type="primary" onClick={onCreateInst}>新建实例</ElButton>
              </ElFormItem>
            </ElForm>
            <ElTable data={mysqlInstances.value}>
              <ElTableColumn prop="name" label="名称" width={140} />
              <ElTableColumn prop="port" label="端口" width={90} />
              <ElTableColumn label="操作" width={240}>
                {{ default: (scope: { row: MysqlInstance }) => (
                  <span>
                    <ElButton size="small" onClick={() => onInst(scope.row, 'start')}>启动</ElButton>
                    <ElButton size="small" onClick={() => onInst(scope.row, 'stop')}>停止</ElButton>
                    <ElButton type="danger" size="small" onClick={() => onInst(scope.row, 'delete')}>删除</ElButton>
                  </span>
                ) }}
              </ElTableColumn>
            </ElTable>

            <h3 style={{ marginTop: '12px' }}>执行 SQL</h3>
            <ElInput type="textarea" modelValue={sqlForm.sql} onInput={(v: string) => { sqlForm.sql = v; }} rows={3} />
            <ElButton size="small" type="primary" style={{ marginTop: '8px' }} onClick={onRunSql}>运行</ElButton>
            <pre style={{ marginTop: '8px', background: '#1e1e1e', color: '#d4d4d4', padding: '8px', maxHeight: '240px', overflow: 'auto' }}>{sqlForm.output}</pre>
          </div>
        ) : null}

        {isRedis() && selected.value ? (
          <div>
            <ElForm labelWidth="70" inline style={{ marginBottom: '8px' }}>
              <ElFormItem label="当前密码">
                <ElInput modelValue={redisPw.value} onInput={(v: string) => { redisPw.value = v; }} size="small" style={{ width: '140px' }} placeholder="无密码留空" />
              </ElFormItem>
              <ElFormItem label="新密码">
                <ElInput modelValue={redisPw.newVal} onInput={(v: string) => { redisPw.newVal = v; }} size="small" style={{ width: '140px' }} />
              </ElFormItem>
              <ElFormItem>
                <ElButton size="small" type="primary" onClick={onRedisPw}>改密码并重启</ElButton>
              </ElFormItem>
            </ElForm>

            <ElForm labelWidth="60" inline style={{ marginBottom: '8px' }}>
              <ElFormItem label="键">
                <ElInput modelValue={keyForm.key} onInput={(v: string) => { keyForm.key = v; }} size="small" style={{ width: '140px' }} />
              </ElFormItem>
              <ElFormItem label="值">
                <ElInput modelValue={keyForm.val} onInput={(v: string) => { keyForm.val = v; }} size="small" style={{ width: '160px' }} />
              </ElFormItem>
              <ElFormItem>
                <ElButton size="small" type="primary" onClick={onAddKey}>加键</ElButton>
              </ElFormItem>
            </ElForm>

            <h3>键</h3>
            <ElTable data={keys.value.map((k) => ({ key: k }))}>
              <ElTableColumn prop="key" label="键" />
              <ElTableColumn label="操作" width={100}>
                {{ default: (scope: { row: { key: string } }) => <ElButton type="danger" size="small" onClick={() => onDelKey(scope.row.key)}>删除</ElButton> }}
              </ElTableColumn>
            </ElTable>

            <h3 style={{ marginTop: '12px' }}>取值</h3>
            <ElForm labelWidth="60" inline>
              <ElFormItem label="键">
                <ElInput modelValue={getKey.key} onInput={(v: string) => { getKey.key = v; }} size="small" style={{ width: '200px' }} />
              </ElFormItem>
              <ElFormItem>
                <ElButton size="small" type="primary" onClick={onGetKey}>取值</ElButton>
              </ElFormItem>
            </ElForm>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '8px', maxHeight: '120px', overflow: 'auto' }}>{getKey.out}</pre>

            <h3 style={{ marginTop: '12px' }}>命令行</h3>
            <ElInput modelValue={cli.args} onInput={(v: string) => { cli.args = v; }} placeholder="如 SET k v  /  KEYS *" size="small" />
            <ElButton size="small" type="primary" style={{ marginTop: '4px' }} onClick={onCli}>执行</ElButton>
            <pre style={{ marginTop: '4px', background: '#1e1e1e', color: '#d4d4d4', padding: '8px', maxHeight: '120px', overflow: 'auto' }}>{cli.out}</pre>

            <h3 style={{ marginTop: '12px' }}>远程连接</h3>
            <ElForm labelWidth="60" inline>
              <ElFormItem label="主机">
                <ElInput modelValue={remote.host} onInput={(v: string) => { remote.host = v; }} size="small" style={{ width: '140px' }} />
              </ElFormItem>
              <ElFormItem label="端口">
                <ElInput modelValue={String(remote.port)} onInput={(v: string) => { remote.port = Number(v) || 0; }} size="small" style={{ width: '80px' }} />
              </ElFormItem>
              <ElFormItem label="密码">
                <ElInput modelValue={remote.pw} onInput={(v: string) => { remote.pw = v; }} size="small" style={{ width: '120px' }} />
              </ElFormItem>
              <ElFormItem label="命令">
                <ElInput modelValue={remote.cmd} onInput={(v: string) => { remote.cmd = v; }} size="small" style={{ width: '160px' }} />
              </ElFormItem>
              <ElFormItem>
                <ElButton size="small" type="primary" onClick={onRemote}>执行</ElButton>
              </ElFormItem>
            </ElForm>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '8px', maxHeight: '120px', overflow: 'auto' }}>{remote.out}</pre>
          </div>
        ) : null}

        {isPostgres() && selected.value ? (
          <div>
            <ElForm labelWidth="90" inline style={{ marginBottom: '8px' }}>
              <ElFormItem label="当前密码">
                <ElInput
                  modelValue={pgPw.value}
                  onInput={(v: string) => { pgPw.value = v; }}
                  size="small"
                  style={{ width: '140px' }}
                  placeholder="无密码留空"
                />
              </ElFormItem>
              <ElFormItem label="新密码">
                <ElInput
                  modelValue={pgPw.newVal}
                  onInput={(v: string) => { pgPw.newVal = v; }}
                  size="small"
                  style={{ width: '140px' }}
                />
              </ElFormItem>
              <ElFormItem>
                <ElButton size="small" type="primary" onClick={onPgPw}>改 postgres 密码</ElButton>
              </ElFormItem>
            </ElForm>

            <ElForm labelWidth="60" inline style={{ marginBottom: '8px' }}>
              <ElFormItem label="库名">
                <ElInput modelValue={pgCreate.name} onInput={(v: string) => { pgCreate.name = v; }} size="small" style={{ width: '140px' }} />
              </ElFormItem>
              <ElFormItem label="库密码">
                <ElInput modelValue={pgCreate.password} onInput={(v: string) => { pgCreate.password = v; }} size="small" style={{ width: '140px' }} placeholder="留空=不建用户" />
              </ElFormItem>
              <ElFormItem>
                <ElButton size="small" type="primary" onClick={onCreatePgDb}>建库</ElButton>
              </ElFormItem>
            </ElForm>

            <h3>数据库</h3>
            <ElTable data={pgDatabases.value.map((d) => ({ name: d }))}>
              <ElTableColumn prop="name" label="库名" />
              <ElTableColumn label="备份" width={120}>
                {{ default: (scope: { row: { name: string } }) => <ElButton size="small" onClick={() => onBackupPg(scope.row.name)}>备份</ElButton> }}
              </ElTableColumn>
              <ElTableColumn label="导入 .sql" width={320}>
                {{ default: (scope: { row: { name: string } }) => (
                  <span>
                    <ElInput modelValue={pgImportSrc[scope.row.name] || ''} onInput={(v: string) => { pgImportSrc[scope.row.name] = v; }} placeholder="D:\path\file.sql" size="small" style={{ width: '180px' }} />
                    <ElButton size="small" style={{ marginLeft: '4px' }} onClick={() => onImportPg(scope.row.name)}>导入</ElButton>
                  </span>
                ) }}
              </ElTableColumn>
            </ElTable>

            <h3 style={{ marginTop: '12px' }}>执行 SQL（psql）</h3>
            <ElInput type="textarea" modelValue={pgSql.sql} onInput={(v: string) => { pgSql.sql = v; }} rows={3} />
            <ElButton size="small" type="primary" style={{ marginTop: '8px' }} onClick={onRunPgSql}>运行</ElButton>
            <pre style={{ marginTop: '8px', background: '#1e1e1e', color: '#d4d4d4', padding: '8px', maxHeight: '240px', overflow: 'auto' }}>{pgSql.output}</pre>
          </div>
        ) : null}
      </div>
    );
  },
});
