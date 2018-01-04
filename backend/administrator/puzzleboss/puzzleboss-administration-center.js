const dashboard = require('@userappstore/dashboard')
const Navigation = require('./navbar-options.js')

module.exports = {
  get: renderPage
}

async function renderPage (req, res) {
  const doc = dashboard.HTML.parse(req.route.pageHTML, __dirname)
  await Navigation.render(req, doc)
  return dashboard.Response.end(req, res, doc)
}
