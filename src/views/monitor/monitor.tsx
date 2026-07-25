import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import * as echarts from 'echarts';
import { getSystemStats } from '@/api/monitor-api';
import type { DiskInfo } from '@/types/api-type';

const MAX_POINTS = 60;

export default defineComponent({
  name: 'Monitor',
  setup() {
    const cpuRef = ref<HTMLDivElement>();
    const memRef = ref<HTMLDivElement>();
    const disks = ref<DiskInfo[]>([]);

    let cpuChart: echarts.ECharts | null = null;
    let memChart: echarts.ECharts | null = null;
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
        /* ignore polling errors */
      }
    };

    onMounted(() => {
      if (cpuRef.value) cpuChart = echarts.init(cpuRef.value);
      if (memRef.value) memChart = echarts.init(memRef.value);
      poll();
      timer = window.setInterval(poll, 2000);
    });
    onUnmounted(() => {
      if (timer) clearInterval(timer);
      cpuChart?.dispose();
      memChart?.dispose();
    });

    return () => (
      <div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div ref={cpuRef} style={{ width: '50%', height: '280px' }} />
          <div ref={memRef} style={{ width: '50%', height: '280px' }} />
        </div>
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
