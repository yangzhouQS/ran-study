import { defineComponent } from 'vue';
import {
  ElContainer,
  ElAside,
  ElHeader,
  ElMain,
  ElMenu,
  ElMenuItem,
} from 'element-plus';
import { RouterView } from 'vue-router';

export default defineComponent({
  name: 'AppLayout',
  render() {
    return (
      <ElContainer style={{ height: '100vh' }}>
        <ElAside width="200px">
          <ElMenu router defaultActive="/dashboard">
            <ElMenuItem index="/dashboard">首页</ElMenuItem>
            <ElMenuItem index="/software">软件管理</ElMenuItem>
            <ElMenuItem index="/node-version">Node 版本</ElMenuItem>
            <ElMenuItem index="/pm2-app">PM2 应用</ElMenuItem>
            <ElMenuItem index="/process-service">进程与服务</ElMenuItem>
            <ElMenuItem index="/monitor">监控</ElMenuItem>
            <ElMenuItem index="/schedule">计划任务</ElMenuItem>
            <ElMenuItem index="/terminal">终端</ElMenuItem>
            <ElMenuItem index="/task-queue">任务队列</ElMenuItem>
          </ElMenu>
        </ElAside>
        <ElContainer>
          <ElHeader>ran-study</ElHeader>
          <ElMain>
            <RouterView />
          </ElMain>
        </ElContainer>
      </ElContainer>
    );
  },
});
