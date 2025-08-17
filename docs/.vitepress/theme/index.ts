import DefaultTheme from 'vitepress/theme'
import CodeFileViewer from '../components/CodeFileViewer.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // 注册全局组件
    app.component('CodeFileViewer', CodeFileViewer)
  }
}
