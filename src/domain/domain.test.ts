import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCsv, parseFileText, parseJson, readDocumentFile, serializeCsv, serializeJson } from './files'
import { samplePair } from './fixtures'
import { grade } from './grading'
import type { SheetDocument } from './types'
import { assertCompatible, normalizeChoices, validateDocument, ValidationError } from './validation'
import { createWorkspace, importDocument, newWorkspace, resizeQuestions, structureImpacts, toDocument, updateSheet, validateTemplate } from './workspace'
import { initialState, reducer } from './state'
import { decodeData, emptyData, encodeData, loadData, saveData, STORAGE_KEY } from './storage'

describe('採点', () => {
  it('配点の異なる4つの判定を正しく集計する', () => {
    const { responses, answerKey } = samplePair()
    const result = grade(responses, answerKey)
    expect(result).toMatchObject({ score: 2, maximum: 6, counts: { correct: 1, incorrect: 1, unanswered: 1, excluded: 1 } })
    expect(result.accuracy?.toFixed(1)).toBe('33.3')
    expect(result.rows.map((row) => row.verdict)).toEqual(['correct', 'incorrect', 'unanswered', 'excluded'])
  })
  it('全問正答未設定は対象なし、全問未回答は0点になる', () => {
    const { responses, answerKey } = samplePair()
    const noKey = { ...answerKey, questions: answerKey.questions.map((q) => ({ ...q, answer: null })) }
    expect(grade(responses, noKey)).toMatchObject({ score: 0, maximum: 0, accuracy: null, counts: { excluded: 4 } })
    const blank = { ...responses, questions: responses.questions.map((q) => ({ ...q, answer: null })) }
    expect(grade(blank, answerKey)).toMatchObject({ score: 0, maximum: 6, accuracy: 0, counts: { unanswered: 3, excluded: 1 } })
  })
  it('全問正解は満点と100%、0で除算しない', () => {
    const { responses, answerKey } = samplePair()
    responses.questions.forEach((q, i) => { q.answer = answerKey.questions[i].answer })
    expect(grade(responses, answerKey)).toMatchObject({ score: 6, maximum: 6, accuracy: 100 })
  })
  it('行の並びとシート名が変わってもIDで対応する', () => {
    const { responses, answerKey } = samplePair()
    const reordered = { ...answerKey, title: '別の表示名', questions: [...answerKey.questions].reverse() }
    expect(grade(responses, reordered)).toEqual(grade(responses, answerKey))
  })
  it.each(['sheetId', 'missing', 'extra', 'label', 'choices', 'choiceOrder'] as const)('不一致 %s は採点しない', (change) => {
    const { responses, answerKey } = samplePair()
    if (change === 'sheetId') answerKey.sheetId = 'different'
    if (change === 'missing') answerKey.questions.pop()
    if (change === 'extra') answerKey.questions.push({ ...answerKey.questions[0], id: 'extra', label: '追加' })
    if (change === 'label') answerKey.questions[0].label = '問1'
    if (change === 'choices') answerKey.questions[0].choices.push('オ')
    if (change === 'choiceOrder') answerKey.questions[0].choices.reverse()
    expect(() => grade(responses, answerKey)).toThrow(ValidationError)
  })
})

describe('公開形式とファイル往復', () => {
  for (const kind of ['responses', 'answerKey'] as const) {
    for (const format of ['json', 'csv'] as const) {
      it(`${kind} / ${format} は日本語・引用符・改行・カンマ・先頭ゼロを保持する`, () => {
        const document = samplePair()[kind]
        document.title = 'タイトル,"引用"\n改行'
        document.questions[0].label = '001'
        document.questions[0].choices = ['01', '1', 'カンマ,あり', '"引用"', '途中\n改行', '<img src=x onerror=alert(1)>']
        document.questions[0].answer = '01'
        const output = format === 'csv' ? serializeCsv(document) : serializeJson(document)
        expect(parseFileText(output, `sheet.${format}`)).toEqual(document)
        expect(parseJson(serializeJson(parseCsv(serializeCsv(document))))).toEqual(document)
      })
      it(`配布サンプル ${kind}.${format} は形式仕様と採点例に一致する`, () => {
        const file = readFileSync(resolve('public', 'samples', `${kind}.${format}`), 'utf8')
        expect(parseFileText(file, `sample.${format}`)).toEqual(samplePair()[kind])
      })
    }
  }
  it('CSVのBOM有無とCRLF/LFを許容する', () => {
    const { responses } = samplePair()
    const csv = serializeCsv(responses)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(parseCsv(csv.slice(1))).toEqual(responses)
    expect(parseCsv(csv.replace(/\r\n/g, '\n'))).toEqual(responses)
  })
  it('JSONのBOMと、文字列に含まれる__proto__などのIDも安全に扱う', () => {
    const { responses, answerKey } = samplePair()
    for (const document of [responses, answerKey]) document.questions[0].id = '__proto__'
    expect(parseJson('\uFEFF' + serializeJson(responses))).toEqual(responses)
    const workspace = importDocument(importDocument(null, responses), answerKey)
    expect(workspace.responses.__proto__).toBe('ア')
    expect(grade(toDocument(workspace, 'responses'), toDocument(workspace, 'answerKey')).score).toBe(2)
  })
  it.each([
    ['壊れた引用符', (text: string) => text + '1,responses,s,t,q,5,"unterminated,,'],
    ['不足列', (text: string) => text.replace(',イ,1', ',イ')],
    ['異なるメタデータ', (text: string) => text.replace('q2,2', 'q2,2').replace(/1,answerKey/, '1,responses')],
    ['異なるヘッダー', (text: string) => text.replace('question_id', 'id')],
    ['不正な選択肢JSON', (text: string) => text.replace('"[""ア"",""イ"",""ウ"",""エ""]"', 'broken')],
  ])('CSVの%sを拒否する', (_, mutate) => {
    expect(() => parseCsv(mutate(serializeCsv(samplePair().answerKey)))).toThrow(ValidationError)
  })
  it('解答CSVの配点、未知拡張子、JSON構文エラーを拒否する', () => {
    expect(() => parseCsv(serializeCsv(samplePair().answerKey).replaceAll('answerKey', 'responses'))).toThrow(/配点/)
    expect(() => parseFileText('{}', 'sheet.txt')).toThrow(/拡張子/)
    expect(() => parseJson('{')).toThrow(/構文/)
  })
  it('CSVのエラーは該当レコードと項目を含む', () => {
    const bad = serializeCsv(samplePair().responses).replace('q2,2', 'q1,2')
    expect(() => parseCsv(bad)).toThrow(/CSVレコード 3.id/)
  })
  it('UTF-8以外を拒否し、拡張子だけでは形式を信用しない', async () => {
    await expect(readDocumentFile(new File([new Uint8Array([0x82, 0xa0])], 'cp932.csv'))).rejects.toThrow(/UTF-8/)
    await expect(readDocumentFile(new File([serializeJson(samplePair().responses)], 'mislabeled.csv'))).rejects.toThrow(ValidationError)
  })
})

describe('検証', () => {
  const invalidCases: [string, (document: Record<string, unknown>) => void][] = [
    ['version', (d) => { d.schemaVersion = 2 }],
    ['kind', (d) => { d.kind = 'unknown' }],
    ['empty', (d) => { d.questions = [] }],
    ['not-object', (d) => { d.questions = [null] }],
  ]
  it.each(invalidCases)('%sを拒否する', (_, mutate) => {
    const document = samplePair().answerKey as unknown as Record<string, unknown>
    mutate(document)
    expect(() => validateDocument(document)).toThrow(ValidationError)
  })
  it.each(['id', 'label', 'fewChoices', 'duplicateChoices', 'blankChoice', 'numericChoice', 'answer', 'missingAnswer', 'points0', 'pointsNegative', 'pointsDecimal', 'pointsHuge', 'pointsString'] as const)('%sを拒否する', (change) => {
    const document = samplePair().answerKey
    const q = document.questions[0] as unknown as Record<string, unknown>
    if (change === 'id' || change === 'label') q[change] = document.questions[1][change]
    if (change === 'fewChoices') q.choices = ['ア']
    if (change === 'duplicateChoices') q.choices = ['ア', ' ア ']
    if (change === 'blankChoice') q.choices = ['ア', ' ']
    if (change === 'numericChoice') q.choices = ['ア', 1]
    if (change === 'answer') q.answer = 'オ'
    if (change === 'missingAnswer') delete q.answer
    if (change === 'points0') q.points = 0
    if (change === 'pointsNegative') q.points = -1
    if (change === 'pointsDecimal') q.points = 0.5
    if (change === 'pointsHuge') q.points = Number.MAX_SAFE_INTEGER
    if (change === 'pointsString') q.points = '1'
    expect(() => validateDocument(document)).toThrow(ValidationError)
  })
  it('選択肢の01と1を同一化しない。編集時の前後空白のみ除去する', () => {
    expect(normalizeChoices([' 01 ', '1', '正しい,と思う'])).toEqual(['01', '1', '正しい,と思う'])
    expect(() => normalizeChoices(['1', ' 1'])).toThrow(/重複/)
  })
})

describe('作業の編集と状態', () => {
  it('正答先行から空の解答を作り、正答・配点を漏らさない', () => {
    const workspace = importDocument(null, samplePair().answerKey)
    const blank = toDocument(workspace, 'responses', true)
    expect(blank.questions.every((q) => q.answer === null && !('points' in q))).toBe(true)
    expect(Object.keys(blank).sort()).toEqual(['kind', 'questions', 'schemaVersion', 'sheetId', 'title'].sort())
    expect(blank.sheetId).toBe(samplePair().answerKey.sheetId)
  })
  it('同一シートは対象側だけ更新し、別シートは混ぜずに開く', () => {
    const { responses, answerKey } = samplePair()
    const workspace = importDocument(importDocument(null, responses), answerKey)
    const updated = importDocument(workspace, { ...responses, questions: responses.questions.map((q) => ({ ...q, answer: null })) })
    expect(updated.answerKey).toEqual(workspace.answerKey)
    expect(Object.values(updated.responses)).toEqual([null, null, null, null])
    const separate = importDocument(workspace, { ...responses, sheetId: 'another-sheet' })
    expect(Object.values(separate.answerKey).every((q) => q.answer === null && q.points === 1)).toBe(true)
    expect(() => importDocument(workspace, { ...answerKey, questions: answerKey.questions.slice(1) })).toThrow()
    expect(workspace).toEqual(importDocument(importDocument(null, responses), answerKey))
  })
  it('選択肢削除は該当値だけ消し、並べ替えてもID・解答を維持する', () => {
    const { responses, answerKey } = samplePair()
    const workspace = importDocument(importDocument(null, responses), answerKey)
    const sheet = { ...workspace.sheet, questions: workspace.sheet.questions.map((q, i) => i === 0 ? { ...q, choices: ['イ', 'ウ'] } : q).reverse() }
    expect(structureImpacts(workspace, sheet)).toHaveLength(2)
    const edited = updateSheet(workspace, sheet)
    expect(edited.responses.q1).toBeNull()
    expect(edited.answerKey.q1).toEqual({ answer: null, points: 2 })
    expect(edited.responses.q2).toBe('ウ')
    expect(edited.sheet.questions.map((q) => q.id)).toEqual(['q4', 'q3', 'q2', 'q1'])
  })
  it('削除したIDを再利用せず、表示番号の衝突を避ける', () => {
    const workspace = newWorkspace('新規', 3, ['01', '1'])
    const first = workspace.sheet.questions
    const resized = resizeQuestions(first.slice(0, 2), 3, ['A', 'B'])
    expect(resized[2].id).not.toBe(first[2].id)
    expect(resized[0].id).toBe(first[0].id)
    expect(new Set(resized.map((q) => q.label)).size).toBe(3)
    expect(() => resizeQuestions(first, 0, ['A', 'B'])).toThrow()
  })
  it('テンプレート適用はコピーであり後の変更に追従しない', () => {
    const template = validateTemplate({ id: 'custom', name: ' 自作 ', choices: ['01', '1'] })
    const workspace = createWorkspace({ sheetId: 's', title: 'テスト', questions: [{ id: 'q', label: '1', choices: template.choices }] })
    template.choices[0] = '変更'
    expect(workspace.sheet.questions[0].choices).toEqual(['01', '1'])
  })
  it.each(['answer', 'points', 'clear', 'workspace'] as const)('%s変更で結果を未採点に戻す', (type) => {
    const { responses, answerKey } = samplePair()
    const workspace = importDocument(importDocument(null, responses), answerKey)
    const state = reducer(initialState({ workspace, templates: [] }), { type: 'grade' })
    expect(state.result).not.toBeNull()
    const next = type === 'answer' ? reducer(state, { type, kind: 'responses', id: 'q1', answer: 'イ' }) : type === 'points' ? reducer(state, { type, id: 'q1', points: 3 }) : type === 'clear' ? reducer(state, { type, kind: 'responses' }) : reducer(state, { type, workspace })
    expect(next.result).toBeNull()
    expect(next.revision).toBe(1)
  })
})

describe('ブラウザー保存', () => {
  it('解答・正答・構成・テンプレートを復元し、採点結果は保存しない', () => {
    const { responses, answerKey } = samplePair()
    const data = { workspace: importDocument(importDocument(null, responses), answerKey), templates: [{ id: 'custom', name: '二択', choices: ['○', '×'] }] }
    expect(decodeData(encodeData(data))).toEqual(data)
    expect(encodeData(data)).not.toContain('accuracy')
  })
  it('取得エラー・破損・非対応保存形式では空の状態で継続する', () => {
    const fail = () => { throw new Error('denied') }
    expect(loadData(fail)).toMatchObject({ failed: true, data: emptyData() })
    for (const text of ['{', '{"storageVersion":2}', JSON.stringify({ storageVersion: 1, responses: null, answerKey: {}, templates: [] })]) {
      expect(loadData(() => ({ getItem: () => text, setItem: fail, removeItem: fail })).failed).toBe(true)
    }
  })
  it('保存・削除失敗を呼出元に伝え、他アプリのキーを削除しない', () => {
    const values = new Map<string, string>([['other-app', 'keep']])
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, text: string) => { values.set(key, text) }, removeItem: (key: string) => { values.delete(key) } }
    saveData(storage, { workspace: importDocument(null, samplePair().responses), templates: [] })
    expect(values.has(STORAGE_KEY)).toBe(true)
    saveData(storage, emptyData())
    expect(values.get('other-app')).toBe('keep')
    expect(values.has(STORAGE_KEY)).toBe(false)
    expect(() => saveData({ ...storage, setItem: () => { throw new Error('quota') } }, { workspace: importDocument(null, samplePair().responses), templates: [] })).toThrow('quota')
  })
})

describe('入力形式の全9通り', () => {
  const formats = ['manual', 'csv', 'json'] as const
  for (const left of formats) for (const right of formats) {
    it(`${left} の解答 + ${right} の正答`, () => {
      const convert = (document: SheetDocument, format: typeof formats[number]) => format === 'manual' ? document : format === 'csv' ? parseCsv(serializeCsv(document)) : parseJson(serializeJson(document))
      const pair = samplePair()
      const responses = convert(pair.responses, left)
      const answerKey = convert(pair.answerKey, right)
      assertCompatible(responses, answerKey)
      expect(grade(responses, answerKey).score).toBe(2)
    })
  }
})
