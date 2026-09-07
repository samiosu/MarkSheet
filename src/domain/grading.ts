import type { GradeResult, GradeRow, SheetDocument } from './types'
import { assertCompatible, validateDocument, ValidationError } from './validation'

export function grade(responsesInput: SheetDocument, keyInput: SheetDocument): GradeResult {
  const responses = validateDocument(responsesInput)
  const key = validateDocument(keyInput)
  if (responses.kind !== 'responses' || key.kind !== 'answerKey') throw new ValidationError([{ path: 'kind', message: '解答と正答をそれぞれ指定してください。' }])
  assertCompatible(responses, key)
  const keyById = new Map(key.questions.map((q) => [q.id, q]))
  const result: GradeResult = { score: 0, maximum: 0, accuracy: null, counts: { correct: 0, incorrect: 0, unanswered: 0, excluded: 0 }, rows: [] }
  for (const q of responses.questions) {
    const correct = keyById.get(q.id)!
    const verdict = correct.answer === null ? 'excluded' : q.answer === null ? 'unanswered' : q.answer === correct.answer ? 'correct' : 'incorrect'
    const earned = verdict === 'excluded' ? null : verdict === 'correct' ? correct.points : 0
    const row: GradeRow = { id: q.id, label: q.label, response: q.answer, answer: correct.answer, points: correct.points, earned, verdict }
    result.rows.push(row)
    result.counts[verdict]++
    result.score += earned ?? 0
    if (verdict !== 'excluded') result.maximum += correct.points
  }
  const count = responses.questions.length - result.counts.excluded
  result.accuracy = count === 0 ? null : result.counts.correct / count * 100
  return result
}
