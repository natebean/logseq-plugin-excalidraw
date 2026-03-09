import { useAtom } from "jotai";
import { Toaster } from "@/components/ui/toaster";
import Editor, { Theme } from "@/components/Editor";
import { getExcalidrawInfoFromPage, getTags, setTheme } from "@/lib/utils";
import { insertSVG, refreshRenderedPage, updateRenderedMetadata } from "@/bootstrap/renderBlockImage";
import { useEffect } from "react";
import { tagsAtom } from "@/model/tags";

const EditorApp: React.FC<{ pageName: string; renderSlotId?: string }> = ({
  pageName,
  renderSlotId,
}) => {
  const [, setTags] = useAtom(tagsAtom);
  const handleClose = async ({ hasSceneChanges = false }: { hasSceneChanges?: boolean } = {}) => {
    if (pageName && renderSlotId) {
      await updateRenderedMetadata(renderSlotId, pageName);
      if (hasSceneChanges) {
        const { excalidrawData } = await getExcalidrawInfoFromPage(pageName);
        insertSVG(renderSlotId, undefined, excalidrawData);
        await refreshRenderedPage(pageName, excalidrawData);
      }
    } else if (pageName) {
      await refreshRenderedPage(pageName)
    }
    logseq.hideMainUI();
  };
  useEffect(() => {
    getTags().then(setTags);
  }, []);
  // initialize theme
  useEffect(() => {
    logseq.App.getStateFromStore<Theme>("ui/theme").then(setTheme);
  }, []);
  return (
    <>
      <div className="w-screen h-screen flex items-center justify-center overflow-auto">
        <div
          className="w-screen h-screen fixed top-0 left-0"
          onClick={() => handleClose({ hasSceneChanges: Boolean(false) })}
        ></div>
        <Editor pageName={pageName} onClose={handleClose} />
      </div>
      <Toaster />
    </>
  );
};

export default EditorApp;
