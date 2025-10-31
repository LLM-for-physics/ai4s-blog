import DefaultTheme from 'vitepress/theme'
import CodeFileViewer from '../components/CodeFileViewer.vue'
import ScoreQuery from '../components/ScoreQuery.vue'
import { Mermaid } from '@leelaa/vitepress-plugin-extended'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // 注册全局组件
    app.component('CodeFileViewer', CodeFileViewer)
    app.component('ScoreQuery', ScoreQuery)
    app.component('Mermaid', Mermaid)
  }
}
