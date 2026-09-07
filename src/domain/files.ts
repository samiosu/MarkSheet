import Papa from 'papaparse'
import type { SheetDocument } from './types'
import { ValidationError, validateDocument } from './validation'

export const CSV_HEADERS = ['schema_version', 'kind', 'sheet_id', 'title', 'question_id', 'question_label', 'choices_json', 'answer', 'points']

export function parseJson(text: string): SheetDocument {
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new ValidationError([{ path: 'JSON', message: 'JSONの構文が壊れています。引用符や括弧を確認してください。' }])
  }
  return validateDocument(raw)
}

export function parseCsv(text: string): SheetDocument {
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
  if (!headers || headers.length !== CSV_HEADERS.length || headers.some((header, i) => header !== CSV_HEADERS[i])) {
    throw new ValidationError([{ path: 'CSVヘッダー', message: `指定の列名・順序が必要です: ${CSV_HEADERS.join(',')}` }])
  }
  if (!rows.length) throw new ValidationError([{ path: 'CSV', message: '問題を1問以上含めてください。' }])
  const metadata = rows[0].slice(0, 4)
  const questions = rows.map((row, index) => {
    const path = `CSVレコード ${index + 2}`
    if (row.length !== CSV_HEADERS.length) throw new ValidationError([{ path, message: '各レコードには9列が必要です。' }])
    if (metadata.some((field, i) => field !== row[i])) throw new ValidationError([{ path, message: 'バージョン・種別・シートID・シート名を全レコードで一致させてください。' }])
    let choices: unknown
    try { choices = JSON.parse(row[6]) } catch {
      throw new ValidationError([{ path: `${path}.choices_json`, message: '選択肢をJSON配列で指定してください。' }])
    }
    if (row[1] === 'responses' && row[8] !== '') throw new ValidationError([{ path: `${path}.points`, message: '解答CSVの配点は空欄にしてください。' }])
    if (row[1] === 'answerKey' && !/^[1-9]\d*$/.test(row[8])) throw new ValidationError([{ path: `${path}.points`, message: '配点は正の整数にしてください。' }])
    return { id: row[4], label: row[5], choices, answer: row[7] === '' ? null : row[7], ...(row[1] === 'answerKey' ? { points: Number(row[8]) } : {}) }
  })
  try {
    return validateDocument({ schemaVersion: metadata[0] === '1' ? 1 : metadata[0], kind: metadata[1], sheetId: metadata[2], title: metadata[3], questions })
  } catch (error) {
    if (error instanceof ValidationError) throw new ValidationError(error.issues.map((issue) => ({ ...issue, path: issue.path.replace(/questions\[(\d+)\]/g, (_, n: string) => `CSVレコード ${Number(n) + 1}`) })))
    throw error
  }
}

export function serializeJson(document: SheetDocument): string {
  return JSON.stringify(validateDocument(document), null, 2) + '\n'
}

export function serializeCsv(document: SheetDocument): string {
  const validated = validateDocument(document)
  const data = validated.questions.map((q) => [
    '1', validated.kind, validated.sheetId, validated.title, q.id, q.label,
    JSON.stringify(q.choices), q.answer ?? '', 'points' in q ? String(q.points) : '',
  ])
  return '\uFEFF' + Papa.unparse({ fields: CSV_HEADERS, data }, { newline: '\r\n' }) + '\r\n'
}

export function parseFileText(text: string, filename: string): SheetDocument {
  if (/\.json$/i.test(filename)) return parseJson(text)
  if (/\.csv$/i.test(filename)) return parseCsv(text)
  throw new ValidationError([{ path: 'ファイル', message: '拡張子が .csv または .json のファイルを選んでください。' }])
}

export async function readDocumentFile(file: File): Promise<SheetDocument> {
  const bytes = await file.arrayBuffer()
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch {
    throw new ValidationError([{ path: '文字コード', message: 'UTF-8で保存したファイルを選んでください。' }])
  }
  return parseFileText(text, file.name)
}

export function downloadDocument(document: SheetDocument, format: 'csv' | 'json'): void {
  const text = format === 'csv' ? serializeCsv(document) : serializeJson(document)
  const blob = new Blob([text], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  const title = Array.from(document.title, (char) => char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? '_' : char).slice(0, 80).join('').replace(/[. ]+$/, '') || 'MarkSheet'
  link.href = url
  link.download = `${title}-${document.kind}.${format}`
  window.document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
