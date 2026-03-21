import { useAtom } from 'jotai'
import { LogOut, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import DrawingCard, { PREVIEW_WINDOW, type IPageWithDrawing } from '@/components/DrawingCard'
import CreateDrawingModal, { EditTypeEnum } from '@/components/EditDrawingInfoModal'
import Editor, { EditorTypeEnum, type Theme } from '@/components/Editor'
import TagSelector from '@/components/TagSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toaster } from '@/components/ui/toaster'
import { refreshRenderedPage } from '@/bootstrap/renderBlockImage'
import { loadExcalidrawModule } from '@/lib/excalidrawLoader'
import { getExcalidrawInfoFromPage, getExcalidrawPages, getTags, setTheme } from '@/lib/utils'
import { tagsAtom } from '@/model/tags'

type SortOption = 'modified' | 'created' | 'tag'
type GroupOption = 'none' | 'tag'

/**
 * Get all drawing pages and generate svg for each page
 */
const getAllPages = async (): Promise<IPageWithDrawing[]> => {
  const pages = await getExcalidrawPages()
  if (!pages) return []

  const theme = await logseq.App.getStateFromStore<Theme>('ui/theme')
  const { exportToSvg } = await loadExcalidrawModule()
  const promises = pages.map(async (page) => {
    const { excalidrawData, rawBlocks } = await getExcalidrawInfoFromPage(page.name)
    const svg = await exportToSvg({
      elements: excalidrawData?.elements ?? [],
      // appState: ,
      appState: {
        ...(excalidrawData?.appState ?? {}),
        exportWithDarkMode: theme === 'dark',
      },
      exportPadding: 20,
      files: excalidrawData?.files ?? null,
    })
    const width = Number(svg.getAttribute('width')) || 100
    const height = Number(svg.getAttribute('height')) || 80
    // display svg in full screen based on aspect radio
    const aspectRadio = width / height
    const windowAspectRadio = PREVIEW_WINDOW.width / PREVIEW_WINDOW.height
    if (aspectRadio > windowAspectRadio) {
      svg.style.width = PREVIEW_WINDOW.width + 'px'
      svg.style.height = 'auto'
    } else {
      svg.style.width = 'auto'
      svg.style.height = PREVIEW_WINDOW.height + 'px'
    }

    const firstBlock = rawBlocks?.[0]
    const drawAlias = firstBlock?.properties?.excalidrawPluginAlias
    const drawTag = firstBlock?.properties?.excalidrawPluginTag
    const createdAt = Number(page.createdAt ?? page['created-at'] ?? firstBlock?.createdAt ?? firstBlock?.['created-at'])
    const updatedAt = Number(page.updatedAt ?? page['updated-at'] ?? firstBlock?.updatedAt ?? firstBlock?.['updated-at'])
    return {
      ...page,
      drawSvg: svg,
      drawAlias,
      drawTag,
      createdAt: Number.isFinite(createdAt) ? createdAt : undefined,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined,
      drawRawBlocks: rawBlocks,
    }
  })
  return Promise.all(promises)
}

const DashboardApp = () => {
  const [allPages, setAllPages] = useState<IPageWithDrawing[]>([])
  const [openCreateDrawingModal, setOpenCreateDrawingModal] = useState(false)
  const [editorInfo, setEditorInfo] = useState<{
    show: boolean
    pageName?: string
  }>({
    show: false,
  })
  const [, setTags] = useAtom(tagsAtom)
  const [filterTag, setFilterTag] = useState<string>()
  const [filterInput, setFilterInput] = useState<string>('')
  const [sortBy, setSortBy] = useState<SortOption>('modified')
  const [groupBy, setGroupBy] = useState<GroupOption>('none')

  const pagesAfterFilter = allPages.filter((page) => {
    const _filterInput = filterInput?.trim()
    const _filterTag = filterTag?.trim()
    const alias = page.drawAlias?.toLowerCase() || page.originalName?.toLowerCase() || ''
    const tag = page.drawTag?.toLowerCase() || ''

    // show all drawings if no filter
    const hasFilterTag = _filterTag ? tag.includes(_filterTag) : true
    const hasFilterInput = _filterInput ? alias.includes(_filterInput) : true
    return hasFilterTag && hasFilterInput
  })

  const sortedPages = [...pagesAfterFilter].sort((left, right) => {
    if (sortBy === 'tag') {
      return (left.drawTag || '').localeCompare(right.drawTag || '') || (left.drawAlias || left.originalName).localeCompare(right.drawAlias || right.originalName)
    }

    const leftValue = sortBy === 'created' ? left.createdAt || 0 : left.updatedAt || left.createdAt || 0
    const rightValue = sortBy === 'created' ? right.createdAt || 0 : right.updatedAt || right.createdAt || 0
    return rightValue - leftValue
  })

  const groupedPages =
    groupBy === 'tag'
      ? sortedPages.reduce<Record<string, IPageWithDrawing[]>>((groups, page) => {
          const groupKey = page.drawTag || 'Untagged'
          groups[groupKey] = groups[groupKey] || []
          groups[groupKey].push(page)
          return groups
        }, {})
      : { All: sortedPages }

  const onClickReset = () => {
    setFilterInput('')
    setFilterTag('')
  }
  const onClickDrawing = (page: IPageWithDrawing) => {
    setEditorInfo({
      show: true,
      pageName: page.originalName,
    })
  }
  const onDeleteDrawing = (page: IPageWithDrawing) => {
    setAllPages(allPages.filter((p) => p.originalName !== page.originalName))
  }

  const refresh = () => {
    getAllPages().then(setAllPages)
  }

  const handleEditorClose = async ({ hasSceneChanges = false }: { hasSceneChanges?: boolean } = {}) => {
    if (editorInfo.pageName) {
      if (hasSceneChanges) {
        const { excalidrawData } = await getExcalidrawInfoFromPage(editorInfo.pageName)
        await refreshRenderedPage(editorInfo.pageName, excalidrawData)
      } else {
        await refreshRenderedPage(editorInfo.pageName)
      }
    }
    setEditorInfo({ show: false })
    refresh()
    getTags().then(setTags)
  }

  useEffect(() => {
    getAllPages().then(setAllPages)
  }, [])
  useEffect(() => {
    getTags().then(setTags)
  }, [])
  // initialize theme
  useEffect(() => {
    logseq.App.getStateFromStore<Theme>('ui/theme').then(setTheme)
  }, [])

  return (
    <>
      <div className="py-5 px-10 w-screen h-screen overflow-auto custom-scroll">
        <div className="flex justify-center my-8">
          <div className="flex gap-2 max-w-5xl flex-1 flex-wrap justify-between">
            <Input
              className="min-w-[220px] flex-1"
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              placeholder="Filter drawings..."
            />
            <TagSelector asFilter value={filterTag} onChange={setFilterTag} />
            <div className="flex items-center gap-2">
              <Label htmlFor="dashboard-sort">Sort by</Label>
              <select
                id="dashboard-sort"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
              >
                <option value="modified">Modified</option>
                <option value="created">Created</option>
                <option value="tag">Tag</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="dashboard-group">Group by</Label>
              <select
                id="dashboard-group"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupOption)}
              >
                <option value="none">None</option>
                <option value="tag">Tag</option>
              </select>
            </div>
            {Boolean(filterTag) || Boolean(filterInput) ? (
              <Button variant="ghost" onClick={onClickReset}>
                Reset <X size="16" className="ml-2" />
              </Button>
            ) : null}
            <Button className="ml-10" onClick={() => setOpenCreateDrawingModal(true)}>
              Create
            </Button>
            <Button variant="outline" onClick={() => logseq.hideMainUI()}>
              <LogOut size="15" />
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-8">
          {Object.entries(groupedPages).map(([groupName, pages]) => (
            <section key={groupName} className="flex flex-col gap-3">
              {groupBy === 'tag' ? (
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{groupName}</h2>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{pages.length} drawings</span>
                </div>
              ) : null}
              <div
                className="grid gap-4 justify-center"
                style={{
                  gridTemplateColumns: `repeat(auto-fill,${PREVIEW_WINDOW.width}px)`,
                }}
              >
                {pages.map((page) => (
                  <DrawingCard
                    key={page.id}
                    page={page}
                    onClickDrawing={onClickDrawing}
                    onDelete={onDeleteDrawing}
                    onChange={refresh}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        {editorInfo.show && editorInfo.pageName && (
          <div className="fixed top-0 left-0 w-screen h-screen">
            <Editor
              key={editorInfo.pageName}
              pageName={editorInfo.pageName}
              type={EditorTypeEnum.Page}
              onClose={handleEditorClose}
            />
          </div>
        )}
      </div>
      <Toaster />
      <CreateDrawingModal
        type={EditTypeEnum.Create}
        open={openCreateDrawingModal}
        onOpenChange={setOpenCreateDrawingModal}
        onOk={refresh}
      />
    </>
  )
}

export default DashboardApp
