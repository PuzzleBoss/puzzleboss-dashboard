const dashboard = require('@userappstore/dashboard')

module.exports = {
  before: beforeRequest,
  get: renderPage
}

async function beforeRequest (req) {
  if (!req.query || !req.query.search) {
    throw new Error('invalid-search')
  }
}

async function renderPage (req, res) {
  await dashboard.Redis.lremAsync('searches:list', 0, req.query.search)
  await dashboard.Redis.hdelAsync('searches:index', req.query.search)
  res.statusCode = 302
  res.setHeader('location', 'search')
  return res.end()
}
