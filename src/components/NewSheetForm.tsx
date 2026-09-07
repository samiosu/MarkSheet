import { useState } from 'react'
import type { ChoiceTemplate, Workspace } from '../domain/types'
import { newWorkspace } from '../domain/workspace'
import { errorMessage } from '../domain/validation'
import { ErrorNotice, Icon } from './Primitives'
import { ChoiceSelector } from './ChoiceSelector'
import { selectedChoices } from '../domain/templates'

export function NewSheetForm({ templates, onCreate }: { templates: ChoiceTemplate[]; onCreate: (workspace: Workspace) => void }) {
  const [title, setTitle] = useState('練習問題')
  const [count, setCount] = useState('20')
  const [templateId, setTemplateId] = useState(templates[0].id)
  const [customChoices, setCustomChoices] = useState(['', ''])
  const [error, setError] = useState('')
  return <form className="stack" onSubmit={(event) => {
    event.preventDefault()
    try { onCreate(newWorkspace(title, Number(count), selectedChoices(templates, templateId, customChoices))) } catch (error) { setError(errorMessage(error)) }
  }}>
    <label className="field">シート名<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="例：英語 第3章の復習" /></label>
    <label className="field">問題数<input type="number" min="1" max="10000" step="1" value={count} onChange={(event) => setCount(event.target.value)} required /></label>
    <ChoiceSelector templates={templates} templateId={templateId} customChoices={customChoices} onTemplate={setTemplateId} onCustom={setCustomChoices} />
    <p className="helper">問題番号や選択肢は、作成後に問題ごとに変更できます。</p>
    {error && <ErrorNotice message={error} />}
    <button className="button button-primary button-full" type="submit">シートを作成<Icon name="arrow" /></button>
  </form>
}
