import { useState } from 'react'
import type { ChoiceTemplate } from '../domain/types'
import { BUILTIN_TEMPLATES } from '../domain/templates'
import { newId, validateTemplate } from '../domain/workspace'
import { errorMessage } from '../domain/validation'
import { ChoicesEditor } from './ChoicesEditor'
import { ErrorNotice, Icon, Modal } from './Primitives'

function TemplateEditor({ template, onSave, onClose }: { template: ChoiceTemplate; onSave: (template: ChoiceTemplate) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(template)
  const [error, setError] = useState('')
  return <Modal title="選択肢テンプレートを編集" onClose={onClose} wide><form className="stack" onSubmit={(event) => {
    event.preventDefault()
    try { onSave(validateTemplate(draft)) } catch (error) { setError(errorMessage(error)) }
  }}><label className="field">テンプレート名<input value={draft.name} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例：正しい・誤り" /></label>
    <ChoicesEditor choices={draft.choices} onChange={(choices) => setDraft({ ...draft, choices })} />{error && <ErrorNotice message={error} />}
    <div className="modal-actions"><button type="button" className="button" onClick={onClose}>キャンセル</button><button className="button button-primary" type="submit">テンプレートを保存</button></div></form></Modal>
}

export function Templates({ templates, onSave, onDelete }: { templates: ChoiceTemplate[]; onSave: (template: ChoiceTemplate) => void; onDelete: (template: ChoiceTemplate) => void }) {
  const [editing, setEditing] = useState<ChoiceTemplate | null>(null)
  function card(template: ChoiceTemplate, builtin: boolean) {
    return <article className="panel template-card" key={template.id}><div className="template-card-top"><div className="template-icon"><Icon name="grid" /></div><span className="tag">{builtin ? '標準' : '自作'}</span></div><h3>{template.name}</h3><div className="choice-chips">{template.choices.map((choice) => <span key={choice}>{choice}</span>)}</div><div className="template-card-actions">
      {!builtin && <button className="button button-small" aria-label={`${template.name} を編集`} onClick={() => setEditing(template)}>編集</button>}
      <button className="button button-small" aria-label={`${template.name} を複製`} onClick={() => setEditing({ ...template, id: newId(), name: `${template.name} のコピー`, choices: [...template.choices] })}><Icon name="copy" />複製</button>
      {!builtin && <button className="icon-button" aria-label={`${template.name} を削除`} onClick={() => onDelete(template)}><Icon name="trash" /></button>}
    </div></article>
  }
  return <div className="stack"><div className="section-heading"><div><h2>選択肢テンプレート</h2><p>よく使う選択肢を、次のシートにも。</p></div><button className="button button-primary" onClick={() => setEditing({ id: newId(), name: '', choices: ['', ''] })}><Icon name="plus" />新しく作る</button></div>
    <div className="template-grid">{BUILTIN_TEMPLATES.map((template) => card(template, true))}{templates.map((template) => card(template, false))}</div>
    <div className="notice soft-notice"><Icon name="copy" /><p>テンプレートは、シートに適用した時点の内容でコピーされます。編集・削除しても、作成済みシートの選択肢は変わりません。</p></div>
    {editing && <TemplateEditor template={editing} onClose={() => setEditing(null)} onSave={(template) => { onSave(template); setEditing(null) }} />}
  </div>
}
