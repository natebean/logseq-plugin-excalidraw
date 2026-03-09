import React, { useState, useEffect } from 'react'

const PreviewImage = ({ blobPromise }: { blobPromise: Promise<Blob> }) => {
  const [imageSrc, setImageSrc] = useState<string>()

  useEffect(() => {
    let active = true
    let objectUrl: string | undefined

    const loadImage = async () => {
      try {
        const blob = await blobPromise
        objectUrl = URL.createObjectURL(blob)
        if (!active) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setImageSrc((previousImageSrc) => {
          if (previousImageSrc) {
            URL.revokeObjectURL(previousImageSrc)
          }
          return objectUrl
        })
      } catch (error) {
        console.error('Failed to load image:', error)
      }
    }

    loadImage()
    return () => {
      active = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [blobPromise])

  return <div>{imageSrc ? <img src={imageSrc} alt="Image" /> : <div>Loading image...</div>}</div>
}

export default PreviewImage
