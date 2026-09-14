import { defineConfig } from 'vitepress'
import { loadEnv } from 'vite'
import { MermaidPlugin } from '@leelaa/vitepress-plugin-extended'
import { pageContentApiPlugin } from './plugins/pageContentApi'
import terms from '../../terms.json'
import { preparePublic } from '../../scripts/public-safety.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const llmEnv = { ...loadEnv('development', process.cwd(), 'LLM_'), ...process.env }

const configDir = path.dirname(fileURLToPath(import.meta.url))
const publicDir = preparePublic(path.resolve(configDir, '../public'), path.resolve(configDir, '../../.site-public'))

// Shared navigation groups keep existing document URLs in their new sections.
const courseSidebar = [
  {
    text: '课程介绍',
    items: [
      { text: '课程概述', link: '/course/introduction' },
      { text: '课程大纲', link: '/course/syllabus' },
      { text: '课程讲义', link: '/course/slides' },
      { text: '评分标准', link: '/course/grading' },
      // { text: '成绩查询', link: '/score-query' },
    ]
  },
  {
    text: '作业',
    items: [
      { text: '作业概述', link: '/assignments/overview' },
      { text: '提交方式', link: '/assignments/submission' }
    ]
  }
]

const courseResourcesSidebar = [
  {
    text: '课程资源',
    items: [
      { text: 'LLM 网关', link: '/course/llm-gateway' },
      { text: 'AI 实践', link: '/course/ai-practice' },
      { text: 'SCOW平台Aether使用', link: '/course/scow-aether' }
    ]
  }
]

const referenceSidebar = [
  {
    text: '计算机基础',
    items: [
      { text: '概述', link: '/computer-basic/overview' },
      // { text: '科学上网', link: '/computer-basic/vpn' },
      { text: 'git 基础', link: '/computer-basic/git-usage' },
      { text: 'SSH 使用指南', link: '/computer-basic/ssh' },
      { text: 'Python 基础', link: '/computer-basic/python' },
      { text: 'VS Code 介绍', link: '/computer-basic/vscode' },
      { text: 'Linux 系统', link: '/computer-basic/linux' }
    ]
  },
  {
    text: 'AI 基础',
    items: [
      { text: '神经网络', link: '/course/ai/neural-network' },
      { text: 'PyTorch 与深度学习', link: '/course/ai/torch' },
    ]
  },
  {
    text: 'LLM agent 技术文档',
    items: [
      { text: '概述', link: '/course/llm-agent/overview' },
      { text: '基础 API 调用', link: '/course/llm-agent/api-basics' },
      { text: '高级用法', link: '/course/llm-agent/advanced-usage' },
      { text: '工具调用', link: '/course/llm-agent/tool-calling' },
      { text: 'MCP Server', link: '/course/llm-agent/mcp-server' },
      { text: 'RAG', link: '/course/llm-agent/rag' },
    ]
  }
]

export default defineConfig({
  title: 'AI x Physics 课程主页',
  description: '人工智能与物理学交叉学科课程文档',
  lang: 'zh-CN',
  
  // 指定源文件目录
  srcDir: '.',
  
  // 网站基础配置
  base: '/',
  cleanUrls: true,
  lastUpdated: true,
  
  // 确保客户端水合正常工作
  appearance: true,
  
  // 头部配置
  head: [
    ['link', { rel: 'icon', href: '/image.svg' }],
    ['meta', { name: 'theme-color', content: '#3c82f6' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:locale', content: 'zh-CN' }],
    ['meta', { name: 'og:title', content: 'AI x Physics 课程主页' }],
    ['meta', { name: 'og:description', content: '人工智能与物理学交叉学科课程文档' }]
  ],

  // 主题配置
  themeConfig: {    
    // 导航栏
    nav: [
      { text: '首页', link: '/' },
      { text: '课程', link: '/course/introduction', activeMatch: '^/(?:course/(?!ai/|llm-agent/|(?:llm-gateway|ai-practice|scow-aether)(?:$|[/.]))|assignments/)' },
      { text: '课程资源', link: '/course/llm-gateway', activeMatch: '^/(?:setup/|course/(?:llm-gateway|ai-practice|scow-aether)(?:$|[/.]))' },
      { text: '参考文档', link: '/computer-basic/overview', activeMatch: '^/(?:computer-basic|course/(?:ai|llm-agent))/' },
      { text: `版本: ${terms.current.label}`, items: [
        { text: `${terms.current.label}（当前）`, link: 'https://aiphy.pku.edu.cn/', target: '_self' },
        ...terms.archives.map(term => ({ text: `${term.label}（归档）`, link: `https://aiphy.pku.edu.cn/archive/${term.id}/`, target: '_self' }))
      ] },
    ],

    // Specific course paths belong to reference documents or course resources.
    sidebar: {
      '/course/ai/': referenceSidebar,
      '/course/llm-agent/': referenceSidebar,
      '/computer-basic/': referenceSidebar,
      '/course/llm-gateway': courseResourcesSidebar,
      '/course/ai-practice': courseResourcesSidebar,
      '/course/scow-aether': courseResourcesSidebar,
      '/course/': courseSidebar,
      '/assignments/': courseSidebar,
      '/setup/': courseResourcesSidebar,
    },

    // 社交链接
    socialLinks: [
      { icon: 'github', link: 'https://github.com/LLM-for-physics/ai4s-blog' }
    ],

    // 页脚
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025-2026 AI x Physics Course Team'
    },

    // 搜索
    search: {
      provider: 'local'
    },

    // 编辑链接
    editLink: {
      pattern: 'https://github.com/LLM-for-physics/ai4s-blog/edit/master/docs/:path',
      text: '在 GitHub 上编辑此页'
    },

    // 上次更新
    lastUpdated: {
      text: '最后更新于',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium'
      }
    },

    // 文档页脚导航
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    // 大纲标题
    outline: {
      level: [2, 3, 4],
      label: '页面导航'
    },

    // 返回顶部
    returnToTopLabel: '回到顶部',

    // 暗色模式切换
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式'
  },

  // Markdown 配置
  markdown: {
    lineNumbers: true,
    math: true,
    config: (md) => {
      MermaidPlugin(md)
    }
  },

  // Vite 配置
  vite: {
    publicDir,
    plugins: [
      pageContentApiPlugin()
    ],
    server: {
      fs: {
        allow: ['..']
      },
      // 开发环境代理配置：将 /api/llm/ 转发到环境变量配置的 API 地址
      proxy: {
        '/api/llm': {
          target: llmEnv.LLM_BASE_URL || 'https://api.openai.com/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/llm/, ''),
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              // Server-only credentials; never accept a browser-supplied credential.
              proxyReq.removeHeader('Authorization')
              const apiKey = llmEnv.LLM_API_KEY
              if (apiKey) {
                proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
              }
            })
          }
        }
      }
    },
    define: {
      __VUE_PROD_DEVTOOLS__: false
    },
    build: {
      minify: 'terser',
      chunkSizeWarningLimit: 1000,
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      }
    },
    ssr: {
      noExternal: ['vue']
    },
    optimizeDeps: {
      include: ['vue']
    }
  }
})
