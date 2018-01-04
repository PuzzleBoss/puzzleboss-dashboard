const dashboard = require('@userappstore/dashboard')
let cache

module.exports = {
  get: renderFile
}

function renderFile (req, res) {
  cache = cache || dashboard.Config.getJSON()
  if (!cache) {
    return res.end()
  }
  res.setHeader('content-type', 'text/plain')
  return res.end(JSON.stringify(cache, null, '\t'))
}
