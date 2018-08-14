import { put, takeEvery, call } from 'redux-saga/effects'
import { getType } from 'typesafe-actions'

import { samples } from '../actions'
import { getSampleMetadata, getSnippetFromRawUrl } from '../services/github'
import { convertSnippetToSolution } from '../utils'
import { createSolution } from './solutions'

function* fetchSampleMetadataFlow() {
  const sampleMetadata = yield call(getSampleMetadata)
  yield put(samples.fetchMetadata.success(sampleMetadata))
}

function* openSampleFlow(action) {
  let url = action.payload.rawUrl
  url = url.replace('<ACCOUNT>', 'OfficeDev')
  url = url.replace('<REPO>', 'office-js-snippets')
  url = url.replace('<BRANCH>', 'master')
  const sampleJson = yield call(getSnippetFromRawUrl, url)

  const { solution, files } = convertSnippetToSolution(sampleJson)
  yield put(samples.get.success({ solution, files }))
}

function* handleOpenSampleSuccess(action) {
  yield call(createSolution, action.payload.solution, action.payload.files)
}

// TODO: theres gotta be a better way to do this
export function* sampleWatcher() {
  yield takeEvery(getType(samples.fetchMetadata.request), fetchSampleMetadataFlow)
  yield takeEvery(getType(samples.get.request), openSampleFlow)
  yield takeEvery(getType(samples.get.success), handleOpenSampleSuccess)
}
