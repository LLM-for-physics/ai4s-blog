import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AI x Physics 课程主页',
  description: '人工智能与物理学交叉学科课程文档',
  lang: 'zh-CN',
  
  // 网站基础配置
  base: '/',
  cleanUrls: true,
  lastUpdated: true,
  
  // 确保客户端水合正常工作
  appearance: true,
  
  // 头部配置
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
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
      { text: '课程', link: '/course/introduction' },
      { text: '环境配置', link: '/setup/overview' },
      { text: '计算机基础', link: '/computer-basic/overview' },
      { text: '作业', link: '/assignments/overview' },
      { text: '资源', link: '/resources/links' },
      { text: 'LLM 网关', link: '/course/llm-gateway' }
    ],

    // 侧边栏
    sidebar: {
      '/course/': [
        {
          text: '课程介绍',
          items: [
            { text: '课程概述', link: '/course/introduction' },
            { text: '课程大纲', link: '/course/syllabus' },
            { text: '课程讲义', link: '/course/slides' },
            { text: '评分标准', link: '/course/grading' },
            { text: 'LLM 网关', link: '/course/llm-gateway' }
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
            { text: 'RAG', link: '/course/llm-agent/rag' }
          ]
        },
        {
          text: 'AI 基础',
          items: [
            { text: '神经网络', link: '/course/ai/neural-network' },
            { text: 'PyTorch 与深度学习', link: '/course/ai/torch' },
          ]
        }
      ],
      '/setup/': [
        {
          text: '环境配置',
          items: [
            { text: '配置概述', link: '/setup/overview' },
            { text: '服务器使用', link: '/setup/server' },
            { text: '开发环境', link: '/setup/development' },
            { text: '常见问题', link: '/setup/troubleshooting' }
          ]
        }
      ],
      '/computer-basic/': [
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
      ],
      '/assignments/': [
        {
          text: '作业指南',
          items: [
            { text: '作业概述', link: '/assignments/overview' },
            { text: '作业1: 编写一个 LLM 多轮对话的 Python 程序', link: '/assignments/assignment-1' },
            { text: '作业2: LLM Agent 项目实践', link: '/assignments/assignment-2' },
            { text: '作业3: 待定', link: '/assignments/assignment-3' },
            { text: '提交方式', link: '/assignments/submission' },
            { text: 'cline 指南', link: '/assignments/cline' }
          ]
        }
      ],
      '/resources/': [
        {
          text: '资源',
          items: [
            { text: 'LLM 网关', link: '/course/llm-gateway' },
            { text: '相关链接', link: '/resources/links' },
            { text: 'FAQ', link: '/resources/faq' }
          ]
        }
      ]
    },

    // 社交链接
    socialLinks: [
      { icon: 'github', link: 'https://github.com/LLM-for-physics/ai4s-blog' }
    ],

    // 页脚
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 AI x Physics Course Team'
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
    math: true
  },

  // Vite 配置
  vite: {
    // 将 .py 和 .txt 文件作为静态资源处理
    assetsInclude: ['**/*.py', '**/*.txt', '**/*.xlsx', '**/*.pdf'],
    server: {
      fs: {
        allow: ['..']
      }
    },
    define: {
      __VUE_PROD_DEVTOOLS__: false
    },
    build: {
      minify: 'terser',
      rollupOptions: {
        output: {
          manualChunks: {
            'vue-vendor': ['vue']
          }
        }
      },
      terserOptions: {
        compress: {
          drop_console: false,
          drop_debugger: false
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
