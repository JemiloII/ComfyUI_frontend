export async function extractFileFromDragEvent(
  event: DragEvent
): Promise<File | FileList | undefined> {
  if (!event.dataTransfer) return

  const { files } = event.dataTransfer
  const { length } = files
  // Dragging from Chrome->Firefox there is a file, but it's a bmp, so ignore it
  if (length === 1 && files[0].type !== 'image/bmp') {
    return files[0]
  } else if (length > 1) {
    const items: File[] = Array.from(files)
    if (items.every(isType('image')) || items.every(isType('text/plain'))) {
      return files
    }
  }

  // Try loading the first URI in the transfer list
  const validTypes = ['text/uri-list', 'text/x-moz-url']
  const match = [...event.dataTransfer.types].find((t) =>
    validTypes.includes(t)
  )
  if (!match) return

  const uri = event.dataTransfer.getData(match)?.split('\n')?.[0]
  if (!uri) return

  const response = await fetch(uri)
  const blob = await response.blob()
  return new File([blob], uri, { type: blob.type })
}

function isType(memeType: string) {
  return ({ type }: File): boolean => {
    return type.startsWith(memeType)
  }
}
