let excalidrawModulePromise: Promise<typeof import('@excalidraw/excalidraw')> | null = null

export const loadExcalidrawModule = () => {
  if (!excalidrawModulePromise) {
    excalidrawModulePromise = import('@excalidraw/excalidraw')
  }

  return excalidrawModulePromise
}
