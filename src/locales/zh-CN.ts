import type { I18N } from '.'

const zhCN: I18N = {
  settings: {
    langCode: {
      title: '语言',
      description: '选择插件语言，重启 logseq 生效',
    },
    HandDrawn: {
      title: '手写字体',
      description: '自定义手写字体，重启 logseq 生效',
    },
    Normal: {
      title: '普通字体',
      description: '自定义普通字体，重启 logseq 生效',
    },
    Code: {
      title: '代码字体',
      description: '自定义代码字体，重启 logseq 生效',
    },
  },
  preview: {
    deleteButton: '删除预览和及画板文件',
    refreshButton: '刷新预览',
    editButton: '编辑画板',
    fullScreenButton: '全屏',
  },
  editor: {
    slidesMode: '幻灯片模式',
    exitButton: '保存并退出',
    slidesPreview: '幻灯片预览',
    slidesOverview: '幻灯片概览',
    slidesPrev: '上一张',
    slidesNext: '下一张',
    frameNotFound: '未找到画框',
    saveToast: {
      title: '保存中...',
      description: '当包含大量元素或图片时, 可能需要更长的时间。',
    },
  },
  createDrawing: {
    tag: '🎨 Excalidraw: 创建新画板',
    errorMsg: '创建画板失败',
  },
  common: {
    pageNotFound: '未找到画板对应的文件',
    untagged: '未分类',
  },
}

export default zhCN
