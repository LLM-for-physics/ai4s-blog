import DefaultTheme from 'vitepress/theme'
import CodeFileViewer from '../components/CodeFileViewer.vue'
import AIAssistant from '../components/AIAssistant.vue'
import ImagePreview from '../components/ImagePreview.vue'
import CourseKeysPortal from '../components/CourseKeysPortal.vue'
import { Mermaid } from '@leelaa/vitepress-plugin-extended'
import { h } from 'vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => [h(AIAssistant), h(ImagePreview)]
    })
  },
  enhanceApp({ app }) {
    // 注册全局组件
    app.component('CodeFileViewer', CodeFileViewer)
    app.component('CourseKeysPortal', CourseKeysPortal)
    app.component('Mermaid', Mermaid)
  }
}
