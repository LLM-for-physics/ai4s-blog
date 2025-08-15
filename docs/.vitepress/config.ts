import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AI x Physics 课程知识库',
  description: '人工智能与物理学交叉学科课程文档',
  lang: 'zh-CN',
  
  // 网站基础配置
  base: '/',
  cleanUrls: true,
  lastUpdated: true,
  
  // 头部配置
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3c82f6' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:locale', content: 'zh-CN' }],
    ['meta', { name: 'og:title', content: 'AI x Physics 课程知识库' }],
    ['meta', { name: 'og:description', content: '人工智能与物理学交叉学科课程文档' }]
  ],

  // 主题配置
  themeConfig: {
    logo: '/logo.svg',
    
    // 导航栏
    nav: [
      { text: '首页', link: '/' },
      { text: '课程介绍', link: '/course/introduction' },
      { text: '环境配置', link: '/setup/overview' },
      { text: '作业', link: '/assignments/overview' },
      { text: '资源', link: '/resources/links' }
    ],

    // 侧边栏
    sidebar: {
      '/course/': [
        {
          text: '课程介绍',
          items: [
            { text: '课程概述', link: '/course/introduction' },
            { text: '课程大纲', link: '/course/syllabus' },
            { text: '评分标准', link: '/course/grading' }
          ]
        }
      ],
      '/setup/': [
        {
          text: '环境配置',
          items: [
            { text: '配置概述', link: '/setup/overview' },
            { text: '服务器使用', link: '/setup/server' },
            { text: '计算机基础', link: '/setup/computer-basics' },
            { text: '开发环境', link: '/setup/development' },
            { text: '常见问题', link: '/setup/troubleshooting' }
          ]
        }
      ],
      '/assignments/': [
        {
          text: '作业指南',
          items: [
            { text: '作业概述', link: '/assignments/overview' },
            { text: '作业1: 基础概念', link: '/assignments/assignment-1' },
            { text: '作业2: 数据分析', link: '/assignments/assignment-2' },
            { text: '作业3: 机器学习', link: '/assignments/assignment-3' },
            { text: '提交方式', link: '/assignments/submission' }
          ]
        }
      ],
      '/resources/': [
        {
          text: '学习资源',
          items: [
            { text: '相关链接', link: '/resources/links' },
            { text: '推荐书籍', link: '/resources/books' },
            { text: '工具软件', link: '/resources/tools' },
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
    build: {
      rollupOptions: {
        external: ['vue', 'vue/server-renderer']
      }
    }
  }
})
