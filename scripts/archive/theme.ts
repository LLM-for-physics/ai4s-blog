import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import { h } from 'vue'
import { Mermaid } from '@leelaa/vitepress-plugin-extended'
import CodeFileViewer from '../components/CodeFileViewer.vue'
import './custom.css'
import './archive.css'

export default {
  extends: DefaultTheme,
  Layout() {
    const { theme } = useData()
    return h(DefaultTheme.Layout, null, {
      'layout-top': () => h('aside', {
        class: 'archive-banner', role: 'note',
        style: 'position:fixed;top:0;left:0;right:0;z-index:40;min-height:48px;padding:12px 20px;text-align:center;background:var(--vp-c-warning-soft);color:var(--vp-c-text-1);border-bottom:1px solid var(--vp-c-divider)'
      }, [
        `这是 ${theme.value.archiveLabel} 学期的归档页面，内容不再更新。 `,
        h('a', { href: 'https://aiphy.pku.edu.cn/', style: 'text-decoration:underline;font-weight:600' }, '前往最新版本 →')
      ])
    })
  },
  enhanceApp({ app }) {
    app.component('CodeFileViewer', CodeFileViewer)
    app.component('Mermaid', Mermaid)
  }
}
