export type DocumentKind = 'responses' | 'answerKey'

/** CSV / JSONに含める公開データ。正答ファイルだけ配点を任意で持てる。 */
export interface AnswerRecord {
  label: string
  answer: string | null
  points?: number
}

export type AnswerFile = AnswerRecord[]

export interface Question {
  id: string
  label: string
  choices: string[]
}

export interface ResponseQuestion extends Question {
  answer: string | null
}

export interface KeyQuestion extends ResponseQuestion {
  points: number
}

/** ブラウザー保存と採点に使う内部形式。公開ファイルには出力しない。 */
interface DocumentBase {
  schemaVersion: 1
  sheetId: string
  title: string
}

export interface ResponsesDocument extends DocumentBase {
  kind: 'responses'
  questions: ResponseQuestion[]
}

export interface AnswerKeyDocument extends DocumentBase {
  kind: 'answerKey'
  questions: KeyQuestion[]
}

export type SheetDocument = ResponsesDocument | AnswerKeyDocument

export interface Sheet {
  sheetId: string
  title: string
  questions: Question[]
}

export interface Workspace {
  sheet: Sheet
  responses: Record<string, string | null>
  answerKey: Record<string, { answer: string | null; points: number }>
}

export interface ChoiceTemplate {
  id: string
  name: string
  choices: string[]
}

export type Verdict = 'correct' | 'incorrect' | 'unanswered' | 'excluded'

export interface GradeRow {
  id: string
  label: string
  response: string | null
  answer: string | null
  points: number
  earned: number | null
  verdict: Verdict
}

export interface GradeResult {
  score: number
  maximum: number
  accuracy: number | null
  counts: Record<Verdict, number>
  rows: GradeRow[]
}

export interface AppData {
  workspace: Workspace | null
  templates: ChoiceTemplate[]
}
