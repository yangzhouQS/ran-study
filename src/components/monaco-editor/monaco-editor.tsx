import { defineComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import loader from '@monaco-editor/loader';

let monacoReady: Promise<any> | null = null;
function getMonaco() {
  if (!monacoReady) {
    monacoReady = loader.init();
  }
  return monacoReady;
}

export default defineComponent({
  name: 'MonacoEditor',
  props: {
    modelValue: { type: String, default: '' },
    language: { type: String, default: 'ini' },
    theme: { type: String, default: 'vs-dark' },
    readOnly: { type: Boolean, default: false },
    height: { type: String, default: '300px' },
    fontSize: { type: Number, default: 13 },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const containerRef = ref<HTMLDivElement>();
    let editor: any = null;

    onMounted(async () => {
      if (!containerRef.value) return;
      const monaco = await getMonaco();
      editor = monaco.editor.create(containerRef.value, {
        value: props.modelValue,
        language: props.language,
        theme: props.theme,
        readOnly: props.readOnly,
        minimap: { enabled: false },
        fontSize: props.fontSize,
        lineHeight: 20,
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        tabSize: 2,
        lineNumbersMinChars: 3,
        scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
      });
      editor.onDidChangeModelContent(() => {
        const v = editor.getValue();
        if (v !== props.modelValue) {
          emit('update:modelValue', v);
        }
      });
    });

    watch(
      () => props.modelValue,
      (v) => {
        if (editor && v !== editor.getValue()) {
          editor.setValue(v || '');
        }
      },
    );

    watch(
      () => props.language,
      async (lang) => {
        if (editor) {
          const monaco = await getMonaco();
          const model = editor.getModel();
          if (model) monaco.editor.setModelLanguage(model, lang);
        }
      },
    );

    onUnmounted(() => {
      editor?.dispose();
      editor = null;
    });

    return () => (
      <div
        ref={containerRef}
        style={{
          height: props.height,
          border: '1px solid #383838',
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      />
    );
  },
});
