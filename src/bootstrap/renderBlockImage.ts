import type { Theme } from '@/components/Editor'
import { loadExcalidrawModule } from '@/lib/excalidrawLoader'
import { NEW_FILE_EXCALIDRAW_DATA } from '@/lib/constants'
import { getExcalidrawInfoFromPage } from '@/lib/utils'
import getI18N from '@/locales'
import type { ExcalidrawData } from '@/type'

// const DEMO_FILE_ORIGINAL_NAME = "excalidraw-2023-04-24-16-39-01";
const PAGE_LOOKUP_RETRY_COUNT = 10
const PAGE_LOOKUP_RETRY_DELAY = 300

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getPageWithRetry = async (pageName?: string) => {
  if (!pageName) return null

  for (let attempt = 0; attempt < PAGE_LOOKUP_RETRY_COUNT; attempt += 1) {
    const page = await logseq.Editor.getPage(pageName)
    if (page) return page

    await sleep(PAGE_LOOKUP_RETRY_DELAY)
  }

  return null
}

export const insertSVG = async (containerId: string, svg?: SVGSVGElement, excalidrawData?: ExcalidrawData) => {
  const theme = await logseq.App.getStateFromStore<Theme>('ui/theme')
  const { exportToSvg } = await loadExcalidrawModule()
  const _svg =
    svg ??
    (await exportToSvg(
      excalidrawData ?? {
        elements: [],
        appState: { exportWithDarkMode: theme === 'dark' },
        files: null,
      },
    ))
  setTimeout(() => {
    // remove svg if it exists
    const prevSvg = parent.document.getElementById(containerId)?.querySelector?.('.excalidraw-svg')
    if (prevSvg) prevSvg.remove()

    // insert preview img
    _svg.style.maxWidth = '100%'
    _svg.style.minWidth = '100px'
    _svg.style.height = 'auto'
    _svg.classList.add('excalidraw-svg')
    parent.document.getElementById(containerId)?.prepend?.(_svg)
  }, 0)
}

export const updateRenderedMetadata = async (containerId: string, pageName?: string) => {
  if (!pageName) return

  const page = await getPageWithRetry(pageName)
  const { rawBlocks } = await getExcalidrawInfoFromPage(pageName)
  const firstBlock = rawBlocks?.[0]
  const showTitle = firstBlock?.properties?.excalidrawPluginAlias ?? page?.originalName ?? pageName
  const showTag = firstBlock?.properties?.excalidrawPluginTag

  setTimeout(() => {
    const container = parent.document.getElementById(containerId)
    const titleNode = container?.querySelector?.('.excalidraw-title')
    const metaNode = container?.querySelector?.('.excalidraw-meta')
    const existingTagNode = container?.querySelector?.('.excalidraw-tag')

    if (titleNode) {
      titleNode.textContent = showTitle
      titleNode.setAttribute('title', showTitle)
      titleNode.setAttribute('data-page-name', page?.originalName ?? pageName)
    }

    if (!metaNode) return

    if (showTag) {
      if (existingTagNode) {
        existingTagNode.textContent = showTag
        existingTagNode.setAttribute('title', showTag)
      } else {
        const tagNode = parent.document.createElement('div')
        tagNode.className = 'excalidraw-tag'
        tagNode.textContent = showTag
        tagNode.setAttribute('title', showTag)
        metaNode.appendChild(tagNode)
      }
    } else {
      existingTagNode?.remove?.()
    }
  }, 0)
}

const bootRenderBlockImage = () => {
  const { preview: i18nPreview } = getI18N()
  // render: {{renderer excalidraw, excalidraw-2021-08-31-16-00-00}}
  logseq.App.onMacroRendererSlotted(async ({ slot, payload: { arguments: args, uuid } }) => {
    const slotType = args?.[0]
    if (slotType === 'excalidraw') {
      const pageName = args?.[1]
      console.log('[faiz:] === render pageName', pageName)

      const rendered = parent.document.getElementById(slot)?.childElementCount
      if (rendered) return

      const page = await getPageWithRetry(pageName)
      if (page === null) {
        return logseq.provideUI({
          key: `excalidraw-${slot}`,
          slot,
          reset: true,
          template: `🚨 Excalidraw: Page Not Found (${pageName})`,
        })
      }
      if (!page?.properties?.excalidrawPlugin) {
        return logseq.provideUI({
          key: `excalidraw-${slot}`,
          slot,
          reset: true,
          template: `🚨 Excalidraw: This page is not an excalidraw file (${pageName})`,
        })
      }

      // get excalidraw data
      const { excalidrawData, rawBlocks } = await getExcalidrawInfoFromPage(pageName)

      const { elements, appState, files } = excalidrawData
      const id = `excalidraw-${pageName}-${slot}`

      const isNewFile = elements?.length === 0 && appState === undefined
      const theme = await logseq.App.getStateFromStore<Theme>('ui/theme')
      const { exportToSvg } = await loadExcalidrawModule()

      const svg = await exportToSvg(
        isNewFile
          ? {
              ...NEW_FILE_EXCALIDRAW_DATA,
              appState: { exportWithDarkMode: theme === 'dark' },
            }
          : {
              elements,
              appState: {
                ...(appState ?? {}),
                exportWithDarkMode: theme === 'dark',
              },
              files,
            },
      )

      const firstBlock = rawBlocks?.[0]
      const showTitle = firstBlock?.properties?.excalidrawPluginAlias ?? page?.originalName
      const showTag = firstBlock?.properties?.excalidrawPluginTag
      logseq.provideUI({
        key: `excalidraw-${slot}`,
        slot,
        reset: true,
        template: `<div id="${id}" class="excalidraw-container">
            <div class="excalidraw-toolbar-container">
              <div class="excalidraw-meta">
                <a data-on-click="navPage" class="excalidraw-title" data-page-name="${page?.originalName}" title="${showTitle}">${showTitle}</a>
                ${showTag ? `<div class="excalidraw-tag" title="${showTag}">${showTag}</div>` : ''}
              </div>
              <div class="excalidraw-toolbar">
                <a data-on-click="delete" data-page-name="${page?.originalName}" data-block-id="${uuid}" title="${i18nPreview.deleteButton}">
                  <i class="ti ti-trash"></i>
                </a>
                <a data-on-click="refresh" data-page-name="${page?.originalName}" data-container-id="${id}" title="${i18nPreview.refreshButton}">
                  <i class="ti ti-refresh"></i>
                </a>
                <a data-on-click="edit" data-page-name="${page?.originalName}" data-container-id="${id}" title="${i18nPreview.editButton}">
                  <i class="ti ti-edit"></i>
                </a>
                <a data-on-click="fullscreen" data-page-name="${page?.originalName}" title="${i18nPreview.fullScreenButton}">
                  <i class="ti ti-maximize"></i>
                </a>
                </div>
            </div>
          </div>`,
      })

      insertSVG(id, svg)
    } else if (slotType === 'excalidraw-menu') {
      logseq.provideUI({
        key: `excalidraw-${slot}`,
        slot,
        reset: true,
        template: `WIP`,
      })
    }
  })

  logseq.provideStyle(`
  .excalidraw-container {
    position: relative;
    line-height: 0;
  }
  .excalidraw-container:hover .excalidraw-toolbar-container {
    opacity: 1;
  }
  .excalidraw-toolbar-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    padding: 10px 6px;
    background-image: linear-gradient(var(--ls-primary-background-color),transparent);
  }
  .excalidraw-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .excalidraw-title {
    line-height: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .excalidraw-tag {
    display: inline-flex;
    width: fit-content;
    max-width: 180px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 16px;
    background: color-mix(in srgb, var(--ls-primary-text-color) 12%, transparent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .excalidraw-toolbar {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .excalidraw-toolbar a {
    width: 18px;
    height: 18px;
    line-height: 0;
  }
  `)
}

export default bootRenderBlockImage
