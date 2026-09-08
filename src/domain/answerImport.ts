import type { AnswerFile, DocumentKind, Question, Workspace } from './types'
import { normalizeChoices, validateAnswerFile, ValidationError } from './validation'
import type { ValidationIssue } from './validation'
import { createWorkspace, newId } from './workspace'

export function toAnswerFile(workspace: Workspace, kind: DocumentKind, blank = false): AnswerFile {
  return workspace.sheet.questions.map(({ id, label }) => ({
    label,
    answer: blank ? null : kind === 'responses' ? workspace.responses[id] : workspace.answerKey[id].answer,
    ...(kind === 'answerKey' ? { points: workspace.answerKey[id].points } : {}),
  }))
}

/** labelの集合を完全一致で照合する。行順は問わず、一部だけの読込は行わない。 */
export function assertAnswersMatch(records: AnswerFile, questions: Pick<Question, 'label' | 'choices'>[]): void {
  const validated = validateAnswerFile(records, { allowPoints: true })
  const byLabel = new Map(questions.map((q) => [q.label, q]))
  const labels = new Set(validated.map((record) => record.label))
  const issues: ValidationIssue[] = []
  for (const record of validated) {
    const question = byLabel.get(record.label)
    const path = `問題「${record.label}」`
    if (!question) issues.push({ path, message: '現在のシートにないlabelです。' })
    else if (record.answer !== null && !question.choices.includes(record.answer)) {
      issues.push({ path: `${path}.answer`, message: `「${record.answer}」は設定された選択肢にありません。シート設定を確認してください。` })
    }
  }
  for (const question of questions) {
    if (!labels.has(question.label)) issues.push({ path: `問題「${question.label}」.label`, message: 'ファイルにこの問題がありません。全問を含めてください。' })
  }
  if (issues.length) throw new ValidationError(issues)
}

export function importAnswers(workspace: Workspace, kind: DocumentKind, input: AnswerFile): Workspace {
  const records = validateAnswerFile(input, { allowPoints: kind === 'answerKey' })
  assertAnswersMatch(records, workspace.sheet.questions)
  const byLabel = new Map(records.map((record) => [record.label, record.answer]))
  if (kind === 'responses') return {
    ...workspace,
    responses: Object.fromEntries(workspace.sheet.questions.map((q) => [q.id, byLabel.get(q.label)!])),
  }
  const hasPoints = records.some((record) => Object.hasOwn(record, 'points'))
  return {
    ...workspace,
    answerKey: Object.fromEntries(workspace.sheet.questions.map((q) => {
      const record = records.find((item) => item.label === q.label)!
      return [q.id, { ...workspace.answerKey[q.id], answer: record.answer, ...(hasPoints ? { points: record.points! } : {}) }]
    })),
  }
}

export function newWorkspaceFromAnswers(input: AnswerFile, kind: DocumentKind, title: string, choices: string[]): Workspace {
  const records = validateAnswerFile(input, { allowPoints: kind === 'answerKey' })
  const normalized = normalizeChoices(choices)
  assertAnswersMatch(records, records.map(({ label }) => ({ label, choices: normalized })))
  const workspace = createWorkspace({
    sheetId: newId(), title: title.trim(),
    questions: records.map(({ label }) => ({ id: newId(), label, choices: [...normalized] })),
  })
  const imported = importAnswers(workspace, kind, records)
  return imported
}
