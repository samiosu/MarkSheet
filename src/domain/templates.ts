import type { ChoiceTemplate } from './types'

export const CUSTOM_CHOICES = '__custom_choices__'

export function selectedChoices(templates: ChoiceTemplate[], templateId: string, customChoices: string[]): string[] {
  return templateId === CUSTOM_CHOICES ? customChoices : (templates.find((template) => template.id === templateId) ?? templates[0]).choices
}

// 開発者向けの標準テンプレート設定。適用時にコピーして使用する。
export const BUILTIN_TEMPLATES: ChoiceTemplate[] = [
  { id: 'builtin-numbers', name: '数字 1〜4', choices: ['1', '2', '3', '4'] },
  { id: 'builtin-katakana', name: 'カタカナ ア〜エ', choices: ['ア', 'イ', 'ウ', 'エ'] },
]
