import type { AppData, ChoiceTemplate } from './types'
import { BUILTIN_TEMPLATES } from './templates'
import { importDocument, toDocument, validateTemplate } from './workspace'
import { isRecord, validateDocument } from './validation'

export const STORAGE_KEY = 'marksheet:workspace:v1'
export const emptyData = (): AppData => ({ workspace: null, templates: [] })
type AppStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function encodeData(data: AppData): string {
  return JSON.stringify({
    storageVersion: 1,
    responses: data.workspace ? toDocument(data.workspace, 'responses') : null,
    answerKey: data.workspace ? toDocument(data.workspace, 'answerKey') : null,
    templates: data.templates,
  })
}

export function decodeData(text: string): AppData {
  const raw: unknown = JSON.parse(text)
  if (!isRecord(raw) || raw.storageVersion !== 1 || !Array.isArray(raw.templates)) throw new Error('保存形式に対応していません。')
  const ids = new Set(BUILTIN_TEMPLATES.map((template) => template.id))
  const templates = raw.templates.map((item: unknown) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || !Array.isArray(item.choices) || item.choices.some((choice: unknown) => typeof choice !== 'string')) throw new Error('保存済みテンプレートが壊れています。')
    const template = validateTemplate(item as unknown as ChoiceTemplate)
    if (ids.has(template.id)) throw new Error('保存済みテンプレートのIDが重複しています。')
    ids.add(template.id)
    return template
  })
  if (raw.responses === null && raw.answerKey === null) return { workspace: null, templates }
  const responses = validateDocument(raw.responses)
  const answerKey = validateDocument(raw.answerKey)
  if (responses.kind !== 'responses' || answerKey.kind !== 'answerKey' || responses.sheetId !== answerKey.sheetId) throw new Error('保存済みの解答と正答が一致しません。')
  return { workspace: importDocument(importDocument(null, responses), answerKey), templates }
}

export function loadData(getStorage: () => AppStorage): { data: AppData; message: string; failed: boolean } {
  try {
    const text = getStorage().getItem(STORAGE_KEY)
    return { data: text === null ? emptyData() : decodeData(text), message: text === null ? 'このブラウザーに自動保存' : '保存した作業を復元しました', failed: false }
  } catch {
    return { data: emptyData(), message: '保存データを復元できませんでした。新規作成・ファイル読込は利用できます。', failed: true }
  }
}

export function saveData(storage: AppStorage, data: AppData): void {
  if (data.workspace === null && data.templates.length === 0) storage.removeItem(STORAGE_KEY)
  else storage.setItem(STORAGE_KEY, encodeData(data))
}
