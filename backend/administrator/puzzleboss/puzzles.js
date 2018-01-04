const dashboard = require('@userappstore/dashboard')
const Navigation = require('./navbar-options.js')
const thumbWidth = process.env.THUMB_WIDTH || 480
const thumbHeight = process.env.THUMB_HEIGHT || 360

module.exports = {
  before: beforeRequest,
  get: renderPage
}

async function beforeRequest (req) {
  const published = await dashboard.Redis.lrangeAsync('published:list', 0, -1)
  const photos = []
  if (published && published.length) {
    for (const flickrid of published) {
      const publishInfo = await dashboard.Redis.hgetallAsync(`published:${flickrid}`)
      if (!publishInfo) {
        continue
      }
      publishInfo.url = `https://s3.amazonaws.com/${process.env.BUCKET_NAME}/public/puzzles/${flickrid}_${thumbWidth}x${thumbHeight}.jpg`
      if (publishInfo.published && publishInfo.published > 0) {
        publishInfo.published = dashboard.Timestamp.date(publishInfo.published)
        publishInfo.publishedRelative = dashboard.Format.relativePastDate(publishInfo.published)
      }
      photos.push(publishInfo)
    }
  }
  photos.reverse()
  req.data = {photos}
}

async function renderPage (req, res) {
  const doc = dashboard.HTML.parse(req.route.pageHTML, __dirname)
  await Navigation.render(req, doc)
  if (req.data && req.data.photos && req.data.photos.length) {
    doc.renderList(req.data.photos, 'result-item-template', 'results')
    const remove = []
    for (const photo of req.data.photos) {
      if (photo.published) {
        remove.push(`unpublished-${photo.flickrid}`)
      } else {
        remove.push(`published-${photo.flickrid}`)
      }
    }
    doc.removeElementsById(remove)
  }
  return dashboard.Response.end(req, res, doc)
}
