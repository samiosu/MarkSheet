import { useState } from 'react'
import type { ChoiceTemplate, Question, Sheet } from '../domain/types'
import { moveItem, resizeQuestions } from '../domain/workspace'
import { errorMessage, isText, normalizeChoices } from '../domain/validation'
import { ChoicesEditor } from './ChoicesEditor'
import { ErrorNotice, Icon, Modal } from './Primitives'
import { ChoiceSelector } from './ChoiceSelector'
import { selectedChoices } from '../domain/templates'

export interface SettingsDraft { sheet: Sheet; count: string; templateId: string; customChoices: string[] }

function QuestionEditor({ question, onSave, onClose }: { question: Question; onSave: (question: Question) => void; onClose: () => void }) {
  const [label, setLabel] = useState(question.label)
  const [choices, setChoices] = useState(question.choices)
  const [error, setError] = useState('')
  return <Modal title={`問題「${question.label}」を編集`} onClose={onClose} wide>
    <form className="stack" onSubmit={(event) => {
      event.preventDefault()
      try {
        if (!isText(label)) throw new Error('問題番号を入力してください。')
        onSave({ ...question, label: label.trim(), choices: normalizeChoices(choices) })
      } catch (error) { setError(errorMessage(error)) }
    }}>
      <label className="field">問題番号<input value={label} onChange={(event) => setLabel(event.target.value)} required /></label>
      <ChoicesEditor choices={choices} onChange={setChoices} />
      {error && <ErrorNotice message={error} />}
      <div className="modal-actions"><button type="button" className="button" onClick={onClose}>キャンセル</button><button className="button button-primary" type="submit">編集内容を反映</button></div>
    </form>
  </Modal>
}

export function SheetSettings({ draft, templates, dirty, onChange, onSave }: { draft: SettingsDraft; templates: ChoiceTemplate[]; dirty: boolean; onChange: (draft: SettingsDraft) => void; onSave: () => void }) {
  const [editing, setEditing] = useState<Question | null>(null)
  const [error, setError] = useState('')
  const choices = selectedChoices(templates, draft.templateId, draft.customChoices)
  const updateQuestions = (questions: Question[]) => onChange({ ...draft, sheet: { ...draft.sheet, questions }, count: String(questions.length) })
  function resize() {
    try { updateQuestions(resizeQuestions(draft.sheet.questions, Number(draft.count), choices)); setError('') } catch (error) { setError(errorMessage(error)) }
  }
  return <div className="stack">
    <div className="section-heading"><div><h2>シート設定</h2><p>編集内容は「変更を保存」で確定します。</p></div><span className={`tag ${dirty ? 'tag-amber' : ''}`}>{dirty ? '未保存の変更あり' : '保存済みの構成'}</span></div>
    <section className="panel settings-controls"><div className="form-columns">
      <label className="field">シート名<input value={draft.sheet.title} onChange={(event) => onChange({ ...draft, sheet: { ...draft.sheet, title: event.target.value } })} /></label>
      <div className="field"><label htmlFor="edit-count">問題数</label><div className="input-with-button"><input id="edit-count" type="number" min="1" max="10000" step="1" value={draft.count} onChange={(event) => onChange({ ...draft, count: event.target.value })} /><button type="button" className="button" onClick={resize}>問題数を反映</button></div></div>
    </div><div className="common-template"><ChoiceSelector label="共通の選択肢" templates={templates} templateId={draft.templateId} customChoices={draft.customChoices} onTemplate={(templateId) => onChange({ ...draft, templateId })} onCustom={(customChoices) => onChange({ ...draft, customChoices })} />
      <button className="button" onClick={() => {
        try {
          const normalized = normalizeChoices(choices)
          updateQuestions(draft.sheet.questions.map((q) => ({ ...q, choices: [...normalized] }))); setError('')
        } catch (error) { setError(errorMessage(error)) }
      }}>全問に適用</button><p className="helper">個別に編集した選択肢も置き換わります。</p></div></section>
    {error && <ErrorNotice message={error} />}
    <section className="panel"><div className="panel-heading"><h3>問題の構成 <span className="count-label">{draft.sheet.questions.length}問</span></h3><span className="muted">番号・選択肢・並び順</span></div>
      <ol className="question-settings-list">{draft.sheet.questions.map((q, index) => <li key={q.id} className="question-setting">
        <span className="question-number">{q.label}</span><div className="choice-chips">{q.choices.map((choice) => <span key={choice}>{choice}</span>)}</div>
        <div className="row-actions"><button className="button button-small" onClick={() => setEditing(q)} aria-label={`問題 ${q.label} を編集`}>編集</button>
          <button className="icon-button" disabled={index === 0} aria-label={`問題 ${q.label} を上へ`} onClick={() => updateQuestions(moveItem(draft.sheet.questions, index, -1))}>↑</button>
          <button className="icon-button" disabled={index === draft.sheet.questions.length - 1} aria-label={`問題 ${q.label} を下へ`} onClick={() => updateQuestions(moveItem(draft.sheet.questions, index, 1))}>↓</button>
          <button className="icon-button" disabled={draft.sheet.questions.length === 1} aria-label={`問題 ${q.label} を削除`} onClick={() => updateQuestions(draft.sheet.questions.filter((item) => item.id !== q.id))}><Icon name="trash" /></button></div>
      </li>)}</ol>
      <div className="panel-bottom"><button className="button button-subtle" onClick={() => {
        try { updateQuestions(resizeQuestions(draft.sheet.questions, draft.sheet.questions.length + 1, choices)) } catch (error) { setError(errorMessage(error)) }
      }}><Icon name="plus" />問題を追加</button></div>
    </section>
    <div className="settings-save"><p className="helper">解答や正答が消える場合は、保存前に対象の問題を確認できます。</p><button className="button button-primary" disabled={!dirty} onClick={onSave}><Icon name="check" />変更を保存</button></div>
    {editing && <QuestionEditor question={editing} onClose={() => setEditing(null)} onSave={(question) => {
      if (draft.sheet.questions.some((q) => q.id !== question.id && q.label === question.label)) throw new Error('同じ問題番号がすでにあります。')
      updateQuestions(draft.sheet.questions.map((q) => q.id === question.id ? question : q)); setEditing(null)
    }} />}
  </div>
}
