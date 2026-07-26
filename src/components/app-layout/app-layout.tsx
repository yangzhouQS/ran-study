import { defineComponent } from 'vue';
import {
  ElAside,
  ElContainer,
  ElHeader,
  ElIcon,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElTag,
} from 'element-plus';
import {
  Box,
  Coin,
  Connection,
  Cpu,
  DataLine,
  Document,
  Histogram,
  HomeFilled,
  List,
  Monitor,
  Operation,
  Setting,
  Timer,
  Tools,
  Key,
} from '@element-plus/icons-vue';
import { RouterView, useRoute, useRouter } from 'vue-router';

interface MenuEntry {
  index: string;
  label: string;
  Icon: ReturnType<typeof defineComponent>;
}

const MENU: MenuEntry[] = [
  { index: '/dashboard', label: '首页', Icon: HomeFilled },
  { index: '/software', label: '软件管理', Icon: Box },
  { index: '/custom-apps', label: '第三方应用', Icon: Connection },
  { index: '/database', label: '数据库', Icon: Coin },
  { index: '/node-version', label: 'Node 版本', Icon: Cpu },
  { index: '/pm2-app', label: 'PM2 应用', Icon: Operation },
  { index: '/process-service', label: '进程与服务', Icon: Histogram },
  { index: '/monitor', label: '监控', Icon: DataLine },
  { index: '/schedule', label: '计划任务', Icon: Timer },
  { index: '/terminal', label: '终端', Icon: Monitor },
  { index: '/logs', label: '日志', Icon: Document },
  { index: '/task-queue', label: '任务队列', Icon: List },
  { index: '/settings', label: '设置', Icon: Setting },
  { index: '/devtools', label: '开发工具箱', Icon: Tools },
  { index: '/env-manager', label: '.env 管理', Icon: Key },
];

export default defineComponent({
  name: 'AppLayout',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const onMenuSelect = (index: string) => {
      router.push(index);
    };
    return () => (
      <ElContainer style={{ height: '100vh', overflow: 'hidden' }}>
        <ElAside width="208px" style={{ height: '100vh', overflowY: 'auto' }}>
          <ElMenu defaultActive={route.path} onSelect={onMenuSelect}>
            {MENU.map(({ index, label, Icon }) => (
              <ElMenuItem index={index}>
                <ElIcon>
                  <Icon />
                </ElIcon>
                <span>{label}</span>
              </ElMenuItem>
            ))}
          </ElMenu>
        </ElAside>
        <ElContainer style={{ height: '100vh' }}>
          <ElHeader>
            <div class="app-title">ran-study · 软件管理</div>
            <ElTag size="small" effect="dark" type="info">
              v0.1.0
            </ElTag>
          </ElHeader>
          <ElMain style={{ overflowY: 'auto' }}>
            <RouterView />
          </ElMain>
        </ElContainer>
      </ElContainer>
    );
  },
});
