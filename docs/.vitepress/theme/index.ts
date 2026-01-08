import DefaultTheme from 'vitepress/theme'
import CodeFileViewer from '../components/CodeFileViewer.vue'
import ScoreQuery from '../components/ScoreQuery.vue'
import AIAssistant from '../components/AIAssistant.vue'
import FeedbackSurvey from '../components/FeedbackSurvey.vue'
import { Mermaid } from '@leelaa/vitepress-plugin-extended'
import { h } from 'vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => [h(AIAssistant), h(FeedbackSurvey)]
    })
  },
  enhanceApp({ app }) {
    // 注册全局组件
    app.component('CodeFileViewer', CodeFileViewer)
    app.component('ScoreQuery', ScoreQuery)
    app.component('Mermaid', Mermaid)
    app.component('FeedbackSurvey', FeedbackSurvey)
  }
}
