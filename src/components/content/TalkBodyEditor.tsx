import { useEffect, useRef, useState } from 'react'
import { useToastStore } from '@/components/ui/Toast'
import {
  uploadTalkMedia, uploadTalkMediaFromUrl, looksLikeImageUrl,
  imgSrcFromHtml, isProbablyGifUrl, MAX_FILES, MAX_BYTES,
} from '@/utils/talkMedia'
import { sanitizeRichText, richTextToPlain, extractImageUrls } from '@/utils/richText'
import { youtubeId, youtubeWatchUrl } from '@/utils/youtube'

/** 첨부거리 — 파일, 주소, 또는 "주소 우선 · 실패하면 이 파일" 쌍 */
type MediaItem = File | string | { url: string; fallback: File }

async function resolveItem(item: MediaItem, limit: number): Promise<string> {
  if (typeof item === 'string') return uploadTalkMediaFromUrl(item, limit)
  if (item instanceof File) return uploadTalkMedia(item, limit)
  try { return await uploadTalkMediaFromUrl(item.url, limit) }
  catch { return uploadTalkMedia(item.fallback, limit) }
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
 *
 * compact(댓글·답글용): 서식 툴바와 '주소로 넣기'를 감추고, [이미지·움짤]·[유튜브] 버튼만
 * 입력칸 **아래**에 둔다. 댓글에 글꼴·색상까지 고르게 하면 입력창이 글쓰기 화면만큼 커진다.
 * 짤·유튜브 붙여넣기(Ctrl+V)와 드래그&드롭은 똑같이 된다. 글자 수는 부모가 센다
 * (등록 버튼 옆에 이미 세는 자리가 있다).
 *
 * 내용은 처음 한 번만 넣고 그 뒤론 브라우저가 들고 있는다(비제어). 그래서 등록 후 입력칸을
 * 비우려면 부모가 key 를 바꿔 새로 그려야 한다 — 상태만 비워서는 화면이 안 비워진다.
 */
export function TalkBodyEditor({
  html, onHtml, maxLength = 5000,
  compact = false, maxFiles = MAX_FILES, maxBytes = MAX_BYTES,
  placeholder, autoFocus = false, inputRef, onFocus, onBlur,
}: {
  html: string
  onHtml: (v: string) => void
  maxLength?: number
  /** 댓글용 간단형 — 서식 툴바를 감추고 [이미지·움짤]·[유튜브]만 입력칸 아래에 둔다 */
  compact?: boolean
  /** 짤 개수 상한 (글 4 · 댓글 1) */
  maxFiles?: number
  /** 짤 한 개 크기 상한 (글 20MB · 댓글 5MB) — 정지 이미지는 줄인 뒤 크기로 잰다 */
  maxBytes?: number
  placeholder?: string
  autoFocus?: boolean
  /** 부모가 입력칸에 직접 손대야 할 때 (하단 고정 바 → 입력칸으로 스크롤·포커스) */
  inputRef?: React.MutableRefObject<HTMLDivElement | null>
  onFocus?: () => void
  onBlur?: () => void
}) {
  const toast = useToastStore(s => s.show)
  const fileRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const savedRange = useRef<Range | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [ytOpen, setYtOpen] = useState(false)
  const [ytInput, setYtInput] = useState('')
  const [len, setLen] = useState(() => richTextToPlain(html).length)
  const [shots, setShots] = useState(() => extractImageUrls(html).length)
  const capMb = Math.round(maxBytes / 1024 / 1024)

  // 초기 내용만 한 번 넣는다 — 이후엔 브라우저가 들고 있는다(입력 중 커서가 튀지 않게)
  useEffect(() => {
    if (editorRef.current && html) {
      editorRef.current.innerHTML = html
      // 저장할 때 contenteditable 속성은 정화로 빠진다 — 고쳐 쓰러 열면 영상 자리를 다시 한 덩이로 묶는다
      editorRef.current.querySelectorAll('[data-yt]').forEach(el => el.setAttribute('contenteditable', 'false'))
    }
    // contentEditable 은 autoFocus 속성을 안 먹는다 — 답글·수정칸을 열자마자 바로 쓰게 직접 건다
    if (autoFocus) editorRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sync = () => {
    const raw = editorRef.current?.innerHTML || ''
    const plain = richTextToPlain(raw)
    const imgs = extractImageUrls(raw)
    setLen(plain.length)
    setShots(imgs.length)
    // 빈 <div><br></div> 만 남은 건 빈 글로 본다. 유튜브 자리만 있는 글도 빈 글이 아니다
    onHtml(plain.trim() || imgs.length || raw.includes('data-yt') ? raw : '')
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

  /**
   * 커서 자리에 유튜브 영상 자리를 끼운다. 에디터 안에서는 주소가 적힌 카드로 보이고,
   * 글 화면에서 플레이어가 된다(richText.renderVideoEmbeds). 카드는 한 덩이라 백스페이스로 통째로 지워진다.
   */
  const insertVideo = (id: string) => {
    restore()
    document.execCommand('insertHTML', false,
      `<div data-yt="${id}" contenteditable="false">${youtubeWatchUrl(id)}</div><div><br></div>`)
    remember(); sync()
  }

  const addVideo = () => {
    const id = youtubeId(ytInput)
    if (!id) { toast('유튜브 영상 주소가 아니에요.'); return }
    setYtInput(''); setYtOpen(false)
    insertVideo(id)
  }

  /** 남은 자리만큼 잘라 하나씩 올리고, 성공한 것만 본문에 끼운다. */
  const addAll = async (items: MediaItem[]) => {
    if (!items.length) return
    const where = compact ? '댓글 하나에' : '한 글에'
    const room = maxFiles - extractImageUrls(editorRef.current?.innerHTML || '').length
    if (room <= 0) { toast(`짤은 ${where} 최대 ${maxFiles}개까지 넣을 수 있어요.`); return }
    if (items.length > room) toast(`${room}개만 올릴게요. (${where} 최대 ${maxFiles}개)`)

    setBusy(true)
    const added: string[] = []
    try {
      for (const item of items.slice(0, room)) {
        try { added.push(await resolveItem(item, maxBytes)) }
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
    // 유튜브 주소 하나만 붙여넣으면 링크가 아니라 영상으로 들어간다
    const ytId = text ? youtubeId(text) : null
    if (ytId) { e.preventDefault(); remember(); insertVideo(ytId); return }
    if (text) { e.preventDefault(); document.execCommand('insertText', false, text); sync() }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length) { addAll(files); return }
    const raw = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text')
    const url = raw.split('\n').map(s => s.trim()).find(s => s && !s.startsWith('#'))
    const ytId = url ? youtubeId(url) : null
    if (ytId) { insertVideo(ytId); return }
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

  // 첨부 줄 — 글쓰기에선 입력칸 위, 댓글(compact)에선 입력칸 아래
  const attachBar = (
    <>
      <div className="talk-toolbar">
        <button type="button" className="talk-tool" disabled={busy} onMouseDown={keepFocus} onClick={() => fileRef.current?.click()}>
          이미지·움짤
        </button>
        {!compact && (
          <button type="button" className="talk-tool" disabled={busy} onMouseDown={keepFocus} onClick={() => { setYtOpen(false); setUrlOpen(o => !o) }}>
            주소로 넣기
          </button>
        )}
        <button type="button" className="talk-tool" disabled={busy} onMouseDown={keepFocus} onClick={() => { setUrlOpen(false); setYtOpen(o => !o) }}>
          유튜브
        </button>
        <span className="talk-toolbar-hint">
          {busy ? '올리는 중…' : compact
            ? `짤 ${shots}/${maxFiles} · ${capMb}MB 이하 · 붙여넣기 가능`
            : `커서 자리에 들어감 · 붙여넣기(Ctrl+V)·드래그&드롭 · ${shots}/${maxFiles}`}
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

      {ytOpen && (
        <div className="talk-url-row">
          <input
            className="form-input" style={{ flex: 1, marginBottom: 0 }} autoFocus
            placeholder={compact ? '유튜브 주소 (입력칸에 바로 붙여넣어도 돼요)' : '유튜브 주소 (본문에 바로 붙여넣어도 영상으로 들어가요)'}
            value={ytInput}
            onChange={e => setYtInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVideo() } }}
          />
          <button type="button" className="btn btn-secondary btn-small" disabled={!ytInput.trim()} onClick={addVideo}>넣기</button>
        </div>
      )}
    </>
  )

  return (
    <>
      <div
        className={`talk-editor ${compact ? 'compact' : ''} ${dragging ? 'dragging' : ''}`}
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
      >
        {/* 서식 — 댓글에선 뺀다 */}
        {!compact && (
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
        )}

        {!compact && attachBar}

        <div
          ref={el => { editorRef.current = el; if (inputRef) inputRef.current = el }}
          className="talk-body"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-placeholder={placeholder ?? '이 작품에 대한 감상·떡밥·추천 뭐든 자유롭게! (짤은 커서 자리에 바로 들어가요)'}
          onInput={() => { remember(); sync() }}
          onKeyUp={remember}
          onMouseUp={remember}
          onFocus={onFocus}
          onBlur={() => { remember(); sync(); onBlur?.() }}
          onPaste={onPaste}
        />

        {compact && attachBar}
      </div>

      <input ref={fileRef} type="file" accept="image/gif,image/png,image/jpeg,image/webp" multiple={maxFiles > 1} hidden
        onChange={e => { addAll(Array.from(e.target.files || [])); e.target.value = '' }} />

      {!compact && (
        <span className="disc-count" style={{ fontSize: 12, color: over ? 'var(--danger)' : 'var(--subtext)' }}>
          {len}/{maxLength} · 짤은 개당 {capMb}MB 이하, 한 글에 {maxFiles}개까지 (지울 땐 글자처럼 백스페이스)
        </span>
      )}
    </>
  )
}

/** 저장 직전 정화 — 페이지에서 이걸 거쳐 DB 로 보낸다 */
export function cleanBodyHtml(html: string): string {
  return sanitizeRichText(html)
}
