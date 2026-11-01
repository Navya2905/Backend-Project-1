export interface User {
  id: string
  email: string
  name: string
}

export interface Workspace {
  id: string
  name: string
  role: 'owner' | 'member'
}

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface DocumentItem {
  id: string
  filename: string
  sizeBytes: number
  status: DocumentStatus
  error: string | null
  pageCount: number | null
  chunkCount: number | null
  uploadedBy: string | null
  createdAt: string
}

export interface Citation {
  id: number
  documentId: string
  filename: string
  pageNumber: number
  excerpt: string
}

export interface AskResult {
  answer: string
  answered: boolean
  citations: Citation[]
}
