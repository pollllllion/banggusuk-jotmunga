import { inlineRuns, plainText } from '@/shared/curationMarkup.mjs'

type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'table'; head: string[] | null; rows: string[][] }

/** **굵게** 만 해석한다. 나머지는 전부 글자 그대로(React 텍스트 노드) */
function Inline({ text }: { text: string }) {
  return <>{(inlineRuns(text) as { text: string; bold: boolean }[]).map((r, i) =>
    r.bold ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>)}</>
}

/**
 * 큐레이션 본문 블록 — 프리렌더의 blocksToHtml 과 같은 구조를 그린다(src/shared/curationMarkup.mjs).
 * 표는 좁은 화면에서 행마다 카드로 쌓는다(칸 이름은 data-label) — 가로로 밀어야 보이는 칸은 안 읽힌다.
 */
export function CurationBlock({ block, className = 'cur-para' }: { block: Block; className?: string }) {
  if (block.type === 'h') return <h2 className="cur-subhead"><Inline text={block.text} /></h2>
  if (block.type === 'ul') return (
    <ul className="cur-list-block">{block.items.map((t, i) => <li key={i}><Inline text={t} /></li>)}</ul>
  )
  if (block.type === 'table') return (
    <div className="cur-table-wrap">
      <table className="cur-table">
        {block.head && (
          <thead><tr>{block.head.map((c, i) => <th key={i}><Inline text={c} /></th>)}</tr></thead>
        )}
        <tbody>
          {block.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} data-label={block.head?.[j] ? plainText(block.head[j]) : undefined}><Inline text={c} /></td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
  return <p className={className}><Inline text={block.text} /></p>
}

export function CurationBlocks({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((b, i) => <CurationBlock key={i} block={b} />)}</>
}
