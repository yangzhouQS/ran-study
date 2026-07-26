import { defineComponent, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { RingProgress } from '@antv/g2plot';
import { ElCard } from 'element-plus';
import { dashboardSummary, getSystemStats } from '@/api/monitor-api';
import type { DashboardSummary } from '@/types/api-type';

const fmt = (b: number) => (b / 1024 ** 3).toFixed(1) + ' GB';
const fmtUptime = (s: number) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}天${h}时` : h > 0 ? `${h}时${m}分` : `${m}分`;
};

interface DiskView {
  name: string;
  mountPoint: string;
  total: number;
  available: number;
}

export default defineComponent({
  name: 'Dashboard',
  setup() {
    const cpuRef = ref<HTMLDivElement>();
    const memRef = ref<HTMLDivElement>();
    const diskBoxRef = ref<HTMLDivElement>();
    const disks = ref<DiskView[]>([]);
    const summary = ref<DashboardSummary | null>(null);

    let cpuPlot: RingProgress | null = null;
    let memPlot: RingProgress | null = null;
    const diskPlots = new Map<string, RingProgress>();
    let lastKeys = '';
    let timer: number | null = null;

    const makeRing = (
      el: HTMLElement,
      title: string,
      mainColor: string,
    ): RingProgress => {
      const p = new RingProgress(el, {
        percent: 0,
        radius: 1,
        innerRadius: 0.72,
        color: [mainColor, '#E8EDF3'],
        width: 200,
        height: 200,
        autoFit: false,
        statistic: {
          title: {
            content: title,
            style: { fontSize: '14px', color: '#666' },
          },
        },
      });
      p.render();
      return p;
    };

    const rebuildDisks = async () => {
      const keys = disks.value.map((d) => d.name).join('|');
      if (keys === lastKeys) return;
      lastKeys = keys;
      for (const p of diskPlots.values()) p.destroy();
      diskPlots.clear();
      const box = diskBoxRef.value;
      if (!box) return;
      box.innerHTML = '';
      await nextTick();
      for (const d of disks.value) {
        const wrap = document.createElement('div');
        wrap.style.cssText =
          'display:flex;flex-direction:column;align-items:center;margin:10px 16px;';
        const ring = document.createElement('div');
        wrap.appendChild(ring);
        const label = document.createElement('div');
        label.style.cssText = 'margin-top:4px;color:#666;font-size:13px;';
        label.textContent = `${d.mountPoint} ${d.name}：${fmt(d.total - d.available)} / ${fmt(d.total)}`;
        wrap.appendChild(label);
        box.appendChild(wrap);
        const p = makeRing(ring, d.mountPoint || d.name, '#5AD8A6');
        p.changeData(d.total > 0 ? (d.total - d.available) / d.total : 0);
        diskPlots.set(d.name, p);
      }
    };

    const poll = async () => {
      try {
        const s = await getSystemStats();
        cpuPlot?.changeData(s.cpu / 100);
        memPlot?.changeData(s.memTotal > 0 ? s.memUsed / s.memTotal : 0);
        disks.value = s.disks.map((d) => ({
          name: d.name,
          mountPoint: d.mountPoint,
          total: d.total,
          available: d.available,
        }));
        await rebuildDisks();
        summary.value = await dashboardSummary();
      } catch {
        /* ignore polling errors */
      }
    };

    onMounted(() => {
      if (cpuRef.value) cpuPlot = makeRing(cpuRef.value, 'CPU', '#5B8FF9');
      if (memRef.value) memPlot = makeRing(memRef.value, '内存', '#5AD8A6');
      poll();
      timer = window.setInterval(poll, 2000);
    });

    onUnmounted(() => {
      if (timer) clearInterval(timer);
      cpuPlot?.destroy();
      memPlot?.destroy();
      for (const p of diskPlots.values()) p.destroy();
      diskPlots.clear();
    });

    return () => (
      <div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {summary.value
            ? [
                { label: '已装软件', value: summary.value.installedSoftware },
                { label: 'MySQL/Redis', value: summary.value.mysqlCount + summary.value.redisCount },
                { label: 'Node 版本', value: summary.value.nodeVersions },
                { label: 'PM2 应用', value: summary.value.pm2Apps },
                { label: '计划任务', value: summary.value.scheduledTasks },
                { label: '运行任务', value: summary.value.runningTasks },
                { label: '系统运行', value: fmtUptime(summary.value.uptime) },
              ].map((c) => (
                <ElCard
                  key={c.label}
                  shadow="never"
                  bodyStyle={{ padding: '12px 16px' }}
                  style={{ minWidth: '120px', borderRadius: '10px' }}
                >
                  <div style={{ fontSize: '12px', color: '#909399' }}>{c.label}</div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#1f6feb' }}>
                    {c.value}
                  </div>
                </ElCard>
              ))
            : null}
        </div>

        <h3 style={{ margin: '0 0 12px 0' }}>服务器状态</h3>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <div ref={cpuRef} style={{ width: '200px', height: '200px' }} />
          <div ref={memRef} style={{ width: '200px', height: '200px' }} />
        </div>

        <h3 style={{ margin: '20px 0 12px 0' }}>磁盘存储状态</h3>
        <div ref={diskBoxRef} style={{ display: 'flex', flexWrap: 'wrap' }} />
      </div>
    );
  },
});
