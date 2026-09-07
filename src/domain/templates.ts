import type { ChoiceTemplate } from './types'

// 開発者向けの標準テンプレート設定。適用時にコピーして使用する。
export const BUILTIN_TEMPLATES: ChoiceTemplate[] = [
  { id: 'builtin-numbers', name: '数字 1〜4', choices: ['1', '2', '3', '4'] },
  { id: 'builtin-katakana', name: 'カタカナ ア〜エ', choices: ['ア', 'イ', 'ウ', 'エ'] },
]
