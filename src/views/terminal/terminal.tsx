import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { listen } from '@tauri-apps/api/event';
import { closeTerminal, openTerminal, writeTerminal } from '@/api/terminal-api';
import type { TerminalOutput } from '@/types/api-type';

export default defineComponent({
  name: 'TerminalView',
  setup() {
    const container = ref<HTMLDivElement>();
    let term: Terminal | null = null;
    let fit: FitAddon | null = null;
    let unlisten: (() => void) | null = null;
    let sessionId = '';

    onMounted(async () => {
      if (!container.value) return;
      term = new Terminal({ fontSize: 13 });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container.value);
      fit.fit();
      sessionId = await openTerminal();
      term.onData((data) => {
        writeTerminal(sessionId, data);
      });
      unlisten = await listen<TerminalOutput>('terminal://output', (e) => {
        if (e.payload && e.payload.sessionId === sessionId) {
          term?.write(e.payload.data);
        }
      });
    });

    onUnmounted(() => {
      unlisten?.();
      if (sessionId) closeTerminal(sessionId);
      term?.dispose();
    });

    return () => (
      <div>
        <div ref={container} style={{ height: '600px', background: '#000' }} />
      </div>
    );
  },
});
