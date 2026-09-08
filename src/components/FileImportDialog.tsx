import { useState } from 'react'
import type { AnswerFile, ChoiceTemplate, DocumentKind, Workspace } from '../domain/types'
import { assertAnswersMatch, importAnswers, newWorkspaceFromAnswers } from '../domain/answerImport'
import { errorMessage, isText, normalizeChoices } from '../domain/validation'
import { ErrorNotice, Modal } from './Primitives'
import { ChoiceSelector } from './ChoiceSelector'
import { selectedChoices } from '../domain/templates'

export interface PendingImport {
  filename: string
  records: AnswerFile
  kind?: DocumentKind
}

export function FileImportDialog({ input, workspace, templates, onClose, onImport }: {
  input: PendingImport
  workspace: Workspace | null
  templates: ChoiceTemplate[]
  onClose: () => void
  onImport: (workspace: Workspace, kind: DocumentKind) => void
}) {
  const [kind, setKind] = useState<DocumentKind>(input.kind ?? 'responses')
  const [target, setTarget] = useState(workspace ? 'current' : 'new')
  const [title, setTitle] = useState(input.filename.replace(/\.(csv|json)$/i, '') || '練習問題')
  const [templateId, setTemplateId] = useState(() => (
    templates.find((template) => input.records.every((record) => record.answer === null || template.choices.includes(record.answer))) ?? templates[0]
  ).id)
  const [customChoices, setCustomChoices] = useState(['', ''])
  const [submitError, setSubmitError] = useState('')
  const choices = selectedChoices(templates, templateId, customChoices)
  const useCurrent = target === 'current' && workspace !== null
  const noun = kind === 'responses' ? '解答' : '正答'
  let validationError = ''
  try {
    if (!useCurrent && !isText(title)) throw new Error('シート名を入力してください。')
    if (kind === 'responses' && input.records.some((record) => Object.hasOwn(record, 'points'))) throw new Error('配点付きファイルは正答の読込先で使用してください。解答はlabelとanswerだけです。')
    const normalized = useCurrent ? [] : normalizeChoices(choices)
    assertAnswersMatch(input.records, useCurrent ? workspace.sheet.questions : input.records.map(({ label }) => ({ label, choices: normalized })))
  } catch (error) { validationError = errorMessage(error) }

  return <Modal title="ファイルの読込を確認" onClose={onClose}>
    <form className="stack" onSubmit={(event) => {
      event.preventDefault()
      if (validationError) return
      try {
        const next = useCurrent ? importAnswers(workspace, kind, input.records) : newWorkspaceFromAnswers(input.records, kind, title, choices)
        onImport(next, kind)
      } catch (error) { setSubmitError(errorMessage(error)) }
    }}>
      <dl className="import-summary"><div><dt>ファイル</dt><dd>{input.filename}</dd></div><div><dt>問題数</dt><dd>{input.records.length}問（未設定 {input.records.filter((record) => record.answer === null).length}問）</dd></div></dl>
      {input.kind ? <p><strong>読込先：{noun}</strong></p> : <label className="field">読込先<select value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)}><option value="responses">解答</option><option value="answerKey">正答</option></select></label>}
      {workspace && <label className="field">読み込むシート<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="current">現在のシート：{workspace.sheet.title}</option><option value="new">新しいシートとして開く</option></select></label>}
      {!useCurrent && <>
        <label className="field">シート名<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <ChoiceSelector templates={templates} templateId={templateId} customChoices={customChoices} onTemplate={setTemplateId} onCustom={setCustomChoices} />
        <p className="helper">全問にこの選択肢を設定します。配点は1問1点で始め、正答タブで変更できます。</p>
      </>}
      <table className="import-preview"><caption>読込内容{input.records.length > 5 ? '（先頭5問）' : ''}</caption><thead><tr><th scope="col">問題番号</th><th scope="col">選択値</th>{input.records.some((record) => Object.hasOwn(record, 'points')) && <th scope="col">配点</th>}</tr></thead><tbody>{input.records.slice(0, 5).map((record) => <tr key={record.label}><th scope="row">{record.label}</th><td>{record.answer ?? '未設定'}</td>{input.records.some((item) => Object.hasOwn(item, 'points')) && <td>{record.points ?? '—'}</td>}</tr>)}</tbody></table>
      <p className="notice">{useCurrent ? `問題番号（label）で照合し、現在の${noun}を全問置き換えます。${kind === 'responses' ? '正答' : '解答'}・配点・選択肢・並び順は保持します。` : workspace ? `現在の「${workspace.sheet.title}」の解答・正答・設定を、新しいシートに置き換えます。自作テンプレートは保持します。` : kind === 'answerKey' ? 'この正答から、全問未回答の解答シートも作成します。' : 'この解答で新しいシートを作成します。正答は後から入力・読込できます。'}</p>
      {(validationError || submitError) && <ErrorNotice message={validationError || submitError} />}
      <div className="modal-actions"><button className="button" type="button" onClick={onClose}>キャンセル</button><button className="button button-primary" type="submit" disabled={Boolean(validationError)}>読み込みを確定</button></div>
    </form>
  </Modal>
}
