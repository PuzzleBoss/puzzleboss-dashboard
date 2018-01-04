const AWS = require('aws-sdk')
const dashboard = require('@userappstore/dashboard')
const Navigation = require('./navbar-photo-options.js')
const S3 = new AWS.S3()
const requiredWidth = process.env.HD_WIDTH || 3072
const requiredHeight = process.env.HD_HEIGHT || 2304

module.exports = {
  before: beforeRequest,
  get: renderPage,
  post: submitForm
}

async function beforeRequest (req) {
  if (!req.query || !req.query.flickrid) {
    throw new Error('invalid-photo')
  }
  const json = await dashboard.Redis.hgetAsync('published:index', req.query.flickrid)
  const photo = JSON.parse(decodeURI(json))
  const tags = []
  if (photo.tags && photo.tags.tag && photo.tags.tag.length) {
    for (const tag of photo.tags.tag) {
      tags.push(tag.raw)
    }
  }
  const info = {
    title: photo.title.substring ? photo.title : photo.title._content,
    description: photo.description.substring ? photo.description : photo.description._content,
    photographer: photo.ownername || photo.owner.realname,
    tags: tags.join(', '),
    id: photo.id,
    owner: photo.owner && photo.owner.nsid ? photo.owner.nsid : photo.owner
  }
  const published = await dashboard.Redis.hgetallAsync(`published:${req.query.flickrid}`)
  req.data = {photo, info, published}
}

async function renderPage (req, res, messageTemplate) {
  const doc = dashboard.HTML.parse(req.route.pageHTML, __dirname)
  await Navigation.render(req, doc)
  doc.getElementById('preview').setAttribute('data-src', `https://s3.amazonaws.com/${process.env.BUCKET_NAME}/public/puzzles/${req.query.flickrid}_${requiredWidth}x${requiredHeight}.jpg`)
  doc.renderTemplate(req.data.info, 'flickrObjectTemplate', 'flickrObjectTable')
  if (req.body) {
    doc.getElementById('title').setAttribute('value', req.body.title)
    doc.getElementById('description').setAttribute('value', req.body.description)
    doc.getElementById('photographer').setAttribute('value', req.body.photographer)
    if (req.body.publish) {
      doc.getElementById('publish').setAttribute('checked', 'checked')
    }
  } else if (req.data && req.data.published) {
    doc.getElementById('title').setAttribute('value', req.data.published.title)
    doc.getElementById('description').setAttribute('value', req.data.published.description)
    doc.getElementById('photographer').setAttribute('value', req.data.published.photographer)
    if (req.data.published.published > 0) {
      doc.getElementById('publish').setAttribute('checked', 'checked')
    }
  }
  doc.removeElementById(req.data && req.data.published ? 'publish-button' : 'update-button')
  return dashboard.Response.end(req, res, doc)
}

async function submitForm (req, res) {
  const fieldsAndValues = [
    'updated', dashboard.Timestamp.now,
    'title', req.body.title,
    'description', req.body.description,
    'photographer', req.body.photographer,
    'owner', req.data.info.owner
  ]
  if (req.body.publish) {
    if (!req.data.published || !req.data.published.published || req.data.published.published === '0') {
      let published
      console.log('original publish', 'string', req.data.photo.originallyPublished)
      if (req.data.photo.originallyPublished) {
        try {
          var originallyPublished = Date.parse(req.data.photo.originallyPublished)
          published = Math.floor(originallyPublished / 1000)
        } catch (e) {
          published = dashboard.Timestamp.now
        }
      } else {
        published = dashboard.Timestamp.now
      }
      fieldsAndValues.push('published', published)
    }
  } else {
    fieldsAndValues.push('published', 0)
  }
  await dashboard.Redis.hmsetAsync(`published:${req.query.flickrid}`, fieldsAndValues)
  const published = await dashboard.Redis.lrangeAsync('published:list', 0, -1)
  const publishable = []
  for (const flickrid of published) {
    const puzzle = await dashboard.Redis.hgetallAsync(`published:${flickrid}`)
    if (!puzzle || !parseInt(puzzle.published, 10)) {
      continue
    }
    publishable.push(puzzle)
  }
  publishable.sort(sortByPublished)
  const puzzles = [`flickrid\tindex\townerid\tpublished\ttitle\tdescription\tphotographer`]
  let index = publishable.length
  for (const puzzle of publishable) {
    puzzles.push(`${puzzle.flickrid}\t${index}\t${puzzle.owner}\t${puzzle.published}\t${puzzle.title}\t${puzzle.description}\t${puzzle.photographer}`)
    index--
  }
  const feedFileParams = {
    Bucket: process.env.BUCKET_NAME,
    Key: `public/puzzles.txt`,
    Body: Buffer.from(puzzles.join('\n'), 'utf-8'),
    ContentType: 'text',
    ContentEncoding: 'text/plain'
  }
  await S3.putObject(feedFileParams).promise()
  return renderPage(req, res, 'submit-success-message')
}

function sortByPublished (a, b) {
  return +a.published > +b.published ? -1 : 1
}
