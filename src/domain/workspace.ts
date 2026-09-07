import type { ChoiceTemplate, DocumentKind, Question, Sheet, SheetDocument, Workspace } from './types'
import { assertCompatible, isText, normalizeChoices, validateDocument, ValidationError } from './validation'

export const newId = () => crypto.randomUUID()

export function createWorkspace(sheet: Sheet): Workspace {
  const workspace: Workspace = {
    sheet: { ...sheet, questions: sheet.questions.map((q) => ({ ...q, choices: [...q.choices] })) },
    responses: Object.fromEntries(sheet.questions.map((q) => [q.id, null])),
    answerKey: Object.fromEntries(sheet.questions.map((q) => [q.id, { answer: null, points: 1 }])),
  }
  validateDocument(toDocument(workspace, 'responses'))
  return workspace
}

export function resizeQuestions(questions: Question[], count: number, choices: string[]): Question[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw new ValidationError([{ path: '問題数', message: '1〜10,000の整数を指定してください。' }])
  const normalized = normalizeChoices(choices)
  const result = questions.slice(0, count)
  const used = new Set(result.map((q) => q.label))
  let next = 1
  while (result.length < count) {
    while (used.has(String(next))) next++
    result.push({ id: newId(), label: String(next), choices: [...normalized] })
    used.add(String(next++))
  }
  return result
}

export function newWorkspace(title: string, count: number, choices: string[]): Workspace {
  return createWorkspace({ sheetId: newId(), title: title.trim(), questions: resizeQuestions([], count, choices) })
}

export function toDocument(workspace: Workspace, kind: DocumentKind, blank = false): SheetDocument {
  const common = { schemaVersion: 1 as const, sheetId: workspace.sheet.sheetId, title: workspace.sheet.title }
  if (kind === 'responses') return {
    ...common, kind,
    questions: workspace.sheet.questions.map((q) => ({ ...q, choices: [...q.choices], answer: blank ? null : workspace.responses[q.id] })),
  }
  return {
    ...common, kind,
    questions: workspace.sheet.questions.map((q) => ({ ...q, choices: [...q.choices], ...workspace.answerKey[q.id] })),
  }
}

/** 内部保存データから作業を復元する。公開ファイルの読込はanswerImport.tsで行う。 */
export function importDocument(current: Workspace | null, input: SheetDocument): Workspace {
  const document = validateDocument(input)
  const sameSheet = current?.sheet.sheetId === document.sheetId
  if (sameSheet) assertCompatible(toDocument(current, 'responses'), document)
  const workspace = sameSheet ? current : createWorkspace({
    sheetId: document.sheetId,
    title: document.title,
    questions: document.questions.map(({ id, label, choices }) => ({ id, label, choices })),
  })
  if (document.kind === 'responses') return { ...workspace, responses: Object.fromEntries(document.questions.map((q) => [q.id, q.answer])) }
  return { ...workspace, answerKey: Object.fromEntries(document.questions.map((q) => [q.id, { answer: q.answer, points: q.points }])) }
}

export function structureImpacts(workspace: Workspace, sheet: Sheet): string[] {
  const next = new Map(sheet.questions.map((q) => [q.id, q]))
  return workspace.sheet.questions.flatMap((q) => {
    const updated = next.get(q.id)
    if (!updated) return [`問題「${q.label}」: 問題とその解答・正答・配点を削除`]
    const impacts: string[] = []
    const answer = workspace.responses[q.id]
    const key = workspace.answerKey[q.id].answer
    if (answer !== null && !updated.choices.includes(answer)) impacts.push(`問題「${q.label}」: 解答「${answer}」を未回答に変更`)
    if (key !== null && !updated.choices.includes(key)) impacts.push(`問題「${q.label}」: 正答「${key}」を未設定に変更`)
    return impacts
  })
}

export function updateSheet(workspace: Workspace, sheet: Sheet): Workspace {
  if (sheet.sheetId !== workspace.sheet.sheetId) throw new Error('構成の編集でシートIDは変更できません。')
  const updated: Workspace = {
    sheet,
    responses: Object.fromEntries(sheet.questions.map((q) => {
      const answer = Object.hasOwn(workspace.responses, q.id) ? workspace.responses[q.id] : null
      return [q.id, answer !== null && q.choices.includes(answer) ? answer : null]
    })),
    answerKey: Object.fromEntries(sheet.questions.map((q) => {
      const key = Object.hasOwn(workspace.answerKey, q.id) ? workspace.answerKey[q.id] : { answer: null, points: 1 }
      return [q.id, { answer: key.answer !== null && q.choices.includes(key.answer) ? key.answer : null, points: key.points }]
    })),
  }
  validateDocument(toDocument(updated, 'responses'))
  validateDocument(toDocument(updated, 'answerKey'))
  return updated
}

export function validateTemplate(template: ChoiceTemplate): ChoiceTemplate {
  if (!isText(template.id) || !isText(template.name)) throw new ValidationError([{ path: 'テンプレート', message: '名前を入力してください。' }])
  return { ...template, name: template.name.trim(), choices: normalizeChoices(template.choices) }
}

export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const next = [...items]
  const target = index + delta
  if (index < 0 || target < 0 || index >= items.length || target >= items.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
