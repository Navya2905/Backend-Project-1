import { useState, type FormEvent } from 'react'
import { ApiError, api } from '../api'
import type { AskResult, Citation } from '../types'

interface Exchange {
  question: string
  result?: AskResult
  error?: string
}

// Splits "text [1] more [2]" into text runs and citation markers.
function renderAnswer(answer: string, onCite: (id: number) => void) {
  return answer.split(/(\[\d+\])/g).map((part, i) => {
    const match = /^\[(\d+)\]$/.exec(part)
    if (!match) return <span key={i}>{part}</span>
    const id = Number(match[1])
    return (
      <button key={i} type="button" className="cite" onClick={() => onCite(id)} aria-label={`Show source ${id}`}>
        {id}
      </button>
    )
  })
}

export function AskPanel({ workspaceId }: { workspaceId: string }) {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<Exchange[]>([])
  const [asking, setAsking] = useState(false)
  const [openCitation, setOpenCitation] = useState<{ exchange: number; id: number } | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const q = question.trim()
    if (!q || asking) return
    setAsking(true)
    setQuestion('')
    const index = history.length
    setHistory((h) => [...h, { question: q }])
    try {
      const result = await api.ask(workspaceId, q)
      setHistory((h) => h.map((e, i) => (i === index ? { ...e, result } : e)))
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
      setHistory((h) => h.map((e, i) => (i === index ? { ...e, error: message } : e)))
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="ask">
      <div className="panel-head">
        <h2>Ask your documents</h2>
      </div>

      <div className="conversation" aria-live="polite">
        {history.length === 0 && (
          <div className="empty">
            <p>Ask a question about this workspace’s documents.</p>
            <p className="muted">Answers only use your documents, and every claim links to the page it came from.</p>
          </div>
        )}
        {history.map((exchange, i) => {
          const shown: Citation | undefined =
            openCitation?.exchange === i ? exchange.result?.citations.find((c) => c.id === openCitation.id) : undefined
          return (
            <div key={i} className="exchange">
              <p className="question">{exchange.question}</p>
              {exchange.error ? (
                <p className="error">{exchange.error}</p>
              ) : !exchange.result ? (
                <p className="muted">Searching your documents…</p>
              ) : (
                <div className={exchange.result.answered ? 'answer' : 'answer not-found'}>
                  <p>{renderAnswer(exchange.result.answer, (id) => setOpenCitation({ exchange: i, id }))}</p>
                  {exchange.result.citations.length > 0 && (
                    <ul className="sources">
                      {exchange.result.citations.map((c) => (
                        <li key={c.id}>
                          <button type="button" className="link" onClick={() => setOpenCitation({ exchange: i, id: c.id })}>
                            [{c.id}] {c.filename}, page {c.pageNumber}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {shown && (
                    <blockquote className="excerpt">
                      <span className="muted">
                        {shown.filename}, page {shown.pageNumber}
                      </span>
                      {shown.excerpt}
                    </blockquote>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <form className="ask-form" onSubmit={submit}>
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <input
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. How many days of paid leave do we get?"
          maxLength={1000}
          autoComplete="off"
        />
        <button type="submit" className="primary" disabled={asking || !question.trim()}>
          Ask
        </button>
      </form>
    </div>
  )
}
