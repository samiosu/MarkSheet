import type { ChoiceTemplate } from '../domain/types'
import { ChoicesEditor } from './ChoicesEditor'
import { CUSTOM_CHOICES, selectedChoices } from '../domain/templates'

export function ChoiceSelector({ templates, templateId, customChoices, onTemplate, onCustom, label = '選択肢テンプレート' }: {
  templates: ChoiceTemplate[]; templateId: string; customChoices: string[]
  onTemplate: (id: string) => void; onCustom: (choices: string[]) => void; label?: string
}) {
  const choices = selectedChoices(templates, templateId, customChoices)
  return <div className="stack">
    <label className="field">{label}<select value={templateId} onChange={(event) => onTemplate(event.target.value)}>
      {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
      <option value={CUSTOM_CHOICES}>自由に入力（任意の選択肢）</option>
    </select></label>
    {templateId === CUSTOM_CHOICES ? <ChoicesEditor choices={customChoices} onChange={onCustom} /> : <div className="template-preview" aria-label="選択肢のプレビュー">{choices.map((choice) => <span key={choice}><i aria-hidden="true" />{choice}</span>)}</div>}
    <p className="helper">2択・3択・5択以上にも対応します。「自由に入力」で文字・数字・記号を指定し、追加・削除で個数を変更できます。</p>
  </div>
}
