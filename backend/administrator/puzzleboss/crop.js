const AWS = require('aws-sdk')
const dashboard = require('@userappstore/dashboard')
const easyimg = require('easyimage')
const fs = require('fs')
const http = require('http')
const https = require('https')
const Navigation = require('./navbar-photo-options.js')
const S3 = new AWS.S3()
const stream = require('stream')
const util = require('util')
const hdWidth = process.env.HD_WIDTH || 3072
const hdHeight = process.env.HD_HEIGHT || 2304
const thumbWidth = process.env.THUMB_WIDTH || 480
const thumbHeight = process.env.THUMB_HEIGHT || 360

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
  req.data = {photo, json}
}

async function renderPage (req, res, messageTemplate) {
  const doc = dashboard.HTML.parse(req.route.pageHTML, __dirname)
  await Navigation.render(req, doc)
  doc.getElementById('requiredWidth').setAttribute('value', hdWidth)
  doc.getElementById('requiredHeight').setAttribute('value', hdHeight)
  doc.getElementById('json').setInnerText(req.data.json)
  return dashboard.Response.end(req, res, doc)
}

async function submitForm (req, res) {
  if (!req.body.crop) {
    return renderPage(req, res)
  }
  const crop = JSON.parse(req.body.crop)
  crop.flickrid = req.query.flickrid
  crop.x = Math.floor(+crop.x)
  crop.y = Math.floor(+crop.y)
  crop.width = Math.ceil(+crop.width)
  crop.height = Math.ceil(+crop.height)
  crop.flickrURL = `https://farm${req.data.photo.farm}.staticflickr.com/${req.data.photo.server}/${req.data.photo.id}_${req.data.photo.originalsecret}_o.jpg`
  res.statusCode = 302
  // end the request
  res.setHeader('location', `edit?flickrid=${req.query.flickrid}`)
  res.end()
  return processCrop(crop)
}

async function processCrop (item) {
  const hdFilename = `${item.flickrid}_${hdWidth}x${hdHeight}.jpg`
  if (fs.existsSync(`/tmp/${hdFilename}`)) {
    fs.unlinkSync(`/tmp/${hdFilename}`)
  }
  const thumbnailFilename = `${item.flickrid}_${thumbWidth}x${thumbHeight}.jpg`
  if (fs.existsSync(`/tmp/${thumbnailFilename}`)) {
    fs.unlinkSync(`/tmp/${thumbnailFilename}`)
  }
  const croppedFilename = `crop_${item.flickrid}_${item.width}x${item.height}.jpg`
  if (fs.existsSync(`/tmp/${croppedFilename}`)) {
    fs.unlinkSync(`/tmp/${croppedFilename}`)
  }
  const downloadAsync = util.promisify(downloadPhoto)
  const buffer = await downloadAsync(item.flickrURL)
  const rawFilename = `${item.flickrid}_raw.jpg`
  if (fs.existsSync(`/tmp/${rawFilename}`)) {
    fs.unlinkSync(`/tmp/${rawFilename}`)
  }
  fs.writeFileSync(`/tmp/${rawFilename}`, buffer)
  await easyimg.crop({
    src: `/tmp/${rawFilename}`,
    dst: `/tmp/${croppedFilename}`,
    x: item.x,
    y: item.y,
    cropwidth: item.width,
    cropheight: item.height,
    gravity: 'NorthWest'
  })
  await easyimg.resize({
    src: `/tmp/${croppedFilename}`,
    dst: `/tmp/${hdFilename}`,
    width: hdWidth,
    height: hdHeight
  })
  await easyimg.resize({
    src: `/tmp/${hdFilename}`,
    dst: `/tmp/${thumbnailFilename}`,
    width: thumbWidth,
    height: thumbHeight
  })
  // uploads to s3
  const hdParams = {
    Bucket: process.env.BUCKET_NAME,
    Key: `public/puzzles/${hdFilename}`,
    Body: fs.readFileSync(`/tmp/${hdFilename}`),
    ContentType: 'binary',
    ContentEncoding: 'image/jpeg'
  }
  await S3.putObject(hdParams).promise()
  const thumbnailParams = {
    Bucket: process.env.BUCKET_NAME,
    Key: `public/puzzles/${thumbnailFilename}`,
    Body: fs.readFileSync(`/tmp/${thumbnailFilename}`),
    ContentType: 'binary',
    ContentEncoding: 'image/jpeg'
  }
  await S3.putObject(thumbnailParams).promise()
  const fields = [
    'updated', dashboard.Timestamp.now,
    'cropped', dashboard.Timestamp.now
  ]
  await dashboard.Redis.hmsetAsync(`published:${item.flickrid}`, fields)
  fs.unlinkSync(`/tmp/${thumbnailFilename}`)
  fs.unlinkSync(`/tmp/${hdFilename}`)
  fs.unlinkSync(`/tmp/${rawFilename}`)
  fs.unlinkSync(`/tmp/${croppedFilename}`)
}

function downloadPhoto (url, callback) {
  const method = url.indexOf('https') === 0 ? https : http
  return method.get(url, (response) => {
    const data = new stream.Transform()
    response.on('data', function (chunk) {
      data.push(chunk)
    })
    response.on('end', () => {
      return callback(null, data.read())
    })
    return response.on('error', (error) => {
      return callback(error)
    })
  }).end()
}
