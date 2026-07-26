import { defineComponent, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { listen } from '@tauri-apps/api/event';
import { ElButton, ElTabPane, ElTabs } from 'element-plus';
import { closeTerminal, openTerminal, writeTerminal } from '@/api/terminal-api';
import type { TerminalOutput } from '@/types/api-type';

interface Sess {
  id: string;
  title: string;
}

export default defineComponent({
  name: 'TerminalView',
  setup() {
    const sessions = ref<Sess[]>([]);
    const active = ref('');
    const terms = new Map<string, Terminal>();
    const fits = new Map<string, FitAddon>();
    const containers: Record<string, HTMLDivElement | null> = {};
    let masterUnlisten: (() => void) | null = null;

    const initSession = async (sid: string) => {
      await nextTick();
      const el = containers[sid];
      if (!el) return;
      const term = new Terminal({ fontSize: 13 });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(el);
      fit.fit();
      term.onData((data) => {
        writeTerminal(sid, data);
      });
      terms.set(sid, term);
      fits.set(sid, fit);
    };

    const newTab = async () => {
      const id = await openTerminal();
      sessions.value.push({ id, title: `shell ${sessions.value.length + 1}` });
      active.value = id;
      await initSession(id);
    };

    const closeTab = async (sid: string) => {
      await closeTerminal(sid);
      terms.get(sid)?.dispose();
      terms.delete(sid);
      fits.delete(sid);
      sessions.value = sessions.value.filter((s) => s.id !== sid);
      if (active.value === sid && sessions.value.length) {
        active.value = sessions.value[sessions.value.length - 1].id;
        await nextTick();
        fits.get(active.value)?.fit();
      }
    };

    const onActive = async (id: string | number) => {
      const sid = String(id);
      active.value = sid;
      await nextTick();
      fits.get(sid)?.fit();
    };

    onMounted(async () => {
      masterUnlisten = await listen<TerminalOutput>('terminal://output', (e) => {
        if (e.payload) {
          terms.get(e.payload.sessionId)?.write(e.payload.data);
        }
      });
      await newTab();
    });
    onUnmounted(() => {
      masterUnlisten?.();
      for (const s of sessions.value) {
        closeTerminal(s.id);
        terms.get(s.id)?.dispose();
      }
    });

    return () => (
      <div>
        <div style={{ marginBottom: '6px' }}>
          <ElButton size="small" type="primary" onClick={newTab}>
            新建标签
          </ElButton>
        </div>
        <ElTabs modelValue={active.value} onUpdate:modelValue={(v: string | number) => onActive(v)} type="card">
          {sessions.value.map((s) => (
            <ElTabPane key={s.id} name={s.id} label={s.title}>
              <div style={{ position: 'relative' }}>
                <div
                  ref={(el) => {
                    containers[s.id] = (el as HTMLDivElement | null) ?? null;
                  }}
                  style={{ height: '500px', background: '#000' }}
                />
                <ElButton
                  size="small"
                  type="danger"
                  style={{ position: 'absolute', top: '4px', right: '4px' }}
                  onClick={() => closeTab(s.id)}
                >
                  关闭
                </ElButton>
              </div>
            </ElTabPane>
          ))}
        </ElTabs>
      </div>
    );
  },
});
