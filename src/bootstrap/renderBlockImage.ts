import type { Theme } from '@/components/Editor'
import { loadExcalidrawModule } from '@/lib/excalidrawLoader'
import { NEW_FILE_EXCALIDRAW_DATA } from '@/lib/constants'
import { getExcalidrawInfoFromPage } from '@/lib/utils'
import getI18N from '@/locales'
import type { ExcalidrawData } from '@/type'

// const DEMO_FILE_ORIGINAL_NAME = "excalidraw-2023-04-24-16-39-01";
const PAGE_LOOKUP_RETRY_COUNT = 10
const PAGE_LOOKUP_RETRY_DELAY = 300
const STATUS_RETRY_INTERVAL = 1500
const STATUS_RETRY_MAX_ATTEMPTS = 8
const STATUS_RETRY_WINDOW_MS = STATUS_RETRY_INTERVAL * STATUS_RETRY_MAX_ATTEMPTS
const RENDER_PRESET_WIDTH = {
  inline: 420,
  card: 380,
  full: 820,
} as const
type RenderPreset = keyof typeof RENDER_PRESET_WIDTH
type RenderedSlotState = {
  pageName?: string
  preset: RenderPreset
  uuid?: string
  status: 'rendered' | 'status'
  missingCount?: number
  retryCount?: number
  retryUntil?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const trackedSlots = new Map<string, RenderedSlotState>()
const repairingSlots = new Set<string>()
let repairObserverAttached = false
let repairTimeoutId: number | null = null

const parseRenderPreset = (value?: string): RenderPreset => {
  if (value === 'inline' || value === 'full') return value
  return 'card'
}

const getRenderableExcalidrawData = (
  excalidrawData?: ExcalidrawData,
  theme?: Theme,
) => {
  const isNewFile = !excalidrawData?.elements?.length
  if (isNewFile) {
    return {
      ...NEW_FILE_EXCALIDRAW_DATA,
      appState: { exportWithDarkMode: theme === 'dark' },
    }
  }

  return (
    excalidrawData ?? {
      elements: [],
      appState: { exportWithDarkMode: theme === 'dark' },
      files: null,
    }
  )
}

const getPageWithRetry = async (pageName?: string) => {
  if (!pageName) return null

  for (let attempt = 0; attempt < PAGE_LOOKUP_RETRY_COUNT; attempt += 1) {
    const page = await logseq.Editor.getPage(pageName)
    if (page) return page

    await sleep(PAGE_LOOKUP_RETRY_DELAY)
  }

  return null
}

export const insertSVG = async (
  containerId: string,
  svg?: SVGSVGElement,
  excalidrawData?: ExcalidrawData,
  preset?: RenderPreset,
) => {
  const theme = await logseq.App.getStateFromStore<Theme>('ui/theme')
  const { exportToSvg } = await loadExcalidrawModule()
  const _svg =
    svg ??
    (await exportToSvg(getRenderableExcalidrawData(excalidrawData, theme)))
  setTimeout(() => {
    const container = parent.document.getElementById(containerId)
    const activePreset =
      preset ??
      parseRenderPreset(container?.getAttribute?.('data-preset') || undefined)
    // remove svg if it exists
    const prevSvg = container?.querySelector?.('.excalidraw-svg')
    if (prevSvg) prevSvg.remove()

    // insert preview img
    const intrinsicWidth =
      Number(_svg.getAttribute('width')) || RENDER_PRESET_WIDTH[activePreset]
    const targetWidth = Math.min(
      intrinsicWidth,
      RENDER_PRESET_WIDTH[activePreset],
    )
    _svg.style.width = `${targetWidth}px`
    _svg.style.maxWidth = '100%'
    _svg.style.height = 'auto'
    _svg.classList.add('excalidraw-svg')
    container?.prepend?.(_svg)
  }, 0)
}

export const updateRenderedMetadata = async (
  containerId: string,
  pageName?: string,
) => {
  if (!pageName) return

  const page = await getPageWithRetry(pageName)
  const { rawBlocks } = await getExcalidrawInfoFromPage(pageName)
  const firstBlock = rawBlocks?.[0]
  const showTitle =
    firstBlock?.properties?.excalidrawPluginAlias ??
    page?.originalName ??
    pageName
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

export const refreshRenderedPage = async (
  pageName?: string,
  excalidrawData?: ExcalidrawData,
) => {
  if (!pageName) return

  const titleNodes = Array.from(
    parent.document.querySelectorAll('.excalidraw-title'),
  ) as HTMLElement[]
  const targetContainers = titleNodes
    .filter((node) => node.dataset.pageName === pageName)
    .map((node) => node.closest('.excalidraw-container') as HTMLElement | null)
    .filter((container): container is HTMLElement => Boolean(container?.id))

  if (targetContainers.length === 0) return

  await Promise.all(
    targetContainers.map(async (container) => {
      await updateRenderedMetadata(container.id, pageName)
      if (excalidrawData) {
        await insertSVG(container.id, undefined, excalidrawData)
      }
    }),
  )
}

const renderStatus = ({
  slot,
  pageName,
  uuid,
  preset,
  message,
}: {
  slot: string
  pageName?: string
  uuid?: string
  preset: RenderPreset
  message: string
}) => {
  const id = `excalidraw-status-${slot}`
  const currentSlotState = trackedSlots.get(slot)
  trackedSlots.set(slot, {
    pageName,
    preset,
    uuid,
    status: 'status',
    missingCount: 0,
    retryCount:
      currentSlotState?.status === 'status'
        ? (currentSlotState.retryCount ?? 0)
        : 0,
    retryUntil:
      currentSlotState?.status === 'status'
        ? (currentSlotState.retryUntil ?? Date.now() + STATUS_RETRY_WINDOW_MS)
        : Date.now() + STATUS_RETRY_WINDOW_MS,
  })
  return logseq.provideUI({
    key: `excalidraw-${slot}`,
    slot,
    reset: true,
    template: `<div id="${id}" data-preset="${preset}" data-page-name="${pageName ?? ''}" data-block-id="${uuid ?? ''}" data-slot="${slot}" class="excalidraw-status">
        <div class="excalidraw-status-badge">EX</div>
        <div class="excalidraw-status-title">${message}</div>
        <div class="excalidraw-status-body">${pageName ?? ''}</div>
      </div>`,
  })
}

const renderMacroSlot = async ({
  slot,
  pageName,
  uuid,
  preset,
}: {
  slot: string
  pageName?: string
  uuid?: string
  preset: RenderPreset
}) => {
  if (!pageName) return

  const page = await logseq.Editor.getPage(pageName)
  if (page === null) {
    return renderStatus({
      slot,
      pageName,
      uuid,
      preset,
      message: 'Excalidraw page not found',
    })
  }
  if (!page?.properties?.excalidrawPlugin) {
    return renderStatus({
      slot,
      pageName,
      uuid,
      preset,
      message: 'Page is not an Excalidraw drawing',
    })
  }

  // get excalidraw data
  const { excalidrawData, rawBlocks } =
    await getExcalidrawInfoFromPage(pageName)

  const { elements, appState, files } = excalidrawData
  const id = `excalidraw-${pageName}-${slot}`

  const theme = await logseq.App.getStateFromStore<Theme>('ui/theme')
  const { exportToSvg } = await loadExcalidrawModule()

  const svg = await exportToSvg(
    getRenderableExcalidrawData(
      {
        elements,
        appState,
        files,
      },
      theme,
    ),
  )

  const firstBlock = rawBlocks?.[0]
  const showTitle =
    firstBlock?.properties?.excalidrawPluginAlias ?? page?.originalName
  const showTag = firstBlock?.properties?.excalidrawPluginTag
  const showIndicator = `<div class="excalidraw-kind excalidraw-kind--${preset}">${preset === 'inline' ? 'Excalidraw' : 'EX'}</div>`
  const tagMarkup = showTag
    ? `<div class="excalidraw-tag" title="${showTag}">${showTag}</div>`
    : ''
  trackedSlots.set(slot, {
    pageName: page.originalName,
    preset,
    uuid,
    status: 'rendered',
    missingCount: 0,
  })
  await logseq.provideUI({
    key: `excalidraw-${slot}`,
    slot,
    reset: true,
    template: `<div id="${id}" data-preset="${preset}" data-page-name="${page?.originalName}" class="excalidraw-container excalidraw-container--${preset}">
        ${preset === 'inline' ? '' : showIndicator}
        <div class="excalidraw-toolbar-container ${preset === 'inline' ? 'excalidraw-toolbar-container--inline' : ''}">
          <div class="excalidraw-meta ${preset === 'inline' ? 'excalidraw-meta--inline' : ''}">
            ${preset === 'inline' ? `<div class="excalidraw-inline-header">${showIndicator}<a data-on-click="navPage" class="excalidraw-title" data-page-name="${page?.originalName}" title="${showTitle}">${showTitle}</a></div>` : `<a data-on-click="navPage" class="excalidraw-title" data-page-name="${page?.originalName}" title="${showTitle}">${showTitle}</a>`}
            ${tagMarkup}
          </div>
          <div class="excalidraw-toolbar ${preset === 'inline' ? 'excalidraw-toolbar--inline' : ''}">
            <a data-on-click="delete" data-page-name="${page?.originalName}" data-block-id="${uuid}" title="${getI18N().preview.deleteButton}">
              <i class="ti ti-trash"></i>
            </a>
            <a data-on-click="refresh" data-page-name="${page?.originalName}" data-container-id="${id}" title="${getI18N().preview.refreshButton}">
              <i class="ti ti-refresh"></i>
            </a>
            <a data-on-click="edit" data-page-name="${page?.originalName}" data-container-id="${id}" title="${getI18N().preview.editButton}">
              <i class="ti ti-edit"></i>
            </a>
            <a data-on-click="fullscreen" data-page-name="${page?.originalName}" title="${getI18N().preview.fullScreenButton}">
              <i class="ti ti-maximize"></i>
            </a>
          </div>
        </div>
      </div>`,
  })

  await insertSVG(id, svg, undefined, preset)
}

const repairTrackedSlots = () => {
  trackedSlots.forEach((slotState, slot) => {
    const slotElement = parent.document.getElementById(slot)
    if (!slotElement) {
      const nextMissingCount = (slotState.missingCount ?? 0) + 1
      if (nextMissingCount >= 3) {
        trackedSlots.delete(slot)
        repairingSlots.delete(slot)
        return
      }

      trackedSlots.set(slot, {
        ...slotState,
        missingCount: nextMissingCount,
      })
      return
    }

    if (repairingSlots.has(slot)) return

    if (slotState.missingCount) {
      trackedSlots.set(slot, {
        ...slotState,
        missingCount: 0,
      })
    }

    const hasRenderedContainer = Boolean(
      slotElement.querySelector('.excalidraw-container'),
    )
    const hasPreviewSvg = Boolean(slotElement.querySelector('.excalidraw-svg'))
    const hasStatusCard = Boolean(
      slotElement.querySelector('.excalidraw-status'),
    )
    const needsRepair =
      slotState.status === 'status'
        ? !hasStatusCard
        : !hasRenderedContainer || !hasPreviewSvg

    if (!needsRepair) return

    repairingSlots.add(slot)
    void renderMacroSlot({
      slot,
      pageName: slotState.pageName,
      uuid: slotState.uuid,
      preset: slotState.preset,
    }).finally(() => {
      repairingSlots.delete(slot)
    })
  })
}

const hasExpectedSlotContent = (
  slotId: string,
  expectedStatus: RenderedSlotState['status'],
) => {
  const slotElement = parent.document.getElementById(slotId)
  if (!slotElement) return false

  if (expectedStatus === 'status') {
    return Boolean(slotElement.querySelector('.excalidraw-status'))
  }

  return Boolean(
    slotElement.querySelector('.excalidraw-container') &&
    slotElement.querySelector('.excalidraw-svg'),
  )
}

const retryTrackedStatusSlots = () => {
  const now = Date.now()
  trackedSlots.forEach((slotState, slot) => {
    const slotElement = parent.document.getElementById(slot)
    if (!slotElement) return
    if (slotState.status !== 'status' || repairingSlots.has(slot)) return
    if (
      (slotState.retryUntil ?? 0) <= now ||
      (slotState.retryCount ?? 0) >= STATUS_RETRY_MAX_ATTEMPTS
    )
      return

    trackedSlots.set(slot, {
      ...slotState,
      retryCount: (slotState.retryCount ?? 0) + 1,
    })
    repairingSlots.add(slot)
    void renderMacroSlot({
      slot,
      pageName: slotState.pageName,
      uuid: slotState.uuid,
      preset: slotState.preset,
    }).finally(() => {
      repairingSlots.delete(slot)
    })
  })
}

const ensureRepairObserver = () => {
  if (repairObserverAttached || !parent?.document?.body) return
  repairObserverAttached = true

  const observer = new MutationObserver(() => {
    repairTrackedSlots()
  })

  observer.observe(parent.document.body, {
    childList: true,
    subtree: true,
  })
}

const hasPendingStatusRetries = () => {
  const now = Date.now()
  return Array.from(trackedSlots.values()).some(
    (slotState) =>
      slotState.status === 'status' &&
      (slotState.retryUntil ?? 0) > now &&
      (slotState.retryCount ?? 0) < STATUS_RETRY_MAX_ATTEMPTS,
  )
}

const scheduleRepairRetry = () => {
  if (repairTimeoutId !== null || !hasPendingStatusRetries()) return

  repairTimeoutId = window.setTimeout(() => {
    repairTimeoutId = null
    repairTrackedSlots()
    retryTrackedStatusSlots()
    scheduleRepairRetry()
  }, STATUS_RETRY_INTERVAL)
}

const bootRenderBlockImage = () => {
  const { preview: i18nPreview } = getI18N()
  // render: {{renderer excalidraw, excalidraw-2021-08-31-16-00-00}}
  logseq.App.onMacroRendererSlotted(
    async ({ slot, payload: { arguments: args, uuid } }) => {
      const slotType = args?.[0]
      if (slotType === 'excalidraw') {
        const pageName = args?.[1]
        const preset = parseRenderPreset(args?.[2])
        trackedSlots.set(slot, { pageName, preset, uuid, status: 'status' })

        if (
          hasExpectedSlotContent(slot, 'rendered') ||
          hasExpectedSlotContent(slot, 'status')
        )
          return
        await renderMacroSlot({ slot, pageName, uuid, preset })
        scheduleRepairRetry()
      } else if (slotType === 'excalidraw-menu') {
        logseq.provideUI({
          key: `excalidraw-${slot}`,
          slot,
          reset: true,
          template: `WIP`,
        })
      }
    },
  )
  ensureRepairObserver()
  repairTrackedSlots()
  scheduleRepairRetry()

  window.addEventListener('focus', () => {
    repairTrackedSlots()
  })

  logseq.provideStyle(`
  .excalidraw-container {
    position: relative;
    line-height: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    width: fit-content;
    max-width: 100%;
    border-radius: 14px;
    overflow: hidden;
    background: color-mix(in srgb, var(--ls-primary-background-color) 92%, black 8%);
    border: 1px solid color-mix(in srgb, var(--ls-primary-text-color) 10%, transparent);
  }
  .excalidraw-container--card {
    max-width: min(380px, 100%);
  }
  .excalidraw-container--inline {
    max-width: min(420px, 100%);
    flex-direction: row-reverse;
    align-items: stretch;
    min-height: 132px;
  }
  .excalidraw-container--full {
    max-width: min(820px, 100%);
  }
  .excalidraw-status {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    width: min(380px, 100%);
    border-radius: 14px;
    color: var(--ls-primary-text-color);
    background: color-mix(in srgb, var(--ls-primary-background-color) 94%, black 6%);
    border: 1px solid color-mix(in srgb, #ef4444 40%, transparent);
    box-shadow: 0 6px 18px color-mix(in srgb, black 14%, transparent);
  }
  .excalidraw-status-badge {
    display: inline-flex;
    width: fit-content;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    line-height: 14px;
    text-transform: uppercase;
    color: #fecaca;
    background: color-mix(in srgb, #ef4444 20%, transparent);
  }
  .excalidraw-status-title {
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
  }
  .excalidraw-status-body {
    font-size: 12px;
    line-height: 16px;
    color: var(--ls-secondary-text-color);
    word-break: break-word;
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
  .excalidraw-container--card .excalidraw-toolbar-container,
  .excalidraw-container--full .excalidraw-toolbar-container {
    padding-top: 40px;
  }
  .excalidraw-toolbar-container--inline {
    opacity: 1;
    position: relative;
    inset: auto;
    width: 190px;
    height: auto;
    flex: 0 0 190px;
    flex-direction: column;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    background-image: none;
    border-right: 1px solid color-mix(in srgb, var(--ls-primary-text-color) 10%, transparent);
  }
  .excalidraw-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    max-width: calc(100% - 100px);
  }
  .excalidraw-meta--inline {
    max-width: 100%;
    gap: 8px;
  }
  .excalidraw-inline-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }
  .excalidraw-title {
    line-height: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .excalidraw-kind {
    display: inline-flex;
    width: fit-content;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 15px;
    letter-spacing: 0.02em;
    color: var(--ls-secondary-text-color);
    background: color-mix(in srgb, var(--ls-primary-text-color) 10%, transparent);
  }
  .excalidraw-kind--card,
  .excalidraw-kind--full {
    font-size: 10px;
    line-height: 14px;
    padding: 2px 6px;
    text-transform: uppercase;
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 3;
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
  .excalidraw-toolbar--inline {
    justify-content: flex-start;
    gap: 14px;
  }
  .excalidraw-toolbar a {
    width: 18px;
    height: 18px;
    line-height: 0;
  }
  .excalidraw-container--inline {
    background: color-mix(in srgb, var(--ls-primary-background-color) 96%, black 4%);
  }
  .excalidraw-container--inline .excalidraw-svg {
    display: block;
    max-height: 132px;
    max-width: 210px;
    object-fit: contain;
    margin: 0 auto;
  }
  .excalidraw-container--inline .excalidraw-tag {
    max-width: 100%;
  }
  `)
}

export default bootRenderBlockImage
