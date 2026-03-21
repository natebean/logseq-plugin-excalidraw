import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types'
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types'
import type { LibraryItems } from '@excalidraw/excalidraw/types/types'
import type { BlockIdentity } from '@logseq/libs/dist/LSPlugin'
import { debounce } from 'lodash-es'
import React, { useEffect, useRef, useState } from 'react'
import { BiSlideshow } from 'react-icons/bi'
import { BsLayoutSidebarInset } from 'react-icons/bs'
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi'
import { IoAppsOutline } from 'react-icons/io5'
import { TbLogout, TbBrandGithub, TbArrowsMinimize } from 'react-icons/tb'

import { getExcalidrawLibraryItems, updateExcalidrawLibraryItems } from '@/bootstrap/excalidrawLibraryItems'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import useSlides from '@/hook/useSlides'
import { loadExcalidrawModule } from '@/lib/excalidrawLoader'
import { cn, genBlockData, getExcalidrawInfoFromPage, getLangCode, getMinimalAppState } from '@/lib/utils'
import getI18N from '@/locales'
import type { ExcalidrawData, PluginSettings } from '@/type'

import SlidesOverview from './SlidesOverview'
import SlidesPreview from './SlidesPreview'
import TagSelector from './TagSelector'

export type Theme = 'light' | 'dark'
export enum EditorTypeEnum {
  App = 'app',
  Page = 'page',
}
const SLIDES_UPDATE_WAIT = 200

const Editor: React.FC<
  React.PropsWithChildren<{
    pageName: string
    onClose?: (props?: { hasSceneChanges: boolean }) => void
    type?: EditorTypeEnum
  }>
> = ({ pageName, onClose, type = EditorTypeEnum.App }) => {
  const [excalidrawModule, setExcalidrawModule] = useState<null | typeof import('@excalidraw/excalidraw')>(null)
  const [excalidrawData, setExcalidrawData] = useState<ExcalidrawData>()
  const [libraryItems, setLibraryItems] = useState<LibraryItems>()
  const [theme, setTheme] = useState<Theme>()
  const blockUUIDRef = useRef<string>()
  const pagePropertyBlockUUIDRef = useRef<string>()
  const currentExcalidrawDataRef = useRef<ExcalidrawData>()
  // const [currentExcalidrawData, setCurrentExcalidrawData] = useState<ExcalidrawData>()
  const sceneVersionRef = useRef<number>()
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null)
  const { frames, isFirst, isLast, activeFrameIndex, updateFrames, prev, next } = useSlides(excalidrawAPI)
  const [slidesModeEnabled, setSlidesModeEnabled] = useState(false)
  const [showSlidesPreview, setShowSlidesPreview] = useState(true)
  const [showSlidesOverview, setShowSlidesOverview] = useState(false)

  const [aliasName, setAliasName] = useState<string>()
  const [tag, setTag] = useState<string>()

  const { toast } = useToast()
  const { editor: i18nEditor } = getI18N()

  // save excalidraw data to currentExcalidrawDataRef
  const updateSlidesPreview = debounce((elements: readonly ExcalidrawElement[], files: BinaryFiles) => {
    updateFrames({ elements, files, theme })
  }, SLIDES_UPDATE_WAIT)

  const onExcalidrawChange = (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    currentExcalidrawDataRef.current = {
      elements,
      appState,
      files,
    }
    const sceneVersion = excalidrawModule?.getSceneVersion?.(elements)
    if (sceneVersion === undefined) return
    // fix https://github.com/excalidraw/excalidraw/issues/3014
    if (sceneVersionRef.current !== sceneVersion) {
      sceneVersionRef.current = sceneVersion
      updateSlidesPreview(elements, files)
    }
  }
  // save library items to page
  const onLibraryChange = (items: LibraryItems) => {
    updateExcalidrawLibraryItems(items)
  }
  // save excalidraw data to page
  const onClickClose = (type?: EditorTypeEnum) => {
    const { dismiss } = toast({
      title: i18nEditor.saveToast.title,
      description: i18nEditor.saveToast.description,
      duration: 0,
      className: 'max-w-[280px] border-sky-200 bg-sky-50 p-3 pr-7 text-sky-950',
    })
    const persistAndClose = async () => {
      try {
        const dataToSave = currentExcalidrawDataRef.current ?? excalidrawData
        if (dataToSave && blockUUIDRef.current) {
        console.log('[faiz:] === start save')
        const { elements, appState, files } = dataToSave
        const blockData = genBlockData({
          ...excalidrawData,
          elements,
          appState: appState ? getMinimalAppState(appState) : undefined,
          files,
        })
        await logseq.Editor.updateBlock(blockUUIDRef.current, blockData)
        console.log('[faiz:] === end save')
        }
      } finally {
        dismiss()
        onClose?.({ hasSceneChanges: Boolean(currentExcalidrawDataRef.current) })
      }
    }

    void persistAndClose()
  }

  const onAliasNameChange = (aliasName: string) => {
    setAliasName(aliasName)
    if (pagePropertyBlockUUIDRef.current) {
      void logseq.Editor.upsertBlockProperty(pagePropertyBlockUUIDRef.current, 'excalidraw-plugin-alias', aliasName)
    }
  }
  const onTagChange = (tag: string) => {
    setTag(tag)
    if (pagePropertyBlockUUIDRef.current) {
      void logseq.Editor.upsertBlockProperty(pagePropertyBlockUUIDRef.current, 'excalidraw-plugin-tag', tag)
    }
  }

  // initialize excalidraw data
  useEffect(() => {
    getExcalidrawInfoFromPage(pageName).then((data) => {
      setExcalidrawData(data?.excalidrawData)
      blockUUIDRef.current = data?.block?.uuid

      const firstBlock = data?.rawBlocks?.[0]
      pagePropertyBlockUUIDRef.current = firstBlock?.uuid
      setAliasName(firstBlock.properties?.excalidrawPluginAlias || '')
      setTag(firstBlock.properties?.excalidrawPluginTag?.toLowerCase?.() || '')
    })
  }, [pageName])
  // initialize library items
  useEffect(() => {
    getExcalidrawLibraryItems().then((items) => {
      setLibraryItems(items || [])
    })
  }, [])
  // initialize theme
  useEffect(() => {
    logseq.App.getStateFromStore<Theme>('ui/theme').then(setTheme)
  }, [])
  useEffect(() => {
    loadExcalidrawModule().then(setExcalidrawModule)
  }, [])

  const Excalidraw = excalidrawModule?.Excalidraw
  const ExcalidrawButton = excalidrawModule?.Button
  const ExcalidrawMainMenu = excalidrawModule?.MainMenu
  const ExcalidrawWelcomeScreen = excalidrawModule?.WelcomeScreen
  const ExcalidrawFooter = excalidrawModule?.Footer

  return (
    <div className={cn('w-screen h-screen pt-5 relative', theme === 'dark' ? 'bg-[#121212]' : 'bg-white')}>
      {excalidrawData && libraryItems && Excalidraw && ExcalidrawButton && ExcalidrawMainMenu && ExcalidrawWelcomeScreen && ExcalidrawFooter && (
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          langCode={getLangCode((logseq.settings as unknown as PluginSettings)?.langCode)}
          initialData={{
            elements: excalidrawData.elements || [],
            appState: excalidrawData.appState
              ? Object.assign({ theme }, getMinimalAppState(excalidrawData.appState))
              : { theme },
            files: excalidrawData?.files || undefined,
            libraryItems,
          }}
          onChange={onExcalidrawChange}
          onLibraryChange={onLibraryChange}
          renderTopRightUI={() => (
            <div className="flex items-center gap-3">
              <Input placeholder="Untitled" value={aliasName} onChange={(e) => onAliasNameChange(e.target.value)} />
              <TagSelector showAdd value={tag} onChange={onTagChange} />
              <ExcalidrawButton
                className="!h-[var(--lg-button-size)] !w-auto"
                onSelect={() => setSlidesModeEnabled((_old) => !_old)}
                title={i18nEditor.slidesMode}
              >
                <BiSlideshow className="!w-[14px]" />
              </ExcalidrawButton>
              <ExcalidrawButton
                className="!h-[var(--lg-button-size)] !w-auto"
                onSelect={() => onClickClose(type)}
                title={i18nEditor.exitButton}
              >
                {type === EditorTypeEnum.App ? (
                  <TbLogout className="!w-[14px]" />
                ) : (
                  <TbArrowsMinimize className="!w-[14px]" />
                )}
              </ExcalidrawButton>
            </div>
          )}
        >
          <ExcalidrawMainMenu>
            <ExcalidrawMainMenu.Item
              icon={<TbBrandGithub />}
              onSelect={() => logseq.App.openExternalLink('https://github.com/haydenull/logseq-plugin-excalidraw')}
            >
              Github
            </ExcalidrawMainMenu.Item>
            <ExcalidrawMainMenu.DefaultItems.Export />
            <ExcalidrawMainMenu.DefaultItems.SaveAsImage />
            <ExcalidrawMainMenu.DefaultItems.ClearCanvas />
            <ExcalidrawMainMenu.DefaultItems.ToggleTheme />
            <ExcalidrawMainMenu.DefaultItems.ChangeCanvasBackground />
          </ExcalidrawMainMenu>
          <ExcalidrawWelcomeScreen>
            <ExcalidrawWelcomeScreen.Hints.ToolbarHint />
            <ExcalidrawWelcomeScreen.Center>
              <ExcalidrawWelcomeScreen.Center.Logo></ExcalidrawWelcomeScreen.Center.Logo>
              <ExcalidrawWelcomeScreen.Center.Heading>Logseq Excalidraw Plugin</ExcalidrawWelcomeScreen.Center.Heading>
            </ExcalidrawWelcomeScreen.Center>
          </ExcalidrawWelcomeScreen>
          <ExcalidrawFooter>
            {slidesModeEnabled ? (
              <div className="ml-2 flex gap-2 items-center">
                <ExcalidrawButton
                  className="!h-[var(--lg-button-size)] !w-auto"
                  onSelect={() => setShowSlidesPreview((_old) => !_old)}
                  title={i18nEditor.slidesPreview}
                >
                  <BsLayoutSidebarInset className="!w-[14px]" />
                </ExcalidrawButton>
                <ExcalidrawButton
                  className="!h-[var(--lg-button-size)] !w-auto"
                  onSelect={() => setShowSlidesOverview(true)}
                  title={i18nEditor.slidesOverview}
                >
                  <IoAppsOutline className="!w-[14px]" />
                </ExcalidrawButton>
                <ExcalidrawButton
                  className="!h-[var(--lg-button-size)] !w-auto"
                  onSelect={prev}
                  aria-disabled={isFirst}
                  title={i18nEditor.slidesPrev}
                >
                  <FiArrowLeft className={cn({ 'text-gray-400 !w-[14px]': isFirst })} />
                </ExcalidrawButton>
                <ExcalidrawButton
                  className="!h-[var(--lg-button-size)] !w-auto"
                  onSelect={next}
                  aria-disabled={isLast}
                  title={i18nEditor.slidesNext}
                >
                  <FiArrowRight className={cn({ 'text-gray-400 !w-[14px]': isLast })} />
                </ExcalidrawButton>
                {activeFrameIndex >= 0 ? (
                  <div className="text-base">
                    <span className="text-lg">{activeFrameIndex + 1}</span>
                    <span className="text-gray-400"> / {frames.length}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </ExcalidrawFooter>
        </Excalidraw>
      )}
      {slidesModeEnabled && showSlidesPreview ? <SlidesPreview api={excalidrawAPI} theme={theme} /> : null}
      <SlidesOverview
        theme={theme}
        className="fixed w-screen h-screen z-50 top-0 left-0"
        open={showSlidesOverview}
        onClose={() => setShowSlidesOverview(false)}
        api={excalidrawAPI}
      />
    </div>
  )
}

export default Editor
