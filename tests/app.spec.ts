import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { samplePair } from '../src/domain/fixtures'
import { parseFileText, serializeCsv, serializeJson } from '../src/domain/files'
import type { AnswerFile, DocumentKind, SheetDocument } from '../src/domain/types'
import { encodeData, STORAGE_KEY } from '../src/domain/storage'
import { importDocument } from '../src/domain/workspace'

const pageErrors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
})
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]) })

const recordsOf = (document: SheetDocument): AnswerFile => document.questions.map(({ label, answer }) => ({ label, answer }))

async function upload(page: Page, document: SheetDocument | AnswerFile, format: 'csv' | 'json' = 'json', expectedKind?: DocumentKind) {
  const name = expectedKind === 'responses' ? '解答' : expectedKind === 'answerKey' ? '正答' : ''
  const records = Array.isArray(document) ? document : recordsOf(document)
  const title = Array.isArray(document) ? '練習問題' : document.title
  await page.getByLabel(`${name}ファイルを選択`, { exact: true }).setInputFiles({ name: `${title}.${format}`, mimeType: format === 'csv' ? 'text/csv' : 'application/json', buffer: Buffer.from(format === 'csv' ? serializeCsv(records) : serializeJson(records)) })
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  if (await dialog.getByRole('combobox', { name: '読込先', exact: true }).count()) await dialog.getByRole('combobox', { name: '読込先', exact: true }).selectOption(expectedKind ?? (Array.isArray(document) ? 'responses' : document.kind))
  if (!Array.isArray(document) && await dialog.getByRole('combobox', { name: '選択肢テンプレート', exact: true }).count()) {
    await dialog.getByRole('combobox', { name: '選択肢テンプレート', exact: true }).selectOption(document.questions[0].choices[0] === 'ア' ? 'builtin-katakana' : 'builtin-numbers')
  }
  await page.getByRole('button', { name: '読み込みを確定', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

async function seed(page: Page) {
  const { responses } = samplePair()
  responses.questions.forEach((q) => { q.answer = null })
  await upload(page, responses)
  await page.getByRole('tab', { name: '正答', exact: true }).click()
  for (const q of samplePair().answerKey.questions) await page.getByLabel(`問題 ${q.label} の配点`).fill(String(q.points))
  await page.getByRole('tab', { name: '解答', exact: true }).click()
}

const row = (page: Page, label: string, kind: DocumentKind = 'responses') => page.getByRole('group', { name: `問題 ${label} の${kind === 'responses' ? '解答' : '正答'}`, exact: true })

async function markManually(page: Page, kind: DocumentKind) {
  const document = samplePair()[kind]
  await page.getByRole('tab', { name: kind === 'responses' ? '解答' : '正答', exact: true }).click()
  for (const question of document.questions) {
    if (question.answer !== null) await row(page, question.label, kind).getByRole('radio', { name: question.answer, exact: true }).check()
    if ('points' in question) await page.getByLabel(`問題 ${question.label} の配点`).fill(String(question.points))
  }
}

async function exported(page: Page, buttonName: string) {
  const wait = page.waitForEvent('download')
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  const download = await wait
  const file = await download.path()
  const text = await readFile(file!, 'utf8')
  return { document: parseFileText(text, download.suggestedFilename()), text }
}

test('新規作成・マーク・解除・JSON往復・再読み込み', async ({ page }, testInfo) => {
  await page.getByLabel('シート名', { exact: true }).fill('英語の復習')
  await page.getByLabel('問題数', { exact: true }).fill('4')
  await page.getByRole('button', { name: 'シートを作成', exact: true }).click()
  await row(page, '1').getByRole('radio', { name: '2', exact: true }).check()
  await row(page, '2').getByRole('radio', { name: '3', exact: true }).check()
  await row(page, '2').getByRole('button', { name: '問題 2 の解答を消す' }).click()
  const file = await exported(page, '解答をJSONで出力')
  expect(file.document.map((q) => q.answer)).toEqual(['2', null, null, null])
  expect(JSON.parse(file.text).every((q: object) => Object.keys(q).sort().join(',') === 'answer,label')).toBe(true)
  await expect(page.getByRole('status').filter({ hasText: 'このブラウザーに保存済み' })).toBeVisible()
  await page.reload()
  await expect(row(page, '1').getByRole('radio', { name: '2', exact: true })).toBeChecked()
  await upload(page, file.document, 'json', 'responses')
  await expect(page.getByRole('heading', { name: '英語の復習', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('answer-sheet.png'), fullPage: true })
})

for (const responsesFormat of ['manual', 'csv', 'json'] as const) {
  for (const keyFormat of ['manual', 'csv', 'json'] as const) {
    test(`採点: ${responsesFormat} 解答 + ${keyFormat} 正答`, async ({ page }) => {
      await seed(page)
      if (responsesFormat === 'manual') await markManually(page, 'responses')
      else await upload(page, samplePair().responses, responsesFormat, 'responses')
      await page.getByRole('tab', { name: '正答', exact: true }).click()
      if (keyFormat === 'manual') await markManually(page, 'answerKey')
      else {
        const document = samplePair().answerKey
        document.questions.reverse()
        await upload(page, document, keyFormat, 'answerKey')
      }
      await page.getByRole('button', { name: '採点する', exact: true }).click()
      await expect(page.getByTestId('score')).toHaveText(/2\s*\/\s*6\s*点/)
      await expect(page.getByTestId('accuracy')).toHaveText('33.3%')
      await expect(page.getByRole('cell', { name: '○ 正解', exact: true })).toHaveCount(1)
      await expect(page.getByRole('cell', { name: '× 不正解', exact: true })).toHaveCount(1)
      await expect(page.getByRole('cell', { name: '△ 未回答', exact: true })).toHaveCount(1)
      await expect(page.getByRole('cell', { name: '— 採点対象外', exact: true })).toHaveCount(1)
      await expect(page.getByRole('cell', { name: '— / 1', exact: true })).toHaveCount(1)
    })
  }
}

test('正答先行・空の解答配布・CSV往復', async ({ page }) => {
  await upload(page, samplePair().answerKey, 'csv')
  await expect(page.getByText('正答を編集中', { exact: true })).toBeVisible()
  const file = await exported(page, '空の解答をCSVで出力')
  expect(file.text.charCodeAt(0)).toBe(0xfeff)
  expect(file.text.split('\r\n')[0]).toBe('\uFEFFlabel,answer')
  expect(file.document.every((q) => q.answer === null && Object.keys(q).sort().join(',') === 'answer,label')).toBe(true)
  await page.getByRole('tab', { name: '解答', exact: true }).click()
  await upload(page, file.document, 'csv', 'responses')
  await row(page, '1').getByRole('radio', { name: 'ア', exact: true }).check()
  await page.getByRole('button', { name: '採点する', exact: true }).click()
  await expect(page.getByTestId('score')).toHaveText(/1\s*\/\s*3\s*点/)
})

test('ファイル不一致と破損では現在の作業を保持する', async ({ page }) => {
  await upload(page, samplePair().responses)
  await page.getByRole('tab', { name: '正答', exact: true }).click()
  const mismatch = recordsOf(samplePair().answerKey)
  mismatch[0].answer = 'オ'
  await page.getByLabel('正答ファイルを選択').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(serializeJson(mismatch)) })
  await expect(page.getByRole('alert')).toContainText('設定された選択肢にありません')
  await expect(page.getByRole('button', { name: '読み込みを確定' })).toBeDisabled()
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await page.getByLabel('正答ファイルを選択').setInputFiles({ name: 'broken.csv', mimeType: 'text/csv', buffer: Buffer.from('broken') })
  await expect(page.getByRole('alert')).toContainText('CSVヘッダー')
  await page.getByRole('tab', { name: '解答', exact: true }).click()
  await expect(row(page, '1').getByRole('radio', { name: 'ア', exact: true })).toBeChecked()
})

test('別シートの読込キャンセルと全解答クリアのキャンセル', async ({ page }) => {
  await upload(page, samplePair().responses)
  const other = recordsOf(samplePair().responses)
  await page.getByLabel('解答ファイルを選択').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(serializeJson(other)) })
  await page.getByRole('combobox', { name: '読み込むシート', exact: true }).selectOption('new')
  await expect(page.getByRole('dialog')).toContainText('新しいシートに置き換えます')
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await page.getByRole('button', { name: '全解答をクリア', exact: true }).click()
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(row(page, '1').getByRole('radio', { name: 'ア', exact: true })).toBeChecked()
  await expect(page.getByRole('heading', { name: '練習問題', exact: true })).toBeVisible()
})

test('構成変更は影響を確認してから反映し番号と入力を維持する', async ({ page }) => {
  await upload(page, samplePair().responses)
  await page.getByRole('tab', { name: '正答', exact: true }).click()
  await upload(page, samplePair().answerKey, 'json', 'answerKey')
  await page.getByRole('tab', { name: 'シート設定', exact: true }).click()
  await page.getByRole('button', { name: '問題 1 を編集', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '選択肢 1 を削除', exact: true }).click()
  await page.getByRole('button', { name: '編集内容を反映', exact: true }).click()
  await page.getByRole('button', { name: '変更を保存', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('解答「ア」を未回答')
  await expect(page.getByRole('dialog')).toContainText('正答「ア」を未設定')
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await page.getByRole('button', { name: '変更を保存', exact: true }).click()
  await page.getByRole('button', { name: '確認して変更を保存', exact: true }).click()
  await page.getByRole('button', { name: '問題 1 を下へ', exact: true }).click()
  await page.getByRole('button', { name: '変更を保存', exact: true }).click()
  await page.getByRole('tab', { name: '解答', exact: true }).click()
  const file = await exported(page, '解答をJSONで出力')
  expect(file.document.map((q) => q.label)).toEqual(['2', '1', '3', '4'])
  expect(file.document[1].answer).toBeNull()
  expect(file.document[0].answer).toBe('ウ')
})

test('自作テンプレートの作成・複製・削除とシートへのコピー', async ({ page }) => {
  await page.getByRole('button', { name: 'テンプレートを管理' }).click()
  await page.getByRole('button', { name: '新しく作る', exact: true }).click()
  await page.getByLabel('テンプレート名', { exact: true }).fill('独自の二択')
  await page.getByLabel('選択肢 1', { exact: true }).fill('01')
  await page.getByLabel('選択肢 2', { exact: true }).fill('正しい,と思う')
  await page.getByRole('button', { name: 'テンプレートを保存', exact: true }).click()
  await page.getByRole('button', { name: '独自の二択 を複製', exact: true }).click()
  await page.getByRole('button', { name: 'テンプレートを保存', exact: true }).click()
  await page.getByRole('button', { name: '独自の二択 のコピー を削除', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'テンプレートを削除', exact: true }).click()
  await page.getByRole('button', { name: 'シート作成に戻る', exact: true }).click()
  await page.getByLabel('問題数', { exact: true }).fill('1')
  await page.getByRole('combobox', { name: '選択肢テンプレート', exact: true }).selectOption({ label: '独自の二択' })
  await page.getByRole('button', { name: 'シートを作成', exact: true }).click()
  await row(page, '1').getByRole('radio', { name: '01', exact: true }).check()
  await page.getByRole('tab', { name: 'テンプレート', exact: true }).click()
  await page.getByRole('button', { name: '独自の二択 を編集', exact: true }).click()
  await page.getByLabel('選択肢 1', { exact: true }).fill('変更後')
  await page.getByRole('button', { name: 'テンプレートを保存', exact: true }).click()
  await page.getByRole('tab', { name: '解答', exact: true }).click()
  await expect(row(page, '1').getByRole('radio', { name: '01', exact: true })).toBeChecked()
  const file = await exported(page, '解答をCSVで出力')
  expect(file.document[0]).toEqual({ label: '1', answer: '01' })
  await expect(row(page, '1').getByRole('radio', { name: '正しい,と思う', exact: true })).toBeVisible()
})

test('キーボードで選択・解除し、入力変更で結果を無効化する', async ({ page }) => {
  await seed(page)
  await row(page, '1').getByRole('radio', { name: 'ア', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(row(page, '1').getByRole('radio', { name: 'イ', exact: true })).toBeChecked()
  await row(page, '1').getByRole('button', { name: '問題 1 の解答を消す' }).focus()
  await page.keyboard.press('Enter')
  await expect(row(page, '1').getByRole('radio', { name: 'イ', exact: true })).not.toBeChecked()
  await page.getByRole('button', { name: '採点する', exact: true }).click()
  await expect(page.getByText('採点対象がありません。正答を1問以上設定してください。')).toBeVisible()
  await expect(page.getByTestId('accuracy')).toHaveText('—')
  await page.getByRole('tab', { name: '解答', exact: true }).click()
  await row(page, '1').getByRole('radio', { name: 'ア', exact: true }).check()
  await page.getByRole('tab', { name: '結果', exact: true }).click()
  await expect(page.getByText('未採点', { exact: true })).toBeVisible()
})

test('保存失敗でも入力とファイル出力ができる', async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') } })
  await seed(page)
  await row(page, '1').getByRole('radio', { name: 'ア', exact: true }).check()
  await expect(page.getByRole('alert')).toContainText('自動保存できません')
  expect((await exported(page, '解答をJSONで出力')).document[0].answer).toBe('ア')
})

test('保存破損を通知して保持し、削除はアプリ専用データだけを対象にする', async ({ page }) => {
  await page.evaluate((key) => { localStorage.setItem(key, '{broken'); localStorage.setItem('other-app', 'keep') }, STORAGE_KEY)
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('保存データを復元できません')
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('{broken')
  await seed(page)
  await page.getByRole('button', { name: '保存データを削除', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '保存データを削除', exact: true }).click()
  await expect(page.getByRole('heading', { name: '新しいシートを作る' })).toBeVisible()
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('other-app'))).toBe('keep')
})

test('200問×10選択肢・長い文字列・reduced motion・外部送信なし', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const external: string[] = []
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()) })
  const doc = samplePair().responses
  doc.questions = Array.from({ length: 200 }, (_, i) => ({ id: `q${i + 1}`, label: String(i + 1), choices: ['01', '1', 'ア', 'イ', 'ウ', 'エ', '○', '×', '長い選択肢でも折り返して全文を読むことができます', '<img src=x onerror=alert(1)>'], answer: null }))
  const stored = encodeData({ workspace: importDocument(null, doc), templates: [] })
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: stored })
  await page.reload()
  await upload(page, recordsOf(doc), 'json', 'responses')
  await expect(page.getByRole('radio')).toHaveCount(2000)
  await row(page, '1').getByRole('radio', { name: '01', exact: true }).check()
  await row(page, '100').getByRole('radio', { name: '1', exact: true }).check()
  await row(page, '200').getByRole('radio', { name: '○', exact: true }).check()
  await expect(row(page, '200').getByRole('radio', { name: '○', exact: true })).toBeChecked()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(await page.locator('.mark-choice').first().evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s')
  await page.getByRole('heading', { name: '練習問題', exact: true }).scrollIntoViewIfNeeded()
  const exportedFile = await exported(page, '解答をCSVで出力')
  expect(exportedFile.document[199].answer).toBe('○')
  expect(external).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('large-sheet-viewport.png') })
})

test('主要画面のアクセシビリティと横幅', async ({ page }, testInfo) => {
  const check = async () => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(result.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await check()
  await page.screenshot({ path: testInfo.outputPath('welcome.png'), fullPage: true })
  await seed(page)
  await check()
  for (const label of ['正答', 'シート設定', 'テンプレート'] as const) {
    await page.getByRole('tab', { name: label, exact: true }).click()
    await check()
  }
  await page.getByRole('button', { name: '採点する', exact: true }).click()
  await check()
})

test('正答の出力再読込は配点を保持し、無効な配点を拒否する', async ({ page }) => {
  await seed(page)
  await markManually(page, 'answerKey')
  const json = await exported(page, '正答をJSONで出力')
  const csv = await exported(page, '正答をCSVで出力')
  expect(json.document).toEqual(recordsOf(samplePair().answerKey))
  expect(JSON.parse(json.text).every((q: object) => Object.keys(q).sort().join(',') === 'answer,label')).toBe(true)
  expect(csv.text.split('\r\n')[0]).toBe('\uFEFFlabel,answer')
  expect(csv.document).toEqual(json.document)
  const points = page.getByLabel('問題 1 の配点')
  await points.fill('0')
  await expect(points).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('button', { name: '採点する', exact: true })).toBeDisabled()
  await points.press('Tab')
  await expect(points).toHaveValue('2')
  await page.getByRole('button', { name: '全正答をクリア', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '全正答をクリア', exact: true }).click()
  await upload(page, csv.document, 'csv', 'answerKey')
  await expect(row(page, '1', 'answerKey').getByRole('radio', { name: 'ア', exact: true })).toBeChecked()
  await expect(points).toHaveValue('2')
})

test('カタカナで作成し、未保存の設定をキャンセルして保持する', async ({ page }) => {
  await page.getByLabel('問題数', { exact: true }).fill('2')
  await page.getByRole('combobox', { name: '選択肢テンプレート', exact: true }).selectOption({ label: 'カタカナ ア〜エ' })
  await page.getByRole('button', { name: 'シートを作成', exact: true }).click()
  await row(page, '1').getByRole('radio', { name: 'エ', exact: true }).check()
  await page.getByRole('tab', { name: 'シート設定', exact: true }).click()
  await page.getByLabel('シート名', { exact: true }).fill('新しい名前')
  await page.getByRole('tab', { name: '解答', exact: true }).click()
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(page.getByLabel('シート名', { exact: true })).toHaveValue('新しい名前')
  await page.getByRole('button', { name: '変更を保存', exact: true }).click()
  await page.getByRole('tab', { name: '解答', exact: true }).click()
  await expect(row(page, '1').getByRole('radio', { name: 'エ', exact: true })).toBeChecked()
  await expect(page.getByRole('heading', { name: '新しい名前', exact: true })).toBeVisible()
})

test('保存領域の削除が拒否されたときは現在の作業を保持する', async ({ page }) => {
  await upload(page, samplePair().responses)
  await page.evaluate(() => { Storage.prototype.removeItem = () => { throw new Error('削除は拒否されました') } })
  await page.getByRole('button', { name: '保存データを削除', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '保存データを削除', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('削除は拒否されました')
  await expect(row(page, '1').getByRole('radio', { name: 'ア', exact: true })).toBeChecked()
  expect((await exported(page, '解答をJSONで出力')).document[0].answer).toBe('ア')
})
