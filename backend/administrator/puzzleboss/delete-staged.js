const dashboard = require('@userappstore/dashboard')

module.exports = {
  before: beforeRequest,
  get: renderPage
}

async function beforeRequest (req) {
  if (!req.query || !req.query.flickrid) {
    throw new Error('invalid-photo')
  }
}

async function renderPage (req, res) {
  await dashboard.Redis.lremAsync('staging:list', 0, req.query.flickrid)
  await dashboard.Redis.hdelAsync('staging:index', req.query.flickrid)
  res.statusCode = 200
  return res.end()
}
