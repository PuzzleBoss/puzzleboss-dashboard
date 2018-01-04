const AWS = require('aws-sdk')
const dashboard = require('@userappstore/dashboard')
const S3 = new AWS.S3()
const hdWidth = process.env.HD_WIDTH || 3072
const hdHeight = process.env.HD_HEIGHT || 2304
const sdWidth = process.env.SD_WIDTH || 1600
const sdHeight = process.env.SD_HEIGHT || 1000
const thumbWidth = process.env.THUMB_WIDTH || 480
const thumbHeight = process.env.THUMB_HEIGHT || 360

module.exports = {
  post: submitForm
}

async function submitForm (req, res) {
  if (!req.body || !req.body.flickrid) {
    throw new Error('invalid-photo')
  }
  const published = await dashboard.Redis.hgetallAsync(`published:${req.body.flickrid}`)
  if (!published) {
    res.statusCode = 500
    return res.end()
  }
  const hdFilename = `${req.body.flickrid}_${hdWidth}x${hdHeight}.jpg`
  const hdParams = {
    Bucket: process.env.BUCKET_NAME,
    Key: `public/puzzles/${hdFilename}`
  }
  await S3.deleteObject(hdParams).promise()
  const sdFilename = `${req.body.flickrid}_${sdWidth}x${sdHeight}.jpg`
  const sdParams = {
    Bucket: process.env.BUCKET_NAME,
    Key: `public/puzzles/${sdFilename}`
  }
  await S3.deleteObject(sdParams).promise()
  const thumbnailFilename = `${req.body.flickrid}_${thumbWidth}x${thumbHeight}.jpg`
  const thumbnailParams = {
    Bucket: process.env.BUCKET_NAME,
    Key: `public/puzzles/${thumbnailFilename}`
  }
  await S3.deleteObject(thumbnailParams).promise()
  await dashboard.Redis.lremAsync('published:list', 0, req.body.flickrid)
  await dashboard.Redis.hdelAsync('published:index', req.body.flickrid)
  await dashboard.Redis.delAsync(`published:${req.body.flickrid}`)
  res.statusCode = 200
  return res.end()
}
