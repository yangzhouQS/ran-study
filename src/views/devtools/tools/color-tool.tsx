import { defineComponent, ref } from 'vue';
import { ElButton, ElInput, ElMessage } from 'element-plus';

export default defineComponent({
  name: 'ColorTool',
  setup() {
    const hex = ref('#1f6feb');
    const rgb = ref('31, 111, 235');
    const hsl = ref('217°, 83%, 52%');
    const cssVar = ref('--primary-color: #1f6feb;');

    const hexToRgb = (h: string): [number, number, number] | null => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h.trim());
      return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
    };

    const rgbToHex = (r: number, g: number, b: number): string => {
      return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
    };

    const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
      const rn = r / 255, gn = g / 255, bn = b / 255;
      const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
      let h = 0, s = 0;
      const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
          case gn: h = (bn - rn) / d + 2; break;
          case bn: h = (rn - gn) / d + 4; break;
        }
        h /= 6;
      }
      return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
    };

    const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
      h /= 360; s /= 100; l /= 100;
      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    };

    const updateFromHex = () => {
      const rgbArr = hexToRgb(hex.value);
      if (!rgbArr) {
        ElMessage.error('无效 HEX，如 #1f6feb');
        return;
      }
      const [r, g, b] = rgbArr;
      rgb.value = `${r}, ${g}, ${b}`;
      const [h, s, l] = rgbToHsl(r, g, b);
      hsl.value = `${h}°, ${s}%, ${l}%`;
      cssVar.value = `--color: ${hex.value};\n--color-rgb: ${r}, ${g}, ${b};\n--color-hsl: ${h}, ${s}%, ${l}%;`;
    };

    const updateFromRgb = () => {
      const parts = rgb.value.split(',').map((s) => parseInt(s.trim()));
      if (parts.length !== 3 || parts.some(isNaN)) {
        ElMessage.error('无效 RGB，如 31, 111, 235');
        return;
      }
      const [r, g, b] = parts as [number, number, number];
      hex.value = rgbToHex(r, g, b);
      const [h, s, l] = rgbToHsl(r, g, b);
      hsl.value = `${h}°, ${s}%, ${l}%`;
      cssVar.value = `--color: ${hex.value};\n--color-rgb: ${r}, ${g}, ${b};\n--color-hsl: ${h}, ${s}%, ${l}%;`;
    };

    const updateFromHsl = () => {
      const m = hsl.value.match(/(\d+)\D+(\d+)\D+(\d+)/);
      if (!m) {
        ElMessage.error('无效 HSL，如 217°, 83%, 52%');
        return;
      }
      const [h, s, l] = [+m[1], +m[2], +m[3]];
      const [r, g, b] = hslToRgb(h, s, l);
      hex.value = rgbToHex(r, g, b);
      rgb.value = `${r}, ${g}, ${b}`;
      cssVar.value = `--color: ${hex.value};\n--color-rgb: ${r}, ${g}, ${b};\n--color-hsl: ${h}, ${s}%, ${l}%;`;
    };

    const copy = (text: string) => {
      navigator.clipboard.writeText(text);
      ElMessage.success('已复制');
    };

    const Field = ({ label, children }: { label: string; children?: any }) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ width: '50px', fontSize: '13px', color: '#606266' }}>{label}</span>
        {children}
      </div>
    );

    return () => (
      <div style={{ display: 'flex', gap: '24px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#909399', marginBottom: '4px' }}>预览</div>
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '12px',
              background: hex.value,
              border: '2px solid #e0e0e0',
              cursor: 'pointer',
            }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'color';
              input.value = hex.value;
              input.oninput = () => {
                hex.value = input.value;
                updateFromHex();
              };
              input.click();
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="HEX">
            <ElInput modelValue={hex.value} onInput={(v: string) => { hex.value = v; }} style={{ flex: 1 }} />
            <ElButton size="small" onClick={updateFromHex}>→</ElButton>
          </Field>
          <Field label="RGB">
            <ElInput modelValue={rgb.value} onInput={(v: string) => { rgb.value = v; }} style={{ flex: 1 }} placeholder="31, 111, 235" />
            <ElButton size="small" onClick={updateFromRgb}>→</ElButton>
          </Field>
          <Field label="HSL">
            <ElInput modelValue={hsl.value} onInput={(v: string) => { hsl.value = v; }} style={{ flex: 1 }} placeholder="217°, 83%, 52%" />
            <ElButton size="small" onClick={updateFromHsl}>→</ElButton>
          </Field>
          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: '#909399' }}>CSS 变量</span>
              <ElButton text size="small" onClick={() => copy(cssVar.value)}>复制</ElButton>
            </div>
            <pre style={{
              background: '#1e1e1e', color: '#ce9178', padding: '8px 12px',
              borderRadius: '6px', fontSize: '12px', fontFamily: 'Consolas, monospace',
              margin: '0', whiteSpace: 'pre-wrap',
            }}>
              {cssVar.value}
            </pre>
          </div>
        </div>
      </div>
    );
  },
});
