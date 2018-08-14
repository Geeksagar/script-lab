import { put, takeEvery, call, select } from 'redux-saga/effects'
import { getType } from 'typesafe-actions'
import { gists, solutions } from '../actions'
import {
  getSnippetFromGistId,
  getAllGistMetadata,
  createGist,
  updateGist,
  getSnippetFromRawUrl,
} from '../services/github'
import { selectors } from '../reducers'
import { convertSnippetToSolution } from '../utils'
import { createSolution, openSolution } from './solutions'
import YAML from 'yamljs'
import { ConflictResolutionOptions } from '../interfaces/enums'

function* importGistFlow(action) {
  let snippet
  if (action.payload.gistId) {
    snippet = yield call(getSnippetFromGistId, action.payload.gistId)
  } else if (action.payload.gist) {
    snippet = YAML.parse(action.payload.gist)
  } else {
    throw new Error('Either a gistId or gist must be specified')
  }

  const { solution, files } = convertSnippetToSolution(snippet)
  yield put(gists.importPublic.success({ solution, files }))
}

function* handleImportGistSuccess(action) {
  yield call(createSolution, action.payload.solution, action.payload.files)
}

export function* fetchGistMetadataFlow(action) {
  const state = yield select()
  const token = selectors.github.getToken(state)
  if (token) {
    const meta = yield call(getAllGistMetadata, token)
    yield put(gists.fetchMetadata.success(meta))
  }
}

function* getGistFlow(action) {
  const conflictResolutionType = action.payload.conflictResolution
    ? action.payload.conflictResolution.type
    : ''

  switch (conflictResolutionType) {
    case ConflictResolutionOptions.Open:
      yield call(openSolution, action.payload.conflictResolution.existingSolution)
      break

    case ConflictResolutionOptions.Overwrite:
      // delete the existing solution and files
      yield put(solutions.remove(action.payload.conflictResolution.existingSolution))

    case ConflictResolutionOptions.CreateCopy:
    default:
      const snippet = yield call(getSnippetFromRawUrl, action.payload.rawUrl)
      const { solution, files } = convertSnippetToSolution(snippet)
      solution.source = {
        id: action.payload.gistId,
        origin: 'gist',
      }

      yield put(gists.get.success({ solution, files }))
  }
}

function* handleGetGistSuccess(action) {
  yield call(createSolution, action.payload.solution, action.payload.files)
}

function createAndUpdateHelper(state, solutionId) {
  const token = selectors.github.getToken(state)
  const solution = selectors.solutions.get(state, solutionId)
  const files = solution.files.map(fileId => selectors.files.get(state, fileId))

  return { token, solution, files }
}

function* createGistFlow(action) {
  const state = yield select()
  const { token, solution, files } = createAndUpdateHelper(
    state,
    action.payload.solutionId,
  )

  const response = yield call(createGist, token, solution, files, action.payload.isPublic)

  yield put(gists.create.success({ gist: response, solution }))
}

function* handleCreateGistSuccess(action) {
  const { solution } = action.payload
  solution.source = { id: action.payload.gist.id, origin: 'gist' }
  yield put(solutions.edit(solution.id, solution))
}

function* updateGistFlow(action) {
  const state = yield select()
  const { token, solution, files } = createAndUpdateHelper(
    state,
    action.payload.solutionId,
  )

  const gistId = solution.source.id

  const response = yield call(updateGist, token, solution, files, gistId)

  yield put(gists.update.success({ gist: response }))
}

export function* gistWatcher() {
  yield takeEvery(getType(gists.importPublic.request), importGistFlow)
  yield takeEvery(getType(gists.importPublic.success), handleImportGistSuccess)

  yield takeEvery(getType(gists.fetchMetadata.request), fetchGistMetadataFlow)

  yield takeEvery(getType(gists.get.request), getGistFlow)
  yield takeEvery(getType(gists.get.success), handleGetGistSuccess)

  yield takeEvery(getType(gists.create.request), createGistFlow)
  yield takeEvery(getType(gists.create.success), handleCreateGistSuccess)

  yield takeEvery(getType(gists.update.request), updateGistFlow)
}
