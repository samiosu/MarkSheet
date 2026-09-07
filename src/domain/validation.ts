import type { AnswerFile, Question, SheetDocument } from './types'

export interface ValidationIssue {
  path: string
  message: string
}

export class ValidationError extends Error {
  readonly issues: ValidationIssue[]
  constructor(issues: ValidationIssue[]) {
    super(issues.map(({ path, message }) => `${path}: ${message}`).join('\n'))
    this.name = 'ValidationError'
    this.issues = issues
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isPoints(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function choiceIssues(value: unknown, path = '選択肢'): ValidationIssue[] {
  if (!Array.isArray(value) || value.length < 2) {
    return [{ path, message: '選択肢を2つ以上指定してください。' }]
  }
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  value.forEach((choice: unknown, index: number) => {
    const itemPath = `${path}[${index + 1}]`
    if (!isText(choice)) {
      issues.push({ path: itemPath, message: '空ではない文字列を指定してください。' })
    } else if (seen.has(choice.trim())) {
      issues.push({ path: itemPath, message: `選択肢「${choice}」が重複しています。` })
    } else {
      seen.add(choice.trim())
    }
  })
  return issues
}

export function normalizeChoices(choices: string[]): string[] {
  const normalized = choices.map((choice) => choice.trim())
  const issues = choiceIssues(normalized)
  if (issues.length) throw new ValidationError(issues)
  return normalized
}

/** 公開ファイルはlabelとanswerだけ。空文字のanswerは未回答に統一する。 */
export function validateAnswerFile(value: unknown): AnswerFile {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError([{ path: 'ファイル', message: 'labelとanswerを持つ配列に、問題を1問以上含めてください。' }])
  }
  const issues: ValidationIssue[] = []
  const labels = new Set<string>()
  const records: AnswerFile = []
  value.forEach((item: unknown, index) => {
    const path = `records[${index + 1}]`
    if (!isRecord(item)) {
      issues.push({ path, message: 'labelとanswerを持つオブジェクトが必要です。' })
      return
    }
    for (const key of Object.keys(item)) {
      if (key !== 'label' && key !== 'answer') issues.push({ path: `${path}.${key}`, message: '使用できる項目はlabelとanswerだけです。' })
    }
    if (!isText(item.label)) issues.push({ path: `${path}.label`, message: '空ではない文字列の問題番号が必要です。' })
    else if (labels.has(item.label)) issues.push({ path: `${path}.label`, message: `問題番号「${item.label}」が重複しています。` })
    else labels.add(item.label)
    if (item.answer !== null && item.answer !== '' && !isText(item.answer)) {
      issues.push({ path: `${path}.answer`, message: '選択値の文字列、または未回答を表すnull・空文字が必要です。' })
    }
    records.push({ label: item.label as string, answer: item.answer === '' ? null : item.answer as string | null })
  })
  if (issues.length) throw new ValidationError(issues)
  return records
}

/** 内部保存データの文字列は数値化・Unicode正規化せず、そのまま保持する。 */
export function validateDocument(value: unknown): SheetDocument {
  if (!isRecord(value)) {
    throw new ValidationError([{ path: 'ファイル', message: 'シートを表すオブジェクトが必要です。' }])
  }
  const issues: ValidationIssue[] = []
  if (value.schemaVersion !== 1) issues.push({ path: 'schemaVersion', message: '対応するバージョンは数値の1です。' })
  if (value.kind !== 'responses' && value.kind !== 'answerKey') issues.push({ path: 'kind', message: 'responses または answerKey を指定してください。' })
  for (const key of ['sheetId', 'title']) {
    if (!isText(value[key])) issues.push({ path: key, message: '空ではない文字列が必要です。' })
  }
  const questions: (Question & { answer: string | null; points?: number })[] = []
  if (!Array.isArray(value.questions) || value.questions.length === 0) {
    issues.push({ path: 'questions', message: '問題を1問以上含めてください。' })
  } else {
    const ids = new Set<string>()
    const labels = new Set<string>()
    let totalPoints = 0
    value.questions.forEach((item: unknown, index: number) => {
      const path = `questions[${index + 1}]`
      if (!isRecord(item)) {
        issues.push({ path, message: '問題を表すオブジェクトが必要です。' })
        return
      }
      for (const [key, seen] of [['id', ids], ['label', labels]] as const) {
        const text = item[key]
        if (!isText(text)) issues.push({ path: `${path}.${key}`, message: '空ではない文字列が必要です。' })
        else if (seen.has(text)) issues.push({ path: `${path}.${key}`, message: `「${text}」が重複しています。` })
        else seen.add(text)
      }
      issues.push(...choiceIssues(item.choices, `${path}.choices`))
      if (item.answer !== null && (typeof item.answer !== 'string' || !Array.isArray(item.choices) || !item.choices.includes(item.answer))) {
        issues.push({ path: `${path}.answer`, message: 'null または選択肢に含まれる文字列が必要です。' })
      }
      if (value.kind === 'answerKey') {
        if (!isPoints(item.points)) issues.push({ path: `${path}.points`, message: '配点は安全に扱える正の整数にしてください。' })
        else totalPoints += item.points
      } else if (Object.hasOwn(item, 'points')) {
        issues.push({ path: `${path}.points`, message: '解答のJSONに配点は含められません。' })
      }
      questions.push({
        id: item.id as string,
        label: item.label as string,
        choices: Array.isArray(item.choices) ? [...item.choices] : [],
        answer: item.answer as string | null,
        ...(value.kind === 'answerKey' ? { points: item.points as number } : {}),
      })
    })
    if (!Number.isSafeInteger(totalPoints)) issues.push({ path: 'questions.points', message: '配点の合計が安全に扱える整数の上限を超えています。' })
  }
  if (issues.length) throw new ValidationError(issues)
  return { schemaVersion: 1, kind: value.kind, sheetId: value.sheetId, title: value.title, questions } as SheetDocument
}

/** 問題の表示順とシート名は照合条件に含めない。 */
export function assertCompatible(left: SheetDocument, right: SheetDocument): void {
  const issues: ValidationIssue[] = []
  if (left.sheetId !== right.sheetId) issues.push({ path: 'sheetId', message: 'シートIDが異なります。同じシートから出力したファイルを使用してください。' })
  const leftQuestions = new Map(left.questions.map((q) => [q.id, q]))
  const rightQuestions = new Map(right.questions.map((q) => [q.id, q]))
  for (const q of left.questions) {
    const other = rightQuestions.get(q.id)
    if (!other) issues.push({ path: `問題「${q.label}」`, message: '対応する問題IDがファイルにありません。' })
    else {
      if (q.label !== other.label) issues.push({ path: `問題「${q.label}」.label`, message: '同じ問題IDの表示番号が異なります。' })
      if (q.choices.length !== other.choices.length || q.choices.some((choice, i) => choice !== other.choices[i])) {
        issues.push({ path: `問題「${q.label}」.choices`, message: '選択肢または選択肢の順序が異なります。' })
      }
    }
  }
  for (const q of right.questions) {
    if (!leftQuestions.has(q.id)) issues.push({ path: `問題「${q.label}」`, message: '現在のシートにない問題IDです。' })
  }
  if (issues.length) throw new ValidationError(issues)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '処理を完了できませんでした。'
}
