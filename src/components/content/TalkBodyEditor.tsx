import { useEffect, useRef, useState } from 'react'
import { useToastStore } from '@/components/ui/Toast'
import {
  uploadTalkMedia, uploadTalkMediaFromUrl, looksLikeImageUrl,
  imgSrcFromHtml, isProbablyGifUrl, MAX_FILES, MAX_MB,
} from '@/utils/talkMedia'
import { sanitizeRichText, richTextToPlain, extractImageUrls } from '@/utils/richText'

/** 첨부거리 — 파일, 주소, 또는 "주소 우선 · 실패하면 이 파일" 쌍 */
type MediaItem = File | string | { url: string; fallback: File }

async function resolveItem(item: MediaItem): Promise<string> {
  if (typeof item === 'string') return uploadTalkMediaFromUrl(item)
  if (item instanceof File) return uploadTalkMedia(item)
  try { return await uploadTalkMediaFromUrl(item.url) }
  catch { return uploadTalkMedia(item.fallback) }
}

/** 글자 크기 — execCommand('fontSize') 의 1~7 을 사람 말로 */
const SIZES = [
  { v: '2', label: '작게' },
  { v: '3', label: '보통' },
  { v: '5', label: '크게' },
  { v: '6', label: '아주 크게' },
]
const FONTS = [
  { v: '', label: '기본 글꼴' },
  { v: 'Malgun Gothic, sans-serif', label: '고딕' },
  { v: 'Batang, serif', label: '명조' },
  { v: 'Consolas, monospace', label: '고정폭' },
]

/**
 * 토론글 본문 에디터 — 서식 툴바 + 본문. 짤은 커서 자리에 바로 박힌다(디시 방식).
 *
 * 짤을 따로 모아 두지 않고 본문 HTML 안의 <img> 로 넣기 때문에,
 * 짤 위·아래 어디에나 글을 쓸 수 있고 지울 때도 글자처럼 백스페이스로 지운다.
 * 익명 글쓰기를 받는 게시판이라 밖으로 내보내기 전에 sanitizeRichText 로 정화한다.
 */
export function TalkBodyEditor({ html, onHtml, maxLength = 5000 }: {
  html: string
  onHtml: (v: string) => void
  maxLength?: number
}) {
  const toast = useToastStore(s => s.show)
  const fileRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [len, setLen] = useState(() => richTextToPlain(html).length)
  const [shots, setShots] = useState(() => extractImageUrls(html).length)

  // 초기 내용만 한 번 넣는다 — 이후엔 브라우저가 들고 있는다(입력 중 커서가 튀지 않게)
  useEffect(() => {
    if (editorRef.current && html) editorRef.current.innerHTML = html
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sync = () => {
    const raw = editorRef.current?.innerHTML || ''
    const plain = richTextToPlain(raw)
    const imgs = extractImageUrls(raw)
    setLen(plain.length)
    setShots(imgs.length)
    onHtml(plain.trim() || imgs.length ? raw : '')  // 빈 <div><br></div> 만 남은 건 빈 글로 본다
  }

  /** 툴바를 누르면 에디터가 포커스를 잃으므로, 마지막 커서 자리를 기억해 뒀다 되돌린다.
   *  selectionchange 로 계속 붙잡는다 — blur 시점엔 이미 선택이 지워져 있을 수 있어서. */
  const remember = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount && editorRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }

  useEffect(() => {
    document.addEventListener('selectionchange', remember)
    return () => document.removeEventListener('selectionchange', remember)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const restore = () => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    if (!sel) return
    const saved = savedRange.current
    if (saved && el.contains(saved.commonAncestorContainer)) {
      sel.removeAllRanges(); sel.addRange(saved)
      return
    }
    const r = document.createRange()   // 기억해 둔 자리가 없으면 맨 끝에
    r.selectNodeContents(el); r.collapse(false)
    sel.removeAllRanges(); sel.addRange(r)
  }

  /** 서식 적용 — 선택 영역에 execCommand. (구식 API 지만 별도 에디터 없이 되는 유일한 길) */
  const exec = (cmd: string, value?: string) => {
    restore()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, value)
    remember(); sync()
  }

  /** 커서 자리에 짤을 끼워 넣는다 */
  const insertImages = (urls: string[]) => {
    if (!urls.length) return
    restore()
    for (const url of urls) {
      document.execCommand('insertHTML', false, `<img src="${url.replace(/"/g, '&quot;')}" alt="">`)
    }
    remember(); sync()
  }

  /** 남은 자리만큼 잘라 하나씩 올리고, 성공한 것만 본문에 끼운다. */
  const addAll = async (items: MediaItem[]) => {
    if (!items.length) return
    const room = MAX_FILES - extractImageUrls(editorRef.current?.innerHTML || '').length
    if (room <= 0) { toast(`짤은 한 글에 최대 ${MAX_FILES}개까지 넣을 수 있어요.`); return }
    if (items.length > room) toast(`${room}개만 올릴게요. (최대 ${MAX_FILES}개)`)

    setBusy(true)
    const added: string[] = []
    try {
      for (const item of items.slice(0, room)) {
        try { added.push(await resolveItem(item)) }
        catch (e: any) { toast(e?.message || '업로드에 실패했어요.') }
      }
      if (added.length) { insertImages(added); toast('짤을 넣었어요!') }
    } finally {
      setBusy(false)
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.items)
      .filter(i => i.type.startsWith('image/'))
      .map(i => i.getAsFile())
      .filter((f): f is File => !!f)

    if (files.length) {
      e.preventDefault(); remember()
      // 웹 이미지를 복사하면 클립보드의 그림은 첫 프레임 PNG 한 장이다.
      // 같이 실려온 원본 주소가 움짤이면 그쪽을 먼저 쓴다(실패하면 붙여넣은 PNG로).
      const src = imgSrcFromHtml(e.clipboardData.getData('text/html') || '')
      if (src && isProbablyGifUrl(src)) { addAll([{ url: src, fallback: files[0] }, ...files.slice(1)]); return }
      addAll(files)
      return
    }

    // 글은 서식 없이 — 남의 사이트 HTML 이 통째로 딸려 들어오는 걸 막는다
    const text = e.clipboardData.getData('text')
    if (text) { e.preventDefault(); document.execCommand('insertText', false, text); sync() }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length) { addAll(files); return }
    const raw = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text')
    const url = raw.split('\n').map(s => s.trim()).find(s => s && !s.startsWith('#'))
    if (url && looksLikeImageUrl(url)) addAll([url])
  }

  const addUrl = () => {
    const u = urlInput.trim()
    if (!u) return
    setUrlInput(''); setUrlOpen(false)
    addAll([u])
  }

  const over = len > maxLength
  /** 버튼을 눌러도 에디터가 포커스를 잃지 않게 (선택 영역이 그대로 남는다) */
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  return (
    <>
      <div
        className={`talk-editor ${dragging ? 'dragging' : ''}`}
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
      >
        {/* 서식 */}
        <div className="talk-toolbar">
          <select className="talk-select" defaultValue="" onChange={e => { exec('fontName', e.target.value); e.target.selectedIndex = 0 }}>
            {FONTS.map(f => <option key={f.label} value={f.v}>{f.label}</option>)}
          </select>
          <select className="talk-select" defaultValue="" onChange={e => { exec('fontSize', e.target.value); e.target.selectedIndex = 0 }}>
            <option value="">크기</option>
            {SIZES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <button type="button" className="talk-tool bold" onMouseDown={keepFocus} onClick={() => exec('bold')} title="굵게">가</button>
          <button type="button" className="talk-tool italic" onMouseDown={keepFocus} onClick={() => exec('italic')} title="기울임">가</button>
          <button type="button" className="talk-tool underline" onMouseDown={keepFocus} onClick={() => exec('underline')} title="밑줄">가</button>
          <button type="button" className="talk-tool strike" onMouseDown={keepFocus} onClick={() => exec('strikeThrough')} title="취소선">가</button>
          <input type="color" className="talk-color" title="글자색" defaultValue="#18181b"
            onChange={e => exec('foreColor', e.target.value)} />
          <button type="button" className="talk-tool" onMouseDown={keepFocus} onClick={() => exec('removeFormat')} title="서식 지우기">서식 해제</button>
        </div>

        {/* 첨부 */}
        <div className="talk-toolbar">
          <button type="button" className="talk-tool" disabled={busy} onMouseDown={keepFocus} onClick={() => fileRef.current?.click()}>
            🖼 이미지·움짤
          </button>
          <button type="button" className="talk-tool" disabled={busy} onMouseDown={keepFocus} onClick={() => setUrlOpen(o => !o)}>
            🔗 주소로 넣기
          </button>
          <span className="talk-toolbar-hint">
            {busy ? '올리는 중…' : `커서 자리에 들어감 · 붙여넣기(Ctrl+V)·드래그&드롭 · ${shots}/${MAX_FILES}`}
          </span>
        </div>

        {urlOpen && (
          <div className="talk-url-row">
            <input
              className="form-input" style={{ flex: 1, marginBottom: 0 }} autoFocus
              placeholder="이미지 주소 (https://....gif)"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl() } }}
            />
            <button type="button" className="btn btn-secondary btn-small" disabled={busy || !urlInput.trim()} onClick={addUrl}>붙이기</button>
          </div>
        )}

        <div
          ref={editorRef}
          className="talk-body"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-placeholder="이 작품에 대한 감상·떡밥·추천 뭐든 자유롭게! (짤은 커서 자리에 바로 들어가요)"
          onInput={() => { remember(); sync() }}
          onKeyUp={remember}
          onMouseUp={remember}
          onBlur={() => { remember(); sync() }}
          onPaste={onPaste}
        />
      </div>

      <input ref={fileRef} type="file" accept="image/gif,image/png,image/jpeg,image/webp" multiple hidden
        onChange={e => { addAll(Array.from(e.target.files || [])); e.target.value = '' }} />

      <span className="disc-count" style={{ fontSize: 12, color: over ? 'var(--danger)' : 'var(--subtext)' }}>
        {len}/{maxLength} · 짤은 개당 {MAX_MB}MB 이하, 한 글에 {MAX_FILES}개까지 (지울 땐 글자처럼 백스페이스)
      </span>
    </>
  )
}

/** 저장 직전 정화 — 페이지에서 이걸 거쳐 DB 로 보낸다 */
export function cleanBodyHtml(html: string): string {
  return sanitizeRichText(html)
}
