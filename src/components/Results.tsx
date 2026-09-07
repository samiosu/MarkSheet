import type { GradeResult, Verdict } from '../domain/types'
import { Icon } from './Primitives'

const labels: Record<Verdict, string> = { correct: '正解', incorrect: '不正解', unanswered: '未回答', excluded: '採点対象外' }
const symbols: Record<Verdict, string> = { correct: '○', incorrect: '×', unanswered: '△', excluded: '—' }

export function Results({ result }: { result: GradeResult | null }) {
  if (!result) return <section className="panel empty-state"><div className="empty-icon"><Icon name="chart" /></div><h2>理解を、確かめよう。</h2><p>解答と正答を用意して「採点する」を押すと、<br />得点と問題ごとの結果がここに表示されます。</p><span className="tag">未採点</span><p className="helper">入力を変更した後は、もう一度採点してください。</p></section>
  return <div className="stack"><div className="section-heading"><div><h2>採点結果</h2><p>正答が設定された問題を対象に集計しました。</p></div><span className="tag tag-green"><Icon name="check" />採点済み</span></div>
    {result.accuracy === null && <div className="notice">採点対象がありません。正答を1問以上設定してください。</div>}
    <div className="score-grid"><section className="panel score-card"><span className="eyebrow">得点 / 満点</span><p className="score-value" data-testid="score">{result.score}<span> / {result.maximum}<small>点</small></span></p><p className="helper">正解した問題の配点を合計</p></section>
      <section className="panel score-card"><span className="eyebrow">正答率</span><p className="score-value" data-testid="accuracy">{result.accuracy === null ? '—' : result.accuracy.toFixed(1)}{result.accuracy !== null && <small>%</small>}</p><p className="helper">正解数 ÷ 採点対象の問題数</p></section></div>
    <dl className="result-counts">{(Object.keys(labels) as Verdict[]).map((verdict) => <div key={verdict} className={`result-count verdict-${verdict}`}><dt>{symbols[verdict]} {labels[verdict]}</dt><dd>{result.counts[verdict]}<span>問</span></dd></div>)}</dl>
    <section className="panel"><div className="panel-heading"><h3>問題ごとの結果</h3><span className="muted">{result.rows.length}問</span></div><div className="results-table-scroll" role="region" aria-label="問題別の採点結果" tabIndex={0}>
      <table className="results-table"><thead><tr><th scope="col">問題</th><th scope="col">自分の解答</th><th scope="col">正答</th><th scope="col">判定</th><th scope="col">獲得点 / 配点</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.id}><th scope="row">{row.label}</th><td>{row.response ?? <span className="muted">未回答</span>}</td><td>{row.answer ?? <span className="muted">未設定</span>}</td><td><span className={`verdict verdict-${row.verdict}`}>{symbols[row.verdict]} {labels[row.verdict]}</span></td><td className="numeric">{`${row.earned ?? '—'} / ${row.points}`}</td></tr>)}</tbody></table>
    </div></section>
  </div>
}
