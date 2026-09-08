import Papa from 'papaparse'
import type { AnswerFile, DocumentKind } from './types'
import { ValidationError, validateAnswerFile } from './validation'

export const CSV_HEADERS = ['label', 'answer'] as const
export const CSV_HEADERS_WITH_POINTS = ['label', 'answer', 'points'] as const

export function parseJson(text: string): AnswerFile {
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new ValidationError([{ path: 'JSON', message: 'JSONの構文が壊れています。引用符や括弧を確認してください。' }])
  }
  return validateAnswerFile(raw, { allowPoints: true })
}

export function parseCsv(text: string): AnswerFile {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    delimiter: ',',
    header: false,
    dynamicTyping: false,
    skipEmptyLines: true,
  })
  if (parsed.errors.length) {
    throw new ValidationError(parsed.errors.map((error) => ({
      path: `CSVレコード ${(error.row ?? 0) + 1}`,
      message: `CSVの引用符・区切りを確認してください（${error.code}）。`,
    })))
  }
  const [headers, ...rows] = parsed.data
  const pointsColumn = headers?.length === CSV_HEADERS_WITH_POINTS.length && headers.every((header, i) => header === CSV_HEADERS_WITH_POINTS[i])
  const answerColumn = headers?.length === CSV_HEADERS.length && headers.every((header, i) => header === CSV_HEADERS[i])
  if (!headers || (!answerColumn && !pointsColumn)) {
    throw new ValidationError([{ path: 'CSVヘッダー', message: `指定の列名・順序が必要です: ${CSV_HEADERS.join(',')} または ${CSV_HEADERS_WITH_POINTS.join(',')}` }])
  }
  if (!rows.length) throw new ValidationError([{ path: 'CSV', message: '問題を1問以上含めてください。' }])
  const records = rows.map((row, index) => {
    const path = `CSVレコード ${index + 2}`
    if (row.length !== headers.length) throw new ValidationError([{ path, message: `各レコードには${headers.length}列が必要です。` }])
    if (pointsColumn && !/^[1-9]\d*$/.test(row[2])) throw new ValidationError([{ path: `${path}.points`, message: '配点は正の整数にしてください。' }])
    return { label: row[0], answer: row[1] === '' ? null : row[1], ...(pointsColumn ? { points: Number(row[2]) } : {}) }
  })
  try {
    return validateAnswerFile(records, { allowPoints: true })
  } catch (error) {
    if (error instanceof ValidationError) throw new ValidationError(error.issues.map((issue) => ({ ...issue, path: issue.path.replace(/records\[(\d+)\]/g, (_, n: string) => `CSVレコード ${Number(n) + 1}`) })))
    throw error
  }
}

export function serializeJson(records: AnswerFile): string {
  return JSON.stringify(validateAnswerFile(records, { allowPoints: true }), null, 2) + '\n'
}

export function serializeCsv(records: AnswerFile): string {
  const validated = validateAnswerFile(records, { allowPoints: true })
  const withPoints = validated.some((record) => Object.hasOwn(record, 'points'))
  const fields = withPoints ? CSV_HEADERS_WITH_POINTS : CSV_HEADERS
  const data = validated.map(({ label, answer, points }) => [label, answer ?? '', ...(withPoints ? [String(points)] : [])])
  return '\uFEFF' + Papa.unparse({ fields: [...fields], data }, { newline: '\r\n' }) + '\r\n'
}

export function parseFileText(text: string, filename: string): AnswerFile {
  if (/\.json$/i.test(filename)) return parseJson(text)
  if (/\.csv$/i.test(filename)) return parseCsv(text)
  throw new ValidationError([{ path: 'ファイル', message: '拡張子が .csv または .json のファイルを選んでください。' }])
}

export async function readAnswerFile(file: File): Promise<AnswerFile> {
  const bytes = await file.arrayBuffer()
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch {
    throw new ValidationError([{ path: '文字コード', message: 'UTF-8で保存したファイルを選んでください。' }])
  }
  return parseFileText(text, file.name)
}

export function downloadAnswers(records: AnswerFile, format: 'csv' | 'json', sheetTitle: string, kind: DocumentKind): void {
  const text = format === 'csv' ? serializeCsv(records) : serializeJson(records)
  const blob = new Blob([text], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  const title = Array.from(sheetTitle, (char) => char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? '_' : char).slice(0, 80).join('').replace(/[. ]+$/, '') || 'MarkSheet'
  link.href = url
  link.download = `${title}-${kind}.${format}`
  window.document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
