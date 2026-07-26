import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import * as echarts from 'echarts';
import { ElButton, ElMessage } from 'element-plus';
import {
  clearMonitorHistory,
  getSystemStats,
  listMonitorHistory,
} from '@/api/monitor-api';
import type { DiskInfo, MonitorSample } from '@/types/api-type';

const MAX_POINTS = 60;

export default defineComponent({
  name: 'Monitor',
  setup() {
    const cpuRef = ref<HTMLDivElement>();
    const memRef = ref<HTMLDivElement>();
    const histRef = ref<HTMLDivElement>();
    const disks = ref<DiskInfo[]>([]);

    let cpuChart: echarts.ECharts | null = null;
    let memChart: echarts.ECharts | null = null;
    let histChart: echarts.ECharts | null = null;
    let timer: number | null = null;
    const cpuData: number[] = [];
    const memData: number[] = [];
    const labels: string[] = [];
    let seq = 0;

    const lineOption = (title: string, data: number[]) =>
      ({
        title: { text: title, left: 'left', textStyle: { fontSize: 14 } },
        xAxis: { type: 'category', data: labels, show: false },
        yAxis: { type: 'value', min: 0, max: 100 },
        series: [{ data, type: 'line', smooth: true, areaStyle: {} }],
        tooltip: { trigger: 'axis' },
      }) as unknown as echarts.EChartsCoreOption;

    const fmt = (b: number) => (b / 1024 ** 3).toFixed(1) + ' GB';

    const poll = async () => {
      try {
        const s = await getSystemStats();
        seq += 1;
        labels.push(String(seq));
        cpuData.push(Number(s.cpu.toFixed(1)));
        const pct = s.memTotal > 0 ? (s.memUsed / s.memTotal) * 100 : 0;
        const memPct = Number(pct.toFixed(1));
        memData.push(memPct);
        disks.value = s.disks;
        if (cpuData.length > MAX_POINTS) {
          cpuData.shift();
          memData.shift();
          labels.shift();
        }
        const lastCpu = cpuData[cpuData.length - 1] ?? 0;
        cpuChart?.setOption(lineOption(`CPU ${lastCpu}%`, cpuData));
        memChart?.setOption(lineOption(`内存 ${memPct}%`, memData));
      } catch {
        /* ignore */
      }
    };

    const loadHistory = async (hours: number) => {
      try {
        const samples = await listMonitorHistory(hours);
        renderHistory(samples);
      } catch {
        /* ignore */
      }
    };

    const renderHistory = (samples: MonitorSample[]) => {
      const xs = samples.map((s) => new Date(s.ts * 1000).toLocaleTimeString());
      const cpu = samples.map((s) => Number(s.cpu.toFixed(1)));
      const mem = samples.map((s) =>
        s.memTotal > 0 ? Number(((s.memUsed / s.memTotal) * 100).toFixed(1)) : 0,
      );
      const procs = samples.map((s) => {
        try {
          const arr = JSON.parse(s.procs) as { name: string; cpu: number }[];
          return arr.map((p) => `${p.name}(${p.cpu.toFixed(1)}%)`).join('\n');
        } catch {
          return '';
        }
      });
      histChart?.setOption(
        {
          title: { text: `历史（最近 ${samples.length} 个样本）`, textStyle: { fontSize: 14 } },
          tooltip: {
            trigger: 'axis',
            formatter: (params: unknown) => {
              const arr = params as { dataIndex: number; seriesName: string; value: number }[];
              if (!arr.length) return '';
              const i = arr[0].dataIndex;
              const top = procs[i] ? `\n\nTop 进程:\n${procs[i]}` : '';
              return arr
                .map((p) => `${p.seriesName}: ${p.value}%`)
                .join('<br/>') + top;
            },
          },
          legend: { data: ['CPU', '内存'] },
          xAxis: { type: 'category', data: xs },
          yAxis: { type: 'value', min: 0, max: 100 },
          series: [
            { name: 'CPU', type: 'line', smooth: true, data: cpu },
            { name: '内存', type: 'line', smooth: true, data: mem },
          ],
        } as unknown as echarts.EChartsCoreOption,
        true,
      );
    };

    const onClear = async () => {
      await clearMonitorHistory();
      ElMessage.success('已清空监控历史');
      await loadHistory(1);
    };

    onMounted(() => {
      if (cpuRef.value) cpuChart = echarts.init(cpuRef.value);
      if (memRef.value) memChart = echarts.init(memRef.value);
      if (histRef.value) histChart = echarts.init(histRef.value);
      poll();
      timer = window.setInterval(poll, 2000);
      loadHistory(1);
    });
    onUnmounted(() => {
      if (timer) clearInterval(timer);
      cpuChart?.dispose();
      memChart?.dispose();
      histChart?.dispose();
    });

    return () => (
      <div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div ref={cpuRef} style={{ width: '50%', height: '240px' }} />
          <div ref={memRef} style={{ width: '50%', height: '240px' }} />
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
                {d.name}：{fmt(used)} / {fmt(d.total)}（{pct.toFixed(0)}%）
              </span>
            </div>
          );
        })}
      </div>
    );
  },
});
