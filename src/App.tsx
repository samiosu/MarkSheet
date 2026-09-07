import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { ReactNode } from 'react'
import { AnswerEditor, FilePicker } from './components/AnswerEditor'
import { NewSheetForm } from './components/NewSheetForm'
import { ErrorNotice, Icon, Modal } from './components/Primitives'
import { Results } from './components/Results'
import { SheetSettings } from './components/SheetSettings'
import type { SettingsDraft } from './components/SheetSettings'
import { Templates } from './components/Templates'
import { FileImportDialog } from './components/FileImportDialog'
import type { PendingImport } from './components/FileImportDialog'
import { downloadAnswers, readAnswerFile } from './domain/files'
import { toAnswerFile } from './domain/answerImport'
import { initialState, reducer } from './domain/state'
import { loadData, saveData, STORAGE_KEY } from './domain/storage'
import { BUILTIN_TEMPLATES, selectedChoices } from './domain/templates'
import type { DocumentKind, Workspace } from './domain/types'
import { resizeQuestions, structureImpacts, updateSheet } from './domain/workspace'
import { errorMessage } from './domain/validation'

const TABS = [
  { id: 'settings', label: 'シート設定', icon: 'settings' },
  { id: 'responses', label: '解答', icon: 'sheet' },
  { id: 'answerKey', label: '正答', icon: 'key' },
  { id: 'results', label: '結果', icon: 'chart' },
  { id: 'templates', label: 'テンプレート', icon: 'grid' },
] as const
type Tab = typeof TABS[number]['id']
interface Confirmation { title: string; body: ReactNode; label: string; action: () => void; danger?: boolean }

export default function App() {
  const [initial] = useState(() => loadData(() => localStorage))
  const [state, dispatch] = useReducer(reducer, initial.data, initialState)
  const [tab, setTab] = useState<Tab>('responses')
  const [draft, setDraft] = useState<SettingsDraft | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [newSheetOpen, setNewSheetOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [invalidPointIds, setInvalidPointIds] = useState<string[]>([])
  const [saved, setSaved] = useState({ revision: 0, failed: initial.failed, message: initial.message })
  const workspace = state.workspace
  const templates = useMemo(() => [...BUILTIN_TEMPLATES, ...state.templates], [state.templates])
  const dirty = useMemo(() => Boolean(workspace && draft && (draft.count !== String(workspace.sheet.questions.length) || JSON.stringify(draft.sheet) !== JSON.stringify(workspace.sheet))), [workspace, draft])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    // 初回復元で破損データを上書きしない。編集が確定してから保存する。
    if (state.revision === 0) return
    function flush() {
      try {
        saveData(localStorage, { workspace: state.workspace, templates: state.templates })
        setSaved({ revision: state.revision, failed: false, message: state.workspace === null && state.templates.length === 0 ? '保存データを削除しました' : 'このブラウザーに保存済み' })
      } catch {
        setSaved({ revision: state.revision, failed: true, message: '自動保存できません。入力は続けられます。CSV / JSONで保存してください。' })
      }
    }
    const timer = window.setTimeout(flush, 200)
    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => { window.clearTimeout(timer); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHidden) }
  }, [state.revision, state.workspace, state.templates])

  const answerKind: DocumentKind = tab === 'answerKey' ? 'answerKey' : 'responses'
  const onAnswer = useCallback((id: string, answer: string | null) => dispatch({ type: 'answer', id, answer, kind: answerKind }), [answerKind])
  const onPoints = useCallback((id: string, points: number) => dispatch({ type: 'points', id, points }), [])
  const onInvalid = useCallback((id: string, invalid: boolean) => setInvalidPointIds((ids) => invalid ? ids.includes(id) ? ids : [...ids, id] : ids.filter((item) => item !== id)), [])

  function openTab(next: Tab) {
    if (next === 'settings' && workspace) setDraft({ sheet: workspace.sheet, count: String(workspace.sheet.questions.length), templateId: templates[0].id, customChoices: ['', ''] })
    else setDraft(null)
    setInvalidPointIds([])
    setTab(next)
    setError('')
  }
  function navigate(next: Tab) {
    if (next === tab) return
    if (dirty && tab === 'settings') setConfirmation({ title: '未保存の設定を破棄しますか？', body: <p>編集したシート設定を破棄して移動します。保存済みの解答・正答は保持します。</p>, label: '破棄して移動', danger: true, action: () => openTab(next) })
    else openTab(next)
  }
  function activateWorkspace(next: Workspace, nextTab: Tab = 'responses') {
    dispatch({ type: 'workspace', workspace: next })
    setDraft(null); setInvalidPointIds([]); setTab(nextTab); setError('')
  }
  function create(next: Workspace) {
    setNewSheetOpen(false)
    if (workspace) setConfirmation({ title: '新しいシートを開きますか？', body: <p>現在の「{workspace.sheet.title}」の作業を、新しい「{next.sheet.title}」に置き換えます。必要な解答・正答は、キャンセルしてファイルへ出力してください。自作テンプレートは保持します。</p>, label: '新しいシートを開く', action: () => { activateWorkspace(next); setNotice('新しいシートを作成しました。') } })
    else { activateWorkspace(next); setNotice('新しいシートを作成しました。') }
  }
  async function importFile(file: File, expectedKind?: DocumentKind) {
    setBusy(true); setError('')
    try {
      const records = await readAnswerFile(file)
      setPendingImport({ filename: file.name, records, kind: expectedKind })
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  function exportFile(kind: DocumentKind, format: 'csv' | 'json', blank = false) {
    if (!workspace) return
    try { downloadAnswers(toAnswerFile(workspace, kind, blank), format, workspace.sheet.title, kind); setNotice(`${blank ? '空の解答' : kind === 'responses' ? '解答' : '正答'}を${format.toUpperCase()}で出力しました。`) } catch (error) { setError(errorMessage(error)) }
  }
  function saveSettings() {
    if (!workspace || !draft) return
    try {
      const choices = selectedChoices(templates, draft.templateId, draft.customChoices)
      const sheet = { ...draft.sheet, title: draft.sheet.title.trim(), questions: resizeQuestions(draft.sheet.questions, Number(draft.count), choices) }
      const updated = updateSheet(workspace, sheet)
      const impacts = structureImpacts(workspace, sheet)
      const commit = () => {
        dispatch({ type: 'workspace', workspace: updated }); setDraft({ ...draft, sheet, count: String(sheet.questions.length) }); setError(''); setNotice('シート設定を保存しました。')
      }
      if (impacts.length) setConfirmation({ title: '変更の影響を確認', body: <><p>次のデータが変わります。有効な解答と正答は保持します。</p><ul className="impact-list">{impacts.map((impact, i) => <li key={i}>{impact}</li>)}</ul></>, label: '確認して変更を保存', danger: true, action: commit })
      else commit()
    } catch (error) { setError(errorMessage(error)) }
  }
  function runGrading() {
    try {
      reducer(state, { type: 'grade' })
      dispatch({ type: 'grade' }); setTab('results'); setDraft(null); setError(''); setNotice('採点しました。')
    } catch (error) { setError(errorMessage(error)) }
  }
  function requestGrading() {
    if (dirty) setConfirmation({ title: '保存済みの構成で採点しますか？', body: <p>未保存のシート設定を破棄して、現在保存されている解答と正答を採点します。</p>, label: '破棄して採点', action: runGrading })
    else runGrading()
  }
  const answered = workspace?.sheet.questions.filter((q) => workspace.responses[q.id] !== null).length ?? 0
  const keyed = workspace?.sheet.questions.filter((q) => workspace.answerKey[q.id].answer !== null).length ?? 0
  const total = workspace?.sheet.questions.length ?? 0
  const saveText = saved.failed ? '保存に問題があります' : saved.revision !== state.revision ? '保存中…' : saved.message

  return <>
    <a className="skip-link" href="#main">本文へ移動</a>
    <header className="app-header"><div className="header-inner"><a className="brand" href={import.meta.env.BASE_URL} aria-label="MarkSheet ホーム"><span className="brand-symbol"><Icon name="grid" /></span><span>MarkSheet<span className="brand-subtitle">マークシート入力・採点</span></span></a><div className="header-right"><span className="privacy-label"><Icon name="shield" />ブラウザー内で完結</span><button className="text-button help-button" onClick={() => setHelpOpen(true)}>使い方<span aria-hidden="true">↗</span></button></div></div></header>
    <main id="main" className="app-main" aria-busy={busy}>
      {saved.failed && <div className="notice error-notice" role="alert">{saved.message}</div>}
      {error && <ErrorNotice message={error} onDismiss={() => setError('')} />}
      <div className="sr-only" role="status">{notice}</div>
      {busy && <div className="notice" role="status">ファイルを検証しています…</div>}
      {!workspace && tab !== 'templates' ? <>
        <section className="welcome"><div className="welcome-copy"><span className="eyebrow"><span className="blue-dot" />毎日の学習を、もっとスムーズに</span><h1>解いて、残して。<br /><span>理解を確かめる。</span></h1><p>選択肢をマークするだけで、解答の記録から採点まで。<br className="desktop-only" />あなたのペースで、ひとつずつ進めよう。</p><div className="welcome-features"><span><Icon name="check" />登録不要</span><span><Icon name="check" />CSV・JSON対応</span><span><Icon name="check" />自動保存</span></div></div>
          <div className="paper-preview" aria-hidden="true"><div className="preview-header"><span>今日の学習シート</span><span className="preview-dots">•••</span></div>{[1, 2, 3, 4].map((number) => <div className="preview-row" key={number}><span>{String(number).padStart(2, '0')}</span>{['ア', 'イ', 'ウ', 'エ'].map((choice, i) => <span key={choice} className={`preview-mark ${i === [1, 0, 2, -1][number - 1] ? 'filled' : ''}`}>{choice}</span>)}</div>)}<div className="preview-footer"><span className="blue-dot" />一問ずつ、着実に。</div></div>
        </section>
        <div className="welcome-panels"><section className="panel create-panel"><div className="panel-title"><span className="section-icon"><Icon name="plus" /></span><div><h2>新しいシートを作る</h2><p>まずは問題数と選択肢を決めましょう。</p></div></div><NewSheetForm templates={templates} onCreate={create} /></section>
          <div className="welcome-side"><section className="panel import-panel"><div className="section-icon"><Icon name="upload" /></div><h2>ファイルから始める</h2><p>解答や正答を読み込み、<br />選択肢を設定して始められます。</p><FilePicker onFile={importFile} disabled={busy} /><span className="file-format-note">対応形式：CSV / JSON（label・answer）</span></section><section className="template-callout"><Icon name="grid" /><div><h3>自分だけの選択肢も</h3><p>A・B・C、○・×など自由に作成。</p><button className="text-button" onClick={() => navigate('templates')}>テンプレートを管理<Icon name="arrow" /></button></div></section></div></div>
      </> : <>
        <section className="workspace-heading"><div><span className="eyebrow">{workspace ? '学習シート' : 'あなたの選択肢'}</span><h1>{workspace?.sheet.title ?? 'テンプレート'}</h1>{workspace && <div className="workspace-meta"><span>{total}問</span><span>単一選択</span><span className="save-status" role="status"><i className={saved.failed ? 'status-error' : ''} />{saveText}</span></div>}</div><div className="button-row">{workspace ? <><button className="button" onClick={() => setNewSheetOpen(true)}><Icon name="plus" />新規シート</button><button className="button button-primary" disabled={invalidPointIds.length > 0} onClick={requestGrading}><Icon name="chart" />採点する</button></> : <button className="button" onClick={() => navigate('responses')}>シート作成に戻る</button>}</div></section>
        {workspace && <div className="tabs" role="tablist" aria-label="作業モード">{TABS.map((item, index) => <button key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => navigate(item.id)} onKeyDown={(event) => {
          const target = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1
          if (target >= 0) { event.preventDefault(); navigate(TABS[target].id); document.getElementById(`tab-${TABS[target].id}`)?.focus() }
        }}><Icon name={item.icon} />{item.label}{item.id === 'results' && state.result && <span className="tab-dot" />}</button>)}</div>}
        <div className={`workspace-layout ${!workspace ? 'no-sidebar' : ''}`}><div id={`panel-${tab}`} role={workspace ? 'tabpanel' : undefined} aria-labelledby={workspace ? `tab-${tab}` : undefined} className="workspace-content">
          {workspace && (tab === 'responses' || tab === 'answerKey') && <AnswerEditor workspace={workspace} kind={tab} busy={busy} invalidPoints={invalidPointIds.length > 0} onAnswer={onAnswer} onPoints={onPoints} onInvalid={onInvalid} onFile={importFile} onExport={exportFile} onClear={(kind) => {
            const noun = kind === 'responses' ? '解答' : '正答'
            setConfirmation({ title: `全${noun}をクリアしますか？`, body: <p>「{workspace.sheet.title}」の全{total}問の{noun}を消します。{kind === 'responses' ? '正答と配点' : '解答と配点'}は保持します。</p>, label: `全${noun}をクリア`, danger: true, action: () => { dispatch({ type: 'clear', kind }); setNotice(`${noun}をクリアしました。`) } })
          }} />}
          {workspace && tab === 'settings' && draft && <SheetSettings draft={draft} templates={templates} dirty={dirty} onChange={setDraft} onSave={saveSettings} />}
          {workspace && tab === 'results' && <Results result={state.result} />}
          {tab === 'templates' && <Templates templates={state.templates} onSave={(template) => { dispatch({ type: 'template', template }); setNotice('テンプレートを保存しました。') }} onDelete={(template) => setConfirmation({ title: 'テンプレートを削除しますか？', body: <p>「{template.name}」を削除します。作成済みシートは保持します。</p>, label: 'テンプレートを削除', danger: true, action: () => dispatch({ type: 'deleteTemplate', id: template.id }) })} />}
        </div>{workspace && <aside className="workspace-sidebar"><section className="panel progress-card"><div className="sidebar-heading"><span>解答の進み具合</span><span className="mini-mark"><Icon name="sheet" /></span></div><p className="progress-number">{answered}<span> / {total}</span></p><div className="progress-track" role="progressbar" aria-label="回答済み" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={total}><div style={{ width: `${answered / total * 100}%` }} /></div><dl className="progress-details"><div><dt><i className="blue-dot" />回答済み</dt><dd>{answered}問</dd></div><div><dt><i className="gray-dot" />未回答</dt><dd>{total - answered}問</dd></div></dl></section>
          <section className="sidebar-note"><span className="eyebrow">採点の準備</span><h3>正答は {keyed} 問設定済み</h3><p>{keyed === 0 ? '正答を入力するか、正答ファイルを読み込むと採点できます。' : '正答が未設定の問題は、得点と正答率の集計から除外されます。'}</p><button className="text-button" onClick={() => navigate('answerKey')}>正答を確認する<Icon name="arrow" /></button></section>
          <div className="local-note"><Icon name="shield" /><p>解答はこのブラウザー内に保存されます。別の端末へはファイルで持ち出せます。</p></div></aside>}</div>
      </>}
    </main>
    <footer className="app-footer"><span>MarkSheet <span className="footer-divider">/</span> 学びの記録を、手元に。</span>{!workspace && <span role="status">{saveText}</span>}<button className="text-button" onClick={() => setConfirmation({ title: '保存データを削除しますか？', body: <p>このアプリの現在のシート・解答・正答・自作テンプレートを削除します。必要な解答・正答は、キャンセルして出力してください。</p>, label: '保存データを削除', danger: true, action: () => { localStorage.removeItem(STORAGE_KEY); dispatch({ type: 'reset' }); setDraft(null); setInvalidPointIds([]); setTab('responses'); setNotice('保存データを削除しました。') } })}>保存データを削除</button></footer>
    {newSheetOpen && <Modal title="新しいシートを作る" onClose={() => setNewSheetOpen(false)}><NewSheetForm templates={templates} onCreate={create} /></Modal>}
    {pendingImport && <FileImportDialog input={pendingImport} workspace={workspace} templates={templates} onClose={() => setPendingImport(null)} onImport={(next, kind) => {
      activateWorkspace(next, kind); setPendingImport(null); setNotice(`${kind === 'responses' ? '解答' : '正答'}を${next.sheet.questions.length}問読み込みました。`)
    }} />}
    {helpOpen && <Modal title="MarkSheet の使い方" onClose={() => setHelpOpen(false)}><ol className="help-steps"><li><strong>シートを作る</strong><p>問題数と選択肢を指定。問題文はお手元の教材を参照してください。</p></li><li><strong>解答をマークする</strong><p>丸いマークかラベルを選択。Tabで移動し、矢印キーで選択を切り替えられます。</p></li><li><strong>正答を用意して採点する</strong><p>正答タブで正答と配点を設定するか、問題番号が一致する正答ファイルを読み込みます。配点は画面で設定します。</p></li><li><strong>ファイルで保存・再利用</strong><p>CSVはlabel・answerの2列、JSONはその2項目を持つ配列です。読込先の解答／正答を選び、新しく始める場合は選択肢を設定します。</p></li></ol><p className="helper">自動保存は選択肢や配点も含め、このブラウザー限定です。CSV／JSONで持ち出せるのは問題番号と選択値です。</p><div className="sample-links"><span>サンプル：</span>{['responses', 'answerKey'].flatMap((kind) => ['json', 'csv'].map((format) => <a key={`${kind}-${format}`} href={`${import.meta.env.BASE_URL}samples/${kind}.${format}`} download>{kind === 'responses' ? '解答' : '正答'} {format.toUpperCase()}</a>))}</div></Modal>}
    {confirmation && <Modal title={confirmation.title} onClose={() => setConfirmation(null)}><div className="confirmation-body">{confirmation.body}</div><div className="modal-actions"><button className="button" autoFocus onClick={() => setConfirmation(null)}>キャンセル</button><button className={`button ${confirmation.danger ? 'button-danger' : 'button-primary'}`} onClick={() => {
      const action = confirmation.action
      setConfirmation(null)
      try { action() } catch (error) { setError(errorMessage(error)) }
    }}>{confirmation.label}</button></div></Modal>}
  </>
}
