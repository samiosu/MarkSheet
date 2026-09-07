import { useId } from 'react'
import { moveItem } from '../domain/workspace'
import { Icon } from './Primitives'

export function ChoicesEditor({ choices, onChange }: { choices: string[]; onChange: (choices: string[]) => void }) {
  const prefix = useId()
  return <div className="choices-editor">
    <p className="field-label">選択肢 <span className="muted">1行に1つ・2つ以上</span></p>
    <div className="choice-editor-list">{choices.map((choice, index) => <div className="choice-editor-row" key={index}>
      <span className="editor-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <label className="sr-only" htmlFor={`${prefix}-${index}`}>選択肢 {index + 1}</label>
      <input id={`${prefix}-${index}`} value={choice} onChange={(event) => onChange(choices.map((item, i) => i === index ? event.target.value : item))} />
      <button type="button" className="icon-button" aria-label={`選択肢 ${index + 1} を上へ`} disabled={index === 0} onClick={() => onChange(moveItem(choices, index, -1))}>↑</button>
      <button type="button" className="icon-button" aria-label={`選択肢 ${index + 1} を下へ`} disabled={index === choices.length - 1} onClick={() => onChange(moveItem(choices, index, 1))}>↓</button>
      <button type="button" className="icon-button" aria-label={`選択肢 ${index + 1} を削除`} disabled={choices.length <= 2} onClick={() => onChange(choices.filter((_, i) => i !== index))}><Icon name="close" /></button>
    </div>)}</div>
    <button type="button" className="button button-subtle" onClick={() => onChange([...choices, ''])}><Icon name="plus" />選択肢を追加</button>
    <p className="helper">カンマも選択肢の文字として使えます。前後の空白は保存時に取り除きます。</p>
  </div>
}
