import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import { Area, Line } from '@antv/g2plot';
import { ElButton, ElMessage } from 'element-plus';
import {
  clearMonitorHistory,
  getSystemStats,
  listMonitorHistory,
} from '@/api/monitor-api';
import type { DiskInfo, MonitorSample } from '@/types/api-type';

const MAX_POINTS = 60;
const fmt = (b: number) => (b / 1024 ** 3).toFixed(1) + ' GB';

interface Pt {
  time: string;
  value: number;
}
interface HistPt {
  time: string;
  type: string;
  value: number;
  procs: string;
}

export default defineComponent({
  name: 'Monitor',
  setup() {
    const cpuRef = ref<HTMLDivElement>();
    const memRef = ref<HTMLDivElement>();
    const histRef = ref<HTMLDivElement>();
    const disks = ref<DiskInfo[]>([]);

    let cpuArea: Area | null = null;
    let memArea: Area | null = null;
    let histLine: Line | null = null;
    let timer: number | null = null;
    const cpuPts: Pt[] = [];
    const memPts: Pt[] = [];
    let seq = 0;

    const poll = async () => {
      try {
        const s = await getSystemStats();
        seq += 1;
        const t = String(seq);
        cpuPts.push({ time: t, value: Number(s.cpu.toFixed(1)) });
        const pct = s.memTotal > 0 ? (s.memUsed / s.memTotal) * 100 : 0;
        memPts.push({ time: t, value: Number(pct.toFixed(1)) });
        if (cpuPts.length > MAX_POINTS) {
          cpuPts.shift();
          memPts.shift();
        }
        disks.value = s.disks;
        cpuArea?.changeData([...cpuPts]);
        memArea?.changeData([...memPts]);
      } catch {
        /* ignore */
      }
    };

    const renderHistory = (samples: MonitorSample[]) => {
      const data: HistPt[] = [];
      for (const s of samples) {
        const t = new Date(s.ts * 1000).toLocaleTimeString();
        const memPct = s.memTotal > 0 ? Number(((s.memUsed / s.memTotal) * 100).toFixed(1)) : 0;
        data.push({ time: t, type: 'CPU', value: Number(s.cpu.toFixed(1)), procs: s.procs });
        data.push({ time: t, type: '内存', value: memPct, procs: s.procs });
      }
      histLine?.changeData(data);
    };

    const loadHistory = async (hours: number) => {
      try {
        renderHistory(await listMonitorHistory(hours));
      } catch {
        /* ignore */
      }
    };
    const onClear = async () => {
      await clearMonitorHistory();
      ElMessage.success('已清空监控历史');
      await loadHistory(1);
    };

    onMounted(() => {
      if (cpuRef.value) {
        cpuArea = new Area(cpuRef.value, {
          data: [],
          xField: 'time',
          yField: 'value',
          height: 220,
          smooth: true,
          meta: { value: { min: 0, max: 100 } },
          line: { color: '#5B8FF9' },
          areaStyle: { fill: '#5B8FF9', fillOpacity: 0.2 },
        });
        cpuArea.render();
      }
      if (memRef.value) {
        memArea = new Area(memRef.value, {
          data: [],
          xField: 'time',
          yField: 'value',
          height: 220,
          smooth: true,
          meta: { value: { min: 0, max: 100 } },
          line: { color: '#5AD8A6' },
          areaStyle: { fill: '#5AD8A6', fillOpacity: 0.2 },
        });
        memArea.render();
      }
      if (histRef.value) {
        histLine = new Line(histRef.value, {
          data: [],
          xField: 'time',
          yField: 'value',
          seriesField: 'type',
          height: 320,
          smooth: true,
          meta: { value: { min: 0, max: 100 } },
          tooltip: {
            customContent: (title: string, items: { data: HistPt }[]) => {
              if (!items || !items.length) return '';
              const lines = items
                .map((it) => `${it.data.type}: ${it.data.value}%`)
                .join('<br/>');
              let top = '';
              try {
                const arr = JSON.parse(items[0].data.procs || '[]') as {
                  name: string;
                  cpu: number;
                }[];
                if (arr.length) {
                  top =
                    '<br/><br/>Top 进程:<br/>' +
                    arr.map((p) => `${p.name}(${p.cpu.toFixed(1)}%)`).join('<br/>');
                }
              } catch {
                /* ignore */
              }
              return `${title}<br/>${lines}${top}`;
            },
          },
        });
        histLine.render();
      }
      poll();
      timer = window.setInterval(poll, 2000);
      loadHistory(1);
    });

    onUnmounted(() => {
      if (timer) clearInterval(timer);
      cpuArea?.destroy();
      memArea?.destroy();
      histLine?.destroy();
    });

    return () => (
      <div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ width: '50%' }}>
            <h4 style={{ margin: '0 0 4px 0' }}>CPU（实时）</h4>
            <div ref={cpuRef} style={{ width: '100%', height: '220px' }} />
          </div>
          <div style={{ width: '50%' }}>
            <h4 style={{ margin: '0 0 4px 0' }}>内存（实时）</h4>
            <div ref={memRef} style={{ width: '100%', height: '220px' }} />
          </div>
        </div>

        <h3 style={{ marginTop: '12px' }}>
          历史{' '}
          <span style={{ marginLeft: '12px' }}>
            <ElButton size="small" onClick={() => loadHistory(1)}>
              1h
            </ElButton>
            <ElButton size="small" onClick={() => loadHistory(24)}>
              24h
            </ElButton>
            <ElButton size="small" onClick={() => loadHistory(168)}>
              7d
            </ElButton>
            <ElButton size="small" type="danger" onClick={onClear}>
              清空
            </ElButton>
          </span>
        </h3>
        <div ref={histRef} style={{ width: '100%', height: '320px' }} />

        <h3 style={{ marginTop: '12px' }}>磁盘</h3>
        {disks.value.map((d) => {
          const used = d.total - d.available;
          const pct = d.total > 0 ? (used / d.total) * 100 : 0;
          return (
            <div key={d.name} style={{ marginBottom: '6px' }}>
              <span>
                {d.mountPoint} {d.name}：{fmt(used)} / {fmt(d.total)}（{pct.toFixed(0)}%）
              </span>
            </div>
          );
        })}
      </div>
    );
  },
});
