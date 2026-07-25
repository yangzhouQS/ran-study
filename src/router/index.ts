import { createRouter, createWebHashHistory } from 'vue-router';

const Dashboard = () => import('@/views/dashboard/dashboard');
const Software = () => import('@/views/software/software');
const TaskQueue = () => import('@/views/task-queue/task-queue');

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', name: 'dashboard', component: Dashboard },
    { path: '/software', name: 'software', component: Software },
    { path: '/task-queue', name: 'taskQueue', component: TaskQueue },
  ],
});
