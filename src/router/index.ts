import { createRouter, createWebHashHistory } from 'vue-router';

const Dashboard = () => import('@/views/dashboard/dashboard');
const Software = () => import('@/views/software/software');
const CustomApps = () => import('@/views/custom-apps/custom-apps');
const TaskQueue = () => import('@/views/task-queue/task-queue');
const NodeVersion = () => import('@/views/node-version/node-version');
const Pm2App = () => import('@/views/pm2-app/pm2-app');
const ProcessService = () => import('@/views/process-service/process-service');
const Monitor = () => import('@/views/monitor/monitor');
const Schedule = () => import('@/views/schedule/schedule');
const TerminalView = () => import('@/views/terminal/terminal');
const Database = () => import('@/views/database/database');
const Settings = () => import('@/views/settings/settings');
const Logs = () => import('@/views/logs/logs');
const DevTools = () => import('@/views/devtools/devtools');

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', name: 'dashboard', component: Dashboard },
    { path: '/software', name: 'software', component: Software },
    { path: '/custom-apps', name: 'customApps', component: CustomApps },
    { path: '/database', name: 'database', component: Database },
    { path: '/node-version', name: 'nodeVersion', component: NodeVersion },
    { path: '/pm2-app', name: 'pm2App', component: Pm2App },
    { path: '/process-service', name: 'processService', component: ProcessService },
    { path: '/monitor', name: 'monitor', component: Monitor },
    { path: '/schedule', name: 'schedule', component: Schedule },
    { path: '/terminal', name: 'terminal', component: TerminalView },
    { path: '/settings', name: 'settings', component: Settings },
    { path: '/devtools', name: 'devtools', component: DevTools },
    { path: '/logs', name: 'logs', component: Logs },
    { path: '/task-queue', name: 'taskQueue', component: TaskQueue },
  ],
});
