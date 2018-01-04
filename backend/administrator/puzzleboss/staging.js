const dashboard = require('@userappstore/dashboard')
const Navigation = require('./navbar-options.js')

module.exports = {
  before: beforeRequest,
  get: renderPage,
  post: submitForm
}

async function beforeRequest (req) {
  const staging = await dashboard.Redis.hgetallAsync('staging:index')
  const photos = []
  if (staging) {
    for (const flickrid in staging) {
      const json = staging[flickrid]
      if (!json) {
        await dashboard.Redis.hdelAsync('staging:index', flickrid)
        continue
      }
      const photo = JSON.parse(decodeURI(json))
      photo.url = `https://farm${photo.farm}.staticflickr.com/${photo.server}/${flickrid}_${photo.secret}_c.jpg`
      photo.width = photo.o_width > photo.o_height ? 800 : 600
      photo.height = photo.o_width > photo.o_height ? 600 : 800
      photos.push(photo)
    }
  }
  req.data = {photos}
}

async function renderPage (req, res) {
  const doc = dashboard.HTML.parse(req.route.pageHTML, __dirname)
  await Navigation.render(req, doc)
  if (req.data && req.data.photos && req.data.photos.length) {
    doc.renderList(req.data.photos, 'result-item-template', 'results')
  }
  return dashboard.Response.end(req, res, doc)
}

async function submitForm (req, res) {
  let selected
  for (const item of req.data.photos) {
    if (item.id === req.body.flickrid) {
      selected = item
      break
    }
  }
  if (!selected) {
    return renderPage(req, res)
  }
  const publishInfo = [
    `flickrid`, +req.body.flickrid,
    `created`, dashboard.Timestamp.now
  ]
  await dashboard.Redis.hmsetAsync(`published:${req.body.flickrid}`, publishInfo)
  await dashboard.Redis.hsetAsync('published:index', req.body.flickrid, encodeURI(JSON.stringify(selected)))
  await dashboard.Redis.lpushAsync(`published:list`, req.body.flickrid)
  await dashboard.Redis.hdelAsync('staging:index', req.body.flickrid)
  await dashboard.Redis.lremAsync('staging:list', 0, req.body.flickrid)
  res.statusCode = 302
  res.setHeader('location', `crop?flickrid=${req.body.flickrid}`)
  return res.end()
}
