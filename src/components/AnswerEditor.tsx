import { memo, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { DocumentKind, Question, Workspace } from '../domain/types'
import { isPoints } from '../domain/validation'
import { Icon } from './Primitives'

export function FilePicker({ kind, onFile, disabled = false }: { kind?: DocumentKind; onFile: (file: File, kind?: DocumentKind) => void; disabled?: boolean }) {
  const name = kind === 'responses' ? '解答' : kind === 'answerKey' ? '正答' : ''
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onFile(file, kind)
  }
  return <label className={`button file-picker ${disabled ? 'is-disabled' : ''}`}><Icon name="upload" />{name ? `${name}を読み込む` : 'ファイルを読み込む'}<input className="sr-only" aria-label={`${name}ファイルを選択`} type="file" accept=".csv,.json" onChange={onChange} disabled={disabled} /></label>
}

function PointsInput({ id, label, points, remaining, onChange, onInvalid }: { id: string; label: string; points: number; remaining: number; onChange: (id: string, value: number) => void; onInvalid: (id: string, invalid: boolean) => void }) {
  const [edit, setEdit] = useState({ base: points, text: String(points) })
  const text = edit.base === points ? edit.text : String(points)
  const valid = /^\d+$/.test(text) && isPoints(Number(text)) && Number.isSafeInteger(remaining + Number(text))
  return <div className="points-field"><label><span>配点</span><input aria-label={`問題 ${label} の配点`} type="text" inputMode="numeric" value={text} aria-invalid={!valid} onChange={(event) => {
    const next = event.target.value
    const value = Number(next)
    const nextValid = /^\d+$/.test(next) && isPoints(value) && Number.isSafeInteger(remaining + value)
    setEdit({ base: nextValid ? value : points, text: next })
    onInvalid(id, !nextValid)
    if (nextValid) onChange(id, value)
  }} onBlur={() => {
    if (!valid) { setEdit({ base: points, text: String(points) }); onInvalid(id, false) }
  }} /><span>点</span></label>{!valid && <small role="status">正の整数を入力。未確定のまま離れると元の値に戻ります。</small>}</div>
}

interface MarkRowProps {
  question: Question
  answer: string | null
  kind: DocumentKind
  points: number
  remaining: number
  onAnswer: (id: string, answer: string | null) => void
  onPoints: (id: string, points: number) => void
  onInvalid: (id: string, invalid: boolean) => void
}

const MarkRow = memo(function MarkRow({ question, answer, kind, points, remaining, onAnswer, onPoints, onInvalid }: MarkRowProps) {
  const noun = kind === 'responses' ? '解答' : '正答'
  return <fieldset className={`mark-row ${answer !== null ? 'is-answered' : ''}`}>
    <legend className="sr-only">問題 {question.label} の{noun}</legend>
    <div className="mark-row-content"><div className="question-number"><span>{question.label}</span><small>{answer === null ? kind === 'responses' ? '未回答' : '未設定' : <><Icon name="check" /><span className="sr-only">選択済み</span></>}</small></div>
      <div className="mark-choices">{question.choices.map((choice) => <label className={`mark-choice ${answer === choice ? 'is-selected' : ''}`} key={choice}>
        <input type="radio" name={`${kind}-${question.id}`} value={choice} checked={answer === choice} onChange={() => onAnswer(question.id, choice)} /><span>{choice}</span>
      </label>)}</div>
      <div className="mark-row-tools">{kind === 'answerKey' && <PointsInput id={question.id} label={question.label} points={points} remaining={remaining} onChange={onPoints} onInvalid={onInvalid} />}
        <button type="button" className="clear-answer" disabled={answer === null} aria-label={`問題 ${question.label} の${noun}を消す`} onClick={() => onAnswer(question.id, null)}><Icon name="close" /><span>{noun}を消す</span></button></div>
    </div>
  </fieldset>
})

export function AnswerEditor({ workspace, kind, busy, invalidPoints, onAnswer, onPoints, onInvalid, onFile, onExport, onClear }: {
  workspace: Workspace; kind: DocumentKind; busy: boolean; invalidPoints: boolean
  onAnswer: (id: string, answer: string | null) => void; onPoints: (id: string, points: number) => void; onInvalid: (id: string, invalid: boolean) => void
  onFile: (file: File, kind?: DocumentKind) => void; onExport: (kind: DocumentKind, format: 'csv' | 'json', blank?: boolean) => void; onClear: (kind: DocumentKind) => void
}) {
  const noun = kind === 'responses' ? '解答' : '正答'
  const count = workspace.sheet.questions.filter((q) => (kind === 'responses' ? workspace.responses[q.id] : workspace.answerKey[q.id].answer) !== null).length
  const totalPoints = Object.values(workspace.answerKey).reduce((sum, q) => sum + q.points, 0)
  return <div className="stack">
    {kind === 'answerKey' && <div className="key-mode-banner"><Icon name="key" /><div><strong>正答を編集中</strong><span>採点の基準となる正答と配点を設定します。未設定の問題は採点対象外です。</span></div></div>}
    <div className="section-heading"><div><h2>{noun}を{kind === 'responses' ? 'マークする' : '設定する'}</h2><p>{kind === 'responses' ? '問題を見ながら、当てはまる選択肢を1つ選んでください。' : '正答は解答と別々に保存されます。'}</p></div><span className="tag tag-blue">{count} / {workspace.sheet.questions.length} 問</span></div>
    <div className="file-toolbar"><FilePicker kind={kind} onFile={onFile} disabled={busy} /><div className="export-group"><span className="muted"><Icon name="download" />出力</span><button className="button button-small" disabled={invalidPoints} aria-label={`${noun}をCSVで出力`} onClick={() => onExport(kind, 'csv')}>CSV</button><button className="button button-small" disabled={invalidPoints} aria-label={`${noun}をJSONで出力`} onClick={() => onExport(kind, 'json')}>JSON</button></div><button className="text-button clear-all" disabled={count === 0} onClick={() => onClear(kind)}>全{noun}をクリア</button></div>
    <p className="helper">{kind === 'answerKey' ? '正答のファイルには問題番号（label）・選択値（answer）・配点（points）を出力します。配点なしの旧形式も読み込めます。' : '解答のファイルは問題番号（label）と選択値（answer）のみです。'}読込時は問題番号で照合し、選択肢は画面の設定を使います。</p>
    <section className="panel mark-sheet" aria-label={`${noun}マークシート`}><div className="sheet-column-labels"><span>問題</span><span>選択肢</span><span>{kind === 'answerKey' ? '配点・解除' : '操作'}</span></div>
      {workspace.sheet.questions.map((question) => <MarkRow key={question.id} question={question} kind={kind}
        answer={kind === 'responses' ? workspace.responses[question.id] : workspace.answerKey[question.id].answer}
        points={workspace.answerKey[question.id].points} remaining={kind === 'answerKey' ? totalPoints - workspace.answerKey[question.id].points : 0}
        onAnswer={onAnswer} onPoints={onPoints} onInvalid={onInvalid} />)}
      <div className="sheet-end"><Icon name="check" />ここまで {workspace.sheet.questions.length} 問</div>
    </section>
    {kind === 'answerKey' && <div className="panel distribution-panel"><div><h3>同じシートで解答を集める</h3><p>正答を含まない、全問未回答のシートを出力できます。</p></div><div className="button-row"><button className="button button-small" onClick={() => onExport('responses', 'csv', true)}>空の解答をCSVで出力</button><button className="button button-small" onClick={() => onExport('responses', 'json', true)}>空の解答をJSONで出力</button></div></div>}
  </div>
}
