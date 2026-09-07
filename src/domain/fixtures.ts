import type { AnswerKeyDocument, ResponsesDocument } from './types'

/** 公開用の架空の4問。正解・不正解・未回答・対象外を1問ずつ含む。 */
export function samplePair(): { responses: ResponsesDocument; answerKey: AnswerKeyDocument } {
  const common = { schemaVersion: 1 as const, sheetId: 'marksheet-sample-001', title: '練習問題' }
  const questions = ['1', '2', '3', '4'].map((label, index) => ({ id: `q${index + 1}`, label, choices: ['ア', 'イ', 'ウ', 'エ'] }))
  return {
    responses: { ...common, kind: 'responses', questions: questions.map((q, i) => ({ ...q, choices: [...q.choices], answer: ['ア', 'ウ', null, 'ア'][i] })) },
    answerKey: { ...common, kind: 'answerKey', questions: questions.map((q, i) => ({ ...q, choices: [...q.choices], answer: ['ア', 'イ', 'ウ', null][i], points: [2, 1, 3, 1][i] })) },
  }
}
