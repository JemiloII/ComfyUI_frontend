import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  LGraph,
  LGraphCanvas,
  LGraphNode
} from '@/lib/litegraph/src/litegraph'
import { ComfyApp } from './app'
import { createNode } from '@/utils/litegraphUtil'
import {
  isSupportedTextFile,
  pasteImageNode,
  pasteImageNodes,
  pasteTextNodes,
  positionBatchNodes
} from '@/composables/usePaste'

vi.mock('@/utils/litegraphUtil', () => ({
  createNode: vi.fn(),
  isImageNode: vi.fn(),
  isVideoNode: vi.fn(),
  isAudioNode: vi.fn(),
  executeWidgetsCallback: vi.fn(),
  fixLinkInputSlots: vi.fn()
}))

vi.mock('@/composables/usePaste', () => ({
  isSupportedTextFile: vi.fn(),
  pasteImageNode: vi.fn(),
  pasteImageNodes: vi.fn(),
  pasteTextNodes: vi.fn(),
  positionBatchNodes: vi.fn()
}))

vi.mock('@/scripts/metadata/parser', () => ({
  getWorkflowDataFromFile: vi.fn()
}))

vi.mock('@/platform/updates/common/toastStore', () => ({
  useToastStore: vi.fn(() => ({
    addAlert: vi.fn(),
    add: vi.fn(),
    remove: vi.fn()
  }))
}))

function createMockNode(options: Record<string, unknown> = {}): LGraphNode {
  return {
    id: 1,
    pos: [0, 0],
    size: [200, 100],
    type: 'LoadImage',
    connect: vi.fn(),
    getBounding: vi.fn(() => new Float64Array([0, 0, 200, 100])),
    ...options
  } as unknown as LGraphNode
}

function createMockCanvas(): Partial<LGraphCanvas> {
  const mockGraph: Partial<LGraph> = {
    change: vi.fn()
  }

  return {
    graph: mockGraph as LGraph,
    selectItems: vi.fn()
  }
}

function createImageFile(
  name: string = 'test.png',
  type: string = 'image/png'
): File {
  return new File([''], name, { type })
}

describe('ComfyApp', () => {
  let app: ComfyApp
  let mockCanvas: Partial<LGraphCanvas>

  beforeEach(() => {
    vi.clearAllMocks()
    app = new ComfyApp()
    mockCanvas = createMockCanvas()
    app.canvas = mockCanvas as LGraphCanvas
  })

  describe('handleFileList', () => {
    it('should create image nodes for each file in the list', async () => {
      const mockNode1 = createMockNode({ id: 1 })
      const mockNode2 = createMockNode({ id: 2 })
      const mockBatchNode = createMockNode({ id: 3, type: 'BatchImagesNode' })

      vi.mocked(pasteImageNodes).mockResolvedValue([mockNode1, mockNode2])
      vi.mocked(createNode).mockResolvedValue(mockBatchNode)

      const file1 = createImageFile('test1.png')
      const file2 = createImageFile('test2.jpg', 'image/jpeg')
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file1)
      dataTransfer.items.add(file2)

      await app.handleFileList(dataTransfer.files)

      expect(pasteImageNodes).toHaveBeenCalledWith(
        mockCanvas,
        dataTransfer.files
      )
      expect(createNode).toHaveBeenCalledWith(mockCanvas, 'BatchImagesNode')
      expect(mockCanvas.selectItems).toHaveBeenCalledWith([
        mockNode1,
        mockNode2,
        mockBatchNode
      ])
      expect(mockNode1.connect).toHaveBeenCalledWith(0, mockBatchNode, 0)
      expect(mockNode2.connect).toHaveBeenCalledWith(0, mockBatchNode, 1)
    })

    it('should not proceed if batch node creation fails', async () => {
      const mockNode1 = createMockNode({ id: 1 })
      vi.mocked(pasteImageNodes).mockResolvedValue([mockNode1])
      vi.mocked(createNode).mockResolvedValue(null)

      const file = createImageFile()
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)

      await app.handleFileList(dataTransfer.files)

      expect(mockCanvas.selectItems).not.toHaveBeenCalled()
      expect(mockNode1.connect).not.toHaveBeenCalled()
    })

    it('should handle empty file list', async () => {
      const dataTransfer = new DataTransfer()

      // The implementation doesn't check for empty list and will throw
      await expect(app.handleFileList(dataTransfer.files)).rejects.toThrow()
    })

    it('should process supported text files', async () => {
      const mockTextNode = createMockNode({ id: 1, type: 'PrimitiveStringMultiline' })
      vi.mocked(isSupportedTextFile).mockReturnValue(true)
      vi.mocked(pasteTextNodes).mockResolvedValue([mockTextNode])

      const textFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(textFile)

      await app.handleFileList(dataTransfer.files)

      expect(pasteTextNodes).toHaveBeenCalledWith(mockCanvas, dataTransfer.files)
      expect(positionBatchNodes).toHaveBeenCalledWith(mockCanvas, [mockTextNode])
      expect(mockCanvas.selectItems).toHaveBeenCalledWith([mockTextNode])
    })

    it('should not process unsupported text files', async () => {
      vi.mocked(isSupportedTextFile).mockReturnValue(false)

      const unsupportedFile = new File([''], 'test.exe', { type: 'application/octet-stream' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(unsupportedFile)

      await app.handleFileList(dataTransfer.files)

      expect(pasteImageNodes).not.toHaveBeenCalled()
      expect(pasteTextNodes).not.toHaveBeenCalled()
    })
  })

  describe('handleFile', () => {
    it('should handle image files by creating LoadImage node', async () => {
      const { getWorkflowDataFromFile } =
        await import('@/scripts/metadata/parser')
      vi.mocked(getWorkflowDataFromFile).mockResolvedValue({})

      const mockNode = createMockNode()
      vi.mocked(createNode).mockResolvedValue(mockNode)

      const imageFile = createImageFile()

      await app.handleFile(imageFile)

      expect(createNode).toHaveBeenCalledWith(mockCanvas, 'LoadImage')
      expect(pasteImageNode).toHaveBeenCalledWith(
        mockCanvas,
        expect.any(DataTransferItemList),
        mockNode
      )
    })

    it('should show error toast for unsupported files', async () => {
      const { getWorkflowDataFromFile } =
        await import('@/scripts/metadata/parser')
      const { useToastStore } =
        await import('@/platform/updates/common/toastStore')
      const mockAddAlert = vi.fn()

      vi.mocked(getWorkflowDataFromFile).mockResolvedValue({})
      vi.mocked(useToastStore).mockReturnValue({
        addAlert: mockAddAlert
      } as unknown as ReturnType<typeof useToastStore>)
      vi.mocked(isSupportedTextFile).mockReturnValue(false)

      const unsupportedFile = new File([''], 'test.exe', {
        type: 'application/octet-stream'
      })

      await app.handleFile(unsupportedFile)

      expect(mockAddAlert).toHaveBeenCalled()
    })
  })
})
