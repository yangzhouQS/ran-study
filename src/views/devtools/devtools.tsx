import { defineComponent, ref } from 'vue';
import { ElTabPane, ElTabs } from 'element-plus';
import JsonTool from './tools/json-tool';
import CodecTool from './tools/codec-tool';
import TimestampTool from './tools/timestamp-tool';
import UuidTool from './tools/uuid-tool';
import JwtTool from './tools/jwt-tool';
import RegexTool from './tools/regex-tool';
import HashTool from './tools/hash-tool';
import ColorTool from './tools/color-tool';
import CronTool from './tools/cron-tool';

export default defineComponent({
  name: 'DevTools',
  setup() {
    const activeTab = ref('json');
    return () => (
      <ElTabs v-model={activeTab.value} type="border-card">
        <ElTabPane label="JSON 格式化" name="json">
          <JsonTool />
        </ElTabPane>
        <ElTabPane label="Base64 / URL" name="codec">
          <CodecTool />
        </ElTabPane>
        <ElTabPane label="时间戳" name="timestamp">
          <TimestampTool />
        </ElTabPane>
        <ElTabPane label="UUID 生成" name="uuid">
          <UuidTool />
        </ElTabPane>
        <ElTabPane label="JWT 解码" name="jwt">
          <JwtTool />
        </ElTabPane>
        <ElTabPane label="正则测试" name="regex">
          <RegexTool />
        </ElTabPane>
        <ElTabPane label="Hash 计算" name="hash">
          <HashTool />
        </ElTabPane>
        <ElTabPane label="颜色工具" name="color">
          <ColorTool />
        </ElTabPane>
        <ElTabPane label="Cron 表达式" name="cron">
          <CronTool />
        </ElTabPane>
      </ElTabs>
    );
  },
});
