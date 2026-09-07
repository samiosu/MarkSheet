import type { AppData, ChoiceTemplate, DocumentKind, GradeResult, Workspace } from './types'
import { grade } from './grading'
import { toDocument, validateTemplate } from './workspace'
import { isPoints, validateDocument } from './validation'

export interface AppState extends AppData {
  result: GradeResult | null
  revision: number
}

export type AppAction =
  | { type: 'workspace'; workspace: Workspace }
  | { type: 'answer'; id: string; kind: DocumentKind; answer: string | null }
  | { type: 'points'; id: string; points: number }
  | { type: 'clear'; kind: DocumentKind }
  | { type: 'grade' }
  | { type: 'template'; template: ChoiceTemplate }
  | { type: 'deleteTemplate'; id: string }
  | { type: 'reset' }

export function initialState(data: AppData): AppState {
  return { ...data, result: null, revision: 0 }
}

export function reducer(state: AppState, action: AppAction): AppState {
  const changed = (workspace: Workspace | null): AppState => ({ ...state, workspace, result: null, revision: state.revision + 1 })
  switch (action.type) {
    case 'workspace': return changed(action.workspace)
    case 'reset': return { workspace: null, templates: [], result: null, revision: state.revision + 1 }
    case 'template': {
      const template = validateTemplate(action.template)
      const exists = state.templates.some((item) => item.id === template.id)
      return { ...state, templates: exists ? state.templates.map((item) => item.id === template.id ? template : item) : [...state.templates, template], revision: state.revision + 1 }
    }
    case 'deleteTemplate': return { ...state, templates: state.templates.filter((item) => item.id !== action.id), revision: state.revision + 1 }
    default: {
      const workspace = state.workspace
      if (!workspace) return state
      switch (action.type) {
        case 'grade': return { ...state, result: grade(toDocument(workspace, 'responses'), toDocument(workspace, 'answerKey')) }
        case 'clear': return changed(action.kind === 'responses' ? {
          ...workspace, responses: Object.fromEntries(workspace.sheet.questions.map((q) => [q.id, null])),
        } : {
          ...workspace, answerKey: Object.fromEntries(workspace.sheet.questions.map((q) => [q.id, { ...workspace.answerKey[q.id], answer: null }])),
        })
        case 'answer': {
          const question = workspace.sheet.questions.find((q) => q.id === action.id)
          if (!question || (action.answer !== null && !question.choices.includes(action.answer))) throw new Error('問題に含まれる選択肢を指定してください。')
          if (action.kind === 'responses') return changed({ ...workspace, responses: { ...workspace.responses, [action.id]: action.answer } })
          return changed({ ...workspace, answerKey: { ...workspace.answerKey, [action.id]: { ...workspace.answerKey[action.id], answer: action.answer } } })
        }
        case 'points': {
          if (!isPoints(action.points) || !Object.hasOwn(workspace.answerKey, action.id)) throw new Error('配点は正の整数で指定してください。')
          const updated = { ...workspace, answerKey: { ...workspace.answerKey, [action.id]: { ...workspace.answerKey[action.id], points: action.points } } }
          validateDocument(toDocument(updated, 'answerKey'))
          return changed(updated)
        }
      }
    }
  }
}
